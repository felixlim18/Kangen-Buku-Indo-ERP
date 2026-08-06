const fs = require('fs');
const path = require('path');

let file, code;

file = path.join(__dirname, 'src/components/AmortisasiTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/const tgl = new Date\(dateStr\);\n                    const journalId = await getNextJournalId\(dateStr\);/g, "const journalId = await getNextJournalId(dateStr);");
fs.writeFileSync(file, code);

file = path.join(__dirname, 'src/components/ClosingTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/const fxJournalId = await getNextJournalId\(tglClosingIso\);/g, "const tglClosingIso = selectedPeriod.period + '-28';\n      const fxJournalId = await getNextJournalId(tglClosingIso);");
fs.writeFileSync(file, code);

file = path.join(__dirname, 'src/components/OngkosKirimTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/const tglForJrn = paymentDate \|\| new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\];/g, "const tglForJrn = new Date().toISOString().split('T')[0];");
fs.writeFileSync(file, code);

file = path.join(__dirname, 'src/components/PurchasesTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/date: Timestamp\.fromDate\(tgl\),/g, "date: Timestamp.now(),");
fs.writeFileSync(file, code);

