const fs = require('fs');
let lines = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8').split('\n');
// Let's just comment out line 138-141.
for (let i = 137; i <= 140; i++) {
  lines[i] = '// ' + lines[i];
}
fs.writeFileSync('src/components/PurchasesTab.tsx', lines.join('\n'));
