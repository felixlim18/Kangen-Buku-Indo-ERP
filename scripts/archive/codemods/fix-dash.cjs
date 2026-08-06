const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardTab.tsx', 'utf8');
code = code.replace(
  "if (systemKey === 'cash_ntd') {",
  "const cashNtdCode = coaAccounts.find(a => a.systemKey === 'cash_ntd')?.code || '1101';\n        const cashIdrCode = coaAccounts.find(a => a.systemKey === 'cash_idr')?.code || '1102';\n        if (code === cashNtdCode) {"
);
code = code.replace(
  "} else if (systemKey === 'cash_idr') {",
  "} else if (code === cashIdrCode) {"
);
fs.writeFileSync('src/components/DashboardTab.tsx', code);
