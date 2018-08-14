"use strict";
const _ = require('lodash');
const logger = require('winston');
const debug = require('debug')('HM:NotificationsConsumer');
const EventEmitter = require('events');
const RestClient = require('crypto-exchanges-rest-client').RestClient;
const WsClient = require('crypto-exchanges-ws-client');
const KlinesManager = require('./klines-manager');
const PromiseHelper = require('./promise-helper');

/*
     This class subscribes to a session on the gateway
     It creates a pool of manager responsible for computation of price/volume evolution (one per pair)
     At regular interval, price/volume evolution will be re-computed and result will be emitted
 */

// first interval is used to compute evolution for minutes & hours periods (we accept 1m, 3m & 5m intervals)
const SUPPORTED_MINUTES_HOURS_KLINES_INTERVALS = {
    '5m':true,
    '3m':true,
    '1m':true
};

// second interval is used to compute evolution for days periods (we accept 15m,30m & 1h intervals)
// value is maximum number of days we can cover with this interval
const SUPPORTED_DAYS_KLINES_INTERVALS = [
    {interval:'15m', maxDays:7},
    {interval:'30m', maxDays:15},
    {interval:'1h', maxDays:30},
    // 2h is just used as a fallback in case 1h is not supported
    {interval:'2h', maxDays:30}
]

// how many ms should we wait before trying to retrieve services after failure
const SERVICES_RETRIEVAL_WAIT_DELAY_AFTER_FAILURE = 5000;

// how often in ms should we retrieve subscriptions to remove data we're not interested in anymore
const SUBSCRIPTIONS_RETRIEVAL_PERIOD = 30 * 60000;

/**
 * Subscribe to crypto-exchanges-gateway, computes delta & emit events
 */

class NotificationsConsumer extends EventEmitter
{

constructor()
{
    super();
    // list of managers
    this._managers = {};
    // evolution data
    this._data = {};
    // used to ensure we do a single computation at once
    this._timer = {
        id:null,
        timestamp:Date.now()
    }
    // indicates whether or not we're ready to compute
    this._isReady = false;
}

/**
 * Initializes rest & ws clients
 * @param {object} config object
 */
initialize(config)
{
    this._config = config;
    this._computeInterval = config.computeInterval * 1000;

    // compute the maximum of days we need to cover
    this._maxDays = 5;
    let maxPeriod = config.dataPeriods[config.dataPeriods.length - 1];
    if ('d' == maxPeriod.substr(-1))
    {
        this._maxDays = parseInt(maxPeriod.substr(0, maxPeriod.length - 1));
    }

    // create rest client
    this._restOpt = {baseUri:config.gateway.restEndpoint};
    if ('' != config.gateway.apiKey)
    {
        this._restOpt.apiKey = config.gateway.apiKey;
    }
    this._restClient = new RestClient(this._restOpt);

    // create ws client
    this._wsUri = `${config.gateway.wsEndpoint}/?sid=${this._config.gateway.sessionId}&expires=false`;
    let wsOpt = {autoConnect:false, retryDelay:2500};
    if ('' != config.gateway.apiKey)
    {
        wsOpt.apiKey = config.gateway.apiKey;
    }
    this._wsClient = new WsClient(this._wsUri, wsOpt);
}

/**
 * Used to ensure gateway is reachable
 * @return {Promise}
 */
async check()
{
    let result = await this._restClient.ping();
    if (!result)
    {
        logger.error(`Gateway is not reachable on '${this._config.gateway.restEndpoint}'`);
        return false;
    }
    // check if session exist
    let data;
    try
    {
        data = await this._restClient.getSession(this._config.gateway.sessionId);
        if (undefined === data[this._config.gateway.sessionId])
        {
            logger.warn(`Session '${this._config.gateway.sessionId}' does not exist on gateway`);
        }
    }
    catch (e)
    {
        logger.error(`Could not retrieve session '${this._config.gateway.sessionId}'`);
        logger.error(e.message);
        return false;
    }
    return true;
}

/**
 * Returns last computed data
 *
 * @return {object}
 */
getData()
{
    return this._data;
}

/**
 * Start service (retrieve subscriptions & connect ws)
 *
 * @return {Promise}
 */
async start()
{
    //-- add ws listeners
    /*
         Whenever we receive a new kline :

         - ignore events for unknown exchanges or exchanges with unsupported klines interval
         - create manager if needed
         - ignore events with a distinct interval than the one we're supposed to used for a given manager

         The downside is that for low volume pairs, it might take a few minutes for manager to be ready
         But why would you need real-time heatmap in such case ? ;)
     */
    this._wsClient.on('kline', (e) => {
        if (!this._isReady)
        {
            return;
        }
        // unknown exchange
        if (undefined === this._supportedKlinesIntervals[e.exchange])
        {
            return;
        }
        // unsupported interval
        if (!SUPPORTED_MINUTES_HOURS_KLINES_INTERVALS[e.interval])
        {
            return;
        }
        if (undefined === this._managers[e.exchange] || undefined === this._managers[e.exchange][e.pair])
        {
            this._createManager(e.exchange, e.pair, e.interval);
        }
        // manager has already been initialized with a distinct interval
        if (e.interval != this._managers[e.exchange][e.pair].minutesHours)
        {
            return;
        }
        this._managers[e.exchange][e.pair].manager.addKline(e.data);
    });

    /*
         On connection :
         - clear previous computation timer
         - retrieve supported klines intervals for each exchange
         - destroy all managers (they will be re-created based on kline events)
         - compute data
     */
    this._wsClient.on('connected', () => {
        logger.info(`Connected to '${this._wsUri}'`);
        this._isReady = false;
        if (debug.enabled)
        {
            debug('We just connected to gateway');
        }
        if (null !== this._timer.id)
        {
            clearTimeout(this._timer.id);
            this._timer.id = null;
        }
        let timestamp = Date.now();
        this._timer.timestamp = timestamp;
        this._getSupportedKlinesIntervals(timestamp).then((intervals) => {
            // we have been reconnected in between
            if (this._timer.timestamp > timestamp)
            {
                return;
            }
            // ws client is disconnected, ignore until next reconnection
            if (!this._wsClient.isConnected())
            {
                return;
            }
            this._supportedKlinesIntervals = intervals;
            this._isReady = true;
            this._resetManagers();
            this._computeData(this._timer.timestamp);
        });
    });
    this._wsClient.connect();
    this._monitorSubscriptions();
}

/**
 * Retrieves the list of services to identify the best kline intervals for each exchange
 * First interval (for 1/3/5m, 15m, 1h & 4h evolution will be choosen best on what we get from gateway on the ws)
 *
 * @param {integer} timestamp used to ensure we only a single retrieval at once
 * @return {Promise} promise which will resolve to a dictionnary {exchange:{daysInterval:string}}
 */
async _getSupportedKlinesIntervals(timestamp)
{
    let intervals = {};
    while (true)
    {
        if (debug.enabled)
        {
            debug('Will retrieve services');
        }
        // we have been reconnected in between
        if (this._timer.timestamp > timestamp)
        {
            break;
        }
        // ws client is disconnected, ignore until next reconnection
        if (!this._wsClient.isConnected())
        {
            break;
        }
        let data;
        try
        {
            data = await this._restClient.getServices();
            if (debug.enabled)
            {
                debug('Successfully retrieved services');
            }
        }
        catch (e)
        {
            logger.error(`Could not retrieve services, will retry in ${SERVICES_RETRIEVAL_WAIT_DELAY_AFTER_FAILURE}ms`);
            logger.error(e.message);
            await PromiseHelper.wait(SERVICES_RETRIEVAL_WAIT_DELAY_AFTER_FAILURE);
            continue;
        }

        _.forEach(data.exchanges, (obj, exchange) => {
            // ignore exchanges without klines support
            if (!obj.features.wsKlines.enabled)
            {
                return;
            }
            let ignore = true;
            // ignore exchanges which don't have support for the klines interval we're interested in
            _.forEach(SUPPORTED_MINUTES_HOURS_KLINES_INTERVALS, (prio, interval) => {
                if (-1 != obj.features.wsKlines.intervals.indexOf(interval))
                {
                    ignore = false;
                    return false;
                }
            });
            // we didn't find any supported value for minutes/hours period
            if (ignore)
            {
                return;
            }
            let daysInterval = null;
            _.forEach(SUPPORTED_DAYS_KLINES_INTERVALS, (e) => {
                if (-1 != obj.features.wsKlines.intervals.indexOf(e.interval))
                {
                    if (null === daysInterval)
                    {
                        daysInterval = e.interval;
                        // interval can cover max days (we can stop here)
                        if (e.maxDays >= this._maxDays)
                        {
                            return false;
                        }
                        return;
                    }
                    // we're looking for the minimum interval which can cover max days (so we stop after first matching interval)
                    if (e.maxDays >= this._maxDays)
                    {
                        daysInterval = e.interval;
                        return false;
                    }
                }
            });
            // we didn't find any supported value for daysInterval
            if (null === daysInterval)
            {
                return;
            }
            intervals[exchange] = {daysInterval:daysInterval};
        });
        break;
    }
    return intervals;
}

async _getSubscriptions()
{
    let subscriptions;
    let path = `sessions/${this._config.gateway.sessionId}/subscriptions`;
    try
    {
        subscriptions = await this._restClient.customRequest(path);
    }
    catch (e)
    {
        logger.error(`Could not retrieve subscriptions`);
        logger.error(e.message);
        return null;
    }
    if (undefined === subscriptions[this._config.gateway.sessionId])
    {
        return {};
    }
    return subscriptions[this._config.gateway.sessionId];
}

async _monitorSubscriptions()
{
    while (true)
    {
        await PromiseHelper.wait(SUBSCRIPTIONS_RETRIEVAL_PERIOD);
        if (debug.enabled)
        {
            debug('Will retrieve subscriptions');
        }
        let subscriptions = await this._getSubscriptions();
        if (null !== subscriptions)
        {
            if (debug.enabled)
            {
                debug('Successfully retrieved subscriptions');
            }
            let toRemove = [];
            _.forEach(this._managers, (list, exchange) => {
                _.forEach(list, (obj, pair) => {
                    let remove = false;
                    // no subscription for this exchange
                    if (undefined === subscriptions[exchange])
                    {
                        remove = true;
                        if (debug.enabled)
                        {
                            debug(`Manager '${exchange}|${pair}|${obj.minutesHours}' will be destroyed since there is no subscription for this exchange anymore`);
                        }
                    }
                    // no klines subscription for this exchange
                    else if (undefined === subscriptions[exchange].klines)
                    {
                        remove = true;
                        if (debug.enabled)
                        {
                            debug(`Manager '${exchange}|${pair}|${obj.minutesHours}' will be destroyed since there is no klines subscription for this exchange anymore`);
                        }
                    }
                    // no klines subscription for this pair
                    else if (undefined === subscriptions[exchange].klines.pairs[pair])
                    {
                        remove = true;
                        if (debug.enabled)
                        {
                            debug(`Manager '${exchange}|${pair}|${obj.minutesHours}' will be destroyed since there is no klines subscription for this pair anymore`);
                        }
                    }
                    // no klines subscription for current interval
                    else if (undefined === subscriptions[exchange].klines.pairs[pair][obj.minutesHours])
                    {
                        remove = true;
                        if (debug.enabled)
                        {
                            debug(`Manager '${exchange}|${pair}|${obj.minutesHours}' will be destroyed since there is no klines subscription for this interval anymore`);
                        }
                    }
                    if (remove)
                    {
                        toRemove.push({exchange:exchange,pair:pair,manager:obj.manager,interval:obj.minutesHours});
                        logger.info(`Manager '${exchange}|${pair}|${obj.minutesHours}' will be destroyed`);
                    }
                });
            });
            if (0 !== toRemove.length)
            {
                _.forEach(toRemove, (e) => {
                    e.manager.destroy();
                    delete this._managers[e.exchange][e.pair];
                    // remove data
                    if (undefined !== this._data[e.exchange] && undefined !== this._data[e.exchange][e.pair])
                    {
                        delete this._data[e.exchange][e.pair];
                    }
                });
                _.forEach(Object.keys(this._managers), (exchange) => {
                    if (_.isEmpty(this._managers[exchange]))
                    {
                        delete this._managers[exchange];
                    }
                });
                _.forEach(Object.keys(this._data), (exchange) => {
                    if (_.isEmpty(this._data[exchange]))
                    {
                        delete this._data[exchange];
                    }
                });
            }
        }
    }
}

/**
 * Creates a new manager
 *
 * @param {string} exchange exchange id
 * @param {string} pair exchange pair
 * @param {string} interval interval used for 1/3/5m, 15m, 1h & 4h
 */
_createManager(exchange, pair, interval)
{
    if (undefined === this._managers[exchange])
    {
        this._managers[exchange] = {};
    }
    this._managers[exchange][pair] = {
        manager:new KlinesManager(exchange, pair, interval, this._supportedKlinesIntervals[exchange].daysInterval, this._config.dataPeriods, this._restOpt),
        minutesHours:interval
    }
    if (debug.enabled)
    {
        debug(`Manager '${exchange}|${pair}|${interval}|${this._supportedKlinesIntervals[exchange].daysInterval}' has been created`);
    }
}

/**
 * Resets all manager (called after ws reconnection)
 * Managers will be automatically re-created when klines arrive
 */
_resetManagers()
{
    _.forEach(this._managers, (list, exchange) => {
        _.forEach(list, (obj, pair) => {
            obj.manager.destroy();
        });
    });
    this._managers = {};
    if (debug.enabled)
    {
        debug(`All managers have been reset`);
    }
}

/**
 * Compute data for each pair
 *
 * @param {integer} timestamp used to ensure we only have a single computation running
 */
async _computeData(timestamp)
{
    if (this._timer.timestamp > timestamp)
    {
        if (debug.enabled)
        {
            debug(`Aborting data computation since we have a more recent computation ongoing`);
        }
        return;
    }
    if (!this._wsClient.isConnected())
    {
        if (debug.enabled)
        {
            debug(`Aborting data computation since ws is not connected`);
        }
        return;
    }
    let arr = [];
    _.forEach(this._managers, (list, exchange) => {
        _.forEach(list, (obj, pair) => {
            arr.push({
                function:() => {
                    return obj.manager.compute(timestamp);
                },
                context:{exchange:exchange, pair:pair}
            });
        });
    });
    if (debug.enabled)
    {
        debug(`Will compute data for ${arr.length} pair(s)`);
    }
    await PromiseHelper.all(arr);
    if (this._timer.timestamp > timestamp)
    {
        if (debug.enabled)
        {
            debug(`Aborting data computation since we have a more recent computation ongoing`);
        }
        return;
    }
    if (!this._wsClient.isConnected())
    {
        if (debug.enabled)
        {
            debug(`Aborting data computation since ws is not connected`);
        }
        return;
    }
    if (debug.enabled)
    {
        debug(`Done computing data for ${arr.length} pair(s)`);
    }
    if (null !== this._timer.id)
    {
        clearTimeout(this._timer.id);
    }
    _.forEach(this._managers, (list, exchange) => {
        _.forEach(list, (obj, pair) => {
            if (!obj.manager.hasData())
            {
                return;
            }
            if (undefined === this._data[exchange])
            {
                this._data[exchange] = {};
            }
            let data = obj.manager.getData();
            this._data[exchange][pair] = data;
        });
    });
    this.emit('data', this._data);
    let now = Date.now();
    this._timer.timestamp = now;
    this._timer.id = setTimeout(() => {
        this._computeData(now);
    }, this._computeInterval)
}

}

let consumer = new NotificationsConsumer();

module.exports = consumer;
