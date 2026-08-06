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

const endDate = new Date(2026, 7, 31, 23, 59, 59, 999);
const prevMonthEndDate = new Date(2026, 7, 0, 23, 59, 59, 999);

const acc1100 = coaAccounts.find((a: any) => a.code === '1100');

let saldoAwal = getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, prevMonthEndDate);
let actual = getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, endDate);

console.log("August saldoAwal:", saldoAwal);
console.log("August actual:", actual);
