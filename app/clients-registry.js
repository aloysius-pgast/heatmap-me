"use strict";
const WebSocket = require('ws');
const _ = require('lodash');
const logger = require('winston');
const zlib = require('zlib');
const debug = require('debug')('HM:ClientsRegistry');
const notificationsConsumer = require('./notifications-consumer');

/*
     This class keeps track of all incoming ws connections
 */

// how long should we wait to close the connection if client does not answer to ping
// connection will be closed if we don't receive pong after timeout
const PING_TIMEOUT = 60000;

/**
 * Keeps track of all incoming ws connection & dispatch event received from notificationsConsumer to ws clients
 */
class ClientsRegistry
{

constructor()
{
    // list of clients
    this._clients = {};
    // used to provide a uniq id for each client
    this._nextClientId = 1;
    // number of connected clients
    this._clientsCount = 0;
}

initialize()
{
    notificationsConsumer.on('data', (data) => {
        if (debug.enabled)
        {
            debug(`Pushing data to at most ${this._clientsCount} client(s)`);
        }
        if (0 == this._clientsCount)
        {
            return;
        }
        var buf = new Buffer(JSON.stringify(data), 'utf-8');
        zlib.deflateRaw(buf, (err, compressedData) => {
            let msg = JSON.stringify({data:data,compressed:false});
            let compressedMsg;
            if (null !== err)
            {
                logger.warn(`Could not compress data : ${err.message}`);
                compressedMsg = msg;
            }
            else
            {
                compressedMsg = JSON.stringify({data:compressedData.toString('base64'),compressed:true});
            }
            _.forEach(this._clients, (obj, id) => {
                // only push if pushCount is a multiple of pushEvery
                if (0 !== (++obj.pushCount % obj.pushEvery))
                {
                    return;
                }
                if (debug.enabled)
                {
                    debug(`Pushing data to '${obj.ws._clientIpaddr}'`);
                }
                obj.pushCount = 0;
                if (WebSocket.OPEN != obj.ws.readyState)
                {
                    return;
                }
                if (obj.compress)
                {
                    obj.ws.send(compressedMsg);
                }
                else
                {
                    obj.ws.send(msg);
                }
            });
        });
    });
}

/**
 * Registers a new WS client connection
 *
 * @param {object} ws WebSocket object
 * @param {boolean} opt.compress whether or not data should be compressed using zlib
 * @param {integer} opt.pushEvery the number of iteration to wait before pushing next data
 */
registerClient(ws, opt)
{
    ws._clientId = this._nextClientId++;
    this._clients[ws._clientId] = {ws:ws,compress:opt.compress,pushEvery:opt.pushEvery,pushCount:0};
    this._clientsCount = Object.keys(this._clients).length;
    let msg = `Registering client #${ws._clientId} (${ws._clientIpaddr}) : ${this._clientsCount} client(s) are now connected`;
    logger.info(msg);
    if (debug.enabled)
    {
        debug(msg);
    }

    // define a timer to detect disconnection
    ws._isAlive = false;
    ws._ignoreCloseEvent = false;
    const timer = setInterval(() => {
        if (WebSocket.OPEN != ws.readyState)
        {
            clearTimeout(timer);
            return;
        }
        if (!ws._isAlive)
        {
            if ('debug' == logger.level)
            {
                logger.debug(`Got timeout for WS client #${ws._clientId} (${ws._clientIpaddr})`);
            }
            ws._ignoreCloseEvent = true;
            clearTimeout(timer);
            ws.terminate();
            return;
        }
        ws._isAlive = false;
        ws.ping('', false, true);
    }, PING_TIMEOUT);

    // ping / pong
    ws.on('pong', () => {
        //console.log(`Got pong from WS client #${ws._clientId} (${ws._clientIpaddr})`);
        ws._isAlive = true;
    });

    ws.on('ping', () => {
        ws.pong('', false, true);
    });

    // handle disconnection
    ws.on('close', (code, reason) => {
        if (!ws._ignoreCloseEvent)
        {
            if ('debug' == logger.level)
            {
                logger.debug(`WS client #${ws._clientId} (${ws._clientIpaddr}) disconnected`);
            }
        }
        this._unregisterClient(ws);
    });

    // initial ping
    ws.ping('', false, true);

    // send last computed data
    let data = notificationsConsumer.getData();
    var buf = new Buffer(JSON.stringify(data), 'utf-8');
    zlib.deflateRaw(buf, (err, compressedData) => {
        let msg = JSON.stringify({data:data,compressed:false});
        let compressedMsg;
        if (null !== err)
        {
            logger.warn(`Could not compress data : ${err.message}`);
            compressedMsg = msg;
        }
        else
        {
            compressedMsg = JSON.stringify({data:compressedData.toString('base64'),compressed:true});
        }
        if (opt.compress)
        {
            ws.send(compressedMsg);
        }
        else
        {
            ws.send(msg);
        }
    });
}

/**
 * Called when a WS client connection is closed
 *
 * @param {object} ws WebSocket object
 */
_unregisterClient(ws)
{
    if (undefined === this._clients[ws._clientId])
    {
        return;
    }
    delete this._clients[ws._clientId];
    this._clientsCount = Object.keys(this._clients).length;
    if (debug.enabled)
    {
        debug(`Unregistering client #${ws._clientId} (${ws._clientIpaddr}) : ${this._clientsCount} client(s) are still connected`);
    }
}

}

let registry = new ClientsRegistry();

module.exports = registry;
