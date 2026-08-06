const fs = require('fs');
let code = fs.readFileSync('src/components/InventoryTab.tsx', 'utf8');

code = code.replace(
  "        memo: \`Jurnal Penyesuaian Selisih Pembulatan Persediaan Fisik vs Ledger (\${selectedMonth})\`,",
  "        description: \`Jurnal Penyesuaian Selisih Pembulatan Persediaan Fisik vs Ledger (\${selectedMonth})\`,\n        refType: 'inventory_adjustment',"
);
// Also remove memo field since it seems description is what we need

fs.writeFileSync('src/components/InventoryTab.tsx', code);
