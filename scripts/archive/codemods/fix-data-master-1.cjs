const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');
code = code.replace(
  "export interface PlatformOrderConfig {\n  id: string;\n  name: string;\n  ongkosKirim?: boolean;\n  createdAt?: any;\n}",
  "export interface PlatformOrderConfig {\n  id: string;\n  name: string;\n  ongkosKirim?: boolean;\n  adminFee?: number;\n  createdAt?: any;\n}"
);
fs.writeFileSync('src/types.ts', code);
