const fs = require('fs');
let code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const reconstructedCode = `
import { Decimal } from 'decimal.js';
import { Package, X, Check, Search, Calendar, ChevronDown, ChevronUp, Trash2, Printer, Plus } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export const PurchasesTab = () => {
  const { user } = useAuth();
  const { collapsed: sidebarCollapsed } = useSidebar();
  
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [freightInList, setFreightInList] = useState<any[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isClosePoModalOpen, setIsClosePoModalOpen] = useState(false);
  
  const [selectedPo, setSelectedPo] = useState<any>(null);
  const [closingPo, setClosingPo] = useState<any>(null);
  
  const [receiveItemsState, setReceiveItemsState] = useState<any[]>([]);
  const [receiveKodeEkspedisi, setReceiveKodeEkspedisi] = useState('');
  const [receiveDate, setReceiveDate] = useState('');
  const [receiveNoteGlobal, setReceiveNoteGlobal] = useState('');
  const [isProcessingReceive, setIsProcessingReceive] = useState(false);
  
  const [closePoOption, setClosePoOption] = useState('refund');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundRate, setRefundRate] = useState('');
  const [refundDate, setRefundDate] = useState('');
  const [closePoNote, setClosePoNote] = useState('');
  
  const [deleteConfirmPoId, setDeleteConfirmPoId] = useState<string|null>(null);
  const [expandedPoId, setExpandedPoId] = useState<string|null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  const [shaking, setShaking] = useState<Record<string, boolean>>({});
  const triggerShake = (id: string) => {
    setShaking(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setShaking(prev => ({ ...prev, [id]: false })), 500);
  };
  
  const parseCommasToNumber = (val: string) => parseFloat(cleanCommas(val)) || 0;
  const formatToYYYYMMDD = (d: Date) => d.toISOString().split('T')[0];
  
  const getFreightStatus = (f: string) => {
    return 'Pending';
  };
  
  const [isBulkReceiveScanOpen, setIsBulkReceiveScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState(1);
  const [scannedPos, setScannedPos] = useState<any[]>([]);
  const [scanSuccessToast, setScanSuccessToast] = useState<string | null>(null);

  const handleStopBulkReceiveScan = async () => {};
`;

code = code.replace(/const ensureAccountExists = async[\s\S]*?createdAt: Timestamp\.now\(\)\n            \}\);\n          \}\n          await batch\.commit\(\);/,
  `const ensureAccountExists = async (code: string, name: string, type: 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses', subType: string) => {
  const docRef = doc(db, 'coa', code);
  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        id: code,
        code,
        name,
        type,
        subType,
        isActive: true,
        createdAt: Timestamp.now()
      });
    }
  } catch (err) {
    console.error(\`Failed to ensure account \${name} exists:\`, err);
  }
};
${reconstructedCode}
`
);

fs.writeFileSync('src/components/PurchasesTab.tsx', code);
console.log('Reconstructed PurchasesTab top 2');
