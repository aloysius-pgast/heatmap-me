"use strict";
const _ = require('lodash');
const logger = require('winston');
const Big = require('big.js');
const debug = require('debug')('HM:KlinesManager');
const RestClient = require('crypto-exchanges-rest-client').RestClient;
const PromiseHelper = require('./promise-helper');
const staticDataProvider = require('./static-data-provider');

/*
     This class computes price/volume evolution for a single pair
     It uses multiple klines intervals :
     - first interval is used for 1/3/5m, 15m, 1h & 4h evolution periods
     - second interval is used for 1d & 5d evolution periods
 */

// map klines interval to a duration in seconds
const klinesIntervalsMapping = {
    '1m':60, '3m':180, '5m':300, '15m':900, '30m':1800,
    '1h':3600, '2h':7200, '4h':14400, '6h':21600, '8h':28800, '12h':43200,
    '1d':86400, '3d':259200,
    '1w':604800,
    '1M':2592000
}

// map period to a duration in second
const dataPeriodsMapping = {};
// minutes periods
_.forEach([1,3,5,15,30,45], (e) => {
    dataPeriodsMapping[`${e}m`] = e * 60;
});
// hours periods
for (let i = 1; i < 24; ++i)
{
    dataPeriodsMapping[`${i}h`] = i * 3600;
}
// days periods
// hours periods
for (let i = 1; i < 31; ++i)
{
    dataPeriodsMapping[`${i}d`] = i * 24 * 3600;
}

// how many times should we try to retrieve klines
const KLINES_RETRIEVAL_TRY_COUNT = 2;
// how many ms should we wait before trying to retrieve klines after failure
const KLINES_RETRIEVAL_WAIT_DELAY_AFTER_FAILURE = 5000;

/**
 * Sorts data periods (smallet period first)
 * Ignore unsupported periods & remove duplicates
 *
 * @param {string} minutesHoursInterval interval used for minutes/hours compuration
 * @param {string[]} dataPeriods array of periods to sort
 */
const sortDataPeriods = (minutesHoursInterval, dataPeriods) => {
    let periods = [];
    _.forEach(dataPeriods, (p) => {
        if ('xm' == p)
        {
            let value = parseInt(minutesHoursInterval.substr(0, minutesHoursInterval.length -1));
            periods.push({period:minutesHoursInterval, id:'xm', value:value, unit:'m', duration:klinesIntervalsMapping[minutesHoursInterval]});
            return;
        }
        // ignore unsupported periods
        if (undefined === dataPeriodsMapping[p])
        {
            logger.warn(`Data period '${p}' is not supported`);
            return;
        }
        let unit = p.substr(-1);
        let value = p.substr(0, p.length -1);
        periods.push({period:p, id:p, value:parseInt(value), unit:unit, duration:dataPeriodsMapping[p]});
    });
    return _.uniq(periods, (a,b) => {
        return a.duration == b.duration
    }).sort((a,b) => {
        return a.duration < b.duration ? -1 : 1;
    });
}

/**
 * Computes price & volume evolution for a single pair
 */

class KlinesManager
{

/**
 * @param {string} exchange
 * @param {string} pair
 * @param {string} minutesHoursInterval interval used for minutes/hours periods
 * @param {string} daysInterval interval used for days periods
 * @param {string[]} dataPeriods list of periods to compute data for
 * @param {object} restOpt rest client options
 */
constructor(exchange, pair, minutesHoursInterval, daysInterval, dataPeriods, restOpt)
{
    let periods = sortDataPeriods(minutesHoursInterval, dataPeriods);
    if (0 == periods.length)
    {
         throw new Error("Argument 'dataPeriods' cannot be empty");
    }
    // subscription information
    this._exchange = exchange;
    this._pair = pair;

    // list of all klines used for minutes/hours computation
    this._minutesHoursKlines = {
        // last kline used during last computation
        lastKline:null,
        // last closed kline used during last computation
        lastClosedKline:null,
        data:[],
        queue:[],
        // we only need 24h of klines
        max:Math.ceil(24 * 3600 / klinesIntervalsMapping[minutesHoursInterval]) + 1,
        interval:minutesHoursInterval,
        dataPeriods:[]
    }
    // add minutes & hours periods
    _.forEach(periods, (p) => {
        if ('d' == p.unit)
        {
            return;
        }
        this._minutesHoursKlines.dataPeriods.push(p);
    });

    // list of all klines used for days computation
    // we don't need queue here since klines will only be retrieved through REST
    this._daysKlines = {
        // last kline used during last computation
        lastKline:null,
        data:[],
        // the next kline we will need to compute manually
        nextKline:{
            openTimestamp:null,
            closedTimestamp:null
        },
        max:0,
        interval:daysInterval,
        dataPeriods:[]
    }
    let maxPeriod = periods[periods.length - 1];
    if ('d' == maxPeriod.unit)
    {
        this._daysKlines.max = Math.ceil(2 * maxPeriod.value * 24 * 3600 / klinesIntervalsMapping[daysInterval]) + 1;
        _.forEach(periods, (p) => {
            if ('d' != p.unit)
            {
                return;
            }
            this._daysKlines.dataPeriods.push(p);
        });
    }

    // whether or not manager is ready to compute data
    this._isReady = false;
    // whether or not manager has computed data
    this._hasData = false;
    // whether or not manager has been destroyed
    this._isDestroyed = false;

    // can be used to enable static klines usage for testing purpose
    this._useStaticKlines = false;
    this._staticDataSetId = null;

    // evolution data
    this._data = null;

    // rest client
    this._restClient = new RestClient(restOpt);
}

/**
 * Used to enable static klines retrieval for testing purpose
 *
 * @param {boolean} flag true to enable static klines, false to disable
 * @param {string} dataSetId id of the dataset (default = 01)
 */
useStaticKlines(flag, dataSetId)
{
    this._useStaticKlines = flag;
    if (flag)
    {
        this._staticDataSetId = '01';
        if (undefined !== dataSetId && '' != dataSetId)
        {
            this._staticDataSetId = dataSetId;
        }
    }
}

/**
 * Destroy manager. Computation methods will check periodically if manager has been destroyed
 */
destroy()
{
    this._isDestroyed = true;
    this._isReady = false;
    this._hasData = false;
}

/**
 * Indicates whether or not manager os destroyed
 * @return {boolean}
 */
isDestroyed()
{
    return this._isDestroyed;
}

/**
 * Indicates whether or not manager is ready to compute data
 *
 * @return {boolean}
 */
isReady()
{
    return this._isReady;
}

/**
 * Indicates whether or not manager has computed data
 */
hasData()
{
    return this._hasData;
}

/**
 * Returns evolution data
 * @return {object}
 */
/*
Example output

{
    "current":{
        "period":"5m",
        "duration":300,
        "last":{
            "price":33.199,
            "high":33.199,
            "low":33.15,
            "volume":761.036,
            "fromTimestamp":1532361600,
            "toTimestamp":1532361900
        },
        "previous":{
            "price":33.179,
            "high":33.241,
            "low":33.13,
            "volume":1508.384,
            "fromTimestamp":1532361300,
            "toTimestamp":1532361600
        },
        "delta":{
            "price":0.02,
            "pricePercent":0.0603,
            "volume":-747.348,
            "volumePercent":-49.5463
        }
    },
    "xm":{
        "period":"5m",
        "duration":300,
        "last":{
            "price":33.179,
            "high":33.241,
            "low":33.13,
            "volume":1508.384,
            "toTimestamp":1532361600,
            "fromTimestamp":1532361300
        },
        "previous":{
            "price":33.221,
            "high":33.275,
            "low":33.171,
            "volume":1121.781,
            "toTimestamp":1532361300,
            "fromTimestamp":1532361000
        },
        "delta":{
            "price":-0.042,
            "pricePercent":-0.1264,
            "volume":386.603,
            "volumePercent":34.4633
        }
    },
    "15m":{
        "period":"15m",
        "duration":900,
        "last":{
            "price":33.179,
            "high":33.28,
            "low":33.13,
            "volume":4116.089,
            "toTimestamp":1532361600,
            "fromTimestamp":1532360700
        },
        "previous":{
            "price":33.279,
            "high":33.408,
            "low":33.239,
            "volume":3730.163,
            "toTimestamp":1532360700,
            "fromTimestamp":1532359800
        },
        "delta":{
            "price":-0.1,
            "pricePercent":-0.3005,
            "volume":385.926,
            "volumePercent":10.3461
        }
    },
    "1h":{
        "period":"1h",
        "duration":3600,
        "last":{
            "price":33.179,
            "high":33.408,
            "low":33.13,
            "volume":13774.693,
            "toTimestamp":1532361600,
            "fromTimestamp":1532358000
        },
        "previous":{
            "price":33.299,
            "high":33.5,
            "low":33.239,
            "volume":13293.712,
            "toTimestamp":1532358000,
            "fromTimestamp":1532354400
        },
        "delta":{
            "price":-0.12,
            "pricePercent":-0.3604,
            "volume":480.981,
            "volumePercent":3.6181
        }
    },
    "4h":{
        "period":"4h",
        "duration":14400,
        "last":{
            "price":33.179,
            "high":33.566,
            "low":33.13,
            "volume":55060.495,
            "toTimestamp":1532361600,
            "fromTimestamp":1532347200
        },
        "previous":{
            "price":33.429,
            "high":33.929,
            "low":32.9,
            "volume":78819.782,
            "toTimestamp":1532347200,
            "fromTimestamp":1532332800
        },
        "delta":{
            "price":-0.25,
            "pricePercent":-0.7479,
            "volume":-23759.287,
            "volumePercent":-30.1438
        }
    },
    "1d":{
        "period":"1d",
        "duration":86400,
        "last":{
            "price":33.179,
            "high":34.744,
            "low":32.552,
            "volume":411732.068,
            "toTimestamp":1532361600,
            "fromTimestamp":1532275200
        },
        "previous":{
            "price":34.397,
            "high":35.25,
            "low":33.528,
            "volume":369643.583,
            "toTimestamp":1532275200,
            "fromTimestamp":1532188800
        },
        "delta":{
            "price":-1.218,
            "pricePercent":-3.541,
            "volume":42088.485,
            "volumePercent":11.3862
        }
    },
    "5d":{
        "period":"5d",
        "duration":432000,
        "last":{
            "price":33.179,
            "high":40.6,
            "low":31.97,
            "volume":2587758.134,
            "toTimestamp":1532361600,
            "fromTimestamp":1531929600
        },
        "previous":{
            "price":39.214,
            "high":40.65,
            "low":31.484,
            "volume":3243300.876,
            "toTimestamp":1531929600,
            "fromTimestamp":1531497600
        },
        "delta":{
            "price":-6.035,
            "pricePercent":-15.3899,
            "volume":-655542.742,
            "volumePercent":-20.2122
        }
    }
}

*/
getData()
{
    if (!this._hasData)
    {
        return null;
    }
    return this._data;
}

/**
 * Resets manager to ensure up-to-date klines data will be retrieved on next compute
 */
_reset()
{
    this._data = null;
    this._isReady = false;
    this._hasData = false;
    this._minutesHoursKlines.lastKline = null;
    this._minutesHoursKlines.lastClosedKline = null;
    this._minutesHoursKlines.data = [];
    this._minutesHoursKlines.queue = [];
    this._daysKlines.data = [];
    this._daysKlines.lastKline = null;
    this._daysKlines.nextKline = {openTimestamp:null, closedTimestamp:null};
}

/**
 * Adds a new kline data. Called by NotificationsConsumer upon receiving a new kline event
 * New data will be placed in a queue and will be process on next computation
 *
 * @param {object} data kline data
 */
addKline(data)
{
    if (!this._isReady)
    {
        return;
    }
    if (0 == this._minutesHoursKlines.queue.length)
    {
        this._minutesHoursKlines.queue.push(data);
    }
    else
    {
        // same timestamp, just update the last entry in queue
        if (this._minutesHoursKlines.queue[this._minutesHoursKlines.queue.length - 1].timestamp == data.timestamp)
        {
            this._minutesHoursKlines.queue[this._minutesHoursKlines.queue.length - 1] = data;
        }
        else
        {
            this._minutesHoursKlines.queue.push(data);
        }
    }
}

/**
 * Compute price & volume evolution :
 *
 * - process queue
 * - retrieve klines if necessary
 * - check klines & fill gaps
 * - compute price evolution
 *
 * @return {Promise} which will resolve to a boolean
 */
async compute()
{
    if (this._isDestroyed)
    {
        return false;
    }

    this._processQueue();

    //-- retrieve klines
    if (0 == this._minutesHoursKlines.data.length || 0 == this._daysKlines.data.length)
    {
        let arr = [];
        this._isReady = false;
        logger.info(`Klines data for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' is outdated, new klines data will be retrieved`);
        if (0 == this._minutesHoursKlines.data.length)
        {
            arr.push({
                function:() => {
                    return this._retrieveKlines(this._minutesHoursKlines.interval, this._minutesHoursKlines.max, KLINES_RETRIEVAL_TRY_COUNT);
                },
                context:{klines:this._minutesHoursKlines}
            });
        }
        if (0 != this._daysKlines.max)
        {
            if (0 == this._daysKlines.data.length)
            {
                arr.push({
                    function:() => {
                        return this._retrieveKlines(this._daysKlines.interval, this._daysKlines.max, KLINES_RETRIEVAL_TRY_COUNT);
                    },
                    context:{klines:this._daysKlines}
                });
            }
        }
        let data = await PromiseHelper.all(arr);
        if (this._isDestroyed)
        {
            return false;
        }
        // whether or not we managed to retrieve all klines
        let success = true;
        _.forEach(data, (e) => {
            if (null === e.value)
            {
                success = false;
                return false;
            }
            e.context.klines.data = e.value;
        });
        // we didn't manage to retrieve klines
        if (!success)
        {
            this._reset();
            return false;
        }
        // fill the gaps
        else
        {
            this._checkKlines(this._minutesHoursKlines);
            if (0 != this._daysKlines.max)
            {
                this._checkKlines(this._daysKlines);
            }
            if (debug.enabled)
            {
                debug(`Manager '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' is ready`);
            }
            this._isReady = true;
        }
    }

    // use data in minutes/hours klines to compute new kline for days klines
    this._updateDaysKlinesFromMinutesHoursKlines();

    // remove old klines
    this._removeOldKlines();

    //-- compute
    if (!this._computeData())
    {
        this._hasData = false;
        return false;
    }
    this._hasData = true;
    return true;
}

/**
 * Process the queue. If timestamp gaps are detected, invalidate klines
 */
_processQueue()
{
    if (debug.enabled)
    {
        debug(`Will process ${this._minutesHoursKlines.queue.length} item(s) from queue for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}'`);
    }
    // nothing to do if queue is empty
    if (0 == this._minutesHoursKlines.queue.length)
    {
        debug(`Queue is empty for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}'`);
        return;
    }
    // if we don't have any klines, ignore queue
    if (0 == this._minutesHoursKlines.data.length)
    {
        debug(`Queue for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' will be ignored since we don't have klines yet`);
        return;
    }

    // ensure we don't have gap between last klines and first queue entry
    let delta = this._minutesHoursKlines.queue[0].timestamp - this._minutesHoursKlines.data[this._minutesHoursKlines.data.length - 1].timestamp;
    if (delta > klinesIntervalsMapping[this._minutesHoursKlines.interval])
    {
        logger.warn(`Found gaps in '${this._minutesHoursKlines.interval}' klines queue for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' : new kline's timestamp = ${this._minutesHoursKlines.queue[0].timestamp}, previous kline's timestamp = ${this._minutesHoursKlines.data[this._minutesHoursKlines.data.length - 1].timestamp} (manager will be reset)`);
        this._reset();
        return;
    }
    // ensure we don't have gap between queue's elements
    let lastIndex = this._minutesHoursKlines.queue.length - 1;
    for (let i = 0; i < this._minutesHoursKlines.queue.length; ++i)
    {
        if (i == lastIndex)
        {
            break;
        }
        delta = this._minutesHoursKlines.queue[i+1].timestamp - this._minutesHoursKlines.queue[i].timestamp;
        if (delta > klinesIntervalsMapping[this._minutesHoursKlines.interval])
        {
            logger.warn(`Found gaps in '${this._minutesHoursKlines.interval}' klines queue for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' : new kline's timestamp = ${this._minutesHoursKlines.queue[i+1].timestamp}, previous kline's timestamp = ${this._minutesHoursKlines.queue[i].timestamp} (manager will be reset)`);
            this._reset();
            return;
        }
    }
    // first item in queue might be an update of last item in minutes/hours klines
    if (this._minutesHoursKlines.queue[0].timestamp == this._minutesHoursKlines.data[this._minutesHoursKlines.data.length - 1].timestamp)
    {
        this._minutesHoursKlines.data[this._minutesHoursKlines.data.length - 1] = this._minutesHoursKlines.queue.shift();
    }
    let previous = this._minutesHoursKlines.data[this._minutesHoursKlines.data.length - 1];
    _.forEach(this._minutesHoursKlines.queue, (e) => {
        // fix open & close using previous kline's values
        if (null === e.open)
        {
            e.open = previous.close;
        }
        if (null === e.close)
        {
            e.close = e.open;
        }
        previous = e;
        this._minutesHoursKlines.data.push(e);
    });
    this._minutesHoursKlines.queue = [];
    if (debug.enabled)
    {
        debug(`Queue successfully processed for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}'`);
    }
}

/**
 * Retrieves klines data using REST
 *
 * @param {string} interval klines interval
 * @param {integer} max maximum number of klines to retrieve
 * @param {integer} tryCount how many times we should try to retrieve klines (optional, default = 1)
 * @return {array} array of klines on success or null on error
 */
async _retrieveKlines(interval, max, tryCount)
{
    let lastIndex = tryCount - 1;
    if (debug.enabled)
    {
        debug(`Will retrieve '${interval}' klines for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}'`);
    }
    if (undefined === tryCount)
    {
        tryCount = 1;
    }
    let data;
    for (let i = 0; i < tryCount; ++i)
    {
        if (this._isDestroyed)
        {
            if (debug.enabled)
            {
                debug(`Aborting '${interval}' klines retrieval for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' since we have been destroyed`);
            }
            return null;
        }
        if (0 !== i)
        {
            await PromiseHelper.wait(KLINES_RETRIEVAL_WAIT_DELAY_AFTER_FAILURE);
        }
        try
        {
            if (this._useStaticKlines)
            {
                data = await staticDataProvider.getKlines(this._exchange, this._pair, this._staticDataSetId, interval, max);
            }
            else
            {
                data = await this._restClient.getKlines(this._exchange, this._pair, {interval:interval, limit:max});
            }
            break;
        }
        catch (e)
        {
            let message = `Could not retrieve '${interval}' klines for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}'`;
            if (i < lastIndex)
            {
                logger.warn(`Could not retrieve '${interval}' klines for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' (will retry in ${KLINES_RETRIEVAL_WAIT_DELAY_AFTER_FAILURE}ms)`);
                logger.warn(e.message);
                continue;
            }
            else
            {
                logger.error(`Could not retrieve '${interval}' klines for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' (no more retry left)`);
                logger.error(e.message);
                return null;
            }
        }
    }
    if (this._isDestroyed)
    {
        if (debug.enabled)
        {
            debug(`Aborting '${interval}' klines retrieval for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' since we have been destroyed`);
        }
        return null;
    }
    if (interval == this._daysKlines.interval)
    {
        if (0 !== data.length)
        {
            // remove last entry from days klines if it's not closed (it will be recomputed from minutes/hours klines later)
            if (!data[data.length - 1].closed)
            {
                if (debug.enabled)
                {
                    debug(`Removing last '${this._daysKlines.interval}' kline for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' since it's not closed`);
                }
                data.pop();
            }
            if (0 !== data.length)
            {
                // compute the timestamp of the next kline we will build manually
                this._daysKlines.nextKline.openTimestamp = data[data.length - 1].timestamp +  klinesIntervalsMapping[this._daysKlines.interval];
                this._daysKlines.nextKline.closedTimestamp = this._daysKlines.nextKline.openTimestamp +  klinesIntervalsMapping[this._daysKlines.interval];
            }
        }
    }
    // we didn't retrieve any kline
    if (0 == data.length)
    {
        logger.warn(`We didn't retrieve any '${interval}' kline for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}'`);
        return null;
    }
    if (debug.enabled)
    {
        debug(`Successfully retrieved '${interval}' klines for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}'`);
    }
    return data;
}

/**
 * Check klines and add missing entries (can occur after exchange outage)
 * @param {object} klines object to check data for
 */
_checkKlines(klines)
{
    if (0 == klines.data.length)
    {
        return;
    }
    let delay = klinesIntervalsMapping[klines.interval];
    let previous = null;
    let data = [];
    _.forEach(klines.data, (e) => {
        if (null !== previous)
        {
            let delta = e.timestamp - previous.timestamp;
            if (delta > delay)
            {
                let count = delta / delay;
                let rounded = Math.floor(count);
                // delta should be a multiple of delay so we should get the same values below
                if (rounded != count)
                {
                    logger.warn(`Found strange gap (not multiple of ${delay}) in '${klines.interval}' klines for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' : new kline's timestamp = ${e.timestamp}, previous kline's timestamp = ${previous.timestamp}`);
                }
                let timestamp = previous.timestamp;
                for (let i = 0; i < rounded - 1; ++i)
                {
                    timestamp += delay;
                    data.push({
                        timestamp:timestamp,
                        open:previous.close,
                        high:null,
                        low:null,
                        close:previous.close,
                        volume:0,
                        remainingTime:0,
                        closed:true
                    });
                }
            }
            else
            {
                // fix open & close using previous kline's values
                if (null === e.open)
                {
                    e.open = previous.close;
                }
                if (null === e.close)
                {
                    e.close = e.open;
                }
            }
        }
        previous = e;
        data.push(e);
    });
    klines.data = data;
}

/**
 * Use data in minutes/hours klines to compute new kline for days klines
 */
_updateDaysKlinesFromMinutesHoursKlines()
{
    if (0 == this._daysKlines.max)
    {
        return;
    }
    // we don't have enough data to compute a new kline yet
    if (this._minutesHoursKlines.data[this._minutesHoursKlines.data.length - 1].timestamp < this._daysKlines.nextKline.closedTimestamp)
    {
        if (debug.enabled)
        {
            debug(`We don't have enough data to update 'days' klines yet (${this._minutesHoursKlines.data[this._minutesHoursKlines.data.length - 1].timestamp} < ${this._daysKlines.nextKline.closedTimestamp})`);
        }
        return;
    }
    if (debug.enabled)
    {
        debug(`Will update 'days' klines from 'minutes/hours' klines`);
    }
    let kline = {
        timestamp:this._daysKlines.nextKline.openTimestamp,
        open:this._daysKlines.data[this._daysKlines.data.length - 1].close,
        close:null,
        high:null,
        low:null,
        volume:new Big(0),
        closed:true
    }
    _.forEachRight(this._minutesHoursKlines.data, (e) => {
        // entry is too new
        if (e.timestamp >= this._daysKlines.nextKline.closedTimestamp)
        {
            return;
        }
        // entry is too old
        if (e.timestamp < kline.timestamp)
        {
            return false;
        }
        if (null === kline.close)
        {
            kline.close = e.close;
        }
        // always update open value since it might be different from the close value of previous kline
        kline.open = e.open;
        if (null === kline.high || (null !== e.high && e.high > kline.high))
        {
            kline.high = e.high;
        }
        if (null === kline.low || (null !== e.low && e.low < kline.low))
        {
            kline.low = e.low;
        }
        kline.volume = kline.volume.plus(e.volume);
    });
    kline.volume = parseFloat(kline.volume.toFixed());
    // update timestamp for next kline
    this._daysKlines.nextKline.openTimestamp = this._daysKlines.nextKline.closedTimestamp;
    this._daysKlines.nextKline.closedTimestamp = this._daysKlines.nextKline.openTimestamp + klinesIntervalsMapping[this._daysKlines.interval];
    if (debug.enabled)
    {
        debug(`Done updating 'days' klines from 'minutes/hours' klines : nextKline will be ${JSON.stringify(this._daysKlines.nextKline)}`);
    }
    this._daysKlines.data.push(kline);
}

/**
 * Remove old klines entries to ensure we don't keep too much data
 */
_removeOldKlines()
{
    while (this._minutesHoursKlines.data.length > this._minutesHoursKlines.max)
    {
        this._minutesHoursKlines.data.shift();
    }
    while (this._daysKlines.data.length > this._daysKlines.max)
    {
        this._daysKlines.data.shift();
    }
}

/**
 * Initializes a data period
 * @param {object} lastKline kline object of last period
 * @param {string} klinesInterval interval used to compute the period
 * @param {object} period {period:string, value:integer, unit:string, duration:integer}
 * @return {object}
 */
_initializeDataPeriod(lastKline, klinesInterval, period)
{
    let data = {
        period:period.period,
        duration:period.duration,
        last:{
            price:null,
            high:null,
            low:null,
            volume:new Big(0)
        },
        previous:{
            price:null,
            high:null,
            low:null,
            volume:new Big(0)
        },
        delta:{
            price:null,
            pricePercent:null,
            volume:null,
            volumePercent:null
        }
    }
    data.last.toTimestamp = lastKline.timestamp + klinesIntervalsMapping[klinesInterval];
    data.last.fromTimestamp = data.last.toTimestamp - period.duration;
    data.previous.toTimestamp = data.last.fromTimestamp;
    data.previous.fromTimestamp = data.previous.toTimestamp - period.duration;
    return data;
}

/**
 * This is where we're doing the actual computation
 */
_computeData()
{
    let lastKline = this._minutesHoursKlines.data[this._minutesHoursKlines.data.length -1];
    // do nothing if last kline did not change
    if (null !== this._minutesHoursKlines.lastKline)
    {
        if (_.isEqual(lastKline, this._minutesHoursKlines.lastKline))
        {
            if (debug.enabled)
            {
                debug(`Aborting data computation for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' since last kline did not change`);
            }
            return true;
        }
    }
    this._minutesHoursKlines.lastKline = lastKline;

    // find last closed kline
    let lastClosedKline = null;
    _.forEachRight(this._minutesHoursKlines.data, (e) => {
        if (!e.closed)
        {
            return;
        }
        lastClosedKline = e;
        return false;
    });
    if (null === lastClosedKline)
    {
        if (debug.enabled)
        {
            debug(`Aborting data computation for '${this._exchange}|${this._pair}|${this._minutesHoursKlines.interval}|${this._daysKlines.interval}' since we don't have enough data`);
        }
        return false;
    }

    // current price/volume & delta
    let current = {
        period:this._minutesHoursKlines.interval,
        duration:klinesIntervalsMapping[this._minutesHoursKlines.interval]
    }
    current.last = {
        price:lastKline.close,
        high:lastKline.high,
        low:lastKline.low,
        volume:lastKline.volume,
        fromTimestamp:lastKline.timestamp,
        toTimestamp:lastKline.timestamp + current.duration
    };
    current.previous = {
        price:lastClosedKline.close,
        high:lastClosedKline.high,
        low:lastClosedKline.low,
        volume:lastClosedKline.volume,
        fromTimestamp:lastClosedKline.timestamp,
        toTimestamp:lastClosedKline.timestamp + current.duration
    };
    current.delta = {
        price: null,
        pricePercent:null,
        volume: null,
        volumePercent:null
    }
    if (null !== current.last.price && null !== current.previous.price)
    {
        current.delta.price = new Big(current.last.price).minus(current.previous.price);
        if (current.previous.price > 0)
        {
            current.delta.pricePercent = parseFloat(current.delta.price.times(100).div(current.previous.price).toFixed(4));
        }
        current.delta.price = parseFloat(current.delta.price.toFixed());

        current.delta.volume = new Big(current.last.volume).minus(current.previous.volume);
        if (current.previous.volume > 0)
        {
            current.delta.volumePercent = parseFloat(current.delta.volume.times(100).div(current.previous.volume).toFixed(4));
        }
        current.delta.volume = parseFloat(current.delta.volume.toFixed());
    }

    let data = null === this._data ? {} : _.cloneDeep(this._data);
    data.current = current;

    // process minutes/hours klines (only if last closed kline in minutes/hours klines has changed)
    if (!_.isEqual(lastClosedKline, this._minutesHoursKlines.lastClosedKline))
    {
        this._minutesHoursKlines.lastClosedKline = lastClosedKline;
        let minTimestamp = null;
        _.forEach(this._minutesHoursKlines.dataPeriods, (p) => {
            data[p.id] = this._initializeDataPeriod(lastClosedKline, this._minutesHoursKlines.interval, p);
            if (null === minTimestamp || data[p.id].previous.fromTimestamp < minTimestamp)
            {
                minTimestamp = data[p.id].previous.fromTimestamp;
            }
        });
        this._updateComputedData(minTimestamp, data, this._minutesHoursKlines);
    }

    lastKline = this._daysKlines.data[this._daysKlines.data.length -1];
    // process days klines (only if last kline in days klines has changed)
    if (!_.isEqual(lastKline, this._daysKlines.lastKline))
    {
        this._daysKlines.lastKline = lastKline;
        let minTimestamp = null;
        _.forEach(this._daysKlines.dataPeriods, (p) => {
            data[p.id] = this._initializeDataPeriod(lastKline, this._daysKlines.interval, p);
            if (null === minTimestamp || data[p.id].previous.fromTimestamp < minTimestamp)
            {
                minTimestamp = data[p.id].previous.fromTimestamp;
            }
        });
        this._updateComputedData(minTimestamp, data, this._daysKlines);
    }

    this._data = data;
    return true;
}

/**
 * Update computed data
 *
 * @param {integer} minTimestamp used to stop update when we have timestamp < minTimestamp
 * @param {object} computedData data to update
 * @param {object} klines data (minutes/hours klines or days klines)
 */
_updateComputedData(minTimestamp, computedData, klines)
{
    _.forEachRight(klines.data, (e) => {
        if (e.timestamp < minTimestamp)
        {
            return false;
        }
        _.forEach(klines.dataPeriods, (p) => {
            // update last
            if (e.timestamp < computedData[p.id].last.toTimestamp && e.timestamp >= computedData[p.id].last.fromTimestamp)
            {
                if (null === computedData[p.id].last.price)
                {
                    computedData[p.id].last.price = e.close;
                }
                if (null === computedData[p.id].last.high || (null !== e.high && e.high > computedData[p.id].last.high))
                {
                    computedData[p.id].last.high = e.high;
                }
                if (null === computedData[p.id].last.low || (null !== e.low && e.low < computedData[p.id].last.low))
                {
                    computedData[p.id].last.low = e.low;
                }
                computedData[p.id].last.volume = computedData[p.id].last.volume.plus(e.volume);
            }
            // update previous
            if (e.timestamp < computedData[p.id].previous.toTimestamp && e.timestamp >= computedData[p.id].previous.fromTimestamp)
            {
                if (null === computedData[p.id].previous.price)
                {
                    computedData[p.id].previous.price = e.close;
                }
                if (null === computedData[p.id].previous.high || (null !== e.high && e.high > computedData[p.id].previous.high))
                {
                    computedData[p.id].previous.high = e.high;
                }
                if (null === computedData[p.id].previous.low || (null !== e.low && e.low < computedData[p.id].previous.low))
                {
                    computedData[p.id].previous.low = e.low;
                }
                computedData[p.id].previous.volume = computedData[p.id].previous.volume.plus(e.volume);
            }
        });
    });
    // compute delta
    _.forEach(klines.dataPeriods, (p) => {
        // don't compute delta if we don't known previous values
        if (null !== computedData[p.id].last.price && null !== computedData[p.id].previous.price)
        {
            // price delta
            let delta = new Big(computedData[p.id].last.price).minus(computedData[p.id].previous.price);
            computedData[p.id].delta.price = parseFloat(delta.toFixed());
            if (computedData[p.id].previous.price > 0)
            {
                let percent = delta.times(100).div(computedData[p.id].previous.price);
                computedData[p.id].delta.pricePercent = parseFloat(percent.toFixed(4));
            }
            // volume delta
            delta = computedData[p.id].last.volume.minus(computedData[p.id].previous.volume);
            computedData[p.id].delta.volume = parseFloat(delta.toFixed());
            if (computedData[p.id].previous.volume.gt(0))
            {
                let percent = delta.times(100).div(computedData[p.id].previous.volume);
                computedData[p.id].delta.volumePercent = parseFloat(percent.toFixed(4));
            }
        }
        computedData[p.id].last.volume = parseFloat(computedData[p.id].last.volume.toFixed());
        computedData[p.id].previous.volume = parseFloat(computedData[p.id].previous.volume.toFixed());
    });
}

}

module.exports = KlinesManager;
