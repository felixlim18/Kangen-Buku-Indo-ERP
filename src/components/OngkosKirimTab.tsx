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
  Truck, 
  Store, 
  Mail, 
  Package, 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Download,
  Info,
  CheckCircle2,
  AlertCircle,
  Settings,
  CreditCard,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { 
  formatNTD, 
  formatNumber, 
  cleanCommas, 
  formatInputWithCommas 
} from '../lib/decimal-utils';
import { isPeriodClosed, getYearMonth } from '../lib/period-closing-utils';
import { ensureAutoAccountExists, AUTO_ACCOUNTS, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';

export interface OngkosKirimEntry {
  id: string;
  docNo: string;
  tanggal: string; // YYYY-MM-DD
  kurir: string; // '7-Eleven' | 'Family Mart' | '郵局' | custom
  akun: string; // '1101 - Cash: NTD' | '1102 - Cash: Rupiah'
  accountCode?: string; // '1101' or '1102'
  nominal: number; // NT$ standard amount
  nominalNTDCents: number; // NT$ cents for accounting journal
  ket?: string; // Keterangan / No. Resi
  journalId?: string;
  status?: 'Belum Dibayar' | 'Dibayar';
  tanggalBayar?: string;
  sourceOrderNo?: string;
  soId?: string;
  soStatus?: string;
  isAuto?: boolean;
  isUserEdited?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

const COURIER_CONFIG: Record<string, { label: string; accent?: string; bgClass: string; borderClass: string; textClass: string; icon: 'store' | 'mail' | 'truck' }> = {
  '7-Eleven': {
    label: '7-Eleven',
    accent: '#c2410c',
    bgClass: 'bg-orange-50 dark:bg-orange-950/20',
    borderClass: 'border-orange-200 dark:border-orange-900/30',
    textClass: 'text-orange-700 dark:text-orange-400',
    icon: 'store'
  },
  'FamilyMart': {
    label: 'FamilyMart',
    accent: '#0f766e',
    bgClass: 'bg-teal-50 dark:bg-teal-950/20',
    borderClass: 'border-teal-200 dark:border-teal-900/30',
    textClass: 'text-teal-700 dark:text-teal-400',
    icon: 'store'
  },
  'Family Mart': {
    label: 'FamilyMart',
    accent: '#0f766e',
    bgClass: 'bg-teal-50 dark:bg-teal-950/20',
    borderClass: 'border-teal-200 dark:border-teal-900/30',
    textClass: 'text-teal-700 dark:text-teal-400',
    icon: 'store'
  },
  '郵局': {
    label: '郵局 (Post Office)',
    accent: '#2f7a52',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/20',
    borderClass: 'border-emerald-200 dark:border-emerald-900/30',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    icon: 'mail'
  },
  'IopenMall': {
    label: 'IopenMall',
    accent: '#1d4ed8',
    bgClass: 'bg-blue-50 dark:bg-blue-950/20',
    borderClass: 'border-blue-200 dark:border-blue-900/30',
    textClass: 'text-blue-700 dark:text-blue-400',
    icon: 'store'
  },
  'Shopee': {
    label: 'Shopee',
    accent: '#ea580c',
    bgClass: 'bg-amber-50 dark:bg-amber-950/20',
    borderClass: 'border-amber-200 dark:border-amber-900/30',
    textClass: 'text-amber-700 dark:text-amber-400',
    icon: 'store'
  }
};

const getCourierConfig = (kurir: string) => {
  if (COURIER_CONFIG[kurir]) return COURIER_CONFIG[kurir];
  const lower = (kurir || '').toLowerCase();
  if (lower.includes('7-eleven') || lower.includes('711')) {
    return { label: kurir, bgClass: 'bg-orange-50 dark:bg-orange-950/20', borderClass: 'border-orange-200 dark:border-orange-900/30', textClass: 'text-orange-700 dark:text-orange-400', icon: 'store' as const };
  }
  if (lower.includes('family')) {
    return { label: kurir, bgClass: 'bg-teal-50 dark:bg-teal-950/20', borderClass: 'border-teal-200 dark:border-teal-900/30', textClass: 'text-teal-700 dark:text-teal-400', icon: 'store' as const };
  }
  if (lower.includes('post') || lower.includes('郵局') || lower.includes('pos')) {
    return { label: kurir, bgClass: 'bg-emerald-50 dark:bg-emerald-950/20', borderClass: 'border-emerald-200 dark:border-emerald-900/30', textClass: 'text-emerald-700 dark:text-emerald-400', icon: 'mail' as const };
  }
  if (lower.includes('shopee') || lower.includes('iopen')) {
    return { label: kurir, bgClass: 'bg-amber-50 dark:bg-amber-950/20', borderClass: 'border-amber-200 dark:border-amber-900/30', textClass: 'text-amber-700 dark:text-amber-400', icon: 'store' as const };
  }
  return { label: kurir, bgClass: 'bg-neutral-100 dark:bg-neutral-800', borderClass: 'border-neutral-200 dark:border-neutral-700', textClass: 'text-neutral-700 dark:text-neutral-300', icon: 'truck' as const };
};

interface OngkosKirimTabProps {
  setTab?: (tab: string) => void;
}

export const OngkosKirimTab: React.FC<OngkosKirimTabProps> = ({ setTab }) => {
  const { user } = useAuth();
  
  // Data State
  const [entries, setEntries] = useState<OngkosKirimEntry[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [coaCashAccounts, setCoaCashAccounts] = useState<{ code: string; name: string }[]>([]);

  // Selected Month (Date Object)
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourierFilter, setSelectedCourierFilter] = useState<string>('Semua');

  // Manage Platform Auto Settings State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [platformAutoConfig, setPlatformAutoConfig] = useState<Record<string, { enabled: boolean; enabledAt: string }>>({});

  // Payment Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedEntryForPay, setSelectedEntryForPay] = useState<OngkosKirimEntry | null>(null);
  const [payTanggal, setPayTanggal] = useState('');
  const [payAkun, setPayAkun] = useState('1101 - Cash: NTD');
  const [payNominalRaw, setPayNominalRaw] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntryForEdit, setSelectedEntryForEdit] = useState<OngkosKirimEntry | null>(null);
  const [selectedEntryForDelete, setSelectedEntryForDelete] = useState<OngkosKirimEntry | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedEntryForCancelPay, setSelectedEntryForCancelPay] = useState<OngkosKirimEntry | null>(null);
  const [isCancelPayModalOpen, setIsCancelPayModalOpen] = useState(false);
  const [cancelPaySubmitting, setCancelPaySubmitting] = useState(false);

  // Form State
  const [formTanggal, setFormTanggal] = useState('');
  const [formKurir, setFormKurir] = useState('7-Eleven');
  const [formAkun, setFormAkun] = useState('1101 - Cash: NTD');
  const [formNominalRaw, setFormNominalRaw] = useState('');
  const [formKet, setFormKet] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const triggerToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 1. Subscribe to Ongkos Kirim collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ongkosKirim'), (snap) => {
      const list: OngkosKirimEntry[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as OngkosKirimEntry);
      });
      // Sort desc by tanggal then docNo
      list.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.docNo.localeCompare(a.docNo));
      setEntries(list);
    }, (err) => {
      console.error("Error fetching ongkos kirim entries:", err);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to Closed Periods
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'closedPeriods'), (snap) => {
      const closedList: string[] = [];
      snap.forEach(d => {
        if (d.data().isClosed) {
          closedList.push(d.id);
        }
      });
      setClosedPeriods(closedList);
    }, (err) => {
      console.error("Error fetching closed periods:", err);
    });
    return () => unsub();
  }, []);

  // 3. Subscribe to CoA Cash Accounts (1100 family, excluding parent 1100)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'coa'), (snap) => {
      const accounts: { code: string; name: string }[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.code && data.name && data.code.startsWith('110') && data.code !== '1100') {
          accounts.push({ code: data.code, name: data.name });
        }
      });
      accounts.sort((a, b) => a.code.localeCompare(b.code));
      setCoaCashAccounts(accounts);
    }, (err) => {
      console.error("Error fetching CoA accounts:", err);
    });
    return () => unsub();
  }, []);

  // 4. Subscribe to Categories collection (Sales Order platforms: config_platform_*)
  const [salesPlatforms, setSalesPlatforms] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'categories'), (snap) => {
      const list: { name: string; position?: number }[] = [];
      snap.docs.forEach(d => {
        if (d.id.startsWith('config_platform_')) {
          const data = d.data();
          if (data.name && typeof data.name === 'string') {
            list.push({ name: data.name, position: data.position ?? 999 });
          }
        }
      });
      list.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
      setSalesPlatforms(list.map(item => item.name));
    }, (err) => {
      console.error("Error fetching sales platforms:", err);
    });
    return () => unsub();
  }, []);

  const availableCouriers = useMemo(() => {
    if (salesPlatforms.length > 0) return salesPlatforms;
    return ['7-Eleven', 'IopenMall', 'Shopee', 'FamilyMart', '郵局'];
  }, [salesPlatforms]);

  // 5. Subscribe to Platform Auto Config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'ongkir_platform_config'), (snap) => {
      if (snap.exists()) {
        setPlatformAutoConfig(snap.data()?.platforms || {});
      } else {
        setPlatformAutoConfig({});
      }
    }, (err) => {
      console.error("Error subscribing to platform auto config:", err);
    });
    return () => unsub();
  }, []);

  // Standard platform list for Manage modal
  const managePlatformList = ['IopenMall', '7-Eleven', 'Shopee', 'FamilyMart', 'Post Office'];

  const handleTogglePlatformAuto = async (platformName: string, currentEnabled: boolean) => {
    try {
      const newEnabled = !currentEnabled;
      const updatedConfig = {
        ...platformAutoConfig,
        [platformName]: {
          enabled: newEnabled,
          enabledAt: new Date().toISOString()
        }
      };
      await setDoc(doc(db, 'settings', 'ongkir_platform_config'), { platforms: updatedConfig }, { merge: true });
    } catch (err: any) {
      console.error("Error updating platform auto config:", err);
      triggerToast("Gagal mengubah pengaturan platform", "error");
    }
  };

  const normalizePlatform = (name: string): string => {
    if (!name) return '7-Eleven';
    const lower = name.toLowerCase();
    if (lower.includes('7-eleven') || lower.includes('711')) return '7-Eleven';
    if (lower.includes('family')) return 'FamilyMart';
    if (lower.includes('post') || lower.includes('pos') || lower.includes('郵局')) return 'Post Office';
    if (lower.includes('iopen')) return 'IopenMall';
    if (lower.includes('shopee')) return 'Shopee';
    return name;
  };

  // 6. Realtime Listener on salesOrders to Auto Sync entries to Ongkos Kirim
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      snap.docs.forEach(async (d) => {
        const so = d.data();
        const rawPlatform = so.platformOrder || so.customerPlatformName || so.pickupLogistics || '';
        const platform = normalizePlatform(rawPlatform);
        const config = platformAutoConfig[platform];

        if (!config || !config.enabled || !config.enabledAt) return;

        let soCreatedAtISO: string | null = null;
        if (so.createdAt?.toDate) {
          soCreatedAtISO = so.createdAt.toDate().toISOString();
        } else if (so.createdAt?.seconds) {
          soCreatedAtISO = new Date(so.createdAt.seconds * 1000).toISOString();
        } else if (so.orderDate) {
          soCreatedAtISO = typeof so.orderDate === 'string' ? so.orderDate : new Date(so.orderDate).toISOString();
        }

        if (!soCreatedAtISO || soCreatedAtISO < config.enabledAt) return;

        const cleanOrderCode = (so.orderCode || so.orderNumber || d.id || '').replace(/^#/, '');
        const existingEntry = entries.find(e => e.soId === d.id || e.sourceOrderNo === cleanOrderCode);

        if (existingEntry) {
          if (so.status && existingEntry.soStatus !== so.status) {
            try {
              await updateDoc(doc(db, 'ongkosKirim', existingEntry.id), { soStatus: so.status });
            } catch (err) {
              console.error("Error updating soStatus on existing entry:", err);
            }
          }
        } else if (so.status !== 'cancelled' && so.status !== 'returned') {
          try {
            const entryId = `ok_auto_${d.id}`;
            const yy = String(new Date().getFullYear()).slice(-2);
            const mm = String(new Date().getMonth() + 1).padStart(2, '0');
            const dd = String(new Date().getDate()).padStart(2, '0');
            const shortId = d.id.slice(-3).toUpperCase();
            const docNo = `OK${yy}${mm}${dd}${shortId}`;

            const orderDateStr = so.orderDate ? (typeof so.orderDate === 'string' ? so.orderDate.slice(0, 10) : new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
            const nominalVal = 0;
            const nominalNTDCents = 0;

            const newAutoEntry: OngkosKirimEntry = {
              id: entryId,
              docNo,
              tanggal: orderDateStr,
              kurir: platform,
              akun: '1101 - Cash: NTD',
              accountCode: '1101',
              nominal: 0,
              nominalNTDCents: 0,
              ket: `Auto dari Order #${cleanOrderCode}`,
              sourceOrderNo: cleanOrderCode,
              soId: d.id,
              soStatus: so.status || 'draft',
              status: 'Belum Dibayar',
              journalId: '',
              isAuto: true,
              isUserEdited: false,
              createdAt: Timestamp.now()
            };

            await setDoc(doc(db, 'ongkosKirim', entryId), newAutoEntry);
          } catch (err) {
            console.error("Error auto creating ongkosKirim entry:", err);
          }
        }
      });
    }, (err) => {
      console.error("Error watching salesOrders:", err);
    });

    return () => unsub();
  }, [platformAutoConfig, entries]);

  // Determine currency prefix (NT$ vs Rp) based on selected formAkun
  const currencyPrefix = useMemo(() => {
    const lower = formAkun.toLowerCase();
    return (lower.includes('rupiah') || lower.includes('1102') || lower.includes('idr') || lower.includes('rp')) ? 'Rp' : 'NT$';
  }, [formAkun]);

  // Helpers for Month Navigation
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Filter entries for selected month
  const monthlyEntries = useMemo(() => {
    const ymTarget = getYearMonth(currentDate);
    return entries.filter(e => {
      if (!e.tanggal) return false;
      return e.tanggal.substring(0, 7) === ymTarget;
    });
  }, [entries, currentDate]);

  // Apply courier filter and search query
  const filteredEntries = useMemo(() => {
    return monthlyEntries.filter(e => {
      const matchesCourier = selectedCourierFilter === 'Semua' || e.kurir === selectedCourierFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || 
        e.docNo.toLowerCase().includes(q) || 
        e.kurir.toLowerCase().includes(q) || 
        (e.ket && e.ket.toLowerCase().includes(q)) ||
        (e.akun && e.akun.toLowerCase().includes(q));
      return matchesCourier && matchesSearch;
    });
  }, [monthlyEntries, selectedCourierFilter, searchQuery]);

  // Requirement 10: Only show couriers that exist in history for current selected month
  const couriersInHistory = useMemo(() => {
    const set = new Set<string>();
    monthlyEntries.forEach(e => {
      if (e.kurir) set.add(e.kurir);
    });
    return Array.from(set);
  }, [monthlyEntries]);

  // Requirement 8: Summary cards only sum/count transactions with status === 'Dibayar'
  const paidEntries = useMemo(() => {
    return filteredEntries.filter(e => {
      const st = e.status || (e.journalId ? 'Dibayar' : 'Belum Dibayar');
      return st === 'Dibayar';
    });
  }, [filteredEntries]);

  const unpaidEntriesCount = useMemo(() => {
    return filteredEntries.filter(e => {
      const st = e.status || (e.journalId ? 'Dibayar' : 'Belum Dibayar');
      return st === 'Belum Dibayar';
    }).length;
  }, [filteredEntries]);

  const totalDiRiwayatCents = useMemo(() => {
    return paidEntries.reduce((sum, e) => sum + (e.nominalNTDCents || Math.round((e.nominal || 0) * 100)), 0);
  }, [paidEntries]);

  const courierTotals = useMemo(() => {
    const map: Record<string, { amountCents: number; count: number }> = {};
    couriersInHistory.forEach(c => {
      map[c] = { amountCents: 0, count: 0 };
    });
    paidEntries.forEach(e => {
      if (!map[e.kurir]) {
        map[e.kurir] = { amountCents: 0, count: 0 };
      }
      const cents = e.nominalNTDCents || Math.round((e.nominal || 0) * 100);
      map[e.kurir].amountCents += cents;
      map[e.kurir].count += 1;
    });
    return map;
  }, [paidEntries, couriersInHistory]);

  // Document Number Generator: OK + YYMMDD + 001
  const generateOngkirCodeInTransaction = async (dateStr: string): Promise<string> => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) throw new Error("Format tanggal tidak valid");
    const yy = parts[0].slice(-2);
    const mm = parts[1];
    const dd = parts[2];
    const cleanDateStr = `${yy}${mm}${dd}`;
    const counterId = `OK_${cleanDateStr}`;
    
    const counterRef = doc(db, 'counters', counterId);
    let nextValue = 1;
    
    await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      if (counterSnap.exists()) {
        nextValue = counterSnap.data().value + 1;
      }
      transaction.set(counterRef, { value: nextValue });
    });
    
    const seqStr = String(nextValue).padStart(3, '0');
    return `OK${cleanDateStr}${seqStr}`;
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    
    setSelectedEntryForEdit(null);
    setFormTanggal(`${y}-${m}-${d}`);
    setFormKurir('7-Eleven');
    setFormAkun(coaCashAccounts.length > 0 ? `${coaCashAccounts[0].code} - ${coaCashAccounts[0].name}` : '1101 - Cash: NTD');
    setFormNominalRaw('');
    setFormKet('');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (entry: OngkosKirimEntry) => {
    if (isPeriodClosed(entry.tanggal, closedPeriods)) {
      triggerToast(`Periode ${entry.tanggal.substring(0, 7)} sudah ditutup. Data tidak dapat diubah!`, 'error');
      return;
    }
    setSelectedEntryForEdit(entry);
    setFormTanggal(entry.tanggal);
    setFormKurir(entry.kurir || '7-Eleven');
    setFormAkun(entry.akun || '1101 - Cash: NTD');
    setFormNominalRaw(entry.nominal && entry.nominal > 0 && (entry.isUserEdited || entry.status === 'Dibayar' || !entry.isAuto) ? formatNumber(entry.nominal) : '');
    setFormKet(entry.ket || '');
    setIsModalOpen(true);
  };

  // Submit Handler for Add or Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!formTanggal) {
      triggerToast('Tanggal wajib diisi!', 'error');
      return;
    }

    if (isPeriodClosed(formTanggal, closedPeriods)) {
      triggerToast(`Periode ${formTanggal.substring(0, 7)} sudah ditutup! Transaksi tidak dapat disimpan.`, 'error');
      return;
    }

    const nominalVal = parseFloat(cleanCommas(formNominalRaw)) || 0;
    if (nominalVal <= 0) {
      triggerToast('Nominal harus lebih dari 0!', 'error');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Resolve cash account details
      const accountCodeMatch = formAkun.match(/^(\d{4})/);
      const accountCode = accountCodeMatch ? accountCodeMatch[1] : (formAkun.includes('1102') ? '1102' : '1101');
      const accountName = formAkun.includes('1102') ? 'Cash Rupiah' : (formAkun.includes('1101') ? 'Cash:NTD' : formAkun.split(' - ')[1] || 'Cash:NTD');
      
      const cashAcc = {
        code: accountCode,
        name: accountName,
        type: 'Assets' as const,
        subType: 'Aset Lancar'
      };

      // Ensure expense account & cash account exist in CoA
      await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_ONGKIR);
      await ensureAutoAccountExists(cashAcc);

      const nominalNTDCents = Math.round(nominalVal * 100);
      const batch = writeBatch(db);

      if (selectedEntryForEdit) {
        // Edit flow
        const entryId = selectedEntryForEdit.id;
        const entryRef = doc(db, 'ongkosKirim', entryId);

        const updatedPayload: Partial<OngkosKirimEntry> = {
          tanggal: formTanggal,
          kurir: formKurir,
          akun: formAkun,
          accountCode: cashAcc.code,
          nominal: nominalVal,
          nominalNTDCents,
          ket: formKet.trim(),
          isUserEdited: true,
          updatedAt: Timestamp.now()
        };
        batch.update(entryRef, updatedPayload);

        // Update Auto-Journal Entry if it exists
        if (selectedEntryForEdit.journalId) {
          const journalRef = doc(db, 'journalEntries', selectedEntryForEdit.journalId);
          const journalPayload = {
            date: Timestamp.fromDate(new Date(formTanggal)),
            description: `${selectedEntryForEdit.docNo} - Ongkos Kirim (${formKurir})`,
            lines: [
              {
                account: AUTO_ACCOUNTS.BEBAN_ONGKIR.name,
                accountCode: AUTO_ACCOUNTS.BEBAN_ONGKIR.code,
                debit: nominalNTDCents,
                credit: 0
              },
              {
                account: cashAcc.name,
                accountCode: cashAcc.code,
                debit: 0,
                credit: nominalNTDCents
              }
            ],
            updatedAt: Timestamp.now()
          };
          batch.update(journalRef, journalPayload);
        }

        await batch.commit();
        triggerToast(`Entri ongkos kirim ${selectedEntryForEdit.docNo} berhasil diperbarui!`, 'success');
      } else {
        // Add flow - default status is 'Belum Dibayar', no journal until payment
        const docNo = await generateOngkirCodeInTransaction(formTanggal);
        const entryId = `ok_${Date.now()}`;

        const entryRef = doc(db, 'ongkosKirim', entryId);

        const newEntryPayload: OngkosKirimEntry = {
          id: entryId,
          docNo,
          tanggal: formTanggal,
          kurir: formKurir,
          akun: formAkun,
          accountCode: cashAcc.code,
          nominal: nominalVal,
          nominalNTDCents,
          ket: formKet.trim(),
          status: 'Belum Dibayar',
          journalId: '',
          isUserEdited: true,
          createdAt: Timestamp.now()
        };
        batch.set(entryRef, newEntryPayload);

        await batch.commit();
        triggerToast(`Entri ongkos kirim ${docNo} berhasil disimpan dengan status Belum Dibayar.`, 'success');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Error submitting ongkos kirim entry:", err);
      triggerToast(`Gagal menyimpan: ${err.message || 'Terjadi kesalahan sistem'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Payment Modal
  const handleOpenPayModal = (entry: OngkosKirimEntry) => {
    if (isPeriodClosed(entry.tanggal, closedPeriods)) {
      triggerToast(`Periode ${entry.tanggal.substring(0, 7)} sudah ditutup. Data tidak dapat diubah!`, 'error');
      return;
    }

    if (entry.soId && entry.soStatus && !['shipped', 'completed'].includes(entry.soStatus)) {
      triggerToast('Tombol Bayar hanya bisa ditekan saat Sales Order sudah dalam status Dikirim.', 'error');
      return;
    }

    setSelectedEntryForPay(entry);
    const today = new Date().toISOString().slice(0, 10);
    setPayTanggal(entry.tanggal || today);
    setPayAkun(entry.akun || (coaCashAccounts.length > 0 ? `${coaCashAccounts[0].code} - ${coaCashAccounts[0].name}` : '1101 - Cash: NTD'));
    setPayNominalRaw(entry.nominal && entry.nominal > 0 && (entry.isUserEdited || entry.status === 'Dibayar' || !entry.isAuto) ? formatNumber(entry.nominal) : '');
    setIsPayModalOpen(true);
  };

  // Submit Payment Confirmation
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryForPay || paySubmitting) return;

    if (isPeriodClosed(payTanggal, closedPeriods)) {
      triggerToast(`Periode ${payTanggal.substring(0, 7)} sudah ditutup! Transaksi tidak dapat diproses.`, 'error');
      return;
    }

    const nominalVal = parseFloat(cleanCommas(payNominalRaw)) || 0;
    if (nominalVal <= 0) {
      triggerToast('Nominal harus lebih dari 0!', 'error');
      return;
    }

    setPaySubmitting(true);
    try {
      const accountCodeMatch = payAkun.match(/^(\d{4})/);
      const accountCode = accountCodeMatch ? accountCodeMatch[1] : (payAkun.includes('1102') ? '1102' : '1101');
      const accountName = payAkun.includes('1102') ? 'Cash Rupiah' : (payAkun.includes('1101') ? 'Cash:NTD' : payAkun.split(' - ')[1] || 'Cash:NTD');

      const cashAcc = {
        code: accountCode,
        name: accountName,
        type: 'Assets' as const,
        subType: 'Aset Lancar'
      };

      await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_ONGKIR);
      await ensureAutoAccountExists(cashAcc);

      const nominalNTDCents = Math.round(nominalVal * 100);
      const tglForJrn = new Date().toISOString().split('T')[0];
      const journalId = await getNextJournalId(tglForJrn);
      const batch = writeBatch(db);

      // Create Auto Journal Entry
      const journalRef = doc(db, 'journalEntries', journalId);
      const desc = `${selectedEntryForPay.docNo} - Ongkos Kirim (${selectedEntryForPay.kurir}) ${selectedEntryForPay.sourceOrderNo ? '- Order #' + selectedEntryForPay.sourceOrderNo : (selectedEntryForPay.ket ? '- ' + selectedEntryForPay.ket : '')}`;

      const journalPayload = {
        id: journalId,
        date: Timestamp.fromDate(new Date(payTanggal)),
        description: desc,
        refType: 'Expenses',
        refId: selectedEntryForPay.id,
        isAuto: true,
        createdAt: Timestamp.now(),
        lines: [
          {
            account: AUTO_ACCOUNTS.BEBAN_ONGKIR.name,
            accountCode: AUTO_ACCOUNTS.BEBAN_ONGKIR.code,
            debit: nominalNTDCents,
            credit: 0
          },
          {
            account: cashAcc.name,
            accountCode: cashAcc.code,
            debit: 0,
            credit: nominalNTDCents
          }
        ]
      };
      batch.set(journalRef, journalPayload);

      // Update Ongkos Kirim Entry
      const entryRef = doc(db, 'ongkosKirim', selectedEntryForPay.id);
      batch.update(entryRef, {
        status: 'Dibayar',
        tanggal: payTanggal,
        tanggalBayar: payTanggal,
        akun: payAkun,
        accountCode: cashAcc.code,
        nominal: nominalVal,
        nominalNTDCents,
        journalId,
        isUserEdited: true,
        updatedAt: Timestamp.now()
      });

      await batch.commit();
      triggerToast(`Pembayaran ${selectedEntryForPay.docNo} berhasil dikonfirmasi & jurnal dicatat!`, 'success');
      setIsPayModalOpen(false);
      setSelectedEntryForPay(null);
    } catch (err: any) {
      console.error("Error confirming payment:", err);
      triggerToast(`Gagal memproses pembayaran: ${err.message || 'Terjadi kesalahan'}`, 'error');
    } finally {
      setPaySubmitting(false);
    }
  };

  // Open Delete Confirmation
  const handleOpenDeleteConfirm = (entry: OngkosKirimEntry) => {
    if (isPeriodClosed(entry.tanggal, closedPeriods)) {
      triggerToast(`Periode ${entry.tanggal.substring(0, 7)} sudah ditutup. Data tidak dapat dihapus!`, 'error');
      return;
    }
    setSelectedEntryForDelete(entry);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!selectedEntryForDelete || submitting) return;

    if (isPeriodClosed(selectedEntryForDelete.tanggal, closedPeriods)) {
      triggerToast(`Periode ${selectedEntryForDelete.tanggal.substring(0, 7)} sudah ditutup! Data tidak dapat dihapus.`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);

      // Delete entry doc
      const entryRef = doc(db, 'ongkosKirim', selectedEntryForDelete.id);
      batch.delete(entryRef);

      // Delete associated auto-journal if exists
      if (selectedEntryForDelete.journalId) {
        const journalRef = doc(db, 'journalEntries', selectedEntryForDelete.journalId);
        batch.delete(journalRef);
      }

      await batch.commit();
      triggerToast(`Entri ${selectedEntryForDelete.docNo} dan jurnal terkait berhasil dihapus!`, 'success');
      setIsDeleteModalOpen(false);
      setSelectedEntryForDelete(null);
    } catch (err: any) {
      console.error("Error deleting entry:", err);
      triggerToast(`Gagal menghapus: ${err.message || 'Terjadi kesalahan'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Cancel Pay Modal
  const handleOpenCancelPayModal = (entry: OngkosKirimEntry) => {
    if (isPeriodClosed(entry.tanggal, closedPeriods)) {
      triggerToast(`Periode ${entry.tanggal.substring(0, 7)} sudah ditutup. Pembayaran tidak dapat dibatalkan!`, 'error');
      return;
    }
    setSelectedEntryForCancelPay(entry);
    setIsCancelPayModalOpen(true);
  };

  // Confirm Cancel Pay
  const handleConfirmCancelPay = async () => {
    if (!selectedEntryForCancelPay || cancelPaySubmitting) return;

    if (isPeriodClosed(selectedEntryForCancelPay.tanggal, closedPeriods)) {
      triggerToast(`Periode ${selectedEntryForCancelPay.tanggal.substring(0, 7)} sudah ditutup! Pembayaran tidak dapat dibatalkan.`, 'error');
      return;
    }

    setCancelPaySubmitting(true);
    try {
      const batch = writeBatch(db);

      const entryRef = doc(db, 'ongkosKirim', selectedEntryForCancelPay.id);

      // Delete associated auto-journal if exists
      if (selectedEntryForCancelPay.journalId) {
        const journalRef = doc(db, 'journalEntries', selectedEntryForCancelPay.journalId);
        batch.delete(journalRef);
      }

      batch.update(entryRef, {
        status: 'Belum Dibayar',
        journalId: '',
        updatedAt: Timestamp.now()
      });

      await batch.commit();
      triggerToast(`Pembayaran entri ${selectedEntryForCancelPay.docNo} berhasil dibatalkan! Status kembali ke Belum Dibayar.`, 'success');
      setIsCancelPayModalOpen(false);
      setSelectedEntryForCancelPay(null);
    } catch (err: any) {
      console.error("Error cancelling payment:", err);
      triggerToast(`Gagal membatalkan pembayaran: ${err.message || 'Terjadi kesalahan'}`, 'error');
    } finally {
      setCancelPaySubmitting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) {
      triggerToast('Tidak ada data untuk diekspor!', 'error');
      return;
    }

    const headers = ['No. Doc', 'Tanggal', 'Kurir / Ekspedisi', 'Akun Kas', 'Nominal (NT$)', 'Keterangan', 'ID Jurnal'];
    const rows = filteredEntries.map(e => [
      `"${e.docNo}"`,
      `"${e.tanggal}"`,
      `"${e.kurir}"`,
      `"${e.akun}"`,
      e.nominal.toFixed(2),
      `"${(e.ket || '').replace(/"/g, '""')}"`,
      `"${e.journalId || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Ongkos_Kirim_${getYearMonth(currentDate)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('Data Ongkos Kirim berhasil di-download!', 'success');
  };

  // Courier Icon Helper
  const renderCourierIcon = (kurir: string, className = "h-5 w-5") => {
    const cfg = COURIER_CONFIG[kurir];
    if (cfg?.icon === 'store') return <Store className={className} />;
    if (cfg?.icon === 'mail') return <Mail className={className} />;
    return <Truck className={className} />;
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in select-text">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
          toastType === 'success' 
            ? 'bg-emerald-900/90 text-emerald-100 border-emerald-700 dark:bg-emerald-950 dark:border-emerald-800' 
            : 'bg-rose-900/90 text-rose-100 border-rose-700 dark:bg-rose-950 dark:border-rose-800'
        }`}>
          {toastType === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" /> : <AlertCircle className="h-5 w-5 text-rose-300 shrink-0" />}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-crimson-500/10 dark:bg-crimson-500/20 text-crimson-600 dark:text-crimson-400 flex items-center justify-center shrink-0">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Ongkos Kirim</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Pencatatan & Jurnal Pengeluaran Logistik Ekspedisi</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsManageModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-all cursor-pointer"
            title="Manage Platform Auto"
          >
            <Settings className="h-4 w-4" />
            <span>Manage</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-all cursor-pointer"
            title="Ekspor CSV"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Ekspor CSV</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-full bg-neutral-900 hover:bg-black text-white dark:bg-neutral-100 dark:hover:bg-white dark:text-neutral-900 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Ongkos Kirim</span>
          </button>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Card (Dark) */}
        <div className="bg-neutral-900 dark:bg-neutral-950 text-white p-5 rounded-2xl shadow-md border border-neutral-800 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total di Riwayat</span>
            <div className="h-8 w-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tracking-tight font-numeric">
              {formatNTD(totalDiRiwayatCents)}
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-neutral-400">
                {paidEntries.length} transaksi dibayar
              </p>
              {unpaidEntriesCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded-md">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {unpaidEntriesCount} belum dibayar
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Courier Cards (Requirement 10: Only couriers present in history) */}
        {couriersInHistory.map(kurir => {
          const cfg = getCourierConfig(kurir);
          const data = courierTotals[kurir] || { amountCents: 0, count: 0 };
          return (
            <div 
              key={kurir}
              className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-2xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{kurir}</span>
                <div className={`h-8 w-8 rounded-lg ${cfg.bgClass} ${cfg.textClass} flex items-center justify-center`}>
                  {renderCourierIcon(kurir, "h-4 w-4")}
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-neutral-900 dark:text-white font-numeric">
                  {formatNTD(data.amountCents)}
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                  {data.count} transaksi dibayar
                </p>
              </div>
            </div>
          );
        })}

      </div>

      {/* History Card & Controls */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-2xs p-5 md:p-6 space-y-5">
        
        {/* Header & Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Riwayat Ongkos Kirim</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Pencatatan status & jurnal pengeluaran ongkos kirim.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            
            {/* Month Switcher */}
            <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-800/80 p-1 rounded-full border border-neutral-200/60 dark:border-neutral-700/60">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 rounded-full bg-neutral-900 hover:bg-black text-white dark:bg-neutral-100 dark:hover:bg-white dark:text-neutral-900 transition cursor-pointer shadow-2xs"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 px-2 min-w-[100px] text-center">
                {formatMonthYear(currentDate)}
              </span>
              <button 
                onClick={handleNextMonth}
                className="p-1.5 rounded-full bg-neutral-900 hover:bg-black text-white dark:bg-neutral-100 dark:hover:bg-white dark:text-neutral-900 transition cursor-pointer shadow-2xs"
                title="Bulan Berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Courier Filter Pills (Requirement 10: only couriers present in history) */}
            <div className="flex items-center bg-neutral-100 dark:bg-neutral-800/80 p-1 rounded-full border border-neutral-200/60 dark:border-neutral-700/60 overflow-x-auto">
              {['Semua', ...couriersInHistory].map(cName => {
                const isActive = selectedCourierFilter === cName;
                return (
                  <button
                    key={cName}
                    onClick={() => setSelectedCourierFilter(cName)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition cursor-pointer whitespace-nowrap ${
                      isActive 
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs font-bold' 
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 font-semibold'
                    }`}
                  >
                    {cName}
                  </button>
                );
              })}
            </div>

          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan No. Doc, kurir, atau keterangan..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/80 focus:outline-none focus:ring-2 focus:ring-crimson-500/30 text-neutral-900 dark:text-white placeholder-neutral-400 transition"
          />
        </div>

        {/* List of Entries */}
        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl bg-neutral-50/50 dark:bg-neutral-800/20">
            <Truck className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Tidak Ada Data Ongkos Kirim</p>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              {searchQuery || selectedCourierFilter !== 'Semua' 
                ? 'Tidak ada entri yang cocok dengan filter pencarian.' 
                : 'Belum ada transaksi ongkos kirim yang dicatat untuk periode ini.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map(entry => {
              const cfg = getCourierConfig(entry.kurir);
              const statusStr = entry.status || (entry.journalId ? 'Dibayar' : 'Belum Dibayar');
              const isUnpaid = statusStr === 'Belum Dibayar';

              return (
                <div 
                  key={entry.id}
                  className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition shadow-2xs overflow-hidden ${
                    isUnpaid
                      ? 'bg-[#fffbf0] dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/40 border-l-[5px] border-l-amber-600'
                      : 'bg-white dark:bg-neutral-900 border-neutral-200/70 dark:border-neutral-800 border-l-[4px] hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                  style={!isUnpaid ? { borderLeftColor: cfg.accent } : undefined}
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    {/* Icon */}
                    <div className={`h-10 w-10 rounded-xl ${cfg.bgClass} ${cfg.textClass} flex items-center justify-center shrink-0`}>
                      {renderCourierIcon(entry.kurir, "h-5 w-5")}
                    </div>

                    {/* Entry Information */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-numeric font-bold text-xs text-neutral-900 dark:text-white">
                          {entry.docNo}
                        </span>
                        <span className="text-neutral-300 dark:text-neutral-700">•</span>
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          {entry.tanggal}
                        </span>
                        {isUnpaid ? (
                          <span className="text-[10px] font-extrabold tracking-wider text-[#b45309] dark:text-amber-400 bg-amber-100/90 dark:bg-amber-900/40 px-2 py-0.5 rounded-md uppercase">
                            BELUM DIBAYAR
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md uppercase">
                            DIBAYAR
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-bold ${cfg.textClass}`}>
                          {entry.kurir}
                        </span>
                      </div>

                      {/* Requirement 3 & 7: Description row */}
                      <div className="text-[12px] text-neutral-600 dark:text-neutral-300 mt-0.5 font-medium">
                        {entry.sourceOrderNo ? (
                          <span>
                            Auto dari Order{' '}
                            <button
                              type="button"
                              onClick={() => {
                                localStorage.setItem('search_sales_order_filter', entry.sourceOrderNo || '');
                                if (setTab) setTab('sales');
                              }}
                              className="font-bold text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-700 dark:hover:text-blue-300 transition-colors bg-transparent border-none p-0 cursor-pointer inline-flex items-center gap-0.5"
                              title="Klik untuk membuka transaksi di Sales Order"
                            >
                              Order #{entry.sourceOrderNo}
                            </button>
                          </span>
                        ) : (
                          entry.ket || ''
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Nominal & Action Buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-neutral-100 dark:border-neutral-800">
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-neutral-900 dark:text-white font-numeric">
                        {(!entry.nominal || entry.nominal === 0 || (entry.isAuto && !entry.isUserEdited && entry.status !== 'Dibayar')) ? (
                          " - "
                        ) : entry.akun && (entry.akun.includes('1102') || entry.accountCode === '1102') ? (
                          `Rp ${formatNumber(entry.nominal)}`
                        ) : (
                          formatNTD(entry.nominalNTDCents || Math.round((entry.nominal || 0) * 100))
                        )}
                      </div>
                    </div>

                    {/* Buttons: Requirement 1 (Always visible) & Requirement 2 (Bayar button) */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isUnpaid ? (
                        <>
                          <button
                            onClick={() => handleOpenPayModal(entry)}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 rounded-full shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            <span>Bayar</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(entry)}
                            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
                            title="Edit Entri"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteConfirm(entry)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 dark:text-rose-400 transition cursor-pointer"
                            title="Hapus Entri"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(entry)}
                            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
                            title="Edit Entri"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenCancelPayModal(entry)}
                            className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                            title="Batalkan Pembayaran"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Batal</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ================= MODAL: Tambah / Edit Ongkos Kirim ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-crimson-500/10 dark:bg-crimson-500/20 text-crimson-600 dark:text-crimson-400 flex items-center justify-center">
                  <Truck className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {selectedEntryForEdit ? 'Edit Ongkos Kirim' : 'Tambah Ongkos Kirim'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4">
              
              {/* Tanggal */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Tanggal <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={formTanggal}
                  onChange={(e) => setFormTanggal(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-crimson-500/30 focus:outline-none transition"
                  required
                />
              </div>

              {/* Kurir & Akun Kas Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Kurir <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formKurir}
                    onChange={(e) => setFormKurir(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-neutral-500/30 focus:outline-none transition"
                    required
                  >
                    {availableCouriers.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Akun Kas <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formAkun}
                    onChange={(e) => setFormAkun(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-neutral-500/30 focus:outline-none transition"
                    required
                  >
                    {coaCashAccounts.length > 0 ? (
                      coaCashAccounts.map((acc, idx) => (
                        <option key={`${acc.id || acc.code}-${idx}`} value={`${acc.code} - ${acc.name}`}>
                          {acc.code} - {acc.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="1101 - Cash: NTD">1101 - Cash: NTD</option>
                        <option value="1102 - Cash: Rupiah">1102 - Cash: Rupiah</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Nominal */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Biaya Ongkos Kirim <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
                    {currencyPrefix}
                  </span>
                  <input
                    type="text"
                    value={formNominalRaw}
                    onChange={(e) => setFormNominalRaw(formatInputWithCommas(e.target.value))}
                    placeholder="0"
                    className="w-full pl-12 pr-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white font-numeric font-bold focus:ring-2 focus:ring-neutral-500/30 focus:outline-none transition"
                    required
                  />
                </div>
              </div>

              {/* Keterangan / No. Resi */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Keterangan / No. Resi <span className="text-neutral-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={formKet}
                  onChange={(e) => setFormKet(e.target.value)}
                  placeholder="SO12324132"
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-neutral-500/30 focus:outline-none transition"
                />
              </div>

              {/* Accounting Auto-Journal Note */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-[11px]">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <p>
                  Setiap entry otomatis mencatat jurnal: <strong>Debit Beban Ongkir (5230)</strong>, <strong>Kredit Akun Kas</strong> yang dipilih.
                </p>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-neutral-900 hover:bg-black text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  {submitting && <div className="h-3 w-3 border-2 border-white dark:border-neutral-900 border-t-transparent rounded-full animate-spin" />}
                  <span>{selectedEntryForEdit ? 'Perbarui Data' : 'Simpan Ongkos Kirim'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ================= MODAL: Konfirmasi Hapus ================= */}
      {isDeleteModalOpen && selectedEntryForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-sm w-full p-5 space-y-4 animate-scale-up">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="h-6 w-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">Hapus Ongkos Kirim?</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Apakah Anda yakin ingin menghapus entri <strong className="text-neutral-800 dark:text-neutral-200">{selectedEntryForDelete.docNo}</strong> ({selectedEntryForDelete.kurir} - {(!selectedEntryForDelete.nominal || selectedEntryForDelete.nominal === 0 || (selectedEntryForDelete.isAuto && !selectedEntryForDelete.isUserEdited && selectedEntryForDelete.status !== 'Dibayar')) ? ' - ' : (selectedEntryForDelete.akun && (selectedEntryForDelete.akun.includes('1102') || selectedEntryForDelete.accountCode === '1102') ? `Rp ${formatNumber(selectedEntryForDelete.nominal)}` : formatNTD(selectedEntryForDelete.nominalNTDCents || Math.round((selectedEntryForDelete.nominal || 0) * 100)))})?
              </p>
              <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-2 font-medium">
                Auto-jurnal terkait akan dihapus secara otomatis.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                {submitting && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Ya, Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Konfirmasi Batalkan Pembayaran ================= */}
      {isCancelPayModalOpen && selectedEntryForCancelPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-sm w-full p-5 space-y-4 animate-scale-up">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <RotateCcw className="h-6 w-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">Batalkan Pembayaran Ongkos Kirim?</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Apakah Anda yakin ingin membatalkan pembayaran entri <strong className="text-neutral-800 dark:text-neutral-200">{selectedEntryForCancelPay.docNo}</strong>?
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 font-medium">
                Status akan diubah kembali ke "Belum Dibayar" dan jurnal transaksi terkait akan dihapus secara otomatis.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setIsCancelPayModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
              <button
                onClick={handleConfirmCancelPay}
                disabled={cancelPaySubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {cancelPaySubmitting && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Batalkan Pembayaran</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Manage Platform Auto ================= */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                    Manage Platform Auto
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Otomatisasi pencatatan Ongkos Kirim dari Sales Order
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsManageModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-200 text-xs leading-relaxed">
                Pencatatan hanya berlaku mulai dari waktu tombol diaktifkan. Semua Sales Order yang dibuat setelah tombol aktif akan otomatis masuk ke &quot;Ongkos Kirim&quot; dengan status Belum Dibayar.
              </div>

              <div className="space-y-2.5">
                {managePlatformList.map(platform => {
                  const cfg = platformAutoConfig[platform] || { enabled: false, enabledAt: '' };
                  const isEnabled = cfg.enabled;

                  return (
                    <div 
                      key={platform}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-neutral-200/70 dark:bg-neutral-700/60 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                          {renderCourierIcon(platform, "h-4 w-4")}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-neutral-900 dark:text-white block">
                            {platform}
                          </span>
                          {isEnabled && cfg.enabledAt && (
                            <span className="text-[10px] text-neutral-400 block">
                              Aktif sejak: {new Date(cfg.enabledAt).toLocaleDateString('id-ID')}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTogglePlatformAuto(platform, isEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isEnabled ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 text-right">
              <button
                type="button"
                onClick={() => setIsManageModalOpen(false)}
                className="px-5 py-2 text-xs font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-xl hover:bg-black dark:hover:bg-neutral-100 transition cursor-pointer"
              >
                Selesai
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL: Konfirmasi Pembayaran ================= */}
      {isPayModalOpen && selectedEntryForPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                    Konfirmasi Pembayaran
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {selectedEntryForPay.docNo} • {selectedEntryForPay.kurir}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Payment Form */}
            <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
              
              {/* Tanggal Bayar */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Tanggal Pembayaran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={payTanggal}
                  onChange={(e) => setPayTanggal(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-emerald-500/30 focus:outline-none transition"
                  required
                />
              </div>

              {/* Akun Kas */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Akun Kas Pembayaran <span className="text-rose-500">*</span>
                </label>
                <select
                  value={payAkun}
                  onChange={(e) => setPayAkun(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-neutral-500/30 focus:outline-none transition"
                  required
                >
                  {coaCashAccounts.length > 0 ? (
                    coaCashAccounts.map((acc, idx) => (
                      <option key={`${acc.id || acc.code}-${idx}`} value={`${acc.code} - ${acc.name}`}>
                        {acc.code} - {acc.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="1101 - Cash: NTD">1101 - Cash: NTD</option>
                      <option value="1102 - Cash: Rupiah">1102 - Cash: Rupiah</option>
                    </>
                  )}
                </select>
              </div>

              {/* Nominal */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Biaya Ongkos Kirim <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
                    {(payAkun.includes('1102') || payAkun.toLowerCase().includes('rupiah')) ? 'Rp' : 'NT$'}
                  </span>
                  <input
                    type="text"
                    value={payNominalRaw}
                    onChange={(e) => setPayNominalRaw(formatInputWithCommas(e.target.value))}
                    className="w-full pl-12 pr-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white font-numeric font-bold focus:ring-2 focus:ring-neutral-500/30 focus:outline-none transition"
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300 text-[11px]">
                Menekan tombol <strong>Bayar</strong> akan otomatis membuat jurnal: <br />
                • <strong>Debit</strong>: Beban Ongkos Kirim (5230)<br />
                • <strong>Kredit</strong>: {payAkun}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paySubmitting}
                  className="px-5 py-2 text-xs font-bold bg-neutral-900 hover:bg-black text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  {paySubmitting && <div className="h-3 w-3 border-2 border-white dark:border-neutral-900 border-t-transparent rounded-full animate-spin" />}
                  <span>Bayar</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
