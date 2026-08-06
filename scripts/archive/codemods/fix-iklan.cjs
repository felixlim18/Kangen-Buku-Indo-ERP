const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/IklanTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /const journalId = await getNextJournalId\(formData\.date\);/g,
  "const journalId = await getNextJournalId(formDate);"
);

fs.writeFileSync(file, code);
