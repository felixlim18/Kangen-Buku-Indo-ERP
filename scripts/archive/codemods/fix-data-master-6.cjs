const fs = require('fs');
let code = fs.readFileSync('src/components/DataMasterManager.tsx', 'utf8');

code = code.replace(
  "      setNewItemName('');\n      setNewItemOngkosKirim(false);\n      setNewItemPlatforms([]);",
  "      setNewItemName('');\n      setNewItemOngkosKirim(false);\n      setNewItemPlatforms([]);\n      setNewItemAdminFee('0');"
);

fs.writeFileSync('src/components/DataMasterManager.tsx', code);
