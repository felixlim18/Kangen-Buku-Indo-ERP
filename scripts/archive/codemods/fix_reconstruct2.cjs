const fs = require('fs');
let code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const missingVars = `
  const [poDiscount, setPoDiscount] = useState(0);
  const [actualReceiptTotal, setActualReceiptTotal] = useState(0);
  const [isPoViewOnly, setIsPoViewOnly] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string|null>(null);
  const sidebarHidden = sidebarCollapsed;
  const [isPoFreightDropdownOpen, setIsPoFreightDropdownOpen] = useState(false);
  const getPendingFreightInRecords = () => [];
  const [showNoRemainingToast, setShowNoRemainingToast] = useState(false);
  const [revertConfirmState, setRevertConfirmState] = useState<any>(null);
  const [scanErrorToast, setScanErrorToast] = useState<string|null>(null);
  const [tempKodeEkspedisi, setTempKodeEkspedisi] = useState('');
  const [kodeEkspedisi, setKodeEkspedisi] = useState('');
  const [expandedScannedPoId, setExpandedScannedPoId] = useState<string|null>(null);
  const scanStepRef = useRef(1);
  const [bulkCameraFacingMode, setBulkCameraFacingMode] = useState('environment');
  const toggleBulkCameraFacingMode = () => setBulkCameraFacingMode(p => p === 'environment' ? 'user' : 'environment');
  const [bulkScanSearchQuery, setBulkScanSearchQuery] = useState('');
  
  const handleProcessScannedCode = (code: string) => {};
  const handleSaveBulkScannedPO = async () => {};
  const profile = null;
`;

code = code.replace(/export const PurchasesTab = \(\) => \{/,
  `import { AlertTriangle, RefreshCw, RotateCcw, Scan, Truck, ChevronRight, AlertCircle } from 'lucide-react';
export const PurchasesTab = () => {
${missingVars}
`
);

fs.writeFileSync('src/components/PurchasesTab.tsx', code);
console.log('Reconstructed variables added');
