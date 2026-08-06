const fs = require('fs');
let code = fs.readFileSync('src/components/DataMasterManager.tsx', 'utf8');

code = code.replace(
  "          isTransfer: data.isTransfer !== false,\n          platforms: Array.isArray(data.platforms) ? data.platforms : []\n        };",
  "          isTransfer: data.isTransfer !== false,\n          platforms: Array.isArray(data.platforms) ? data.platforms : [],\n          adminFee: typeof data.adminFee === 'number' ? data.adminFee : (parseFloat(data.adminFee) || 0)\n        };"
);

fs.writeFileSync('src/components/DataMasterManager.tsx', code);
