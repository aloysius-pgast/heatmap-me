"use strict";
const logger = require('winston');
const express = require('express');

/**
 * UI routes
 */
module.exports = function(app, config) {

if (!config.ui.enabled)
{
    return;
}

app.get('/', (req, res) => {
    res.redirect('/ui');
});

app.use('/ui', express.static('ui/build'));

// default route for ui
app.get("/ui/*", (req, res) => {
    res.status(404).end();
});

};
