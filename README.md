# heatmap-me

Keep track of price & volume evolution for various crypto currencies

## Disclaimer

This project cannot be considered in any way as trading advice.

Use it at your own risks and be careful with your money ;)

## What it does

* it subscribes to a stream on _Crypto Exchange Gateway_
* it computes price & volume evolution for multiple periods, for each pair in the stream
* it emits computed data every 60s over a ws

By default, data will be computed for following periods :

* 5 minutes
* 15 minutes
* 1 hour
* 4 hours
* 1 day
* 5 days

See [documentation in _doc_ directory](doc/ws/index.adoc) for a description of _websocket data_

## Installation

* Install dependencies

```
npm install
```

* Copy sample config

```
cp config/config.sample.json config/config.json
```

* Start service

```
node index.js
```

It should output something similar to

```
1530891675933|WARN|Starting...
1530891675956|WARN|WS server is alive on 127.0.0.1:8003
```

* Build UI

If you want to use the UI, follow these steps to build the UI before starting the service :

```
cd ui && npm install && npm run build
```

* Connect to websocket to start receiving data

You should be able to access service on _ws://127.0.0.1:8003_ using any ws client such as [wscat](https://github.com/websockets/wscat)

## Docker

A docker image is available at https://hub.docker.com/r/apendergast/heatmap-me/

* Pull image

```
docker pull apendergast/heatmap-me
```

* Run image

```
docker run --rm -p 8002:8002 -p 8003:8003 --name hm apendergast/heatmap-me
```

You should then be able to access service on _ws://127.0.0.1:8003_ using any ws client such as [wscat](https://github.com/websockets/wscat)

Following environment variables are available :

* cfg.logLevel : log level (default = _warn_)
* cfg.gateway.restEndpoint : _Crypto Exchange Gateway_ rest endpoint (default = _http://127.0.0.1:8000_)
* cfg.gateway.wsEndpoint : _Crypto Exchange Gateway_ ws endpoint (default = _ws://127.0.0.1:8001_)
* cfg.gateway.sessionId : identifier of the session to connect to on _Crypto Exchange Gateway_ (default = _mystream.heatmap-me_)
* cfg.gateway.apiKey : api key defined on _Crypto Exchange Gateway_
* cfg.computeInterval : duration in seconds between two data computation
* cfg.dataPeriods : comma-separated list of periods to compute data for (default = _xm,15m,1h,4h,1d,5d_)

If you don't want to use environment variables or want to customize config for a running container, you can create and edit *custom_config/config.json*

_Examples_ :

```
docker run --rm -p 8002:8002 -p 8003:8003 --name hm -e cfg.computeInterval='60' -e cfg.gateway.wsEndpoint='ws://172.17.0.1:8001' -e cfg.gateway.sessionId='mySessionId' apendergast/heatmap-me
```

## Dependencies

This project was made possible thanks to following projects :

* [big.js](https://www.npmjs.com/package/big.js)
* [express](https://www.npmjs.com/package/express)
* [express-ws](https://www.npmjs.com/package/express-ws)
* [joi](https://www.npmjs.com/package/joi) (for JSON schema validation)
* [lodash](https://www.npmjs.com/package/lodash)
* [mocha](https://www.npmjs.com/package/mocha) (for unit tests)
* [winston](https://www.npmjs.com/package/winston) (for logging)
* [ws](https://www.npmjs.com/package/ws)
* [crypto-exchanges-gateway](https://github.com/aloysius-pgast/crypto-exchanges-gateway) (my other project which manages the plumbing with the various exchanges)

## Donate

This project is a work in progress. If you find it useful, you might consider a little donation ;)

BTC: `163Bu8qMSDoHc1sCatcnyZcpm38Z6PWf6E`

ETH: `0xDEBBEEB9624449D7f2c87497F21722b1731D42a8`

NEO/GAS: `AaQ5xJt4v8GunVchTJXur8WtM8ksprnxRZ`
