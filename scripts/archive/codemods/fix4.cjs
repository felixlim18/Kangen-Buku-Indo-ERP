const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

content = content.replace('const renderDualCurrency = (val: any) => <span>{val}</span>;', 'const renderDualCurrency = (platAmt: any, ntdAmt: any, currency: any, class1: any, class2: any) => <span>{platAmt}</span>;');
content = content.replace('const getPoFreightCodes = (po: any) => [];', 'const getPoFreightCodes = (po: any): string[] => [];');

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
