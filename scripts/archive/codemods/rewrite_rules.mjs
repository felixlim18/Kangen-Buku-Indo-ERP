import fs from 'fs';
let rules = fs.readFileSync('firestore.rules', 'utf8');

const collectionsToFix = [
  'inventory',
  'inventoryLedger',
  'cashFlow',
  'journalEntries',
  'coa',
  'partners',
  'paymentBatches',
  'periodClosings',
  'damagedStock',
  'fixedAssets',
  'prive',
  'setoranModal',
  'incomeEntries',
  'adsPurchases',
  'perlengkapanCategories',
  'perlengkapanItems',
  'perlengkapanPurchases',
  'auditLog'
];

collectionsToFix.forEach(col => {
  const matchRegex = new RegExp(`match /${col}/\\{([^}]+)\\} \\{([\\s\\S]*?)\\}`, 'g');
  rules = rules.replace(matchRegex, (match, id, body) => {
    if (body.includes('allow read, write: if')) {
      const condition = body.split('allow read, write: if ')[1].trim().replace(/;$/, '');
      return `match /${col}/{${id}} {\n      allow read: if isAuthed();\n      allow write: if ${condition};\n    }`;
    }
    
    if (body.includes('allow read: if')) {
       let newBody = body.replace(/allow read: if[^;]+;/, 'allow read: if isAuthed();');
       return `match /${col}/{${id}} {${newBody}}`;
    }
    
    return match;
  });
});

fs.writeFileSync('firestore.rules', rules);
