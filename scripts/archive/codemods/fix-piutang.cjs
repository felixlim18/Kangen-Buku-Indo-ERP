const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/PiutangUtangTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const dateStr = paymentDate \? new Date\(paymentDate\)\.toISOString\(\)\.split\('T'\)\[0\] : new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\];/g,
  "const dateStr = payDate ? new Date(payDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];"
);

fs.writeFileSync(file, code);
