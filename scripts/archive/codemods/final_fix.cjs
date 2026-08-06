const fs = require('fs');

function fix(file) {
  let code = fs.readFileSync(file, 'utf8');

  // Fix snap.forEach((d) => { list.push({ id: d.id, ...d.data() }
  // missing the `});`
  code = code.replace(/snap\.forEach\(\(d\) => \{\s*list\.push\(\{ id: d\.id, \.\.\.d\.data\(\)(?: \} as FreightInRecord)?;\s*\}/g, 
    "snap.forEach((d) => {\n        list.push({ id: d.id, ...d.data() } as FreightInRecord);\n      });");

  code = code.replace(/snap\.forEach\(\(d\) => \{\s*list\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \s*\}/g,
    "snap.forEach((d) => {\n        list.push({ id: d.id, ...d.data() });\n      });");

  code = code.replace(/snap\.forEach\(\(d\) => \{\s*const item = d\.data\(\) as Book;\s*if \(item\.isActive\) \{\s*bList\.push\(\{ id: d\.id, \.\.\.item\s*\}\s*\}/g,
    "snap.forEach((d) => {\n        const item = d.data() as Book;\n        if (item.isActive) {\n          bList.push({ id: d.id, ...item });\n        }\n      });");

  code = code.replace(/snap\.forEach\(\(d\) => \{\s*const item = d\.data\(\);\s*if \(item\.isActive\) \{\s*bList\.push\(\{ id: d\.id, \.\.\.item \}\);\s*\}\s*\}\s*\}/g,
    "snap.forEach((d) => {\n        const item = d.data();\n        if (item.isActive) {\n          bList.push({ id: d.id, ...item });\n        }\n      });");

  fs.writeFileSync(file, code);
}

fix('src/components/FreightInTab.tsx');
fix('src/components/SalesTab.tsx');
fix('src/components/PurchasesTab.tsx');

console.log('Final syntax fix run');
