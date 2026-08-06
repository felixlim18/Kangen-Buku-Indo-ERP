const fs = require('fs');
let code = fs.readFileSync('src/components/BankKasTab.tsx', 'utf8');

const s = "Saldo Rekening Koran Aktual ({recAccountCode === '1101' ? 'NT";
const r = "Saldo Rekening Koran Aktual ({recAccountCode === '1101' ? 'NT$' : 'Rp'})";

code = code.split(s).join(r);
fs.writeFileSync('src/components/BankKasTab.tsx', code);
