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

const cashAccounts = coaAccounts.filter((a: any) => 
  (a.systemKey?.startsWith('cash') || a.code === '1101' || a.code === '1102' || a.name.toLowerCase().includes('cash'))
);
const leafCashAccounts = cashAccounts.filter((a: any) => {
    return !coaAccounts.some((child: any) => child.parentAccount === `${a.code} - ${a.name}`);
});

console.log("leafCashAccounts:");
leafCashAccounts.forEach((a: any) => console.log(a.code, a.name));

const prevMonthEndDate = new Date(2026, 6, 0, 23, 59, 59, 999);
let saldoAwalKas = 0;
leafCashAccounts.forEach((acc: any) => {
  saldoAwalKas += getAccountBalanceForPeriod(acc, coaAccounts, journals, null, prevMonthEndDate);
});

console.log("saldoAwalKas:", saldoAwalKas);
