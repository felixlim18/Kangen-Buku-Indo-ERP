import fs from 'fs';

const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

// We want to simulate the user's timezone: UTC+8
// To do this, we'll manually parse the dates and adjust to UTC+8.
journals.forEach((j: any) => {
    if (j.date && j.date.seconds) {
        // Date object in UTC
        j.utcDate = new Date(j.date.seconds * 1000);
        // User local time (UTC+8)
        j.userLocalTime = new Date(j.utcDate.getTime() + 8 * 3600 * 1000);
    } else if (j.date) {
        j.utcDate = new Date(j.date);
        j.userLocalTime = new Date(j.utcDate.getTime() + 8 * 3600 * 1000);
    }
});

function isUpTo(userLocalTime: Date, year: number, month: number, day: number, h: number, m: number, s: number) {
    const compare = new Date(Date.UTC(year, month, day, h, m, s, 999));
    return userLocalTime.getTime() <= compare.getTime();
}

function isBetween(userLocalTime: Date, y1: number, m1: number, d1: number, y2: number, m2: number, d2: number) {
    const start = new Date(Date.UTC(y1, m1, d1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y2, m2, d2, 23, 59, 59, 999));
    return userLocalTime.getTime() >= start.getTime() && userLocalTime.getTime() <= end.getTime();
}

// User runs report for July 2026.
// prevMonthEndDate in user local time: June 30 2026, 23:59:59
// endDate in user local time: July 31 2026, 23:59:59
let saldoAwalKasCents = 0;
let actual1100Cents = 0;
let kenaikanKasCents = 0;

const leafCashAccounts = ['1101', '1102'];

journals.forEach((j: any) => {
    let noDate = !j.date;
    
    let isPrev = noDate || isUpTo(j.userLocalTime, 2026, 5, 30, 23, 59, 59);
    let isEnd = noDate || isUpTo(j.userLocalTime, 2026, 6, 31, 23, 59, 59);
    let isMonth = !noDate && isBetween(j.userLocalTime, 2026, 6, 1, 2026, 6, 31);
    
    let net = 0;
    if (j.lines) {
        j.lines.forEach((l: any) => {
            if (leafCashAccounts.includes(l.accountCode)) {
                net += (l.debit || 0) - (l.credit || 0);
            }
        });
    }
    
    if (isPrev) saldoAwalKasCents += net;
    if (isEnd) actual1100Cents += net;
    if (isMonth) kenaikanKasCents += net;
});

console.log("saldoAwalKas:", saldoAwalKasCents / 100);
console.log("kenaikanKas:", kenaikanKasCents / 100);
console.log("saldoAkhirKas:", (saldoAwalKasCents + kenaikanKasCents) / 100);
console.log("actual1100Balance:", actual1100Cents / 100);

