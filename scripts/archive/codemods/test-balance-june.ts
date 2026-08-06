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

const acc1100 = coaAccounts.find((a: any) => a.code === '1100');
const endDate = new Date(2026, 5, 30, 23, 59, 59, 999);

const bal = getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, endDate);
console.log("Balance 1100 June:", bal);

const endDateAug = new Date(2026, 7, 31, 23, 59, 59, 999);
console.log("Balance 1100 Aug:", getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, endDateAug));
