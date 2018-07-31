"use strict";
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('./abstract-config-checker');

class ConfigChecker extends AbstractConfigCheckerClass
{

constructor(defaultConfig)
{
    let cfg;
    cfg = {
        listen:{
            ipaddr:'*',
            port:8002,
            ssl:false
        },
        listenWs:{
            ipaddr:'*',
            port:8003,
            ssl:false
        },
        ui:{
            enabled:false
        },
        logLevel:'warn',
        // compute data every 60s
        computeInterval:60,
        // periods we want to provide data for (xm = one of ['5m','3m','1m'], depends on intervals supported by exchange)
        dataPeriods:['xm','15m','1h','4h','1d','5d'],
        gateway:{
            restEndpoint:'http://127.0.0.1:8000',
            wsEndpoint:'ws://127.0.0.1:8001',
            apiKey:'',
            sessionId:'mystream.heatmap-me'
        }
    }
    if (undefined !== defaultConfig)
    {
        _.defaultsDeep(cfg, defaultConfig)
    }
    super(cfg);
}

_check()
{
    let valid = true;
    if (!this._checkListen())
    {
        valid = false;
    }
    if (!this._checkListenWs())
    {
        valid = false;
    }
    if (!this._checkLogLevel())
    {
        valid = false;
    }
    if (!this._checkComputeInterval())
    {
        valid = false;
    }
    if (!this._checkDataPeriods())
    {
        valid = false;
    }
    if (!this._checkUi())
    {
        valid = false;
    }
    if (!this._checkGateway())
    {
        valid = false;
    }
    return valid;
}

_checkLogLevel()
{
    if (undefined === this._config.logLevel)
    {
        return true;
    }
    switch (this._config.logLevel)
    {
        case 'error':
        case 'warn':
        case 'info':
        case 'verbose':
        case 'debug':
        case 'silly':
            this._finalConfig.logLevel = this._config.logLevel;
            return true;
        default:
            this._invalid('logLevel');
            return false;
    }
}

_checkListen()
{
    if (undefined === this._config.listen)
    {
        return true;
    }
    let valid = true;
    // check port
    if (undefined !== this._config.listen.port)
    {
        if (!this._isValidPort(this._config.listen.port))
        {
            this._invalid({name:'listen[port]',value:this._config.listen.port});
            valid = false;
        }
        else
        {
            this._finalConfig.listen.port = parseInt(this._config.listen.port);
        }
    }
    // check ip address
    if (undefined !== this._config.listen.ipaddr)
    {
        if ('*' != this._config.listen.ipaddr)
        {
            if (!this._isValidIpaddr(this._config.listen.ipaddr))
            {
                this._invalid({name:'listen[ipaddr]',value:this._config.listen.ipaddr});
                valid = false;
            }
        }
        if (valid)
        {
            this._finalConfig.listen.ipaddr = this._config.listen.ipaddr;
        }
    }
    // check if ssl can be enabled
    if (true === this._config.listen.ssl)
    {
        this._finalConfig.listen.ssl = true;
    }
    return valid;
}

_checkListenWs()
{
    if (undefined === this._config.listenWs)
    {
        return true;
    }
    let valid = true;
    // check port
    if (undefined !== this._config.listenWs.port)
    {
        if (!this._isValidPort(this._config.listenWs.port))
        {
            this._invalid({name:'listenWs[port]',value:this._config.listenWs.port});
            valid = false;
        }
        else
        {
            this._finalConfig.listenWs.port = parseInt(this._config.listenWs.port);
        }
    }
    // check ip address
    if (undefined !== this._config.listenWs.ipaddr)
    {
        if ('*' != this._config.listenWs.ipaddr)
        {
            if (!this._isValidIpaddr(this._config.listenWs.ipaddr))
            {
                this._invalid({name:'listenWs[ipaddr]',value:this._config.listenWs.ipaddr});
                valid = false;
            }
        }
        if (valid)
        {
            this._finalConfig.listenWs.ipaddr = this._config.listenWs.ipaddr;
        }
    }
    // check if ssl can be enabled
    if (true === this._config.listenWs.ssl)
    {
        this._finalConfig.listenWs.ssl = true;
    }
    return valid;
}

_checkComputeInterval()
{
    if (undefined === this._config.computeInterval)
    {
        return true;
    }
    let interval = parseInt(this._config.computeInterval);
    if (isNaN(interval) || interval <= 0)
    {
        this._invalid('computeInterval', 'should be an integer > 0');
        return false;
    }
    this._finalConfig.computeInterval = interval;
    return true;
}

_checkDataPeriods()
{
    if (undefined === this._config.dataPeriods)
    {
        return true;
    }
    let valid = true;
    let periods = [];
    _.forEach(this._config.dataPeriods, (p, index) => {
        let m = p.match(/^(x|[1-9][0-9]?)([mhd])$/);
        if (null === m)
        {
            this._invalid({name:`dataPeriods[${index}]`,value:p});
            valid = false;
            return false;
        }
        let value = m[1];
        switch (m[2])
        {
            case 'm':
                if ('x' == value)
                {
                    periods.push({period:p, duration:5 * 60});
                    return;
                }
                else
                {
                    value = parseInt(value);
                    switch (value)
                    {
                        case 15:
                        case 30:
                        case 45:
                            periods.push({period:p, duration:value * 60});
                            break;
                        default:
                            this._invalid({name:`dataPeriods[${index}]`,value:p}, `value should be one of [x,15,30,45] for 'm' unit`);
                            valid = false;
                            return false;
                    }
                }
                break;
            case 'h':
                value = parseInt(value);
                if (value > 23)
                {
                    this._invalid({name:`dataPeriods[${index}]`,value:p}, `value should be in range [1..23] for 'h' unit`);
                    valid = false;
                    return false;
                }
                periods.push({period:p, duration:value * 3600});
                break;
            case 'd':
                value = parseInt(value);
                if (value > 30)
                {
                    this._invalid({name:`dataPeriods[${index}]`,value:p}, `value should be in range [1..30] for 'd' unit`);
                    valid = false;
                    return false;
                }
                periods.push({period:p, duration:value * 86400});
                break;
        }
    });
    if (!valid)
    {
        return false;
    }
    this._finalConfig.dataPeriods = _.uniq(periods).sort((a,b) => {
        if (a.duration == b.duration)
        {
            return 0;
        }
        return a.duration < b.duration ? -1 : 1;
    }).map ((e) => {
        return e.period;
    })
    return true;
}

_checkUi()
{
    let valid = true;
    if (undefined === this._config.ui)
    {
        return true;
    }
    if (undefined !== this._config.ui.enabled)
    {
        if (!this._isValidBoolean(this._config.ui.enabled))
        {
            this._invalid({name:'ui.enabled', value:this._config.ui.enabled});
            valid = false;
        }
        else
        {
            this._finalConfig.ui.enabled = this._config.ui.enabled;
        }
    }
    return valid;
}

_checkGateway()
{
    if (undefined === this._config.gateway)
    {
        return true;
    }
    let valid = true;
    if (!this._checkEndpoints())
    {
        valid = false;
    }
    if (!this._checkSid())
    {
        valid = false;
    }
    if (!this._checkApiKey())
    {
        valid = false;
    }
    return valid;
}

_checkEndpoints()
{
    let valid = true;
    if (undefined !== this._config.gateway.restEndpoint && '' != this._config.gateway.restEndpoint)
    {
        if (!this._config.gateway.restEndpoint.startsWith('http://') && !this._config.gateway.restEndpoint.startsWith('https://'))
        {
            this._invalid({name:'gateway[restEndpoint]',value:this._config.gateway.restEndpoint});
            valid = false;
        }
        else
        {
            this._finalConfig.gateway.restEndpoint = this._config.gateway.restEndpoint;
            // remove trailing '/'
            if ('/' == this._finalConfig.gateway.restEndpoint.substr(-1, 1))
            {
                this._finalConfig.gateway.restEndpoint = this._finalConfig.gateway.restEndpoint.slice(0, -1);
            }

        }
    }
    if (undefined !== this._config.gateway.wsEndpoint && '' != this._config.gateway.wsEndpoint)
    {
        if (!this._config.gateway.wsEndpoint.startsWith('ws://') && !this._config.gateway.wsEndpoint.startsWith('wss://'))
        {
            this._invalid({name:'gateway[wsEndpoint]',value:this._config.gateway.wsEndpoint});
            valid = false;
        }
        else
        {
            this._finalConfig.gateway.wsEndpoint = this._config.gateway.wsEndpoint;
            // remove trailing '/'
            if ('/' == this._finalConfig.gateway.wsEndpoint.substr(-1, 1))
            {
                this._finalConfig.gateway.wsEndpoint = this._finalConfig.gateway.wsEndpoint.slice(0, -1);
            }
        }
    }
    return valid;
}

_checkSid()
{
    if (undefined !== this._config.gateway.sessionId && '' != this._config.gateway.sessionId)
    {
        this._finalConfig.gateway.sessionId = this._config.gateway.sessionId;
    }
    return true;
}

_checkApiKey()
{
    if (undefined !== this._config.gateway.apiKey && '' != this._config.gateway.apiKey)
    {
        this._finalConfig.gateway.apiKey = this._config.gateway.apiKey;
    }
    return true;
}

}

module.exports = ConfigChecker;
