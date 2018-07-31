"use strict";
const logger = require('winston');
const _ = require('lodash');

const reflect = (descriptor, opt) => {
    return descriptor.promise.then(function(data){
        return {success:true, value:data, context:descriptor.context};
    }).catch(function(err){
        if (opt.logError)
        {
            let message;
            // not a BaseError
            if (err instanceof Error && undefined === err.errorType)
            {
                message = err.message;
            }
            else
            {
                message = JSON.stringify(err);
            }
            logger.error(`${JSON.stringify(descriptor.context)} => ${message}`);
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
            }
        }
        if (!opt.stopOnError)
        {
            return {success:false, value:err, context:descriptor.context};
        }
        throw err;
    });
};

class PromiseHelper
{

/**
 * Each array entry can be either a Promise object or an object {promise:Promise, context:{}} or an object {function:Function, context:{}} (data will be used when logging errors)
 * opt.logError : log promise error (default = true)
 * opt.stopOnError : stop after one error (like default Promise.all behaviour) (default = false)
 */
static all(arr, opt)
{
    let options = {logError:true, stopOnError:false};
    if (undefined !== opt)
    {
        if (undefined !== opt.logError)
        {
            options.logError = opt.logError;
        }
        if (undefined !== opt.stopOnError)
        {
            options.stopOnError = opt.stopOnError;
        }
    }
    let promises = [];
    _.forEach(arr, (e) => {
        let entry;
        // probably a promise
        if ('function' == typeof e.then)
        {
            entry = {promise:e, context:{}};
        }
        else
        {
            if (undefined !== e.promise)
            {
                entry = {promise:e.promise, context:e.context};
            }
            else
            {
                if (undefined === e.function)
                {
                    logger.error(`'PromiseHelper.all' entries should have 'promise' or 'function' property`);
                    return;
                }
                entry = {promise:e.function.call(), context:e.context};
            }
            if (undefined === e.context)
            {
                entry.context = {};
            }
        }
        promises.push(reflect(entry, options));
    });
    return Promise.all(promises);
}

/**
 * Promise-based wait
 *
 * @param {integer} duration in ms
 */
static wait(duration)
{
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

}

module.exports = PromiseHelper;
