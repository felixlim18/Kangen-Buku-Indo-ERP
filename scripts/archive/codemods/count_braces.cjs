const fs = require('fs');

const code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;
let tagStack = [];

for (let i = 0; i < code.length; i++) {
  const c = code[i];
  // Ignore comments and strings for this simple heuristic?
  // It's tricky to handle strings without a real parser.
}
