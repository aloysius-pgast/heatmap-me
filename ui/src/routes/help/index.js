import { h, Component } from 'preact';

import style from './style';

export default class Help extends Component {
	// gets called when this route is navigated to
	componentDidMount() {
	}

	// gets called just before navigating away from the route
	componentWillUnmount() {
	}

	// Note: `user` comes from the URL, courtesy of our router
	render(props, state) {
		return (
			<div class={style.this}>
            <h3>Heatmap layout</h3>
            Heatmaps contain information regarding price / volume evolution for multiple periods :
            <ul>
                <li>Price evolution on the left</li>
                <li>Volume evolution on the right</li>
                <li>The smallest evolution period (ex: 5 minutes is at the bottom)</li>
                <li>The largest evolution period (ex: 5 days is at the top)</li>
            </ul>
            <img class={style.heatmap} src="assets/img/heatmap_delta.svg"/>
            <ul>
                <li><span class={style.hintNumber}>1 : </span>price / volume evolution over a 5 days period</li>
                <li><span class={style.hintNumber}>2 : </span>price / volume evolution over a 1 day period</li>
                <li><span class={style.hintNumber}>3 : </span>price / volume evolution over a 4 hours period</li>
                <li><span class={style.hintNumber}>4 : </span>price / volume evolution over a 1 hour period</li>
                <li><span class={style.hintNumber}>5 : </span>price / volume evolution over a 15 minutes period</li>
                <li><span class={style.hintNumber}>6 : </span>price / volume evolution over a 5 minutes period</li>
                <li><span class={style.hintNumber}>7 : </span>heatmap summary with current price & volume</li>
            </ul>
            <br/>
            <h3>Display values</h3>
            Clicking anywhere in the heatmap will switch between price/volume evolution & price/volume values, where for each period :
            <ul>
                <li>previous price / volume will be at the top</li>
                <li>new price / volume will be at the bottom</li>
            </ul>
            <img class={style.heatmap} src="assets/img/heatmap_values.svg"/>
            <br/>
            <h3>Display details</h3>
            Clicking on the summary will open a detailed view of the heatmap
            </div>
		);
	}
}
