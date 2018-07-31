const errors = require('./errors');
const _default = require('./default');
const main = require('./main');

module.exports = function(app, config) {
    main(app, config);
    _default(app, config);
    errors(app, config);
};
