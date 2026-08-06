import fs from 'fs';
const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));
process.env.TZ = 'Asia/Taipei';
const { getAccountBalanceForPeriod } = require('./src/lib/decimal-utils');

journals.forEach((j: any) => {
    if (j.date && j.date.seconds) {
        j.date = new Date(j.date.seconds * 1000);
    } else if (j.date) {
        j.date = new Date(j.date);
    }
});

const prevMonthEndDate = new Date(2026, 6, 0, 23, 59, 59, 999);
const endDate = new Date(2026, 6, 31, 23, 59, 59, 999);

const acc1101 = coaAccounts.find((a: any) => a.code === '1101');
const acc1102 = coaAccounts.find((a: any) => a.code === '1102');

console.log("1101 June:", getAccountBalanceForPeriod(acc1101, coaAccounts, journals, null, prevMonthEndDate));
console.log("1102 June:", getAccountBalanceForPeriod(acc1102, coaAccounts, journals, null, prevMonthEndDate));
console.log("1101 July:", getAccountBalanceForPeriod(acc1101, coaAccounts, journals, null, endDate));
console.log("1102 July:", getAccountBalanceForPeriod(acc1102, coaAccounts, journals, null, endDate));

