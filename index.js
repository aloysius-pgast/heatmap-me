const fs = require('fs');
const path = require('path');
const util = require('util');
const express = require('express');
const compression = require('compression');
const http = require('http');
const https = require('https');
const _ = require('lodash');
const logger = require('winston');
const ConfigChecker = require('./app/config-checker');
const clientsRegistry = require('./app/clients-registry');
const notificationsConsumer = require('./app/notifications-consumer');

logger.configure({
    transports: [
        new (logger.transports.Console)({
              timestamp: function() {
                return Date.now();
              },
              formatter: function(options) {
                // Return string will be passed to logger.
                return options.timestamp() +'|'+ options.level.toUpperCase() +'|'+ (options.message ? options.message : '') +
                  (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
              }
        })
    ]
});
// default log level is warn
logger.level = 'warn';
logger.warn("Starting...");
// function to check if level is enabled
logger.isLevel = function(level)
{
    return this.levels[this.level] >= this.levels[level];
}

//-- load config
let config = {};
let configPath = 'config/config.json';
let configFile = path.join(__dirname, configPath);
// custom config
let hasCustomConfig = false;
let customConfigPath = 'custom_config/config.json';
let customConfigFile = path.join(__dirname, customConfigPath);
let customConfig = {};

if (fs.existsSync(configFile))
{
    try
    {
        config = require(configFile);
    }
    catch (e)
    {
        logger.error("Config file '%s' is not a valid JSON file", configPath);
        process.exit(1);
    }
}
if (fs.existsSync(customConfigFile))
{
    hasCustomConfig = true;
    try
    {
        customConfig = require(customConfigFile);
    }
    catch (e)
    {
        logger.error("Config file '%s' is not a valid JSON file", customConfigPath);
        process.exit(1);
    }
}

//-- update config based on environment (used when using docker container)
// only if we don't have a custom config
if (!hasCustomConfig)
{
    if (undefined !== process.env['cfg.logLevel'])
    {
        switch (process.env['cfg.logLevel'])
        {
            case 'error':
            case 'warn':
            case 'info':
            case 'verbose':
            case 'debug':
            case 'silly':
                config.logLevel = process.env['cfg.logLevel'];
                break;
        }
        // update log level
        logger.level = config.logLevel;
    }
    // gateway info
    if (undefined !== process.env['cfg.gateway.restEndpoint'] && '' != process.env['cfg.gateway.restEndpoint'])
    {
        if (undefined === config.gateway)
        {
            config.gateway = {};
        }
        config.gateway.restEndpoint = process.env['cfg.gateway.restEndpoint'];
    }
    if (undefined !== process.env['cfg.gateway.wsEndpoint'] && '' != process.env['cfg.gateway.wsEndpoint'])
    {
        if (undefined === config.gateway)
        {
            config.gateway = {};
        }
        config.gateway.wsEndpoint = process.env['cfg.gateway.wsEndpoint'];
    }
    if (undefined !== process.env['cfg.gateway.sessionId'] && '' != process.env['cfg.gateway.sessionId'])
    {
        if (undefined === config.gateway)
        {
            config.gateway = {};
        }
        config.gateway.sessionId = process.env['cfg.gateway.sessionId'];
    }
    if (undefined !== process.env['cfg.gateway.apiKey'] && '' != process.env['cfg.gateway.apiKey'])
    {
        if (undefined === config.gateway)
        {
            config.gateway = {};
        }
        config.gateway.apiKey = process.env['cfg.gateway.apiKey'];
    }

    // ws parameters
    if (undefined !== process.env['cfg.computeInterval'] && '' != process.env['cfg.computeInterval'])
    {
        config.pushInterval = process.env['cfg.computeInterval'];
    }
    if (undefined !== process.env['cfg.dataPeriods'] && '' != process.env['cfg.dataPeriods'])
    {
        config.dataPeriods = process.env['cfg.dataPeriods'].split(',');
    }

    // ui
    if (undefined !== process.env['cfg.ui.enabled'] && '' !== process.env['cfg.ui.enabled'])
    {
        if (true === process.env['cfg.ui.enabled'] || '1' == process.env['cfg.ui.enabled'])
        {
            config.ui.enabled = true;
        }
        else if (false === process.env['cfg.ui.enabled'] || '0' == process.env['cfg.ui.enabled'])
        {
            config.ui.enabled = false;
        }
    }
}

// retrieve config from checker
let checker = new ConfigChecker();
if (!checker.check(config))
{
    logger.error("Config file '%s' is invalid", configPath);
    _.forEach(checker.getErrors(), (err) => {
        logger.error(err);
    });
    process.exit(1);
}
config = checker.getCfg();

// check custom config
if (hasCustomConfig)
{
    checker = new ConfigChecker(config);
    if (!checker.check(customConfig))
    {
        logger.error("Config file '%s' is invalid", customConfigPath);
        _.forEach(checker.getErrors(), (err) => {
            logger.error(err);
        });
        process.exit(1);
    }
    config = checker.getCfg();
}

//-- check certificate files
let sslCertificate = {
    key:{
        required:true,
        path:'ssl/certificate.key'
    },
    cert:{
        required:true,
        path:'ssl/certificate.crt'
    },
    ca:{
        required:false,
        path:'ssl/ca.crt'
    }
}
let sslOptions = {}
if (config.listen.ssl || config.listenWs.ssl)
{
    _.forEach(sslCertificate, (obj, key) => {
        obj.file = path.join(__dirname, obj.path);
        if (!fs.existsSync(obj.file))
        {
            if (!obj.required)
            {
                return;
            }
            logger.error("SSL requested in config but file '%s' does not exist", obj.path);
            process.exit(1);
        }
        try
        {
            sslOptions[key] = fs.readFileSync(obj.file);
        }
        catch (e)
        {
            logger.error("SSL requested in config but file '%s' cannot be read (%s)", obj.path, e.message);
            process.exit(1);
        }
    });
}

//-- check ui config
// ensure ui has been built
if (config.ui.enabled)
{
    let uiIndexFile = path.join(__dirname, 'ui/build/index.html');
    if (!fs.existsSync(uiIndexFile))
    {
        config.ui.enabled = false;
        logger.warn("UI won't be enabled because it does not seem to have been built");
    }
    logger.warn("UI is enabled");
}

//-- HTTP server
let startHttp = function(){
    const app = express();
    let server;
    if (config.listen.ssl)
    {
        server = https.createServer(sslOptions, app);
    }
    else
    {
        server = http.createServer(app);
    }
    server.on('error', function(err){
        if (undefined !== err.code && 'EADDRINUSE' == err.code)
        {
            logger.error("Address %s:%s is already in use", err.address, err.port);
            process.exit(1);
        }
        throw err;
    });
    app.use(compression());
    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "apikey");
        res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,PUT,OPTIONS");
        next();
    });

    // load routes
    require('./app/routes/http')(app, config);

    // start server
    let ipaddr = '0.0.0.0';
    if ('*' != config.listen.ipaddr)
    {
        ipaddr = config.listen.ipaddr;
    }
    return function(){
        server.listen(config.listen.port, ipaddr, function(){
            let proto = 'HTTP';
            if (config.listen.ssl)
            {
                proto = 'HTTPS';
            }
            logger.warn("%s server is alive on %s:%s", proto, config.listen.ipaddr, config.listen.port);
        });
    }
}();

//-- WS server
let startWs = function(){
    const app = express();
    let server;
    if (config.listenWs.ssl)
    {
        server = https.createServer(sslOptions, app);
    }
    else
    {
        server = http.createServer(app);
    }
    server.on('error', (err) => {
        if (undefined !== err.code && 'EADDRINUSE' == err.code)
        {
            logger.error("Address %s:%s is already in use", err.address, err.port);
            process.exit(1);
        }
        throw err;
    });
    const expressWs = require('express-ws')(app, server, {
        wsOptions:{}
    });

    // load routes
    require('./app/routes/ws')(app, config);

    // start server
    let ipaddr = '0.0.0.0';
    if ('*' != config.listenWs.ipaddr)
    {
        ipaddr = config.listenWs.ipaddr;
    }
    return function(){
        server.listen(config.listenWs.port, ipaddr, function(){
            let proto = 'WS';
            if (config.listenWs.ssl)
            {
                proto = 'WSS';
            }
            logger.warn("%s server is alive on %s:%s", proto, config.listenWs.ipaddr, config.listenWs.port);
        });
    }
}();

// trap ctrl-c to close database properly
process.on('SIGINT', () => {
    process.exit();
});

// initialize notificationsConsumer
notificationsConsumer.initialize(config);
notificationsConsumer.check().then((result) => {
    if (!result)
    {
        process.exit(1);
    }
    // initialize clientsRegistry
    clientsRegistry.initialize();
    // subscribe to gateway
    notificationsConsumer.start().then(() => {
        //-- start both servers
        startHttp();
        startWs();
    });
}).catch ((e) => {
    if (undefined !== e.stack)
    {
        logger.error(e.stack);
    }
    else
    {
        logger.error(e);
    }
    process.exit(1);
});
