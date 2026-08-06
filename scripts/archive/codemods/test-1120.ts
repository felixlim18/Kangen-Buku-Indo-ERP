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
const acc1120 = coaAccounts.find((a: any) => a.code === '1120');

console.log("1120 July:", getAccountBalanceForPeriod(acc1120, coaAccounts, journals, null, endDate));
