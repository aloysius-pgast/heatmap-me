"use strict";
const util = require('util');
const _ = require('lodash');
const url = require('url');
const logger = require('winston');
const clientsRegistry = require('../../clients-registry');

module.exports = function(app, config) {

const updateWs = (ws, req) => {
    let ipaddr = req.connection.remoteAddress;
    if (undefined !== req.headers['x-forwarded-for'])
    {
        ipaddr = req.headers['x-forwarded-for'];
    }
    ws._timestamp = Date.now() / 1000.0;
    ws._clientIpaddr = ipaddr;
}

//-- main route
app.ws('/', function(ws, req) {
    updateWs(ws, req);
    // by default do not compress data & push every 1 iteration
    let opt = {compress:false,pushEvery:1};
    if (undefined !== req.query)
    {
        // check if we need to compress data
        if (undefined !== req.query)
        {
            if (undefined !== req.query.compress)
            {
                let value = req.query.compress.trim();
                if ('true' == value || '1' == value)
                {
                    opt.compress = true;
                }
            }
            // how often should we push data
            if (undefined !== req.query.pushEvery)
            {
                let value = parseInt(req.query.pushEvery);
                if (isNaN(value) || value <= 0)
                {
                    logger.warn(`Unsupported value '${req.query.pushEvery}' for 'pushEvery' (will use default)`);
                }
                opt.pushEvery = value;
            }
        }
    }
    clientsRegistry.registerClient(ws, opt);
});

};
