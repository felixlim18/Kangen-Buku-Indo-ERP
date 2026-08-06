const fs = require('fs');
const dbStatus = JSON.parse(fs.readFileSync('journals.json', 'utf8') || '[]');
console.log(dbStatus.slice(0, 5).map(x => x.journalType));
