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

const startDate = new Date(2026, 6, 1, 0, 0, 0, 0);
const endDate = new Date(2026, 6, 31, 23, 59, 59, 999);
const prevMonthEndDate = new Date(2026, 6, 0, 23, 59, 59, 999);

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
}

// 1. Month Journals
const monthJournals = journals.filter((entry: any) => {
  if (!entry.date) return false;
  const d = parseToDate(entry.date);
  return d >= startDate && d <= endDate;
});

// 2. Leaf Cash Accounts
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

// 3. Kenaikan Kas
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

console.log("monthJournals count:", monthJournals.length);
console.log("kenaikanKasBersih:", kenaikanKasBersih);
console.log("saldoAkhirKas (based on 60918.7999):", 60918.7999 + kenaikanKasBersih);

