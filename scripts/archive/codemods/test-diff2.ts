import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

// find exactly -2249.33 difference
let targetCents = -224933;

let combinations = [];
journals.forEach((j: any) => {
    let net = 0;
    if (j.lines) {
        j.lines.forEach((l: any) => {
            if (['1101', '1102'].includes(l.accountCode)) {
                net += (l.debit || 0) - (l.credit || 0);
            }
        });
    }
    if (net !== 0) {
        combinations.push({ id: j.id, net, date: j.date });
    }
});

combinations.forEach(c => {
    if (c.net === targetCents || c.net === -targetCents) {
        console.log("Found EXACT match:", c);
    }
});

// find any two that sum to target
for(let i=0; i<combinations.length; i++) {
    for(let j=i+1; j<combinations.length; j++) {
        if (combinations[i].net + combinations[j].net === targetCents || combinations[i].net + combinations[j].net === -targetCents) {
            console.log("Found TWO match:", combinations[i].id, combinations[j].id);
        }
    }
}

