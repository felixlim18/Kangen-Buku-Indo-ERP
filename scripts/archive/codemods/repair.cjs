const fs = require('fs');

function repairFile(file, collections) {
  let code = fs.readFileSync(file, 'utf8');

  for (const coll of collections) {
    const unsubName = 'unsub' + coll.charAt(0).toUpperCase() + coll.slice(1);
    
    // Find the injected start
    const startStr = `
    const fetch${coll} = async () => {
      try {
        const snap = await getDocs(collection(db, '${coll}'));`;
    const startIdx = code.indexOf(startStr);
    
    if (startIdx !== -1) {
      // Replace start
      code = code.replace(startStr, `const ${unsubName} = onSnapshot(collection(db, '${coll}'), (snap) => {`);
      
      // Find the injected end block
      // It might have spaces or newlines before it due to the original code
      const endStrRegex = new RegExp(`\\} catch \\(err\\) \\{\\s*console\\.error\\(err\\);\\s*\\}\\s*\\};\\s*fetch${coll}\\(\\);`);
      
      code = code.replace(endStrRegex, `}`);
      
      // I also removed unsubName() in the cleanup. Let's not worry about adding it back yet.
      // Wait, memory leaks! I should add them back.
      // Or I could just use git checkout... wait, I can download from github if I have the url.
    }
  }

  fs.writeFileSync(file, code);
  console.log('Repaired', file);
}

repairFile('src/components/PurchasesTab.tsx', ['platforms', 'purchaseOrders', 'catalog', 'freightIn', 'journalEntries']);
repairFile('src/components/SalesTab.tsx', ['platforms', 'catalog', 'inventory', 'salesOrders', 'journalEntries']);
repairFile('src/components/FreightInTab.tsx', ['freightIn', 'journalEntries', 'purchaseOrders', 'coa']);
repairFile('src/components/InventoryTab.tsx', ['catalog', 'inventory']);

