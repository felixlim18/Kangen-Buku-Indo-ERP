import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

journals.forEach((j: any) => {
    if (j.date) {
        let d = j.date.seconds ? new Date(j.date.seconds * 1000) : new Date(j.date);
        if ((d.getDate() === 30 || d.getDate() === 1) && (d.getMonth() === 5 || d.getMonth() === 6) && d.getFullYear() === 2026) {
            let hasCash = false;
            let net = 0;
            if (j.lines) {
                j.lines.forEach((l: any) => {
                    if (['1101', '1102'].includes(l.accountCode)) {
                        hasCash = true;
                        net += (l.debit || 0) - (l.credit || 0);
                    }
                });
            }
            if (hasCash) console.log(j.id, d.toISOString(), "net:", net/100);
        }
    }
});
