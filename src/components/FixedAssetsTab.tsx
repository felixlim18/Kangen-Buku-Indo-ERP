import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { getNextJournalId } from '../lib/journalUtils';
import { 
  collection, 
  onSnapshot, 
  doc, 
  writeBatch, 
  Timestamp, 
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { useAuth } from '../lib/auth-context';
import { 
  Building, 
  Plus, 
  Trash2, 
  Eye, 
  X, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  ArrowRight, 
  Lock,
  Calculator,
  Briefcase,
  Play,
  FileSpreadsheet
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { formatNTD, formatNumber, isParentAccount, isDescendantOf } from '../lib/decimal-utils';
import { isPeriodClosed, parseToDate, getYearMonth } from '../lib/period-closing-utils';
import { FixedAsset, FixedAssetDepreciation, CoaAccount } from '../types';
import { motion, AnimatePresence } from 'motion/react';

function formatInputWithCommas(value: string): string {
  const clean = value.replace(/\D/g, '');
  if (!clean) return '';
  return new Intl.NumberFormat('en-US').format(parseInt(clean));
}

export const FixedAssetsTab: React.FC = () => {
  const { user, profile } = useAuth();
  
  // States
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Add Asset Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  
  // Selected asset for detail / schedule view
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);

  // View Schedule Modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);

  // Delete Confirmation Modal state
  const [assetToDelete, setAssetToDelete] = useState<FixedAsset | null>(null);

  // Form input states
  const [assetName, setAssetName] = useState<string>('');
  const [acquisitionValRaw, setAcquisitionValRaw] = useState<string>('');
  const [salvageValRaw, setSalvageValRaw] = useState<string>('');
  const [acquisitionDate, setAcquisitionDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [depStartDate, setDepStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [usefulLifeMonths, setUsefulLifeMonths] = useState<number>(12);
  const [paidViaCode, setPaidViaCode] = useState<string>('1101');
  const [assetAccountCode, setAssetAccountCode] = useState<string>('1300');
  const [accumulatedAccountCode, setAccumulatedAccountCode] = useState<string>('1301');
  const [expenseAccountCode, setExpenseAccountCode] = useState<string>('5200');
  const [notes, setNotes] = useState<string>('');

  // Automatically match Depreciation Start Date with Acquisition Date
  useEffect(() => {
    setDepStartDate(acquisitionDate);
  }, [acquisitionDate]);

  // DYNAMIC FILTERING FOR ACCOUNTS IN REGISTRATION MODAL
  const parent1300 = coaAccounts.find(a => a.systemKey === 'aset_tetap' || a.code === '1300');
  const parent1100 = coaAccounts.find(a => a.code === '1100');
  const parent5200 = coaAccounts.find(a => a.systemKey === 'beban_penyusutan' || a.code === '5200');

  // Fix 1: AKUN ASET (only leaf descendants of 1300, without "Akumulasi" or "Penyusutan" in name)
  const filteredAssetAccounts = coaAccounts.filter(a => {
    if (!a.isActive) return false;
    if (isParentAccount(a, coaAccounts)) return false;
    if (!parent1300) return false;
    if (!isDescendantOf(a, parent1300, coaAccounts)) return false;
    const nameLower = (a.name || '').toLowerCase();
    return !nameLower.includes('akumulasi') && !nameLower.includes('penyusutan');
  });

  // Fix 2: AKUN AKUMULASI (only leaf descendants of 1300, WITH "Akumulasi" or "Penyusutan" in name)
  const filteredAccumulatedAccounts = coaAccounts.filter(a => {
    if (!a.isActive) return false;
    if (isParentAccount(a, coaAccounts)) return false;
    if (!parent1300) return false;
    if (!isDescendantOf(a, parent1300, coaAccounts)) return false;
    const nameLower = (a.name || '').toLowerCase();
    return nameLower.includes('akumulasi') || nameLower.includes('penyusutan');
  });

  // Fix 3: DIBAYAR VIA (only leaf descendants of 1100 Cash)
  const filteredCashAccounts = coaAccounts.filter(a => {
    if (!a.isActive) return false;
    if (isParentAccount(a, coaAccounts)) return false;
    if (!parent1100) return false;
    return isDescendantOf(a, parent1100, coaAccounts);
  });

  // Fix 4: AKUN BEBAN (only leaf descendants of 5200 Beban Penyusutan)
  const filteredExpenseAccounts = coaAccounts.filter(a => {
    if (!a.isActive) return false;
    if (isParentAccount(a, coaAccounts)) return false;
    if (!parent5200) return false;
    return isDescendantOf(a, parent5200, coaAccounts);
  });

  // Automatically pre-select first available options when adding modal opens
  useEffect(() => {
    if (isAddModalOpen) {
      if (filteredAssetAccounts.length > 0) {
        setAssetAccountCode(filteredAssetAccounts[0].code);
      } else {
        setAssetAccountCode('');
      }

      if (filteredAccumulatedAccounts.length > 0) {
        setAccumulatedAccountCode(filteredAccumulatedAccounts[0].code);
      } else {
        setAccumulatedAccountCode('');
      }

      const has1101 = filteredCashAccounts.some(a => a.systemKey === 'cash_ntd' || a.code === '1101');
      if (has1101) {
        setPaidViaCode(filteredCashAccounts.find(a => a.systemKey === 'cash_ntd')?.code || '1101');
      } else if (filteredCashAccounts.length > 0) {
        setPaidViaCode(filteredCashAccounts[0].code);
      } else {
        setPaidViaCode('');
      }

      if (filteredExpenseAccounts.length > 0) {
        setExpenseAccountCode(filteredExpenseAccounts[0].code);
      } else {
        setExpenseAccountCode('');
      }
    }
  }, [isAddModalOpen, coaAccounts]);



  const parseInputValue = (formattedValue: string): number => {
    const clean = formattedValue.replace(/,/g, '');
    return Math.round((parseFloat(clean) || 0) * 100); // return in cents
  };

  // Subscriptions & Core Account Checks
  useEffect(() => {
    if (!user) return;

    // 1. Subscribe to closed periods
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
      handleFirestoreError(err, OperationType.LIST, 'periodClosings');
    });

    // 2. Subscribe to CoA accounts
    const unsubCoA = onSnapshot(collection(db, 'coa'), async (snap) => {
      const list: CoaAccount[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as CoaAccount);
      });
      setCoaAccounts(list);

      // Check and auto-instantiate missing default Fixed Asset accounts
      const has1300 = list.some(a => a.systemKey === 'aset_tetap' || a.code === '1300');
      const has1301 = list.some(a => a.systemKey === 'akumulasi_penyusutan' || a.code === '1301');
      const has5200 = list.some(a => a.systemKey === 'beban_penyusutan' || a.code === '5200');

      if (!has1300 || !has1301 || !has5200) {
        console.log('[Audit] Detected missing core Fixed Asset accounts in CoA. Instantiating automatically...');
        try {
          const batch = writeBatch(db);
          
          if (!has1300) {
            const ref1300 = doc(db, 'coa', '1300');
            batch.set(ref1300, {
              id: '1300',
              code: '1300',
              name: 'Aset Tetap',
              type: 'Assets',
              subType: 'Aset Tidak Lancar',
              isActive: true,
              description: 'Akun utama perolehan aset tetap perusahaan',
              createdAt: Timestamp.now(),
              systemKey: 'aset_tetap',
              balance: 0
            });
          }

          if (!has1301) {
            const ref1301 = doc(db, 'coa', '1301');
            batch.set(ref1301, {
              id: '1301',
              code: '1301',
              name: 'Akumulasi Penyusutan',
              type: 'Assets',
              subType: 'Aset Tidak Lancar',
              parentAccount: '1300 - Aset Tetap',
              isActive: true,
              description: 'Akumulasi penyusutan aset tetap (contra-asset)',
              createdAt: Timestamp.now(),
              systemKey: 'akumulasi_penyusutan',
              balance: 0
            });
          }

          if (!has5200) {
            const ref5200 = doc(db, 'coa', '5200');
            batch.set(ref5200, {
              id: '5200',
              code: '5200',
              name: 'Beban Penyusutan',
              type: 'Expenses',
              subType: 'Biaya Umum dan Administrasi',
              isActive: true,
              description: 'Beban penyusutan operasional bulanan aset tetap',
              createdAt: Timestamp.now(),
              systemKey: 'aset_tetap',
              balance: 0
            });
          }

          await batch.commit();
          console.log('[Audit] Core Fixed Asset accounts successfully written into CoA.');
        } catch (e) {
          console.error('[Audit] Error auto-instantiating accounts:', e);
        }
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'coa');
    });

    // 3. Subscribe to Fixed Assets
    const unsubAssets = onSnapshot(collection(db, 'fixedAssets'), (snap) => {
      const list: FixedAsset[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as FixedAsset);
      });
      // Sort chronologically by acquisition date
      list.sort((a, b) => b.acquisitionDate.localeCompare(a.acquisitionDate));
      setAssets(list);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'fixedAssets');
    });

    return () => {
      unsubClosings();
      unsubCoA();
      unsubAssets();
    };
  }, [user]);

  // Synchronize detail panel selection to keep it in sync with real-time updates
  useEffect(() => {
    if (selectedAsset) {
      const updated = assets.find(a => a.id === selectedAsset.id);
      if (updated) {
        setSelectedAsset(updated);
      }
    }
  }, [assets]);

  // Generate unique visual code format AT[YY][MM][DD][2-digit seq], resetting per day
  const generateNextDocCode = (acqDate: string, existingAssets: FixedAsset[]): string => {
    const cleanDate = acqDate.replace(/-/g, '');
    const yy = cleanDate.slice(2, 4);
    const mm = cleanDate.slice(4, 6);
    const dd = cleanDate.slice(6, 8);
    const datePrefix = `AT${yy}${mm}${dd}`;

    // Filter existing assets for that exact date prefix
    const dailyAssets = existingAssets.filter(a => a.docCode && a.docCode.startsWith(datePrefix));
    let nextSeq = 1;
    if (dailyAssets.length > 0) {
      const seqs = dailyAssets.map(a => {
        const numPart = parseInt(a.docCode.slice(8));
        return isNaN(numPart) ? 0 : numPart;
      });
      nextSeq = Math.max(...seqs) + 1;
    }

    return `${datePrefix}${String(nextSeq).padStart(2, '0')}`;
  };

  // Helper to generate the amortization table values
  const getPeriodForMonthIndex = (startDateStr: string, index: number): string => {
    const [year, month] = startDateStr.split('-').map(Number);
    const date = new Date(year, month - 1 + index, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const getAmortizationSchedule = (asset: FixedAsset) => {
    const totalDepreciable = asset.acquisitionValue - asset.salvageValue;
    if (totalDepreciable <= 0 || asset.usefulLifeMonths <= 0) return [];

    const standardMonthly = Math.round(totalDepreciable / asset.usefulLifeMonths);
    const schedule = [];
    let accumulated = 0;

    for (let i = 0; i < asset.usefulLifeMonths; i++) {
      const period = getPeriodForMonthIndex(asset.depreciationStartDate, i);
      let monthlyDep = standardMonthly;

      if (i === asset.usefulLifeMonths - 1) {
        monthlyDep = totalDepreciable - accumulated;
      }

      accumulated += monthlyDep;
      const bookValue = asset.acquisitionValue - accumulated;

      const isPosted = asset.postedDepreciations?.some(d => d.period === period);
      const postedInfo = asset.postedDepreciations?.find(d => d.period === period);

      schedule.push({
        monthIndex: i + 1,
        period,
        monthlyDep,
        accumulated,
        bookValue,
        isPosted,
        postedInfo
      });
    }

    return schedule;
  };

  // POST ACQUISITION ASSET
  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!assetName.trim()) {
      setErrorMsg('Nama Aset harus diisi.');
      return;
    }

    const acqVal = parseInputValue(acquisitionValRaw);
    const salvageVal = parseInputValue(salvageValRaw);

    if (acqVal <= 0) {
      setErrorMsg('Nilai perolehan harus lebih besar dari 0.');
      return;
    }
    if (salvageVal < 0) {
      setErrorMsg('Nilai residu tidak boleh negatif.');
      return;
    }
    if (salvageVal >= acqVal) {
      setErrorMsg('Nilai residu tidak boleh melebihi atau menyamai nilai perolehan.');
      return;
    }

    if (!paidViaCode || !assetAccountCode || !accumulatedAccountCode || !expenseAccountCode) {
      setErrorMsg('Gagal menyimpan aset. Beberapa akun wajib belum dipilih (mungkin sub-akun belum diatur di Bagan Akun).');
      return;
    }

    // Check period locking for acquisition date
    const acqPeriod = getYearMonth(acquisitionDate);
    if (isPeriodClosed(acquisitionDate, closedPeriods)) {
      setErrorMsg(`Tidak dapat menyimpan aset. Periode transaksi perolehan (${acqPeriod}) telah ditutup.`);
      return;
    }

    setSubmitting(true);

    try {
      const nextDocCode = generateNextDocCode(acquisitionDate, assets);
      const assetId = doc(collection(db, 'fixedAssets')).id;

      // Ensure locked auto-journal acquisition is generated
      const tgl = acquisitionDate ? new Date(acquisitionDate) : new Date();
      const dateStr = tgl.toISOString().split('T')[0];
      const journalId = await getNextJournalId(dateStr);
      const journalRef = doc(db, 'journalEntries', journalId);

      const acqAssetAcc = coaAccounts.find(a => a.code === assetAccountCode) || { name: 'Aset Tetap', code: assetAccountCode };
      const acqPaidViaAcc = coaAccounts.find(a => a.code === paidViaCode) || { name: 'Cash:NTD', code: paidViaCode };

      const batch = writeBatch(db);

      // Create Asset record payload
      const assetPayload: FixedAsset = {
        id: assetId,
        docCode: nextDocCode,
        name: assetName,
        acquisitionValue: acqVal,
        salvageValue: salvageVal,
        acquisitionDate,
        depreciationStartDate: depStartDate,
        notes,
        method: 'Garis Lurus',
        usefulLifeMonths,
        status: 'Berjalan',
        assetAccountCode,
        accumulatedAccountCode,
        expenseAccountCode,
        paidViaAccountCode: paidViaCode,
        acquisitionJournalId: journalId,
        postedDepreciations: [],
        createdAt: Timestamp.now()
      };

      // Create locked journal entry for acquisition
      const journalPayload = {
        id: journalId,
        date: Timestamp.fromDate(parseToDate(acquisitionDate)),
        description: `AT#${nextDocCode} — Perolehan Aset Tetap: ${assetName}`,
        refType: 'System', // Lock journal
        refId: nextDocCode,
        createdAt: Timestamp.now(),
              systemKey: 'aset_tetap',
        lines: [
          {
            account: acqAssetAcc.name,
            accountCode: acqAssetAcc.code,
            debit: acqVal,
            credit: 0
          },
          {
            account: acqPaidViaAcc.name,
            accountCode: acqPaidViaAcc.code,
            debit: 0,
            credit: acqVal
          }
        ]
      };

      batch.set(doc(db, 'fixedAssets', assetId), assetPayload);
      batch.set(journalRef, journalPayload);

      await batch.commit();

      setSuccessMsg(`Aset Tetap ${nextDocCode} (${assetName}) berhasil disimpan beserta entri jurnal perolehan.`);
      setIsAddModalOpen(false);
      
      // Reset form states
      setAssetName('');
      setAcquisitionValRaw('');
      setSalvageValRaw('');
      setNotes('');
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal menyimpan aset tetap. Silakan coba kembali.');
    } finally {
      setSubmitting(false);
    }
  };

  // POST DEPRECIATION BULANAN
  const handlePostDepreciation = async (asset: FixedAsset, schedItem: any) => {
    setErrorMsg('');
    setSuccessMsg('');

    // Check period locking for the depreciation period
    if (isPeriodClosed(schedItem.period, closedPeriods)) {
      setErrorMsg(`Gagal memposting depresiasi. Periode penyusutan (${schedItem.period}) telah ditutup.`);
      return;
    }

    setSubmitting(true);

    try {
      const [y,m] = schedItem.period.split('-');
      const tgl = new Date(parseInt(y), parseInt(m)-1, 1);
      const dateStr = tgl.toISOString().split('T')[0];
      const journalId = await getNextJournalId(dateStr);
      const journalRef = doc(db, 'journalEntries', journalId);

      const expAcc = coaAccounts.find(a => a.code === asset.expenseAccountCode) || { name: 'Beban Penyusutan', code: asset.expenseAccountCode };
      const accDepAcc = coaAccounts.find(a => a.code === asset.accumulatedAccountCode) || { name: 'Akumulasi Penyusutan', code: asset.accumulatedAccountCode };

      // Locked monthly depreciation journal
      const journalPayload = {
        id: journalId,
        date: Timestamp.fromDate(new Date(`${schedItem.period}-28`)), // post near month-end
        description: `AT#${asset.docCode} — Penyusutan Bulanan - Periode ${schedItem.period}`,
        refType: 'System',
        refId: asset.docCode,
        createdAt: Timestamp.now(),
              systemKey: 'aset_tetap',
        lines: [
          {
            account: expAcc.name,
            accountCode: expAcc.code,
            debit: schedItem.monthlyDep,
            credit: 0
          },
          {
            account: accDepAcc.name,
            accountCode: accDepAcc.code,
            debit: 0,
            credit: schedItem.monthlyDep
          }
        ]
      };

      const depRecord: FixedAssetDepreciation = {
        period: schedItem.period,
        amount: schedItem.monthlyDep,
        journalId,
        postedAt: Timestamp.now()
      };

      // Push into asset's posted list and calculate if fully depreciated
      const updatedPosted = [...(asset.postedDepreciations || []), depRecord];
      const totalUsefulMonths = asset.usefulLifeMonths;
      const isCompleted = updatedPosted.length >= totalUsefulMonths;

      const batch = writeBatch(db);
      batch.set(journalRef, journalPayload);
      batch.update(doc(db, 'fixedAssets', asset.id), {
        postedDepreciations: updatedPosted,
        status: isCompleted ? 'Selesai' : 'Berjalan'
      });

      await batch.commit();

      setSuccessMsg(`Penyusutan ${asset.docCode} untuk periode ${schedItem.period} berhasil diposting ke jurnal.`);
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal memposting penyusutan bulanan.');
    } finally {
      setSubmitting(false);
    }
  };

  // DELETE ASSET (AND REVERSE ACQUISITION JOURNAL ATOMICALLY - ONLY ALLOWED IF NO POSTED DEPRECIATIONS)
  const handleDeleteAsset = async (asset: FixedAsset) => {
    setErrorMsg('');
    setSuccessMsg('');

    // Check if the asset has any posted depreciation journals
    const hasPostedDep = asset.postedDepreciations && asset.postedDepreciations.length > 0;
    if (hasPostedDep) {
      setErrorMsg("Aset tidak dapat dihapus karena sudah memiliki jurnal depresiasi terposting. Reverse semua depresiasi terlebih dahulu.");
      return;
    }

    // Check if the acquisition period is closed
    const acqPeriod = getYearMonth(asset.acquisitionDate);
    if (isPeriodClosed(asset.acquisitionDate, closedPeriods)) {
      setErrorMsg(`Gagal menghapus aset. Periode transaksi perolehan (${acqPeriod}) telah ditutup. Pembatalan diblokir untuk menjaga integritas pembukuan.`);
      return;
    }

    setSubmitting(true);

    try {
      const batch = writeBatch(db);

      // 1. Delete acquisition journal
      if (asset.acquisitionJournalId) {
        batch.delete(doc(db, 'journalEntries', asset.acquisitionJournalId));
      }

      // 2. Delete Fixed Asset document
      batch.delete(doc(db, 'fixedAssets', asset.id));

      await batch.commit();

      setSuccessMsg(`Aset Tetap ${asset.docCode} (${asset.name}) beserta entri jurnal perolehannya berhasil dihapus.`);
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset(null);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal menghapus aset tetap dari database.');
    } finally {
      setSubmitting(false);
    }
  };

  // REVERSE DEPRECIATION BULANAN (UNPOST)
  const handleReverseDepreciation = async (asset: FixedAsset, schedItem: any) => {
    setErrorMsg('');
    setSuccessMsg('');

    // Check period locking for the depreciation period
    if (isPeriodClosed(schedItem.period, closedPeriods)) {
      setErrorMsg(`Gagal membatalkan depresiasi. Periode penyusutan (${schedItem.period}) telah ditutup.`);
      return;
    }

    setSubmitting(true);

    try {
      // Find the posted depreciation record
      const postedRecord = asset.postedDepreciations?.find(d => d.period === schedItem.period);
      if (!postedRecord || !postedRecord.journalId) {
        throw new Error("Data jurnal tidak ditemukan untuk periode ini.");
      }
      const journalId = postedRecord.journalId;
      const journalRef = doc(db, 'journalEntries', journalId);

      // Filter out this depreciation from the posted list
      const updatedPosted = (asset.postedDepreciations || []).filter(d => d.period !== schedItem.period);

      const batch = writeBatch(db);
      
      // Delete the monthly depreciation journal entry
      batch.delete(journalRef);
      
      // Update the asset document
      batch.update(doc(db, 'fixedAssets', asset.id), {
        postedDepreciations: updatedPosted,
        status: 'Berjalan' // Set status back to running
      });

      await batch.commit();

      setSuccessMsg(`Penyusutan ${asset.docCode} untuk periode ${schedItem.period} berhasil dibatalkan.`);
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal membatalkan penyusutan bulanan.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filters accounts for selection
  const cashAccounts = coaAccounts.filter(a => a.type === 'Assets' && a.isActive);
  const assetTypeAccounts = coaAccounts.filter(a => a.type === 'Assets' && a.isActive);
  const expenseTypeAccounts = coaAccounts.filter(a => a.type === 'Expenses' && a.isActive);

  // Helper calculation totals
  const totalAssetsValue = assets.reduce((sum, a) => sum + a.acquisitionValue, 0);
  const totalAccumulatedDep = assets.reduce((sum, a) => {
    const depSum = a.postedDepreciations?.reduce((s, d) => s + d.amount, 0) || 0;
    return sum + depSum;
  }, 0);
  const totalBookValue = totalAssetsValue - totalAccumulatedDep;

  return (
    <div className="space-y-6">
      
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <Building className="h-5 w-5 text-indigo-500" /> Aset Tetap & Depresiasi
          </h2>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md shadow-teal-500/10"
        >
          <Plus className="h-4 w-4" />
          Tambah Aset Tetap
        </button>
      </div>

      {/* QUICK STATUS BANNER */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250/50 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-350 rounded-2xl text-xs font-semibold flex items-center gap-3">
          <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-250/50 dark:border-red-800/40 text-red-800 dark:text-red-350 rounded-2xl text-xs font-semibold flex items-center gap-3">
          <AlertTriangle className="h-4.5 w-4.5 text-red-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SUMMARY CARDS METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-850 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Nilai Perolehan</span>
          <div className="mt-2 text-xl font-black text-neutral-800 dark:text-white">
            {formatNTD(totalAssetsValue)}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">Akumulasi seluruh aset tetap berwujud</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-850 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Akumulasi Penyusutan</span>
          <div className="mt-2 text-xl font-black text-rose-600 dark:text-rose-400">
            {formatNTD(totalAccumulatedDep)}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">Beban yang telah disusutkan hingga kini</p>
        </div>

        <div className="bg-gradient-to-tr from-indigo-50/40 to-blue-50/10 dark:from-neutral-900 dark:to-neutral-900/60 border border-indigo-100/60 dark:border-neutral-800 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] font-bold text-indigo-600/70 dark:text-indigo-400/80 uppercase tracking-wider">Total Nilai Buku Bersih</span>
          <div className="mt-2 text-xl font-black text-indigo-750 dark:text-indigo-400">
            {formatNTD(totalBookValue)}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">Book value bersih penambah ekuitas neraca</p>
        </div>
      </div>

      {/* MAIN VIEWPORT PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: LIST OF FIXED ASSETS */}
        <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl overflow-hidden flex flex-col shadow-xs">
          <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-slate-50/50 dark:bg-neutral-950/20">
            <h2 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Daftar Inventaris Aset Tetap</h2>
            <span className="px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-md text-[10px] font-numeric font-bold text-neutral-500">{assets.length} Aset</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-neutral-500 text-xs">Memuat daftar aset...</div>
            ) : assets.length === 0 ? (
              <div className="p-16 text-center text-neutral-500 text-xs flex flex-col items-center justify-center gap-3">
                <Calculator className="h-8 w-8 text-neutral-300" />
                <span>Belum ada aset tetap yang terdaftar. Klik "Tambah Aset Tetap" untuk memulai.</span>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/30 dark:bg-neutral-950/10 border-b border-neutral-150 dark:border-neutral-800 text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="p-4 pl-5">No. Doc</th>
                    <th className="p-4">Nama Aset</th>
                    <th className="p-4 text-right">Nilai Perolehan</th>
                    <th className="p-4 text-right">Nilai Buku</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-medium">
                  {assets.map((asset) => {
                    const totalPostedDep = asset.postedDepreciations?.reduce((sum, d) => sum + d.amount, 0) || 0;
                    const bookVal = asset.acquisitionValue - totalPostedDep;
                    const isSelected = selectedAsset?.id === asset.id;

                    return (
                      <tr 
                        key={asset.id} 
                        className={`hover:bg-slate-50/40 dark:hover:bg-neutral-850/20 transition cursor-pointer ${isSelected ? 'bg-indigo-50/15 dark:bg-indigo-950/5' : ''}`}
                        onClick={() => setSelectedAsset(asset)}
                      >
                        <td className="p-4 pl-5 font-numeric text-[10px] text-neutral-500 font-bold">{asset.docCode}</td>
                        <td className="p-4">
                          <div className="font-semibold text-neutral-800 dark:text-neutral-200">{asset.name}</div>
                          <div className="text-[9px] text-neutral-400 mt-0.5">{asset.acquisitionDate} · Garis Lurus ({asset.usefulLifeMonths} Bln)</div>
                        </td>
                        <td className="p-4 text-right font-semibold text-neutral-800 dark:text-white">
                          {formatNTD(asset.acquisitionValue)}
                        </td>
                        <td className="p-4 text-right font-bold text-indigo-650 dark:text-indigo-400">
                          {formatNTD(bookVal)}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                            asset.status === 'Selesai' 
                              ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20' 
                              : 'bg-indigo-500/15 text-indigo-500 border border-indigo-500/20'
                          }`}>
                            {asset.status}
                          </span>
                        </td>
                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAsset(asset);
                                setIsScheduleModalOpen(true);
                              }}
                              className="p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-750 dark:text-neutral-300 rounded-lg transition cursor-pointer"
                              title="Tampilkan Jadwal"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const hasPostedDep = asset.postedDepreciations && asset.postedDepreciations.length > 0;
                                if (hasPostedDep) {
                                  setErrorMsg("Aset tidak dapat dihapus karena sudah memiliki jurnal depresiasi terposting. Reverse semua depresiasi terlebih dahulu.");
                                  return;
                                }
                                setAssetToDelete(asset);
                              }}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-650 rounded-lg dark:bg-red-955/20 dark:text-red-400 transition cursor-pointer"
                              title="Hapus Aset"
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
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: CALCULATION PREVIEW / DETAILED AMORTIZATION TABLE */}
        <div className="lg:col-span-5 space-y-6">
          {selectedAsset ? (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl overflow-hidden flex flex-col shadow-xs">
              <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-950/20 flex justify-between items-center">
                <div>
                  <h2 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Jadwal Amortisasi Aset</h2>
                  <div className="text-sm font-bold text-neutral-800 dark:text-white mt-0.5">{selectedAsset.docCode} — {selectedAsset.name}</div>
                </div>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="p-1 rounded-md hover:bg-neutral-150 dark:hover:bg-neutral-800 transition text-neutral-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ASSET METADATA DETAILS CARD */}
              <div className="p-5 bg-indigo-50/15 dark:bg-indigo-950/5 border-b border-neutral-100 dark:border-neutral-800 text-xs space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-neutral-400 font-bold uppercase">Tanggal Perolehan</div>
                    <div className="font-semibold text-neutral-700 dark:text-neutral-200">{selectedAsset.acquisitionDate}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400 font-bold uppercase">Mulai Penyusutan</div>
                    <div className="font-semibold text-neutral-700 dark:text-neutral-200">{selectedAsset.depreciationStartDate}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-neutral-400 font-bold uppercase">Nilai Residu (Salvage)</div>
                    <div className="font-bold text-neutral-800 dark:text-white">{formatNTD(selectedAsset.salvageValue)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400 font-bold uppercase">Dibayar Via Akun</div>
                    <div className="font-numeric text-[10px] font-bold text-indigo-600 dark:text-indigo-400">COA #{selectedAsset.paidViaAccountCode}</div>
                  </div>
                </div>
                {selectedAsset.notes && (
                  <div>
                    <div className="text-[10px] text-neutral-400 font-bold uppercase">Catatan</div>
                    <div className="italic text-neutral-500">{selectedAsset.notes}</div>
                  </div>
                )}
              </div>

              {/* SCHEDULE LIST SHEET */}
              <div className="p-4 max-h-[500px] overflow-y-auto scrollbar-thin">
                <div className="space-y-2">
                  {getAmortizationSchedule(selectedAsset).map((item) => {
                    const isClosed = isPeriodClosed(item.period, closedPeriods);

                    return (
                      <div 
                        key={item.monthIndex} 
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-4 transition ${
                          item.isPosted 
                            ? 'bg-slate-50/40 dark:bg-neutral-950/20 border-neutral-100 dark:border-neutral-800' 
                            : 'bg-white dark:bg-neutral-950/10 border-neutral-200 dark:border-neutral-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold font-numeric text-neutral-400">BULAN {item.monthIndex}</span>
                            <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-md text-[10px] font-numeric font-bold text-neutral-600">{item.period}</span>
                          </div>
                          
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
                            <div>
                              <span className="text-[9px] block text-neutral-400 font-bold">PENYUSUTAN</span>
                              <span className="font-bold text-neutral-700 dark:text-neutral-200">{formatNTD(item.monthlyDep)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] block text-neutral-400 font-bold">NILAI BUKU AKHIR</span>
                              <span className="font-semibold text-indigo-650 dark:text-indigo-400">{formatNTD(item.bookValue)}</span>
                            </div>
                          </div>
                        </div>

                        {/* POST ACTION BUTTON / BADGES */}
                        <div>
                          {item.isPosted ? (
                            <div className="flex flex-col items-end gap-1 select-text">
                              <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-500 border border-emerald-500/10 rounded-lg text-[9px] font-bold flex items-center gap-1.5">
                                <CheckCircle className="h-3 w-3" />
                                Diposting
                              </span>
                              <span className="text-[9px] font-numeric text-neutral-400 truncate max-w-[120px] font-bold" title={item.postedInfo?.journalId}>
                                {item.postedInfo?.journalId?.replace('JU-FA-', '')}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handlePostDepreciation(selectedAsset, item)}
                              disabled={isClosed || submitting}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                isClosed 
                                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed border border-neutral-200 dark:border-neutral-700'
                                  : 'bg-indigo-600 hover:bg-indigo-750 text-white shadow-md shadow-indigo-500/10'
                              }`}
                            >
                              {isClosed ? (
                                <>
                                  <Lock className="h-3 w-3 shrink-0" />
                                  Closed
                                </>
                              ) : (
                                <>
                                  <Play className="h-3 w-3 shrink-0" />
                                  Post Dep
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 text-center text-neutral-500 text-xs flex flex-col items-center justify-center gap-3 shadow-xs">
              <Calculator className="h-10 w-10 text-neutral-300" />
              <span>Silakan pilih salah satu aset tetap di samping untuk melihat jadwal penyusutan buku bulanan dan memposting jurnal penyusutan.</span>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: TAMBAH ASET TETAP */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs select-text">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col"
            >
              
              <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-950/20 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-indigo-650" />
                  <h3 className="text-sm font-bold text-neutral-800 dark:text-white uppercase">Registrasi Aset Tetap Baru</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 rounded-md hover:bg-neutral-150 dark:hover:bg-neutral-850 transition text-neutral-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddAsset} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto scrollbar-thin">
                
                {/* NAME FIELD */}
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Nama Aset Tetap</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: MacBook Pro M3 Staf Admin"
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                  />
                </div>

                {/* TWO-COLUMN QUANTITATIVE VALUES */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Nilai Perolehan (NT$)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-neutral-400 font-bold text-xs">NT$</span>
                      <input
                        type="text"
                        required
                        placeholder="10,000"
                        value={acquisitionValRaw}
                        onChange={(e) => setAcquisitionValRaw(formatInputWithCommas(e.target.value))}
                        className="w-full pl-12 pr-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-numeric font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Nilai Residu (NT$)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-neutral-400 font-bold text-xs">NT$</span>
                      <input
                        type="text"
                        required
                        placeholder="1,000"
                        value={salvageValRaw}
                        onChange={(e) => setSalvageValRaw(formatInputWithCommas(e.target.value))}
                        className="w-full pl-12 pr-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-numeric font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                      />
                    </div>
                  </div>
                </div>

                {/* ACQUISITION & START DEPRECIATION DATES */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Tanggal Perolehan</label>
                    <input
                      type="date"
                      required
                      value={acquisitionDate}
                      onChange={(e) => setAcquisitionDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-numeric font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Mulai Penyusutan</label>
                    <input
                      type="date"
                      required
                      value={depStartDate}
                      onChange={(e) => setDepStartDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-numeric font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                    />
                  </div>
                </div>

                {/* USEFUL LIFE & METHOD */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Masa Manfaat</label>
                    <select
                      value={usefulLifeMonths}
                      onChange={(e) => setUsefulLifeMonths(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                    >
                      <option value={12}>12 Bulan (1 Tahun)</option>
                      <option value={24}>24 Bulan (2 Tahun)</option>
                      <option value={36}>36 Bulan (3 Tahun)</option>
                      <option value={48}>48 Bulan (4 Tahun)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Metode Depresiasi</label>
                    <input
                      type="text"
                      readOnly
                      value="Garis Lurus"
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-950/40 rounded-xl text-xs font-bold text-neutral-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* PAYMENT SOURCE & ACCOUNT DETAILS */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Dibayar Via</label>
                    <select
                      value={paidViaCode}
                      onChange={(e) => setPaidViaCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                    >
                      {filteredCashAccounts.length === 0 ? (
                        <option value="" disabled>
                          Tidak ada akun tersedia. Tambahkan sub-akun di Bagan Akun terlebih dahulu.
                        </option>
                      ) : (
                        filteredCashAccounts.map((a, idx) => (
                          <option key={`${a.id || a.code}-${idx}`} value={a.code}>
                            {a.code} - {a.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Akun Aset</label>
                    <select
                      value={assetAccountCode}
                      onChange={(e) => setAssetAccountCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                    >
                      {filteredAssetAccounts.length === 0 ? (
                        <option value="" disabled>
                          Tidak ada akun tersedia. Tambahkan sub-akun di Bagan Akun terlebih dahulu.
                        </option>
                      ) : (
                        filteredAssetAccounts.map((a, idx) => (
                          <option key={`${a.id || a.code}-${idx}`} value={a.code}>
                            {a.code} - {a.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* BEBAN & AKUMULASI DETAILS */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Akun Akumulasi</label>
                    <select
                      value={accumulatedAccountCode}
                      onChange={(e) => setAccumulatedAccountCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                    >
                      {filteredAccumulatedAccounts.length === 0 ? (
                        <option value="" disabled>
                          Tidak ada akun tersedia. Tambahkan sub-akun di Bagan Akun terlebih dahulu.
                        </option>
                      ) : (
                        filteredAccumulatedAccounts.map((a, idx) => (
                          <option key={`${a.id || a.code}-${idx}`} value={a.code}>
                            {a.code} - {a.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Akun Beban</label>
                    <select
                      value={expenseAccountCode}
                      onChange={(e) => setExpenseAccountCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition"
                    >
                      {filteredExpenseAccounts.length === 0 ? (
                        <option value="" disabled>
                          Tidak ada akun tersedia. Tambahkan sub-akun di Bagan Akun terlebih dahulu.
                        </option>
                      ) : (
                        filteredExpenseAccounts.map((a, idx) => (
                          <option key={`${a.id || a.code}-${idx}`} value={a.code}>
                            {a.code} - {a.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* NOTES */}
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Catatan / Deskripsi</label>
                  <textarea
                    rows={2}
                    placeholder="Masukkan rincian spesifikasi aset atau lokasi penempatan..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-955/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition resize-none"
                  />
                </div>

                {/* SAVE BUTTON */}
                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-850 dark:hover:bg-neutral-800 dark:text-neutral-400 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-teal-500/10"
                  >
                    {submitting ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Simpan Aset'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* MODAL: JADWAL DEPRESIASI */}
        {isScheduleModalOpen && selectedAsset && (() => {
          const totalPostedDep = selectedAsset.postedDepreciations?.reduce((sum, d) => sum + d.amount, 0) || 0;
          const bookVal = selectedAsset.acquisitionValue - totalPostedDep;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs select-text">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
              >
                {/* HEADER */}
                <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-950/20 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-indigo-650" />
                    <div>
                      <h3 className="text-sm font-bold text-neutral-800 dark:text-white uppercase">Jadwal Depresiasi</h3>
                      <p className="text-[10px] text-neutral-400 font-bold mt-0.5">{selectedAsset.docCode} — {selectedAsset.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="p-1 rounded-md hover:bg-neutral-150 dark:hover:bg-neutral-850 transition text-neutral-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-y-auto scrollbar-thin p-6 space-y-5">
                  {/* METADATA GRID */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4.5 bg-neutral-50 dark:bg-neutral-950/20 rounded-2xl border border-neutral-150 dark:border-neutral-850 text-xs">
                    <div>
                      <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Nilai Perolehan</div>
                      <div className="font-bold text-neutral-800 dark:text-white mt-0.5">{formatNTD(selectedAsset.acquisitionValue)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Nilai Residu</div>
                      <div className="font-bold text-neutral-800 dark:text-white mt-0.5">{formatNTD(selectedAsset.salvageValue)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Akumulasi Penyusutan</div>
                      <div className="font-bold text-rose-600 dark:text-rose-400 mt-0.5">{formatNTD(totalPostedDep)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Nilai Buku</div>
                      <div className="font-bold text-indigo-650 dark:text-indigo-400 mt-0.5">{formatNTD(bookVal)}</div>
                    </div>
                  </div>

                  {/* ADDITIONAL DATES INFO */}
                  <div className="grid grid-cols-2 gap-4 text-xs p-1">
                    <div>
                      <span className="text-neutral-400 font-bold uppercase text-[9px] tracking-wider block">Tanggal Perolehan & Metode</span>
                      <span className="font-semibold text-neutral-700 dark:text-neutral-200 mt-0.5 block">{selectedAsset.acquisitionDate} · Garis Lurus ({selectedAsset.usefulLifeMonths} Bulan)</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 font-bold uppercase text-[9px] tracking-wider block">Beban & Akumulasi COA</span>
                      <span className="font-numeric text-neutral-600 dark:text-neutral-300 font-bold block">Beban: #{selectedAsset.expenseAccountCode} | Akum: #{selectedAsset.accumulatedAccountCode}</span>
                    </div>
                  </div>

                  {/* AMORTIZATION LIST */}
                  <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
                    {getAmortizationSchedule(selectedAsset).map((item) => {
                      const isClosed = isPeriodClosed(item.period, closedPeriods);

                      return (
                        <div 
                          key={item.monthIndex} 
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-4 transition ${
                            item.isPosted 
                              ? 'bg-slate-50/40 dark:bg-neutral-950/20 border-neutral-100 dark:border-neutral-800' 
                              : 'bg-white dark:bg-neutral-950/10 border-neutral-200 dark:border-neutral-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold font-numeric text-neutral-400">BULAN {item.monthIndex}</span>
                              <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-md text-[10px] font-numeric font-bold text-neutral-600">{item.period}</span>
                            </div>
                            
                            <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
                              <div>
                                <span className="text-[9px] block text-neutral-400 font-bold">PENYUSUTAN</span>
                                <span className="font-bold text-neutral-700 dark:text-neutral-200">{formatNTD(item.monthlyDep)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] block text-neutral-400 font-bold">NILAI BUKU AKHIR</span>
                                <span className="font-semibold text-indigo-650 dark:text-indigo-400">{formatNTD(item.bookValue)}</span>
                              </div>
                            </div>
                          </div>

                          {/* POST ACTION BUTTON / BADGES / REVERSE */}
                          <div>
                            {item.isPosted ? (
                              <div className="flex flex-col items-end gap-1 select-text">
                                <div className="flex items-center gap-2">
                                  <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-500 border border-emerald-500/10 rounded-lg text-[9px] font-bold flex items-center gap-1.5">
                                    <CheckCircle className="h-3 w-3" />
                                    Diposting
                                  </span>
                                  
                                  {/* REVERSE / UNPOST BUTTON */}
                                  <button
                                    onClick={() => handleReverseDepreciation(selectedAsset, item)}
                                    disabled={isClosed || submitting}
                                    className={`p-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer ${
                                      isClosed || submitting ? 'opacity-40 cursor-not-allowed' : ''
                                    }`}
                                    title="Batalkan (Reverse) Penyusutan"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <span className="text-[9px] font-numeric text-neutral-400 truncate max-w-[120px] font-bold" title={item.postedInfo?.journalId}>
                                  {item.postedInfo?.journalId?.replace('JU-FA-', '')}
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() => handlePostDepreciation(selectedAsset, item)}
                                disabled={isClosed || submitting}
                                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                  isClosed 
                                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed border border-neutral-200 dark:border-neutral-700'
                                    : 'bg-indigo-600 hover:bg-indigo-750 text-white shadow-md shadow-indigo-500/10'
                                }`}
                              >
                                {isClosed ? (
                                  <>
                                    <Lock className="h-3 w-3 shrink-0" />
                                    Closed
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-3 w-3 shrink-0" />
                                    Post Dep
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                  <button
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="px-4.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-850 dark:hover:bg-neutral-800 dark:text-neutral-400 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}

        {/* MODAL: KONFIRMASI HAPUS ASET */}
        {assetToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs select-text">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 bg-red-50/10 dark:bg-red-950/10 flex justify-between items-center">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="text-sm font-bold uppercase">Konfirmasi Hapus</h3>
                </div>
                <button
                  onClick={() => setAssetToDelete(null)}
                  className="p-1 rounded-md hover:bg-neutral-150 dark:hover:bg-neutral-850 transition text-neutral-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6">
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Hapus aset <span className="font-bold text-neutral-800 dark:text-white">[{assetToDelete.name}]</span>? Tindakan ini tidak dapat dibatalkan.
                </p>
                <p className="text-[10px] text-neutral-400 font-bold mt-2.5">
                  Catatan: Entri jurnal perolehan terkait juga akan dihapus secara permanen untuk menjaga kepatuhan double-entry accounting.
                </p>
              </div>

              <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-3 bg-neutral-50/50 dark:bg-neutral-950/10">
                <button
                  type="button"
                  onClick={() => setAssetToDelete(null)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-850 dark:hover:bg-neutral-800 dark:text-neutral-400 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const temp = assetToDelete;
                    setAssetToDelete(null);
                    await handleDeleteAsset(temp);
                  }}
                  disabled={submitting}
                  className="px-4.5 py-2 bg-red-600 hover:bg-red-750 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-500/10"
                >
                  {submitting ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Hapus'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
