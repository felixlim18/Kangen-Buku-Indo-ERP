import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

let targetVals = [ -11000, -67510, -213523, 67100 ];

journals.forEach((j: any) => {
    let net = 0;
    if (j.lines) {
        j.lines.forEach((l: any) => {
            if (['1101', '1102'].includes(l.accountCode)) {
                net += (l.debit || 0) - (l.credit || 0);
            }
        });
    }
    if (targetVals.includes(net)) {
        console.log("Journal:", j.id, "Date:", j.date, "Net:", net);
    }
});
