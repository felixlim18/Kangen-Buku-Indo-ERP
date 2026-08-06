const fs = require('fs');
let code = fs.readFileSync('src/lib/journalAuto.ts', 'utf8');

const s = `
      if (acc.accountRole && existingData.accountRole !== acc.accountRole) {
        updates.accountRole = acc.accountRole;
    journalDesc = "Penerimaan Barang Sebagian";
  }

  const refId = cleanFreightCode || poCode;
`;

// It looks like the file is corrupted here. We will replace everything from `    journalDesc` to the end of `export function generateReceivingJournals(...) { ... }` with the correct functions if we can, or just remove the bad part and let `esbuild` tell us what is missing.

