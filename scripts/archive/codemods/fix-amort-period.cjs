const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/AmortisasiTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const tglDateStr = currentPeriod\.period \+ '-28';/g,
  "const tglDateStr = formTanggal ? formTanggal + '-28' : new Date().toISOString().split('T')[0];"
);
code = code.replace(
  /const dateStr = currentPeriod\.period \+ '-28';/g,
  "const dateStr = period + '-28';"
);

fs.writeFileSync(file, code);
