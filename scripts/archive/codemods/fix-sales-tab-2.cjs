const fs = require('fs');
let code = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

code = code.replace(
  "                              if (!editingOrder) {\n                                const matched = filteredPlatformsByPayment.find((p: any) => p.name === val);",
  "                              if (!editingOrder) {\n                                const listToUse = buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment;\n                                const matched = listToUse.find((p: any) => p.name === val);"
);

fs.writeFileSync('src/components/SalesTab.tsx', code);
