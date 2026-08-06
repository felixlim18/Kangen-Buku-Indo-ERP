const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/ClosingTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const fxJournalId = await getNextJournalId\(tglClosingIso\);/g,
  "const fxJournalId = await getNextJournalId(tglClosing);"
);

fs.writeFileSync(file, code);
