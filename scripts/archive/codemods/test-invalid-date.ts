import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

let net = 0;
journals.forEach((j: any) => {
    let d = j.date?.seconds ? new Date(j.date.seconds * 1000) : new Date(j.date);
    if (isNaN(d.getTime())) {
        if (j.lines) {
            j.lines.forEach((l: any) => {
                if (['1101', '1102'].includes(l.accountCode)) {
                    net += (l.debit || 0) - (l.credit || 0);
                }
            });
        }
    }
});

console.log("Invalid date net:", net / 100);
