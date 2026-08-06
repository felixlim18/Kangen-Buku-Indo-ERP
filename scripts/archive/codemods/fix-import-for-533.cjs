const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/server/importPo.ts');
const lines = fs.readFileSync(file, 'utf-8').split('\n');
lines[532] = '    }';
fs.writeFileSync(file, lines.join('\n'));
