const fs = require('fs');
let code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const missingVars = `
  const [deletePlatformState, setDeletePlatformState] = useState<any>(null);
  const [isCsvUploadOpen, setIsCsvUploadOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [csvValidationResult, setCsvValidationResult] = useState<any>(null);
  const [addedItems, setAddedItems] = useState<any[]>([]);
  const [previewCoverIdx, setPreviewCoverIdx] = useState<number | null>(null);
  const [poDate, setPoDate] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [shakeFields, setShakeFields] = useState<Record<string, boolean>>({});
  const [poPaymentStatus, setPoPaymentStatus] = useState('');
  const [rateFetchStatus, setRateFetchStatus] = useState('');
  const [supplierOrderNumber, setSupplierOrderNumber] = useState('');
  const [supplierTrackingNumber, setSupplierTrackingNumber] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);
  const handleSaveBulkScannedPO = () => {};
`;

code = code.replace(/import \{ AlertTriangle/,
  `import { FileSpreadsheet, Download, Upload, CheckCircle2, BookOpen, Copy, Loader2, AlertTriangle`
);

code = code.replace(/export const PurchasesTab = \(\) => \{/,
  `export const PurchasesTab = () => {
${missingVars}
`
);

fs.writeFileSync('src/components/PurchasesTab.tsx', code);
console.log('Reconstructed variables added 3');
