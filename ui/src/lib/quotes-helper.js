const quotes = {
    generic:[
        "TIP of the day : don't trade if you suffer from colour blindness",
        "TIP of the day : buy the rumour and <s>sell the news</s> HODL"
    ],
    byCurrency:{
        'NEO':[
            "Cause we all know that NEO will go to da moon at some point. Might not be today though",
            "Some people say that USA never landed on da moon in '69. Hopefully there will be no denying when NEO does",
            "It's good to know that our FUNDS are SAFU, but it's better when NEO is aiming at the sky",
            "Don't count your NEO before they hatch (seriously, don't)",
            "I would easily trade THREE LIFETIMES OF BLESSINGS for a bit of green",
            "Stay tuned, 'cause soon, there will be an announcement about the announcement",
            "Send me 1 NEO and i will send you ... nothing back"
        ]
    }
}

class QuotesHelper
{

constructor() {}

getQuote(data)
{
    let list = [];
    quotes.generic.forEach ((q) => {
        list.push(q);
    });
    data.forEach((e) => {
        let splittedPair = e.pair.split('-');
        if (undefined !== quotes.byCurrency[splittedPair[1]])
        {
            quotes.byCurrency[splittedPair[1]].forEach((q) => {
                list.push(q);
            });
        }
    });
    if (0 == list.length)
    {
        return null;
    }
    let index = Math.floor(Math.random() * list.length);
    return list[index];
}

}

export default new QuotesHelper();
