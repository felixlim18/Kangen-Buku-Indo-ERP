const fs = require('fs');

function patchFile(file, collectionNames) {
  let code = fs.readFileSync(file, 'utf8');
  
  for (const coll of collectionNames) {
    const unsubName = 'unsub' + coll.charAt(0).toUpperCase() + coll.slice(1);
    
    // Attempt to match the onSnapshot pattern
    // This is a naive regex but usually works for the way this code was generated.
    const regex = new RegExp(`const (unsub\\w+) = onSnapshot\\(collection\\(db, '${coll}'\\), \\(snap\\) => \\{([\\s\\S]*?)\\}(?:, (?:\\(error\\)|err) => \\{([\\s\\S]*?)\\})?\\);`, 'g');
    
    code = code.replace(regex, (match, unsubVar, successBody, errorBody) => {
      const errHandler = errorBody ? errorBody : `console.error(err);`;
      return `
    const fetch${coll} = async () => {
      try {
        const snap = await getDocs(collection(db, '${coll}'));
        ${successBody}
      } catch (err) {
        ${errHandler}
      }
    };
    fetch${coll}();
      `;
    });
    
    // Remove unsubs from cleanup
    const unsubRegex = new RegExp(`${unsubName}\\(\\);`, 'gi');
    code = code.replace(unsubRegex, '');
    
    // Also remove any generic unsub calls that matched our regex captures
    // But since we can't do it dynamically inside replace easily for cleanup, we'll just run another pass
  }
  
  // generic cleanup removal of anything that looks like unsubX() that we replaced
  code = code.replace(/unsub\w+\(\);/g, '');

  fs.writeFileSync(file, code);
  console.log('Patched', file);
}

patchFile('src/components/PurchasesTab.tsx', ['platforms', 'purchaseOrders', 'catalog', 'freightIn', 'journalEntries']);
patchFile('src/components/SalesTab.tsx', ['platforms', 'catalog', 'inventory', 'salesOrders', 'journalEntries']);
patchFile('src/components/FreightInTab.tsx', ['freightIn', 'journalEntries', 'purchaseOrders', 'coa']);
patchFile('src/components/InventoryTab.tsx', ['catalog', 'inventory']);

