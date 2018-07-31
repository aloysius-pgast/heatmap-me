import EventEmitter from 'wolfy87-eventemitter/EventEmitter';
import {Base64} from 'js-base64';
import pako from 'pako';
import settings from './settings';

class DataManager extends EventEmitter
{

constructor()
{
    super();
    this._connection = null;
    this._connectionId = 0;
    // in case of error, wait 10s before retrying
    this._reconnectionDelay = 10000;
    // last received data
    this._data = [];
    // last sorted data
    this._sortedData = [];
    // timestamp of last received data
    this._timestamp = 0;
    settings.on('heatmapsSortCriterion', () => {
        this._sortedData = this._sortData(this._data);
    });
}

initialize(endpoint)
{
    this._wsEndpoint = endpoint;
}

_reconnect()
{
    if (null === this._connection)
    {
        return;
    }
    let connection = this._connection;
    connection._ignoreCloseEvent = true;
    connection.close();
    this._createConnection();
}

connect()
{
    if (null !== this._connection)
    {
        return;
    }
    this._createConnection();
}

/**
 * Returns current data
 */
getData()
{
    return this._data;
}

/**
 * Returns sorted data
 */
getSortedData()
{
    return this._sortedData;
}

getTimestamp()
{
    return this._timestamp;
}

_getUri()
{
    let uri = `${this._wsEndpoint}?compress=true`;
    return uri;
}

_createConnection()
{
    let self = this;
    let uri = this._getUri();
    ++this._connectionId;
    let connection = new WebSocket(uri);
    connection._ignoreCloseEvent = false;

    connection.onopen = (e) => {
        // nothing to do
    }

    /**
     * When connection could not be established
     */
    connection.onerror = (e) => {
        console.error(`Could not open WS connection to '${connection.url}' : will try to reconnect in ${this._reconnectionDelay}ms`);
        connection._ignoreCloseEvent = true;
        let connectionId = this._connectionId;
        setTimeout(() => {
            // ignore reconnection since another reconnection happended in the meantime
            if (connectionId != this._connectionId)
            {
                return;
            }
            this._reconnect();
        }, this._reconnectionDelay);
    }

    /**
     * Connection was closed by server
     */
    connection.onclose = (e) => {
        if (connection._ignoreCloseEvent)
        {
            return;
        }
        console.warn(`WS connection '${connection.url}' was closed (code = '${e.code}'', reason = '${e.reason}') : will try to reconnect in ${this._reconnectionDelay}ms`);
        let connectionId = this._connectionId;
        setTimeout(() => {
            // ignore reconnection since another reconnection happended in the meantime
            if (connectionId != this._connectionId)
            {
                return;
            }
            this._reconnect();
        }, this._reconnectionDelay);
    }

    /**
     * Message received from server
     */
    connection.onmessage = (e) => {
        let data;
        try
        {
            data = JSON.parse(e.data);
        }
        catch (e)
        {
            console.error(`Got invalid JSON message`);
            console.error(e.data);
            return;
        }
        if (undefined === data.compressed)
        {
            console.error(`Missing 'compressed' attribute in JSON data`);
            console.error(e.data);
            return;
        }

        // process compressed data
        if (data.compressed)
        {
            let str;
            // base64 decode
            try
            {
                str = Base64.atob(data.data);
            }
            catch (e)
            {
                console.error(`Got invalid base64 message`);
                console.error(data.data);
                return;
            }
            // decompress
            try
            {
                str = pako.inflateRaw(str, {to:'string'});
            }
            catch (e)
            {
                console.error(`Could not decompress data`);
                console.error(e);
                return;
            }
            // parse json
            try
            {
                data.data = JSON.parse(str);
            }
            catch (e)
            {
                console.error(`Could not parse JSON after decompressing`);
                console.error(str);
                return;
            }
        }
        let list = [];
        try
        {
            data.data.forEach((pairs, exchange) => {
                pairs.forEach((obj, pair) => {
                    let entry = {
                        id:`${exchange}-${pair}`,
                        exchange:exchange,
                        pair:pair,
                        current:obj.current,
                        data:[]
                    };
                    let arr = pair.split('-');
                    entry.currency = arr[1];
                    delete obj.current;
                    // longer period first
                    entry.data = Object.values(obj).sort((a,b) => {
                        return a.duration > b.duration ? -1 : 1;
                    });
                    list.push(entry)
                });
            });
        }
        catch (e)
        {
            console.error(e);
        }
        this._timestamp = Date.now();
        this._data = list;
        this._sortedData = this._sortData(list);
        this.emit('data', this._sortedData);
    };

    this._connection = connection;
}

_sortData(list)
{
    let sortCriterion = settings.getheatmapsSortCriterion();
    switch (sortCriterion)
    {
        case 'exchange-pair':
            return this._sortDataByExchangeAndPair(list);
        case 'pair-price':
            return this._sortDataByPairAndPrice(list);
        case 'pair-volume':
            return this._sortDataByPairAndVolume(list);
        case 'price-evolution-smallest-period':
            return this._sortDataByPriceEvolutionOverSmallestPeriod(list);
        case 'price-evolution-largest-period':
            return this._sortDataByPriceEvolutionOverLargestPeriod(list);
        case 'volume-evolution-smallest-period':
            return this._sortDataByVolumeEvolutionOverSmallestPeriod(list);
        case 'volume-evolution-largest-period':
            return this._sortDataByVolumeEvolutionOverLargestPeriod(list);
    }
}

_sortDataByExchangeAndPair(list)
{
    return list.sort((a,b) => {
        if (a.exchange == b.exchange)
        {
            return a.pair < b.pair ? -1 : 1;
        }
        return a.exchange < b.exchange ? -1 : 1;
    });
}

_sortDataByPairAndPrice(list)
{
    return list.sort((a,b) => {
        if (a.pair == b.pair)
        {
            return a.current.last.price >= b.current.last.price ? -1 : 1;
        }
        return a.pair < b.pair ? -1 : 1;
    });
}

_sortDataByPairAndVolume(list)
{
    return list.sort((a,b) => {
        if (a.pair == b.pair)
        {
            return a.current.last.volume >= b.current.last.volume ? -1 : 1;
        }
        return a.pair < b.pair ? -1 : 1;
    });
}

_sortDataByPriceEvolutionOverSmallestPeriod(list)
{
    return list.sort((a,b) => {
        if (null === a.data[a.data.length - 1].delta.pricePercent)
        {
            if (null === b.data[b.data.length - 1].delta.pricePercent)
            {
                return 0;
            }
            return 1;
        }
        else if (null === b.data[b.data.length - 1].delta.pricePercent)
        {
            return -1;
        }
        return a.data[a.data.length - 1].delta.pricePercent >= b.data[b.data.length - 1].delta.pricePercent ? -1 : 1;
    });
}

_sortDataByPriceEvolutionOverLargestPeriod(list)
{
    return list.sort((a,b) => {
        if (null === a.data[0].delta.pricePercent)
        {
            if (null === b.data[0].delta.pricePercent)
            {
                return 0;
            }
            return 1;
        }
        else if (null === b.data[0].delta.pricePercent)
        {
            return -1;
        }
        return a.data[0].delta.pricePercent >= b.data[0].delta.pricePercent ? -1 : 1;
    });
}

_sortDataByVolumeEvolutionOverSmallestPeriod(list)
{
    return list.sort((a,b) => {
        if (null === a.data[a.data.length - 1].delta.volumePercent)
        {
            if (null === b.data[b.data.length - 1].delta.volumePercent)
            {
                return 0;
            }
            return 1;
        }
        else if (null === b.data[b.data.length - 1].delta.volumePercent)
        {
            return -1;
        }
        return a.data[a.data.length - 1].delta.volumePercent >= b.data[b.data.length - 1].delta.volumePercent ? -1 : 1;
    });
}

_sortDataByVolumeEvolutionOverLargestPeriod(list)
{
    return list.sort((a,b) => {
        if (null === a.data[0].delta.volumePercent)
        {
            if (null === b.data[0].delta.volumePercent)
            {
                return 0;
            }
            return 1;
        }
        else if (null === b.data[0].delta.volumePercent)
        {
            return -1;
        }
        return a.data[0].delta.volumePercent >= b.data[0].delta.volumePercent ? -1 : 1;
    });
}

}

export default new DataManager();
