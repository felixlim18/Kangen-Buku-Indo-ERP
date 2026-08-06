import fs from 'fs';
import { getAccountBalanceForPeriod } from './src/lib/decimal-utils';

const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

journals.forEach((j: any) => {
    if (j.date && j.date.seconds) {
        j.date = new Date(j.date.seconds * 1000);
    } else if (j.date) {
        j.date = new Date(j.date);
    }
});

const endDate = new Date(2026, 6, 31, 23, 59, 59, 999);
const prevMonthEndDate = new Date(2026, 6, 0, 23, 59, 59, 999);

const acc1101 = coaAccounts.find((a: any) => a.code === '1101');
const acc1102 = coaAccounts.find((a: any) => a.code === '1102');

let saldoAwal = getAccountBalanceForPeriod(acc1101, coaAccounts, journals, null, prevMonthEndDate) +
                getAccountBalanceForPeriod(acc1102, coaAccounts, journals, null, prevMonthEndDate);

let actual = getAccountBalanceForPeriod(acc1101, coaAccounts, journals, null, endDate) +
             getAccountBalanceForPeriod(acc1102, coaAccounts, journals, null, endDate);

console.log("saldoAwal:", saldoAwal);
console.log("actual:", actual);
