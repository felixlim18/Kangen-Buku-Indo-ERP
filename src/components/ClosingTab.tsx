import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  writeBatch, 
  Timestamp,
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { useAuth } from '../lib/auth-context';
import { 
  Lock, 
  Unlock, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  Info,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  FileSpreadsheet,
  AlertTriangle,
  ClipboardCheck,
  Building,
  UserCheck
} from 'lucide-react';
import { 
  getYearMonth, 
  parseToDate, 
  formatPeriodName, 
  calculateFxRevaluations, 
  fetchCurrentExchangeRate, 
  PeriodClosing 
} from '../lib/period-closing-utils';
import { handleFirestoreError, OperationType } from '../lib/firebase';

export const ClosingTab: React.FC = () => {
  const { user, profile } = useAuth();
  
  // States
  const [journals, setJournals] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [closings, setClosings] = useState<PeriodClosing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exchangeRate, setExchangeRate] = useState<number>(500);
  const [fetchingRate, setFetchingRate] = useState<boolean>(false);
  
  // Interactive Closing Modal states
  const [selectedPeriod, setSelectedPeriod] = useState<{ id: string; name: string } | null>(null);
  const [closingStep, setClosingStep] = useState<'balance' | 'revalue' | 'summary'>('balance');
  const [isClosingInProgress, setIsClosingInProgress] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  // FX calculation results
  const [revals, setRevals] = useState<any[]>([]);
  const [balanceValidation, setBalanceValidation] = useState<{
    isValid: boolean;
    totalDebit: number;
    totalCredit: number;
    unbalancedList: any[];
  }>({ isValid: true, totalDebit: 0, totalCredit: 0, unbalancedList: [] });

  // Reopen Modal states
  const [periodToReopen, setPeriodToReopen] = useState<PeriodClosing | null>(null);
  const [reopenConfirmText, setReopenConfirmText] = useState<string>('');
  const [reopenUnderstand, setReopenUnderstand] = useState<boolean>(false);
  const [reopenError, setReopenError] = useState<string>('');

  const isUserOwner = profile?.role === 'owner';

  // Subscriptions
  useEffect(() => {
    // Live rate fetch
    const getRate = async () => {
      setFetchingRate(true);
      const rate = await fetchCurrentExchangeRate();
      setExchangeRate(rate);
      setFetchingRate(false);
    };
    getRate();

    const unsubJournals = onSnapshot(collection(db, 'journalEntries'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setJournals(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'journalEntries');
    });

    const unsubAccounts = onSnapshot(collection(db, 'coa'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setAccounts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'coa');
    });

    const unsubClosings = onSnapshot(collection(db, 'periodClosings'), (snap) => {
      const list: PeriodClosing[] = [];
      const closedList: string[] = [];
      snap.forEach(d => {
        const item = d.data() as PeriodClosing;
        list.push({ id: d.id, ...item });
        if (item.status === 'Ditutup') {
          closedList.push(d.id);
        }
      });
      localStorage.setItem('closed_periods', JSON.stringify(closedList));
      setClosings(list);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'periodClosings');
    });

    return () => {
      unsubJournals();
      unsubAccounts();
      unsubClosings();
    };
  }, []);

  // Generate Periods based on earliest journal entry to current month (June 2026)
  const currentMonthDate = new Date(2026, 5, 27); // June 2026
  let earliestDate = new Date(2026, 4, 1); // fallback to May 2026
  
  if (journals.length > 0) {
    const dates = journals.map(j => parseToDate(j.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    if (!isNaN(minDate.getTime())) {
      earliestDate = minDate;
    }
  }

  const periodsList: { id: string; name: string; totalEntries: number; status: 'Terbuka' | 'Ditutup'; closingData?: PeriodClosing }[] = [];
  let runner = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
  const limitDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);

  while (runner < limitDate) {
    const yyyy = runner.getFullYear();
    const mm = String(runner.getMonth() + 1).padStart(2, '0');
    const id = `${yyyy}-${mm}`;
    
    // Total journal entries in this month
    const entriesInMonth = journals.filter(j => getYearMonth(j.date) === id);
    const closingRecord = closings.find(c => c.id === id);
    const status = closingRecord ? closingRecord.status : 'Terbuka';

    periodsList.push({
      id,
      name: formatPeriodName(id),
      totalEntries: entriesInMonth.length,
      status,
      closingData: closingRecord
    });
    runner.setMonth(runner.getMonth() + 1);
  }

  // Reverse chronological
  periodsList.reverse();

  // Validate balance helper for the selected period
  const validatePeriodBalance = (periodId: string) => {
    const monthEntries = journals.filter(j => getYearMonth(j.date) === periodId);
    let totalDebit = 0;
    let totalCredit = 0;
    const unbalancedList: any[] = [];

    monthEntries.forEach(entry => {
      const entryDebit = entry.lines?.reduce((sum: number, line: any) => sum + (line.debit || 0), 0) || 0;
      const entryCredit = entry.lines?.reduce((sum: number, line: any) => sum + (line.credit || 0), 0) || 0;
      
      totalDebit += entryDebit;
      totalCredit += entryCredit;

      if (Math.abs(entryDebit - entryCredit) > 0.01) {
        unbalancedList.push({
          id: entry.id,
          description: entry.description,
          debit: entryDebit / 100,
          credit: entryCredit / 100
        });
      }
    });

    const isValid = unbalancedList.length === 0;
    setBalanceValidation({
      isValid,
      totalDebit: totalDebit / 100,
      totalCredit: totalCredit / 100,
      unbalancedList
    });

    return isValid;
  };

  // Trigger Closing Process Dialog
  const handleStartClosing = async (period: { id: string; name: string }) => {
    setErrorMessage('');
    setSuccessMessage('');
    setSelectedPeriod(period);
    setClosingStep('balance');
    
    // Step 1 validation
    validatePeriodBalance(period.id);

    // Calculate FX simulations upfront
    setFetchingRate(true);
    const rate = await fetchCurrentExchangeRate();
    setExchangeRate(rate);
    setFetchingRate(false);

    const calculatedRevals = calculateFxRevaluations(journals, rate, period.id);
    setRevals(calculatedRevals);
  };

  // Perform Final Closing
  const handleConfirmClosing = async () => {
    if (!selectedPeriod) return;
    setIsClosingInProgress(true);
    setErrorMessage('');

    try {
      const batch = writeBatch(db);

      // 1. Ensure "Laba/Rugi Selisih Kurs" COA account exists (code: 4201)
      const coaExists = accounts.some(a => a.code === '4201' || a.name === 'Laba/Rugi Selisih Kurs');
      if (!coaExists) {
        const coaRef = doc(collection(db, 'coa'), 'COA-4201');
        batch.set(coaRef, {
          id: 'COA-4201',
          code: '4201',
          name: 'Laba/Rugi Selisih Kurs',
          type: 'Revenue',
          subType: 'Pendapatan Lainnya',
          isActive: true,
          createdAt: Timestamp.now(),
          balance: 0
        });
      }

      // 2. Build FX Revaluation Journal Entry lines
      const journalLines: any[] = [];
      let totalDebitAdjust = 0;
      let totalCreditAdjust = 0;

      revals.forEach(adj => {
        if (adj.adjustmentCents > 0) {
          journalLines.push({
            account: adj.account,
            accountCode: adj.accountCode || '',
            debit: adj.adjustmentCents,
            credit: 0
          });
          totalDebitAdjust += adj.adjustmentCents;
        } else if (adj.adjustmentCents < 0) {
          journalLines.push({
            account: adj.account,
            accountCode: adj.accountCode || '',
            debit: 0,
            credit: Math.abs(adj.adjustmentCents)
          });
          totalCreditAdjust += Math.abs(adj.adjustmentCents);
        }
      });

      const tglClosingIso = selectedPeriod.period + '-28';
      const fxJournalId = await getNextJournalId(tglClosingIso);
      let hasFxEntry = false;

      if (journalLines.length > 0) {
        hasFxEntry = true;
        const offsetCents = totalDebitAdjust - totalCreditAdjust;
        if (offsetCents !== 0) {
          journalLines.push({
            account: 'Laba/Rugi Selisih Kurs',
            accountCode: '4201',
            debit: offsetCents < 0 ? Math.abs(offsetCents) : 0,
            credit: offsetCents > 0 ? offsetCents : 0
          });
        }

        // Target Date: Last Day of the Selected Period (e.g. 2026-06-30)
        const [year, month] = selectedPeriod.id.split('-');
        const lastDayOfPeriod = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
        const dateTimestamp = Timestamp.fromDate(lastDayOfPeriod);

        // Write the FX Journal
        const journalRef = doc(db, 'journalEntries', fxJournalId);
        batch.set(journalRef, {
          id: fxJournalId,
          date: dateTimestamp,
          description: `Revaluasi Selisih Kurs - Penutupan Periode ${selectedPeriod.name}`,
          refType: 'System',
          refId: 'Revaluation',
          isFxRevaluation: true,
          lines: journalLines,
          createdAt: Timestamp.now()
        });
      }

      // 3. Write Period Closing document
      const closingRef = doc(db, 'periodClosings', selectedPeriod.id);
      const closingPayload: PeriodClosing = {
        id: selectedPeriod.id,
        period: selectedPeriod.name,
        status: 'Ditutup',
        totalEntries: journals.filter(j => getYearMonth(j.date) === selectedPeriod.id).length,
        closedAt: Timestamp.now(),
        closedBy: profile?.email || user?.email || 'anonymous',
        fxJournalId: hasFxEntry ? fxJournalId : undefined
      };

      batch.set(closingRef, closingPayload);

      // Commit Batch atomically
      await batch.commit();

      setSuccessMessage(`Periode ${selectedPeriod.name} berhasil ditutup dan buku dikunci!`);
      setTimeout(() => {
        setSelectedPeriod(null);
      }, 1500);

    } catch (err: any) {
      console.error('Error closing period:', err);
      setErrorMessage(err.message || 'Gagal menyimpan data penutupan periode.');
    } finally {
      setIsClosingInProgress(false);
    }
  };

  // Perform Reopening Period (Owner Only)
  const handleConfirmReopen = async () => {
    if (!periodToReopen) return;
    if (reopenConfirmText.trim() !== periodToReopen.period) {
      setReopenError(`Harap ketik "${periodToReopen.period}" untuk konfirmasi.`);
      return;
    }
    if (!reopenUnderstand) {
      setReopenError('Anda harus menyetujui konsekuensi reopening.');
      return;
    }

    setIsClosingInProgress(true);
    setReopenError('');

    try {
      const batch = writeBatch(db);

      // Delete the related FX journal entry if it exists
      if (periodToReopen.fxJournalId) {
        const fxRef = doc(db, 'journalEntries', periodToReopen.fxJournalId);
        batch.delete(fxRef);
      }

      // Delete the closing document itself (so status returns to Open)
      const closingRef = doc(db, 'periodClosings', periodToReopen.id);
      batch.delete(closingRef);

      await batch.commit();

      setSuccessMessage(`Periode ${periodToReopen.period} berhasil dibuka kembali!`);
      setTimeout(() => {
        setPeriodToReopen(null);
        setReopenConfirmText('');
        setReopenUnderstand(false);
      }, 1500);

    } catch (err: any) {
      console.error('Error reopening period:', err);
      setReopenError(err.message || 'Gagal membuka kembali periode buku.');
    } finally {
      setIsClosingInProgress(false);
    }
  };

  // Formatter for NT$ base currency
  const formatNtd = (cents: number) => {
    const amount = cents / 100;
    return `NT$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Formatter for IDR Rupiah
  const formatIdr = (amount: number) => {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  };

  return (
    <div className="space-y-6 select-text max-w-7xl mx-auto pb-12">
      {/* Banner / Intro Header */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-teal-50 dark:bg-teal-950/25 border border-teal-200/50 dark:border-teal-900/35 rounded-full text-[10px] uppercase font-bold text-teal-650 dark:text-teal-400">
            <ClipboardCheck className="h-3 w-3" />
            Audit & Compliance Control
          </div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">TUTUP PERIODE BUKU</h1>
          <p className="text-xs text-neutral-500 max-w-xl leading-relaxed">
            Kunci entri jurnal bulanan secara permanen untuk mematuhi integritas audit audit-ready. Sistem akan mendeteksi selisih kurs transaksi Rupiah (IDR) secara otomatis dan memposting jurnal penyesuaian Laba/Rugi Selisih Kurs ke dalam base ledger (NT$).
          </p>
        </div>
        <div className="flex items-center gap-4 border border-neutral-150 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 p-4 rounded-2xl relative z-10">
          <div className="p-3 bg-teal-500/10 text-teal-600 rounded-xl">
            <RefreshCw className={`h-5 w-5 ${fetchingRate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <span className="text-[10px] text-neutral-400 font-bold uppercase block tracking-wider">KURS REVALUASI SAAT INI</span>
            <span className="text-sm font-black text-neutral-800 dark:text-neutral-100">1 NTD = {formatIdr(exchangeRate)}</span>
          </div>
        </div>
      </div>

      {/* Main Closing Periods Grid/Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/85 dark:border-neutral-850 rounded-3xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-neutral-150 dark:border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-white uppercase tracking-wider">DAFTAR PERIODE BUKU BULANAN</h3>
          <span className="text-[10px] text-neutral-400 font-numeric">Earliest Journal: {earliestDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-teal-500 mx-auto" />
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">SINKRONISASI BUKU LEDGER...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/70 dark:bg-neutral-950/40 text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest border-b border-neutral-100 dark:border-neutral-850">
                  <th className="py-4 px-6">PERIODE BUKU</th>
                  <th className="py-4 px-6 text-center">TOTAL ENTRI JURNAL</th>
                  <th className="py-4 px-6">STATUS PERIODE</th>
                  <th className="py-4 px-6">PENUTUPAN METADATA</th>
                  <th className="py-4 px-6 text-right">AKSI KONTROL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-850 text-xs">
                {periodsList.map((period) => {
                  const isClosed = period.status === 'Ditutup';
                  return (
                    <tr 
                      key={period.id} 
                      className={`hover:bg-neutral-50/20 dark:hover:bg-neutral-850/10 transition-colors ${
                        isClosed ? 'bg-neutral-50/5 dark:bg-neutral-950/5' : ''
                      }`}
                    >
                      <td className="py-4.5 px-6 font-extrabold text-neutral-850 dark:text-neutral-200">
                        {period.name}
                      </td>
                      <td className="py-4.5 px-6 text-center font-numeric font-bold text-neutral-500 dark:text-neutral-400">
                        {period.totalEntries} entries
                      </td>
                      <td className="py-4.5 px-6">
                        {isClosed ? (
                          <span className="inline-flex items-center gap-1 py-1 px-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-extrabold text-[10px] uppercase rounded-full tracking-wider border border-neutral-200 dark:border-neutral-700">
                            <Lock className="h-3 w-3" />
                            DITUTUP &amp; KUNCI
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 py-1 px-2.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] uppercase rounded-full tracking-wider border border-emerald-250 dark:border-emerald-900/30">
                            <Unlock className="h-3 w-3" />
                            TERBUKA
                          </span>
                        )}
                      </td>
                      <td className="py-4.5 px-6 text-neutral-500 dark:text-neutral-400">
                        {isClosed && period.closingData ? (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-extrabold block text-neutral-600 dark:text-neutral-300">
                              Oleh: {period.closingData.closedBy}
                            </span>
                            <span className="text-[9px] font-numeric font-medium block text-neutral-400">
                              {new Date(period.closingData.closedAt?.seconds * 1000).toLocaleString('id-ID')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-neutral-400 italic">Belum ditutup</span>
                        )}
                      </td>
                      <td className="py-4.5 px-6 text-right">
                        {isClosed ? (
                          <button
                            onClick={() => {
                              setReopenError('');
                              setPeriodToReopen(period.closingData || null);
                            }}
                            className={`py-1.5 px-3 rounded-xl border text-[10px] font-bold tracking-wider uppercase transition flex items-center gap-1 inline-flex ${
                              isUserOwner 
                                ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-600 dark:bg-amber-950/10 dark:hover:bg-amber-950/25 dark:border-amber-900/30' 
                                : 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-800 dark:border-neutral-700'
                            }`}
                            title={!isUserOwner ? 'Aksi Buka Kembali membutuhkan otoritas level Owner.' : 'Buka kembali buku bulanan'}
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            BUKA KEMBALI
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartClosing(period)}
                            className="py-1.5 px-3 bg-teal-500 hover:bg-teal-600 text-white font-bold text-[10px] tracking-wider uppercase rounded-xl transition flex items-center gap-1 inline-flex"
                          >
                            TUTUP PERIODE
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TUTUP PERIODE INTERACTIVE WIZARD MODAL */}
      {selectedPeriod && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-850 w-full max-w-2xl rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="space-y-1">
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-extrabold uppercase tracking-widest block">STEPS PENUTUPAN BUKU</span>
              <h2 className="text-xl font-black text-neutral-900 dark:text-white uppercase">TUTUP PERIODE: {selectedPeriod.name}</h2>
            </div>

            {/* Steps indicator */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { step: 'balance', label: '1. Validasi Buku' },
                { step: 'revalue', label: '2. Revaluasi Kurs' },
                { step: 'summary', label: '3. Posting Jurnal' }
              ].map((s) => {
                const isActive = closingStep === s.step;
                const isCompleted = 
                  (closingStep === 'revalue' && s.step === 'balance') || 
                  (closingStep === 'summary' && (s.step === 'balance' || s.step === 'revalue'));
                return (
                  <div key={s.step} className="space-y-1.5">
                    <div className={`h-1.5 rounded-full transition-all duration-350 ${
                      isActive ? 'bg-teal-500' : isCompleted ? 'bg-teal-200 dark:bg-teal-900/55' : 'bg-neutral-100 dark:bg-neutral-800'
                    }`} />
                    <span className={`text-[10px] font-bold block ${
                      isActive ? 'text-teal-600' : isCompleted ? 'text-teal-450' : 'text-neutral-400'
                    }`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Error or Success banner */}
            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-950/25 border border-red-200/50 dark:border-red-900/35 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 dark:text-red-400 font-medium">
                  {errorMessage}
                </div>
              </div>
            )}
            {successMessage && (
              <div className="bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-250/50 dark:border-emerald-900/35 p-4 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-700 dark:text-emerald-400 font-extrabold uppercase tracking-wider">
                  {successMessage}
                </div>
              </div>
            )}

            {/* Wizard step renderers */}
            {closingStep === 'balance' && (
              <div className="space-y-4">
                <div className="p-4 bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-150 dark:border-neutral-850 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-neutral-450 tracking-wider">Audit Keseimbangan Buku</span>
                    {balanceValidation.isValid ? (
                      <span className="inline-flex items-center gap-1 py-0.5 px-2 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 rounded-full text-[9px] font-black uppercase">
                        SEIMBANG
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 py-0.5 px-2 bg-red-100 dark:bg-red-950/40 text-red-750 dark:text-red-450 rounded-full text-[9px] font-black uppercase">
                        SELISIH / UNBALANCED
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-neutral-400 font-bold block uppercase tracking-wide">TOTAL DEBIT BULANAN</span>
                      <span className="text-sm font-black text-neutral-800 dark:text-neutral-100">
                        {formatNtd(Math.round(balanceValidation.totalDebit * 100))}
                      </span>
                    </div>
                    <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-neutral-400 font-bold block uppercase tracking-wide">TOTAL KREDIT BULANAN</span>
                      <span className="text-sm font-black text-neutral-800 dark:text-neutral-100">
                        {formatNtd(Math.round(balanceValidation.totalCredit * 100))}
                      </span>
                    </div>
                  </div>
                </div>

                {balanceValidation.isValid ? (
                  <div className="p-4 bg-emerald-50/20 dark:bg-emerald-950/10 border border-emerald-150 dark:border-emerald-900/20 rounded-2xl flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                      Sistem mengonfirmasi seluruh transaksi pada bulan {selectedPeriod.name} seimbang secara matematis (Debit = Kredit). Buku audit-ready dan aman untuk ditutup.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="p-4 bg-red-50/20 dark:bg-red-950/10 border border-red-200/20 dark:border-red-900/30 rounded-2xl flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                      <p className="text-xs text-red-650 dark:text-red-400 leading-relaxed font-bold">
                        Ditemukan entri jurnal yang tidak seimbang di periode {selectedPeriod.name}! Harap perbaiki sebelum menutup periode ini:
                      </p>
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-xl divide-y divide-neutral-150 dark:divide-neutral-850">
                      {balanceValidation.unbalancedList.map((errEntry: any) => (
                        <div key={errEntry.id} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-neutral-800 dark:text-neutral-100">{errEntry.id}</span>
                            <span className="text-[10px] text-neutral-400 block">{errEntry.description}</span>
                          </div>
                          <div className="text-right font-numeric text-[10px]">
                            <span className="text-red-500 block">Debit: NT$ {errEntry.debit}</span>
                            <span className="text-red-500 block">Kredit: NT$ {errEntry.credit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-850">
                  <button
                    onClick={() => setSelectedPeriod(null)}
                    className="py-2.5 px-4 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850/30 rounded-xl text-xs font-bold transition"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => setClosingStep('revalue')}
                    disabled={!balanceValidation.isValid}
                    className={`py-2.5 px-4 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                      balanceValidation.isValid 
                        ? 'bg-teal-500 hover:bg-teal-600' 
                        : 'bg-neutral-200 cursor-not-allowed dark:bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    Langkah Selanjutnya: Revaluasi Kurs
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {closingStep === 'revalue' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-950/20 p-3 rounded-2xl border border-neutral-100 dark:border-neutral-850">
                  <span className="text-xs text-neutral-500 font-bold">Kurs Penutupan (Live-Fetched API):</span>
                  <span className="text-xs font-black text-teal-600 dark:text-teal-400">1 NTD = {formatIdr(exchangeRate)}</span>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[10px] font-extrabold uppercase text-neutral-400 tracking-wider">SIMULASI REVALUASI REKREASI KURS</h4>
                  {revals.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
                      <p className="text-xs text-neutral-400 italic">Tidak ditemukan akun bersaldo Rupiah (IDR) aktif di periode ini.</p>
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-2xl divide-y divide-neutral-150 dark:divide-neutral-850">
                      {revals.map((item, idx) => {
                        const isGain = item.adjustmentCents > 0;
                        return (
                          <div key={idx} className="p-3.5 space-y-2 text-xs hover:bg-neutral-50/10 dark:hover:bg-neutral-850/5 transition">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-extrabold text-neutral-800 dark:text-neutral-150 block">{item.account}</span>
                                <span className="text-[9px] text-neutral-400 font-numeric">COA ID: {item.accountCode || '-'}</span>
                              </div>
                              <div className={`py-1 px-2.5 rounded-full text-[9px] font-black uppercase inline-flex items-center gap-1 ${
                                isGain 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                                  : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600'
                              }`}>
                                {isGain ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {isGain ? 'GAIN' : 'LOSS'}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-[10px] bg-neutral-50/50 dark:bg-neutral-950/10 p-2 rounded-xl">
                              <div>
                                <span className="text-neutral-400 block text-[8px] uppercase tracking-wide">Saldo Buku Lama</span>
                                <span className="font-bold text-neutral-700 dark:text-neutral-300">{formatNtd(item.currentNTDCents)}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400 block text-[8px] uppercase tracking-wide">Saldo Rupiah</span>
                                <span className="font-bold text-neutral-700 dark:text-neutral-300 font-numeric">{formatIdr(item.netIDR)}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400 block text-[8px] uppercase tracking-wide">Kurs Revaluasi</span>
                                <span className="font-bold text-neutral-700 dark:text-neutral-300">{formatNtd(item.revaluedNTDCents)}</span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center pt-1 border-t border-dashed border-neutral-100 dark:border-neutral-850">
                              <span className="text-[10px] text-neutral-450">Nilai Penyesuaian:</span>
                              <span className={`font-black font-numeric text-[11px] ${isGain ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isGain ? '+' : ''}{formatNtd(item.adjustmentCents)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-850">
                  <button
                    onClick={() => setClosingStep('balance')}
                    className="py-2.5 px-4 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850/30 rounded-xl text-xs font-bold transition"
                  >
                    Kembali
                  </button>
                  <button
                    onClick={() => setClosingStep('summary')}
                    className="py-2.5 px-4 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs transition flex items-center gap-1"
                  >
                    Langkah Selanjutnya: Ringkasan Jurnal
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {closingStep === 'summary' && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex gap-3">
                  <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-neutral-600 dark:text-neutral-350 leading-relaxed">
                    Sistem akan memposting Jurnal Revaluasi Selisih Kurs otomatis ke dalam ledger pada tanggal akhir periode (<span className="font-bold">akhir bulan</span>) dan mengunci seluruh riwayat transaksi {selectedPeriod.name}. Pastikan data revaluasi sudah diverifikasi secara matang.
                  </p>
                </div>

                <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden text-xs">
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-950/40 border-b border-neutral-200 dark:border-neutral-800 flex justify-between font-bold">
                    <span>DRAF ENTRi JURNAL PENYESUAIAN (AUTO-POST)</span>
                    <span className="font-numeric text-[10px]">JU-FX-{selectedPeriod.id}</span>
                  </div>
                  
                  <div className="p-3 divide-y divide-neutral-100 dark:divide-neutral-850 space-y-2.5">
                    <div className="flex justify-between items-center text-[10px] text-neutral-400 font-bold uppercase tracking-wider pb-1.5">
                      <span>NAMA AKUN COA</span>
                      <div className="flex gap-16">
                        <span>DEBIT</span>
                        <span>KREDIT</span>
                      </div>
                    </div>

                    {revals.length === 0 ? (
                      <div className="py-4 text-center text-neutral-400 italic">No Adjustments to post</div>
                    ) : (
                      <div className="space-y-2 pt-2 text-[11px]">
                        {revals.map((item, idx) => {
                          const isGain = item.adjustmentCents > 0;
                          return (
                            <div key={idx} className="flex justify-between items-center font-bold">
                              <span>{item.account}</span>
                              <div className="flex gap-12 font-numeric">
                                <span className="w-16 text-right text-emerald-500">
                                  {isGain ? formatNtd(item.adjustmentCents) : '-'}
                                </span>
                                <span className="w-16 text-right text-neutral-650 dark:text-neutral-400">
                                  {!isGain ? formatNtd(Math.abs(item.adjustmentCents)) : '-'}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Balanced Offset to Laba/Rugi Selisih Kurs */}
                        {(() => {
                          const sumDebit = revals.reduce((s, r) => s + (r.adjustmentCents > 0 ? r.adjustmentCents : 0), 0);
                          const sumCredit = revals.reduce((s, r) => s + (r.adjustmentCents < 0 ? Math.abs(r.adjustmentCents) : 0), 0);
                          const offsetVal = sumDebit - sumCredit;
                          if (offsetVal === 0) return null;
                          return (
                            <div className="flex justify-between items-center font-black text-teal-600 dark:text-teal-400 pt-2 border-t border-dashed border-neutral-200 dark:border-neutral-800">
                              <span>Laba/Rugi Selisih Kurs</span>
                              <div className="flex gap-12 font-numeric">
                                <span className="w-16 text-right text-teal-605">
                                  {offsetVal < 0 ? formatNtd(Math.abs(offsetVal)) : '-'}
                                </span>
                                <span className="w-16 text-right text-teal-605">
                                  {offsetVal > 0 ? formatNtd(offsetVal) : '-'}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-850">
                  <button
                    onClick={() => setClosingStep('revalue')}
                    className="py-2.5 px-4 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850/30 rounded-xl text-xs font-bold transition"
                  >
                    Kembali
                  </button>
                  <button
                    onClick={handleConfirmClosing}
                    disabled={isClosingInProgress}
                    className="py-2.5 px-4 bg-teal-500 hover:bg-teal-600 disabled:bg-neutral-250 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
                  >
                    {isClosingInProgress && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    KUNCI BUKU &amp; SELESAIKAN PENUTUPAN
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BUKA KEMBALI CONFIRMATION DIALOG (OWNER ONLY) */}
      {periodToReopen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-850 w-full max-w-md rounded-3xl p-6 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                <Unlock className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 dark:text-white uppercase">BUKA KEMBALI PERIODE</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Membuka kembali periode <strong className="text-neutral-850 dark:text-white">{periodToReopen.period}</strong> akan membatalkan status kunci buku, menghapus jurnal penyesuaian Selisih Kurs (<span className="font-numeric">{periodToReopen.fxJournalId || 'JU-FX-'}</span>), dan memungkinkan edit historis.
              </p>
            </div>

            {reopenError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/25 border border-red-200/50 dark:border-red-900/35 text-[10px] text-red-700 dark:text-red-400 font-bold rounded-xl">
                {reopenError}
              </div>
            )}

            <div className="space-y-4">
              <label className="flex items-start gap-2.5 p-3.5 bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-150 dark:border-neutral-850 rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={reopenUnderstand}
                  onChange={(e) => setReopenUnderstand(e.target.checked)}
                  className="mt-1 accent-teal-500 rounded"
                />
                <span className="text-[11px] text-neutral-600 dark:text-neutral-450 leading-relaxed font-bold">
                  Saya mengerti membuka kembali periode ini akan menghapus entri penyesuaian Selisih Kurs yang terkait dan memungkinkan perubahan data historis.
                </span>
              </label>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-neutral-400 block">
                  KETIK NAMA PERIODE UNTUK KONFIRMASI:
                </label>
                <input
                  type="text"
                  value={reopenConfirmText}
                  onChange={(e) => setReopenConfirmText(e.target.value)}
                  placeholder={`e.g. ${periodToReopen.period}`}
                  className="w-full py-2.5 px-3 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-bold bg-transparent focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-850">
              <button
                onClick={() => {
                  setPeriodToReopen(null);
                  setReopenConfirmText('');
                  setReopenUnderstand(false);
                }}
                className="py-2.5 px-4 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850/30 rounded-xl text-xs font-bold transition text-center"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmReopen}
                disabled={isClosingInProgress || !reopenUnderstand || reopenConfirmText.trim() !== periodToReopen.period}
                className="py-2.5 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 text-white font-bold rounded-xl text-xs transition text-center flex items-center justify-center gap-1.5"
              >
                {isClosingInProgress && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                BUKA BUKU KEMBALI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
