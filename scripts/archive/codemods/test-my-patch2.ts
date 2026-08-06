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

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
}

const cashAccounts = coaAccounts.filter((a: any) => 
  (a.systemKey?.startsWith('cash') || a.code === '1101' || a.code === '1102' || a.name.toLowerCase().includes('cash'))
);
const leafCashAccounts = cashAccounts.filter((a: any) => {
    return !coaAccounts.some((child: any) => child.parentAccount === `${a.code} - ${a.name}`);
});

const prevMonthEndDate = new Date(2026, 6, 0, 23, 59, 59, 999);
const startDate = new Date(2026, 6, 1, 0, 0, 0, 0);
const endDate = new Date(2026, 6, 31, 23, 59, 59, 999);

let saldoAwalKas = 0;
leafCashAccounts.forEach((acc: any) => {
  saldoAwalKas += getAccountBalanceForPeriod(acc, coaAccounts, journals, null, prevMonthEndDate);
});

const monthJournals = journals.filter((entry: any) => {
  if (!entry.date) return false;
  const d = parseToDate(entry.date);
  return d >= startDate && d <= endDate;
});

let kenaikanKasBersih = 0;
monthJournals.forEach((entry: any) => {
  const cashLines = entry.lines.filter((l: any) => leafCashAccounts.some((a: any) => a.code === l.accountCode));
  if (!cashLines.length) return;

  let netCashMovementCents = 0;
  cashLines.forEach((cl: any) => {
    netCashMovementCents += (cl.debit || 0) - (cl.credit || 0);
  });
  
  kenaikanKasBersih += netCashMovementCents / 100;
});

console.log("saldoAwalKas:", saldoAwalKas);
console.log("kenaikanKasBersih:", kenaikanKasBersih);
console.log("saldoAkhirKas:", saldoAwalKas + kenaikanKasBersih);

let actual1100Balance = 0;
leafCashAccounts.forEach((acc: any) => {
  actual1100Balance += getAccountBalanceForPeriod(acc, coaAccounts, journals, null, endDate);
});
console.log("actual1100Balance:", actual1100Balance);
