import EventEmitter from 'wolfy87-eventemitter/EventEmitter';

let hasLocalStorage = true;
// check if localStorage is supported
if (undefined === window.localStorage)
{
    hasLocalStorage = false;
}
else
{
    // try to set dummy data
    let timestamp = Date.now();
    try
    {
        window.localStorage.setItem('dummy', timestamp);
    }
    // if private mode is enabled, we should have an exception
    catch(e)
    {
        hasLocalStorage = false;
    }
}

const supportedThemes = ['dark', 'light', 'neo'];
const supportedHeatmapsSortCriteria = [
    'exchange-pair',
    'pair-price',
    'pair-volume',
    'price-evolution-smallest-period',
    'price-evolution-largest-period',
    'volume-evolution-smallest-period',
    'volume-evolution-largest-period'
];

class Settings extends EventEmitter
{

constructor()
{
    super();
    this._defaultTheme = 'dark';
    this._displayQuotes = true;
    this._heatmapsSortCriterion = 'pair-price';
}

setTheme(theme)
{
    let changed = false;
    if (this._theme !== theme)
    {
        changed = true;
    }
    this._theme = theme;
    if (changed)
    {
        this.emit('theme', theme);
        this._store('settings:theme', theme);
    }
}

setDefaultTheme(theme)
{
    if (-1 != supportedThemes.indexOf(theme))
    {
        this._defaultTheme = theme;
    }
    else
    {
        console.warn(`Cannot use '${theme}' as default theme (unsupported)`);
    }
}

getTheme()
{
    return this._theme;
}

getThemeClass()
{
    return `theme${this._theme}`;
}

shouldDisplayQuotes()
{
    return this._displayQuotes;
}

enableQuotes(flag)
{
    let changed = false;
    if (flag != this._displayQuotes)
    {
        changed = true;
    }
    this._displayQuotes = flag;
    if (changed)
    {
        this.emit('displayQuotes', flag);
        this._store('settings:displayQuotes', flag);
    }
}

getheatmapsSortCriterion()
{
    return this._heatmapsSortCriterion;
}

setHeatmapsSortCriterion(id)
{
    let changed = false;
    if (id != this._heatmapsSortCriterion)
    {
        changed = true;
    }
    this._heatmapsSortCriterion = id;
    if (changed)
    {
        this.emit('heatmapsSortCriterion', id);
        this._store('settings:heatmapsSortCriterion', id);
    }
}

load(cb)
{
    this._theme = this._defaultTheme;
    for (var i = 0; i < window.localStorage.length; i++)
    {
        let key = window.localStorage.key(i);
        if (!key.startsWith('settings:'))
        {
            continue;
        }
        let value = window.localStorage.getItem(key);
        // entry was removed (not supposed to happen)
        if (null === value)
        {
            continue;
        }
        let property = key.substr(9);
        switch (property)
        {
            case 'theme':
                if (-1 != supportedThemes.indexOf(value))
                {
                    this._theme = value;
                }
                else
                {
                    console.warn(`Cannot use '${value}' as theme (unsupported)`);
                }
                break;
            case 'heatmapsSortCriterion':
                if (-1 != supportedHeatmapsSortCriteria.indexOf(value))
                {
                    this._heatmapsSortCriterion = value;
                }
                else
                {
                    console.warn(`Cannot use '${value}' as sort criterion (unsupported)`);
                }
                break;
            case 'displayQuotes':
                this._displayQuotes = 'true' == value;
                break;
            default:
                break;
        }
    }
    if (undefined !== cb)
    {
        cb();
    }
}

_store(key, value)
{
    if (!hasLocalStorage)
    {
        return;
    }
    window.localStorage.setItem(key, value);
}

}

export default new Settings();
