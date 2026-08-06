import fs from 'fs';

const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

const targetYear = 2026;
const targetMonth = 7;
const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
const prevMonthEndDate = new Date(targetYear, targetMonth - 1, 0, 23, 59, 59, 999);

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
}

// Emulate old `getAccountBalanceForPeriod` for 1100
let d1100 = 0, c1100 = 0;
// wait, 1100 has no children in coa.json.
// so 1100 balance is just its own journals, which is 0.
let saldoAwalKas = 0;

let monthJournals = journals.filter((entry: any) => {
    if (!entry.date) return false;
    let d = parseToDate(entry.date);
    return d >= startDate && d <= endDate;
});

let operasionalIn = 0;
let operasionalOut = 0;

let kenaikanKasBersih = 0;

monthJournals.forEach((entry: any) => {
    if (!entry.lines) return;
    let cashLines = entry.lines.filter((l: any) => {
        let acc = coaAccounts.find((a: any) => a.code === l.accountCode);
        return (acc && acc.systemKey && acc.systemKey.startsWith('cash')) || l.accountCode === '1101' || l.accountCode === '1102';
    });
    if (cashLines.length === 0) return;
    
    cashLines.forEach((cl: any) => {
        let net = (cl.debit || 0) - (cl.credit || 0);
        kenaikanKasBersih += net;
    });
});

console.log("old kenaikanKasBersih:", kenaikanKasBersih / 100);

// Emulate actual1100Balance
let actual1100Balance = 0; // because 1100 has no journals.

console.log("old saldoAkhirKas:", (saldoAwalKas + kenaikanKasBersih/100));
console.log("old actual1100Balance:", actual1100Balance);
