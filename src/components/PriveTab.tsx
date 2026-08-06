import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { FALLBACK_IDR_PER_NTD } from '../lib/exchangeRateConstants';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  runTransaction,
  Timestamp 
} from 'firebase/firestore';
import { Prive, SetoranModal, CoaAccount, JournalEntry } from '../types';
import { formatNTD, convertIdrToNtdCents, calculateNtdCentsFromIdr, formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { isPeriodClosed, formatPeriodName, fetchCurrentExchangeRate } from '../lib/period-closing-utils';

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
}

function getYearMonth(val: any): string {
  const date = parseToDate(val);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
import { ensureAutoAccountExists, AUTO_ACCOUNTS, findAccountByRole, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { useAuth } from '../lib/auth-context';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Edit, 
  Trash2, 
  X, 
  Wallet, 
  DollarSign, 
  Calendar, 
  Info,
  Scale,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const PriveTab: React.FC = () => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';

  // State management
  const [activeSubSection, setActiveSubSection] = useState<'prive' | 'setoran'>('prive');
  const [prives, setPrives] = useState<Prive[]>([]);
  const [setorans, setSetorans] = useState<SetoranModal[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const priveAccount = useMemo(() => findAccountByRole(coaAccounts, 'prive'), [coaAccounts]);
  const setoranAccount = useMemo(() => findAccountByRole(coaAccounts, 'setoran_modal'), [coaAccounts]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'add_prive' | 'edit_prive' | 'add_setoran' | 'edit_setoran'>('add_prive');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<{ record: Prive | SetoranModal; type: 'prive' | 'setoran' } | null>(null);

  // Form Fields
  const [liveAccounts, setLiveAccounts] = useState<Record<string, AutoAccount>>(AUTO_ACCOUNTS);
  
  useEffect(() => {
    getLiveAutoAccounts().then(setLiveAccounts).catch(console.error);
  }, []);
  
  const [formDate, setFormDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [formCashAccount, setFormCashAccount] = useState('1101');
  const [formFxRate, setFormFxRate] = useState(String(FALLBACK_IDR_PER_NTD));
  const [formDescription, setFormDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pageErrorMsg, setPageErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch live exchange rate on mount
  useEffect(() => {
    const getFx = async () => {
      try {
        const idrRate = await fetchCurrentExchangeRate(); // IDR per NTD (e.g. 500 or 505)
        if (idrRate && idrRate > 0) {
          setFormFxRate(String(Math.round(idrRate * 100) / 100));
        }
      } catch (e) {
        console.error("Failed to fetch FX rate in PriveTab", e);
      }
    };
    getFx();
  }, []);

  // Ensure equity accounts exist on mount and load collections
  useEffect(() => {
    // 1. Ensure auto accounts 3101 and 3103 exist in CoA
    const ensureAccounts = async () => {
      await ensureAutoAccountExists(AUTO_ACCOUNTS.PRIVE);
      await ensureAutoAccountExists(AUTO_ACCOUNTS.SETORAN_MODAL);
    };
    ensureAccounts();

    // 2. Load COA Accounts
    const unsubCoA = onSnapshot(collection(db, 'coa'), (snap) => {
      const list: CoaAccount[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as CoaAccount));
      setCoaAccounts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'coa');
    });

    // 3. Load Closed Periods
    const unsubClosings = onSnapshot(collection(db, 'periodClosings'), (snap) => {
      const closedList: string[] = [];
      snap.forEach(d => {
        if (d.data().status === 'Ditutup') {
          closedList.push(d.id);
        }
      });
      setClosedPeriods(closedList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'periodClosings');
    });

    // 4. Load Prive list
    const unsubPrive = onSnapshot(collection(db, 'prive'), (snap) => {
      const list: Prive[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Prive));
      setPrives(list.sort((a, b) => {
        const dateA = parseToDate(a.date).getTime();
        const dateB = parseToDate(b.date).getTime();
        return dateB - dateA;
      }));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'prive');
    });

    // 5. Load Setoran list
    const unsubSetoran = onSnapshot(collection(db, 'setoranModal'), (snap) => {
      const list: SetoranModal[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as SetoranModal));
      setSetorans(list.sort((a, b) => {
        const dateA = parseToDate(a.date).getTime();
        const dateB = parseToDate(b.date).getTime();
        return dateB - dateA;
      }));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'setoranModal');
    });

    return () => {
      unsubCoA();
      unsubClosings();
      unsubPrive();
      unsubSetoran();
    };
  }, []);

  // Filter cash accounts from Live CoA (Assets category, codes 1101 and 1102)
  const cashAccounts = useMemo(() => {
    return coaAccounts.filter(a => a.type === 'Assets' && (a.systemKey === 'cash_ntd' || a.systemKey === 'cash_idr'));
  }, [coaAccounts]);

  const openAddModal = (type: 'prive' | 'setoran') => {
    setErrorMsg(null);
    setPageErrorMsg(null);
    setEditingRecordId(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormAmount('');
    setFormCurrency('NTD');
    setFormCashAccount('1101');
    const cachedRate = localStorage.getItem('journal_fx_rate');
    setFormFxRate(cachedRate ? String(Math.round(parseFloat(cachedRate) * 100) / 100) : String(FALLBACK_IDR_PER_NTD));
    setFormDescription('');
    setModalType(type === 'prive' ? 'add_prive' : 'add_setoran');
    setIsModalOpen(true);
  };

  const openEditModal = (record: Prive | SetoranModal, type: 'prive' | 'setoran') => {
    setErrorMsg(null);
    setPageErrorMsg(null);
    setEditingRecordId(record.id);
    const dateStr = parseToDate(record.date).toISOString().split('T')[0];
    setFormDate(dateStr);
    setFormAmount(record.amount.toString());
    setFormCurrency(record.currency);
    setFormCashAccount(record.cashAccountCode);
    setFormFxRate(record.fxRateUsed.toString());
    setFormDescription(record.description);
    setModalType(type === 'prive' ? 'edit_prive' : 'edit_setoran');
    setIsModalOpen(true);
  };

  // Submit Modal (Add / Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    const amountNum = parseFloat(cleanCommas(formAmount));
    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMsg('Jumlah nominal harus bernilai positif dan valid.');
      return;
    }

    const fxRateNum = parseFloat(cleanCommas(formFxRate));
    if (formCurrency === 'IDR' && (isNaN(fxRateNum) || fxRateNum <= 0)) {
      setErrorMsg('Nilai Kurs (Exchange Rate) harus diisi dengan angka positif yang valid jika menggunakan IDR.');
      return;
    }

    if (!formCashAccount) {
      setErrorMsg('Pilih akun kas penarikan / penerimaan dana.');
      return;
    }

    // 1. Period Locking Guard
    const targetPeriodId = getYearMonth(formDate);
    if (isPeriodClosed(formDate, closedPeriods)) {
      setErrorMsg(`Transaksi diblokir. Periode ${targetPeriodId} telah berstatus DITUTUP.`);
      return;
    }

    // If editing, also check if the OLD transaction date falls in a closed period
    if (editingRecordId) {
      const originalRecord = modalType.includes('prive') 
        ? prives.find(p => p.id === editingRecordId) 
        : setorans.find(s => s.id === editingRecordId);
      
      if (originalRecord) {
        const oldPeriodId = getYearMonth(originalRecord.date);
        if (isPeriodClosed(originalRecord.date, closedPeriods)) {
          setErrorMsg(`Perubahan ditolak. Tanggal transaksi lama berada dalam periode yang telah DITUTUP (${oldPeriodId}).`);
          return;
        }
      }
    }

    // Calculate NT$ cents amount
    let calculatedCents = 0;
    const finalFxRate = formCurrency === 'NTD' ? 1 : fxRateNum;
    if (formCurrency === 'NTD') {
      calculatedCents = Math.round(amountNum * 100);
    } else {
      calculatedCents = calculateNtdCentsFromIdr(amountNum, finalFxRate);
    }

    try {
      setIsSubmitting(true);
      const batch = writeBatch(db);
      const isPriveType = modalType.includes('prive');
      
      const recordId = editingRecordId || doc(collection(db, isPriveType ? 'prive' : 'setoranModal')).id;
      let journalId = '';
      if (editingRecordId) {
        const originalRecord = isPriveType ? prives.find(p => p.id === editingRecordId) : setorans.find(s => s.id === editingRecordId);
        journalId = originalRecord?.journalId || '';
      }
      if (!journalId) {
        const tgl = formDate ? new Date(formDate) : new Date();
        const dateStr = tgl.toISOString().split('T')[0];
        journalId = await getNextJournalId(dateStr);
      }

      // Live resolve account names from CoA
      const cashAccountObj = coaAccounts.find(a => a.code === formCashAccount);
      const cashAccountName = cashAccountObj?.name || (formCashAccount === '1101' ? (AUTO_ACCOUNTS.CASH_NTD?.name || 'Cash:NTD') : (AUTO_ACCOUNTS.CASH_RUPIAH?.name || 'Cash Rupiah'));

      const equityRole = isPriveType ? 'prive' : 'setoran_modal';
      const equityAccountObj = findAccountByRole(coaAccounts, equityRole);
      const equityAccountCode = equityAccountObj?.code || (isPriveType ? '3102' : '3101');
      const equityAccountName = equityAccountObj?.name || (isPriveType ? 'Prive' : 'Setoran Modal Tambahan');

      // Create Prive/Setoran Modal record payload
      const recordPayload = {
        id: recordId,
        date: Timestamp.fromDate(new Date(formDate)),
        amount: amountNum,
        amountNTD: calculatedCents,
        currency: formCurrency,
        cashAccountCode: formCashAccount,
        fxRateUsed: finalFxRate,
        description: formDescription.trim(),
        journalId,
        createdAt: Timestamp.now()
      };

      // Create double entry Journal payload
      const journalLines = isPriveType 
        ? [
            // Debit: Prive
            {
              account: equityAccountName,
              accountCode: equityAccountCode,
              debit: calculatedCents,
              credit: 0,
              originalCurrency: formCurrency,
              ...(formCurrency === 'IDR' ? { originalDebitIDR: amountNum } : {})
            },
            // Credit: Cash Account
            {
              account: cashAccountName,
              accountCode: formCashAccount,
              debit: 0,
              credit: calculatedCents,
              originalCurrency: formCurrency,
              ...(formCurrency === 'IDR' ? { originalCreditIDR: amountNum } : {})
            }
          ]
        : [
            // Debit: Cash Account
            {
              account: cashAccountName,
              accountCode: formCashAccount,
              debit: calculatedCents,
              credit: 0,
              originalCurrency: formCurrency,
              ...(formCurrency === 'IDR' ? { originalDebitIDR: amountNum } : {})
            },
            // Credit: Setoran Modal Tambahan
            {
              account: equityAccountName,
              accountCode: equityAccountCode,
              debit: 0,
              credit: calculatedCents,
              originalCurrency: formCurrency,
              ...(formCurrency === 'IDR' ? { originalCreditIDR: amountNum } : {})
            }
          ];

      const journalPayload = {
        id: journalId,
        date: Timestamp.fromDate(new Date(formDate)),
        description: isPriveType 
          ? `Prive Pemilik — ${formDescription.trim() || 'Penarikan Dana Prive'}`
          : `Setoran Modal Tambahan — ${formDescription.trim() || 'Injeksi Dana Pemilik'}`,
        lines: journalLines,
        refType: isPriveType ? 'prive' : 'setoran_modal',
        refId: recordId,
        createdAt: Timestamp.now()
      };

      // Set records and journals atomically
      batch.set(doc(db, isPriveType ? 'prive' : 'setoranModal', recordId), recordPayload);
      batch.set(doc(db, 'journalEntries', journalId), journalPayload);

      await batch.commit();

      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to commit Prive/Setoran transaction:", err);
      setErrorMsg('Kesalahan sistem: Gagal menyimpan data transaksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Record Atomically (deletes record and its journal entry using transactions)
  const handleDelete = (record: Prive | SetoranModal, type: 'prive' | 'setoran') => {
    setPageErrorMsg(null);

    // 1. Period Locking Guard
    const targetPeriodId = getYearMonth(record.date);
    if (isPeriodClosed(record.date, closedPeriods)) {
      setPageErrorMsg(`Penghapusan ditolak. Periode transaksi ini (${targetPeriodId}) telah berstatus DITUTUP.`);
      return;
    }

    setDeleteConfirmRecord({ record, type });
  };

  const executeDelete = async (record: Prive | SetoranModal, type: 'prive' | 'setoran') => {
    try {
      const isPriveType = type === 'prive';
      const recordRef = doc(db, isPriveType ? 'prive' : 'setoranModal', record.id);
      const journalRef = doc(db, 'journalEntries', record.journalId);

      await runTransaction(db, async (transaction) => {
        // Read Phase first per transaction requirements
        const recordSnap = await transaction.get(recordRef);
        const journalSnap = await transaction.get(journalRef);

        // Write Phase second
        if (recordSnap.exists()) {
          transaction.delete(recordRef);
        }
        if (journalSnap.exists()) {
          transaction.delete(journalRef);

          // Log audit entry
          const auditId = doc(collection(db, 'auditLog')).id;
          const auditRef = doc(db, 'auditLog', auditId);
          const auditEntry = {
            id: auditId,
            timestamp: Timestamp.now(),
            userEmail: profile?.email || 'unknown@kangenbukuindo.tw',
            userDisplayName: profile?.displayName || 'User',
            action: 'DELETE',
            journalId: record.journalId,
            before: journalSnap.data(),
            after: null
          };
          transaction.set(auditRef, auditEntry);
        }
      });
    } catch (err) {
      console.error("Failed to delete Prive/Setoran record:", err);
      setPageErrorMsg('Kesalahan sistem: Gagal menghapus transaksi.');
    }
  };

  // Monthly summary metrics for display
  const currentMonthPeriod = getYearMonth(new Date());
  
  const totalPriveCurrentMonth = prives
    .filter(p => getYearMonth(p.date) === currentMonthPeriod)
    .reduce((acc, p) => acc + p.amountNTD, 0);

  const totalSetoranCurrentMonth = setorans
    .filter(s => getYearMonth(s.date) === currentMonthPeriod)
    .reduce((acc, s) => acc + s.amountNTD, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Uniform Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <Scale className="h-5 w-5 text-indigo-500" /> Ekuitas & Prive
          </h2>
        </div>
      </div>

      {pageErrorMsg && (
        <div className="p-4 bg-rust-bg border border-rust/25 rounded-xl text-rust text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            ⚠️ {pageErrorMsg}
          </span>
          <button 
            onClick={() => setPageErrorMsg(null)}
            className="text-rust/70 hover:text-rust font-bold px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Summary Dashboard Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl p-5.5 shadow-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-rust"></div>
          <div>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.8px] text-ink-mute dark:text-neutral-450">Total Prive Bulan Ini ({formatPeriodName(currentMonthPeriod)})</span>
            <h2 className="text-2xl font-semibold text-rust dark:text-red-400 mt-1 font-numeric tracking-tight">{formatNTD(totalPriveCurrentMonth)}</h2>
            <p className="text-[10.5px] text-ink-soft dark:text-neutral-400 mt-1 italic font-medium">Penarikan modal operasional pemilik</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-rust-bg dark:bg-red-950/20 text-rust dark:text-red-400 flex items-center justify-center">
            <TrendingDown className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl p-5.5 shadow-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-forest"></div>
          <div>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.8px] text-ink-mute dark:text-neutral-450">Total Setoran Modal Bulan Ini ({formatPeriodName(currentMonthPeriod)})</span>
            <h2 className="text-2xl font-semibold text-forest dark:text-emerald-400 mt-1 font-numeric tracking-tight">{formatNTD(totalSetoranCurrentMonth)}</h2>
            <p className="text-[10.5px] text-ink-soft dark:text-neutral-400 mt-1 italic font-medium">Injeksi modal tambahan kas baru</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-forest-bg dark:bg-emerald-955/20 text-forest dark:text-emerald-400 flex items-center justify-center">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Tab Controls */}
      <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex bg-gold-light/40 dark:bg-neutral-800 p-1 rounded-xl max-w-max border border-line-soft dark:border-neutral-700">
            <button
              onClick={() => setActiveSubSection('prive')}
              className={`px-4.5 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                activeSubSection === 'prive'
                  ? 'bg-surface dark:bg-neutral-900 text-gold shadow-sm border border-line/50 dark:border-neutral-700'
                  : 'text-ink-soft dark:text-neutral-400 hover:text-gold'
              }`}
            >
              <span>💸 Penarikan Prive</span>
            </button>
            <button
              onClick={() => setActiveSubSection('setoran')}
              className={`px-4.5 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                activeSubSection === 'setoran'
                  ? 'bg-surface dark:bg-neutral-900 text-gold shadow-sm border border-line/50 dark:border-neutral-700'
                  : 'text-ink-soft dark:text-neutral-400 hover:text-gold'
              }`}
            >
              <span>📈 Setoran Modal Tambahan</span>
            </button>
          </div>

          <button
            onClick={() => openAddModal(activeSubSection)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-navy hover:bg-opacity-95 rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="h-4 w-4 text-gold" />
            <span>{activeSubSection === 'prive' ? 'Tambah Prive' : 'Tambah Setoran Modal'}</span>
          </button>
        </div>
      </div>

      {/* Lists / Tables View */}
      {loading ? (
        <div className="text-center py-24 text-ink-mute dark:text-neutral-500 text-xs italic font-medium">Loading data permodalan ekuitas...</div>
      ) : (
        <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
          {activeSubSection === 'prive' ? (
            <div>
              <div className="p-4 border-b border-line dark:border-neutral-800 bg-gold-light/20 dark:bg-neutral-950 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-navy dark:text-blue-300 flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-rust" /> 
                  <span className="font-serif text-sm">Riwayat Transaksi Prive Pemilik</span> 
                  <span className="text-[10px] font-sans font-semibold bg-navy-bg dark:bg-blue-950 text-navy dark:text-blue-300 px-2 py-0.5 rounded border border-line dark:border-neutral-750">Akun {priveAccount?.code || '3102'}</span>
                </span>
                <span className="text-[10px] font-semibold text-ink-mute dark:text-neutral-500 uppercase tracking-wider">Terdapat {prives.length} mutasi</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-line dark:divide-neutral-800">
                  <thead className="bg-gold-light/10 dark:bg-neutral-900/40 text-ink-mute dark:text-neutral-450 font-semibold uppercase text-[9.5px] tracking-[0.8px] border-b border-line dark:border-neutral-800">
                    <tr>
                      <th className="p-4">Tanggal</th>
                      <th className="p-4">Jumlah (NTD)</th>
                      <th className="p-4">Jumlah Input / Kurs</th>
                      <th className="p-4">Dibayar Via</th>
                      <th className="p-4">Keterangan</th>
                      <th className="p-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft dark:divide-neutral-805 text-ink dark:text-neutral-300">
                    {prives.map((p) => {
                      const isClosed = isPeriodClosed(p.date, closedPeriods);
                      return (
                        <tr key={p.id} className="hover:bg-gold-light/10 dark:hover:bg-neutral-850/15 transition duration-100">
                          <td className="p-4 whitespace-nowrap font-medium text-ink dark:text-neutral-200">
                            {new Date(parseToDate(p.date)).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                            {isClosed && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[8.5px] font-bold bg-rust-bg dark:bg-rose-950/30 text-rust dark:text-rose-400 border border-rust/15 uppercase tracking-wider">
                                Terkunci
                              </span>
                            )}
                          </td>
                          <td className="p-4 font-numeric font-bold text-sm text-ink dark:text-white">
                            {formatNTD(p.amountNTD)}
                          </td>
                          <td className="p-4 font-numeric text-[10.5px]">
                            {p.currency === 'IDR' ? (
                              <div className="flex flex-col">
                                <span className="font-semibold text-forest dark:text-emerald-450">Rp {p.amount.toLocaleString('id-ID')}</span>
                                <span className="text-[9.5px] text-ink-mute dark:text-neutral-500">
                                  Kurs: {p.fxRateUsed ? (p.fxRateUsed >= 1 ? `1 NTD = ${p.fxRateUsed} IDR` : p.fxRateUsed) : '—'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-ink-mute dark:text-neutral-500">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className="bg-navy-bg dark:bg-neutral-800 px-2.5 py-1 rounded-md text-[10px] font-semibold text-navy dark:text-neutral-350 border border-line dark:border-neutral-700">
                              {coaAccounts.find(a => a.code === p.cashAccountCode)?.name || (p.cashAccountCode === '1101' ? (AUTO_ACCOUNTS.CASH_NTD?.name || 'Cash:NTD') : (AUTO_ACCOUNTS.CASH_RUPIAH?.name || 'Cash Rupiah'))}
                            </span>
                          </td>
                          <td className="p-4 max-w-xs truncate text-ink-soft dark:text-neutral-400 font-medium" title={p.description}>
                            {p.description || '—'}
                          </td>
                          <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditModal(p, 'prive')}
                                className="p-1.5 text-ink-mute hover:text-gold dark:hover:text-gold rounded-lg hover:bg-gold-light/30 dark:hover:bg-neutral-800 transition cursor-pointer"
                                title="Edit Transaksi"
                              >
                                <Edit className="h-4.5 w-4.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(p, 'prive')}
                                className="p-1.5 text-ink-mute hover:text-rust dark:hover:text-rose-450 rounded-lg hover:bg-gold-light/30 dark:hover:bg-neutral-800 transition cursor-pointer"
                                title="Hapus Transaksi"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {prives.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-20 text-ink-mute dark:text-neutral-500 italic font-medium">Belum ada catatan penarikan prive pemilik.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <div className="p-4 border-b border-line dark:border-neutral-800 bg-gold-light/20 dark:bg-neutral-950 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-navy dark:text-blue-300 flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-forest" /> 
                  <span className="font-serif text-sm">Riwayat Setoran Modal Tambahan</span> 
                  <span className="text-[10px] font-sans font-semibold bg-navy-bg dark:bg-blue-950 text-navy dark:text-blue-300 px-2 py-0.5 rounded border border-line dark:border-neutral-750">Akun {setoranAccount?.code || '3101'}</span>
                </span>
                <span className="text-[10px] font-semibold text-ink-mute dark:text-neutral-500 uppercase tracking-wider">Terdapat {setorans.length} mutasi</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-line dark:divide-neutral-800">
                  <thead className="bg-gold-light/10 dark:bg-neutral-900/40 text-ink-mute dark:text-neutral-450 font-semibold uppercase text-[9.5px] tracking-[0.8px] border-b border-line dark:border-neutral-800">
                    <tr>
                      <th className="p-4">Tanggal</th>
                      <th className="p-4">Jumlah (NTD)</th>
                      <th className="p-4">Jumlah Input / Kurs</th>
                      <th className="p-4">Diterima Via</th>
                      <th className="p-4">Keterangan</th>
                      <th className="p-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft dark:divide-neutral-805 text-ink dark:text-neutral-300">
                    {setorans.map((s) => {
                      const isClosed = isPeriodClosed(s.date, closedPeriods);
                      return (
                        <tr key={s.id} className="hover:bg-gold-light/10 dark:hover:bg-neutral-850/15 transition duration-100">
                          <td className="p-4 whitespace-nowrap font-medium text-ink dark:text-neutral-200">
                            {new Date(parseToDate(s.date)).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                            {isClosed && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[8.5px] font-bold bg-rust-bg dark:bg-rose-950/30 text-rust dark:text-rose-400 border border-rust/15 uppercase tracking-wider">
                                Terkunci
                              </span>
                            )}
                          </td>
                          <td className="p-4 font-numeric font-bold text-sm text-ink dark:text-white">
                            {formatNTD(s.amountNTD)}
                          </td>
                          <td className="p-4 font-numeric text-[10.5px]">
                            {s.currency === 'IDR' ? (
                              <div className="flex flex-col">
                                <span className="font-semibold text-forest dark:text-emerald-450">Rp {s.amount.toLocaleString('id-ID')}</span>
                                <span className="text-[9.5px] text-ink-mute dark:text-neutral-500">
                                  Kurs: {s.fxRateUsed ? (s.fxRateUsed >= 1 ? `1 NTD = ${s.fxRateUsed} IDR` : s.fxRateUsed) : '—'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-ink-mute dark:text-neutral-500">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className="bg-navy-bg dark:bg-neutral-800 px-2.5 py-1 rounded-md text-[10px] font-semibold text-navy dark:text-neutral-350 border border-line dark:border-neutral-700">
                              {coaAccounts.find(a => a.code === s.cashAccountCode)?.name || (s.cashAccountCode === '1101' ? (AUTO_ACCOUNTS.CASH_NTD?.name || 'Cash:NTD') : (AUTO_ACCOUNTS.CASH_RUPIAH?.name || 'Cash Rupiah'))}
                            </span>
                          </td>
                          <td className="p-4 max-w-xs truncate text-ink-soft dark:text-neutral-400 font-medium" title={s.description}>
                            {s.description || '—'}
                          </td>
                          <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditModal(s, 'setoran')}
                                className="p-1.5 text-ink-mute hover:text-gold dark:hover:text-gold rounded-lg hover:bg-gold-light/30 dark:hover:bg-neutral-800 transition cursor-pointer"
                                title="Edit Transaksi"
                              >
                                <Edit className="h-4.5 w-4.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(s, 'setoran')}
                                className="p-1.5 text-ink-mute hover:text-rust dark:hover:text-rose-450 rounded-lg hover:bg-gold-light/30 dark:hover:bg-neutral-800 transition cursor-pointer"
                                title="Hapus Transaksi"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {setorans.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-20 text-ink-mute dark:text-neutral-500 italic font-medium">Belum ada catatan setoran modal tambahan.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Add/Edit */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-neutral-900/60 dark:bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 border-b border-line dark:border-neutral-800 bg-gold-light/10 dark:bg-neutral-950 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-navy dark:text-blue-300 flex items-center gap-2 font-serif text-base">
                  <DollarSign className="h-4.5 w-4.5 text-gold shrink-0" />
                  {modalType === 'add_prive' && 'Tambah Prive Baru'}
                  {modalType === 'edit_prive' && 'Edit Transaksi Prive'}
                  {modalType === 'add_setoran' && 'Tambah Setoran Modal Baru'}
                  {modalType === 'edit_setoran' && 'Edit Setoran Modal'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-ink-mute hover:text-ink dark:hover:text-neutral-200 rounded-lg transition hover:bg-gold-light/20 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5.5 space-y-4.5 overflow-y-auto flex-1 text-xs">
                {errorMsg && (
                  <div className="p-3.5 bg-rust-bg border border-rust/20 rounded-xl text-rust text-xs font-semibold">
                    ⚠️ {errorMsg}
                  </div>
                )}

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-soft dark:text-neutral-400 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-gold" /> 
                    <span>Tanggal Transaksi *</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-line dark:border-neutral-700 rounded-xl text-xs font-semibold dark:bg-neutral-800 dark:border-neutral-750 font-numeric focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
                  />
                </div>

                {/* Cash Account selection */}
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-soft dark:text-neutral-400">
                    {modalType.includes('prive') ? 'Dibayar Melalui (Kas) *' : 'Diterima Melalui (Kas) *'}
                  </label>
                  <select
                    value={formCashAccount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormCashAccount(val);
                      setFormCurrency(val === '1101' ? 'NTD' : 'IDR');
                    }}
                    className="w-full px-3.5 py-2.5 border border-line dark:border-neutral-700 rounded-xl text-xs font-semibold dark:bg-neutral-800 dark:border-neutral-750 focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
                  >
                    {cashAccounts.map((acc, idx) => (
                      <option key={`${acc.id || acc.code}-${idx}`} value={acc.code}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                    {cashAccounts.length === 0 && (
                      <option value={formCurrency === 'NTD' ? '1101' : '1102'}>
                        {formCurrency === 'NTD' ? '1101 - Cash: NTD' : '1102 - Cash: Rupiah'} (Default)
                      </option>
                    )}
                  </select>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-soft dark:text-neutral-400 flex justify-between items-center">
                    <span>Jumlah Nominal *</span>
                    <span className="font-numeric text-gold font-bold bg-gold-light/30 px-2 py-0.5 rounded-md text-[10px] border border-line-soft">({formCurrency})</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={formCurrency === 'NTD' ? 'Contoh: 15,000' : 'Contoh: 500,000'}
                    value={formAmount}
                    onChange={(e) => setFormAmount(formatInputWithCommas(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-line dark:border-neutral-700 rounded-xl text-xs font-bold font-numeric dark:bg-neutral-800 dark:border-neutral-750 focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
                  />
                </div>

                {/* Exchange rate (Editable for IDR) */}
                {formCurrency === 'IDR' && (
                  <div className="space-y-1.5 p-3.5 bg-gold-light/10 dark:bg-neutral-850 rounded-2xl border border-line dark:border-neutral-800">
                    <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-soft dark:text-neutral-400 flex justify-between items-center">
                      <span>Kurs FX (1 NTD = ... IDR) *</span>
                      <span className="text-gold font-numeric font-medium text-[10px]">IDR ➔ NT$</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: 500"
                      value={formFxRate}
                      onChange={(e) => setFormFxRate(formatInputWithCommas(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-line dark:border-neutral-700 rounded-xl text-xs font-bold font-numeric bg-white dark:bg-neutral-800 text-ink dark:text-neutral-100 focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
                    />
                    <div className="flex items-start gap-1.5 mt-2.5 text-[10px] text-ink-soft dark:text-neutral-400">
                      <Info className="h-3.5 w-3.5 shrink-0 text-gold mt-0.5" />
                      <span>
                        Hasil Konversi NT$: <strong className="font-numeric text-gold font-bold">
                          {(() => {
                            const val = parseFloat(cleanCommas(formAmount)) || 0;
                            const rate = parseFloat(cleanCommas(formFxRate)) || 0;
                            const cents = calculateNtdCentsFromIdr(val, rate);
                            return formatNTD(cents);
                          })()}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-soft dark:text-neutral-400">
                    Keterangan / Memo
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Contoh: Penarikan dana prive untuk keperluan pribadi pemilik atau Setoran kas baru"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-line dark:border-neutral-700 rounded-xl text-xs font-medium dark:bg-neutral-800 dark:border-neutral-750 focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-navy hover:bg-opacity-95 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer mt-4.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sedang Diproses...</span>
                    </>
                  ) : (
                    'Simpan Transaksi'
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 backdrop-blur-xs p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-3xl w-full max-w-md p-6 shadow-xl space-y-4"
            >
              <div className="flex items-start gap-3.5 text-rust">
                <div className="p-2.5 bg-rust-bg dark:bg-red-950/20 rounded-xl shrink-0">
                  <Trash2 className="h-5.5 w-5.5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-ink dark:text-neutral-100 font-serif">
                    Konfirmasi Hapus Transaksi
                  </h3>
                  <p className="text-xs text-ink-soft dark:text-neutral-400 font-medium">
                    Apakah Anda yakin ingin menghapus transaksi {deleteConfirmRecord.type === 'prive' ? 'Prive' : 'Setoran Modal'} ini? Jurnal akuntansi terkait akan dihapus secara otomatis.
                  </p>
                </div>
              </div>
              
              {/* Transaction Details */}
              <div className="bg-gold-light/10 dark:bg-neutral-950 p-4 rounded-2xl border border-line dark:border-neutral-800 space-y-2 text-xs font-numeric">
                <div className="flex justify-between items-center">
                  <span className="text-ink-mute dark:text-neutral-500 font-sans font-medium">Tanggal:</span>
                  <span className="text-ink dark:text-neutral-300 font-semibold">
                    {new Date(parseToDate(deleteConfirmRecord.record.date)).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-mute dark:text-neutral-500 font-sans font-medium">Nominal:</span>
                  <span className="text-rust dark:text-rose-400 font-bold text-sm">
                    {formatNTD(deleteConfirmRecord.record.amountNTD)}
                  </span>
                </div>
                {deleteConfirmRecord.record.description && (
                  <div className="border-t border-line dark:border-neutral-800 pt-2 flex justify-between items-center">
                    <span className="text-ink-mute dark:text-neutral-500 font-sans font-medium">Keterangan:</span>
                    <span className="text-ink-soft dark:text-neutral-300 max-w-[200px] truncate font-medium" title={deleteConfirmRecord.record.description}>
                      {deleteConfirmRecord.record.description}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmRecord(null)}
                  className="px-4.5 py-2.5 text-xs font-bold text-ink-soft hover:text-ink dark:hover:text-neutral-300 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const { record, type } = deleteConfirmRecord;
                    setDeleteConfirmRecord(null);
                    await executeDelete(record, type);
                  }}
                  className="px-5 py-2.5 bg-rust hover:bg-opacity-95 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Hapus Permanen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
