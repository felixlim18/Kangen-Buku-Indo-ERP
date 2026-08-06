import fs from 'fs';

const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

// We want to simulate the exact logic of CashFlowReport in UTC+8.
// Since getAccountBalanceForPeriod uses the local Date object, 
// if the Node environment is forced to UTC+8, we should get exactly what the user sees.

process.env.TZ = 'Asia/Taipei';

const { getAccountBalanceForPeriod } = require('./src/lib/decimal-utils');

journals.forEach((j: any) => {
    if (j.date && j.date.seconds) {
        j.date = new Date(j.date.seconds * 1000);
    } else if (j.date) {
        j.date = new Date(j.date);
    }
});

const endDate = new Date(2026, 6, 31, 23, 59, 59, 999);
const prevMonthEndDate = new Date(2026, 6, 0, 23, 59, 59, 999);

const acc1100 = coaAccounts.find((a: any) => a.code === '1100');
const acc1101 = coaAccounts.find((a: any) => a.code === '1101');
const acc1102 = coaAccounts.find((a: any) => a.code === '1102');

let saldoAwal = getAccountBalanceForPeriod(acc1101, coaAccounts, journals, null, prevMonthEndDate) +
                getAccountBalanceForPeriod(acc1102, coaAccounts, journals, null, prevMonthEndDate);

let actual = getAccountBalanceForPeriod(acc1101, coaAccounts, journals, null, endDate) +
             getAccountBalanceForPeriod(acc1102, coaAccounts, journals, null, endDate);

let neraca1100 = getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, endDate);

console.log("TZ:", process.env.TZ);
console.log("saldoAwal:", saldoAwal);
console.log("actual:", actual);
console.log("neraca1100:", neraca1100);

