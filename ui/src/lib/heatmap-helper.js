class HeatmapHelper
{

constructor() {}

formatTime(timestamp)
{
    let d = new Date(timestamp);
    return this._formatTime(d);
}

formatDate(timestamp)
{
    let d = new Date(timestamp);
    return this._formatDate(d);
}

formatDateTime(timestamp)
{
    let d = new Date(timestamp);
    return this._formatDate(d) + ' ' + this._formatTime(d);
}

_formatTime(date)
{
    let h = date.getHours();
    if (h < 10)
    {
        h = '0' + h;
    }
    let m = date.getMinutes();
    if (m < 10)
    {
        m = '0' + m;
    }
    let s = date.getSeconds();
    if (s < 10)
    {
        s = '0' + s;
    }
    return '' + h + ':' + m + ':' + s;
}

_formatDate(date)
{
    let d = date.getDate();
    if (d < 10)
    {
        d = '0' + d;
    }
    let m = date.getMonth() + 1;
    if (m < 10)
    {
        m = '0' + m;
    }
    return '' + d + '/' + m + '/' + date.getFullYear();
}

_getStyle(p, maxPercent)
{
    if (null === p)
    {
        return {
            color:'#ffffff',
            backgroundColor:'#737373'
        }
    }
    let style = {
        color:'#000000',
        backgroundColor:'#ffffff'
    }
    if (p > 0)
    {
        let percent = (p > maxPercent ? maxPercent : p) / maxPercent;
        let colorPercent = 80 - percent * (80 - 20);
        style.backgroundColor = `hsl(90,100%,${colorPercent}%)`;
        style.color = colorPercent <= 30 ? '#ffffff' : '#000000';
    }
    if (p < 0)
    {
        let percent = (p < -maxPercent ? maxPercent : -p) / maxPercent;
        let colorPercent = 85 - percent * (85 - 25);
        style.backgroundColor = `hsl(0,100%,${colorPercent}%)`;
        style.color = colorPercent <= 65 ? '#ffffff' : '#000000';
    }
    return style;
}

getPriceStyle(p)
{
    return this._getStyle(p, 30);
}

getVolumeStyle (p)
{
    return this._getStyle(p, 100);
}

}

export default new HeatmapHelper();
