const {format, parseISO, parse} = require('date-fns')

console.time("dbsave");
const a = /\w{3} \d{2}, \d{4}/.exec('Jan 01, 2020 00:00:00')
if (a) {
    console.log(a[0])
    console.log(Date.parse(String(a[0])))
    console.log(Date.parse('Jan 01, 2020'))
    console.log(Date.parse('2020-01-01'))
}

console.timeLog("dbsave", 'inicio');
console.log(new Date('2020-09-18T03:00:00.000Z'))
console.log(new Date('16/09/2020 17:22:59 PM UTC'))
console.log(new Date(parse('16/09/2020 17:22:59', 'dd/MM/yyyy HH:mm:ss', new Date()).setHours(0,0,0)).toDateString())
console.log(new Date(parse('Sep 18, 2020, 1:14:38 PM', 'LLL dd, yyyy, hh:mm:ss a', new Date()).setHours(0,0,0)).toDateString())

console.timeLog("dbsave", 'teste');