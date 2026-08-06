import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs,
  writeBatch,
  Timestamp,
  runTransaction 
} from 'firebase/firestore';
import { AmortizationItem, AmortizationPosting, CoaAccount, JournalEntry } from '../types';
import { ensureAutoAccountExists, AUTO_ACCOUNTS, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { isPeriodClosed, fetchCurrentExchangeRate } from '../lib/period-closing-utils';
import { useAuth } from '../lib/auth-context';
import { 
  FileText, 
  Plus, 
  Search, 
  Trash2, 
  RotateCcw, 
  Check, 
  CheckCircle2, 
  Info, 
  X, 
  Calendar, 
  DollarSign, 
  AlertCircle,
  Eye,
  ArrowRight
} from 'lucide-react';

function formatNTD(amountNTD: number): string {
  const dollars = amountNTD / 100;
  return 'NT$ ' + dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val.seconds) return new Date(val.seconds * 1000);
  return new Date(val);
}

function getYearMonth(val: any): string {
  const d = parseToDate(val);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonthsToPeriod(startYYYYMMDD: string, monthsToAdd: number): string {
  const dateParts = startYYYYMMDD.split('-');
  let year = parseInt(dateParts[0], 10);
  let month = parseInt(dateParts[1], 10) - 1 + monthsToAdd;
  const newDate = new Date(year, month, 1);
  const y = newDate.getFullYear();
  const m = String(newDate.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function deriveItemStatus(item: AmortizationItem): 'Berjalan' | 'Selesai' | 'Belum Dimulai' {
  const postedCount = item.postings?.length || 0;
  if (postedCount >= item.usefulLifeMonths) return 'Selesai';
  const todayStr = new Date().toISOString().slice(0, 10);
  if (postedCount === 0 && item.startDate > todayStr) return 'Belum Dimulai';
  return 'Berjalan';
}

export const AmortisasiTab: React.FC = () => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';

  // Firestore collections state
  const [items, setItems] = useState<AmortizationItem[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & Filters
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'Berjalan' | 'Selesai' | 'Belum Dimulai'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals & Banners
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Reusable Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {}
  });

  // Journal detail modal state (for "Lihat Jurnal")
  const [viewJournal, setViewJournal] = useState<{
    isOpen: boolean;
    title: string;
    lines: { account: string; debit: number; credit: number }[];
  }>({ isOpen: false, title: '', lines: [] });

  // Form Fields for New Amortization
  const [formName, setFormName] = useState('');
  const [formNilai, setFormNilai] = useState('');
  const [formCurrency, setFormCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [formFxRate, setFormFxRate] = useState('0.00205'); // NTD per IDR
  const [formMasa, setFormMasa] = useState('12');
  const [formTanggal, setFormTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [formMulai, setFormMulai] = useState(() => new Date().toISOString().slice(0, 10));
  const [formBayarVia, setFormBayarVia] = useState('1101');
  const [formPrepaidAccount, setFormPrepaidAccount] = useState('1400');
  const [formExpenseAccount, setFormExpenseAccount] = useState('5240');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Handle Nilai Perolehan input formatting with commas
  const handleNilaiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setFormNilai('');
      return;
    }
    const formatted = parseInt(raw, 10).toLocaleString('en-US');
    setFormNilai(formatted);
  };

  // Track bulk post month
  const currentMonthPeriod = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const [bulkPostedMonth, setBulkPostedMonth] = useState<string | null>(null);

  // Show Toast Helper
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Ensure Auto Accounts exist & Fetch Live FX on mount
  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([
          ensureAutoAccountExists(AUTO_ACCOUNTS.BIAYA_DIBAYAR_DIMUKA),
          ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_AMORTISASI),
          ensureAutoAccountExists(AUTO_ACCOUNTS.CASH_NTD),
          ensureAutoAccountExists(AUTO_ACCOUNTS.CASH_RUPIAH)
        ]);

        const idrRate = await fetchCurrentExchangeRate(); // IDR per NTD
        if (idrRate && idrRate > 0) {
          setFormFxRate((1 / idrRate).toFixed(5));
        }
      } catch (e) {
        console.warn('Initialization in AmortisasiTab:', e);
      }
    };
    init();
  }, []);

  // One-time migration for legacy 'journals' collection to 'journalEntries'
  useEffect(() => {
    const migrateLegacyJournals = async () => {
      try {
        const legacySnap = await getDocs(collection(db, 'journals'));
        if (!legacySnap.empty) {
          const batch = writeBatch(db);
          legacySnap.forEach((docSnap) => {
            batch.set(doc(db, 'journalEntries', docSnap.id), docSnap.data(), { merge: true });
            batch.delete(doc(db, 'journals', docSnap.id));
          });
          await batch.commit();
          console.log(`Migrated ${legacySnap.size} legacy journals to journalEntries.`);
        }
      } catch (e) {
        console.warn('Legacy journal migration check:', e);
      }
    };
    migrateLegacyJournals();
  }, []);

  // Listen to Firestore 'amortizations', 'coa', 'closedPeriods'
  useEffect(() => {
    setLoading(true);

    const unsubAmort = onSnapshot(
      collection(db, 'amortizations'),
      (snap) => {
        const loaded: AmortizationItem[] = [];
        snap.forEach((docSnap) => {
          loaded.push({ id: docSnap.id, ...docSnap.data() } as AmortizationItem);
        });
        // Sort by docCode descending
        loaded.sort((a, b) => (b.docCode || '').localeCompare(a.docCode || ''));
        setItems(loaded);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'amortizations')
    );

    const unsubCoa = onSnapshot(
      collection(db, 'coa'),
      (snap) => {
        const accs: CoaAccount[] = [];
        snap.forEach((docSnap) => {
          accs.push({ id: docSnap.id, ...docSnap.data() } as CoaAccount);
        });
        setCoaAccounts(accs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'coa')
    );

    const unsubClosed = onSnapshot(
      collection(db, 'closedPeriods'),
      (snap) => {
        const p: string[] = [];
        snap.forEach((docSnap) => {
          p.push(docSnap.id);
        });
        setClosedPeriods(p);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'closedPeriods')
    );

    return () => {
      unsubAmort();
      unsubCoa();
      unsubClosed();
    };
  }, []);

  // Filter accounts for dropdowns
  const cashAccounts = useMemo(() => {
    const filtered = coaAccounts.filter((a) => a.systemKey === 'cash_ntd' || a.systemKey === 'cash_idr');
    const seen = new Set<string>();
    return filtered.filter((a) => {
      if (!a.code || seen.has(a.code)) return false;
      seen.add(a.code);
      return true;
    });
  }, [coaAccounts]);

  const prepaidAccounts = useMemo(() => {
    const filtered = coaAccounts.filter((a) => a.code === '1400' || a.code.startsWith('14') || a.name?.toLowerCase().includes('dibayar dimuka'));
    const seen = new Set<string>();
    return filtered.filter((a) => {
      if (!a.code || seen.has(a.code)) return false;
      seen.add(a.code);
      return true;
    });
  }, [coaAccounts]);

  const expenseAccounts = useMemo(() => {
    const filtered = coaAccounts.filter((a) => a.code === '5240');
    const seen = new Set<string>();
    return filtered.filter((a) => {
      if (!a.code || seen.has(a.code)) return false;
      seen.add(a.code);
      return true;
    });
  }, [coaAccounts]);

  // Statistics
  const { totalNilaiPerolehan, totalAkumulasiAmortisasi, totalMonths, postedMonths, dueCount } = useMemo(() => {
    let perolehan = 0;
    let akumulasi = 0;
    let tMonths = 0;
    let pMonths = 0;
    let due = 0;

    items.forEach((it) => {
      perolehan += it.nilaiPerolehanNTD || 0;
      const useful = it.usefulLifeMonths || 12;
      const monthlyNtd = (it.nilaiPerolehanNTD || 0) / useful;
      const posted = it.postings?.length || 0;

      akumulasi += monthlyNtd * posted;
      tMonths += useful;
      pMonths += posted;

      if (posted < useful && deriveItemStatus(it) === 'Berjalan') {
        due++;
      }
    });

    return {
      totalNilaiPerolehan: perolehan,
      totalAkumulasiAmortisasi: Math.round(akumulasi),
      totalMonths: tMonths,
      postedMonths: pMonths,
      dueCount: due
    };
  }, [items]);

  const progressPct = totalMonths > 0 ? Math.round((postedMonths / totalMonths) * 100) : 0;

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const status = deriveItemStatus(it);
      const matchStatus = activeStatusFilter === 'all' || status === activeStatusFilter;
      const term = searchTerm.toLowerCase().trim();
      const matchSearch = !term || it.name.toLowerCase().includes(term) || it.docCode.toLowerCase().includes(term);
      return matchStatus && matchSearch;
    });
  }, [items, activeStatusFilter, searchTerm]);

  // Selected item object
  const selectedItem = useMemo(() => {
    return items.find((i) => i.id === selectedId) || null;
  }, [items, selectedId]);

  // Handle Save New Amortization Item
  const handleSaveAmortization = async () => {
    setFormError(null);
    if (!formName.trim()) {
      setFormError('Nama item amortisasi wajib diisi.');
      return;
    }
    const rawVal = parseFloat(formNilai.replace(/,/g, ''));
    if (isNaN(rawVal) || rawVal <= 0) {
      setFormError('Nilai perolehan harus berupa angka positif.');
      return;
    }

    const acqPeriod = formTanggal.slice(0, 7);
    if (isPeriodClosed(acqPeriod, closedPeriods)) {
      setFormError(`Periode ${acqPeriod} sudah ditutup. Tidak dapat membuat jurnal transaksi pada periode tertutup.`);
      return;
    }

    // Calculate NTD amount
    let ntdCents = 0;
    if (formCurrency === 'IDR') {
      const rate = parseFloat(formFxRate);
      if (isNaN(rate) || rate <= 0) {
        setFormError('Kurs IDR -> NTD tidak valid.');
        return;
      }
      ntdCents = Math.round(rawVal * rate * 100);
    } else {
      ntdCents = Math.round(rawVal * 100);
    }

    try {
      const docId = doc(collection(db, 'amortizations')).id;
      // Generate docCode: AM + YYMM + 4-digit sequence
      const yymm = formTanggal.slice(2, 4) + formTanggal.slice(5, 7);
      const countThisMonth = items.filter((i) => i.docCode && i.docCode.startsWith(`AM${yymm}`)).length;
      const docCode = `AM${yymm}${String(countThisMonth + 1).padStart(4, '0')}`;

      // Resolve account objects for journal
      const paidAcc = coaAccounts.find((a) => a.code === formBayarVia) || { code: formBayarVia, name: formBayarVia === '1102' ? 'Cash Rupiah' : 'Cash:NTD' };
      const prepaidAcc = coaAccounts.find((a) => a.code === formPrepaidAccount) || { code: formPrepaidAccount, name: 'Biaya Dibayar Dimuka' };

      const dateStr = formTanggal || new Date().toISOString().split('T')[0];
      
      const tglDateStr = formTanggal ? formTanggal + '-28' : new Date().toISOString().split('T')[0];
    const journalId = await getNextJournalId(tglDateStr);
      const journalDesc = `${docCode}\nBiaya Dibayar Dimuka - ${formName.trim()}`;

      // Create Acquisition Journal
      const journalData: JournalEntry = {
        id: journalId,
        date: Timestamp.fromDate(new Date(formTanggal + 'T12:00:00')),
        description: journalDesc,
        refType: 'amortization_acquisition',
        refId: docCode,
        lines: [
          {
            account: prepaidAcc.name,
            accountCode: prepaidAcc.code,
            debit: ntdCents,
            credit: 0
          },
          {
            account: paidAcc.name,
            accountCode: paidAcc.code,
            debit: 0,
            credit: ntdCents,
            ...(formCurrency === 'IDR' ? { originalCurrency: 'IDR', originalCreditIDR: rawVal } : {})
          }
        ],
        createdAt: Timestamp.now()
      };

      const newItem: AmortizationItem = {
        id: docId,
        docCode,
        name: formName.trim(),
        nilaiPerolehanNTD: ntdCents,
        nilaiPerolehanRaw: rawVal,
        currency: formCurrency,
        fxRateUsed: formCurrency === 'IDR' ? parseFloat(formFxRate) : 1,
        usefulLifeMonths: parseInt(formMasa, 10),
        acquisitionDate: formTanggal,
        startDate: formMulai,
        paidViaAccountCode: formBayarVia,
        prepaidAccountCode: formPrepaidAccount,
        expenseAccountCode: formExpenseAccount,
        notes: formNotes.trim(),
        status: 'Berjalan',
        acquisitionJournalId: journalId,
        postings: [],
        createdAt: Timestamp.now(),
        createdBy: profile?.displayName || profile?.email || 'System'
      };

      await runTransaction(db, async (tx) => {
        tx.set(doc(db, 'journalEntries', journalId), journalData);
        tx.set(doc(db, 'amortizations', docId), newItem);
      });

      setIsAddModalOpen(false);
      setSelectedId(docId);
      setBannerMessage(`Item Amortisasi **${docCode}** (${newItem.name}) berhasil disimpan beserta entri jurnal perolehan.`);

      // Reset form
      setFormName('');
      setFormNilai('');
      setFormNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'amortizations');
      setFormError('Gagal menyimpan item amortisasi.');
    }
  };

  // Handle Monthly Post
  const handlePostMonthly = async (item: AmortizationItem, monthNumber: number) => {
    const period = addMonthsToPeriod(item.startDate, monthNumber - 1);

    if (isPeriodClosed(period, closedPeriods)) {
      showToast(`Periode ${period} sudah ditutup. Tidak dapat memposting jurnal pada periode tertutup.`);
      return;
    }

    const monthlyAmountNTD = Math.round(item.nilaiPerolehanNTD / item.usefulLifeMonths);
    
          
          const tglDateStr = formTanggal ? formTanggal + '-28' : new Date().toISOString().split('T')[0];
    const journalId = await getNextJournalId(tglDateStr);
    const journalDesc = `${item.docCode}\nAmortisasi Bulanan - Periode ${period}`;

    const prepaidAcc = coaAccounts.find((a) => a.code === item.prepaidAccountCode) || { code: item.prepaidAccountCode, name: 'Biaya Dibayar Dimuka' };
    const expenseAcc = coaAccounts.find((a) => a.code === item.expenseAccountCode) || { code: item.expenseAccountCode, name: 'Beban Amortisasi' };

    const journalData: JournalEntry = {
      id: journalId,
      date: Timestamp.fromDate(new Date(`${period}-28T12:00:00`)),
      description: journalDesc,
      refType: 'amortization_monthly',
      refId: `${item.docCode}_${period}`,
      lines: [
        {
          account: expenseAcc.name,
          accountCode: expenseAcc.code,
          debit: monthlyAmountNTD,
          credit: 0
        },
        {
          account: prepaidAcc.name,
          accountCode: prepaidAcc.code,
          debit: 0,
          credit: monthlyAmountNTD
        }
      ],
      createdAt: Timestamp.now()
    };

    const newPosting: AmortizationPosting = {
      period,
      monthNumber,
      amountNTD: monthlyAmountNTD,
      journalId,
      postedAt: Timestamp.now()
    };

    const updatedPostings = [...(item.postings || []), newPosting].sort((a, b) => a.monthNumber - b.monthNumber);
    const updatedStatus = updatedPostings.length >= item.usefulLifeMonths ? 'Selesai' : 'Berjalan';

    try {
      await runTransaction(db, async (tx) => {
        tx.set(doc(db, 'journalEntries', journalId), journalData);
        tx.update(doc(db, 'amortizations', item.id), {
          postings: updatedPostings,
          status: updatedStatus
        });
      });

      showToast(`Jurnal Amortisasi Bulan ${monthNumber} (${period}) berhasil diposting.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'amortizations');
      showToast('Gagal memposting jurnal amortisasi.');
    }
  };

  // Handle Reverse Monthly Posting
  const handleReversePosting = (item: AmortizationItem, monthNumber: number) => {
    const postedList = [...(item.postings || [])].sort((a, b) => a.monthNumber - b.monthNumber);
    const lastPosting = postedList[postedList.length - 1];

    if (!lastPosting || lastPosting.monthNumber !== monthNumber) {
      showToast('Hanya periode terakhir yang terjurnal yang dapat dibatalkan.');
      return;
    }

    if (isPeriodClosed(lastPosting.period, closedPeriods)) {
      showToast(`Periode ${lastPosting.period} sudah ditutup. Tidak dapat membatalkan jurnal pada periode tertutup.`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Batalkan Jurnal Amortisasi?',
      message: `Jurnal Bulan ${monthNumber} (${lastPosting.period}) untuk "${item.name}" akan dibatalkan dan jurnalnya dihapus. Nilai buku akan dikembalikan ke periode sebelumnya.`,
      action: async () => {
        try {
          const updatedPostings = postedList.filter((p) => p.monthNumber !== monthNumber);
          const updatedStatus = 'Berjalan';

          await runTransaction(db, async (tx) => {
            tx.delete(doc(db, 'journalEntries', lastPosting.journalId));
            tx.delete(doc(db, 'journals', lastPosting.journalId)); // Clean legacy if any
            tx.update(doc(db, 'amortizations', item.id), {
              postings: updatedPostings,
              status: updatedStatus
            });
          });

          showToast(`Jurnal Bulan ${monthNumber} (${lastPosting.period}) berhasil dibatalkan.`);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'journalEntries');
          showToast('Gagal membatalkan jurnal amortisasi.');
        }
      }
    });
  };

  // Handle Bulk Post for Current Month
  const handleBulkPost = () => {
    if (bulkPostedMonth === currentMonthPeriod) {
      showToast('Jurnal massal untuk bulan ini sudah pernah dijalankan.');
      return;
    }

    const dueItems = items.filter((it) => {
      const status = deriveItemStatus(it);
      return status === 'Berjalan' && (it.postings?.length || 0) < it.usefulLifeMonths;
    });

    if (dueItems.length === 0) {
      showToast('Tidak ada periode amortisasi yang perlu dijurnal bulan ini.');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Jurnalkan Semua Periode Bulan Ini?',
      message: `${dueItems.length} periode amortisasi akan diposting sekaligus untuk bulan ${currentMonthPeriod}. Aksi ini hanya dapat dijalankan satu kali per bulan kalender.`,
      action: async () => {
        try {
          let count = 0;
          for (const item of dueItems) {
            const nextMonthNum = (item.postings?.length || 0) + 1;
            const period = addMonthsToPeriod(item.startDate, nextMonthNum - 1);

            if (isPeriodClosed(period, closedPeriods)) continue;

            const monthlyAmountNTD = Math.round(item.nilaiPerolehanNTD / item.usefulLifeMonths);
            const journalId = `JRN_AM_POST_${item.id}_M${nextMonthNum}`;
            const journalDesc = `${item.docCode}\nAmortisasi Bulanan - Periode ${period}`;

            const prepaidAcc = coaAccounts.find((a) => a.code === item.prepaidAccountCode) || { code: item.prepaidAccountCode, name: 'Biaya Dibayar Dimuka' };
            const expenseAcc = coaAccounts.find((a) => a.code === item.expenseAccountCode) || { code: item.expenseAccountCode, name: 'Beban Amortisasi' };

            const journalData: JournalEntry = {
              id: journalId,
              date: Timestamp.fromDate(new Date(`${period}-28T12:00:00`)),
              description: journalDesc,
              refType: 'amortization_monthly',
              refId: `${item.docCode}_${period}`,
              lines: [
                { account: expenseAcc.name, accountCode: expenseAcc.code, debit: monthlyAmountNTD, credit: 0 },
                { account: prepaidAcc.name, accountCode: prepaidAcc.code, debit: 0, credit: monthlyAmountNTD }
              ],
              createdAt: Timestamp.now()
            };

            const newPosting: AmortizationPosting = {
              period,
              monthNumber: nextMonthNum,
              amountNTD: monthlyAmountNTD,
              journalId,
              postedAt: Timestamp.now()
            };

            const updatedPostings = [...(item.postings || []), newPosting].sort((a, b) => a.monthNumber - b.monthNumber);
            const updatedStatus = updatedPostings.length >= item.usefulLifeMonths ? 'Selesai' : 'Berjalan';

            await runTransaction(db, async (tx) => {
              tx.set(doc(db, 'journalEntries', journalId), journalData);
              tx.update(doc(db, 'amortizations', item.id), {
                postings: updatedPostings,
                status: updatedStatus
              });
            });

            count++;
          }

          setBulkPostedMonth(currentMonthPeriod);
          showToast(`${count} periode amortisasi berhasil diposting sekaligus.`);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'amortizations');
          showToast('Gagal menjalankan jurnalkan massal.');
        }
      }
    });
  };

  // Handle Delete Item
  const handleDeleteItem = (item: AmortizationItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Item Amortisasi?',
      message: `Apakah Anda yakin ingin menghapus item "${item.name}" (${item.docCode})? Semua entri jurnal terkait perolehan dan amortisasi bulanan akan dihapus permanen.`,
      action: async () => {
        try {
          await runTransaction(db, async (tx) => {
            if (item.acquisitionJournalId) {
              tx.delete(doc(db, 'journalEntries', item.acquisitionJournalId));
              tx.delete(doc(db, 'journals', item.acquisitionJournalId));
            }
            if (item.postings && item.postings.length > 0) {
              item.postings.forEach((p) => {
                if (p.journalId) {
                  tx.delete(doc(db, 'journalEntries', p.journalId));
                  tx.delete(doc(db, 'journals', p.journalId));
                }
              });
            }
            tx.delete(doc(db, 'amortizations', item.id));
          });

          if (selectedId === item.id) setSelectedId(null);
          showToast(`Item ${item.docCode} berhasil dihapus.`);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'amortizations');
          showToast('Gagal menghapus item amortisasi.');
        }
      }
    });
  };

  // Sparkline Chart SVG generator
  const renderSparkline = (item: AmortizationItem) => {
    const useful = item.usefulLifeMonths || 1;
    const monthlyAmount = item.nilaiPerolehanNTD / useful;
    const values: number[] = [item.nilaiPerolehanNTD];

    for (let i = 1; i <= useful; i++) {
      values.push(Math.max(0, item.nilaiPerolehanNTD - monthlyAmount * i));
    }

    const w = 260;
    const h = 54;
    const pad = 4;
    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values);
    const range = maxVal - minVal || 1;
    const step = (w - pad * 2) / (values.length - 1);

    const points = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - minVal) / range) * (h - pad * 2);
      return [x, y];
    });

    const linePath = points.map((p) => p.join(',')).join(' ');
    const areaPath = `${pad},${h - pad} ${linePath} ${w - pad},${h - pad}`;

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <polygon points={areaPath} fill="rgba(181,98,46,0.12)" />
        <polyline points={linePath} fill="none" stroke="#B5622E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Progress Ring SVG renderer
  const renderProgressRing = (pct: number) => {
    const isDone = pct >= 100;
    const r = 19;
    const c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);

    return (
      <div className="relative w-12 h-12 shrink-0">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle
            className={isDone ? 'stroke-emerald-100 dark:stroke-emerald-950/40' : 'stroke-neutral-200 dark:stroke-neutral-800'}
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="3.5"
          />
          <circle
            className={`transition-all duration-500 ${isDone ? 'stroke-emerald-600 dark:stroke-emerald-400' : 'stroke-[#B5622E]'}`}
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="3.5"
            strokeDasharray={c}
            strokeDashoffset={off}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-bold text-[11px] font-mono text-neutral-600 dark:text-neutral-300">
          {isDone ? (
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
          ) : (
            `${pct}%`
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <div className="w-8 h-8 border-4 border-[#B5622E] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-medium text-neutral-500">Memuat Modul Amortisasi...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto space-y-6 pb-16 select-text">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#B5622E]/10 text-[#B5622E] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Amortisasi Aset Tak Berwujud &amp; Prabayar
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Jadwal amortisasi biaya dibayar dimuka, lisensi, dan aset tak berwujud lainnya.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleBulkPost}
            disabled={bulkPostedMonth === currentMonthPeriod}
            className={`h-11 px-5 rounded-xl text-xs font-semibold border flex items-center gap-2 transition cursor-pointer ${
              bulkPostedMonth === currentMonthPeriod
                ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400 border-neutral-200 dark:border-neutral-800 cursor-not-allowed opacity-60'
                : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:border-[#B5622E] hover:text-[#B5622E]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {bulkPostedMonth === currentMonthPeriod ? 'Sudah Dijurnalkan Bulan Ini' : 'Jurnalkan Semua Periode Bulan Ini'}
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="h-11 px-5 rounded-xl text-xs font-bold bg-[#B5622E] hover:bg-[#9e5425] text-white flex items-center gap-2 transition shadow-md shadow-[#B5622E]/20 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.4]" />
            Tambah Amortisasi
          </button>
        </div>
      </div>

      {/* 2. SUCCESS BANNER */}
      {bannerMessage && (
        <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl p-4 text-xs font-medium animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{bannerMessage}</span>
          </div>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
            Total Nilai Perolehan
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-neutral-900 dark:text-white mb-1">
            {formatNTD(totalNilaiPerolehan)}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Akumulasi seluruh item amortisasi aktif
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
            Total Akumulasi Amortisasi
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-rose-600 dark:text-rose-400 mb-1">
            {formatNTD(totalAkumulasiAmortisasi)}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Beban yang telah dijurnalkan hingga kini
          </div>
        </div>
      </div>

      {/* 4. SUMMARY STRIP */}
      <div className="flex items-center gap-3.5 bg-neutral-100/80 dark:bg-neutral-900/60 border border-neutral-200/70 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs text-neutral-600 dark:text-neutral-300 flex-wrap">
        <span className="w-2 h-2 rounded-full bg-[#B5622E] shrink-0"></span>
        <span>
          <b className="font-mono text-neutral-900 dark:text-white mr-1">{dueCount}</b>
          periode siap dijurnal bulan ini
        </span>
        <div className="flex-1 min-w-[120px] h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#B5622E] to-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          ></div>
        </div>
        <span>
          <b className="font-mono text-neutral-900 dark:text-white mr-1">{progressPct}%</b>
          dari total masa amortisasi terjurnal
        </span>
      </div>

      {/* 5. FILTER BAR */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] flex items-center gap-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3.5 h-11">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama item atau No. Doc…"
            className="w-full text-xs font-medium bg-transparent border-none outline-none text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
          />
        </div>

        <select
          value={activeStatusFilter}
          onChange={(e: any) => setActiveStatusFilter(e.target.value)}
          className="h-11 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-medium text-neutral-800 dark:text-neutral-100 outline-none cursor-pointer"
        >
          <option value="all">Semua Status</option>
          <option value="Berjalan">Berjalan</option>
          <option value="Selesai">Selesai</option>
          <option value="Belum Dimulai">Belum Dimulai</option>
        </select>
      </div>

      {/* 6. SPLIT PANEL (2 KOLOM) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* TABEL ITEM AMORTISASI (LEFT - 7 COLS) */}
        <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/80 dark:border-neutral-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Daftar Item Amortisasi
            </h3>
            <span className="text-[11px] font-bold font-mono px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
              {filteredItems.length} Item
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200/80 dark:border-neutral-800 text-[10.5px] font-bold uppercase tracking-wider text-neutral-400">
                  <th className="py-3 px-4">No. Doc</th>
                  <th className="py-3 px-4">Nama Item</th>
                  <th className="py-3 px-4">Nilai Perolehan</th>
                  <th className="py-3 px-4">Progres</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60 text-xs">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-400">
                      Tidak ada item amortisasi yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it) => {
                    const status = deriveItemStatus(it);
                    const postedCount = it.postings?.length || 0;
                    const pct = Math.round((postedCount / it.usefulLifeMonths) * 100);
                    const isSelected = it.id === selectedId;

                    return (
                      <tr
                        key={it.id}
                        onClick={() => setSelectedId(it.id)}
                        className={`cursor-pointer transition hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 ${
                          isSelected ? 'bg-[#B5622E]/5 dark:bg-[#B5622E]/10' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                          {it.docCode}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-neutral-900 dark:text-white line-clamp-1">
                            {it.name}
                          </div>
                          <div className="text-[11px] font-mono text-neutral-400 mt-0.5">
                            {postedCount}/{it.usefulLifeMonths} bulan
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-neutral-900 dark:text-white">
                            {formatNTD(it.nilaiPerolehanNTD)}
                          </div>
                          {it.currency === 'IDR' && (
                            <div className="text-[10px] text-neutral-400">
                              Rp {it.nilaiPerolehanRaw?.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">{renderProgressRing(pct)}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10.5px] font-bold ${
                              status === 'Selesai'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : status === 'Berjalan'
                                ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                                : 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteItem(it)}
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                            title="Hapus Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAIL & JADWAL AMORTISASI (RIGHT - 5 COLS) */}
        <div className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-neutral-200/80 dark:border-neutral-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Jadwal Amortisasi
            </h3>
          </div>

          {!selectedItem ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-400 space-y-3">
              <div className="w-14 h-14 rounded-full border-2 border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center">
                <FileText className="w-6 h-6 stroke-[1.5]" />
              </div>
              <p className="text-xs max-w-[260px] leading-relaxed">
                Silakan pilih salah satu item amortisasi di samping untuk melihat jadwal bulanan dan memposting jurnal.
              </p>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Item Overview */}
              <div>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                  {selectedItem.docCode} — {selectedItem.name}
                </h4>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {selectedItem.usefulLifeMonths} Bulan · Metode Garis Lurus
                </p>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-3 bg-neutral-50 dark:bg-neutral-800/50 p-3.5 rounded-xl text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Tanggal Perolehan</div>
                  <div className="font-mono font-medium text-neutral-800 dark:text-neutral-200 mt-0.5">{selectedItem.acquisitionDate}</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Mulai Amortisasi</div>
                  <div className="font-mono font-medium text-neutral-800 dark:text-neutral-200 mt-0.5">{selectedItem.startDate}</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Dibayar Via</div>
                  <div className="font-mono font-medium text-violet-600 dark:text-violet-400 mt-0.5">
                    {coaAccounts.find((a) => a.code === selectedItem.paidViaAccountCode)?.name || selectedItem.paidViaAccountCode}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Akun Prabayar</div>
                  <div className="font-mono font-medium text-violet-600 dark:text-violet-400 mt-0.5">
                    {coaAccounts.find((a) => a.code === selectedItem.prepaidAccountCode)?.name || selectedItem.prepaidAccountCode}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Akun Beban</div>
                  <div className="font-mono font-medium text-violet-600 dark:text-violet-400 mt-0.5">
                    {coaAccounts.find((a) => a.code === selectedItem.expenseAccountCode)?.name || selectedItem.expenseAccountCode}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Terjurnal</div>
                  <div className="font-mono font-medium text-neutral-800 dark:text-neutral-200 mt-0.5">
                    {selectedItem.postings?.length || 0}/{selectedItem.usefulLifeMonths} bulan
                  </div>
                </div>
              </div>

              {/* Sparkline Chart */}
              <div className="bg-neutral-50 dark:bg-neutral-800/40 p-3.5 rounded-xl border border-neutral-200/60 dark:border-neutral-800 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Tren Nilai Buku</div>
                <div className="flex justify-center">{renderSparkline(selectedItem)}</div>
              </div>

              {/* Monthly Schedule Cards */}
              <div className="space-y-3">
                {Array.from({ length: selectedItem.usefulLifeMonths }, (_, idx) => {
                  const monthNum = idx + 1;
                  const period = addMonthsToPeriod(selectedItem.startDate, idx);
                  const posting = selectedItem.postings?.find((p) => p.monthNumber === monthNum);
                  const isPosted = !!posting;
                  const monthlyVal = selectedItem.nilaiPerolehanNTD / selectedItem.usefulLifeMonths;
                  const bookValAfter = Math.max(0, selectedItem.nilaiPerolehanNTD - monthlyVal * monthNum);

                  return (
                    <div
                      key={monthNum}
                      className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                        isPosted
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-white dark:bg-neutral-900 border-neutral-200/80 dark:border-neutral-800'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-900 dark:text-white">Bulan {monthNum}</span>
                          <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10.5px] font-mono text-neutral-500">
                            {period}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-[11px]">
                          <div>
                            <span className="text-neutral-400 mr-1">Beban:</span>
                            <b className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                              {formatNTD(monthlyVal)}
                            </b>
                          </div>
                          <div>
                            <span className="text-neutral-400 mr-1">Nilai Buku:</span>
                            <b className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                              {formatNTD(bookValAfter)}
                            </b>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isPosted ? (
                          <>
                            <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Terjurnal
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  const prepaidName = coaAccounts.find((a) => a.code === selectedItem.prepaidAccountCode)?.name || selectedItem.prepaidAccountCode;
                                  const expenseName = coaAccounts.find((a) => a.code === selectedItem.expenseAccountCode)?.name || selectedItem.expenseAccountCode;
                                  setViewJournal({
                                    isOpen: true,
                                    title: `Jurnal Amortisasi Bulan ${monthNum} (${period})`,
                                    lines: [
                                      { account: `${selectedItem.expenseAccountCode} - ${expenseName}`, debit: monthlyVal, credit: 0 },
                                      { account: `${selectedItem.prepaidAccountCode} - ${prepaidName}`, debit: 0, credit: monthlyVal }
                                    ]
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:border-[#B5622E] hover:text-[#B5622E] cursor-pointer"
                              >
                                Lihat Jurnal
                              </button>
                              <button
                                onClick={() => handleReversePosting(selectedItem, monthNum)}
                                className="p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-rose-600 hover:border-rose-300 cursor-pointer"
                                title="Batalkan Jurnal"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            onClick={() => handlePostMonthly(selectedItem, monthNum)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#B5622E] hover:bg-[#9e5425] text-white transition shadow-xs cursor-pointer"
                          >
                            Post Amortisasi
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: REGISTRASI AMORTISASI BARU */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-sm font-bold flex items-center gap-2 text-neutral-900 dark:text-white">
                <FileText className="w-4 h-4 text-[#B5622E]" />
                Registrasi Amortisasi Baru
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-medium">
                  {formError}
                </div>
              )}

              {/* Nama Item */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Nama Item
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Sewa Gudang Dibayar Dimuka (Jul–Des 2026)"
                  className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs outline-none focus:border-[#B5622E]"
                />
              </div>

              {/* Nilai Perolehan & Masa Manfaat */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Nilai Perolehan
                  </label>
                  <input
                    type="text"
                    value={formNilai}
                    onChange={handleNilaiChange}
                    placeholder="60,000"
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono outline-none focus:border-[#B5622E]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Masa Manfaat
                  </label>
                  <select
                    value={formMasa}
                    onChange={(e) => setFormMasa(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs outline-none focus:border-[#B5622E] cursor-pointer"
                  >
                    <option value="3">3 Bulan</option>
                    <option value="6">6 Bulan</option>
                    <option value="12">12 Bulan (1 Tahun)</option>
                    <option value="24">24 Bulan (2 Tahun)</option>
                    <option value="36">36 Bulan (3 Tahun)</option>
                  </select>
                </div>
              </div>

              {/* Tanggal Perolehan & Mulai Amortisasi */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Tanggal Perolehan
                  </label>
                  <input
                    type="date"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono outline-none focus:border-[#B5622E]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Mulai Amortisasi
                  </label>
                  <input
                    type="date"
                    value={formMulai}
                    onChange={(e) => setFormMulai(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono outline-none focus:border-[#B5622E]"
                  />
                </div>
              </div>

              {/* Dibayar Via & FX Rate if IDR */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Dibayar Via
                  </label>
                  <select
                    value={formBayarVia}
                    onChange={(e) => {
                      const code = e.target.value;
                      setFormBayarVia(code);
                      if (code === (coaAccounts.find(a => a.systemKey === 'cash_idr')?.code || '1102')) setFormCurrency('IDR');
                      else setFormCurrency('NTD');
                    }}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs outline-none focus:border-[#B5622E] cursor-pointer"
                  >
                    {cashAccounts.length > 0 ? (
                      cashAccounts.map((a, idx) => (
                        <option key={`${a.id || a.code}-${idx}`} value={a.code}>
                          {a.code} – {a.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="1101">1101 – Cash: NTD</option>
                        <option value="1102">1102 – Cash Rupiah</option>
                      </>
                    )}
                  </select>
                </div>

                {formCurrency === 'IDR' ? (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                      Kurs IDR → NTD
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={formFxRate}
                      className="w-full h-11 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800/80 text-xs font-mono text-neutral-500 cursor-not-allowed outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                      Mata Uang
                    </label>
                    <input
                      type="text"
                      disabled
                      value="NTD (New Taiwan Dollar)"
                      className="w-full h-11 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-500"
                    />
                  </div>
                )}
              </div>

              {/* Accounts Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Akun Biaya Dibayar Dimuka
                  </label>
                  <select
                    value={formPrepaidAccount}
                    onChange={(e) => setFormPrepaidAccount(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs outline-none focus:border-[#B5622E] cursor-pointer"
                  >
                    {prepaidAccounts.length > 0 ? (
                      prepaidAccounts.map((a, idx) => (
                        <option key={`${a.id || a.code}-${idx}`} value={a.code}>
                          {a.code} – {a.name}
                        </option>
                      ))
                    ) : (
                      <option value="1400">1400 – Biaya Dibayar Dimuka</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Akun Beban Amortisasi
                  </label>
                  <select
                    value={formExpenseAccount}
                    onChange={(e) => setFormExpenseAccount(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs outline-none focus:border-[#B5622E] cursor-pointer"
                  >
                    {expenseAccounts.length > 0 ? (
                      expenseAccounts.map((a, idx) => (
                        <option key={`${a.id || a.code}-${idx}`} value={a.code}>
                          {a.code} – {a.name}
                        </option>
                      ))
                    ) : (
                      <option value="5240">5240 – Beban Amortisasi</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Catatan / Deskripsi */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Catatan / Deskripsi
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  placeholder="Masukkan rincian periode, vendor, atau referensi kontrak…"
                  className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs outline-none focus:border-[#B5622E] resize-y"
                />
              </div>

              {/* Card Hasil Konversi */}
              <div className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#B5622E] dark:text-amber-400 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-[#B5622E] dark:text-amber-400" />
                    Hasil Konversi
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/40 text-[#B5622E] dark:text-amber-300">
                    {formCurrency}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Nominal Input</div>
                    <div className="font-mono font-bold text-neutral-900 dark:text-white mt-0.5">
                      {formCurrency === 'IDR' ? `Rp ${formNilai || '0'}` : `NT$ ${formNilai || '0'}`}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Kurs IDR → NTD</div>
                    <div className="font-mono font-bold text-neutral-900 dark:text-white mt-0.5">
                      {formCurrency === 'IDR' ? `${formFxRate}` : '1.00 (NTD)'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Total Nilai Perolehan (NTD)</div>
                    <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">
                      {formatNTD(
                        formCurrency === 'IDR'
                          ? Math.round(parseFloat((formNilai || '0').replace(/,/g, '')) * parseFloat(formFxRate || '0') * 100)
                          : Math.round(parseFloat((formNilai || '0').replace(/,/g, '')) * 100)
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Beban Amortisasi / Bulan</div>
                    <div className="font-mono font-bold text-[#B5622E] dark:text-amber-400 text-sm mt-0.5">
                      {formatNTD(
                        Math.round(
                          (formCurrency === 'IDR'
                            ? Math.round(parseFloat((formNilai || '0').replace(/,/g, '')) * parseFloat(formFxRate || '0') * 100)
                            : Math.round(parseFloat((formNilai || '0').replace(/,/g, '')) * 100)) / (parseInt(formMasa, 10) || 1)
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-neutral-200 dark:border-neutral-800">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveAmortization}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#B5622E] hover:bg-[#9e5425] text-white cursor-pointer"
              >
                Simpan Amortisasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REUSABLE CONFIRM MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              {confirmModal.title}
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  const act = confirmModal.action;
                  setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  if (act) await act();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B5622E] hover:bg-[#9e5425] text-white cursor-pointer"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW JOURNAL MODAL */}
      {viewJournal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="text-xs font-bold text-neutral-900 dark:text-white">{viewJournal.title}</h3>
              <button
                onClick={() => setViewJournal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {viewJournal.lines.map((line, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">{line.account}</div>
                  <div className="font-mono text-right">
                    {line.debit > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold">Dr {formatNTD(line.debit)}</span>}
                    {line.credit > 0 && <span className="text-rose-600 dark:text-rose-400 font-bold">Cr {formatNTD(line.credit)}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewJournal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-bounce">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
