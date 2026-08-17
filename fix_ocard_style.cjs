const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const oldStr = `className={\`kbi-ocard \${cardBgClass}\`}
              style={{ backgroundColor: 'transparent' }}`;
const newStr = `className={\`kbi-ocard \${cardBgClass}\`}`;

if (content.includes(oldStr)) {
  content = content.replace(oldStr, newStr);
  fs.writeFileSync('src/components/SalesTab.tsx', content);
  console.log('Removed inline transparent style.');
} else {
  console.log('Could not find the exact string.');
}
