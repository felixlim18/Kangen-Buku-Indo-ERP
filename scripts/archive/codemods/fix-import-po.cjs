const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/server/importPo.ts');
let code = fs.readFileSync(file, 'utf-8');

if (!code.includes("import { getNextJournalId }")) {
  code = "import { getNextJournalId } from '../lib/journalUtils';\n" + code;
}

code = code.replace(
  /const journalId = `JU-PO-\$\{po\.id\}-create`;/,
  "const journalId = await getNextJournalId(tglForJrn.toISOString().split('T')[0]);"
);

code = code.replace(
  /const recJournalId = `JU-PO-\$\{poDoc\.id\}-rec-capitalize-mig`;/,
  "const recJournalId = await getNextJournalId(new Date().toISOString().split('T')[0]);"
);

fs.writeFileSync(file, code);
