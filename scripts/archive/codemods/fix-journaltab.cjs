const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/JournalTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

if (!code.includes("import { getNextJournalId }")) {
  code = "import { getNextJournalId } from '../lib/journalUtils';\n" + code;
}

fs.writeFileSync(file, code);
