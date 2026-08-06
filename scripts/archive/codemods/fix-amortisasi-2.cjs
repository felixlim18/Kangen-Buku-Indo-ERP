const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/AmortisasiTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const tgl = periodDate;\n                    const journalId = await getNextJournalId\(dateStr\);/g,
  "const dateStr = period + '-28';\n    const journalId = await getNextJournalId(dateStr);"
);

code = code.replace(
  /const tgl = periodDate;                    const journalId = await getNextJournalId\(dateStr\);/g,
  "const dateStr = period + '-28';\n    const journalId = await getNextJournalId(dateStr);"
);

fs.writeFileSync(file, code);
