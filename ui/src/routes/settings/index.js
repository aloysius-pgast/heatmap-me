import { h, Component } from 'preact';
import cx from 'classnames';
import Radio from 'preact-material-components/Radio';
import FormField from 'preact-material-components/FormField';

import settings from '../../lib/settings';

import 'preact-material-components/FormField/style.css';
import 'preact-material-components/Radio/style.css';

import style from './style';

const themes = [
    {name:'Dark', id:'dark'},
    {name:'Light', id:'light'},
    {name:'Neo', id:'neo'}
]

const heatmapsSortCriteria = [
    {
        name:'Exchange/pair',
        id:'exchange-pair'
    },
    {
        name:'Pair/Price',
        id:'pair-price'
    },
    {
        name:'Pair/Volume',
        id:'pair-volume'
    },
    {
        name:'Price evolution (%) over the smallest period',
        id:'price-evolution-smallest-period'
    },
    {
        name:'Price evolution over (%) the largest period',
        id:'price-evolution-largest-period'
    },
    {
        name:'Volume evolution over (%) the smallest period',
        id:'volume-evolution-smallest-period'
    },
    {
        name:'Volume evolution over (%) the largest period',
        id:'volume-evolution-largest-period'
    }
]

export default class Settings extends Component {

    constructor(props) {
        super(props);
        this.state = {
            theme:settings.getTheme(),
            displayQuotes:settings.shouldDisplayQuotes(),
            heatmapsSortCriterion:settings.getheatmapsSortCriterion()
        }
    }

    _selectTheme(theme) {
        this.setState({theme:theme.id}, () => {
            settings.setTheme(theme.id);
        });
    }

    _enableQuotes(flag) {
        this.setState({displayQuotes:flag}, () => {
            settings.enableQuotes(flag);
        });
    }

    _selectHeatmapsSortCriterion(entry) {
        this.setState({heatmapsSortCriterion:entry.id}, () => {
            settings.setHeatmapsSortCriterion(entry.id);
        });
    }

	componentDidMount() {}

	componentWillUnmount() {}

	render(props, state) {
        return (
            <div className={cx([style.this, style[settings.getThemeClass()]])}>

                <div class={style.section}>
                    <label class={style.sectionHeader}><strong>Display quotes</strong></label><br/>
                    <FormField>
                      <Radio id="displayQuotes-on" value={true} name="displayQuotes" checked={state.displayQuotes} onClick={this._enableQuotes.bind(this, true)} />
                      <label for="displayQuotes-on">Yes</label>
                    </FormField>
                    <FormField>
                      <Radio id="displayQuotes-off" value={false} name="displayQuotes" checked={!state.displayQuotes} onClick={this._enableQuotes.bind(this, false)} />
                      <label for="displayQuotes-off">No</label>
                    </FormField>
                </div>

                <div class={style.section}>
                    <label class={style.sectionHeader}><strong>Choose themes</strong></label><br/>
                    {
                        themes.map((e, index) => {
                            let id = `themes-${index}`;
                            return (
                                <FormField>
                                  <Radio id={id} value={e.id} name="themes" checked={e.id == state.theme} onClick={this._selectTheme.bind(this, e)} />
                                  <label for={id}>{e.name}</label>
                                </FormField>
                            )
                        })
                    }
                </div>

                <div class={style.section}>
                    <label class={style.sectionHeader}><strong>Sort maps by</strong></label><br/>
                    {
                        heatmapsSortCriteria.map((e, index) => {
                            let id = `heatmapsSortCriterion-${index}`;
                            return (
                                <div>
                                    <FormField>
                                        <Radio id={id} value={e.id} name="heatmapsSortCriterion" checked={e.id == state.heatmapsSortCriterion} onClick={this._selectHeatmapsSortCriterion.bind(this, e)} />
                                        <label for={id}>{e.name}</label>
                                    </FormField>
                                    <br/>
                                </div>
                            )
                        })
                    }
                </div>
            </div>
		);
	}
}
