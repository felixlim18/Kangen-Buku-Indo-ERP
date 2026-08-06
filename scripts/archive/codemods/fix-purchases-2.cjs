const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/PurchasesTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const tgl = parsedDate;/g,
  "// removed unused tgl"
);

fs.writeFileSync(file, code);
