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

coaAccounts.forEach((acc: any) => {
    const bal = getAccountBalanceForPeriod(acc, coaAccounts, journals, null, endDate);
    if (bal > 0 || bal < 0) {
        console.log(`${acc.code} ${acc.name}: ${bal}`);
    }
});
