import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

let net1101 = 0;
let net1102 = 0;
let other = 0;
let pos = 0;
let neg = 0;

journals.forEach((j: any) => {
    if (j.lines) {
        j.lines.forEach((l: any) => {
            if (l.accountCode === '1101') {
                net1101 += (l.debit || 0) - (l.credit || 0);
            } else if (l.accountCode === '1102') {
                net1102 += (l.debit || 0) - (l.credit || 0);
            }
        });
    }
});

console.log("net1101:", net1101/100);
console.log("net1102:", net1102/100);
console.log("Total:", (net1101+net1102)/100);
