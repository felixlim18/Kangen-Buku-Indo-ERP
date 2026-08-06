const fs = require('fs');
const path = require('path');

let file, code;

file = path.join(__dirname, 'src/components/AmortisasiTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/const journalId = await getNextJournalId\(dateStr\);/g, "const tglDateStr = currentPeriod.period + '-28';\n    const journalId = await getNextJournalId(tglDateStr);");
fs.writeFileSync(file, code);

file = path.join(__dirname, 'src/components/PurchasesTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/date: Timestamp.now\(\),/g, "date: Timestamp.now(),");
fs.writeFileSync(file, code);

