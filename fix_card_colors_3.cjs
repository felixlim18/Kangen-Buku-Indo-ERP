const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const oldCardClass = `            <article
              key={\`m-\${order.id}-\${orderIdx}\`}
              className="kbi-ocard"
              onClick={() => setViewingOrderDetail(order)}
            >`;
const newCardClass = `            <article
              key={\`m-\${order.id}-\${orderIdx}\`}
              className={\`kbi-ocard \${cardBgClass}\`}
              style={{ backgroundColor: 'transparent' }}
              onClick={() => setViewingOrderDetail(order)}
            >`;

if (content.includes(oldCardClass)) {
  content = content.replace(oldCardClass, newCardClass);
  fs.writeFileSync('src/components/SalesTab.tsx', content);
  console.log('Mobile card background colors applied to article tag!');
} else {
  console.log('Could not find the article tag.');
}
