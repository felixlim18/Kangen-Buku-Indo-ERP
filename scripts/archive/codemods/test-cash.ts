import fs from 'fs';

const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));
const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));

let uniqueAccounts = new Set<string>();

journals.forEach((j: any) => {
    if (j.lines) {
        j.lines.forEach((l: any) => {
            if (l.accountCode && l.accountCode.startsWith('110')) {
                uniqueAccounts.add(l.accountCode);
            }
        });
    }
});

console.log(uniqueAccounts);
