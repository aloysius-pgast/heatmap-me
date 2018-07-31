import './style';
import App from './components/app';
import dataManager from './lib/data-manager';
import settings from './lib/settings';

if (!Object.prototype.forEach) {
	Object.defineProperty(Object.prototype, 'forEach', {
		value: function (callback, thisArg) {
			if (this == null) {
				throw new TypeError('Not an object');
			}
			thisArg = thisArg;
			for (var key in this) {
				if (this.hasOwnProperty(key)) {
					callback.call(thisArg, this[key], key, this);
				}
			}
		}
	});
}

// variable will be replaced by webpack
let wsEndpoint = process.env.wsEndpoint;
if (undefined === wsEndpoint)
{
    if ('http:' ==  window.location.protocol)
    {
        wsEndpoint = 'ws://' + window.location.hostname + ':8003/';
    }
    else
    {
        wsEndpoint = 'wss://' + window.location.hostname + ':8003/';
    }
}

// variable will be replaced by webpack
let defaultTheme = process.env.defaultTheme;
if (undefined !== defaultTheme)
{
    settings.setDefaultTheme(defaultTheme);
}
// load settings
settings.load(() => {
    // connect to server
    dataManager.initialize(wsEndpoint);
    dataManager.connect();
})

export default App;
