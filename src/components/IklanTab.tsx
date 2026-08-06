import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  Timestamp, 
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { 
  Megaphone, 
  TrendingUp, 
  Receipt, 
  ChevronDown, 
  Plus, 
  Settings, 
  Trash2, 
  Edit, 
  X, 
  Search, 
  ArrowLeft, 
  ArrowRight,
  Info
} from 'lucide-react';
import { db } from '../lib/firebase';
import { FALLBACK_NTD_PER_IDR, FALLBACK_NTD_PER_USD } from '../lib/exchangeRateConstants';
import { useAuth } from '../lib/auth-context';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../lib/use-modal-esc';
import { 
  formatNTD, 
  formatIDR, 
  formatNumber, 
  cleanCommas, 
  formatInputWithCommas 
} from '../lib/decimal-utils';
import { isPeriodClosed, getYearMonth } from '../lib/period-closing-utils';
import { ensureAutoAccountExists, AUTO_ACCOUNTS, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';

// Define the interface for an Ad purchase entry
interface IklanEntry {
  id: string;
  docNo: string;
  date: string; // YYYY-MM-DD
  platform: string; // e.g. "Meta Ads"
  currency: 'NTD' | 'IDR';
  amount: number; // original whole amount for IDR or NTD standard dollars
  amountNTD: number; // NT$ cents for accounting
  exchangeRate: number; // TWD per IDR conversion factor
  journalId: string;
  createdAt: any;
  updatedAt?: any;
}

// OrderType/Platform interface
interface OrderTypeConfig {
  id: string;
  name: string;
  createdAt?: any;
}

const DEFAULT_ORDER_TYPES = ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Shopee Ads', 'Tokopedia Ads'];

function getOrderYearMonth(so: any): string {
  const dt = so.orderDate || so.createdAt;
  if (!dt) return '';
  if (typeof dt === 'object' && dt.seconds !== undefined) {
    const d = new Date(dt.seconds * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  if (typeof dt === 'string') {
    if (dt.length >= 7 && dt.charAt(4) === '-') {
      return dt.slice(0, 7);
    }
    const d = new Date(dt);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  }
  if (dt instanceof Date) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return '';
}

export const IklanTab: React.FC = () => {
  const { user } = useAuth();
  const { sidebarHidden } = useSidebar();
  
  // State variables
  const [entries, setEntries] = useState<IklanEntry[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderTypeConfig[]>([]);
  const [isConfigInitialized, setIsConfigInitialized] = useState(false);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  
  // Selected Month (Date Object)
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    // Default to July 2026 if the system is modeled on that period, otherwise current date
    const now = new Date();
    // Check if system has a fixed simulated environment, or just use today
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  
  // UI Accordions
  const [isRoasExpanded, setIsRoasExpanded] = useState(true);
  const [isSpendExpanded, setIsSpendExpanded] = useState(true);
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManagePlatformOpen, setIsManagePlatformOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useModalEsc(isAddModalOpen, () => setIsAddModalOpen(false));
  useModalEsc(isManagePlatformOpen, () => setIsManagePlatformOpen(false));
  useModalEsc(isDeleteConfirmOpen, () => setIsDeleteConfirmOpen(false));
  
  // Active/Editing items
  const [selectedAdForEdit, setSelectedAdForEdit] = useState<IklanEntry | null>(null);
  const [selectedAdForDelete, setSelectedAdForDelete] = useState<IklanEntry | null>(null);
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'semua' | string>('semua');
  
  // Form states
  const [formDate, setFormDate] = useState('');
  const [formPlatform, setFormPlatform] = useState('');
  const [formCurrency, setFormCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [formAmountRaw, setFormAmountRaw] = useState('');
  const [formExchangeRateRaw, setFormExchangeRateRaw] = useState('561'); // IDR per 1 NTD (e.g. 561)
  
  // Manage platforms states
  const [newPlatformName, setNewPlatformName] = useState('');
  const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);
  const [editingPlatformName, setEditingPlatformName] = useState('');

  // Toast / alert state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [submitting, setSubmitting] = useState(false);
  
  // Helper for toasts
  const triggerToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Live exchange rates from localstorage or fallback
  const [liveRates] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('erp_live_rates');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return { IDR: FALLBACK_NTD_PER_IDR, USD: FALLBACK_NTD_PER_USD, NTD: 1.0 };
  });

  const getIDRRate = () => {
    return liveRates.IDR || FALLBACK_NTD_PER_IDR;
  };

  // 1. Subscribe to ad purchases
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'adsPurchases'), (snap) => {
      const list: IklanEntry[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as IklanEntry);
      });
      // Sort by date desc
      list.sort((a, b) => b.date.localeCompare(a.date));
      setEntries(list);
    }, (err) => {
      console.error("Error fetching ad purchases", err);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to Sales Orders to compute real-time ROAS
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setSalesOrders(list);
    }, (err) => {
      console.error("Error fetching sales orders", err);
    });
    return () => unsub();
  }, []);

  // 3. Subscribe to closed periods
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodClosings'), (snap) => {
      const closedList: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.status === 'Ditutup') {
          closedList.push(d.id);
        }
      });
      setClosedPeriods(closedList);
    }, (err) => {
      console.error("Error fetching closed periods", err);
    });
    return () => unsub();
  }, []);

  // 4. Subscribe to categories for platform types
  useEffect(() => {
    const unsubConfigs = onSnapshot(collection(db, 'categories'), (snap) => {
      const docsMapped = snap.docs.map(docItem => ({ id: docItem.id, ...docItem.data() as any }));
      const typesList: OrderTypeConfig[] = [];
      let isInitializedDocPresent = false;

      docsMapped.forEach((item) => {
        if (item.id === 'config_initialized') {
          isInitializedDocPresent = true;
        } else if (item.id.startsWith('config_type_')) {
          typesList.push({ id: item.id, name: item.name, createdAt: item.createdAt } as OrderTypeConfig);
        }
      });

      // Sort by createdAt or name
      typesList.sort((a, b) => a.name.localeCompare(b.name));
      setOrderTypes(typesList);
      if (isInitializedDocPresent) {
        setIsConfigInitialized(true);
      }
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    return () => unsubConfigs();
  }, []);

  // Compute resolved platforms list
  const resolvedPlatforms = useMemo(() => {
    const list = (orderTypes.length > 0 || isConfigInitialized)
      ? orderTypes.map(t => t.name)
      : DEFAULT_ORDER_TYPES;
    // Ensure we filter out internal types if necessary, but matching "Tipe Order" exactly is requested
    return list;
  }, [orderTypes, isConfigInitialized]);

  // Helpers for Month navigation
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Filter ads and compute totals for the selected month
  const selectedYearMonthStr = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`; // YYYY-MM
  }, [currentDate]);

  // Ads filtered by month
  const monthlyEntries = useMemo(() => {
    return entries.filter(e => e.date.startsWith(selectedYearMonthStr));
  }, [entries, selectedYearMonthStr]);

  // Sales orders created in the selected month with a valid campaign source (orderType)
  const monthlySalesOrders = useMemo(() => {
    return salesOrders.filter(so => {
      if (so.status === 'cancelled' || so.status === 'returned') return false;
      const orderDateStr = getOrderYearMonth(so);
      if (orderDateStr !== selectedYearMonthStr) return false;
      return Boolean(so.orderType && so.orderType.trim() !== '');
    });
  }, [salesOrders, selectedYearMonthStr]);

  // Metrics computation (Live Spend, Live GMV, Live Gross Profit, Live ROAS, Live Order Count)
  const metrics = useMemo(() => {
    const breakdownMap: Record<string, { platformName: string; spendCents: number; gmvCents: number; grossProfitCents: number; orderCount: number }> = {};
    
    // Helper to get or create entry with case-insensitive platform key
    const getOrCreateEntry = (platformRaw: string) => {
      const clean = (platformRaw || '').trim();
      if (!clean) return null;
      const key = clean.toLowerCase();
      if (!breakdownMap[key]) {
        const matchedConfigName = resolvedPlatforms.find(p => p.trim().toLowerCase() === key);
        const platformName = matchedConfigName || clean;
        breakdownMap[key] = { platformName, spendCents: 0, gmvCents: 0, grossProfitCents: 0, orderCount: 0 };
      }
      return breakdownMap[key];
    };

    // Initialize configured platforms so they always appear in breakdown
    resolvedPlatforms.forEach(p => {
      getOrCreateEntry(p);
    });

    // Add monthly spends
    monthlyEntries.forEach(entry => {
      const item = getOrCreateEntry(entry.platform);
      if (item) {
        item.spendCents += entry.amountNTD || 0;
      }
    });

    // Add monthly orders GMV, Gross Profit, and Count (only for orders with non-empty orderType / campaign source)
    monthlySalesOrders.forEach(so => {
      const rawType = (so.orderType || '').trim();
      if (!rawType) return;
      const item = getOrCreateEntry(rawType);
      if (item) {
        item.gmvCents += so.totalPrice || 0;
        let soCogsCents = 0;
        if (Array.isArray(so.items)) {
          soCogsCents = so.items.reduce((sum: number, i: any) => sum + ((i.cogsSnapshot || 0) * (i.qty || 1)), 0);
        }
        item.grossProfitCents += ((so.totalPrice || 0) - soCogsCents);
        item.orderCount += 1;
      }
    });

    let totalSpendCents = 0;
    let totalGmvCents = 0;
    let totalGrossProfitCents = 0;
    let totalOrderCount = 0;

    const items = Object.values(breakdownMap).map(data => {
      totalSpendCents += data.spendCents;
      totalGmvCents += data.gmvCents;
      totalGrossProfitCents += data.grossProfitCents;
      totalOrderCount += data.orderCount;

      const roas = data.spendCents > 0 ? (data.grossProfitCents / data.spendCents) : 0;
      return {
        platform: data.platformName,
        spendCents: data.spendCents,
        gmvCents: data.gmvCents,
        grossProfitCents: data.grossProfitCents,
        orderCount: data.orderCount,
        roas
      };
    });

    // Sort platforms by spend desc, then Gross Profit desc, then name asc
    items.sort((a, b) => b.spendCents - a.spendCents || b.grossProfitCents - a.grossProfitCents || a.platform.localeCompare(b.platform));

    const combinedRoas = totalSpendCents > 0 ? (totalGrossProfitCents / totalSpendCents) : 0;

    return {
      totalSpendCents,
      totalGmvCents,
      totalGrossProfitCents,
      totalOrderCount,
      combinedRoas,
      breakdown: items
    };
  }, [monthlyEntries, monthlySalesOrders, resolvedPlatforms]);

  // Search and filter applied list
  const filteredEntries = useMemo(() => {
    return monthlyEntries.filter(entry => {
      const matchesPlatform = selectedPlatformFilter === 'semua' || entry.platform === selectedPlatformFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || entry.docNo.toLowerCase().includes(query) || entry.platform.toLowerCase().includes(query);
      return matchesPlatform && matchesSearch;
    });
  }, [monthlyEntries, selectedPlatformFilter, searchQuery]);

  // Auto-calculated NTD preview value in form based on selected currency, amount, and exchange rate
  const formNtdPreview = useMemo(() => {
    const amountVal = parseFloat(cleanCommas(formAmountRaw)) || 0;
    if (formCurrency === 'NTD') {
      return amountVal; // direct dollars
    } else {
      // Rupiah
      const rateVal = parseFloat(formExchangeRateRaw) || 500;
      if (rateVal <= 0) return 0;
      return amountVal / rateVal; // e.g. Rp 2.800.000 / 560 = 5000 NT$
    }
  }, [formAmountRaw, formCurrency, formExchangeRateRaw]);

  // Generate AD Counter race-safe code via transactions
  const generateAdCodeInTransaction = async (dateStr: string): Promise<string> => {
    // Format dateStr: YYYY-MM-DD -> YYMMDD
    const parts = dateStr.split('-');
    if (parts.length !== 3) throw new Error("Invalid date format for ad code generator");
    const yy = parts[0].slice(-2);
    const mm = parts[1];
    const dd = parts[2];
    const cleanDateStr = `${yy}${mm}${dd}`;
    const counterId = `AD_${cleanDateStr}`;
    
    const counterRef = doc(db, 'counters', counterId);
    let nextValue = 1;
    
    await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      if (counterSnap.exists()) {
        nextValue = counterSnap.data().value + 1;
      }
      transaction.set(counterRef, { value: nextValue });
    });
    
    const seqStr = String(nextValue).padStart(2, '0');
    return `AD${cleanDateStr}${seqStr}`;
  };

  // Open modal for Adding a new Entry
  const handleOpenAddModal = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    
    setSelectedAdForEdit(null);
    setFormDate(`${y}-${m}-${d}`);
    setFormPlatform(resolvedPlatforms[0] || 'Meta Ads');
    setFormCurrency('NTD');
    setFormAmountRaw('');
    // Use the default exchange rate IDR per 1 NTD (which is roughly 1 / 0.0017801 = 561.7, let's round to 561)
    const defRate = Math.round(1 / getIDRRate());
    setFormExchangeRateRaw(String(defRate));
    setIsAddModalOpen(true);
  };

  // Open modal for Editing an entry
  const handleOpenEditModal = (entry: IklanEntry) => {
    if (isPeriodClosed(entry.date, closedPeriods)) {
      triggerToast(`Transaksi ${entry.docNo} terkunci karena periode akuntansi sudah ditutup!`, 'error');
      return;
    }
    setSelectedAdForEdit(entry);
    setFormDate(entry.date);
    setFormPlatform(entry.platform);
    setFormCurrency(entry.currency);
    setFormAmountRaw(String(entry.amount));
    if (entry.currency === 'IDR') {
      // exchange rate: IDR per 1 NTD
      const rate = entry.exchangeRate > 0 ? Math.round(1 / entry.exchangeRate) : 561;
      setFormExchangeRateRaw(String(rate));
    } else {
      setFormExchangeRateRaw('561');
    }
    setIsAddModalOpen(true);
  };

  // Submit Handler for Save / Edit
  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPlatform) {
      triggerToast("Pilih Ads Platform terlebih dahulu!", "error");
      return;
    }
    const amountVal = parseFloat(cleanCommas(formAmountRaw)) || 0;
    if (amountVal <= 0) {
      triggerToast("Jumlah belanja iklan harus lebih besar dari 0!", "error");
      return;
    }
    if (isPeriodClosed(formDate, closedPeriods)) {
      triggerToast(`Tanggal ${formDate} berada di dalam periode akuntansi yang sudah ditutup!`, "error");
      return;
    }

    setSubmitting(true);
    try {
      const isIdr = formCurrency === 'IDR';
      const rateToNtd = isIdr ? (1 / (parseFloat(formExchangeRateRaw) || 561)) : 1.0;
      const amountNTDStandard = isIdr ? (amountVal * rateToNtd) : amountVal;
      const amountNTDCents = Math.round(amountNTDStandard * 100);

      // Ensure appropriate accounts exist in CoA
      await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_IKLAN);
      const cashAcc = isIdr ? AUTO_ACCOUNTS.CASH_RUPIAH : AUTO_ACCOUNTS.CASH_NTD;
      await ensureAutoAccountExists(cashAcc);

      const batch = writeBatch(db);

      if (selectedAdForEdit) {
        // Edit flow
        const adId = selectedAdForEdit.id;
        const docRef = doc(db, 'adsPurchases', adId);
        
        // Update Iklan entry
        const updatedEntryPayload: Partial<IklanEntry> = {
          date: formDate,
          platform: formPlatform,
          currency: formCurrency,
          amount: amountVal,
          amountNTD: amountNTDCents,
          exchangeRate: rateToNtd,
          updatedAt: Timestamp.now()
        };
        batch.update(docRef, updatedEntryPayload);

        // Update Associated Journal Entry
        const journalRef = doc(db, 'journalEntries', selectedAdForEdit.journalId);
        const journalPayload = {
          date: Timestamp.fromDate(new Date(formDate)),
          description: `${selectedAdForEdit.docNo} - ${formPlatform}`,
          lines: [
            {
              account: AUTO_ACCOUNTS.BEBAN_IKLAN.name,
              accountCode: AUTO_ACCOUNTS.BEBAN_IKLAN.code,
              debit: amountNTDCents,
              credit: 0,
              ...(isIdr ? {
                originalCurrency: 'IDR',
                originalDebitIDR: amountVal,
                originalCreditIDR: 0
              } : {})
            },
            {
              account: cashAcc.name,
              accountCode: cashAcc.code,
              debit: 0,
              credit: amountNTDCents,
              ...(isIdr ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: amountVal
              } : {})
            }
          ],
          updatedAt: Timestamp.now()
        };
        batch.update(journalRef, journalPayload);

        await batch.commit();
        triggerToast(`Entri iklan ${selectedAdForEdit.docNo} berhasil diperbarui beserta jurnalnya!`, 'success');
      } else {
        // Add flow
        const docNo = await generateAdCodeInTransaction(formDate);
        const adId = `ad_${Date.now()}`;
        
        const journalId = await getNextJournalId(formDate);
        const adDocRef = doc(db, 'adsPurchases', adId);
        const journalRef = doc(db, 'journalEntries', journalId);

        // Save Iklan document
        const newEntryPayload: IklanEntry = {
          id: adId,
          docNo,
          date: formDate,
          platform: formPlatform,
          currency: formCurrency,
          amount: amountVal,
          amountNTD: amountNTDCents,
          exchangeRate: rateToNtd,
          journalId,
          createdAt: Timestamp.now()
        };
        batch.set(adDocRef, newEntryPayload);

        // Save Auto-Journal entry
        const journalPayload = {
          id: journalId,
          date: Timestamp.fromDate(new Date(formDate)),
          description: `${docNo} - ${formPlatform}`,
          refType: 'Expenses',
          refId: adId,
          isAuto: true,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: AUTO_ACCOUNTS.BEBAN_IKLAN.name,
              accountCode: AUTO_ACCOUNTS.BEBAN_IKLAN.code,
              debit: amountNTDCents,
              credit: 0,
              ...(isIdr ? {
                originalCurrency: 'IDR',
                originalDebitIDR: amountVal,
                originalCreditIDR: 0
              } : {})
            },
            {
              account: cashAcc.name,
              accountCode: cashAcc.code,
              debit: 0,
              credit: amountNTDCents,
              ...(isIdr ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: amountVal
              } : {})
            }
          ]
        };
        batch.set(journalRef, journalPayload);

        await batch.commit();
        triggerToast(`Entri iklan ${docNo} berhasil ditambahkan beserta auto-jurnal!`, 'success');
      }

      setIsAddModalOpen(false);
    } catch (err: any) {
      console.error(err);
      triggerToast(`Gagal menyimpan transaksi: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Open modal for Deletion Confirm
  const handleOpenDeleteConfirm = (entry: IklanEntry) => {
    if (isPeriodClosed(entry.date, closedPeriods)) {
      triggerToast(`Transaksi ${entry.docNo} terkunci karena periode akuntansi sudah ditutup!`, 'error');
      return;
    }
    setSelectedAdForDelete(entry);
    setIsDeleteConfirmOpen(true);
  };

  // Atomic silent delete of Ad entry and its associated journal entry
  const handleDeleteAd = async () => {
    if (!selectedAdForDelete) return;
    if (isPeriodClosed(selectedAdForDelete.date, closedPeriods)) {
      triggerToast(`Periode akuntansi sudah ditutup!`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      // Delete Iklan document
      batch.delete(doc(db, 'adsPurchases', selectedAdForDelete.id));
      
      // Delete associated Journal Entry
      batch.delete(doc(db, 'journalEntries', selectedAdForDelete.journalId));
      
      await batch.commit();
      triggerToast(`Belanja iklan ${selectedAdForDelete.docNo} beserta jurnalnya berhasil dihapus secara permanen!`, 'success');
      setIsDeleteConfirmOpen(false);
    } catch (err: any) {
      console.error(err);
      triggerToast(`Gagal menghapus transaksi: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Manage Platform actions (Add, Edit name, Delete platform)
  const handleAddPlatform = async () => {
    if (!newPlatformName.trim()) return;
    
    // Check if duplicate
    if (resolvedPlatforms.some(p => p.toLowerCase() === newPlatformName.trim().toLowerCase())) {
      triggerToast(`Platform "${newPlatformName.trim()}" sudah ada!`, 'error');
      return;
    }

    try {
      const newId = `config_type_${doc(collection(db, 'categories')).id}`;
      
      // Copy default configs if empty first to avoid sudden wipeout
      if (orderTypes.length === 0) {
        for (const def of DEFAULT_ORDER_TYPES) {
          const defId = `config_type_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'categories', defId), { name: def, createdAt: Timestamp.now() });
        }
      }

      await setDoc(doc(db, 'categories', newId), {
        name: newPlatformName.trim(),
        createdAt: Timestamp.now()
      });

      setNewPlatformName('');
      triggerToast(`Platform "${newPlatformName.trim()}" berhasil ditambahkan ke daftar Tipe Order!`, 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(`Gagal menambah platform: ${err.message}`, 'error');
    }
  };

  const handleEditPlatform = async (platformId: string) => {
    if (!editingPlatformName.trim()) return;

    try {
      await updateDoc(doc(db, 'categories', platformId), {
        name: editingPlatformName.trim()
      });
      setEditingPlatformId(null);
      setEditingPlatformName('');
      triggerToast(`Nama platform berhasil diperbarui!`, 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(`Gagal mengedit platform: ${err.message}`, 'error');
    }
  };

  const handleDeletePlatform = async (platformId: string, name: string) => {
    // Check if platform is currently used by any ad entries
    const isUsedInAds = entries.some(e => e.platform === name);
    if (isUsedInAds) {
      triggerToast(`Platform "${name}" masih digunakan dalam transaksi belanja iklan dan tidak bisa dihapus!`, 'error');
      return;
    }

    try {
      await deleteDoc(doc(db, 'categories', platformId));
      triggerToast(`Platform "${name}" berhasil dihapus dari daftar Tipe Order!`, 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(`Gagal menghapus platform: ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-110 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm transition-all duration-300 animate-slide-in ${
          toastType === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/40' 
            : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900/40'
        }`}>
          <Info className="h-4.5 w-4.5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-indigo-500" /> Iklan
          </h2>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setIsManagePlatformOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-50 hover:bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-750 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 transition"
          >
            <Settings className="h-4 w-4" />
            Manage Platform
          </button>
          <button 
            onClick={handleOpenAddModal}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            Tambah Iklan
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ROAS Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-850 shadow-xs overflow-hidden">
          <div 
            onClick={() => setIsRoasExpanded(!isRoasExpanded)}
            className="p-5 flex items-center justify-between cursor-pointer select-none hover:bg-neutral-50/50 dark:hover:bg-neutral-850/10 transition"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/15 text-indigo-600 dark:text-indigo-400 rounded-lg">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 dark:text-neutral-500">ROAS Gabungan · {formatMonthYear(currentDate)}</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-xl font-extrabold text-neutral-900 dark:text-white">
                    {metrics.combinedRoas > 0 ? `${metrics.combinedRoas.toFixed(2)}x` : '—'}
                  </p>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium font-numeric flex items-center gap-1.5">
                    <span>(Total GMV: {formatNTD(metrics.totalGmvCents)}</span>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    <span className="font-semibold text-neutral-600 dark:text-neutral-300">Gross Profit: {formatNTD(metrics.totalGrossProfitCents)}</span>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    <span>{metrics.totalOrderCount} Order)</span>
                  </span>
                </div>
              </div>
            </div>
            <div className={`p-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-400 rounded-lg transition-transform duration-200 ${isRoasExpanded ? 'rotate-180' : ''}`}>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
          
          {isRoasExpanded && (
            <div className="border-t border-neutral-100 dark:border-neutral-850 divide-y divide-neutral-100 dark:divide-neutral-850/50">
              {metrics.breakdown.map((item) => (
                <div key={item.platform} className="px-6 py-3 flex items-center justify-between hover:bg-neutral-50/30 dark:hover:bg-neutral-850/5 transition">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{item.platform}</span>
                  </div>
                  <div className="flex items-center gap-5 sm:gap-6">
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-neutral-400">Jumlah Order</span>
                      <span className="text-xs font-numeric font-medium text-neutral-700 dark:text-neutral-300">{item.orderCount} Order</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-neutral-400">Spend</span>
                      <span className="text-xs font-numeric font-medium text-neutral-600 dark:text-neutral-400">{formatNTD(item.spendCents)}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-neutral-400">Nilai GMV</span>
                      <span className="text-xs font-numeric font-medium text-neutral-600 dark:text-neutral-400">{formatNTD(item.gmvCents)}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-neutral-400">Gross Profit</span>
                      <span className="text-xs font-numeric font-semibold text-neutral-700 dark:text-neutral-300">{formatNTD(item.grossProfitCents)}</span>
                    </div>
                    <div className="text-right w-16">
                      <span className="block text-[9px] uppercase tracking-wider text-neutral-400">ROAS</span>
                      <span className="text-xs font-numeric font-bold text-indigo-600 dark:text-indigo-400">
                        {item.spendCents > 0 ? `${item.roas.toFixed(2)}x` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spend Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-850 shadow-xs overflow-hidden">
          <div 
            onClick={() => setIsSpendExpanded(!isSpendExpanded)}
            className="p-5 flex items-center justify-between cursor-pointer select-none hover:bg-neutral-50/50 dark:hover:bg-neutral-850/10 transition"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-400 rounded-lg">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 dark:text-neutral-500">Total Pengeluaran Iklan · {formatMonthYear(currentDate)}</p>
                <p className="text-xl font-extrabold text-neutral-900 dark:text-white mt-0.5">
                  {formatNTD(metrics.totalSpendCents)}
                </p>
              </div>
            </div>
            <div className={`p-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-400 rounded-lg transition-transform duration-200 ${isSpendExpanded ? 'rotate-180' : ''}`}>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>

          {isSpendExpanded && (
            <div className="border-t border-neutral-100 dark:border-neutral-850 divide-y divide-neutral-100 dark:divide-neutral-850/50">
              {metrics.breakdown.map((item) => (
                <div key={item.platform} className="px-6 py-3.5 flex items-center justify-between hover:bg-neutral-50/30 dark:hover:bg-neutral-850/5 transition">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" />
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{item.platform}</span>
                  </div>
                  <div className="flex items-center gap-5 text-right">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-neutral-400">Total Order</span>
                      <span className="text-xs font-numeric font-medium text-neutral-700 dark:text-neutral-300">{item.orderCount} Order</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-neutral-400">Total Belanja</span>
                      <span className="text-xs font-numeric font-bold text-neutral-800 dark:text-neutral-200">{formatNTD(item.spendCents)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-850 shadow-xs overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-6 border-b border-neutral-100 dark:border-neutral-850 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-base font-bold text-neutral-850 dark:text-white">Riwayat Belanja Iklan</h2>
            <p className="text-[11px] text-neutral-400">Semua entri belanja iklan yang sudah tercatat di jurnal.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Month Picker Navigation */}
            <div className="flex items-center gap-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-1 shrink-0 w-full md:w-auto justify-between md:justify-start">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-white dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-950 dark:hover:text-white rounded-lg transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-numeric font-bold px-3 text-neutral-800 dark:text-neutral-200">
                {formatMonthYear(currentDate)}
              </span>
              <button 
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-white dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-950 dark:hover:text-white rounded-lg transition"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Platform Filter Tabs */}
            <div className="flex gap-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
              <button 
                onClick={() => setSelectedPlatformFilter('semua')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  selectedPlatformFilter === 'semua' 
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' 
                    : 'text-neutral-500 hover:text-neutral-850 dark:hover:text-neutral-300'
                }`}
              >
                Semua
              </button>
              {resolvedPlatforms.map(plat => (
                <button 
                  key={plat}
                  onClick={() => setSelectedPlatformFilter(plat)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition shrink-0 ${
                    selectedPlatformFilter === plat 
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' 
                      : 'text-neutral-500 hover:text-neutral-850 dark:hover:text-neutral-300'
                  }`}
                >
                  {plat.replace(' Ads', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search Row */}
        <div className="px-6 py-4 bg-neutral-50/30 dark:bg-neutral-850/10 border-b border-neutral-100 dark:border-neutral-850">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input 
              type="text"
              placeholder="Cari berdasarkan No. Doc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
            />
          </div>
        </div>

        {/* Entries List */}
        <div className="p-4 space-y-2.5 max-h-[500px] overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400 dark:text-neutral-500 font-medium italic">
              Tidak ada transaksi belanja iklan untuk periode ini.
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isClosed = isPeriodClosed(entry.date, closedPeriods);
              return (
                <div 
                  key={entry.id}
                  className="flex items-center gap-4 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-850 hover:border-neutral-200 dark:hover:border-neutral-700 p-4 rounded-xl transition shadow-xs relative group overflow-hidden"
                >
                  {/* Color Accent Indicator */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                    entry.platform.toLowerCase().includes('meta') ? 'bg-indigo-500' :
                    entry.platform.toLowerCase().includes('google') ? 'bg-emerald-500' : 'bg-purple-500'
                  }`} />

                  {/* Icon Block */}
                  <div className={`p-2.5 rounded-lg shrink-0 ${
                    entry.platform.toLowerCase().includes('meta') ? 'bg-indigo-50 dark:bg-indigo-950/10 text-indigo-600 dark:text-indigo-400' :
                    entry.platform.toLowerCase().includes('google') ? 'bg-emerald-50 dark:bg-emerald-950/10 text-emerald-600 dark:text-emerald-400' : 'bg-purple-50 dark:bg-purple-950/10 text-purple-600 dark:text-purple-400'
                  }`}>
                    <Megaphone className="h-4.5 w-4.5" />
                  </div>

                  {/* Info details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-numeric text-xs font-bold text-neutral-800 dark:text-neutral-200">{entry.docNo}</span>
                      <span className="h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                      <span className="font-numeric text-[10px] text-neutral-400">{entry.date}</span>
                    </div>
                    <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mt-1">{entry.platform}</p>
                    <span className="text-[10px] text-neutral-400">Dibayar via Cash: {entry.currency === 'IDR' ? 'Rupiah' : 'NTD'}</span>
                  </div>

                  {/* Amount values */}
                  <div className="text-right shrink-0">
                    {entry.currency === 'IDR' && (
                      <div className="font-numeric text-[10px] text-neutral-400 mb-0.5">{formatIDR(entry.amount)}</div>
                    )}
                    <div className="font-numeric text-xs font-bold text-neutral-900 dark:text-white">
                      {formatNTD(entry.amountNTD)}
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button 
                      onClick={() => handleOpenEditModal(entry)}
                      disabled={isClosed}
                      title={isClosed ? "Terkunci (Periode Ditutup)" : "Edit Entri"}
                      className={`p-1.5 rounded-lg border border-neutral-100 hover:bg-neutral-50 text-neutral-400 hover:text-neutral-700 dark:border-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 transition ${isClosed ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => handleOpenDeleteConfirm(entry)}
                      disabled={isClosed}
                      title={isClosed ? "Terkunci (Periode Ditutup)" : "Hapus Entri"}
                      className={`p-1.5 rounded-lg border border-neutral-100 hover:bg-rose-50 text-neutral-400 hover:text-rose-600 dark:border-neutral-800 dark:hover:bg-rose-950/25 dark:hover:text-rose-400 transition ${isClosed ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ============ MODAL: TAMBAH / EDIT IKLAN ============ */}
      {isAddModalOpen && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-50')}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl w-[90%] max-w-md overflow-hidden transform transition-all my-auto">
            <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-850 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-850/20">
              <h3 className="text-sm font-bold text-neutral-800 dark:text-white flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                {selectedAdForEdit ? 'Edit Entri Belanja Iklan' : 'Tambah Belanja Iklan'}
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAd} className="p-6 space-y-4">
              {/* Tanggal */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Tanggal</label>
                <input 
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/10"
                  required
                />
              </div>

              {/* Ads Platform */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Ads Platform</label>
                <select 
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/10"
                  required
                >
                  <option value="" disabled>-- Pilih Platform --</option>
                  {resolvedPlatforms.map(plat => (
                    <option key={plat} value={plat}>{plat}</option>
                  ))}
                </select>
              </div>

              {/* Currency Selector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Dibayar Via</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-950 rounded-xl">
                  <button 
                    type="button"
                    onClick={() => setFormCurrency('NTD')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition ${
                      formCurrency === 'NTD' 
                        ? 'bg-rose-600 text-white shadow-xs' 
                        : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                    }`}
                  >
                    NT$ (Cash NTD)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFormCurrency('IDR')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition ${
                      formCurrency === 'IDR' 
                        ? 'bg-rose-600 text-white shadow-xs' 
                        : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                    }`}
                  >
                    Rp (Cash Rupiah)
                  </button>
                </div>
              </div>

              {/* Total Belanja */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                  Total Belanja ({formCurrency === 'IDR' ? 'Rupiah' : 'NT$'})
                </label>
                <input 
                  type="text"
                  placeholder={formCurrency === 'IDR' ? 'Contoh: 2,800,000' : 'Contoh: 5,000'}
                  value={formAmountRaw}
                  onChange={(e) => setFormAmountRaw(formatInputWithCommas(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 font-numeric focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/10"
                  required
                />
              </div>

              {/* Exchange rate conversion (only if paid in Rupiah) */}
              {formCurrency === 'IDR' && (
                <div className="space-y-3.5 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-100 dark:border-neutral-850">
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider font-bold text-neutral-400 mb-1">Konversi ke NT$</span>
                    <div className="p-2.5 bg-rose-50/20 dark:bg-rose-950/10 border border-rose-100/30 dark:border-rose-900/15 rounded-lg text-center">
                      <span className="text-sm font-numeric font-extrabold text-rose-600 dark:text-rose-450">
                        {formatNTD(Math.round(formNtdPreview * 100))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-neutral-100 dark:border-neutral-850 flex justify-end gap-2.5">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-50 hover:bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-750 dark:text-neutral-300 transition"
                  disabled={submitting}
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition"
                  disabled={submitting}
                >
                  {submitting ? 'Memproses...' : 'Simpan Transaksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ MODAL: MANAGE PLATFORM ============ */}
      {isManagePlatformOpen && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-50')}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl w-[90%] max-w-md overflow-hidden transform transition-all my-auto">
            <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-850 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-850/20">
              <h3 className="text-sm font-bold text-neutral-800 dark:text-white flex items-center gap-2">
                <Settings className="h-4.5 w-4.5 text-neutral-400" />
                Manage Platforms
              </h3>
              <button 
                onClick={() => setIsManagePlatformOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-[11px] text-neutral-400 leading-relaxed bg-neutral-50 dark:bg-neutral-950 p-3 rounded-lg border border-neutral-150 dark:border-neutral-850">
                Daftar platform di bawah terintegrasi langsung dengan <strong>Tipe Order</strong> di Sales Orders. Menambah atau mengedit di sini otomatis merubah opsi di sales order secara real-time.
              </p>

              {/* Add Platform input */}
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Nama platform baru..."
                  value={newPlatformName}
                  onChange={(e) => setNewPlatformName(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-rose-500"
                />
                <button 
                  onClick={handleAddPlatform}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition shrink-0"
                >
                  Tambah
                </button>
              </div>

              {/* Platforms list */}
              <div className="space-y-2 max-h-[250px] overflow-y-auto pt-2">
                {orderTypes.length === 0 && !isConfigInitialized ? (
                  // Show static fallbacks if Firestore collection is not seeded yet
                  (DEFAULT_ORDER_TYPES.map(name => (
                    <div key={name} className="flex justify-between items-center p-3 border border-neutral-100 dark:border-neutral-850 rounded-xl bg-neutral-50/30 dark:bg-neutral-850/5">
                      <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{name}</span>
                      <span className="text-[10px] text-neutral-400 font-medium bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">Default</span>
                    </div>
                  )))
                ) : (
                  orderTypes.map(type => (
                    <div key={type.id} className="flex justify-between items-center p-2.5 border border-neutral-100 dark:border-neutral-850 rounded-xl hover:bg-neutral-50/50 dark:hover:bg-neutral-850/5 transition">
                      {editingPlatformId === type.id ? (
                        <div className="flex items-center gap-2 w-full pr-2">
                          <input 
                            type="text"
                            value={editingPlatformName}
                            onChange={(e) => setEditingPlatformName(e.target.value)}
                            className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 text-neutral-850 dark:text-neutral-100 focus:outline-none"
                            autoFocus
                          />
                          <button 
                            onClick={() => handleEditPlatform(type.id)}
                            className="text-[10px] px-2.5 py-1 font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Simpan
                          </button>
                          <button 
                            onClick={() => setEditingPlatformId(null)}
                            className="text-[10px] px-2.5 py-1 font-bold rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{type.name}</span>
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => {
                                setEditingPlatformId(type.id);
                                setEditingPlatformName(type.name);
                              }}
                              className="p-1 rounded bg-neutral-50 dark:bg-neutral-850 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition"
                              title="Edit Nama"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeletePlatform(type.id, type.name)}
                              className="p-1 rounded bg-neutral-50 dark:bg-neutral-850 hover:bg-rose-50 text-neutral-400 hover:text-rose-600 dark:hover:bg-rose-950/25 dark:hover:text-rose-400 transition"
                              title="Hapus Platform"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="pt-4 border-t border-neutral-100 dark:border-neutral-850 flex justify-end">
                <button 
                  onClick={() => setIsManagePlatformOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-50 hover:bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-750 dark:text-neutral-300 transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL: DELETE CONFIRM ============ */}
      {isDeleteConfirmOpen && selectedAdForDelete && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-50')}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl w-[90%] max-w-sm overflow-hidden transform transition-all my-auto">
            <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-850 flex justify-between items-center bg-rose-50/20 dark:bg-rose-950/10">
              <h3 className="text-sm font-bold text-rose-700 dark:text-rose-450 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse" />
                Hapus Belanja Iklan
              </h3>
              <button 
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                disabled={submitting}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl bg-rose-50 text-rose-800 border border-rose-100 dark:bg-rose-950/15 dark:text-rose-400 dark:border-rose-900/30 text-xs leading-relaxed">
                Tindakan ini akan menghapus entri belanja iklan <strong>{selectedAdForDelete.docNo} ({selectedAdForDelete.platform})</strong> beserta auto-jurnalnya senilai <strong>{formatNTD(selectedAdForDelete.amountNTD)}</strong> secara permanen. Data ROAS dan pengeluaran bulan ini akan langsung dihitung ulang.
              </div>

              <div className="flex justify-end gap-2.5">
                <button 
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-50 hover:bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-750 dark:text-neutral-300 transition"
                  disabled={submitting}
                >
                  Batal
                </button>
                <button 
                  onClick={handleDeleteAd}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition"
                  disabled={submitting}
                >
                  {submitting ? 'Menghapus...' : 'Ya, Hapus'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
