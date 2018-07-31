"use strict";
const logger = require('winston');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');

class StaticDataProvider
{

/**
 * Returns static klines
 *
 * @param {string} exchange
 * @param {string} pair
 * @param {string} dataSetId id of the dataset to retrieve
 * @param {string} interval klines interval
 * @param {integer} count number of klines to retrieve
 */
static getKlines(exchange, pair, dataSetId, interval, count)
{
    let file =  path.join(__dirname, `../test/data/klines/${exchange}/${pair}/${dataSetId}/${interval}.json`);
    let klines = [];
    if (!fs.existsSync(file))
    {
        logger.warn("Static data file '%s' does not exist", file);
        return klines;
    }
    let data;
    try
    {
        data = require(file);
    }
    catch (e)
    {
        logger.warn("Static data file '%s' is not a valid JSON file", file);
        return klines;
    }
    _.forEachRight(data, (e) => {
        klines.unshift(e);
        if (count == klines.length)
        {
            return false;
        }
    });
    return klines;
}

/**
 * Returns static klines
 *
 * @param {string} exchange
 * @param {string} pair
 * @param {string} dataSetId id of the dataset to retrieve
 * @param {string} interval klines interval
 */
static getWsKlines(exchange, pair, dataSetId, interval)
{
    let file =  path.join(__dirname, `../test/data/klines/${exchange}/${pair}/${dataSetId}/${interval}.ws.json`);
    let klines = [];
    if (!fs.existsSync(file))
    {
        logger.warn("Static data file '%s' does not exist", file);
        return klines;
    }
    let data;
    try
    {
        data = require(file);
    }
    catch (e)
    {
        logger.warn("Static data file '%s' is not a valid JSON file", file);
        return klines;
    }
    return data;
}

/**
 * Returns expected data
 *
 * @param {string} exchange
 * @param {string} pair
 * @param {string} dataSetId id of the dataset to retrieve
 */
static getExpectedData(exchange, pair, dataSetId)
{
    let file =  path.join(__dirname, `../test/data/klines/${exchange}/${pair}/${dataSetId}/expectedData.json`);
    let expectedData = {};
    if (!fs.existsSync(file))
    {
        logger.warn("Expected data file '%s' does not exist", file);
        return klines;
    }
    let data;
    try
    {
        data = require(file);
    }
    catch (e)
    {
        logger.warn("Expected data file '%s' is not a valid JSON file", file);
        return expectedData;
    }
    return data;
}

}

module.exports = StaticDataProvider;
