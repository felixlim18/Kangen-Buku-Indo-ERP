const fs = require('fs');
let code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

code = code.replace(/const handleSaveBulkScannedPO = \(\) => \{\};/, '');
code = code.replace(/const sidebarHidden = sidebarCollapsed;/, 'const sidebarHidden = false;');

fs.writeFileSync('src/components/PurchasesTab.tsx', code);
console.log('Fixed final');
