const fs = require('fs');

function fix(file) {
  let code = fs.readFileSync(file, 'utf8');

  // Fix platforms
  code = code.replace(/createdAt: Timestamp\.now\(\)[\s\S]*?await batch\.commit\(\);/,
    "createdAt: Timestamp.now()\n            });\n          }\n          await batch.commit();"
  );
  
  // Fix purchaseOrders sort
  code = code.replace(/return dateB - dateA;[\s\S]*?setPurchaseOrders/,
    "return dateB - dateA;\n      });\n      setPurchaseOrders"
  );
  
  // Fix catalog
  code = code.replace(/updatedAt: Timestamp\.now\(\)[\s\S]*?await batch\.commit\(\);/,
    "updatedAt: Timestamp.now()\n            });\n          }\n          await batch.commit();"
  );
  
  // Fix freightIn
  code = code.replace(/setFreightInList\(list\);[\s\S]*?handleFirestoreError\(error, OperationType\.LIST, 'freightIn'\);[\s\S]*?\}\);/,
    "setFreightInList(list);\n    }, (error) => {\n      handleFirestoreError(error, OperationType.LIST, 'freightIn');\n    });"
  );
  
  // Fix journalEntries
  code = code.replace(/list\.push\(\{ id: d\.id, \.\.\.d\.data\(\)[\s\S]*?\}\);[\s\S]*?setJournalEntries\(list\);/,
    "list.push({ id: d.id, ...d.data() });\n      });\n      setJournalEntries(list);"
  );

  fs.writeFileSync(file, code);
}

fix('src/components/PurchasesTab.tsx');
console.log('Fixed syntax with regex in PurchasesTab');
