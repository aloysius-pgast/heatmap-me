const _default = require('./default');
const ui = require('./ui');

module.exports = function(app, config) {
    ui(app, config);
    _default(app, config);
};
