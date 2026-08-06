import fs from 'fs';

const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));
let noDateNet = 0;
journals.forEach((j: any) => {
    if (!j.date && j.lines) {
        j.lines.forEach((l: any) => {
            if (['1101', '1102'].includes(l.accountCode)) {
                noDateNet += (l.debit || 0) - (l.credit || 0);
            }
        });
    }
});
console.log("noDateNet:", noDateNet / 100);
