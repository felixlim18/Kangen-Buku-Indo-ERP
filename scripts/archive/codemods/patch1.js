const fs = require('fs');
let code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

code = code.replace(
`        if (cancelledQty > 0) {
          if (rec === 0) {
            // Entirely cancelled item
            itemCopy.isCancelled = true;
          } else {
            // Partially received
            itemCopy.qty = rec;
          }
        }`,
`        if (cancelledQty > 0) {
          if (rec === 0) {
            // Entirely cancelled item
            itemCopy.isCancelled = true;
            itemCopy.cancelledQty = cancelledQty;
          } else {
            // Partially received
            itemCopy.qty = rec;
            itemCopy.cancelledQty = cancelledQty;
          }
        }`);

fs.writeFileSync('src/components/PurchasesTab.tsx', code);
