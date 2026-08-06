const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const missingVars = `
  const [poStatusFilter, setPoStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const [platformModalError, setPlatformModalError] = useState('');
  const [editingPlatformId, setEditingPlatformId] = useState<string|null>(null);
  const [platformNameInput, setPlatformNameInput] = useState('');
  const [platformCurrencyInput, setPlatformCurrencyInput] = useState('IDR');
  const [copiedPoId, setCopiedPoId] = useState<string | null>(null);
  const [hoveredPoId, setHoveredPoId] = useState<string | null>(null);
  const [isStaffValue, setIsStaffValue] = useState(false);
  const [hasPerm, setHasPerm] = useState(true);
  
  const handleSaveBulkScannedPO = (id?: any) => {};
  const getPoFreightCodes = (po: any) => [];
  const getPoFreightCostForCode = (po: any, code: any) => 0;
  const renderDualCurrency = (val: any) => <span>{val}</span>;
  const formatUSD = (val: any) => \`$\${val}\`;
`;

content = content.replace('  const [deletePlatformState, setDeletePlatformState] = useState<any>(null);', missingVars + '\n  const [deletePlatformState, setDeletePlatformState] = useState<any>(null);');

// Also add missing imports
content = content.replace("import { Package,", "import { Eye, Pencil, ChevronLeft, Edit2, LayoutGrid, PackageCheck, Package,");

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
console.log('Fixed PurchasesTab.tsx');
