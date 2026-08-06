const fs = require('fs');
const lines = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8').split('\n');

let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
  if (depth === 0 && i > 40) {
    console.log('Depth reached 0 at line', i + 1);
    console.log('Line content:', line);
    break;
  }
}
