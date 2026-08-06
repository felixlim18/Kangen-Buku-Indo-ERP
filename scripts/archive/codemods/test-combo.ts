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

let bals = [];
coaAccounts.forEach((acc: any) => {
    const bal = getAccountBalanceForPeriod(acc, coaAccounts, journals, null, endDate);
    if (bal !== 0) {
        bals.push({ code: acc.code, name: acc.name, bal });
    }
});

let target = 2249.33;

function findCombo(bals: any[], current: number, idx: number, selected: any[]) {
    if (Math.abs(current - target) < 0.05 || Math.abs(current + target) < 0.05) {
        console.log("Found:", selected, "Total:", current);
    }
    if (idx >= bals.length) return;
    if (selected.length > 3) return;

    // +
    selected.push('+' + bals[idx].code);
    findCombo(bals, current + bals[idx].bal, idx + 1, selected);
    selected.pop();

    // -
    selected.push('-' + bals[idx].code);
    findCombo(bals, current - bals[idx].bal, idx + 1, selected);
    selected.pop();

    // 0
    findCombo(bals, current, idx + 1, selected);
}

findCombo(bals, 0, 0, []);
