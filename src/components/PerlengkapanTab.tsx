import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { FALLBACK_NTD_PER_IDR, FALLBACK_NTD_PER_USD } from '../lib/exchangeRateConstants';
import { 
  collection, 
  onSnapshot, 
  doc, 
  writeBatch, 
  Timestamp, 
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteField,
  runTransaction
} from 'firebase/firestore';
import { useAuth } from '../lib/auth-context';
import { 
  Plus, 
  Trash2, 
  X, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  ArrowRight, 
  Lock,
  Receipt,
  FileText,
  AlertCircle,
  Undo2,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Search,
  PlusCircle,
  MinusCircle,
  History,
  Archive
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { formatNTD, formatIDR, getAccountBalanceForPeriod, isParentAccount, formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { isPeriodClosed, parseToDate, getYearMonth } from '../lib/period-closing-utils';
import { ensureAutoAccountExists, AUTO_ACCOUNTS, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { CoaAccount, JournalEntry } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface ButtonWithTooltipProps {
  onClick: () => void;
  title: string;
  className: string;
  children: React.ReactNode;
}

const ButtonWithTooltip: React.FC<ButtonWithTooltipProps> = ({ onClick, title, className, children }) => {
  return (
    <div className="relative group flex items-center justify-center">
      <button
        onClick={onClick}
        className={className}
        type="button"
      >
        {children}
      </button>
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 opacity-0 group-hover:opacity-100 transition-all duration-150 origin-bottom bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[10px] font-bold px-2 py-1 rounded-md shadow-lg whitespace-nowrap z-50 pointer-events-none">
        {title}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-white" />
      </div>
    </div>
  );
};

export const PerlengkapanTab: React.FC = () => {
  const { user, profile } = useAuth();
  
  // Real-time Firestore Subscriptions
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  
  // UI Loading and Interaction states
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  
  // Category management modals
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState<boolean>(false);
  const [categoryName, setCategoryName] = useState<string>('');
  const [categoryAdjustmentAccountCode, setCategoryAdjustmentAccountCode] = useState<string>('');
  
  // Purchase management modals
  const [selectedCategoryForPurchase, setSelectedCategoryForPurchase] = useState<any | null>(null);
  const [itemNameInput, setItemNameInput] = useState<string>('');
  const [showItemSuggestions, setShowItemSuggestions] = useState<boolean>(false);
  const [currency, setCurrency] = useState<'RP' | 'NTD'>('NTD');
  const [priceRaw, setPriceRaw] = useState<string>('');
  const [qtyRaw, setQtyRaw] = useState<string>('');
  const [totalRaw, setTotalRaw] = useState<string>('');
  const [buyDate, setBuyDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Reset form states when modal opens
  useEffect(() => {
    if (selectedCategoryForPurchase) {
      setItemNameInput('');
      setPriceRaw('');
      setQtyRaw('');
      setTotalRaw('');
      setCurrency('NTD');
    }
  }, [selectedCategoryForPurchase]);

  const handleQtyChange = (val: string) => {
    const cleanVal = cleanCommas(val);
    const formatted = formatInputWithCommas(val);
    setQtyRaw(formatted);
    const q = parseFloat(cleanVal);
    if (!isNaN(q) && q > 0) {
      const pStr = cleanCommas(priceRaw);
      const tStr = cleanCommas(totalRaw);
      if (pStr && pStr !== '') {
        const p = parseFloat(pStr);
        if (!isNaN(p)) {
          const t = q * p;
          setTotalRaw(t > 0 ? formatInputWithCommas(String(t)) : '');
        }
      } else if (tStr && tStr !== '') {
        const t = parseFloat(tStr);
        if (!isNaN(t)) {
          const p = t / q;
          setPriceRaw(p > 0 ? formatInputWithCommas(String(p)) : '');
        }
      }
    }
  };

  const handlePriceChange = (val: string) => {
    const cleanVal = cleanCommas(val);
    const formatted = formatInputWithCommas(val);
    setPriceRaw(formatted);
    const p = parseFloat(cleanVal);
    const q = parseFloat(cleanCommas(qtyRaw));
    if (!isNaN(p) && !isNaN(q) && q > 0) {
      const t = q * p;
      setTotalRaw(formatInputWithCommas(String(t)));
    }
  };

  const handleTotalChange = (val: string) => {
    const cleanVal = cleanCommas(val);
    const formatted = formatInputWithCommas(val);
    setTotalRaw(formatted);
    const t = parseFloat(cleanVal);
    const q = parseFloat(cleanCommas(qtyRaw));
    if (!isNaN(t) && !isNaN(q) && q > 0) {
      const p = t / q;
      setPriceRaw(formatInputWithCommas(String(p)));
    }
  };
  
  // Live rate calculation
  const [liveRates, setLiveRates] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('last_fetched_rates');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return {
            IDR: FALLBACK_NTD_PER_IDR,
            USD: FALLBACK_NTD_PER_USD,
            NTD: 1.0,
            ...parsed
          };
        }
      }
    } catch (e) {
      console.error(e);
    }
    return { IDR: FALLBACK_NTD_PER_IDR, USD: FALLBACK_NTD_PER_USD, NTD: 1.0 };
  });

  const getIDRRate = () => {
    return liveRates.IDR || FALLBACK_NTD_PER_IDR;
  };

  // New States for Partial Receiving
  const [receivingPurchase, setReceivingPurchase] = useState<any | null>(null);
  const [receiveQtyInput, setReceiveQtyInput] = useState<string>('');
  const [receiveDateInput, setReceiveDateInput] = useState<string>('');
  
  // New States for Closing remaining PO portion
  const [closingPurchase, setClosingPurchase] = useState<any | null>(null);
  const [closeOption, setCloseOption] = useState<'cancel' | 'writeoff'>('cancel');
  const [closeDateInput, setCloseDateInput] = useState<string>('');

  // New States for Single Item Adjustment (Redesign)
  const [adjustingItem, setAdjustingItem] = useState<any | null>(null);
  const [adjustFisikInput, setAdjustFisikInput] = useState<string>('');
  const [adjustAccountCode, setAdjustAccountCode] = useState<string>('5500');
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  const [adjustDate, setAdjustDate] = useState<string>('');

  // New States for Bulk Item Adjustment (Redesign)
  const [isBulkAdjustOpen, setIsBulkAdjustOpen] = useState<boolean>(false);
  const [bulkSearchQuery, setBulkSearchQuery] = useState<string>('');
  const [bulkAdjustments, setBulkAdjustments] = useState<Record<string, number>>({});
  const [bulkAdjustDate, setBulkAdjustDate] = useState<string>('');
  const [bulkAdjustAccountCode, setBulkAdjustAccountCode] = useState<string>('5500');

  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'Semua' | 'Pembelian' | 'Penerimaan' | 'Tutup Sisa' | 'Penyesuaian'>('Semua');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);

  useEffect(() => {
    setHistoryPage(1);
    setConfirmingItemId(null);
  }, [historyTypeFilter, historySearch, isHistoryOpen]);

  // Automatically select default adjustment account code when category modal opens
  useEffect(() => {
    if (isAddCategoryOpen) {
      const expenses = coaAccounts.filter(acc => acc.type === 'Expenses' && !isParentAccount(acc, coaAccounts));
      const has5220 = expenses.some(acc => acc.systemKey === 'beban_perlengkapan');
      if (has5220) {
        setCategoryAdjustmentAccountCode(expenses.find(a => a.systemKey === 'beban_perlengkapan')?.code || '5220');
      } else if (expenses.length > 0) {
        setCategoryAdjustmentAccountCode(expenses[0].code);
      } else {
        setCategoryAdjustmentAccountCode('');
      }
    }
  }, [isAddCategoryOpen, coaAccounts]);

  // Automatically sync single adjustment account code with item's category configuration
  useEffect(() => {
    if (adjustingItem) {
      const categoryOfItem = categories.find(c => c.id === adjustingItem.categoryId);
      if (categoryOfItem?.adjustmentAccountCode) {
        setAdjustAccountCode(categoryOfItem.adjustmentAccountCode);
      } else {
        setAdjustAccountCode('5500'); // Fallback default
      }
    }
  }, [adjustingItem, categories]);

  // Memoized transaction history compiled live from journalEntries and perlengkapanPurchases
  const historyItems = React.useMemo(() => {
    const list: any[] = [];

    // 1. Pembelian (from active receipt journals: JU-PL-[purchaseId]-buy)
    const receiptJournals = journals.filter(
      (j) => j.id.startsWith('JU-PL-') && j.id.includes('-buy')
    );

    receiptJournals.forEach((j) => {
      const purchaseId = j.refId || j.id.split('-')[2];
      const purchase = purchases.find((p) => p.id === purchaseId);
      
      let qty = purchase?.qty || 0;
      const qtyMatch = j.description.match(/(?:\(|\bJumlah:\s*)(\d+(\.\d+)?)\s*(?:pcs\b|\))/);
      if (qtyMatch) {
        qty = parseFloat(qtyMatch[1]);
      }

      list.push({
        id: j.id,
        type: 'Pembelian',
        typeName: 'Pembelian Perlengkapan',
        date: j.date ? parseToDate(j.date) : new Date(),
        description: j.description,
        itemName: purchase?.itemName || (() => {
          const matchNew = j.description.match(/\*\*Pembelian\*\*\s*-\s*\*.*?\*\s*-\s*(.*?),\s*Jumlah:/);
          if (matchNew) return matchNew[1];
          const matchSimple = j.description.match(/Pembelian\s*-\s*.*?\s*-\s*(.*?),\s*Jumlah:/);
          if (matchSimple) return matchSimple[1];
          return j.description.replace('Penerimaan Perlengkapan: ', '').split(' (')[0];
        })(),
        docNo: purchase?.docNo || '-',
        currency: purchase?.currency || 'NTD',
        qty: qty,
        amountNTD: (j.lines.find((l: any) => l.accountCode === '1130')?.debit || 0) / 100 || (purchase ? qty * purchase.pricePerUnitNTD : 0),
        rawJournal: j
      });
    });

    // 1.5. Penerimaan (from receipts array of each purchase doc)
    purchases.forEach((p) => {
      if (Array.isArray(p.receipts) && p.receipts.length > 0) {
        p.receipts.forEach((receipt, idx) => {
          list.push({
            id: receipt.id || `${p.id}-rec-${idx}`,
            type: 'Penerimaan',
            typeName: 'Penerimaan Barang',
            date: receipt.date ? parseToDate(receipt.date) : (p.updatedAt ? parseToDate(p.updatedAt) : parseToDate(p.date)),
            description: `Menerima ${receipt.qty} pcs untuk ${p.itemName} (Dokumen: ${p.docNo})`,
            itemName: p.itemName,
            docNo: p.docNo || '-',
            currency: p.currency || 'NTD',
            qty: receipt.qty,
            amountNTD: receipt.amountNTD || (receipt.qty * p.pricePerUnitNTD),
            rawPurchase: p
          });
        });
      } else if (p.qtyReceived > 0) {
        // Fallback for older entries with qtyReceived but no receipts array
        list.push({
          id: `${p.id}-rec-fallback`,
          type: 'Penerimaan',
          typeName: 'Penerimaan Barang',
          date: p.updatedAt ? parseToDate(p.updatedAt) : parseToDate(p.date),
          description: `Menerima ${p.qtyReceived} pcs untuk ${p.itemName} (Dokumen: ${p.docNo})`,
          itemName: p.itemName,
          docNo: p.docNo || '-',
          currency: p.currency || 'NTD',
          qty: p.qtyReceived,
          amountNTD: p.qtyReceived * p.pricePerUnitNTD,
          rawPurchase: p
        });
      }
    });

    // 2. Tutup Sisa (from purchases where qtyClosed > 0)
    const closedPurchases = purchases.filter((p) => (p.qtyClosed || 0) > 0);

    closedPurchases.forEach((p) => {
      const closeJournal = journals.find(
        (j) => j.id.startsWith(`JU-PL-${p.id}-close-`) || (j.refId === p.id && j.id.includes('-close-'))
      );

      let closeDate = p.updatedAt ? parseToDate(p.updatedAt) : parseToDate(p.date);
      if (closeJournal && closeJournal.date) {
        closeDate = parseToDate(closeJournal.date);
      }

      const method = p.closeOption === 'writeoff' ? 'Catat Rugi (Write-Off)' : 'Batal Sisa (Cancel)';

      list.push({
        id: `${p.id}-close`,
        type: 'Tutup Sisa',
        typeName: 'Tutup Sisa Perlengkapan',
        date: closeDate,
        description: `Tutup Sisa: ${p.itemName} (${p.qtyClosed} pcs) - ${method}`,
        itemName: p.itemName,
        docNo: p.docNo || '-',
        currency: p.currency || 'NTD',
        qty: p.qtyClosed,
        amountNTD: p.qtyClosed * p.pricePerUnitNTD,
        closeOption: p.closeOption,
        rawJournal: closeJournal,
        rawPurchase: p
      });
    });

    // 3. Penyesuaian Stok & Write-Off (from journal entries starting with JU-ADJ-PL- or JU-WO-PERLENGKAPAN-)
    const adjustmentJournals = journals.filter(
      (j) => j.id.startsWith('JU-ADJ-PL-') || j.id.startsWith('JU-WO-PERLENGKAPAN-')
    );

    adjustmentJournals.forEach((j) => {
      const isWriteOff = j.id.startsWith('JU-WO-PERLENGKAPAN-');
      const isBulk = j.id.includes('-BULK-');
      let typeName = 'Penyesuaian Stok';
      if (isWriteOff) {
        typeName = 'Write-Off Stok';
      } else if (isBulk) {
        typeName = 'Penyesuaian Massal';
      }

      const perlengkapanLine = j.lines.find((l: any) => l.accountCode === '1130');
      const valueCents = perlengkapanLine ? (perlengkapanLine.debit || perlengkapanLine.credit || 0) : 0;
      const amountNTD = valueCents / 100;

      let itemName = 'Perlengkapan';
      let qtyStr = '';
      if (isWriteOff) {
        const match = j.description.match(/Write-Off Penyesuaian Nilai Perlengkapan:\s*(.*?)\s*\((\d+)\s*pcs/);
        const matchNew = j.description.match(/\*\*Tutup & Catat Rugi\*\*\s*-\s*\*.*?\*\s*-\s*(.*?),\s*Jumlah:\s*(\d+)\s*pcs/);
        if (match) {
          itemName = match[1];
          qtyStr = `-${match[2]} pcs`;
        } else if (matchNew) {
          itemName = matchNew[1];
          qtyStr = `-${matchNew[2]} pcs`;
        } else {
          const item = items.find(it => it.id === j.refId || j.id.includes(it.id));
          if (item) {
            itemName = item.name;
          }
        }
      } else {
        const match = j.description.match(/(Adjustment Kurang|Adjustment Tambah|Penyesuaian Massal) Stok Perlengkapan:\s*(.*?)\s*\(([-+\d]+)\s*pcs/);
        if (match) {
          itemName = match[2];
          qtyStr = `${match[3]} pcs`;
        } else {
          const item = items.find(it => it.id === j.refId || j.id.includes(it.id));
          if (item) {
            itemName = item.name;
          }
        }
      }

      list.push({
        id: j.id,
        type: 'Penyesuaian',
        typeName: typeName,
        date: j.date ? parseToDate(j.date) : new Date(),
        description: j.description,
        itemName: itemName,
        docNo: '-',
        currency: 'NTD',
        qty: qtyStr || '-',
        amountNTD: amountNTD,
        rawJournal: j
      });
    });

    return list.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [journals, purchases, items, categories]);

  // Custom confirmation modal state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const triggerConfirm = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm
    });
  };

  // Subscribe to all relevant Firestore collections on load
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // 1. Subscribe to categories
    const unsubCategories = onSnapshot(collection(db, 'perlengkapanCategories'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'perlengkapanCategories');
    });

    // 2. Subscribe to items stock records
    const unsubItems = onSnapshot(collection(db, 'perlengkapanItems'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setItems(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'perlengkapanItems');
    });

    // 3. Subscribe to purchases history
    const unsubPurchases = onSnapshot(collection(db, 'perlengkapanPurchases'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      // Sort newest first
      list.sort((a, b) => {
        const tA = a.date?.seconds || 0;
        const tB = b.date?.seconds || 0;
        return tB - tA;
      });
      setPurchases(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'perlengkapanPurchases');
    });

    // 4. Subscribe to closed periods
    const unsubClosings = onSnapshot(collection(db, 'periodClosings'), (snap) => {
      const closedList: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.status === 'Ditutup') {
          closedList.push(d.id);
        }
      });
      setClosedPeriods(closedList);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'periodClosings');
    });

    // 5. Subscribe to CoA accounts
    const unsubCoA = onSnapshot(collection(db, 'coa'), (snap) => {
      const list: CoaAccount[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as CoaAccount);
      });
      setCoaAccounts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'coa');
    });

    // 6. Subscribe to journal entries for 1130 ledger balance lookup
    const unsubJournals = onSnapshot(collection(db, 'journalEntries'), (snap) => {
      const list: JournalEntry[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as JournalEntry);
      });
      setJournals(list);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'journalEntries');
    });

    return () => {
      unsubCategories();
      unsubItems();
      unsubPurchases();
      unsubClosings();
      unsubCoA();
      unsubJournals();
    };
  }, [user]);

  // Display success/error toasts briefly
  const triggerToast = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 5000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 5000);
    }
  };

  // Helper: Find CoaAccount for 1130 Perlengkapan
  const getAccount1130 = (): CoaAccount | undefined => {
    return coaAccounts.find(a => a.code === '1130');
  };

  // Calculate Ledger 1130 Balance (NTD real value)
  const getLedger1130Balance = (): number => {
    const acc = getAccount1130();
    if (!acc) return 0;
    return getAccountBalanceForPeriod(acc, coaAccounts, journals, null, null);
  };

  // Calculate Total Physical Stock Value (Sum of qty * avgPrice) across all perlengkapan items
  const getPhysicalStockValue = (): number => {
    return items.reduce((sum, item) => {
      const qty = item.qty || 0;
      const avgPrice = item.avgPrice || 0;
      return sum + (qty * avgPrice);
    }, 0);
  };

  // Document code generator format: PL[YY][MM][DD][2-digit sequence], resetting daily
  const generateNextPLDocCode = (dateStr: string): string => {
    // dateStr is YYYY-MM-DD
    const cleanDate = dateStr.replace(/-/g, '');
    const yy = cleanDate.slice(2, 4);
    const mm = cleanDate.slice(4, 6);
    const dd = cleanDate.slice(6, 8);
    const datePrefix = `PL${yy}${mm}${dd}`;

    const dailyPurchases = purchases.filter(p => p.docNo && p.docNo.startsWith(datePrefix));
    let nextSeq = 1;
    if (dailyPurchases.length > 0) {
      const seqs = dailyPurchases.map(p => {
        const numPart = parseInt(p.docNo.slice(8));
        return isNaN(numPart) ? 0 : numPart;
      });
      nextSeq = Math.max(...seqs) + 1;
    }

    return `${datePrefix}${String(nextSeq).padStart(2, '0')}`;
  };

  // Create Category Handler
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    setSubmitting(true);
    try {
      // Check if period is locked
      const todayStr = new Date().toISOString().split('T')[0];
      if (isPeriodClosed(todayStr, closedPeriods)) {
        triggerToast('Gagal: Periode akuntansi saat ini terkunci!', 'error');
        setSubmitting(false);
        return;
      }

      // Check for duplication
      const isDuplicate = categories.some(c => (c.name || '').toLowerCase() === categoryName.trim().toLowerCase());
      if (isDuplicate) {
        triggerToast(`Kategori "${categoryName}" sudah ada!`, 'error');
        setSubmitting(false);
        return;
      }

      if (!categoryAdjustmentAccountCode) {
        triggerToast('Gagal: Silakan pilih Jurnal Penyesuaian (Akun Beban) terlebih dahulu!', 'error');
        setSubmitting(false);
        return;
      }

      const id = `cat_${Date.now()}`;
      await setDoc(doc(db, 'perlengkapanCategories', id), {
        id,
        name: categoryName.trim(),
        adjustmentAccountCode: categoryAdjustmentAccountCode,
        createdAt: Timestamp.now()
      });

      // Auto-ensure COA 1130 exists
      await ensureAutoAccountExists({
        ...AUTO_ACCOUNTS.PERLENGKAPAN,
        name: 'Perlengkapan',
        type: 'Assets',
        subType: 'Aset Lancar'
      });

      triggerToast(`Berhasil menambah kategori "${categoryName.trim()}"`, 'success');
      setCategoryName('');
      setIsAddCategoryOpen(false);
    } catch (err) {
      console.error(err);
      triggerToast('Gagal menambahkan kategori.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Beli Perlengkapan Handler (Creates directly completed order with auto-journal & stock update)
  const handleBeliPerlengkapan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryForPurchase || !itemNameInput.trim()) return;

    const qtyVal = parseFloat(cleanCommas(qtyRaw)) || 0;
    let priceVal = parseFloat(cleanCommas(priceRaw)) || 0;
    const totalVal = parseFloat(cleanCommas(totalRaw)) || 0;

    if (qtyVal <= 0) {
      triggerToast('Jumlah barang harus lebih besar dari 0!', 'error');
      return;
    }

    if (priceVal <= 0 && totalVal > 0) {
      priceVal = totalVal / qtyVal;
    }

    if (priceVal <= 0) {
      triggerToast('Harga Satuan atau Total Pembelian harus lebih besar dari 0!', 'error');
      return;
    }

    if (isPeriodClosed(buyDate, closedPeriods)) {
      triggerToast(`Periode akuntansi untuk tanggal ${buyDate} sudah ditutup/terkunci!`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const docNo = generateNextPLDocCode(buyDate);
      const purchaseId = `pl_${Date.now()}`;
      
      const rate = currency === 'RP' ? getIDRRate() : 1.0;
      const pricePerUnitNTD = currency === 'RP' ? priceVal * rate : priceVal;
      const totalNTD = pricePerUnitNTD * qtyVal;

      await ensureAutoAccountExists(AUTO_ACCOUNTS.PERLENGKAPAN);
      
      const isIdr = currency === 'RP';
      const cashAcc = isIdr 
        ? { ...AUTO_ACCOUNTS.CASH_RUPIAH, }
        : AUTO_ACCOUNTS.CASH_NTD;
      
      await ensureAutoAccountExists(cashAcc);

      const batch = writeBatch(db);

      const tglBuy = buyDate || new Date().toISOString().split('T')[0];
      const journalId = await getNextJournalId(tglBuy);
      const journalRef = doc(db, 'journalEntries', journalId);

      const totalCents = Math.round(totalNTD * 100);

      const journalPayload: any = {
        id: journalId,
        date: Timestamp.fromDate(new Date(buyDate)),
        description: `Pembelian - ${selectedCategoryForPurchase.name} - ${itemNameInput.trim()}, Jumlah: ${qtyVal} pcs`,
        refType: 'Expenses',
        refId: purchaseId,
        createdAt: Timestamp.now(),
        lines: [
          {
            account: 'Perlengkapan',
            accountCode: '1130',
            debit: totalCents,
            credit: 0,
            ...(isIdr ? {
              originalCurrency: 'IDR',
              originalDebitIDR: priceVal * qtyVal,
              originalCreditIDR: 0
            } : {})
          },
          {
            account: cashAcc.name,
            accountCode: cashAcc.code,
            debit: 0,
            credit: totalCents,
            ...(isIdr ? {
              originalCurrency: 'IDR',
              originalDebitIDR: 0,
              originalCreditIDR: priceVal * qtyVal
            } : {})
          }
        ]
      };

      batch.set(journalRef, journalPayload);

      // Create Purchase Doc with status: Pending
      const payload = {
        id: purchaseId,
        docNo,
        categoryId: selectedCategoryForPurchase.id,
        itemName: itemNameInput.trim(),
        qty: qtyVal,
        qtyReceived: 0,
        currency,
        pricePerUnit: priceVal,
        exchangeRate: rate,
        pricePerUnitNTD: pricePerUnitNTD,
        totalNTD: totalNTD,
        status: 'Pending',
        date: Timestamp.fromDate(new Date(buyDate)),
        journalId: journalId,
        journalIds: [journalId],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      batch.set(doc(db, 'perlengkapanPurchases', purchaseId), payload);
      await batch.commit();

      triggerToast(`Dokumen Pembelian ${docNo} berhasil diajukan dengan status Pending beserta Jurnal Pembelian!`, 'success');
      
      // Reset form states
      setItemNameInput('');
      setPriceRaw('');
      setQtyRaw('');
      setTotalRaw('');
      setSelectedCategoryForPurchase(null);
    } catch (err) {
      console.error(err);
      triggerToast('Gagal memproses pengajuan pembelian.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Terima / Accept Purchase order (Opens partial receipt modal)
  const handleAcceptPurchase = (purchase: any) => {
    if (isPeriodClosed(purchase.date, closedPeriods)) {
      triggerToast('Gagal: Transaksi berada di periode akuntansi yang telah ditutup!', 'error');
      return;
    }
    setReceivingPurchase(purchase);
    const remaining = purchase.qty - (purchase.qtyReceived || 0);
    setReceiveQtyInput(formatInputWithCommas(String(remaining)));
    setReceiveDateInput(new Date().toISOString().split('T')[0]);
  };

  // Confirm Receive Goods (Partial or Full)
  const handleConfirmReceiveGoods = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPurchase) return;

    const qtyToRec = parseFloat(cleanCommas(receiveQtyInput)) || 0;
    const remaining = receivingPurchase.qty - (receivingPurchase.qtyReceived || 0);

    if (qtyToRec <= 0 || qtyToRec > remaining) {
      triggerToast(`Kuantitas yang diterima harus antara 0 dan ${remaining}!`, 'error');
      return;
    }

    if (isPeriodClosed(receiveDateInput, closedPeriods)) {
      triggerToast(`Periode akuntansi untuk tanggal ${receiveDateInput} sudah ditutup/terkunci!`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      // Re-validate from DB first
      const purchaseRef = doc(db, 'perlengkapanPurchases', receivingPurchase.id);
      const latestSnap = await getDoc(purchaseRef);
      if (!latestSnap.exists()) {
        triggerToast('Gagal: Transaksi tidak ditemukan!', 'error');
        setSubmitting(false);
        return;
      }
      
      const dbPurchase = latestSnap.data();
      const currentStatus = dbPurchase.status;
      if (currentStatus !== 'Pending' && currentStatus !== 'Diterima Sebagian') {
        triggerToast(`Gagal: Transaksi sudah diselesaikan atau dibatalkan! (Status: ${currentStatus})`, 'error');
        setSubmitting(false);
        return;
      }

      const batch = writeBatch(db);

      // Update Stock and Moving Average
      const itemQuery = query(
        collection(db, 'perlengkapanItems'),
        where('categoryId', '==', receivingPurchase.categoryId),
        where('name', '==', receivingPurchase.itemName)
      );
      const itemSnap = await getDocs(itemQuery);
      
      let itemId = `item_${Date.now()}`;
      let currentQty = 0;
      let currentAvg = 0;

      if (!itemSnap.empty) {
        const itemDoc = itemSnap.docs[0];
        itemId = itemDoc.id;
        currentQty = itemDoc.data().qty || 0;
        currentAvg = itemDoc.data().avgPrice || 0;
      }

      const newQty = currentQty + qtyToRec;
      const newAvg = newQty > 0 
        ? ((currentQty * currentAvg) + (qtyToRec * receivingPurchase.pricePerUnitNTD)) / newQty
        : 0;

      const itemRef = doc(db, 'perlengkapanItems', itemId);
      batch.set(itemRef, {
        id: itemId,
        categoryId: receivingPurchase.categoryId,
        name: receivingPurchase.itemName,
        qty: newQty,
        avgPrice: newAvg,
        createdAt: itemSnap.empty ? Timestamp.now() : itemSnap.docs[0].data().createdAt || Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      // Update Purchase Doc
      const nextReceivedQty = (dbPurchase.qtyReceived || 0) + qtyToRec;
      const nextStatus = nextReceivedQty >= receivingPurchase.qty ? 'Diterima' : 'Diterima Sebagian';

      const newReceipt = {
        id: `rec_${Date.now()}`,
        date: Timestamp.fromDate(new Date(receiveDateInput)),
        qty: qtyToRec,
        amountNTD: qtyToRec * receivingPurchase.pricePerUnitNTD
      };

      const updatedReceipts = Array.isArray(dbPurchase.receipts) 
        ? [...dbPurchase.receipts, newReceipt] 
        : [newReceipt];

      batch.update(purchaseRef, {
        status: nextStatus,
        qtyReceived: nextReceivedQty,
        itemId,
        receipts: updatedReceipts,
        updatedAt: Timestamp.now()
      });

      await batch.commit();
      triggerToast(`Dokumen ${receivingPurchase.docNo} berhasil menerima ${qtyToRec} pcs!`, 'success');
      setReceivingPurchase(null);
    } catch (err) {
      console.error(err);
      triggerToast('Gagal memproses penerimaan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Close PO / Tutup Sisa Modal
  const handleOpenClosePurchase = (purchase: any) => {
    setClosingPurchase(purchase);
    setCloseOption('cancel');
    setCloseDateInput(new Date().toISOString().split('T')[0]);
  };

  // Confirm Tutup Sisa PO
  const handleConfirmClosePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingPurchase) return;

    if (isPeriodClosed(closeDateInput, closedPeriods)) {
      triggerToast(`Periode akuntansi untuk tanggal ${closeDateInput} sudah ditutup/terkunci!`, 'error');
      return;
    }

    const remainingQty = closingPurchase.qty - (closingPurchase.qtyReceived || 0);
    if (remainingQty <= 0) {
      triggerToast('Tidak ada kuantitas sisa yang bisa ditutup!', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const purchaseRef = doc(db, 'perlengkapanPurchases', closingPurchase.id);
      const latestSnap = await getDoc(purchaseRef);
      if (!latestSnap.exists()) {
        triggerToast('Gagal: Transaksi tidak ditemukan!', 'error');
        setSubmitting(false);
        return;
      }

      const dbPurchase = latestSnap.data();
      if (dbPurchase.status !== 'Diterima Sebagian') {
        triggerToast('Gagal: Transaksi harus berstatus Diterima Sebagian untuk dapat ditutup sisanya!', 'error');
        setSubmitting(false);
        return;
      }

      const batch = writeBatch(db);
      let updatedJournalIds = dbPurchase.journalIds || (dbPurchase.journalId ? [dbPurchase.journalId] : []);

      const category = categories.find(c => c.id === closingPurchase.categoryId);
      const categoryName = category ? category.name : '';

      const isIdr = closingPurchase.currency === 'RP';
      const cashAcc = isIdr 
        ? { ...AUTO_ACCOUNTS.CASH_RUPIAH, }
        : AUTO_ACCOUNTS.CASH_NTD;

      const calculatedNTD = remainingQty * closingPurchase.pricePerUnitNTD;
      const amountCents = Math.round(calculatedNTD * 100);

      const closeDateStr = new Date().toISOString().split('T')[0];
      const journalId = await getNextJournalId(closeDateStr);
      const journalRef = doc(db, 'journalEntries', journalId);

      if (closeOption === 'cancel') {
        // Refund Option
        await ensureAutoAccountExists(cashAcc);
        await ensureAutoAccountExists(AUTO_ACCOUNTS.PERLENGKAPAN);

        const journalPayload: any = {
          id: journalId,
          date: Timestamp.fromDate(new Date(closeDateInput)),
          description: `【${closingPurchase.docNo}]\n**Refund** - *${categoryName}* - ${closingPurchase.itemName}, Jumlah: ${remainingQty} pcs`,
          refType: 'Expenses',
          refId: closingPurchase.id,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: cashAcc.name,
              accountCode: cashAcc.code,
              debit: amountCents,
              credit: 0,
              ...(isIdr ? {
                originalCurrency: 'IDR',
                originalDebitIDR: closingPurchase.pricePerUnit * remainingQty,
                originalCreditIDR: 0
              } : {})
            },
            {
              account: 'Perlengkapan',
              accountCode: '1130',
              debit: 0,
              credit: amountCents,
              ...(isIdr ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: closingPurchase.pricePerUnit * remainingQty
              } : {})
            }
          ]
        };

        batch.set(journalRef, journalPayload);
        updatedJournalIds.push(journalId);

      } else if (closeOption === 'writeoff') {
        // Write-off Option
        await ensureAutoAccountExists({ code: '5500', name: 'Beban Kerugian Pembelian', type: 'Expenses', subType: 'Biaya Umum dan Administrasi' });
        await ensureAutoAccountExists(AUTO_ACCOUNTS.PERLENGKAPAN);

        const journalPayload: any = {
          id: journalId,
          date: Timestamp.fromDate(new Date(closeDateInput)),
          description: `【${closingPurchase.docNo}]\n**Tutup & Catat Rugi** - *${categoryName}* - ${closingPurchase.itemName}, Jumlah: ${remainingQty} pcs`,
          refType: 'Expenses',
          refId: closingPurchase.id,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: 'Beban Kerugian Pembelian',
              accountCode: '5500',
              debit: amountCents,
              credit: 0
            },
            {
              account: 'Perlengkapan',
              accountCode: '1130',
              debit: 0,
              credit: amountCents,
              ...(isIdr ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: closingPurchase.pricePerUnit * remainingQty
              } : {})
            }
          ]
        };

        batch.set(journalRef, journalPayload);
        updatedJournalIds.push(journalId);
      }

      // Mark status as 'Diterima' (completed) but also note down closed qty and method
      batch.update(purchaseRef, {
        status: 'Diterima',
        qtyClosed: remainingQty,
        closeOption: closeOption,
        journalIds: updatedJournalIds,
        updatedAt: Timestamp.now()
      });

      await batch.commit();
      triggerToast(`Sisa perlengkapan sebanyak ${remainingQty} pcs berhasil ditutup (${closeOption === 'writeoff' ? 'Dicatat Rugi' : 'Refund'})!`, 'success');
      setClosingPurchase(null);
    } catch (err) {
      console.error(err);
      triggerToast('Gagal menutup sisa perlengkapan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel / Batalkan Purchase order
  const handleCancelPurchase = async (purchase: any) => {
    setSubmitting(true);
    try {
      // 1. Fetch latest purchase document to see its status, categoryId, itemName, receipts, and dates
      const purchaseRef = doc(db, 'perlengkapanPurchases', purchase.id);
      const latestSnap = await getDoc(purchaseRef);
      if (!latestSnap.exists()) {
        triggerToast('Gagal: Transaksi tidak ditemukan!', 'error');
        setSubmitting(false);
        return;
      }
      const dbPurchase = latestSnap.data();

      // Check closed period for purchase date and any of its receipts' dates
      if (isPeriodClosed(dbPurchase.date, closedPeriods)) {
        triggerToast('Gagal: Transaksi berada di periode akuntansi yang telah ditutup!', 'error');
        setSubmitting(false);
        return;
      }
      if (Array.isArray(dbPurchase.receipts)) {
        const closedReceipt = dbPurchase.receipts.find((r: any) => {
          const rDateStr = r.date instanceof Date 
            ? r.date.toISOString().split('T')[0] 
            : typeof r.date === 'string' 
              ? r.date 
              : r.date?.toDate ? r.date.toDate().toISOString().split('T')[0] : '';
          return isPeriodClosed(rDateStr, closedPeriods);
        });
        if (closedReceipt) {
          triggerToast('Gagal: Salah satu penerimaan berada di periode akuntansi yang telah ditutup!', 'error');
          setSubmitting(false);
          return;
        }
      }

      // Query other purchases for this item before starting transaction
      const itemPurchasesQuery = query(
        collection(db, 'perlengkapanPurchases'),
        where('categoryId', '==', dbPurchase.categoryId),
        where('itemName', '==', dbPurchase.itemName)
      );
      const purchasesSnap = await getDocs(itemPurchasesQuery);

      // Query all associated journal entries before starting transaction
      const journalsQuery = query(
        collection(db, 'journalEntries'),
        where('refId', '==', purchase.id)
      );
      const journalsSnap = await getDocs(journalsQuery);

      // Find item doc before starting transaction
      const itemQuery = query(
        collection(db, 'perlengkapanItems'),
        where('categoryId', '==', dbPurchase.categoryId),
        where('name', '==', dbPurchase.itemName)
      );
      const itemSnap = await getDocs(itemQuery);
      let itemId = null;
      if (!itemSnap.empty) {
        itemId = itemSnap.docs[0].id;
      }

      // Start runTransaction with strict read-before-write constraint
      await runTransaction(db, async (transaction) => {
        // --- 1. ALL READS FIRST ---
        
        // Read purchase doc inside transaction
        const pDoc = await transaction.get(purchaseRef);
        if (!pDoc.exists()) {
          console.warn('Purchase document not found inside transaction.');
          return;
        }
        const activePurchase = pDoc.data();

        // Read item doc inside transaction
        let itemRef = null;
        let itemExists = false;
        if (itemId) {
          itemRef = doc(db, 'perlengkapanItems', itemId);
          const itemSnapDoc = await transaction.get(itemRef);
          itemExists = itemSnapDoc.exists();
        }

        // Fetch all other purchase documents inside the transaction
        const latestPurchases = [];
        for (const docSnap of purchasesSnap.docs) {
          const latestPDoc = await transaction.get(doc(db, 'perlengkapanPurchases', docSnap.id));
          if (latestPDoc.exists()) {
            latestPurchases.push({ id: docSnap.id, ...latestPDoc.data() });
          }
        }

        // Fetch all associated journals inside the transaction
        const latestJournals = [];
        for (const docSnap of journalsSnap.docs) {
          const jDoc = await transaction.get(doc(db, 'journalEntries', docSnap.id));
          if (jDoc.exists()) {
            latestJournals.push({ id: docSnap.id, ...jDoc.data() });
          }
        }

        // Also fetch by ID for any known journal IDs on the purchase document
        const knownJournalIds = Array.isArray(activePurchase.journalIds) 
          ? activePurchase.journalIds 
          : (activePurchase.journalId ? [activePurchase.journalId] : []);

        for (const jId of knownJournalIds) {
          if (!latestJournals.some(j => j.id === jId)) {
            const jDoc = await transaction.get(doc(db, 'journalEntries', jId));
            if (jDoc.exists()) {
              latestJournals.push({ id: jId, ...jDoc.data() });
            }
          }
        }

        // --- 2. CALCULATIONS ---

        // Gather all valid receipts from other purchases of this item (excluding this one)
        const allValidReceipts: { id: string; date: Date; qty: number; pricePerUnitNTD: number }[] = [];
        latestPurchases.forEach((pData) => {
          if (pData.id === purchase.id) {
            // Exclude this purchase being deleted
            return;
          }
          if (pData.status === 'Batal') return;

          let rList = Array.isArray(pData.receipts) ? pData.receipts : [];
          if (rList.length === 0 && (pData.qtyReceived || 0) > 0) {
            rList = [{
              id: `${pData.id}-rec-fallback`,
              date: pData.updatedAt || pData.date || Timestamp.now(),
              qty: pData.qtyReceived,
              amountNTD: pData.qtyReceived * (pData.pricePerUnitNTD || 0)
            }];
          }
          rList.forEach((r) => {
            const rDate = r.date?.toDate 
              ? r.date.toDate() 
              : r.date instanceof Date 
                ? r.date 
                : r.date?.seconds 
                  ? new Date(r.date.seconds * 1000) 
                  : new Date(r.date);
            allValidReceipts.push({
              id: r.id,
              date: rDate,
              qty: r.qty,
              pricePerUnitNTD: pData.pricePerUnitNTD || 0
            });
          });
        });

        // Recalculate stock and moving average chronologically
        allValidReceipts.sort((a, b) => a.date.getTime() - b.date.getTime());
        let finalQty = 0;
        let finalAvgPrice = 0;
        allValidReceipts.forEach((r) => {
          const prevQty = finalQty;
          const prevAvg = finalAvgPrice;
          finalQty += r.qty;
          if (finalQty > 0) {
            finalAvgPrice = ((prevQty * prevAvg) + (r.qty * r.pricePerUnitNTD)) / finalQty;
          } else {
            finalAvgPrice = 0;
          }
        });

        // --- 3. ALL WRITES NEXT ---

        // Delete purchase doc
        transaction.delete(purchaseRef);

        // Delete all associated journals
        latestJournals.forEach((j) => {
          transaction.delete(doc(db, 'journalEntries', j.id));
        });

        // Update item stock & avg price
        if (itemRef && itemExists) {
          transaction.update(itemRef, {
            qty: finalQty,
            avgPrice: finalAvgPrice,
            updatedAt: Timestamp.now()
          });
        }
      });

      triggerToast(`Pembelian ${purchase.docNo} berhasil dibatalkan dan dihapus secara permanen beserta data turunan dan jurnalnya.`, 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast('Gagal membatalkan pembelian: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete all transaction history from database
  const handleDeleteAllHistory = async () => {
    // Check if any of the historyItems are in closed periods
    const hasClosedPeriodTransaction = historyItems.some((item) => {
      const itemDateStr = item.date instanceof Date 
        ? item.date.toISOString().split('T')[0] 
        : typeof item.date === 'string' 
          ? item.date 
          : '';
      return isPeriodClosed(itemDateStr, closedPeriods);
    });

    if (hasClosedPeriodTransaction) {
      triggerToast('Gagal: Terdapat transaksi riwayat di dalam periode akuntansi yang telah ditutup! Harap buka periode tersebut terlebih dahulu.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);

      // 1. Delete all perlengkapanPurchases
      purchases.forEach((p) => {
        batch.delete(doc(db, 'perlengkapanPurchases', p.id));
      });

      // 2. Delete all matching journal entries
      const listToDel = journals.filter(
        (j) => j.id.startsWith('JU-PL-') || j.id.startsWith('JU-WO-PERLENGKAPAN-') || j.id.startsWith('JU-ADJ-PL-')
      );
      listToDel.forEach((j) => {
        batch.delete(doc(db, 'journalEntries', j.id));
      });

      // 3. Reset all items in perlengkapanItems (qty to 0, avgPrice to 0)
      items.forEach((item) => {
        batch.update(doc(db, 'perlengkapanItems', item.id), {
          qty: 0,
          avgPrice: 0,
          updatedAt: Timestamp.now()
        });
      });

      await batch.commit();
      triggerToast('Seluruh riwayat transaksi perlengkapan dan jurnal terkait berhasil dihapus secara permanen dari database.', 'success');
      setIsHistoryOpen(false);
    } catch (err) {
      console.error(err);
      triggerToast('Gagal menghapus seluruh riwayat transaksi.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Reverse receipt (Rollback Diterima or Diterima Sebagian -> Pending)
  // If receiptId is provided, only reverse that specific receipt. Otherwise, reverse the whole purchase receipts.
  const handleReversePurchase = async (purchase: any, receiptId?: string) => {
    setSubmitting(true);
    try {
      // 1. Fetch latest purchase document to see its status, categoryId, itemName, receipts, and buy date
      const purchaseRef = doc(db, 'perlengkapanPurchases', purchase.id);
      const latestSnap = await getDoc(purchaseRef);
      if (!latestSnap.exists()) {
        triggerToast('Gagal: Transaksi tidak ditemukan!', 'error');
        setSubmitting(false);
        return;
      }
      const dbPurchase = latestSnap.data();

      // Determine date to check closed period
      let targetDateToCheck = dbPurchase.date;
      if (receiptId && Array.isArray(dbPurchase.receipts)) {
        const targetRec = dbPurchase.receipts.find((r: any, idx: number) => {
          if (r.id && r.id === receiptId) return true;
          const fallbackId = `${purchase.id}-rec-${idx}`;
          if (fallbackId === receiptId) return true;
          return false;
        });
        if (targetRec && targetRec.date) {
          targetDateToCheck = targetRec.date;
        }
      }

      if (isPeriodClosed(targetDateToCheck, closedPeriods)) {
        triggerToast('Gagal: Transaksi berada di periode akuntansi yang telah ditutup!', 'error');
        setSubmitting(false);
        return;
      }

      // Query other purchases for this item before starting transaction
      const itemPurchasesQuery = query(
        collection(db, 'perlengkapanPurchases'),
        where('categoryId', '==', dbPurchase.categoryId),
        where('itemName', '==', dbPurchase.itemName)
      );
      const purchasesSnap = await getDocs(itemPurchasesQuery);

      // Find item doc before starting transaction
      const itemQuery = query(
        collection(db, 'perlengkapanItems'),
        where('categoryId', '==', dbPurchase.categoryId),
        where('name', '==', dbPurchase.itemName)
      );
      const itemSnap = await getDocs(itemQuery);
      let itemId = null;
      if (!itemSnap.empty) {
        itemId = itemSnap.docs[0].id;
      }

      // Start runTransaction
      await runTransaction(db, async (transaction) => {
        // Read latest data inside transaction (strict read-before-write constraint)
        const pDoc = await transaction.get(purchaseRef);
        if (!pDoc.exists()) {
          console.warn('Purchase document not found inside transaction.');
          return;
        }
        const activePurchase = pDoc.data();

        let itemRef = null;
        let itemExists = false;
        if (itemId) {
          itemRef = doc(db, 'perlengkapanItems', itemId);
          // Pre-fetch it inside transaction to lock and obey read-before-write
          const itemSnapDoc = await transaction.get(itemRef);
          itemExists = itemSnapDoc.exists();
        }

        // Fetch all other purchase documents inside the transaction to get their latest states
        const latestPurchases = [];
        for (const docSnap of purchasesSnap.docs) {
          const latestPDoc = await transaction.get(doc(db, 'perlengkapanPurchases', docSnap.id));
          if (latestPDoc.exists()) {
            latestPurchases.push({ id: docSnap.id, ...latestPDoc.data() });
          }
        }

        // Determine: which receipts to keep
        let nextReceipts = Array.isArray(activePurchase.receipts) ? [...activePurchase.receipts] : [];
        let nextReceivedQty = activePurchase.qtyReceived || 0;
        let shouldDeleteClosingJournals = false;

        if (receiptId) {
          const receiptIndex = nextReceipts.findIndex((r: any, idx: number) => {
            if (r.id && r.id === receiptId) return true;
            const fallbackId = `${purchase.id}-rec-${idx}`;
            if (fallbackId === receiptId) return true;
            return false;
          });

          if (receiptIndex !== -1) {
            nextReceipts.splice(receiptIndex, 1);
            nextReceivedQty = nextReceipts.reduce((sum: number, r: any) => sum + r.qty, 0);
          } else {
            nextReceipts = [];
            nextReceivedQty = 0;
          }

          if (activePurchase.qtyClosed && activePurchase.qtyClosed > 0) {
            shouldDeleteClosingJournals = true;
          }
        } else {
          nextReceipts = [];
          nextReceivedQty = 0;
          shouldDeleteClosingJournals = true;
        }

        // Delete associated journal entries
        let updatedJournalIds = Array.isArray(activePurchase.journalIds) 
          ? [...activePurchase.journalIds] 
          : (activePurchase.journalId ? [activePurchase.journalId] : []);

        if (shouldDeleteClosingJournals) {
          const closeJournalsToDel = updatedJournalIds.filter(jId => jId.includes('-close-'));
          closeJournalsToDel.forEach((jId) => {
            transaction.delete(doc(db, 'journalEntries', jId));
          });
          
          // Also query from live state journals and delete if matches refId and close
          const extraCloseJournals = journals.filter(j => j.refId === purchase.id && j.id.includes('-close-'));
          extraCloseJournals.forEach(ej => {
            transaction.delete(doc(db, 'journalEntries', ej.id));
          });

          // Filter them out from updatedJournalIds
          updatedJournalIds = updatedJournalIds.filter(jId => !jId.includes('-close-'));
        }

        // Gather all valid receipts from all purchases of this item
        const allValidReceipts: { id: string; date: Date; qty: number; pricePerUnitNTD: number }[] = [];

        console.group('[Reverse Receipt Investigation] Batch Filtering and Recalculation');
        console.log('Reversing purchase ID:', purchase.id, 'Specific receiptId to reverse:', receiptId || 'ALL');
        console.log('Target item:', dbPurchase.itemName, 'CategoryId:', dbPurchase.categoryId);

        latestPurchases.forEach((pData) => {
          console.group(`Processing Purchase ID: ${pData.id} (Status: ${pData.status})`);
          if (pData.status === 'Batal') {
            console.log('Filtering: Purchase status is "Batal", skipping all receipts.');
            console.groupEnd();
            return;
          }

          let rList = [];
          if (pData.id === purchase.id) {
            rList = nextReceipts;
            console.log(`Reversing target purchase. Remaining receipts count: ${rList.length}`, rList);
          } else {
            rList = Array.isArray(pData.receipts) ? pData.receipts : [];
            if (rList.length === 0 && (pData.qtyReceived || 0) > 0) {
              rList = [{
                id: `${pData.id}-rec-fallback`,
                date: pData.updatedAt || pData.date || Timestamp.now(),
                qty: pData.qtyReceived,
                amountNTD: pData.qtyReceived * (pData.pricePerUnitNTD || 0)
              }];
              console.log('No receipts found but qtyReceived > 0, using fallback receipt:', rList[0]);
            } else {
              console.log(`Retrieved existing purchase. Receipts count: ${rList.length}`, rList);
            }
          }

          rList.forEach((r, idx) => {
            const rDate = parseToDate(r.date || pData.updatedAt || pData.date);
            const itemReceipt = {
              id: r.id || `${pData.id}-rec-${idx}`,
              date: rDate,
              qty: r.qty || 0,
              pricePerUnitNTD: pData.pricePerUnitNTD || 0
            };
            allValidReceipts.push(itemReceipt);
            console.log(`Added valid batch receipt:`, itemReceipt);
          });
          console.groupEnd();
        });

        console.log('All Valid Receipts compiled before chronological sorting:', [...allValidReceipts]);

        // Reconstruct the item stock level and moving average chronologically (event-sequential)
        let runningQty = 0;
        let runningAvgPrice = 0;

        allValidReceipts.sort((a, b) => a.date.getTime() - b.date.getTime());
        console.log('All Valid Receipts sorted chronologically:', allValidReceipts.map(r => ({
          id: r.id,
          dateString: r.date.toISOString(),
          qty: r.qty,
          pricePerUnitNTD: r.pricePerUnitNTD
        })));

        console.group('Chronological Moving Average Recalculation Steps');
        allValidReceipts.forEach((r, idx) => {
          const prevQty = runningQty;
          const prevAvg = runningAvgPrice;
          runningQty += r.qty;
          if (runningQty > 0) {
            runningAvgPrice = ((prevQty * prevAvg) + (r.qty * r.pricePerUnitNTD)) / runningQty;
          } else {
            runningAvgPrice = 0;
          }
          console.log(`Step ${idx + 1}: Batch Receipt ${r.id}`, {
            batchQty: r.qty,
            batchPrice: r.pricePerUnitNTD,
            previousQty: prevQty,
            previousAvgPrice: prevAvg,
            newQty: runningQty,
            recalculatedAvgPrice: runningAvgPrice
          });
        });
        console.groupEnd();

        console.log('Final Recalculated Values:', {
          totalRemainingQty: runningQty,
          finalAvgPrice: runningAvgPrice,
          roundedAvgPrice: runningAvgPrice
        });
        console.groupEnd();

        // Update Item in DB
        if (itemRef && itemExists) {
          transaction.update(itemRef, {
            qty: runningQty,
            avgPrice: runningAvgPrice,
            updatedAt: Timestamp.now()
          });
        }

        // Determine status for this purchase document
        let nextStatus = 'Diterima Sebagian';
        if (nextReceivedQty === 0) {
          nextStatus = 'Pending';
        } else if (nextReceivedQty >= activePurchase.qty && (!activePurchase.qtyClosed || activePurchase.qtyClosed === 0)) {
          nextStatus = 'Diterima';
        }

        const buyJournalId = `JU-PL-${purchase.id}-buy`; // Keep this to find legacy if needed // Keep this to find legacy if needed
        if (!updatedJournalIds.includes(buyJournalId)) {
          updatedJournalIds.unshift(buyJournalId);
        }

        const purchaseUpdatePayload: any = {
          status: nextStatus,
          qtyReceived: nextReceivedQty,
          receipts: nextReceipts,
          journalIds: updatedJournalIds,
          updatedAt: Timestamp.now()
        };

        if (shouldDeleteClosingJournals) {
          purchaseUpdatePayload.qtyClosed = deleteField();
          purchaseUpdatePayload.closeOption = deleteField();
        }

        transaction.update(purchaseRef, purchaseUpdatePayload);

        // Post a comprehensive audit log entry documenting this reversal
        const auditId = doc(collection(db, 'auditLog')).id;
        const auditRef = doc(db, 'auditLog', auditId);
        const auditEntry = {
          id: auditId,
          timestamp: Timestamp.now(),
          userEmail: profile?.email || user?.email || 'unknown@kangenbukuindo.tw',
          userDisplayName: profile?.displayName || user?.displayName || 'User',
          action: 'REVERSE',
          refId: purchase.id,
          before: {
            purchaseId: purchase.id,
            docNo: activePurchase.docNo,
            qty: activePurchase.qty,
            qtyReceived: activePurchase.qtyReceived,
            status: activePurchase.status,
            receipts: activePurchase.receipts || []
          },
          after: {
            status: nextStatus,
            qtyReceived: nextReceivedQty,
            receipts: nextReceipts
          },
          details: `Reverse Penerimaan Perlengkapan untuk Dokumen: ${activePurchase.docNo}. Batch ID yang dibatalkan: ${receiptId || 'ALL'}`
        };
        transaction.set(auditRef, auditEntry);
      });

      setIsHistoryOpen(false);
      triggerToast(`Berhasil membatalkan penerimaan barang untuk ${dbPurchase.itemName}. Stok dan status diperbarui!`, 'success');
    } catch (err) {
      console.error(err);
      triggerToast('Gagal membatalkan penerimaan.', 'error');
      handleFirestoreError(err, OperationType.WRITE, `perlengkapanPurchases/${purchase.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Reverse "Tutup Sisa" action on purchase order
  const handleReverseClosePurchase = async (purchase: any) => {
    // Determine close date to verify closed period
    let closeDate = purchase.updatedAt;
    const closeJournal = journals.find(
      (j) => j.id.startsWith(`JU-PL-${purchase.id}-close-`) || (j.refId === purchase.id && j.id.includes('-close-'))
    );
    if (closeJournal && closeJournal.date) {
      closeDate = closeJournal.date;
    }

    if (isPeriodClosed(closeDate, closedPeriods)) {
      triggerToast('Gagal: Transaksi berada di periode akuntansi yang telah ditutup!', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const purchaseRef = doc(db, 'perlengkapanPurchases', purchase.id);
      const latestSnap = await getDoc(purchaseRef);
      if (!latestSnap.exists()) {
        triggerToast('Gagal: Transaksi tidak ditemukan!', 'error');
        setSubmitting(false);
        return;
      }

      const dbPurchase = latestSnap.data();
      if (dbPurchase.status !== 'Diterima') {
        triggerToast('Gagal: Transaksi harus berstatus Diterima (karena telah ditutup sisanya) untuk dapat direverse!', 'error');
        setSubmitting(false);
        return;
      }

      const batch = writeBatch(db);

      // Remove close journals
      let updatedJournalIds = Array.isArray(dbPurchase.journalIds) ? [...dbPurchase.journalIds] : (dbPurchase.journalId ? [dbPurchase.journalId] : []);
      const closeJournalsToDel = updatedJournalIds.filter(jId => jId.includes('-close-'));
      closeJournalsToDel.forEach((jId) => {
        batch.delete(doc(db, 'journalEntries', jId));
      });

      const extraCloseJournals = journals.filter(j => j.refId === purchase.id && j.id.includes('-close-'));
      extraCloseJournals.forEach(ej => {
        batch.delete(doc(db, 'journalEntries', ej.id));
      });

      updatedJournalIds = updatedJournalIds.filter(jId => !jId.includes('-close-'));

      batch.update(purchaseRef, {
        status: 'Diterima Sebagian',
        qtyClosed: deleteField(),
        closeOption: deleteField(),
        journalIds: updatedJournalIds,
        updatedAt: Timestamp.now()
      });

      await batch.commit();
      setIsHistoryOpen(false);
      triggerToast(`Tutup Sisa untuk ${dbPurchase.itemName} berhasil dibatalkan. Status dikembalikan ke Diterima Sebagian!`, 'success');
    } catch (err) {
      console.error(err);
      triggerToast('Gagal membatalkan Tutup Sisa.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Reverse Stock Adjustment
  const handleReverseAdjustment = async (journalId: string) => {
    setSubmitting(true);
    try {
      // 1. Fetch the journal entry document to read its metadata
      const journalRef = doc(db, 'journalEntries', journalId);
      const journalSnap = await getDoc(journalRef);
      if (!journalSnap.exists()) {
        triggerToast('Gagal: Jurnal penyesuaian tidak ditemukan!', 'error');
        setSubmitting(false);
        return;
      }
      const targetJournal = journalSnap.data();

      // Check closed period constraint
      if (isPeriodClosed(targetJournal.date, closedPeriods)) {
        triggerToast('Gagal: Transaksi berada di periode akuntansi yang telah ditutup!', 'error');
        setSubmitting(false);
        return;
      }

      const itemId = targetJournal.refId;
      if (!itemId) {
        triggerToast('Gagal: ID barang penyesuaian tidak terasosiasi dengan jurnal ini!', 'error');
        setSubmitting(false);
        return;
      }

      // Parse the difference in qty from description: "Penyesuaian - Kategori - Barang, Sebanyak 90"
      const match = targetJournal.description.match(/Sebanyak\s*([-+\d.]+)/);
      if (!match) {
        triggerToast('Gagal: Deskripsi jurnal tidak valid, tidak dapat mendeteksi selisih kuantitas!', 'error');
        setSubmitting(false);
        return;
      }
      const diffQty = parseFloat(match[1]);

      // Query other adjustments for this item to lock them and check if this is indeed the latest one
      const adjQuery = query(
        collection(db, 'journalEntries'),
        where('refId', '==', itemId)
      );
      const adjSnap = await getDocs(adjQuery);
      const latestAdjDocs = adjSnap.docs.filter(
        d => d.id.startsWith('JU-ADJ-PL-') || d.id.startsWith('JU-WO-PERLENGKAPAN-')
      );

      // Execute transaction for strict reads-before-writes
      await runTransaction(db, async (transaction) => {
        // Read item doc inside transaction
        const itemRef = doc(db, 'perlengkapanItems', itemId);
        const itemSnapDoc = await transaction.get(itemRef);
        if (!itemSnapDoc.exists()) {
          throw new Error('Barang perlengkapan tidak ditemukan dalam database.');
        }
        const itemData = itemSnapDoc.data();

        // Read all related adjustment journals to lock them inside the transaction
        const fetchedJournals = [];
        for (const adjDoc of latestAdjDocs) {
          const freshDoc = await transaction.get(doc(db, 'journalEntries', adjDoc.id));
          if (freshDoc.exists()) {
            fetchedJournals.push({ id: adjDoc.id, ...freshDoc.data() });
          }
        }

        // Sort by createdAt descending to check if target is indeed the latest adjustment
        fetchedJournals.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
          return timeB - timeA;
        });

        const latestJournal = fetchedJournals[0];
        if (latestJournal && latestJournal.id !== journalId) {
          throw new Error(`Hanya penyesuaian terbaru (${latestJournal.id}) yang dapat dibatalkan!`);
        }

        // Calculate restored stock levels
        const restoredQty = itemData.qty + diffQty;

        // Retrieve total value of adjustment from journal lines to calculate restored avgPrice if current qty is 0
        const perlengkapanLine = targetJournal.lines?.find((l: any) => l.accountCode === '1130');
        const totalCents = perlengkapanLine ? (perlengkapanLine.debit || perlengkapanLine.credit || 0) : 0;
        const totalNTD = totalCents / 100;

        let restoredAvgPrice = itemData.avgPrice;
        if (itemData.qty === 0 && diffQty !== 0) {
          restoredAvgPrice = totalNTD / Math.abs(diffQty);
        }

        // All reads completed. Now write operations:
        // 1. Delete the adjustment journal entry
        transaction.delete(journalRef);

        // 2. Restore item quantities
        transaction.update(itemRef, {
          qty: restoredQty,
          avgPrice: restoredAvgPrice,
          updatedAt: Timestamp.now()
        });
      });

      triggerToast('Penyesuaian stok berhasil dibatalkan dan jurnal dihapus!', 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Gagal membatalkan penyesuaian stok.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Write-Off / Tutup & Catat Rugi on item stock
  const handleWriteOffItem = (item: any) => {
    if (item.qty <= 0) {
      triggerToast('Tidak ada kuantitas stok perlengkapan untuk dilakukan write-off!', 'error');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (isPeriodClosed(todayStr, closedPeriods)) {
      triggerToast('Gagal: Periode akuntansi saat ini terkunci!', 'error');
      return;
    }

    const confirmMessage = `Apakah Anda yakin ingin menulis off (Tutup & Catat Rugi) seluruh sisa stok ${item.name} sebanyak ${item.qty} pcs? Ini akan mencatatkan kerugian penuh pada Beban Kerugian Pembelian (5500).`;
    
    triggerConfirm(
      'Write-Off Perlengkapan',
      confirmMessage,
      async () => {
        setSubmitting(true);
        try {
          const batch = writeBatch(db);

          // Create Beban Kerugian Pembelian (5500) if not exists
          await ensureAutoAccountExists({
            code: '5500',
            name: 'Beban Kerugian Pembelian',
            type: 'Expenses',
            subType: 'Biaya Umum dan Administrasi'
          });

          // Write-off journal details
          const writeOffId = await getNextJournalId(new Date().toISOString().split('T')[0]);
          const journalRef = doc(db, 'journalEntries', writeOffId);
          
          const totalLossNTD = item.qty * item.avgPrice;
          const totalLossCents = Math.round(totalLossNTD * 100);

          const category = categories.find(c => c.id === item.categoryId);
          const categoryName = category ? category.name : '';

          const journalPayload = {
            id: writeOffId,
            date: Timestamp.now(),
            description: `【${writeOffId}]\n**Tutup & Catat Rugi** - *${categoryName}* - ${item.name}, Jumlah: ${item.qty} pcs`,
            refType: 'Expenses',
            refId: item.id,
            createdAt: Timestamp.now(),
            lines: [
              {
                account: 'Beban Kerugian Pembelian',
                accountCode: '5500',
                debit: totalLossCents,
                credit: 0
              },
              {
                account: 'Perlengkapan',
                accountCode: '1130',
                debit: 0,
                credit: totalLossCents
              }
            ]
          };

          batch.set(journalRef, journalPayload);

          // Update stock level to 0
          const itemRef = doc(db, 'perlengkapanItems', item.id);
          batch.update(itemRef, {
            qty: 0,
            avgPrice: 0,
            updatedAt: Timestamp.now()
          });

          await batch.commit();
          triggerToast(`Stok ${item.name} berhasil ditulis off dan dicatat di Beban Kerugian Pembelian (5500) sebesar NT$ ${formatNTD(totalLossCents)}!`, 'success');
        } catch (err) {
          console.error(err);
          triggerToast('Gagal memproses write-off perlengkapan.', 'error');
        } finally {
          setSubmitting(false);
        }
      }
    );
  };

  // Confirm Single Item Stock Adjustment (Redesign)
  const handleConfirmSingleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;

    const targetQty = parseFloat(adjustFisikInput);
    if (isNaN(targetQty) || targetQty < 0) {
      triggerToast('Kuantitas fisik harus berupa angka positif atau nol!', 'error');
      return;
    }

    if (isPeriodClosed(adjustDate, closedPeriods)) {
      triggerToast(`Periode akuntansi untuk tanggal ${adjustDate} sudah ditutup/terkunci!`, 'error');
      return;
    }

    const currentQty = adjustingItem.qty || 0;
    const diff = targetQty - currentQty;
    if (diff === 0) {
      setAdjustingItem(null);
      return;
    }

    const itemCategory = categories.find(c => c.id === adjustingItem.categoryId);
    const categoryName = itemCategory ? itemCategory.name : 'Umum';

    setSubmitting(true);
    try {
      const batch = writeBatch(db);

      const avgPrice = adjustingItem.avgPrice || 0;
      const totalNTD = Math.abs(diff) * avgPrice;
      const totalCents = Math.round(totalNTD * 100);

      const isLoss = diff < 0;
      if (isLoss && totalCents > 0) {
        const codeToUse = itemCategory?.adjustmentAccountCode || adjustAccountCode || '5500';
        const chosenAcc = coaAccounts.find(a => a.code === codeToUse) || {
          code: codeToUse,
          name: coaAccounts.find(a => a.code === codeToUse)?.name || 'Beban Kerugian Pembelian',
          type: 'Expenses'
        };
        await ensureAutoAccountExists({
          code: chosenAcc.code,
          name: chosenAcc.name,
          type: 'Expenses',
          subType: 'Biaya Umum dan Administrasi'
        });

        const adjustId = await getNextJournalId(new Date().toISOString().split('T')[0]);
        const journalRef = doc(db, 'journalEntries', adjustId);

        const journalPayload = {
          id: adjustId,
          date: Timestamp.fromDate(new Date(adjustDate)),
          description: `Penyesuaian - ${categoryName} - ${adjustingItem.name}, Sebanyak ${currentQty - targetQty}`,
          refType: 'Expenses',
          refId: adjustingItem.id,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: chosenAcc.name,
              accountCode: chosenAcc.code,
              debit: totalCents,
              credit: 0
            },
            {
              account: 'Perlengkapan',
              accountCode: '1130',
              debit: 0,
              credit: totalCents
            }
          ]
        };
        batch.set(journalRef, journalPayload);
      } else if (!isLoss && totalCents > 0) {
        await ensureAutoAccountExists({
          code: '4100',
          name: 'Revenue',
          type: 'Revenue',
          subType: 'Pendapatan Usaha'
        });

        const adjustId = await getNextJournalId(new Date().toISOString().split('T')[0]);
        const journalRef = doc(db, 'journalEntries', adjustId);

        const journalPayload = {
          id: adjustId,
          date: Timestamp.fromDate(new Date(adjustDate)),
          description: `Penyesuaian - ${categoryName} - ${adjustingItem.name}, Sebanyak ${currentQty - targetQty}`,
          refType: 'Expenses',
          refId: adjustingItem.id,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: 'Perlengkapan',
              accountCode: '1130',
              debit: totalCents,
              credit: 0
            },
            {
              account: 'Revenue',
              accountCode: '4100',
              debit: 0,
              credit: totalCents
            }
          ]
        };
        batch.set(journalRef, journalPayload);
      }

      const itemRef = doc(db, 'perlengkapanItems', adjustingItem.id);
      batch.update(itemRef, {
        qty: targetQty,
        ...(targetQty === 0 ? { avgPrice: 0 } : {}),
        updatedAt: Timestamp.now()
      });

      await batch.commit();
      triggerToast(`Stok ${adjustingItem.name} berhasil disesuaikan menjadi ${targetQty} pcs!`, 'success');
      setAdjustingItem(null);
    } catch (err) {
      console.error(err);
      triggerToast('Gagal memproses penyesuaian stok.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Bulk Item Stock Adjustment (Redesign)
  const handleConfirmBulkAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isPeriodClosed(bulkAdjustDate, closedPeriods)) {
      triggerToast(`Periode akuntansi untuk tanggal ${bulkAdjustDate} sudah ditutup/terkunci!`, 'error');
      return;
    }

    const changes = items.filter(item => {
      const val = bulkAdjustments[item.id];
      return val !== undefined && val !== item.qty;
    });

    if (changes.length === 0) {
      setIsBulkAdjustOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const timestamp = Date.now();

      await ensureAutoAccountExists({
        code: '4100',
        name: 'Revenue',
        type: 'Revenue',
        subType: 'Pendapatan Usaha'
      });

      for (let i = 0; i < changes.length; i++) {
        const item = changes[i];
        const targetQty = bulkAdjustments[item.id];
        const currentQty = item.qty || 0;
        const diff = targetQty - currentQty;
        const avgPrice = item.avgPrice || 0;
        const totalNTD = Math.abs(diff) * avgPrice;
        const totalCents = Math.round(totalNTD * 100);

        if (totalCents > 0) {
          const isLoss = diff < 0;
          const adjustId = await getNextJournalId(new Date().toISOString().split('T')[0]);
          const journalRef = doc(db, 'journalEntries', adjustId);

          const itemCategory = categories.find(c => c.id === item.categoryId);
          const categoryName = itemCategory ? itemCategory.name : 'Umum';
          const codeToUse = itemCategory?.adjustmentAccountCode || bulkAdjustAccountCode || '5500';
          const chosenAcc = coaAccounts.find(a => a.code === codeToUse) || {
            code: codeToUse,
            name: coaAccounts.find(a => a.code === codeToUse)?.name || 'Beban Kerugian Pembelian',
            type: 'Expenses'
          };

          await ensureAutoAccountExists({
            code: chosenAcc.code,
            name: chosenAcc.name,
            type: 'Expenses',
            subType: 'Biaya Umum dan Administrasi'
          });

          const journalPayload = {
            id: adjustId,
            date: Timestamp.fromDate(new Date(bulkAdjustDate)),
            description: `Penyesuaian - ${categoryName} - ${item.name}, Sebanyak ${currentQty - targetQty}`,
            refType: 'Expenses',
            refId: item.id,
            createdAt: Timestamp.now(),
            lines: isLoss ? [
              {
                account: chosenAcc.name,
                accountCode: chosenAcc.code,
                debit: totalCents,
                credit: 0
              },
              {
                account: 'Perlengkapan',
                accountCode: '1130',
                debit: 0,
                credit: totalCents
              }
            ] : [
              {
                account: 'Perlengkapan',
                accountCode: '1130',
                debit: totalCents,
                credit: 0
              },
              {
                account: 'Revenue',
                accountCode: '4100',
                debit: 0,
                credit: totalCents
              }
            ]
          };

          batch.set(journalRef, journalPayload);
        }

        const itemRef = doc(db, 'perlengkapanItems', item.id);
        batch.update(itemRef, {
          qty: targetQty,
          ...(targetQty === 0 ? { avgPrice: 0 } : {}),
          updatedAt: Timestamp.now()
        });
      }

      await batch.commit();
      triggerToast(`Penyesuaian massal berhasil disimpan! ${changes.length} perlengkapan diperbarui.`, 'success');
      setIsBulkAdjustOpen(false);
      setBulkAdjustments({});
    } catch (err) {
      console.error(err);
      triggerToast('Gagal memproses penyesuaian massal.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent mb-4"></div>
        <p className="text-neutral-500 text-sm font-medium">Memuat data Perlengkapan...</p>
      </div>
    );
  }

  const ledgerBalance = getLedger1130Balance();
  const physicalValue = getPhysicalStockValue();
  const recDiff = Math.abs(ledgerBalance - physicalValue);
  const isReconciled = recDiff < 0.05; // tiny floating difference allowable

  return (
    <div className="space-y-6 font-text">
      {/* Header and Add Category trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <Archive className="h-5 w-5 text-indigo-500" /> Perlengkapan
          </h2>
        </div>
        <div className="flex items-center gap-3 self-start md:self-end">
          <button
            onClick={() => setIsHistoryOpen(true)}
            title="Lihat Riwayat Transaksi Perlengkapan"
            className="inline-flex items-center justify-center bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 transition cursor-pointer shadow-sm relative group"
          >
            <History className="h-4.5 w-4.5" />
            <span className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-10 transition-all duration-200">
              <span className="relative z-10 p-2 text-[10px] leading-none text-white whitespace-now-wrap bg-neutral-950 dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-800 dark:border-neutral-700">
                Riwayat Transaksi
              </span>
              <span className="w-2 h-2 -mt-1 rotate-45 bg-neutral-950 dark:bg-neutral-800 border-r border-b border-neutral-800 dark:border-neutral-700"></span>
            </span>
          </button>
          <button
            onClick={() => {
              // Reset adjustments to current quantities
              const initial: Record<string, number> = {};
              items.forEach(item => {
                initial[item.id] = item.qty || 0;
              });
              setBulkAdjustments(initial);
              setBulkAdjustDate(new Date().toISOString().split('T')[0]);
              setBulkAdjustAccountCode('5500');
              setBulkSearchQuery('');
              setIsBulkAdjustOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-rose-600 dark:text-rose-400 font-bold py-2.5 px-4 rounded-xl text-xs border border-rose-200 dark:border-rose-900 transition cursor-pointer shadow-sm"
          >
            <Sliders className="h-4 w-4" />
            Penyesuaian Massal
          </button>
          <button
            onClick={() => setIsAddCategoryOpen(true)}
            className="inline-flex items-center gap-2 bg-gradient-to-br from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer shadow-md shadow-rose-500/15"
          >
            <Plus className="h-4 w-4" />
            Tambah Kategori
          </button>
        </div>
      </div>

      {/* Success/Error Toasts */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-3 shadow-sm"
          >
            <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/5 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-3 shadow-sm"
          >
            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Row */}
      <div className="max-w-md">
        {/* Total Perlengkapan Card */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex items-center gap-4 shadow-xs">
          <div className="h-11 w-11 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Bookmark className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider block">Total Nilai Perlengkapan</span>
            <span className="text-xl font-bold text-neutral-900 dark:text-white font-numeric leading-none block mt-1.5">
              {formatNTD(Math.round(ledgerBalance * 100))}
            </span>
          </div>
        </div>
      </div>

      {/* Main Categories Section */}
      <div className="space-y-6">
        {categories.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3">
            <Receipt className="h-10 w-10 text-neutral-300 dark:text-neutral-700" />
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Kategori Perlengkapan Masih Kosong</h3>
            <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
              Buat kategori perlengkapan pertama Anda (seperti Peralatan Packing, ATK, atau Keperluan Operasional Toko) dengan mengklik tombol di atas.
            </p>
          </div>
        ) : (
          categories.map((category, catIdx) => {
            const categoryItems = items.filter(item => item.categoryId === category.id);
            const categoryPurchases = purchases.filter(p => p.categoryId === category.id && p.status !== 'Diterima');
            // Deduplicate items & purchases to ensure strictly unique React keys in rendering
            const uniqueCategoryItems: any[] = Array.from(new Map(categoryItems.map(i => [i.id, i])).values());
            const uniqueCategoryPurchases: any[] = Array.from(new Map(categoryPurchases.map(p => [p.id, p])).values());

            return (
              <div 
                key={`${category.id || category.name}-${catIdx}`} 
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200"
              >
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 md:px-6 border-b border-neutral-100 dark:border-neutral-850 gap-4 bg-neutral-50/50 dark:bg-neutral-950/20">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-rose-600"></span>
                      Perlengkapan {category.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedCategoryForPurchase(category)}
                      className="inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-white font-bold py-1.5 px-3 rounded-xl text-[11px] transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Beli Perlengkapan
                    </button>
                    {categoryItems.every(i => i.qty === 0) && categoryPurchases.length === 0 && (
                      <button
                        onClick={() => {
                          triggerConfirm(
                            'Hapus Kategori',
                            `Apakah Anda yakin ingin menghapus kategori "${category.name}"? Tindakan ini bersifat permanen dan tidak dapat dibatalkan.`,
                            async () => {
                              try {
                                await deleteDoc(doc(db, 'perlengkapanCategories', category.id));
                                triggerToast(`Kategori "${category.name}" berhasil dihapus.`, 'success');
                              } catch (err) {
                                console.error(err);
                                triggerToast('Gagal menghapus kategori.', 'error');
                              }
                            }
                          );
                        }}
                        className="p-1.5 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/15 rounded-xl transition cursor-pointer"
                        title="Hapus Kategori Kosong"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category Body Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-neutral-100 dark:divide-neutral-800">
                  
                  {/* Stocks List (Left column - span 7) */}
                  <div className="lg:col-span-7 p-5 md:p-6 space-y-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Stok & Nilai Fisik</h4>
                    
                    {uniqueCategoryItems.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                        <p className="text-xs text-neutral-450 dark:text-neutral-550 italic">
                          Belum ada barang di kategori ini
                        </p>
                      </div>
                    ) : (
                      <div className="border border-neutral-200/80 dark:border-neutral-800 rounded-xl overflow-hidden bg-neutral-50/10 dark:bg-neutral-950/5">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-neutral-100/60 dark:bg-neutral-900/40 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-semibold uppercase">
                            <tr>
                              <th className="p-3">Nama</th>
                              <th className="p-3 text-center">AVG</th>
                              <th className="p-3 text-center">Qty</th>
                              <th className="p-3 text-right">Total</th>
                              <th className="p-3 text-center w-24">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-200/50 dark:divide-neutral-800">
                            {uniqueCategoryItems.map((item, itemIdx) => {
                              const totalVal = (item.qty || 0) * (item.avgPrice || 0);
                              return (
                                <tr key={`${item.id}-${itemIdx}`} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/10 transition">
                                  <td className="p-3 font-medium text-neutral-800 dark:text-neutral-200">{item.name}</td>
                                  <td className="p-3 text-center font-numeric text-neutral-600 dark:text-neutral-400">
                                    {item.avgPrice > 0 ? `NT$ ${item.avgPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 6})}` : '–'}
                                  </td>
                                  <td className="p-3 text-center font-bold font-numeric text-neutral-800 dark:text-neutral-200">{item.qty}</td>
                                  <td className="p-3 text-right font-bold font-numeric text-neutral-900 dark:text-white">
                                    {formatNTD(Math.round(totalVal * 100))}
                                  </td>
                                  <td className="p-3 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => {
                                          setAdjustingItem(item);
                                          setAdjustFisikInput(formatInputWithCommas(String(item.qty || 0)));
                                          setAdjustAccountCode('5500');
                                          setAdjustNotes('');
                                          setAdjustDate(new Date().toISOString().split('T')[0]);
                                        }}
                                        className="h-7 w-7 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition cursor-pointer"
                                        title="Sesuaikan Stok"
                                      >
                                        <Sliders className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if ((item.qty || 0) > 0) {
                                            triggerToast('Barang tidak dapat dihapus karena masih memiliki stok!', 'error');
                                            return;
                                          }
                                          triggerConfirm(
                                            'Hapus Barang',
                                            `Apakah Anda yakin ingin menghapus barang "${item.name}" secara permanen dari database? Tindakan ini bersifat permanen dan tidak dapat dibatalkan.`,
                                            async () => {
                                              try {
                                                await deleteDoc(doc(db, 'perlengkapanItems', item.id));
                                                triggerToast(`Barang "${item.name}" berhasil dihapus secara permanen.`, 'success');
                                              } catch (err) {
                                                console.error(err);
                                                triggerToast('Gagal menghapus barang.', 'error');
                                              }
                                            }
                                          );
                                        }}
                                        disabled={(item.qty || 0) > 0}
                                        className={`h-7 w-7 rounded-lg border flex items-center justify-center transition ${
                                          (item.qty || 0) > 0
                                            ? 'border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-neutral-300 dark:text-neutral-600 cursor-not-allowed opacity-50'
                                            : 'border-rose-200 dark:border-rose-900/30 bg-white dark:bg-neutral-900 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 dark:hover:bg-rose-950/20 dark:hover:text-rose-400 text-neutral-400 cursor-pointer'
                                        }`}
                                        title={(item.qty || 0) > 0 ? "Tidak bisa menghapus barang yang masih memiliki stok" : "Hapus Barang"}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Purchases History (Right column - span 5) */}
                  <div className="lg:col-span-5 p-5 md:p-6 space-y-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Transaksi</h4>
                    
                    {uniqueCategoryPurchases.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                        <p className="text-xs text-neutral-450 dark:text-neutral-550 italic">
                          Belum ada transaksi di kategori ini
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                        {uniqueCategoryPurchases.map((purchase, purIdx) => {
                          const transDate = parseToDate(purchase.date);
                          const yyyy = transDate.getFullYear();
                          const mm = String(transDate.getMonth() + 1).padStart(2, '0');
                          const dd = String(transDate.getDate()).padStart(2, '0');
                          const dateFormatted = `${yyyy}/${mm}/${dd}`;
                          const remainingQty = purchase.qty - (purchase.qtyReceived || 0);

                          return (
                            <div 
                              key={`${purchase.id}-${purIdx}`} 
                              className="border border-neutral-100 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-950 shadow-xs hover:border-neutral-200 dark:hover:border-neutral-700 transition"
                            >
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <div className="flex items-center gap-2 font-numeric text-xs font-bold text-neutral-800 dark:text-neutral-200">
                                    <span>{purchase.docNo}</span>
                                    <span className="text-[10px] text-neutral-400 font-normal">{dateFormatted}</span>
                                  </div>
                                  <h5 className="text-sm font-bold text-neutral-900 dark:text-white mt-1">
                                    {purchase.itemName}
                                  </h5>
                                </div>
                                <div className="text-right">
                                  <span className="text-sm font-bold text-neutral-900 dark:text-white font-numeric block">
                                    {formatNTD(Math.round(purchase.totalNTD * 100))}
                                  </span>
                                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium font-numeric mt-0.5 block">
                                    {purchase.qty} pcs dipesan
                                  </span>
                                </div>
                              </div>

                              {/* Progress bar for receiving */}
                              {purchase.status === 'Diterima Sebagian' && (
                                <div className="mt-3 flex items-center gap-3">
                                  <span className="inline-flex items-center bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-bold px-2 py-0.5 rounded-full text-[10px] uppercase">
                                    Sebagian
                                  </span>
                                  <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-blue-500 h-full rounded-full" 
                                      style={{ width: `${((purchase.qtyReceived || 0) / purchase.qty) * 100}%` }}
                                    />
                                  </div>
                                  <span className="font-numeric text-[10px] text-neutral-500">
                                    {purchase.qtyReceived} / {purchase.qty}
                                  </span>
                                </div>
                              )}

                              {purchase.status === 'Pending' && (
                                <div className="mt-3">
                                  <span className="inline-flex items-center bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 font-bold px-2 py-0.5 rounded-full text-[10px] uppercase">
                                    Pending
                                  </span>
                                </div>
                              )}

                              {purchase.status === 'Diterima' && (
                                <div className="mt-3">
                                  <span className="inline-flex items-center bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full text-[10px] uppercase">
                                    Diterima
                                  </span>
                                </div>
                              )}

                              {/* Action buttons with elegant tooltip and design */}
                              <div className="mt-4 flex items-center justify-between border-t border-neutral-50 dark:border-neutral-900/50 pt-3">
                                {purchase.currency === 'RP' && (
                                  <span className="text-[10px] text-neutral-400 font-medium font-numeric">
                                    Orig: {formatIDR(purchase.pricePerUnit * purchase.qty)}
                                  </span>
                                )}
                                <div className="flex items-center gap-2 ml-auto">
                                  {purchase.status === 'Pending' && (
                                    <>
                                      <ButtonWithTooltip
                                        onClick={() => handleAcceptPurchase(purchase)}
                                        className="h-8 w-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition cursor-pointer shadow-sm"
                                        title="Terima Pembelian"
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </ButtonWithTooltip>
                                      <ButtonWithTooltip
                                        onClick={() => handleCancelPurchase(purchase)}
                                        className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center transition cursor-pointer"
                                        title="Batal / Hapus Pembelian"
                                      >
                                        <X className="h-4 w-4" />
                                      </ButtonWithTooltip>
                                    </>
                                  )}
                                  {purchase.status === 'Diterima Sebagian' && (
                                    <>
                                      <ButtonWithTooltip
                                        onClick={() => handleAcceptPurchase(purchase)}
                                        className="h-8 w-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition cursor-pointer shadow-sm"
                                        title="Lanjut Terima Sisa"
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </ButtonWithTooltip>
                                      <ButtonWithTooltip
                                        onClick={() => handleOpenClosePurchase(purchase)}
                                        className="h-8 w-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center transition cursor-pointer shadow-sm"
                                        title="Tutup Sisa"
                                      >
                                        <MinusCircle className="h-4 w-4" />
                                      </ButtonWithTooltip>
                                      <ButtonWithTooltip
                                        onClick={() => {
                                          triggerConfirm(
                                            'Batalkan Semua Penerimaan',
                                            `Apakah Anda yakin ingin membatalkan (reverse) semua penerimaan barang untuk ${purchase.itemName}? Jurnal, stock, dan status terkait akan dibatalkan.`,
                                            async () => {
                                              await handleReversePurchase(purchase);
                                            }
                                          );
                                        }}
                                        className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center transition cursor-pointer"
                                        title="Reverse Semua Jurnal"
                                      >
                                        <Undo2 className="h-4 w-4" />
                                      </ButtonWithTooltip>
                                    </>
                                  )}
                                  {purchase.status === 'Diterima' && (
                                    <ButtonWithTooltip
                                      onClick={() => {
                                        triggerConfirm(
                                          'Batalkan Penerimaan',
                                          `Apakah Anda yakin ingin membatalkan (reverse) penerimaan barang untuk ${purchase.itemName}? Jurnal, stock, dan status terkait akan dibatalkan.`,
                                          async () => {
                                            await handleReversePurchase(purchase);
                                          }
                                        );
                                      }}
                                      className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center transition cursor-pointer"
                                      title="Reverse Jurnal & Stok"
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </ButtonWithTooltip>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============ MODAL: Tambah Kategori ============ */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setIsAddCategoryOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
              Tambah Kategori
            </h3>

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Nama Kategori
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Peralatan Packing, ATK, Kebersihan"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Jurnal Penyesuaian (Akun Beban)
                </label>
                <select
                  value={categoryAdjustmentAccountCode}
                  onChange={(e) => setCategoryAdjustmentAccountCode(e.target.value)}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
                  required
                >
                  <option value="" disabled>Pilih Akun Beban Penyesuaian</option>
                  {coaAccounts
                    .filter(acc => acc.type === 'Expenses' && !isParentAccount(acc, coaAccounts))
                    .map((acc, idx) => (
                      <option key={`${acc.id || acc.code}-${idx}`} value={acc.code}>
                        {acc.code} — {acc.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition cursor-pointer disabled:opacity-55"
                >
                  {submitting ? 'Menyimpan...' : 'Tambah Kategori'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============ MODAL: Beli Perlengkapan ============ */}
      {selectedCategoryForPurchase && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setSelectedCategoryForPurchase(null)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
              Beli Perlengkapan
            </h3>

            <form onSubmit={handleBeliPerlengkapan} className="space-y-4">
              {/* Item Name Combobox + Suggestions */}
              <div className="space-y-1.5 relative">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Nama Barang
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ketik nama baru atau pilih dari daftar"
                    value={itemNameInput}
                    onChange={(e) => {
                      setItemNameInput(e.target.value);
                      setShowItemSuggestions(true);
                    }}
                    onFocus={() => setShowItemSuggestions(true)}
                    className="flex-1 p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowItemSuggestions(!showItemSuggestions)}
                    className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-850 transition text-neutral-400 cursor-pointer"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {showItemSuggestions && (
                  <div className="absolute left-0 right-0 top-[100%] mt-1 max-h-40 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg z-50 divide-y divide-neutral-100 dark:divide-neutral-800">
                    {items.filter(i => i.categoryId === selectedCategoryForPurchase.id).length === 0 ? (
                      <div className="p-3 text-xs text-neutral-400 text-center">Belum ada barang di kategori ini. Ketik nama baru.</div>
                    ) : (
                      items
                        .filter(i => i.categoryId === selectedCategoryForPurchase.id)
                        .filter(i => (i.name || '').toLowerCase().includes((itemNameInput || '').toLowerCase()))
                        .map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setItemNameInput(item.name);
                              setShowItemSuggestions(false);
                            }}
                            className="w-full text-left p-2.5 text-xs font-semibold hover:bg-neutral-50 transition block text-neutral-800 dark:text-neutral-200"
                          >
                            {item.name} (Stok: {item.qty} pcs)
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>

              {/* Currency Selector (NTD vs RP) */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Mata Uang Pembelian
                </label>
                <div className="flex bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl p-1 w-full">
                  <button
                    type="button"
                    onClick={() => setCurrency('NTD')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                      currency === 'NTD' 
                        ? 'bg-rose-600 text-white shadow-sm' 
                        : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-900'
                    }`}
                  >
                    NT$
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency('RP')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                      currency === 'RP' 
                        ? 'bg-rose-600 text-white shadow-sm' 
                        : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-900'
                    }`}
                  >
                    Rp
                  </button>
                </div>
              </div>

              {/* Buy Date */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Tanggal Pembelian
                </label>
                <input
                  type="date"
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 font-numeric"
                  required
                />
              </div>

              {/* Qty (Full Width) */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Jumlah (PCS)
                </label>
                <input
                  type="text"
                  value={qtyRaw}
                  onChange={(e) => handleQtyChange(e.target.value)}
                  placeholder="Contoh: 100"
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 font-numeric"
                  required
                />
              </div>

              {/* Total Pembelian & Harga Satuan Rows (Tukar Posisi: Total on Left, Harga on Right) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Total Pembelian
                  </label>
                  <input
                    type="text"
                    value={totalRaw}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    placeholder="Contoh: 1,500"
                    className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 font-numeric"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Harga Satuan
                  </label>
                  <input
                    type="text"
                    value={priceRaw}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="Contoh: 15"
                    className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 font-numeric"
                    required
                  />
                </div>
              </div>

              {/* Conversion Estimate Block - Shows only when currency is RP */}
              {currency === 'RP' && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Konversi ke NT$
                  </label>
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/35 rounded-xl py-3 px-4 flex flex-col items-center justify-center">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-numeric tracking-wide">
                      {(() => {
                        const totalVal = parseFloat(cleanCommas(totalRaw)) || 0;
                        const rate = getIDRRate();
                        const totalNTD = totalVal * rate;
                        return formatNTD(Math.round(totalNTD * 100));
                      })()}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryForPurchase(null)}
                  className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition cursor-pointer disabled:opacity-55"
                >
                  {submitting ? 'Mengirim...' : 'Beli'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============ MODAL: Terima Perlengkapan ============ */}
      {receivingPurchase && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setReceivingPurchase(null)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Terima Perlengkapan
            </h3>

            <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800 rounded-xl space-y-1.5 text-xs mb-4">
              <div className="flex justify-between">
                <span className="text-neutral-400">No. Dokumen:</span>
                <span className="font-numeric font-bold">{receivingPurchase.docNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Nama Barang:</span>
                <span className="font-bold">{receivingPurchase.itemName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Belum Diterima:</span>
                <span className="font-numeric font-bold text-rose-600">
                  {receivingPurchase.qty - (receivingPurchase.qtyReceived || 0)} dari {receivingPurchase.qty} pcs
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmReceiveGoods} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Kuantitas Diterima (pcs)
                </label>
                <input
                  type="text"
                  value={receiveQtyInput}
                  onChange={(e) => setReceiveQtyInput(formatInputWithCommas(e.target.value))}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-numeric"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Tanggal Penerimaan
                </label>
                <input
                  type="date"
                  value={receiveDateInput}
                  onChange={(e) => setReceiveDateInput(e.target.value)}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-numeric"
                  required
                />
              </div>

              {/* Ledger Impact */}
              {(() => {
                const qtyToRec = parseFloat(cleanCommas(receiveQtyInput)) || 0;
                const valueNTD = qtyToRec * receivingPurchase.pricePerUnitNTD;
                return (
                  <div className="p-4 bg-emerald-50/50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-1 text-xs">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Jurnal Kas Keluar (NT$ Ledger)</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-numeric block">
                      {formatNTD(Math.round(valueNTD * 100))}
                    </span>
                  </div>
                );
              })()}

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setReceivingPurchase(null)}
                  className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition cursor-pointer disabled:opacity-55"
                >
                  {submitting ? 'Mengirim...' : 'Konfirmasi Terima'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============ MODAL: Tutup Sisa ============ */}
      {closingPurchase && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setClosingPurchase(null)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Tutup Sisa Pembelian
            </h3>

            <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800 rounded-xl space-y-1.5 text-xs mb-4">
              <div className="flex justify-between">
                <span className="text-neutral-400">No. Dokumen:</span>
                <span className="font-numeric font-bold">{closingPurchase.docNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Nama Barang:</span>
                <span className="font-bold">{closingPurchase.itemName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Sisa Belum Diterima:</span>
                <span className="font-numeric font-bold text-rose-600">
                  {closingPurchase.qty - (closingPurchase.qtyReceived || 0)} pcs
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmClosePurchase} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Opsi Penutupan Sisa
                </label>
                <div className="space-y-2 mt-1">
                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                    closeOption === 'cancel' 
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/10' 
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                  }`}>
                    <input
                      type="radio"
                      name="closeOption"
                      checked={closeOption === 'cancel'}
                      onChange={() => setCloseOption('cancel')}
                      className="mt-0.5 text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 block">Refund / Batal Sisa</span>
                      <p className="text-[10px] text-neutral-500 mt-0.5 leading-relaxed">
                        Sisa kuantitas dibatalkan tanpa ada pencatatan kerugian ke kas atau beban tambahan.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                    closeOption === 'writeoff' 
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/10' 
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                  }`}>
                    <input
                      type="radio"
                      name="closeOption"
                      checked={closeOption === 'writeoff'}
                      onChange={() => setCloseOption('writeoff')}
                      className="mt-0.5 text-rose-500 focus:ring-rose-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 block">Tutup & Catat Rugi</span>
                      <p className="text-[10px] text-neutral-500 mt-0.5 leading-relaxed">
                        Catat sisa barang senilai {formatNTD(Math.round((closingPurchase.qty - (closingPurchase.qtyReceived || 0)) * closingPurchase.pricePerUnitNTD * 100))} sebagai **Beban Kerugian Pembelian (5500)**.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">
                  Tanggal Penutupan
                </label>
                <input
                  type="date"
                  value={closeDateInput}
                  onChange={(e) => setCloseDateInput(e.target.value)}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-numeric"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setClosingPurchase(null)}
                  className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition cursor-pointer disabled:opacity-55"
                >
                  {submitting ? 'Mengirim...' : 'Konfirmasi Tutup Sisa'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============ MODAL: Penyesuaian Stok (Single) ============ */}
      {adjustingItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setAdjustingItem(null)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
              Penyesuaian Stok
            </h3>

            <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800 rounded-xl space-y-1.5 text-xs mb-4">
              <div className="flex justify-between">
                <span className="text-neutral-400">Nama Barang:</span>
                <span className="font-bold text-neutral-800 dark:text-neutral-200">{adjustingItem.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Harga Rata-Rata:</span>
                <span className="font-numeric font-bold text-neutral-800 dark:text-neutral-200">
                  {adjustingItem.avgPrice > 0 ? `NT$ ${adjustingItem.avgPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 6})}` : '–'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Stok Tercatat Saat Ini:</span>
                <span className="font-numeric font-bold text-neutral-800 dark:text-neutral-200">{adjustingItem.qty} pcs</span>
              </div>
            </div>

            <form onSubmit={handleConfirmSingleAdjustment} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Stok Fisik Sebenarnya
                </label>
                <input
                  type="text"
                  value={adjustFisikInput}
                  onChange={(e) => setAdjustFisikInput(formatInputWithCommas(e.target.value))}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 font-numeric"
                  placeholder="Ketik stok rill dari stok opname"
                  required
                />
              </div>

              {/* Dynamic Selisih Calculation & Display */}
              {(() => {
                const target = parseFloat(cleanCommas(adjustFisikInput)) || 0;
                const current = adjustingItem.qty || 0;
                const diff = target - current;
                const nilai = diff * (adjustingItem.avgPrice || 0);

                let boxClass = 'bg-neutral-50 border-neutral-200 text-neutral-500 dark:bg-neutral-950 dark:border-neutral-800';
                let labelText = '0 pcs · NT$ 0.00';

                if (diff < 0) {
                  boxClass = 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/15 dark:border-rose-900/40 text-rose-750 dark:text-rose-400';
                  labelText = `${diff} pcs · NT$ ${Math.abs(nilai).toFixed(2)}`;
                } else if (diff > 0) {
                  boxClass = 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/15 dark:border-emerald-900/40 text-emerald-750 dark:text-emerald-400';
                  labelText = `+${diff} pcs · NT$ ${nilai.toFixed(2)}`;
                }

                return (
                  <div className={`p-4 border rounded-xl flex justify-between items-center text-xs font-semibold ${boxClass}`}>
                    <span className="uppercase tracking-widest text-[10px]">Selisih</span>
                    <span className="font-numeric">{labelText}</span>
                  </div>
                );
              })()}

              {/* If loss, select expense account */}
              {(parseFloat(cleanCommas(adjustFisikInput)) || 0) < (adjustingItem.qty || 0) && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Akun Beban Tujuan (Selisih Kurang)
                  </label>
                  {(() => {
                    const categoryOfItem = categories.find(c => c.id === adjustingItem.categoryId);
                    const codeToUse = categoryOfItem?.adjustmentAccountCode || '5500';
                    const accountOfItem = coaAccounts.find(a => a.code === codeToUse);
                    return (
                      <div className="p-3 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        {codeToUse} — {accountOfItem?.name || 'Beban Kerugian Pembelian'}
                        <span className="block text-[9px] font-normal text-neutral-450 dark:text-neutral-550 mt-0.5">
                          (Ditentukan oleh Kategori: {categoryOfItem?.name || 'Umum'})
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">
                  Tanggal Penyesuaian
                </label>
                <input
                  type="date"
                  value={adjustDate}
                  onChange={(e) => setAdjustDate(e.target.value)}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 font-numeric"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-neutral-450 uppercase tracking-wider">
                  Catatan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Hasil stok opname mingguan"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition cursor-pointer disabled:opacity-55"
                >
                  {submitting ? 'Menyimpan...' : 'Konfirmasi Penyesuaian'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============ MODAL: Penyesuaian Massal ============ */}
      {isBulkAdjustOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setIsBulkAdjustOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition animate-none"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
              Penyesuaian Massal (Stok Opname)
            </h3>

            {/* Massal Search Bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Cari nama barang..."
                value={bulkSearchQuery}
                onChange={(e) => setBulkSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            {/* Massal summary row */}
            {(() => {
              const changedCount = Object.keys(bulkAdjustments).filter(id => {
                const item = items.find(i => i.id === id);
                return item && bulkAdjustments[id] !== item.qty;
              }).length;

              const totalImpact = Object.keys(bulkAdjustments).reduce((sum, id) => {
                const item = items.find(i => i.id === id);
                if (!item) return sum;
                const diff = bulkAdjustments[id] - item.qty;
                return sum + (diff * (item.avgPrice || 0));
              }, 0);

              return (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-neutral-50 dark:bg-neutral-950 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block">Barang Disesuaikan</span>
                    <span className="text-sm font-bold font-numeric text-neutral-800 dark:text-neutral-200 mt-1 block">
                      {changedCount} dari {items.length}
                    </span>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-950 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block">Estimasi Dampak</span>
                    <span className={`text-sm font-bold font-numeric mt-1 block ${
                      totalImpact < 0 
                        ? 'text-rose-600 dark:text-rose-400' 
                        : totalImpact > 0 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : 'text-neutral-500'
                    }`}>
                      {totalImpact > 0 ? '+' : ''}NT$ {totalImpact.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Main Item List in Scroll View */}
            <form onSubmit={handleConfirmBulkAdjustment} className="space-y-4">
              <div className="max-h-[240px] overflow-y-auto space-y-4 pr-1 divide-y divide-neutral-100 dark:divide-neutral-850">
                {categories.map(cat => {
                  const catItems = items
                    .filter(i => i.categoryId === cat.id)
                    .filter(i => (i.name || '').toLowerCase().includes((bulkSearchQuery || '').toLowerCase()));

                  if (catItems.length === 0) return null;

                  return (
                    <div key={cat.id} className="pt-3 first:pt-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-rose-600 to-rose-700 text-white flex items-center justify-center font-bold text-[10px]">
                          P
                        </div>
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{cat.name}</span>
                      </div>

                      <div className="space-y-2">
                        {catItems.map(item => {
                          const val = bulkAdjustments[item.id] !== undefined ? bulkAdjustments[item.id] : (item.qty || 0);
                          const diff = val - item.qty;

                          return (
                            <div 
                              key={item.id} 
                              className="flex items-center justify-between p-3 border border-neutral-100 dark:border-neutral-800/80 rounded-xl bg-neutral-50/30 dark:bg-neutral-950/20"
                            >
                              <div>
                                <span className="text-xs font-bold text-neutral-900 dark:text-white block">{item.name}</span>
                                <span className="text-[10px] text-neutral-400 font-numeric mt-0.5 block">
                                  Tercatat: {item.qty} pcs · Avg: NT$ {item.avgPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 6})}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                {/* Delta Chip */}
                                <span className={`font-numeric text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  diff === 0 
                                    ? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-450' 
                                    : diff < 0 
                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400' 
                                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
                                }`}>
                                  {diff === 0 ? 'Tetap' : `${diff > 0 ? '+' : ''}${diff} pcs`}
                                </span>

                                {/* Stepper Mini */}
                                <div className="flex items-center border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = Math.max(0, val - 1);
                                      setBulkAdjustments(prev => ({ ...prev, [item.id]: next }));
                                    }}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-800 text-xs font-bold cursor-pointer"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="text"
                                    value={formatInputWithCommas(String(val))}
                                    onChange={(e) => {
                                      const clean = cleanCommas(e.target.value);
                                      const parsed = parseInt(clean);
                                      const next = isNaN(parsed) || parsed < 0 ? 0 : parsed;
                                      setBulkAdjustments(prev => ({ ...prev, [item.id]: next }));
                                    }}
                                    className="w-12 h-8 text-center font-numeric text-xs font-bold bg-transparent focus:outline-none border-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = val + 1;
                                      setBulkAdjustments(prev => ({ ...prev, [item.id]: next }));
                                    }}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800 border-l border-neutral-200 dark:border-neutral-800 text-xs font-bold cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Adjustment Date & Expense Code for losses */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-850">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Tanggal Penyesuaian
                  </label>
                  <input
                    type="date"
                    value={bulkAdjustDate}
                    onChange={(e) => setBulkAdjustDate(e.target.value)}
                    className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 font-numeric"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Beban Selisih Kurang
                  </label>
                  <div className="p-2.5 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Sesuai Pengaturan Kategori
                    <span className="block text-[9px] font-normal text-neutral-450 dark:text-neutral-550 mt-0.5">
                      Masing-masing item didebit ke akun penyesuaian kategorinya.
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBulkAdjustOpen(false)}
                  className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition cursor-pointer disabled:opacity-55"
                >
                  {submitting ? 'Menyimpan...' : 'Konfirmasi Penyesuaian'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============ MODAL: Konfirmasi Kustom ============ */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
              {confirmState.title}
            </h3>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed mb-6 font-medium">
              {confirmState.message}
            </p>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmState(prev => ({ ...prev, isOpen: false }));
                  await confirmState.onConfirm();
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition cursor-pointer"
              >
                Konfirmasi
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============ MODAL: Riwayat Transaksi Perlengkapan ============ */}
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-neutral-900/40 dark:bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-5xl h-[85vh] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl relative flex flex-col"
          >
            {/* Header Area */}
            <div className="flex justify-between items-start pb-4 border-b border-neutral-100 dark:border-neutral-800/60 gap-4">
              <div className="flex gap-3.5 items-start">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-rose-800 flex items-center justify-center shrink-0 shadow-[0_6px_14px_-4px_rgba(225,29,72,0.4)]">
                  <History className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight leading-tight font-text">
                    Riwayat Transaksi
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-1 font-text">
                    Audit trail lengkap penerimaan pembelian, tutup sisa PO, dan penyesuaian stok.
                  </p>
                </div>
              </div>

              {/* Close Button & Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-750 text-neutral-500 dark:text-neutral-400 flex items-center justify-center cursor-pointer transition-colors"
                  title="Tutup Modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center py-4 border-b border-neutral-100 dark:border-neutral-800/60">
              {/* Filter Tabs */}
              {(() => {
                const counts = {
                  Semua: historyItems.length,
                  Pembelian: historyItems.filter((i) => i.type === 'Pembelian').length,
                  Penerimaan: historyItems.filter((i) => i.type === 'Penerimaan').length,
                  TutupSisa: historyItems.filter((i) => i.type === 'Tutup Sisa').length,
                  Penyesuaian: historyItems.filter((i) => i.type === 'Penyesuaian').length
                };

                return (
                  <div className="flex bg-neutral-100 dark:bg-neutral-950 p-1 rounded-xl self-stretch sm:self-auto gap-0.5 overflow-x-auto">
                    {([
                      { key: 'Semua', label: 'Semua', color: '', count: counts.Semua },
                      { key: 'Pembelian', label: 'Pembelian', color: 'bg-blue-600', count: counts.Pembelian },
                      { key: 'Penerimaan', label: 'Penerimaan', color: 'bg-emerald-500', count: counts.Penerimaan },
                      { key: 'Tutup Sisa', label: 'Tutup Sisa', color: 'bg-amber-500', count: counts.TutupSisa },
                      { key: 'Penyesuaian', label: 'Penyesuaian', color: 'bg-violet-600', count: counts.Penyesuaian }
                    ] as const).map((tab) => {
                      const isActive = historyTypeFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setHistoryTypeFilter(tab.key)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs'
                              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                          }`}
                        >
                          {tab.color && (
                            <span 
                              className={`w-1.5 h-1.5 rounded-full ${tab.color} transition-opacity duration-150 ${
                                isActive ? 'opacity-100' : 'opacity-40'
                              }`} 
                            />
                          )}
                          <span>{tab.label}</span>
                          <span className="font-numeric text-[10.5px] opacity-60 font-medium">
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Search input to match HTML exactly */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Cari transaksi..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/15 focus:border-rose-600 transition-all placeholder-neutral-400 dark:placeholder-neutral-600"
                />
              </div>
            </div>

            {/* List / Timeline Container */}
            <div className="flex-1 overflow-y-auto py-5 pr-1">
              {(() => {
                const filteredItems = historyItems.filter((item) => {
                  if (historyTypeFilter !== 'Semua') {
                    if (historyTypeFilter === 'Pembelian' && item.type !== 'Pembelian') return false;
                    if (historyTypeFilter === 'Penerimaan' && item.type !== 'Penerimaan') return false;
                    if (historyTypeFilter === 'Tutup Sisa' && item.type !== 'Tutup Sisa') return false;
                    if (historyTypeFilter === 'Penyesuaian' && item.type !== 'Penyesuaian') return false;
                  }
                  if (historySearch) {
                    const query = historySearch.toLowerCase();
                    return (
                      item.description?.toLowerCase().includes(query) ||
                      item.itemName?.toLowerCase().includes(query) ||
                      item.docNo?.toLowerCase().includes(query) ||
                      item.id?.toLowerCase().includes(query)
                    );
                  }
                  return true;
                });

                if (filteredItems.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                      <History className="h-12 w-12 text-neutral-300 dark:text-neutral-700 mb-3" />
                      <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 font-text">Belum Ada Riwayat</p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-sm font-text">
                        Tidak ditemukan riwayat transaksi yang cocok dengan kriteria pencarian atau filter yang dipilih.
                      </p>
                    </div>
                  );
                }

                const itemsPerPage = 10;
                const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
                const currentPage = Math.min(Math.max(1, historyPage), totalPages);
                const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

                return (
                  <div className="space-y-6 relative pl-1">
                    {paginatedItems.map((item, idx) => {
                      const isLast = idx === paginatedItems.length - 1;
                      
                      const isLatestAdjustment = (() => {
                        if (item.type !== 'Penyesuaian' || !item.rawJournal) return false;
                        const itemId = item.rawJournal.refId;
                        if (!itemId) return false;

                        const itemAdjs = journals.filter(j => 
                          (j.id.startsWith('JU-ADJ-PL-') || j.id.startsWith('JU-WO-PERLENGKAPAN-')) &&
                          (j.refId === itemId || j.id.includes(itemId))
                        );

                        if (itemAdjs.length === 0) return false;

                        // Sort by createdAt descending
                        itemAdjs.sort((a, b) => {
                          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
                          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
                          return timeB - timeA;
                        });

                        return itemAdjs[0].id === item.rawJournal.id;
                      })();
                      
                      let iconBg = 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400';
                      let BadgeComponent = null;
                      let iconElement = <History className="h-4.5 w-4.5" />;
                      let isLoss = false;
                      let valuePrefix = '';
                      
                      if (item.type === 'Pembelian') {
                        iconBg = 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400';
                        iconElement = <CheckCircle className="h-4.5 w-4.5" />;
                        BadgeComponent = (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            Pembelian
                          </span>
                        );
                        valuePrefix = '+ ';
                      } else if (item.type === 'Penerimaan') {
                        iconBg = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
                        iconElement = <CheckCircle className="h-4.5 w-4.5" />;
                        BadgeComponent = (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Penerimaan
                          </span>
                        );
                        valuePrefix = '+ ';
                      } else if (item.type === 'Tutup Sisa') {
                        isLoss = true;
                        valuePrefix = '− ';
                        if (item.closeOption === 'writeoff') {
                          iconBg = 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400';
                          iconElement = <X className="h-4.5 w-4.5" />;
                          BadgeComponent = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              Tutup &amp; Catat Rugi
                            </span>
                          );
                        } else {
                          iconBg = 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400';
                          iconElement = <AlertCircle className="h-4.5 w-4.5" />;
                          BadgeComponent = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              Tutup &amp; Batal Sisa
                            </span>
                          );
                        }
                      } else if (item.type === 'Penyesuaian') {
                        const isQtyNegative = typeof item.qty === 'string' && item.qty.startsWith('-');
                        isLoss = isQtyNegative || item.typeName === 'Write-Off Stok';
                        valuePrefix = isLoss ? '− ' : '+ ';
                        
                        if (item.typeName === 'Write-Off Stok') {
                          iconBg = 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400';
                          iconElement = <X className="h-4.5 w-4.5" />;
                          BadgeComponent = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              Write-Off Stok
                            </span>
                          );
                        } else if (item.typeName === 'Penyesuaian Massal') {
                          iconBg = 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400';
                          iconElement = <Sliders className="h-4.5 w-4.5" />;
                          BadgeComponent = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                              Penyesuaian Massal
                            </span>
                          );
                        } else {
                          iconBg = 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400';
                          iconElement = <Sliders className="h-4.5 w-4.5" />;
                          BadgeComponent = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                              Penyesuaian Stok
                            </span>
                          );
                        }
                      }

                      let itemDateStr = '-';
                      if (item.date) {
                        const d = item.date;
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        itemDateStr = `${yyyy}/${mm}/${dd}`;
                      }

                      return (
                        <div key={`${item.id}-${idx}`} className="flex gap-4 relative pb-6 font-text">
                          {/* Timeline vertical line */}
                          {!isLast && (
                            <div className="absolute left-5 top-10 bottom-0 w-[1.5px] bg-neutral-100 dark:bg-neutral-800 z-0" />
                          )}

                          {/* Icon marker */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 shadow-xs ${iconBg}`}>
                            {iconElement}
                          </div>

                          {/* Content Card matches HTML style and hover effects */}
                          <div className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-150 dark:border-neutral-850 rounded-2xl p-4 transition-all duration-150 hover:border-neutral-300 dark:hover:border-neutral-750 hover:shadow-[0_8px_20px_-10px_rgba(20,23,31,0.12)]">
                            <div className="flex justify-between items-start gap-4 mb-2">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="font-numeric text-[11px] text-neutral-400 dark:text-neutral-500">
                                  {itemDateStr}
                                </span>
                                {BadgeComponent}
                              </div>

                              <div className="text-right shrink-0">
                                <div className="font-numeric text-[12.5px] text-neutral-500 dark:text-neutral-400 font-medium">
                                  {typeof item.qty === 'string' ? item.qty.replace(/^-/, '').trim() : `${item.qty} pcs`}
                                </div>
                                <div className={`font-numeric text-[14px] font-bold tracking-tight ${
                                  isLoss 
                                    ? 'text-rose-600 dark:text-rose-400' 
                                    : 'text-neutral-850 dark:text-neutral-100'
                                }`}>
                                  {valuePrefix}NT$ {formatNTD(Math.round(item.amountNTD * 100))}
                                </div>
                              </div>
                            </div>

                            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                              {item.itemName}
                            </p>
                            <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-1">
                              {item.description}
                            </p>

                            {/* No Document Footer */}
                            {item.docNo && item.docNo !== '-' && (
                              <div className="inline-flex items-center gap-1.5 font-numeric text-[11px] text-neutral-400 dark:text-neutral-500 mt-3 pt-2.5 border-t border-dashed border-neutral-100 dark:border-neutral-850 w-full">
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span>No. Dokumen: {item.docNo}</span>
                              </div>
                            )}

                            {/* Reverse Button for Penerimaan items */}
                            {item.type === 'Penerimaan' && item.rawPurchase && (
                              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-850 flex flex-wrap items-center gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    setConfirmingItemId(confirmingItemId === item.id ? null : item.id);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl transition cursor-pointer border ${
                                    confirmingItemId === item.id
                                      ? 'text-neutral-500 bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                                      : 'text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 border-rose-200/40 dark:border-rose-900/40'
                                  }`}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                  Batalkan Penerimaan (Reverse)
                                </button>
                                {confirmingItemId === item.id && (
                                  <>
                                    <button
                                      onClick={async () => {
                                        setConfirmingItemId(null);
                                        await handleReversePurchase(item.rawPurchase, item.id);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 border border-rose-600 rounded-xl transition cursor-pointer animate-fade-in shadow-md shrink-0"
                                    >
                                      Ya, Batalkan {item.qty} pcs
                                    </button>
                                    <button
                                      onClick={() => setConfirmingItemId(null)}
                                      className="inline-flex items-center px-3 py-1.5 text-[11px] font-bold text-neutral-600 hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl transition cursor-pointer shrink-0"
                                    >
                                      Batal
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Reverse Button for Tutup Sisa items */}
                            {item.type === 'Tutup Sisa' && item.rawPurchase && (
                              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-850 flex flex-wrap items-center gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    setConfirmingItemId(confirmingItemId === item.id ? null : item.id);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl transition cursor-pointer border ${
                                    confirmingItemId === item.id
                                      ? 'text-neutral-500 bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                                      : 'text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 border-rose-200/40 dark:border-rose-900/40'
                                  }`}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                  Batalkan Tutup Sisa (Reverse)
                                </button>
                                {confirmingItemId === item.id && (
                                  <>
                                    <button
                                      onClick={async () => {
                                        setConfirmingItemId(null);
                                        await handleReverseClosePurchase(item.rawPurchase);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 border border-rose-600 rounded-xl transition cursor-pointer animate-fade-in shadow-md shrink-0"
                                    >
                                      Ya, Batalkan Tutup Sisa
                                    </button>
                                    <button
                                      onClick={() => setConfirmingItemId(null)}
                                      className="inline-flex items-center px-3 py-1.5 text-[11px] font-bold text-neutral-600 hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl transition cursor-pointer shrink-0"
                                    >
                                      Batal
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Reverse Button for Penyesuaian items */}
                            {item.type === 'Penyesuaian' && item.rawJournal && (
                              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-850 flex flex-wrap items-center gap-2 justify-end">
                                {!isLatestAdjustment ? (
                                  <div className="text-[11px] text-neutral-400 dark:text-neutral-500 italic bg-neutral-50 dark:bg-neutral-900/50 px-2.5 py-1.5 rounded-lg border border-neutral-200/40 dark:border-neutral-800/40 w-full text-right" title="Hanya penyesuaian terakhir yang bisa dibatalkan">
                                    Hanya penyesuaian terakhir yang bisa dibatalkan
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setConfirmingItemId(confirmingItemId === item.id ? null : item.id);
                                      }}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl transition cursor-pointer border ${
                                        confirmingItemId === item.id
                                          ? 'text-neutral-500 bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                                          : 'text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 border-rose-200/40 dark:border-rose-900/40'
                                      }`}
                                    >
                                      <Undo2 className="h-3.5 w-3.5" />
                                      Batalkan Penyesuaian Stok
                                    </button>
                                    {confirmingItemId === item.id && (
                                      <>
                                        <button
                                          onClick={async () => {
                                            setConfirmingItemId(null);
                                            await handleReverseAdjustment(item.rawJournal.id);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 border border-rose-600 rounded-xl transition cursor-pointer animate-fade-in shadow-md shrink-0"
                                        >
                                          Ya, Batalkan Penyesuaian
                                        </button>
                                        <button
                                          onClick={() => setConfirmingItemId(null)}
                                          className="inline-flex items-center px-3 py-1.5 text-[11px] font-bold text-neutral-600 hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl transition cursor-pointer shrink-0"
                                        >
                                          Batal
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between border-t border-neutral-100 dark:border-neutral-850 pt-4 mt-6 font-text">
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                          Menampilkan <span className="font-bold text-neutral-800 dark:text-neutral-200">{((currentPage - 1) * itemsPerPage) + 1}</span> - <span className="font-bold text-neutral-800 dark:text-neutral-200">{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> dari <span className="font-bold text-neutral-800 dark:text-neutral-200">{filteredItems.length}</span> transaksi
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            disabled={currentPage === 1}
                            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          
                          {Array.from({ length: totalPages }).map((_, i) => {
                            const pageNum = i + 1;
                            if (totalPages > 5 && Math.abs(pageNum - currentPage) > 1 && pageNum !== 1 && pageNum !== totalPages) {
                              if (pageNum === 2 || pageNum === totalPages - 1) {
                                return <span key={pageNum} className="text-xs text-neutral-400 px-1 select-none">...</span>;
                              }
                              return null;
                            }
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setHistoryPage(pageNum)}
                                className={`h-6 w-6 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                                  currentPage === pageNum
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}

                          <button
                            disabled={currentPage === totalPages}
                            onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer containing Close Button */}
            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="px-5 py-2 text-xs font-bold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};
