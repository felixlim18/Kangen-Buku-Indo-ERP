const fs = require('fs');

let file = fs.readFileSync('src/lib/journalAuto.ts', 'utf8');
file = file.replace(
  `  return {\n    freightExchangeRate,\n    freightIdrPerItem,\n    freightNtdPerItem\n  };`,
  `  const tglTerima = new Date();
  const yy = String(tglTerima.getFullYear()).slice(-2);
  const mm = String(tglTerima.getMonth() + 1).padStart(2, '0');
  const dd = String(tglTerima.getDate()).padStart(2, '0');
  const dateStr = \`\${yy}\${mm}\${dd}\`;
  const counterId = \`JURNAL_\${dateStr}\`;
  let nextValue = 1;
  const counterRef = doc(db, 'counters', counterId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      if (!snap.exists()) {
        nextValue = 1;
      } else {
        nextValue = snap.data().value + 1;
      }
      transaction.set(counterRef, { value: nextValue }, { merge: true });
    });
  } catch(e) { console.error(e); nextValue = Math.floor(Math.random()*9999); }
  const nextJournalId = \`JU\${dateStr}\${String(nextValue).padStart(4, '0')}\`;

  return {
    freightExchangeRate,
    freightIdrPerItem,
    freightNtdPerItem,
    nextJournalId
  };`
);
fs.writeFileSync('src/lib/journalAuto.ts', file);
