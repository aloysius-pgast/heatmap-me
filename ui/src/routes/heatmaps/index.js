import { h, Component } from 'preact';
import cx from 'classnames';
import { route } from 'preact-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { faArrowDown } from '@fortawesome/free-solid-svg-icons';

import dataManager from '../../lib/data-manager';
import settings from '../../lib/settings';
import heatmapHelper from '../../lib/heatmap-helper';
import quotesHelper from '../../lib/quotes-helper';

import style from './style';

export default class Heatmaps extends Component {
    constructor(props) {
        super(props);
        this.state = {
            exchange:'',
            maps:{},
            map:{
                exchange:'',
                pair:'',
                data:null
            }
        }
        if ('' !== props.exchange)
        {
            if ('' == props.pair)
            {
                this.state.exchange = props.exchange;
            }
            else
            {
                this.state.map.exchange = props.exchange;
                this.state.map.pair = props.pair;
            }
        }
        this._data = [];
        this._quote = null;
    }

    _toggleMap(ev, e) {
        ev.stopPropagation();
        this.setState((prevState, props) => {
            let maps = prevState.maps;
            // show values instead of delta
            if (undefined === prevState.maps[e.id] || 'delta' == prevState.maps[e.id])
            {
                maps[e.id] = 'values';
            }
            // show delta
            else
            {
                maps[e.id] = 'delta';
            }
            return {maps:maps}
        });
    }

    _showMap(ev, e) {
        ev.stopPropagation();
        this.setState({map:{exchange:e.exchange, pair:e.pair, data:e}});
    }

    _closeMap(ev) {
        ev.stopPropagation();
        this.setState({map:{exchange:'', pair:'', data:null}});
    }

    _getMapData(data, exchange, pair) {
        let mapData = null;
        data.forEach((e) => {
            if (exchange == e.exchange && pair == e.pair)
            {
                mapData = e;
                return false;
            }
        });
        return mapData;
    }

    _filterData(data, exchange)
    {
        let filteredData = [];
        data.forEach((e) => {
            if (e.exchange != exchange && e.currency != exchange)
            {
                return;
            }
            filteredData.push(e);
        });
        return filteredData;
    }

    componentWillMount() {
        this._data = dataManager.getSortedData();
        if ('' != this.state.exchange && '' == this.state.map.pair)
        {
            this._data = this._filterData(this._data, this.state.exchange);
        }
        this._quote = quotesHelper.getQuote(this._data);
        this.setState((prevState, props) => {
            let map = prevState.map;
            // we're supposed to retrieve a single map
            if ('' != map.exchange && '' != map.pair)
            {
                map.data = this._getMapData(this._data, map.exchange, map.pair);
                if (null === map.data)
                {
                    console.warn(`No data for '${map.exchange}|${map.pair}', all maps will be displayed`);
                    map.exchange = '';
                    map.pair = '';
                }
            }
            return {map:map};
        });
        dataManager.on('data', (data) => {
            this._data = data;
            if ('' != this.state.exchange && '' == this.state.map.pair)
            {
                this._data = this._filterData(this._data, this.state.exchange);
            }
            this.setState((prevState, props) => {
                let map = prevState.map;
                // we're supposed to retrieve a single map
                if ('' != map.exchange && '' != map.pair)
                {
                    map.data = this._getMapData(this._data, map.exchange, map.pair);
                    if (null === map.data)
                    {
                        console.warn(`No data for '${map.exchange}|${map.pair}', all maps will be displayed`);
                        map.exchange = '';
                        map.pair = '';
                    }
                }
                return {timestamp:dataManager.getTimestamp(), map:map};
            });
        });
    }

	// gets called when this route is navigated to
	componentDidMount() {
	}

	// gets called just before navigating away from the route
	componentWillUnmount() {
        dataManager.removeAllListeners();
	}

    componentWillReceiveProps(nextProps){
        this._data = dataManager.getSortedData();
        let state = {exchange:'',maps:{},map:{exchange:'',pair:'',data:null}};
        if ('' !== nextProps.exchange)
        {
            if ('' == nextProps.pair)
            {
                state.exchange = nextProps.exchange;
                this._data = this._filterData(this._data, state.exchange);
            }
            else
            {
                state.map.exchange = nextProps.exchange;
                state.map.pair = nextProps.pair;
                state.map.data = this._getMapData(this._data, state.map.exchange, state.map.pair);
                if (null === state.map.data)
                {
                    console.warn(`No data for '${state.map.exchange}|${state.map.pair}', all maps will be displayed`);
                    state.map.exchange = '';
                    state.map.pair = '';
                }
            }
        }
        if ('' != state.exchange)
        {
            this._data = this._filterData(this._data, state.exchange);
        }
        this.setState(state);
    }

	// Note: `user` comes from the URL, courtesy of our router
	render(props, state) {

        const quote = () => {
            if (!settings.shouldDisplayQuotes() || null === this._quote)
            {
                return null;
            }
            return (
                <div class={style.quote}>
                    <q dangerouslySetInnerHTML={{__html: this._quote}}/>
                </div>
            )
        }
        const warningNoData = () => {
            if (0 != this._data.length)
            {
                return null;
            }
            return (
                <div class={style.warning}>
                    Houston ? We don't have any data yet. All right Houston, we'll just keep waiting...
                </div>
            )
        }

        const getFloat = (n, withSign) => {
            if (null === n)
            {
                return '?';
            }
            if (undefined === withSign)
            {
                withSign = false;
            }
            let sign = '';
            if (withSign && n > 0)
            {
                sign = '+';
            }
            return `${sign}${n.toFixed(8)}`;
        }

        const formatFloat = (n, withSign) => {
            if (null === n)
            {
                return '?';
            }
            if (undefined === withSign)
            {
                withSign = false;
            }
            let sign = '';
            if (withSign && n > 0)
            {
                sign = '+';
            }
            let value;
            if (n < 0)
            {
                if (n <= -1)
                {
                    value = n.toPrecision(4);
                }
                else if (n >= -0.00001)
                {
                    value = n.toExponential(3);
                }
                else
                {
                    value = n.toFixed(6);
                }
            }
            else if (n > 0)
            {
                if (n >= 1)
                {
                    value = `${sign}${n.toPrecision(4)}`;
                }
                else if (n <= 0.00001)
                {
                    value = `${sign}${n.toExponential(3)}`;
                }
                else
                {
                    value = `${sign}${n.toFixed(6)}`;
                }
            }
            else
            {
                value = '0';
            }
            return value;
        }
        const formatPercent = (n) => {
            if (null === n)
            {
                return '?';
            }
            if (n < 0)
            {
                if (n <= -1)
                {
                    if (n <= -100)
                    {
                        if (n <= -1000)
                        {
                            return `${parseInt(n)}%`;
                        }
                        return `${n.toFixed(1)}%`;
                    }
                    return `${n.toFixed(2)}%`;
                }
                return `${n.toFixed(4)}%`;
            }
            else if (n > 0)
            {
                if (n >= 1)
                {
                    if (n >= 100)
                    {
                        if (n >= 1000)
                        {
                            return `+${parseInt(n)}%`;
                        }
                        return `+${n.toFixed(1)}%`;
                    }
                    return `+${n.toFixed(2)}%`;
                }
                return `+${n.toFixed(4)}%`;
            }
            return '0.00%';
        }

        const faIcon = (delta) => {
            if (0 == delta)
            {
                return null;
            }
            if (delta > 0)
            {
                return <FontAwesomeIcon style={{marginLeft:'5px',fontSize:'0.8rem'}} icon={faArrowUp}/>
            }
            return <FontAwesomeIcon style={{marginLeft:'5px',fontSize:'0.8rem'}} icon={faArrowDown}/>
        }

        //-- heatmaps list
        const heatmapPeriod = (id, e, isFirst) => {
            let periodClass = style.heatmapPeriod;
            if (isFirst)
            {
                periodClass = style.heatmapFirstPeriod;
            }
            // show delta
            if (undefined === state.maps[id] || 'delta' == state.maps[id])
            {
                return (
                    <div class={periodClass}>
                        <div class={style.heatmapPeriodPrice} style={heatmapHelper.getPriceStyle(e.delta.pricePercent)}>
                            <div class={style.heatmapPeriodPreviousValue}>{formatFloat(e.delta.price, true)}</div>
                            <div>{formatPercent(e.delta.pricePercent)}</div>
                        </div>
                        <div class={style.heatmapPeriodVolume} style={heatmapHelper.getVolumeStyle(e.delta.volumePercent)}>
                            <div class={style.heatmapPeriodPreviousValue}>{formatFloat(e.delta.volume, true)}</div>
                            <div>{formatPercent(e.delta.volumePercent)}</div>
                        </div>
                    </div>
                )
            }
            // show values
            return (
                <div class={periodClass}>
                    <div class={style.heatmapPeriodPrice} style={heatmapHelper.getPriceStyle(e.delta.pricePercent)}>
                        <div class={style.heatmapPeriodPreviousValue}>{formatFloat(e.previous.price)}</div>
                        <div>{formatFloat(e.last.price)}</div>
                    </div>
                    <div class={style.heatmapPeriodVolume} style={heatmapHelper.getVolumeStyle(e.delta.volumePercent)}>
                        <div class={style.heatmapPeriodPreviousValue}>{formatFloat(e.previous.volume)}</div>
                        <div>{formatFloat(e.last.volume)}</div>
                    </div>
                </div>
            )
        }

        const heatmapSummary = (e) => {
            return (
                <div onClick={(ev) => this._showMap(ev, e)} class={style.heatmapSummary}>
                    <div class={style.heatmapSummaryRow}>{e.exchange} / <span class={style.heatmapSummaryPair}>{e.pair}</span></div>
                    <div class={style.heatmapSummaryRow}>Price: {e.current.last.price}{faIcon(e.current.delta.price)}</div>
                    <div class={style.heatmapSummaryRow}>Volume: {e.current.last.volume}{faIcon(e.current.delta.volume)}</div>
                </div>
            )
        }
        const heatmap = (e) => {
            return (
                <div id={e.id} class={style.heatmap}>
                    <div onClick={(ev) => this._toggleMap(ev, e)}>
                        {
                            e.data.map((d, index) => {
                                return heatmapPeriod(e.id, d, 0 == index)
                            })
                        }
                    </div>
                    {heatmapSummary(e)}
                </div>
            )
        }
        const heatmaps = () => {
            if (null !== state.map.data)
            {
                return null;
            }
            return (
                <div>
                    {quote()}
                    {warningNoData()}
                    {
                        this._data.map((e) => {
                            return heatmap(e)
                        })
                    }
                </div>
            )
        }


        //-- detailed heatmap
        // TODO
        const detailedHeatmapSummary = (e) => {
            return (
                <div class={style.detailedHeatmapSummary} onClick={(ev) => this._closeMap(ev)}>
                    <div class={style.detailedHeatmapSummaryRow}>{e.exchange} / <span class={style.detailedHeatmapSummaryPair}>{e.pair}</span></div>
                    <div class={style.detailedHeatmapSummaryRow}>Price: {e.current.last.price}{faIcon(e.current.delta.price)}</div>
                    <div class={style.detailedHeatmapSummaryRow}>Volume: {e.current.last.volume}{faIcon(e.current.delta.volume)}</div>
                </div>
            )
        }
        const detailedHeatmapPeriod = (id, e, isFirst) => {
            let periodClass = style.detailedHeatmapPeriod;
            if (isFirst)
            {
                periodClass = style.detailedHeatmapFirstPeriod;
            }
            // show values
            return (
                <div class={periodClass}>
                    <div class={style.detailedHeatmapPeriodPrice} style={heatmapHelper.getPriceStyle(e.delta.pricePercent)}>
                        <div class={style.detailedHeatmapPeriodId}>{e.period}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.previous.fromTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.previous.toTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodPreviousValue}>{getFloat(e.previous.price)}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.last.fromTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.last.toTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodLastValue}>{getFloat(e.last.price)}</div>
                        <div>{getFloat(e.delta.price, true)}</div>
                        <div>{formatPercent(e.delta.pricePercent)}</div>
                    </div>
                    <div class={style.detailedHeatmapPeriodVolume} style={heatmapHelper.getVolumeStyle(e.delta.volumePercent)}>
                        <div class={style.detailedHeatmapPeriodId}>{e.period}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.previous.fromTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.previous.toTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodPreviousValue}>{getFloat(e.previous.volume)}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.last.fromTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodTimestamp}>{heatmapHelper.formatDateTime(e.last.toTimestamp * 1000)}</div>
                        <div class={style.detailedHeatmapPeriodLastValue}>{getFloat(e.last.volume)}</div>
                        <div>{getFloat(e.delta.volume, true)}</div>
                        <div>{formatPercent(e.delta.volumePercent)}</div>
                    </div>
                </div>
            )
        }
        const detailedHeatmap = () => {
            if (null == state.map.data)
            {
                return null;
            }
            return (
                <div id={'detailed-' + state.map.data.id} class={style.detailedHeatmap}>
                    <div onClick={(ev) => this._closeMap(ev)}>
                        {
                            state.map.data.data.map((d, index) => {
                                return detailedHeatmapPeriod(state.map.data.id, d, 0 == index)
                            })
                        }
                    </div>
                    {detailedHeatmapSummary(state.map.data)}
                </div>
            )
        }
        return (
			<div className={cx([style.this, style[settings.getThemeClass()]])}>
            {heatmaps()}
            {detailedHeatmap()}
            </div>
		);
	}
}
