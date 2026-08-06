import fs from 'fs';

const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

journals.forEach((j: any) => {
    if (j.date && j.date.seconds) {
        j.date = new Date(j.date.seconds * 1000);
    } else if (j.date) {
        j.date = new Date(j.date);
    }
});

const startDate = new Date(2026, 7, 1, 0, 0, 0, 0); // Aug 1
const endDate = new Date(2026, 7, 31, 23, 59, 59, 999); // Aug 31
const prevMonthEndDate = new Date(2026, 7, 0, 23, 59, 59, 999); // July 31

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
}

const monthJournals = journals.filter((entry: any) => {
  if (!entry.date) return false;
  const d = parseToDate(entry.date);
  return d >= startDate && d <= endDate;
});

const isParentAccount = (acc: any, allAccs: any[]) => {
  return allAccs.some(other => {
    if (!other.parentAccount) return false;
    const cleanParent = other.parentAccount.trim().toLowerCase();
    return (
      cleanParent === acc.name.trim().toLowerCase() ||
      cleanParent === `${acc.code} - ${acc.name}`.trim().toLowerCase() ||
      cleanParent === acc.id.trim().toLowerCase() ||
      cleanParent === acc.code.trim().toLowerCase()
    );
  });
};

const cashAccounts = coaAccounts.filter((a: any) => 
  (a.systemKey?.startsWith('cash') || a.code === '1101' || a.code === '1102' || a.name.toLowerCase().includes('cash'))
);
const leafCashAccounts = cashAccounts.filter((a: any) => !isParentAccount(a, coaAccounts));

const { getAccountBalanceForPeriod } = require('./src/lib/decimal-utils');

let saldoAwalKas = 0;
leafCashAccounts.forEach((acc: any) => {
    saldoAwalKas += getAccountBalanceForPeriod(acc, coaAccounts, journals, null, prevMonthEndDate);
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
