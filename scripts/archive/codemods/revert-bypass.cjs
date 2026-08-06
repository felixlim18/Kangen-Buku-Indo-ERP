const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace('if (false) {', 'if (!user) {');
app = app.replace('const hasPerm = (key: string) => { return true;', 'const hasPerm = (key: string) => {');
fs.writeFileSync('src/App.tsx', app);
