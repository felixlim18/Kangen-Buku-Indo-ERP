import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  Timestamp, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { 
  JournalEntry, 
  JournalEntryLine, 
  BankAccount, 
  BankReconciliation, 
  RevaluasiKursLog 
} from '../types';
import { DateRangePicker } from './ui/DateRangePicker';
import { formatIDR, formatNTD } from '../lib/decimal-utils';
import { fetchCurrentExchangeRate, isPeriodClosed, getYearMonth } from '../lib/period-closing-utils';
import { ensureAutoAccountExists, AUTO_ACCOUNTS, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { 
  Building2, 
  Download, 
  Search, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Plus, 
  X, 
  FileText, 
  Eye, 
  Sliders, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  DollarSign,
  TrendingUp,
  Scale,
  Landmark,
  CreditCard,
  Check,
  Info,
  Pencil,
  Trash2,
  ArrowLeftRight
} from 'lucide-react';

interface BankKasTabProps {
  setTab?: (tab: string) => void;
}

export const BankKasTab: React.FC<BankKasTabProps> = ({ setTab }) => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const canAccessRevaluasi = isOwner || profile?.permissions?.['bank-kas.revaluasi'] !== false;

  // State collections
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [revaluasiLogs, setRevaluasiLogs] = useState<RevaluasiKursLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Split Calculator State
  const [showSplitCalc, setShowSplitCalc] = useState<'1101' | '1102' | null>(null);
  const [splitCalcValues, setSplitCalcValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (showSplitCalc) {
      const newValues: Record<string, string> = {};
      bankAccounts.filter(b => b.linkedCoaCode === showSplitCalc).forEach(b => {
        newValues[b.id] = b.splitBalance !== undefined ? String(b.splitBalance) : '';
      });
      setSplitCalcValues(newValues);
    }
  }, [showSplitCalc, bankAccounts]);

  // Active filter state
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<'ALL' | '1101' | '1102'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Date Range Picker State
  const [datePreset, setDatePreset] = useState<string>('Semua Tanggal');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Month Stepper State
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());

  // Modals state
  const [selectedJournalForDetail, setSelectedJournalForDetail] = useState<JournalEntry | null>(null);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [isBankManageModalOpen, setIsBankManageModalOpen] = useState<boolean>(false);
  const [isRevaluasiModalOpen, setIsRevaluasiModalOpen] = useState<boolean>(false);
  const [deletingBankConfirm, setDeletingBankConfirm] = useState<{ id: string; name: string } | null>(null);

  // Bank Account Form state
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('KangenBukuIndo');
  const [bankCurrency, setBankCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [linkedCoaCode, setLinkedCoaCode] = useState<'1101' | '1102'>('1101');

  // Reconciliation Form state
  const [recDate, setRecDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [recAccountCode, setRecAccountCode] = useState<'1101' | '1102'>('1101');
  const [recSelectedBankId, setRecSelectedBankId] = useState<string>('');
  const [recStatementBalance, setRecStatementBalance] = useState<string>('');
  const [recNotes, setRecNotes] = useState<string>('');

  // Revaluation Form state
  const [revDate, setRevDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [closingRateInput, setClosingRateInput] = useState<string>('559.13');
  const [currentExchangeRate, setCurrentExchangeRate] = useState<number>(559.12932);
  const [autoReversal, setAutoReversal] = useState<boolean>(true);
  const [postingRevaluation, setPostingRevaluation] = useState<boolean>(false);

  // Closed Periods state
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);

  // Transfer Modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [liveAccounts, setLiveAccounts] = useState<Record<string, AutoAccount>>(AUTO_ACCOUNTS);
  
  useEffect(() => {
    getLiveAutoAccounts().then(setLiveAccounts).catch(console.error);
  }, []);
  
  const [transferDate, setTransferDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [transferFromAccount, setTransferFromAccount] = useState<'1101' | '1102'>('1101');
  const [transferToAccount, setTransferToAccount] = useState<'1101' | '1102'>('1102');
  const [amountFromInput, setAmountFromInput] = useState<string>('');
  const [amountToInput, setAmountToInput] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [submittingTransfer, setSubmittingTransfer] = useState<boolean>(false);

  useEffect(() => {
    fetchCurrentExchangeRate().then((rate) => {
      if (rate && rate > 0) {
        setCurrentExchangeRate(rate);
        setClosingRateInput(rate.toFixed(2));
      }
    });
  }, []);

  // Subscribe live to periodClosings
  useEffect(() => {
    const unsubClosings = onSnapshot(
      collection(db, 'periodClosings'),
      (snap) => {
        const list: string[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.status === 'Ditutup') {
            list.push(docSnap.id);
          }
        });
        setClosedPeriods(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'periodClosings')
    );
    return () => unsubClosings();
  }, []);

  // 1. Subscribe live to journalEntries
  useEffect(() => {
    setLoading(true);
    const unsubJournals = onSnapshot(
      collection(db, 'journalEntries'),
      (snap) => {
        const list: JournalEntry[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as JournalEntry);
        });
        // Sort newest first
        list.sort((a, b) => {
          const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
          const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
          return dateB - dateA;
        });
        setJournals(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'journalEntries');
        setLoading(false);
      }
    );

    // Subscribe live to bankAccounts
    let initialBanksChecked = false;
    const unsubBanks = onSnapshot(
      collection(db, 'bankAccounts'),
      (snap) => {
        const list: BankAccount[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as BankAccount);
        });
        setBankAccounts(list);

        // Seed default accounts ONLY if the collection in Firestore is genuinely empty on initial load
        if (!initialBanksChecked) {
          initialBanksChecked = true;
          if (snap.empty) {
            const default1: BankAccount = {
              id: 'bank-first-bank-ntd',
              bankName: '第一銀行 (First Bank)',
              accountNumber: '1101-MAIN-TW',
              accountHolder: 'KangenBukuIndo Taiwan',
              currency: 'NTD',
              linkedCoaCode: '1101',
              isActive: true,
              createdAt: Timestamp.now()
            };
            const default2: BankAccount = {
              id: 'bank-mandiri-idr',
              bankName: 'Bank Mandiri IDR',
              accountNumber: '1102-MANDIRI-ID',
              accountHolder: 'KangenBukuIndo ID',
              currency: 'IDR',
              linkedCoaCode: '1102',
              isActive: true,
              createdAt: Timestamp.now()
            };
            setDoc(doc(db, 'bankAccounts', default1.id), default1).catch(() => {});
            setDoc(doc(db, 'bankAccounts', default2.id), default2).catch(() => {});
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bankAccounts')
    );

    // Subscribe live to bankReconciliations
    const unsubRecs = onSnapshot(
      collection(db, 'bankReconciliations'),
      (snap) => {
        const list: BankReconciliation[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as BankReconciliation);
        });
        list.sort((a, b) => new Date(b.reconciliationDate).getTime() - new Date(a.reconciliationDate).getTime());
        setReconciliations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bankReconciliations')
    );

    // Subscribe live to revaluasiKursLogs
    const unsubRev = onSnapshot(
      collection(db, 'revaluasiKursLogs'),
      (snap) => {
        const list: RevaluasiKursLog[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as RevaluasiKursLog);
        });
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setRevaluasiLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'revaluasiKursLogs')
    );

    return () => {
      unsubJournals();
      unsubBanks();
      unsubRecs();
      unsubRev();
    };
  }, []);


  // Compute live balances for Cash NTD (1101) & Cash Rupiah (1102)
  const cashBalances = useMemo(() => {
    let ntdTotalCents = 0;
    let idrTotalRaw = 0;
    let idrNtdBookCents = 0;

    journals.forEach((j) => {
      if (!j.lines) return;
      j.lines.forEach((line) => {
        if (line.accountCode === '1101' || line.account?.includes('1101') || (line.account?.toLowerCase().includes('cash') && line.account?.toLowerCase().includes('ntd'))) {
          ntdTotalCents += (line.debit || 0) - (line.credit || 0);
        }
        if (line.accountCode === '1102' || line.account?.includes('1102') || line.account?.toLowerCase().includes('rupiah') || line.account?.toLowerCase().includes('idr')) {
          const netNTDCents = (line.debit || 0) - (line.credit || 0);
          idrNtdBookCents += netNTDCents;

          if (line.originalDebitIDR || line.originalCreditIDR) {
            idrTotalRaw += (line.originalDebitIDR || 0) - (line.originalCreditIDR || 0);
          } else {
            // Fallback: derive IDR from NTD debit/credit using transaction exchange rate (or current rate default)
            const rawRate = (j as any).exchangeRate || (j as any).fxRateUsed || currentExchangeRate || 559.13;
            const effectiveRate = rawRate < 1 ? (1 / rawRate) : rawRate;
            idrTotalRaw += Math.round((netNTDCents / 100) * effectiveRate);
          }
        }
      });
    });

    // Calculate NTD equivalent value for Cash Rupiah at current exchange rate
    // e.g. 1,659,046 IDR / 559.12932 = 2,967.14 NTD -> 296,714 cents
    const idrNtdCurrentCents = currentExchangeRate > 0 
      ? Math.round((idrTotalRaw / currentExchangeRate) * 100)
      : idrNtdBookCents;

    return {
      ntdTotalCents,
      ntdTotal: ntdTotalCents / 100,
      idrTotalRaw,
      idrNtdBookCents,
      idrNtdBook: idrNtdBookCents / 100,
      idrNtdCurrentCents,
      idrNtdCurrent: idrNtdCurrentCents / 100
    };
  }, [journals, currentExchangeRate]);

  // Flattened Cash Transactions List
  const allCashTransactions = useMemo(() => {
    const items: Array<{
      id: string;
      journalId: string;
      dateStr: string;
      dateObj: Date;
      description: string;
      refType: string;
      refId: string;
      accountCode: string;
      accountName: string;
      isDebit: boolean; // Cash In vs Cash Out
      amountCentsNTD: number;
      amountIDR?: number;
      originalCurrency?: 'NTD' | 'IDR';
      rawJournal: JournalEntry;
    }> = [];

    journals.forEach((j) => {
      if (!j.lines) return;
      const dObj = j.date?.toDate ? j.date.toDate() : new Date(j.date || Date.now());
      const dateStr = dObj.toISOString().split('T')[0];

      j.lines.forEach((line) => {
        const is1101 = line.accountCode === '1101' || line.accountCode === liveAccounts.CASH_NTD?.code || line.account?.includes('1101') || (liveAccounts.CASH_NTD && line.account?.includes(liveAccounts.CASH_NTD.code));
        const is1102 = line.accountCode === '1102' || line.account?.includes('1102') || line.account?.toLowerCase().includes('rupiah');

        if (is1101 || is1102) {
          const debitNTD = line.debit || 0;
          const creditNTD = line.credit || 0;
          const netNTD = debitNTD - creditNTD;
          const isDebit = netNTD >= 0;

          const idrVal = (line.originalDebitIDR || line.originalCreditIDR)
            ? Math.abs((line.originalDebitIDR || 0) - (line.originalCreditIDR || 0))
            : (() => {
                const rawRate = (j as any).exchangeRate || (j as any).fxRateUsed || 500;
                const effectiveRate = rawRate < 1 ? (1 / rawRate) : rawRate;
                return Math.abs(Math.round((Math.abs(netNTD) / 100) * effectiveRate));
              })();

          items.push({
            id: `${j.id}-${line.accountCode || (is1101 ? (liveAccounts.CASH_NTD?.code || '1101') : (liveAccounts.CASH_RUPIAH?.code || '1102'))}`,
            journalId: j.id,
            dateStr,
            dateObj: dObj,
            description: j.description || 'Transaksi Kas',
            refType: j.refType || 'Jurnal Umum',
            refId: j.refId || '-',
            accountCode: is1101 ? (liveAccounts.CASH_NTD?.code || '1101') : (liveAccounts.CASH_RUPIAH?.code || '1102'),
            accountName: is1101 ? 'Cash NTD' : 'Cash Rupiah',
            isDebit,
            amountCentsNTD: Math.abs(netNTD),
            amountIDR: is1102 ? idrVal : undefined,
            originalCurrency: is1102 ? 'IDR' : 'NTD',
            rawJournal: j
          });
        }
      });
    });

    return items;
  }, [journals]);

  // Filtered Transactions based on DateRange, Account filter, and Search Query
  const filteredTransactions = useMemo(() => {
    return allCashTransactions.filter((tx) => {
      // 1. Filter Account Code
      if (selectedAccountFilter !== 'ALL' && tx.accountCode !== selectedAccountFilter) {
        return false;
      }

      // 2. Filter Date Range
      if (startDate && tx.dateStr < startDate) return false;
      if (endDate && tx.dateStr > endDate) return false;

      // 3. Filter Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDesc = tx.description.toLowerCase().includes(q);
        const matchRef = tx.refId.toLowerCase().includes(q);
        const matchType = tx.refType.toLowerCase().includes(q);
        const matchAcc = tx.accountName.toLowerCase().includes(q);
        if (!matchDesc && !matchRef && !matchType && !matchAcc) return false;
      }

      return true;
    });
  }, [allCashTransactions, selectedAccountFilter, startDate, endDate, searchQuery]);

  // Month Stepper Handler
  const handleMonthChange = (delta: number) => {
    const nextMonth = new Date(selectedMonth);
    nextMonth.setMonth(nextMonth.getMonth() + delta);
    setSelectedMonth(nextMonth);

    // Apply month start & end to filter
    const year = nextMonth.getFullYear();
    const month = nextMonth.getMonth();
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];
    
    setStartDate(start);
    setEndDate(end);
    setDatePreset(`${nextMonth.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`);
  };

  // Quick Today Filter
  const handleSetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    setDatePreset('Hari Ini');
  };

  // Quick Reset Date Filter
  const handleDateRangeChange = (start: Date | string | null, end: Date | string | null, presetLabel?: string) => {
    if (start instanceof Date) {
      const yyyy = start.getFullYear();
      const mm = String(start.getMonth() + 1).padStart(2, '0');
      const dd = String(start.getDate()).padStart(2, '0');
      setStartDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setStartDate(start || '');
    }

    if (end instanceof Date) {
      const yyyy = end.getFullYear();
      const mm = String(end.getMonth() + 1).padStart(2, '0');
      const dd = String(end.getDate()).padStart(2, '0');
      setEndDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setEndDate(end || '');
    }

    if (presetLabel) setDatePreset(presetLabel);
  };

  // Latest Revaluation Status
  const latestRevaluasiLog = useMemo(() => {
    return revaluasiLogs.length > 0 ? revaluasiLogs[0] : null;
  }, [revaluasiLogs]);

  const handleSaveSplitCalc = async (currencyCode: '1101' | '1102') => {
    try {
      setLoading(true);
      const banksToUpdate = bankAccounts.filter(b => b.linkedCoaCode === currencyCode);
      const updatePromises = banksToUpdate.map(b => {
        const val = parseFloat(splitCalcValues[b.id] || '0');
        if (!isNaN(val)) {
          return setDoc(doc(db, 'bankAccounts', b.id), {
            splitBalance: val,
            lastSplitUpdate: new Date().toISOString()
          }, { merge: true });
        }
        return Promise.resolve();
      });
      await Promise.all(updatePromises);
      alert('Pecahan saldo berhasil disimpan.');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan pecahan saldo.');
    } finally {
      setLoading(false);
    }
  };

  // Bank Account Form Helpers
  const handleEditBank = (bank: BankAccount) => {
    setEditingBankId(bank.id);
    setBankName(bank.bankName);
    setAccountNumber(bank.accountNumber);
    setAccountHolder(bank.accountHolder || 'KangenBukuIndo');
    setBankCurrency(bank.currency);
    setLinkedCoaCode((bank.linkedCoaCode as '1101' | '1102') || (bank.currency === 'NTD' ? '1101' : '1102'));
  };

  const handleResetBankForm = () => {
    setEditingBankId(null);
    setBankName('');
    setAccountNumber('');
    setAccountHolder('KangenBukuIndo');
    setBankCurrency('NTD');
    setLinkedCoaCode('1101');
  };

  const handleDeleteBank = (bankId: string, name: string) => {
    setDeletingBankConfirm({ id: bankId, name });
  };

  // Handle Save / Update Bank Account (Supports Add and Edit/Rename)
  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim()) {
      alert('Tolong isi nama bank dan nomor rekening.');
      return;
    }
    try {
      const id = editingBankId || `bank-${Date.now()}`;
      const bankData: BankAccount = {
        id,
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim() || 'KangenBukuIndo',
        currency: bankCurrency,
        linkedCoaCode,
        isActive: true,
        updatedAt: Timestamp.now()
      };
      await setDoc(doc(db, 'bankAccounts', id), bankData, { merge: true });
      handleResetBankForm();
      alert(editingBankId ? 'Nama bank / rekening berhasil diperbarui!' : 'Rekening bank baru berhasil ditambahkan!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bankAccounts');
    }
  };

  // Handle Save Bank Reconciliation
  const handleSaveReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    const statementNum = parseFloat(recStatementBalance.replace(/,/g, ''));
    if (isNaN(statementNum)) {
      alert('Tolong masukkan saldo rekening koran yang valid.');
      return;
    }

    const currentBook = recAccountCode === '1101' 
      ? cashBalances.ntdTotal 
      : cashBalances.idrTotalRaw;

    const diff = statementNum - currentBook;
    const isMatch = Math.abs(diff) < 0.01;

    try {
      const id = `rec-${Date.now()}`;
      const bankObj = bankAccounts.find(b => b.id === recSelectedBankId);
      const recItem: BankReconciliation = {
        id,
        reconciliationDate: recDate,
        bankAccountId: recSelectedBankId || undefined,
        accountCode: recAccountCode,
        bankName: bankObj ? bankObj.bankName : (recAccountCode === '1101' ? 'Kas/Bank NTD' : 'Kas/Bank IDR'),
        currency: recAccountCode === '1101' ? 'NTD' : 'IDR',
        bankStatementBalance: statementNum,
        bookBalance: currentBook,
        difference: diff,
        status: isMatch ? 'Matched' : 'Discrepancy',
        notes: recNotes,
        performedBy: profile?.displayName || profile?.email || 'User',
        createdAt: Timestamp.now()
      };

      await setDoc(doc(db, 'bankReconciliations', id), recItem);
      setIsReconcileModalOpen(false);
      setRecStatementBalance('');
      setRecNotes('');
      alert(`Rekonsiliasi Bank Berhasil Disimpan! Status: ${isMatch ? 'SEIMBANG (MATCHED)' : 'SELISIH DETEKSI'}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bankReconciliations');
    }
  };

  // Handle Save Multi-Currency Transfer
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    const numFrom = parseFloat(amountFromInput.replace(/,/g, ''));
    const numTo = parseFloat(amountToInput.replace(/,/g, ''));

    if (isNaN(numFrom) || numFrom <= 0 || isNaN(numTo) || numTo <= 0) {
      alert('Mohon masukkan jumlah transfer yang valid untuk kedua mata uang.');
      return;
    }

    if (transferFromAccount === transferToAccount) {
      alert('Akun asal dan akun tujuan transfer harus berbeda.');
      return;
    }

    if (isPeriodClosed(transferDate, closedPeriods)) {
      alert(`Periode transaksi (${getYearMonth(transferDate)}) telah DITUTUP. Tidak dapat melakukan transfer pada periode yang sudah ditutup.`);
      return;
    }

    setSubmittingTransfer(true);

    try {
      const journalId = await getNextJournalId(transferDate);
      const fromName = transferFromAccount === '1101' ? 'Cash NTD' : 'Cash Rupiah';
      const toName = transferToAccount === '1101' ? 'Cash NTD' : 'Cash Rupiah';

      // Calculated exchange rate (IDR / NTD)
      const calculatedRate = transferFromAccount === '1101'
        ? (numTo / numFrom)
        : (numFrom / numTo);

      const defaultDesc = `Transfer Kas/Valas ${fromName} -> ${toName}`;
      const desc = transferNotes.trim() ? `${transferNotes.trim()} (Kurs: 1 NTD = ${calculatedRate.toFixed(2)} IDR)` : `${defaultDesc} (Kurs: 1 NTD = ${calculatedRate.toFixed(2)} IDR)`;

      const lines: JournalEntryLine[] = [];

      if (transferFromAccount === '1101' && transferToAccount === '1102') {
        // NTD -> IDR
        // Dr 1102 Cash Rupiah | Cr 1101 Cash NTD
        const ntdCents = Math.round(numFrom * 100);
        const idrWhole = Math.round(numTo);

        lines.push({
          account: 'Cash Rupiah',
          accountCode: '1102',
          debit: ntdCents,
          credit: 0,
          originalCurrency: 'IDR',
          originalDebitIDR: idrWhole,
          originalCreditIDR: 0
        });

        lines.push({
          account: 'Cash:NTD',
          accountCode: '1101',
          debit: 0,
          credit: ntdCents,
          originalCurrency: 'NTD'
        });
      } else {
        // IDR -> NTD
        // Dr 1101 Cash NTD | Cr 1102 Cash Rupiah
        const ntdCents = Math.round(numTo * 100);
        const idrWhole = Math.round(numFrom);

        lines.push({
          account: 'Cash:NTD',
          accountCode: '1101',
          debit: ntdCents,
          credit: 0,
          originalCurrency: 'NTD'
        });

        lines.push({
          account: 'Cash Rupiah',
          accountCode: '1102',
          debit: 0,
          credit: ntdCents,
          originalCurrency: 'IDR',
          originalDebitIDR: 0,
          originalCreditIDR: idrWhole
        });
      }

      const journalDoc: JournalEntry = {
        id: journalId,
        date: Timestamp.fromDate(new Date(transferDate)),
        description: desc,
        lines,
        refType: 'Transfer Valas',
        refId: `TRF-${Date.now()}`,
        createdAt: Timestamp.now(),
        fxRateUsed: calculatedRate
      };

      await setDoc(doc(db, 'journalEntries', journalId), journalDoc);

      setIsTransferModalOpen(false);
      setAmountFromInput('');
      setAmountToInput('');
      setTransferNotes('');
      alert('Transfer Kas/Valas Berhasil Diposting ke Jurnal!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'journalEntries');
    } finally {
      setSubmittingTransfer(false);
    }
  };

  // Handle Post Monthly Revaluation Journal
  const handlePostRevaluation = async () => {
    const rate = parseFloat(closingRateInput);
    if (isNaN(rate) || rate <= 0) {
      alert('Masukkan kurs penutupan yang valid (misal 545).');
      return;
    }

    setPostingRevaluation(true);
    try {
      // Current IDR Cash Balance
      const idrBal = cashBalances.idrTotalRaw; // e.g. Rp 20,000,000
      
      // Target NTD value per closing rate: IDR / Rate
      const newNtdVal = Math.round((idrBal / rate) * 100); // NTD cents
      const prevNtdVal = cashBalances.idrNtdBookCents;      // NTD cents in book
      const diffNtdCents = newNtdVal - prevNtdVal;          // Selisih NTD cents

      if (diffNtdCents === 0) {
        alert('Selisih revaluasi kurs adalah 0. Tidak ada penyesuaian yang perlu diposting.');
        setPostingRevaluation(false);
        return;
      }

      const journalId = await getNextJournalId(revDate);
      const period = revDate.substring(0, 7); // YYYY-MM
      
      await ensureAutoAccountExists({ code: '4210', name: 'Laba/Rugi Selisih Kurs', type: 'Revenue', subType: 'Pendapatan Lain-lain' });

      // 1. Create adjustment journal entry
      const lines: JournalEntryLine[] = [];
      if (diffNtdCents > 0) {
        // Gain (Laba Selisih Kurs): Dr. 1102 Cash Rupiah | Cr. 4210 Laba/Rugi Selisih Kurs
        lines.push({
          account: 'Cash Rupiah',
          accountCode: '1102',
          debit: diffNtdCents,
          credit: 0
        });
        lines.push({
          account: 'Laba/Rugi Selisih Kurs',
          accountCode: '4210',
          debit: 0,
          credit: diffNtdCents
        });
      } else {
        // Loss (Rugi Selisih Kurs): Dr. 4210 Laba/Rugi Selisih Kurs | Cr. 1102 Cash Rupiah
        const lossAbs = Math.abs(diffNtdCents);
        lines.push({
          account: 'Laba/Rugi Selisih Kurs',
          accountCode: '4210',
          debit: lossAbs,
          credit: 0
        });
        lines.push({
          account: 'Cash Rupiah',
          accountCode: '1102',
          debit: 0,
          credit: lossAbs
        });
      }

      const journalDoc: JournalEntry = {
        id: journalId,
        date: Timestamp.fromDate(new Date(revDate)),
        description: `Penyesuaian Revaluasi Kurs Penutupan Bulan (${period}) - Kurs ${rate} IDR/NTD`,
        lines,
        refType: 'Revaluasi Kurs',
        refId: period,
        createdAt: Timestamp.now()
      };

      await setDoc(doc(db, 'journalEntries', journalId), journalDoc);

      // 2. If Auto-Reversal on 1st of next month is enabled
      let reversalId: string | undefined = undefined;
      if (autoReversal) {
        reversalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
        const currentDate = new Date(revDate);
        const nextMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        const reversalDateStr = nextMonthDate.toISOString().split('T')[0];

        // Reverse lines
        const reversalLines: JournalEntryLine[] = lines.map(l => ({
          ...l,
          debit: l.credit,
          credit: l.debit
        }));

        const reversalDoc: JournalEntry = {
          id: reversalId,
          date: Timestamp.fromDate(nextMonthDate),
          description: `Auto-Reversal Revaluasi Kurs Penutupan Bulan (${period}) per ${reversalDateStr}`,
          lines: reversalLines,
          refType: 'Auto-Reversal Kurs',
          refId: period,
          createdAt: Timestamp.now()
        };

        await setDoc(doc(db, 'journalEntries', reversalId), reversalDoc);
      }

      // 3. Save Log in revaluasiKursLogs
      const revLogId = `log-rev-${Date.now()}`;
      const revLog: RevaluasiKursLog = {
        id: revLogId,
        period,
        date: revDate,
        closingRate: rate,
        idrBalance: idrBal,
        prevNtdBookBalance: prevNtdVal,
        newNtdAdjustedBalance: newNtdVal,
        selisihNtdCents: diffNtdCents,
        journalId,
        reversalJournalId: reversalId,
        hasAutoReversal: autoReversal,
        postedAt: Timestamp.now(),
        postedBy: profile?.displayName || profile?.email || 'User'
      };

      await setDoc(doc(db, 'revaluasiKursLogs', revLogId), revLog);

      setIsRevaluasiModalOpen(false);
      setPostingRevaluation(false);
      alert(`Jurnal Revaluasi Kurs (${diffNtdCents > 0 ? 'Untung' : 'Rugi'} NT$ ${(Math.abs(diffNtdCents) / 100).toFixed(2)}) Berhasil Diposting!${autoReversal ? ' Auto-reversal untuk tanggal 1 bulan depan juga telah disiapkan secara otomatis.' : ''}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'journalEntries');
      setPostingRevaluation(false);
    }
  };

  // Export Report to CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert('Tidak ada data transaksi kas untuk diunduh.');
      return;
    }

    const headers = ['Tanggal', 'Akun Kas', 'Tipe Transaksi', 'Deskripsi', 'Nomor Referensi', 'Debet (NTD)', 'Kredit (NTD)', 'Nilai IDR'];
    const rows = filteredTransactions.map((tx) => [
      tx.dateStr,
      tx.accountName,
      tx.isDebit ? 'Masuk (Debet)' : 'Keluar (Kredit)',
      `"${tx.description.replace(/"/g, '""')}"`,
      tx.refId,
      tx.isDebit ? (tx.amountCentsNTD / 100).toFixed(2) : '0.00',
      !tx.isDebit ? (tx.amountCentsNTD / 100).toFixed(2) : '0.00',
      tx.amountIDR ? tx.amountIDR.toLocaleString('en-US') : '-'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Laporan_Bank_Kas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* 1. HEADER CARD WITH ICON & ACTIONS */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/10 shrink-0">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
              Bank & Kas
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Pencocokan saldo bank, revaluasi kurs, & audit riwayat transaksi kas multi-currency.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsBankManageModalOpen(true)}
            className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Kelola Bank</span>
          </button>

          <button
            onClick={() => setIsReconcileModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <Scale className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Rekonsiliasi Bank</span>
          </button>

          {canAccessRevaluasi && (
            <button
              onClick={() => setIsRevaluasiModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Revaluasi Kurs IDR</span>
            </button>
          )}

          <button
            onClick={() => {
              setIsTransferModalOpen(true);
              setTransferDate(new Date().toISOString().split('T')[0]);
            }}
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Transfer Valas / Kas</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm cursor-pointer ml-auto md:ml-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Unduh Laporan</span>
          </button>
        </div>
      </div>

      {/* 2. BANNER REVALUASI KURS STATUS / ALERT (MATCHES MOCKUP DESIGN) */}
      {latestRevaluasiLog ? (
        <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-2xl p-4 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-xs leading-relaxed shadow-xs">
          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <span className="font-bold block text-sm mb-0.5 text-amber-950 dark:text-amber-100">
              ✓ Revaluasi Kurs {latestRevaluasiLog.period} Sudah Diposting Otomatis
            </span>
            <span>
              Saldo Rupiah {formatIDR(latestRevaluasiLog.idrBalance)} setara {formatNTD(latestRevaluasiLog.newNtdAdjustedBalance)} per kurs penutupan ({latestRevaluasiLog.closingRate}), buku sebelumnya mencatat {formatNTD(latestRevaluasiLog.prevNtdBookBalance)}. Selisih {latestRevaluasiLog.selisihNtdCents >= 0 ? '+' : ''}{formatNTD(latestRevaluasiLog.selisihNtdCents)} ({latestRevaluasiLog.selisihNtdCents >= 0 ? 'Untung' : 'Rugi'}) sudah dijurnal ke akun 4210 pada {latestRevaluasiLog.date}.
              {latestRevaluasiLog.hasAutoReversal && ' Auto-reversal telah dijadwalkan pada awal bulan berikutnya.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50 rounded-2xl p-4 text-indigo-900 dark:text-indigo-200 flex items-center justify-between gap-3 text-xs leading-relaxed shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold block text-xs text-indigo-950 dark:text-indigo-100">
                Fitur Revaluasi Kurs Rupiah Otomatis Aktif
              </span>
              <span className="text-indigo-800 dark:text-indigo-300">
                Saldo Rupiah buku saat ini adalah {formatIDR(cashBalances.idrTotalRaw)} (setara {formatNTD(cashBalances.idrNtdCurrentCents)} per kurs aktif). Anda dapat menyesuaikan nilai buku berdasarkan kurs penutupan akhir bulan.
              </span>
            </div>
          </div>
          {canAccessRevaluasi && (
            <button
              onClick={() => setIsRevaluasiModalOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs shrink-0 transition cursor-pointer"
            >
              Hitung Revaluasi
            </button>
          )}
        </div>
      )}

      {/* 3. TOP DATE FILTER BAR (MATCHING SALES ORDERS / PURCHASE ORDERS FILTER LOCATION) */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-3 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          {/* DateRangePicker component */}
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            initialPresetLabel={datePreset}
            onChange={handleDateRangeChange}
          />
        </div>
      </div>

      {/* 4. TWO MAIN SUMMARY CARDS (CASH NTD & CASH RUPIAH) - EXACT IMAGE MOCKUP LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CARD 1: CASH NTD */}
        <div 
          onClick={() => setSelectedAccountFilter(selectedAccountFilter === '1101' ? 'ALL' : '1101')}
          className={`bg-white dark:bg-neutral-900 border-2 rounded-3xl p-6 shadow-sm cursor-pointer transition-all duration-200 relative overflow-hidden ${
            selectedAccountFilter === '1101'
              ? 'border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20'
              : 'border-neutral-200/80 dark:border-neutral-800 hover:border-emerald-300 dark:hover:border-emerald-800'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowSplitCalc(showSplitCalc === '1101' ? null : '1101'); }}
                className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-emerald-600 dark:text-emerald-400 transition"
                title="Pecah Saldo / Rekonsiliasi Kasar"
              >
                <TrendingUp className="h-4 w-4" />
              </button>
              <div className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                Kode 1101
              </div>
            </div>
          </div>

          <div className="mt-4">
            <span className="text-xs font-bold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase block">
              CASH NTD
            </span>
            <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight mt-0.5">
              {formatNTD(cashBalances.ntdTotalCents)}
            </div>
          </div>

          {!showSplitCalc || showSplitCalc !== '1101' ? (
             <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-col gap-2">
               {bankAccounts.filter(b => b.linkedCoaCode === '1101').map((bank) => (
                 <div key={bank.id} className="flex items-center justify-between">
                   <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
                     <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                     {bank.bankName}
                   </span>
                   {bank.splitBalance !== undefined && (
                     <span className="text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-500">
                       {formatNTD(Math.round(bank.splitBalance * 100))}
                     </span>
                   )}
                 </div>
               ))}
             </div>
          ) : (
             <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-2">Pecah Saldo / Rekonsiliasi Fisik</div>
                {bankAccounts.filter(b => b.linkedCoaCode === '1101').map((bank) => (
                  <div key={bank.id} className="space-y-1">
                    <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400">{bank.bankName}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-mono text-neutral-400">NT$</span>
                      <input 
                        type="number"
                        step="any"
                        value={splitCalcValues[bank.id] || ''}
                        onChange={(e) => setSplitCalcValues({...splitCalcValues, [bank.id]: e.target.value})}
                        placeholder="Masukkan saldo aktual..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                ))}
                
                {(() => {
                   const banks = bankAccounts.filter(b => b.linkedCoaCode === '1101');
                   let enteredTotal = 0;
                   banks.forEach(b => {
                     const val = parseFloat(splitCalcValues[b.id] || '0');
                     if (!isNaN(val)) enteredTotal += val;
                   });
                   const bookTotalCents = cashBalances.ntdTotalCents;
                   const enteredCents = Math.round(enteredTotal * 100);
                   const diffCents = enteredCents - bookTotalCents;
                   const isMatch = Math.abs(diffCents) < 1;
                   return (
                     <div className="space-y-2">
                       <div className={`mt-3 p-3 rounded-xl border ${isMatch ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400'}`}>
                          <div className="flex justify-between text-[11px] font-bold">
                             <span>Total Dimasukkan:</span>
                             <span className="font-mono">{formatNTD(enteredCents)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] mt-1.5 pt-1.5 border-t border-black/5 dark:border-white/5">
                             <span>Selisih dgn Buku:</span>
                             <span className="font-mono font-bold">{diffCents > 0 ? '+' : ''}{formatNTD(diffCents)}</span>
                          </div>
                       </div>
                       <button
                         type="button"
                         disabled={loading}
                         onClick={(e) => { e.stopPropagation(); handleSaveSplitCalc('1101'); }}
                         className="w-full py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs rounded-xl transition disabled:opacity-50"
                       >
                         {loading ? 'Menyimpan...' : 'Simpan Data Pecahan'}
                       </button>
                     </div>
                   );
                })()}
             </div>
          )}
        </div>

        {/* CARD 2: CASH RUPIAH */}
        <div 
          onClick={() => setSelectedAccountFilter(selectedAccountFilter === '1102' ? 'ALL' : '1102')}
          className={`bg-white dark:bg-neutral-900 border-2 rounded-3xl p-6 shadow-sm cursor-pointer transition-all duration-200 relative overflow-hidden ${
            selectedAccountFilter === '1102'
              ? 'border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20'
              : 'border-neutral-200/80 dark:border-neutral-800 hover:border-indigo-300 dark:hover:border-indigo-800'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowSplitCalc(showSplitCalc === '1102' ? null : '1102'); }}
                className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-indigo-600 dark:text-indigo-400 transition"
                title="Pecah Saldo / Rekonsiliasi Kasar"
              >
                <TrendingUp className="h-4 w-4" />
              </button>
              <div className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                Kode 1102
              </div>
            </div>
          </div>

          <div className="mt-4">
            <span className="text-xs font-bold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase block">
              CASH RUPIAH
            </span>
            <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
                {formatIDR(cashBalances.idrTotalRaw)}
              </span>
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                ({formatNTD(cashBalances.idrNtdCurrentCents)})
              </span>
            </div>
            {cashBalances.idrTotalRaw > 0 && (
              <div className="mt-1.5 space-y-0.5">
                <div className="text-[11px] font-mono font-medium text-indigo-600 dark:text-indigo-400">
                  1 NTD &asymp; Rp {currentExchangeRate ? currentExchangeRate.toFixed(2) : '559.13'}
                </div>
                <div className="text-[10.5px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 flex-wrap">
                  <span>Nilai Buku Neraca: <strong className="font-mono text-neutral-700 dark:text-neutral-200">{formatNTD(cashBalances.idrNtdBookCents)}</strong></span>
                  <span>·</span>
                  <span>Est. Kurs Aktif: <strong className="font-mono text-indigo-600 dark:text-indigo-400">{formatNTD(cashBalances.idrNtdCurrentCents)}</strong></span>
                </div>
              </div>
            )}
          </div>

          {!showSplitCalc || showSplitCalc !== '1102' ? (
             <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-col gap-2">
               {bankAccounts.filter(b => b.linkedCoaCode === '1102').map((bank) => (
                 <div key={bank.id} className="flex items-center justify-between">
                   <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
                     <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                     {bank.bankName}
                   </span>
                   {bank.splitBalance !== undefined && (
                     <span className="text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-500">
                       {formatIDR(bank.splitBalance)}
                     </span>
                   )}
                 </div>
               ))}
             </div>
          ) : (
             <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-2">Pecah Saldo / Rekonsiliasi Fisik</div>
                {bankAccounts.filter(b => b.linkedCoaCode === '1102').map((bank) => (
                  <div key={bank.id} className="space-y-1">
                    <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400">{bank.bankName}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-mono text-neutral-400">Rp</span>
                      <input 
                        type="number"
                        step="any"
                        value={splitCalcValues[bank.id] || ''}
                        onChange={(e) => setSplitCalcValues({...splitCalcValues, [bank.id]: e.target.value})}
                        placeholder="Masukkan saldo aktual..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                ))}
                
                {(() => {
                   const banks = bankAccounts.filter(b => b.linkedCoaCode === '1102');
                   let enteredTotal = 0;
                   banks.forEach(b => {
                     const val = parseFloat(splitCalcValues[b.id] || '0');
                     if (!isNaN(val)) enteredTotal += val;
                   });
                   const bookTotal = cashBalances.idrTotalRaw;
                   const diff = enteredTotal - bookTotal;
                   const isMatch = Math.abs(diff) < 1;
                   return (
                     <div className="space-y-2">
                       <div className={`mt-3 p-3 rounded-xl border ${isMatch ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400'}`}>
                          <div className="flex justify-between text-[11px] font-bold">
                             <span>Total Dimasukkan:</span>
                             <span className="font-mono">{formatIDR(enteredTotal)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] mt-1.5 pt-1.5 border-t border-black/5 dark:border-white/5">
                             <span>Selisih dgn Buku:</span>
                             <span className="font-mono font-bold">{diff > 0 ? '+' : ''}{formatIDR(diff)}</span>
                          </div>
                       </div>
                       <button
                         type="button"
                         disabled={loading}
                         onClick={(e) => { e.stopPropagation(); handleSaveSplitCalc('1102'); }}
                         className="w-full py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs rounded-xl transition disabled:opacity-50"
                       >
                         {loading ? 'Menyimpan...' : 'Simpan Data Pecahan'}
                       </button>
                     </div>
                   );
                })()}
             </div>
          )}
        </div>
      </div>

      {/* 5. TRANSACTION HISTORY SECTION ("RIWAYAT — CASH NTD / RUPIAH / ALL") */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <span>Riwayat — {selectedAccountFilter === '1101' ? 'Cash NTD' : selectedAccountFilter === '1102' ? 'Cash Rupiah' : 'Semua Kas'}</span>
              <span className="text-xs font-normal text-neutral-400">({filteredTransactions.length} Transaksi)</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Semua transaksi yang tercatat di akun kas/bank secara live dari Jurnal Double Entry.
            </p>
          </div>

          {/* Account selector tabs */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSelectedAccountFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${selectedAccountFilter === 'ALL' ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'}`}
            >
              Semua
            </button>
            <button
              onClick={() => setSelectedAccountFilter('1101')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${selectedAccountFilter === '1101' ? 'bg-white dark:bg-neutral-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'}`}
            >
              Cash NTD (1101)
            </button>
            <button
              onClick={() => setSelectedAccountFilter('1102')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${selectedAccountFilter === '1102' ? 'bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'}`}
            >
              Cash IDR (1102)
            </button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="relative">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan deskripsi, nomor order, atau kategori..."
            className="w-full pl-11 pr-4 py-3 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/80 rounded-2xl text-xs font-medium text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 rounded-full"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* TRANSACTION CARDS LIST */}
        {loading ? (
          <div className="py-12 text-center text-xs text-neutral-400 flex flex-col items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
            <span>Memuat data transaksi kas...</span>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
            Tidak ada transaksi kas yang sesuai dengan filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                className={`group bg-white dark:bg-neutral-850/60 border border-neutral-200/90 dark:border-neutral-800/80 rounded-2xl p-4 transition-all duration-200 hover:shadow-md flex items-center justify-between gap-4 relative overflow-hidden ${
                  tx.isDebit ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-rose-500'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.isDebit
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {tx.isDebit ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
                        {tx.dateStr}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-700"></span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                        {tx.accountName}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                      {tx.description}
                    </h3>

                    <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                      {tx.refType} · <span className="font-mono text-neutral-700 dark:text-neutral-300">{tx.refId}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-sm sm:text-base font-black font-mono tracking-tight ${
                        tx.isDebit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {tx.isDebit ? '↑ ' : '↓ '}
                      {tx.amountIDR ? `Rp ${tx.amountIDR.toLocaleString('en-US')}` : formatNTD(tx.amountCentsNTD)}
                    </div>
                    {tx.amountIDR && (
                      <div className="text-[10px] font-semibold text-neutral-400">
                        {formatNTD(tx.amountCentsNTD)}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedJournalForDetail(tx.rawJournal)}
                    className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                    title="Lihat Detail Jurnal Double Entry"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL 1: JOURNAL ENTRY DETAIL */}
      {selectedJournalForDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                    Detail Jurnal #{selectedJournalForDetail.id}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Ref: {selectedJournalForDetail.refType} · {selectedJournalForDetail.refId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedJournalForDetail(null)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-neutral-50 dark:bg-neutral-800/50 p-3.5 rounded-2xl leading-relaxed">
                <span className="text-neutral-400 font-semibold block text-[10px] uppercase">Deskripsi Jurnal</span>
                <span className="font-bold text-neutral-800 dark:text-neutral-200 text-sm">
                  {selectedJournalForDetail.description}
                </span>
              </div>

              {/* LINES TABLE */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-neutral-100 dark:bg-neutral-800/80 text-neutral-500 font-bold border-b border-neutral-200 dark:border-neutral-800">
                      <th className="p-3">Akun</th>
                      <th className="p-3 text-right">Debet (NTD)</th>
                      <th className="p-3 text-right">Kredit (NTD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {selectedJournalForDetail.lines?.map((line, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                        <td className="p-3 font-medium text-neutral-800 dark:text-neutral-200">
                          <span className="font-mono text-neutral-400 text-[10px] mr-1.5">{line.accountCode || '----'}</span>
                          {line.account}
                          {line.originalDebitIDR || line.originalCreditIDR ? (
                            <span className="block text-[10px] text-neutral-400 font-mono mt-0.5">
                              IDR: Rp {((line.originalDebitIDR || 0) || (line.originalCreditIDR || 0)).toLocaleString('en-US')}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {line.debit > 0 ? formatNTD(line.debit) : '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          {line.credit > 0 ? formatNTD(line.credit) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedJournalForDetail(null)}
                className="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: REKONSILIASI BANK */}
      {isReconcileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                    Rekonsiliasi Bank
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Pencocokan saldo rekening koran vs saldo sistem.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReconcileModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReconciliation} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Pilih Akun Kas / Bank
                </label>
                <select
                  value={recAccountCode}
                  onChange={(e) => setRecAccountCode(e.target.value as '1101' | '1102')}
                  className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-bold"
                >
                  <option value="1101">1101 · Cash: NTD</option>
                  <option value="1102">1102 · Cash: Rupiah</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Tanggal Rekening Koran
                </label>
                <input
                  type="date"
                  value={recDate}
                  onChange={(e) => setRecDate(e.target.value)}
                  className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Saldo Rekening Koran Aktual ({recAccountCode === '1101' ? 'NT$' : 'Rp'})
                </label>
                <input
                  type="text"
                  value={recStatementBalance}
                  onChange={(e) => setRecStatementBalance(e.target.value)}
                  placeholder={recAccountCode === '1101' ? 'e.g. 25000' : 'e.g. 20000000'}
                  className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-mono font-bold"
                  required
                />
              </div>

              {/* Comparison Preview */}
              <div className="bg-neutral-50 dark:bg-neutral-800/60 p-4 rounded-2xl space-y-2 border border-neutral-200 dark:border-neutral-700/80">
                <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                  <span>Saldo Sistem (Buku) Saat Ini:</span>
                  <span className="font-bold font-mono text-neutral-900 dark:text-white">
                    {recAccountCode === '1101' ? formatNTD(cashBalances.ntdTotalCents) : formatIDR(cashBalances.idrTotalRaw)}
                  </span>
                </div>
                {recStatementBalance && (
                  <div className="flex justify-between text-neutral-600 dark:text-neutral-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                    <span>Selisih (Actual - Book):</span>
                    <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {recAccountCode === '1101'
                        ? formatNTD(Math.round((parseFloat(recStatementBalance.replace(/,/g, '')) || 0) * 100) - cashBalances.ntdTotalCents)
                        : formatIDR((parseFloat(recStatementBalance.replace(/,/g, '')) || 0) - cashBalances.idrTotalRaw)
                      }
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Catatan / Keterangan
                </label>
                <textarea
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  placeholder="e.g. Saldo sesuai dengan mutasi bank per tanggal akhir bulan."
                  className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl h-20"
                ></textarea>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReconcileModalOpen(false)}
                  className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer transition shadow-xs"
                >
                  Simpan Hasil Rekonsiliasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REVALUASI KURS RUPAIH */}
      {isRevaluasiModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                    Revaluasi Kurs Penutupan IDR
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Penyesuaian nilai buku Cash Rupiah (1102) per akhir periode.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRevaluasiModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Tanggal Efektif
                  </label>
                  <input
                    type="date"
                    value={revDate}
                    onChange={(e) => setRevDate(e.target.value)}
                    className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Kurs Penutupan (IDR per NTD)
                  </label>
                  <input
                    type="number"
                    value={closingRateInput}
                    onChange={(e) => setClosingRateInput(e.target.value)}
                    placeholder="e.g. 545"
                    className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-bold font-mono"
                  />
                </div>
              </div>

              {/* CALCULATION SIMULATION BOX */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/40 p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 space-y-2">
                <h4 className="font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  Simulasi Penyesuaian Revaluasi:
                </h4>

                <div className="space-y-1.5 pt-1 text-neutral-700 dark:text-neutral-300">
                  <div className="flex justify-between">
                    <span>Saldo Cash Rupiah (IDR):</span>
                    <span className="font-bold font-mono">{formatIDR(cashBalances.idrTotalRaw)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saldo NTD Buku Saat Ini:</span>
                    <span className="font-bold font-mono">{formatNTD(cashBalances.idrNtdBookCents)}</span>
                  </div>
                  <div className="flex justify-between border-t border-indigo-200/60 dark:border-indigo-900/60 pt-1.5">
                    <span>Target NTD (pada Kurs {closingRateInput || 0}):</span>
                    <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {formatNTD(Math.round((cashBalances.idrTotalRaw / (parseFloat(closingRateInput) || 1)) * 100))}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-1 text-neutral-900 dark:text-white">
                    <span>Selisih Revaluasi (Untung/Rugi):</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {formatNTD(Math.round((cashBalances.idrTotalRaw / (parseFloat(closingRateInput) || 1)) * 100) - cashBalances.idrNtdBookCents)}
                    </span>
                  </div>
                </div>
              </div>

              {/* AUTO REVERSAL TOGGLE */}
              <div className="flex items-center gap-2.5 p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-2xl border border-neutral-200 dark:border-neutral-700/80">
                <input
                  type="checkbox"
                  id="autoRev"
                  checked={autoReversal}
                  onChange={(e) => setAutoReversal(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded border-neutral-300 cursor-pointer"
                />
                <label htmlFor="autoRev" className="font-bold text-neutral-800 dark:text-neutral-200 cursor-pointer select-none">
                  Auto-Reversal pada Tanggal 1 Bulan Berikutnya (Disarankan)
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRevaluasiModalOpen(false)}
                  className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={postingRevaluation}
                  onClick={handlePostRevaluation}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer transition shadow-xs flex items-center gap-1.5"
                >
                  {postingRevaluation ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Memposting...</span>
                    </>
                  ) : (
                    <span>Posting Jurnal Revaluasi</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: KELOLA BANK */}
      {isBankManageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                    {editingBankId ? 'Edit / Rename Rekening Bank' : 'Kelola Daftar Rekening / Bank'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {editingBankId ? 'Ubah nama bank, nomor rekening, atau mata uang.' : 'Tambah atau atur akun bank operasional.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  handleResetBankForm();
                  setIsBankManageModalOpen(false);
                }}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBankAccount} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Nama Bank / Rekening
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. 第一銀行 (First Bank) atau Bank Mandiri"
                  className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Nomor Rekening
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. 123-456-7890"
                    className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-mono font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Atas Nama
                  </label>
                  <input
                    type="text"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="e.g. KangenBukuIndo"
                    className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Mata Uang
                  </label>
                  <select
                    value={bankCurrency}
                    onChange={(e) => {
                      const cur = e.target.value as 'NTD' | 'IDR';
                      setBankCurrency(cur);
                      setLinkedCoaCode(cur === 'NTD' ? '1101' : '1102');
                    }}
                    className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-bold"
                  >
                    <option value="NTD">NTD (Taiwan)</option>
                    <option value="IDR">IDR (Rupiah)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Akun CoA Terkait
                  </label>
                  <select
                    value={linkedCoaCode}
                    onChange={(e) => setLinkedCoaCode(e.target.value as '1101' | '1102')}
                    className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl font-bold"
                  >
                    <option value="1101">1101 · Cash NTD</option>
                    <option value="1102">1102 · Cash Rupiah</option>
                  </select>
                </div>
              </div>

              {/* Existing Banks List */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
                <span className="font-bold text-neutral-500 text-[10px] uppercase block">Daftar Rekening Terdaftar:</span>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {bankAccounts.map((b) => (
                    <div 
                      key={b.id} 
                      className={`p-2.5 rounded-xl flex items-center justify-between border transition ${
                        editingBankId === b.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                          : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-100 dark:border-neutral-800'
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <span className="font-bold text-neutral-900 dark:text-white block truncate">{b.bankName}</span>
                        <span className="text-[10px] text-neutral-400 font-mono block">{b.accountNumber} ({b.currency})</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                          {b.linkedCoaCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleEditBank(b)}
                          className="p-1.5 rounded-lg bg-neutral-200/80 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 cursor-pointer transition"
                          title="Rename / Edit Rekening Bank"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBank(b.id, b.bankName)}
                          className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-950/50 dark:hover:bg-red-900/80 text-red-600 dark:text-red-400 cursor-pointer transition"
                          title="Hapus Rekening Bank"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                {editingBankId && (
                  <button
                    type="button"
                    onClick={handleResetBankForm}
                    className="px-3.5 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold rounded-xl cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                  >
                    Batal Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    handleResetBankForm();
                    setIsBankManageModalOpen(false);
                  }}
                  className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold rounded-xl cursor-pointer"
                >
                  Selesai
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-bold rounded-xl cursor-pointer transition shadow-xs"
                >
                  {editingBankId ? 'Simpan Perubahan' : 'Tambah Rekening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Bank Account Deletion */}
      {deletingBankConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="p-3 bg-red-100 dark:bg-red-950/60 rounded-xl">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">Hapus Rekening?</h3>
                <p className="text-xs text-neutral-500">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              Apakah Anda yakin ingin menghapus rekening <strong className="text-neutral-900 dark:text-white">{deletingBankConfirm.name}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingBankConfirm(null)}
                className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { id } = deletingBankConfirm;
                  setDeletingBankConfirm(null);
                  try {
                    await deleteDoc(doc(db, 'bankAccounts', id));
                    if (editingBankId === id) handleResetBankForm();
                  } catch (err) {
                    handleFirestoreError(err, OperationType.DELETE, 'bankAccounts');
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: TRANSFER KAS / VALAS MULTI-CURRENCY */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-neutral-900 dark:text-white">
                    Transfer Kas & Penukaran Valas
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Catat pemindahan dana atau penukaran mata uang antara NTD & IDR
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Closed Period Warning if applicable */}
            {isPeriodClosed(transferDate, closedPeriods) && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>Periode ({getYearMonth(transferDate)}) telah DITUTUP. Transaksi tidak dapat ditambahkan pada tanggal ini.</span>
              </div>
            )}

            <form onSubmit={handleSaveTransfer} className="space-y-4">
              {/* Tanggal Transaksi */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Tanggal Transaksi
                </label>
                <input
                  type="date"
                  required
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Grid 2 Column: Asal -> Tujuan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Asal */}
                <div className="bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-3.5 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                    1. Dari Akun Kas (Dikirim)
                  </span>
                  <select
                    value={transferFromAccount}
                    onChange={(e) => {
                      const val = e.target.value as '1101' | '1102';
                      setTransferFromAccount(val);
                      if (val === transferToAccount) {
                        setTransferToAccount(val === '1101' ? '1102' : '1101');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs font-bold"
                  >
                    <option value="1101">1101 · Cash NTD (NT$)</option>
                    <option value="1102">1102 · Cash Rupiah (Rp)</option>
                  </select>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      Jumlah Dikirim ({transferFromAccount === '1101' ? 'NT$' : 'Rp'})
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder={transferFromAccount === '1101' ? 'e.g. 10000' : 'e.g. 5000000'}
                      value={amountFromInput}
                      onChange={(e) => setAmountFromInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Tujuan */}
                <div className="bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-3.5 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                    2. Ke Akun Kas (Diterima)
                  </span>
                  <select
                    value={transferToAccount}
                    onChange={(e) => {
                      const val = e.target.value as '1101' | '1102';
                      setTransferToAccount(val);
                      if (val === transferFromAccount) {
                        setTransferFromAccount(val === '1101' ? '1102' : '1101');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs font-bold"
                  >
                    <option value="1102">1102 · Cash Rupiah (Rp)</option>
                    <option value="1101">1101 · Cash NTD (NT$)</option>
                  </select>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      Jumlah Diterima ({transferToAccount === '1101' ? 'NT$' : 'Rp'})
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder={transferToAccount === '1101' ? 'e.g. 10000' : 'e.g. 5000000'}
                      value={amountToInput}
                      onChange={(e) => setAmountToInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Helper Button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const nFrom = parseFloat(amountFromInput.replace(/,/g, ''));
                    if (isNaN(nFrom) || nFrom <= 0) return;
                    if (transferFromAccount === '1101' && transferToAccount === '1102') {
                      // NTD -> IDR
                      setAmountToInput(Math.round(nFrom * currentExchangeRate).toString());
                    } else if (transferFromAccount === '1102' && transferToAccount === '1101') {
                      // IDR -> NTD
                      setAmountToInput((Math.round((nFrom / currentExchangeRate) * 100) / 100).toString());
                    }
                  }}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Hitung estimasi per Kurs Indikatif (1 NTD = {currentExchangeRate.toFixed(2)} IDR)</span>
                </button>
              </div>

              {/* Realtime Exchange Rate & Accounting Summary Card */}
              {(() => {
                const nFrom = parseFloat(amountFromInput.replace(/,/g, '')) || 0;
                const nTo = parseFloat(amountToInput.replace(/,/g, '')) || 0;
                if (nFrom <= 0 || nTo <= 0) return null;

                const calcRate = transferFromAccount === '1101'
                  ? (nTo / nFrom)
                  : (nFrom / nTo);

                const ntdEquivalent = transferFromAccount === '1101' ? nFrom : nTo;

                return (
                  <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 rounded-2xl p-3.5 text-xs text-blue-950 dark:text-blue-100 space-y-1.5">
                    <div className="flex items-center justify-between font-bold">
                      <span>Kurs Efektif Transaksi Ini:</span>
                      <span className="font-mono text-sm text-blue-700 dark:text-blue-300">
                        1 NTD = {calcRate.toLocaleString('id-ID', { maximumFractionDigits: 2 })} IDR
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300 text-[11px]">
                      <span>Nilai Buku Base Currency (Jurnal NTD):</span>
                      <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                        NT$ {ntdEquivalent.toLocaleString('en-US')}
                      </span>
                    </div>
                    <p className="text-[10px] text-blue-800/80 dark:text-blue-300/80 italic pt-1 border-t border-blue-200/60 dark:border-blue-900/40">
                      ✓ Pencatatan Double Entry: Debit & Kredit NTD seimbang (NT$ {ntdEquivalent.toLocaleString('en-US')}), nilai saldo kas masing-masing mata uang terupdate otomatis tanpa selisih phantom.
                    </p>
                  </div>
                );
              })()}

              {/* Catatan */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Catatan / Keterangan Transfer
                </label>
                <input
                  type="text"
                  placeholder="e.g. Penukaran NTD ke IDR via Remittance Bank Mandiri"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingTransfer || isPeriodClosed(transferDate, closedPeriods)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span>{submittingTransfer ? 'Memproses...' : 'Posting Transfer & Jurnal'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default BankKasTab;
