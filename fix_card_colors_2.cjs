const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const oldStyle = "style={{ backgroundColor: 'transparent' } /* Override old hardcoded background if any */}";
const newStyle = "";

if (content.includes(oldStyle)) {
  content = content.replace(oldStyle, newStyle);
  fs.writeFileSync('src/components/SalesTab.tsx', content);
  console.log('Fixed transparency bug.');
} else {
  console.log('Not found.');
}
