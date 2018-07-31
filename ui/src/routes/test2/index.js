import { h, Component } from 'preact';
import style from './style';

export default class Test2 extends Component {
	// gets called when this route is navigated to
	componentDidMount() {
	}

	// gets called just before navigating away from the route
	componentWillUnmount() {
		clearInterval(this.timer);
	}

	// Note: `user` comes from the URL, courtesy of our router
	render(props, state) {
		return (
			<div class={style.test2}>
            zem bubu<br/>
            <br/><br/><br/><br/><br/><br/>
            aaa
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            <br/><br/><br/><br/><br/>
            nnnnnnnnnn
            </div>
		);
	}
}
