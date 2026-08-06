import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

journals.forEach((j: any) => {
    if (j.date) {
        let d = j.date.seconds ? new Date(j.date.seconds * 1000) : new Date(j.date);
        if (d.getDate() === 31 && d.getMonth() === 6 && d.getFullYear() === 2026) {
            console.log(j.id, d.toISOString(), JSON.stringify(j.lines));
        }
    }
});
