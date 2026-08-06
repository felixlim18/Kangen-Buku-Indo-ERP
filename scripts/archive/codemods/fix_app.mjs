import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /    const financialSubTabs = \['income', 'cashflow', 'neraca', 'equity-change', 'utang', 'prive', 'payroll', 'partners'\];\n    if \(financialSubTabs\.includes\(key\)\) \{\n      if \(key === 'payroll' \|\| key === 'partners'\) \{\n        return !!profile\?.permissions\?\.\['financial'\] && !!profile\?.permissions\?\.\[\`financial\.\$\{key\}\`\];\n      \}\n      return !!profile\?.permissions\?\.\['financial'\];\n    \}\n/g,
  ''
);

fs.writeFileSync('src/App.tsx', content);
