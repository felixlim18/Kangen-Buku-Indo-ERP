import fs from 'fs';

const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

const targetYear = 2026;
const targetMonth = 7;
const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
}

function getAccountBalanceForPeriod(account: any, allAccounts: any[], journals: any[], startDate: any, endDate: any): number {
    let debitCents = 0;
    let creditCents = 0;
    
    // Wait, the logic in getAccountBalanceForPeriod handles parent accounts.
    // If account has no parent, but has children...
    function isParent(acc: any) {
        return allAccounts.some(child => child.parentAccount === `${acc.code} - ${acc.name}` || child.parentAccount === acc.code);
    }
    function isDescendant(acc: any, parent: any) {
        let curr = acc;
        while(curr) {
            let p = allAccounts.find(x => `${x.code} - ${x.name}` === curr.parentAccount || x.code === curr.parentAccount);
            if (!p) return false;
            if (p.code === parent.code) return true;
            curr = p;
        }
        return false;
    }
    
    function getVals(acc: any): {d: number, c: number} {
        if (isParent(acc)) {
            let d = 0, c = 0;
            allAccounts.forEach(leaf => {
                if (!isParent(leaf) && isDescendant(leaf, acc)) {
                    let v = getVals(leaf);
                    d += v.d;
                    c += v.c;
                }
            });
            return {d, c};
        }
        
        let d = 0, c = 0;
        journals.forEach((entry: any) => {
            let entryDate = parseToDate(entry.date);
            let noDate = !entry.date;
            let endCompare = new Date(endDate);
            endCompare.setHours(23, 59, 59, 999);
            
            let isUpToEnd = noDate || entryDate <= endCompare;
            if (isUpToEnd && entry.lines) {
                entry.lines.forEach((l: any) => {
                    if (l.accountCode === acc.code) {
                        d += l.debit || 0;
                        c += l.credit || 0;
                    }
                });
            }
        });
        return {d, c};
    }
    
    let vals = getVals(account);
    if (account.type === 'Assets' || account.type === 'Expenses') {
        return (vals.d - vals.c) / 100;
    } else {
        return (vals.c - vals.d) / 100;
    }
}

const assetsList = coaAccounts.filter(a => a.type === 'Assets').map(acc => ({
    account: acc,
    currentBalance: getAccountBalanceForPeriod(acc, coaAccounts, journals, null, endDate)
}));

console.log("Assets List:");
assetsList.forEach(a => console.log(`${a.account.code} ${a.account.name}: ${a.currentBalance}`));

