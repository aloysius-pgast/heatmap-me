"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../lib/assert');
const KlinesManager = require('../../../app/klines-manager');
const staticDataProvider = require('../../../app/static-data-provider');

// no really used since we'll be using using static data
let restOpt = {baseUri:'http://127.0.0.1:8000'};

const DATA_PERIODS = ['xm','15m','1h','4h','1d','5d'];

const getComputedDataSchema = () => {

    const klineSchema = joi.object({
        price:joi.number().positive().allow(null).required(),
        high:joi.number().positive().allow(null).required(),
        low:joi.number().positive().allow(null).required(),
        volume:joi.number().positive().allow(0).required(),
        fromTimestamp:joi.number().positive().required(),
        toTimestamp:joi.number().positive().required()
    });

    const periodSchema = joi.object({
        period:joi.string().regex(/^(x|[1-9][0-9]?)([mhd])$/).required(),
        duration:joi.number().positive().required(),
        last:klineSchema.required(),
        previous:klineSchema.required(),
        delta:joi.object({
            price:joi.number().allow(null).required(),
            pricePercent:joi.number().allow(null).required(),
            volume:joi.number().allow(null).required(),
            volumePercent:joi.number().allow(null).required(),
        }).required()
    });

    let obj = {
        current:periodSchema.required()
    }
    _.forEach(DATA_PERIODS, (p) => {
        obj[p] = periodSchema.required();
    });
    const schema = joi.object(obj);
    return schema;
}

(function(){
    let exchange = 'binance';
    let pair = 'USDT-NEO';
    let minutesHours = '5m';
    let daysInterval = '15m';

    describe(`klines-manager '${exchange}|${pair}|${minutesHours}|${daysInterval}`, function(){

        (function(){
            let dataSetId = '01';
            it(`we should have data for each period (dataset = '${dataSetId}')`, (done) => {
                let schema = getComputedDataSchema();
                let manager = new KlinesManager(exchange, pair, minutesHours, daysInterval, DATA_PERIODS, restOpt);
                manager.useStaticKlines(true, dataSetId)
                manager.compute().then(() => {
                    let isReady = manager.isReady();
                    if (!isReady)
                    {
                        Assert.fail('Manager should be ready');
                    }
                    let hasData = manager.hasData();
                    if (!hasData)
                    {
                        Assert.fail('Manager should have data');
                    }
                    let data = manager.getData();
                    Assert.validateSchema(data, schema);
                    let expectedData = staticDataProvider.getExpectedData(exchange, pair, dataSetId);
                    Assert.validateComputedData(data, expectedData);
                    done();
                }).catch ((e) => {
                    done(e);
                });
            });
        })();

        // if manager has been destroyed we should get any data
        (function(){
            let dataSetId = '01';
            it(`if manager is destroyed, it should not have data (dataset = '${dataSetId}')`, (done) => {
                let schema = getComputedDataSchema();
                let manager = new KlinesManager(exchange, pair, minutesHours, daysInterval, DATA_PERIODS, restOpt);
                manager.useStaticKlines(true, dataSetId)
                manager.destroy();
                manager.compute().then(() => {
                    let isDestroyed = manager.isDestroyed();
                    if (!isDestroyed)
                    {
                        Assert.fail('Manager should be destroyed');
                    }
                    let isReady = manager.isReady();
                    if (isReady)
                    {
                        Assert.fail('Manager should not be ready');
                    }
                    let hasData = manager.hasData();
                    if (hasData)
                    {
                        Assert.fail('Manager should not have data');
                    }
                    let data = manager.getData();
                    if (null !== data)
                    {
                        Assert.fail('Data should be nil');
                    }
                    done();
                }).catch ((e) => {
                    done(e);
                });
            });
        })();

        (function(){
            let dataSetId = '02';
            it(`we shouldn't have data for 'data[5d][previous]' & 'data[5d][delta]', for '5d' period (dataset = '${dataSetId}')`, (done) => {
                let schema = getComputedDataSchema();
                let manager = new KlinesManager(exchange, pair, minutesHours, daysInterval, DATA_PERIODS, restOpt);
                manager.useStaticKlines(true, dataSetId)
                manager.compute().then(() => {
                    let isReady = manager.isReady();
                    if (!isReady)
                    {
                        Assert.fail('Manager should be ready');
                    }
                    let hasData = manager.hasData();
                    if (!hasData)
                    {
                        Assert.fail('Manager should have data');
                    }
                    let data = manager.getData();
                    Assert.validateSchema(data, schema);
                    let expectedData = staticDataProvider.getExpectedData(exchange, pair, dataSetId);
                    Assert.validateComputedData(data, expectedData);
                    done();
                }).catch ((e) => {
                    done(e);
                });
            });
        })();

        // if no klines were retrieved, manager should not be ready
        (function(){
            let dataSetId = '03';
            it(`if we didn't retrieve any klines, manager should not be ready (dataset = '${dataSetId}')`, (done) => {
                let manager = new KlinesManager(exchange, pair, minutesHours, daysInterval, DATA_PERIODS, restOpt);
                manager.useStaticKlines(true, dataSetId)
                manager.compute().then(() => {
                    let isReady = manager.isReady();
                    if (isReady)
                    {
                        Assert.fail('Manager should not be ready');
                    }
                    let hasData = manager.hasData();
                    if (hasData)
                    {
                        Assert.fail('Manager should not have data');
                    }
                    let data = manager.getData();
                    if (null !== data)
                    {
                        Assert.fail('Data should be nil');
                    }
                    done();
                }).catch ((e) => {
                    done(e);
                });
            });
        })();

        // if we don't have any closed kline for minutesHours, manager should not compute any data
        (function(){
            let dataSetId = '04';
            it(`if we didn't retrieve any klines, manager should not have data (dataset = '${dataSetId}')`, (done) => {
                let manager = new KlinesManager(exchange, pair, minutesHours, daysInterval, DATA_PERIODS, restOpt);
                manager.useStaticKlines(true, dataSetId)
                manager.compute().then(() => {
                    let isReady = manager.isReady();
                    if (!isReady)
                    {
                        Assert.fail('Manager should be ready');
                    }
                    let hasData = manager.hasData();
                    if (hasData)
                    {
                        Assert.fail('Manager should not have data');
                    }
                    let data = manager.getData();
                    if (null !== data)
                    {
                        Assert.fail('Data should be nil');
                    }
                    done();
                }).catch ((e) => {
                    done(e);
                });
            });
        })();

        // add klines after first computation to simulate real-time data
        (function(){
            let dataSetId = '05';
            it(`we should be able to rebuild days klines from minutes/hours klines (dataset = '${dataSetId}')`, (done) => {
                let schema = getComputedDataSchema();
                let manager = new KlinesManager(exchange, pair, minutesHours, daysInterval, DATA_PERIODS, restOpt);
                manager.useStaticKlines(true, dataSetId)
                manager.compute().then(() => {
                    let isReady = manager.isReady();
                    if (!isReady)
                    {
                        Assert.fail('Manager should be ready');
                    }
                    let hasData = manager.hasData();
                    if (!hasData)
                    {
                        Assert.fail('Manager should have data');
                    }
                    let data = manager.getData();
                    Assert.validateSchema(data, schema);
                    let wsKlines = staticDataProvider.getWsKlines(exchange, pair, dataSetId, minutesHours);
                    _.forEach(wsKlines, (e) => {
                        manager.addKline(e);
                    });
                    manager.compute().then(() => {
                        let isReady = manager.isReady();
                        if (!isReady)
                        {
                            Assert.fail('Manager should be ready');
                        }
                        let hasData = manager.hasData();
                        if (!hasData)
                        {
                            Assert.fail('Manager should have data');
                        }
                        let data = manager.getData();
                        Assert.validateSchema(data, schema);
                        let expectedData = staticDataProvider.getExpectedData(exchange, pair, dataSetId);
                        Assert.validateComputedData(data, expectedData);
                        done();
                    }).catch ((e) => {
                        done(e);
                    });
                }).catch ((e) => {
                    done(e);
                });
            });
        })();

    });

})();

(function(){
    let exchange = 'binance';
    let pair = 'USDT-NEO';
    let minutesHours = '3m';
    let daysInterval = '15m';

    describe(`klines-manager '${exchange}|${pair}|${minutesHours}|${daysInterval}`, function(){

        (function(){
            let dataSetId = '06';
            it(`we should have data for each period (dataset = '${dataSetId}')`, (done) => {
                let schema = getComputedDataSchema();
                let manager = new KlinesManager(exchange, pair, minutesHours, daysInterval, DATA_PERIODS, restOpt);
                manager.useStaticKlines(true, dataSetId)
                manager.compute().then(() => {
                    let isReady = manager.isReady();
                    if (!isReady)
                    {
                        Assert.fail('Manager should be ready');
                    }
                    let hasData = manager.hasData();
                    if (!hasData)
                    {
                        Assert.fail('Manager should have data');
                    }
                    let data = manager.getData();
                    Assert.validateSchema(data, schema);
                    let expectedData = staticDataProvider.getExpectedData(exchange, pair, dataSetId);
                    Assert.validateComputedData(data, expectedData);
                    done();
                }).catch ((e) => {
                    done(e);
                });
            });
        })();
    });

})();
