const fs = require('fs');
const path = require('path');

let file, code;

file = path.join(__dirname, 'src/components/AmortisasiTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/const dateStr = period \+ '-28';/g, "const dateStr = period + '-28';\n    const tgl = new Date(dateStr); // dummy for compiler if needed");
code = code.replace(/const tgl = periodDate;/, ""); // might be leftover
fs.writeFileSync(file, code);

file = path.join(__dirname, 'src/components/ClosingTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/getNextJournalId\(tglClosing\)/, "getNextJournalId(tglClosingIso)");
fs.writeFileSync(file, code);

file = path.join(__dirname, 'src/components/OngkosKirimTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/const tglForJrn = formDate/, "const tglForJrn = paymentDate");
fs.writeFileSync(file, code);

file = path.join(__dirname, 'src/components/PurchasesTab.tsx');
code = fs.readFileSync(file, 'utf-8');
code = code.replace(/date: Timestamp.fromDate\(tgl\)/, "date: Timestamp.fromDate(new Date(dateStr))");
fs.writeFileSync(file, code);

