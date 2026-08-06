const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/OngkosKirimTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const tglForJrn = paymentDate \|\| new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\];/g,
  "const tglForJrn = formDate || new Date().toISOString().split('T')[0];"
);

fs.writeFileSync(file, code);
