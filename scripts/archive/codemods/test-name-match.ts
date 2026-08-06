import fs from 'fs';

const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

let weirdLines = [];
journals.forEach((j: any) => {
    if (j.lines) {
        j.lines.forEach((l: any) => {
            const name = l.account ? l.account.trim().toLowerCase() : '';
            const code = l.accountCode ? l.accountCode.trim().toLowerCase() : '';
            if (name.includes('cash') || code.includes('110')) {
                if (code !== '1101' && code !== '1102' && code !== '1100') {
                    weirdLines.push({ jid: j.id, code: l.accountCode, name: l.account });
                }
            }
        });
    }
});

console.log(weirdLines);
