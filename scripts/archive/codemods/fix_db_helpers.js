const fs = require('fs');
let content = fs.readFileSync('src/lib/db-helpers.ts', 'utf8');

content = content.replace(
  'endingStock = inv.endingStock;',
  'endingStock = inv.endingStock || 0;'
);

content = content.replace(
  'totalPurchased = inv.totalPurchased;',
  'totalPurchased = inv.totalPurchased || 0;'
);

content = content.replace(
  'totalDispatched = inv.totalDispatched;',
  'totalDispatched = inv.totalDispatched || 0;'
);

fs.writeFileSync('src/lib/db-helpers.ts', content);
