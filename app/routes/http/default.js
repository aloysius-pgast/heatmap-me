"use strict";
const url = require('url');
const logger = require('winston');

/**
 * Default route
 */

module.exports = function(app, config) {

app.use(function (req, res) {
    if ('OPTIONS' == req.method)
    {
        res.status(200).end();
        return;
    }
    let u = url.parse(req.url);
    if (u.pathname.startsWith('/favicon'))
    {
        return res.status(404).end();
    }
    logger.warn("Unknown route %s %s", req.method, u.pathname);
    return res.status(404).end();
});

};
