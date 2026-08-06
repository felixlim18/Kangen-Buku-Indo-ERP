import fs from 'fs';
const coaAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));

let matches = coaAccounts.filter((a: any) => 
    a.systemKey?.startsWith('cash') || a.code === '1101' || a.code === '1102' || a.name.toLowerCase().includes('cash')
);

console.log(matches.map((a: any) => `${a.code} ${a.name} ${a.parentAccount}`));
