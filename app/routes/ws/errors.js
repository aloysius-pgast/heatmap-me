"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');

/**
 * Default error handler
 */

module.exports = function(app, config) {

// handle authentication
app.use(function (err, req, res, next) {
    if (undefined !== err.stack)
    {
        logger.error(err.stack);
    }
    else
    {
        logger.error(err);
    }
    // nothing more to do, we're dealing with a WS
});

};
