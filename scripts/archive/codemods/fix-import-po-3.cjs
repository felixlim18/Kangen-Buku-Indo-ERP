const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/server/importPo.ts');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const journalId = await getNextJournalId\(tglForJrn\.toISOString\(\)\.split\('T'\)\[0\]\);/g,
  "const purchaseDateStr = po.purchaseDate.toDate ? po.purchaseDate.toDate().toISOString().split('T')[0] : new Date(po.purchaseDate).toISOString().split('T')[0];\n       const journalId = await getNextJournalId(purchaseDateStr);"
);

fs.writeFileSync(file, code);
