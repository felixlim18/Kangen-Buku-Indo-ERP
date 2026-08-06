const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/AmortisasiTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const tgl = newItem\.date\?\.toDate \? newItem\.date\.toDate\(\) : new Date\(\);/g,
  "const dateStr = formTanggal || new Date().toISOString().split('T')[0];"
);
code = code.replace(
  /const dateStr = tgl\.toISOString\(\)\.split\('T'\)\[0\];/g,
  ""
);

code = code.replace(
  /const tgl = periodDate\?\.toDate \? periodDate\.toDate\(\) : new Date\(\);/g,
  "const dateStr = currentPeriod.period + '-28'; // approx date"
);

fs.writeFileSync(file, code);
