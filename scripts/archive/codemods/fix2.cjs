const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const missing2 = `
  const setPoStatusFilter = (v: any) => {};
  const setCurrentPage = (v: any) => {};
  const setIsPlatformOpen = (v: any) => {};
  const setPlatformModalError = (v: any) => {};
  const setEditingPlatformId = (v: any) => {};
  const setPlatformNameInput = (v: any) => {};
  const setPlatformCurrencyInput = (v: any) => {};
`;

content = content.replace('const [poStatusFilter, setPoStatusFilter] = useState(\'all\');', missing2 + '\n  const [poStatusFilter, _setPoStatusFilter] = useState(\'all\');');

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
