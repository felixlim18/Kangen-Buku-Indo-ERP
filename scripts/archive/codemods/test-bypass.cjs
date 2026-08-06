const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace('if (!user) {', 'if (false) {');
fs.writeFileSync('src/App.tsx', app);
