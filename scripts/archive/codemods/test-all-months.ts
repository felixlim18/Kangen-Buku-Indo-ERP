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

for (let month = 1; month <= 12; month++) {
    const endDate = new Date(2026, month - 1, 0, 23, 59, 59, 999);
    const bal = getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, endDate);
    console.log(`End of ${month - 1} 2026:`, bal);
    
    const endOfMonth = new Date(2026, month, 0, 23, 59, 59, 999);
    const bal2 = getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, endOfMonth);
    console.log(`End of ${month} 2026:`, bal2);
}
