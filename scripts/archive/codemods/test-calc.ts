import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

// Simple implementation of what FinancialReports does:
const targetYear = 2026;
const targetMonth = 7; // July
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

// Just match cash lines by accountCode: '1101' or '1102' for simplicity (assuming no other cash accounts)
const cashCodes = ['1101', '1102', '1103'];

let actualBalance = 0;
let prevBalance = 0;

journals.forEach(entry => {
    let entryDate = parseToDate(entry.date);
    let noDate = !entry.date;
    
    let endCompare = new Date(endDate);
    endCompare.setHours(23, 59, 59, 999);
    
    let prevCompare = new Date(prevMonthEndDate);
    prevCompare.setHours(23, 59, 59, 999);
    
    let isUpToEnd = noDate || entryDate <= endCompare;
    let isUpToPrev = noDate || entryDate <= prevCompare;
    
    let netCash = 0;
    if (entry.lines) {
        entry.lines.forEach(l => {
            if (cashCodes.includes(l.accountCode)) {
                netCash += (l.debit || 0) - (l.credit || 0);
            }
        });
    }
    
    if (isUpToEnd) {
        actualBalance += netCash;
    }
    if (isUpToPrev) {
        prevBalance += netCash;
    }
});

let monthNet = 0;
journals.forEach(entry => {
    if (!entry.date) return;
    let d = parseToDate(entry.date);
    if (d >= startDate && d <= endDate) {
        if (entry.lines) {
            entry.lines.forEach(l => {
                if (cashCodes.includes(l.accountCode)) {
                    monthNet += (l.debit || 0) - (l.credit || 0);
                }
            });
        }
    }
});

console.log("actualBalance:", actualBalance / 100);
console.log("prevBalance:", prevBalance / 100);
console.log("monthNet:", monthNet / 100);
console.log("diff actual vs calculated:", (actualBalance - (prevBalance + monthNet)) / 100);
