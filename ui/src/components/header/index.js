import { h, Component } from 'preact';
import { Link } from 'preact-router/match';
import style from './style';

import settings from '../../lib/settings';

const list = [
    {href:'/maps',label:'Heatmaps'},
    {href:'/settings',label:'Settings'},
    {href:'/help',label:'Help'}
]

export default class Header extends Component {

    constructor(props) {
        super(props);
        this.state = {
            currentUrl:props.currentUrl
        }
    }

    componentWillReceiveProps(nextProps){
        this.setState({currentUrl:nextProps.currentUrl});
    }

    componentDidMount() {
	}

	// gets called just before navigating away from the route
	componentWillUnmount() {
	}

    render(props, state) {
        if (props.hide)
        {
            return null;
        }
        const getLink = (e) => {
            let url = undefined !== e.path ? e.path : e.href;
            if (url == state.currentUrl)
            {
                return <Link class={style.active} href={e.href}>{e.label}</Link>
            }
            return <Link href={e.href}>{e.label}</Link>
        }
        // needed to ensure previous link won't stay with :hover class after going back in history
        let navClass = null;
        if (!('ontouchstart' in document)) {
            navClass = style.noTouch;
        }
        return (
            <div class={style[settings.getThemeClass()]}>
            	<header class={style.this}>
            		<nav class={navClass}>
                        {
                            list.map((e) => {
                                return getLink(e);
                            })
                        }
            		</nav>
            	</header>
            </div>
        )
    }
}
