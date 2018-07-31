When rebuilding UI, following optional environment variables can be defined :

* _publicPath_ : defaults to _/ui/_
* _wsEndpoint_ : ws uri of backend service (ex: ws://127.0.0.1:8003)
* _defaultTheme_ : defaults to _dark_
* _title_ : page title (defaults to _Heatmap Me_)
* _chartsEndpoint_ : http uri to use for charts display (ex: https://mpe-demo.crazyme.net/ui)

Example :

```
publicPath='/ui' chartsEndpoint='https://mpe-demo.crazyme.net/ui' wsEndpoint='ws://127.0.0.1:8003' defaultTheme=light title='My Heatmap' npm run build
```
