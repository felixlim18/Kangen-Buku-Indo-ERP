const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/server/importPo.ts');
let code = fs.readFileSync(file, 'utf-8');

// The file still has poDocs.forEach(po => { at line 536, let's replace it
code = code.replace(/poDocs\.forEach\(po => \{/g, "for (const po of poDocs) {");

fs.writeFileSync(file, code);
