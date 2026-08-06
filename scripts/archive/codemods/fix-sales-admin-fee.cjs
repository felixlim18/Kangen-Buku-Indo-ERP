const fs = require('fs');
let code = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

code = code.replace(
  "        } else if (item.id.startsWith('config_platform_')) {\n          platformsList.push({ id: item.id, name: item.name, position: item.position, ongkosKirim: item.ongkosKirim, isCod: item.isCod, isTransfer: item.isTransfer, createdAt: item.createdAt });",
  "        } else if (item.id.startsWith('config_platform_')) {\n          platformsList.push({ id: item.id, name: item.name, position: item.position, ongkosKirim: item.ongkosKirim, isCod: item.isCod, isTransfer: item.isTransfer, createdAt: item.createdAt, adminFee: typeof item.adminFee === 'number' ? item.adminFee : (parseFloat(item.adminFee) || 0) });"
);

fs.writeFileSync('src/components/SalesTab.tsx', code);
