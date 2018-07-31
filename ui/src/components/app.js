import { h, Component } from 'preact';
import { Router, route } from 'preact-router';
import {createHashHistory} from 'history';

import settings from '../lib/settings';
import Header from './header';

// Code-splitting is automated for routes
import Test2 from '../routes/test2';
import Heatmaps from '../routes/heatmaps';
import Settings from '../routes/settings';
import Help from '../routes/help';

export default class App extends Component {

	/** Gets fired when the route changes.
	 *	@param {Object} event		"change" event from [preact-router](http://git.io/preact-router)
	 *	@param {string} event.url	The newly routed URL
	 */
	handleRoute = e => {
        if (null === e.current)
        {
            route('/maps', true);
            return;
        }
        let state = {currentUrl:e.url};
        if (state.currentUrl.startsWith('/maps'))
        {
            state.currentUrl = '/maps';
        }
        this.setState(state);
	};

    componentWillMount() {
        document.body.className = settings.getThemeClass();
        settings.on('theme', () => {
            document.body.className = settings.getThemeClass();
            this.setState({themeTimestamp:Date.now()});
        });
        settings.on('heatmapsSortCriterion', () => {
            this.setState({heatmapsSortCriterionTimestamp:Date.now()});
        });
        settings.on('displayQuotes', () => {
            this.setState({displayQuotesTimestamp:Date.now()});
        });
    }

	render(props, state) {
		return (
			<div id="app">
				<Header themeTimestamp={this.state.themeTimestamp} currentUrl={state.currentUrl}/>
                <Router history={createHashHistory()} onChange={this.handleRoute}>
                    <Heatmaps heatmapsSortCriterionTimestamp={this.state.heatmapsSortCriterionTimestamp} displayQuotesTimestamp={this.state.displayQuotesTimestamp} path="/maps/:exchange?/:pair?"/>
                    <Settings path="/settings"/>
                    <Help path="/help"/>
                    <Test2 path="/test2" />
                </Router>
            </div>
		);
	}
}

/*
<Router onChange={this.handleRoute}>
    <Heatmaps path="/maps" exchange={state.exchange}/>
    <Heatmap path="/map" exchange={state.exchange} pair={state.pair}/>
    <Test path="/test" />
    <Test2 path="/test2" />
</Router>
*/
