"use strict";
const _assert = require('assert');
const joi = require('joi');
const _ = require('lodash');

class Assert
{

/**
 * @param {object|array} obj object to validate
 * @param {object} schema joi schema
 * @param {boolean} opt.isList when true mean obj should be considered as a dict list
 */
static validateSchema(obj, schema, opt)
{
    if (undefined === opt)
    {
        opt = {};
    }
    if (undefined === opt.isList)
    {
        opt.isList = false;
    }

    let r = joi.validate(obj, schema);
    if (null !== r.error)
    {
        let message = r.error.message;
        if ('array' == schema._type)
        {
            // if first element of path is a number, it might be a problem with the element at given index
            let index = r.error.details[0].path[0];
            if ('number' == typeof index && undefined !== obj[index])
            {
                // retry to validate only this element
                {
                    let newSchema = schema._inner.items[0];
                    let r = joi.validate(obj[index], newSchema);
                    if (null !== r.error)
                    {
                        console.log(`obj[${index}]:`)
                        console.log(r.error.annotate());
                        _assert.fail(message);
                    }
                }
            }
        }
        else if (opt.isList)
        {
            let key = r.error.details[0].path[0];
            // retry with invalid element
            if (undefined !== obj[key])
            {
                // retry to validate only this element
                {
                    let newSchema = schema._inner.patterns[0].rule;
                    let r = joi.validate(obj[key], newSchema)
                    if (null !== r.error)
                    {
                        console.log(`obj[${key}]:`)
                        console.log(r.error.annotate());
                        _assert.fail(message);
                    }
                }
            }
        }
        console.log(r.error.annotate());
        if ('array' == schema._type)
        {
            // we dont' have the expected number of elements in the array
            if (0 == r.error.details[0].path.length && 'array.length' == r.error.details[0].type)
            {
                message += ` (not ${obj.length})`;
            }
        }
        _assert.fail(message);
    }
}

static validateComputedData(data, expectedData)
{
    let path;
    let _data;
    let _expectedData;
    let err = false;
    _.forEach(data, (obj, k) => {
        if ('current' == k)
        {
            path = 'data[current]';
            _data = obj;
            _expectedData = expectedData.current;
            if (!_.isEqual(_data, _expectedData))
            {
                err = true;
                return false;
            }
            return;
        }
        path = `data[${k}]`;
        _.forEach(['last', 'previous', 'delta'], (e) => {
            let _path = `${path}[${e}]`;
            _data = obj[e];
            _expectedData = {};
            if (undefined !== expectedData[k] && undefined !== expectedData[k][e])
            {
                _expectedData = expectedData[k][e];
            }
            if (!_.isEqual(_data, _expectedData))
            {
                err = true;
                path = _path;
                return false;
            }
        });
        if (err)
        {
            return false;
        }
    });
    if (err)
    {
        console.log('Expected :');
        console.log(JSON.stringify(_expectedData, null, 2));
        console.log('Actual :');
        console.log(JSON.stringify(_data, null, 2));
        _assert.fail(`Actual data for '${path}' does not match expected data`);
    }
}

/**
 * @param {string} message message to display
 * @param {object} obj will be displayed if defined
 */
static fail(message, obj)
{
    if (undefined !== obj)
    {
        console.log(JSON.stringify(obj, null, 2));
    }
    _assert.fail(message);
}

}
module.exports = Assert;
