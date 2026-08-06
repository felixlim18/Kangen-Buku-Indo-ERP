const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/PurchasesTab.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /let closeJournalRef = null;\n          if \(!closeJournalSnapDocs\.empty\) \{/,
  `let closeJournalRef = null;
          if (!closeJournalSnapDocs.empty) {`
);

code = code.replace(
  /batch\.update\(closeJournalRef, \{/,
  `batch.update(closeJournalRef!, {`
);

code = code.replace(
  /\} else \{\n            const transitAcc/,
  `} else {
            if (!closeJournalRef) {
              const newCloseId = await getNextJournalId(new Date().toISOString().split('T')[0]);
              closeJournalRef = doc(db, 'journalEntries', newCloseId);
            }
            const transitAcc`
);

code = code.replace(
  /batch\.set\(closeJournalRef, \{/g,
  `batch.set(closeJournalRef!, {`
);

fs.writeFileSync(file, code);
