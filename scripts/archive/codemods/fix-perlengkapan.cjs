const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/PerlengkapanTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const tglBuy = formData\.date \|\| new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\];/g,
  "const tglBuy = buyDate || new Date().toISOString().split('T')[0];"
);
code = code.replace(
  /const journalId = await getNextJournalId\(closeDate\);/g,
  "const closeDateStr = new Date().toISOString().split('T')[0];\n      const journalId = await getNextJournalId(closeDateStr);"
);

fs.writeFileSync(file, code);
