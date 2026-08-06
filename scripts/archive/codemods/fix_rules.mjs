import fs from 'fs';
let rules = fs.readFileSync('firestore.rules', 'utf8');

// The missing read lines are:
// inventory, inventoryLedger, fxRates, cashFlow, journalEntries, coa, partners, paymentBatches, freightIn
// damagedStock, fixedAssets, prive, setoranModal, incomeEntries, adsPurchases, perlengkapanCategories, perlengkapanItems, perlengkapanPurchases
// wait, wait! 
// Let's just find any match block that has "allow write:" but NO "allow read:" and add "allow read: if isAuthed();"

const matchBlockRegex = /match \/([^{]+)\/\{([^}]+)\} \{([\s\S]*?)\}/g;
let newRules = rules.replace(matchBlockRegex, (match, path, id, body) => {
  if (body.includes('allow write:') && !body.includes('allow read:')) {
    // Inject allow read: if isAuthed();
    const newBody = `\n      allow read: if isAuthed();${body}`;
    return `match /${path}/{${id}} {${newBody}}`;
  }
  return match;
});

fs.writeFileSync('firestore.rules', newRules);
