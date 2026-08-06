import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { FALLBACK_IDR_PER_NTD } from '../lib/exchangeRateConstants';
import { collection, onSnapshot, doc, runTransaction, Timestamp, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../lib/auth-context';
import { AUTO_ACCOUNTS, ensureAutoAccountExists, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { isPeriodClosed, fetchCurrentExchangeRate } from '../lib/period-closing-utils';
import { TrendingUp } from 'lucide-react';
import './IncomeTab.css';

type Cell = { r: number; c: number };
type GridRow = { code: string; amount: string; status?: 'success'|'partial'|'error'|null; msg?: string };

export const IncomeTab: React.FC = () => {
  const { user } = useAuth();
  
  // Real-time data
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [liveExchangeRate, setLiveExchangeRate] = useState<number>(500);
  
  // UI states
  const [activePlatform, setActivePlatform] = useState<string>('semua');
  
  // Modal Single states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [reverseModalData, setReverseModalData] = useState<any | null>(null);
  const [paymentMode, setPaymentMode] = useState<'lunas' | 'sebagian'>('lunas');
  const [diterimaInput, setDiterimaInput] = useState('');
  const [cashAccount, setCashAccount] = useState<'1101' | '1102'>('1101');
  const [payRate, setPayRate] = useState('');
  const [liveAccounts, setLiveAccounts] = useState<Record<string, AutoAccount>>(AUTO_ACCOUNTS);
  
  useEffect(() => {
    getLiveAutoAccounts().then(setLiveAccounts).catch(console.error);
  }, []);
  
  const [payDate, setPayDate] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  });
  const [confirmDiffData, setConfirmDiffData] = useState<{
    nominalNTD: number;
    diterimaNTD: number;
    rawDiterimaNum: number;
    selisihNTD: number;
    isGain: boolean;
  } | null>(null);

  // Bulk Modal states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(payDate);
  const [bulkCashAccount, setBulkCashAccount] = useState<'1101'|'1102'>('1101');
  const [bulkPayRate, setBulkPayRate] = useState(String(FALLBACK_IDR_PER_NTD));
  const [grid, setGrid] = useState<GridRow[]>(Array(20).fill({code: '', amount: ''}));
  const [activeCell, setActiveCell] = useState<Cell | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Cell | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSuggestFor, setShowSuggestFor] = useState<number | null>(null);
  const [suggestIdx, setSuggestIdx] = useState(0);

  useEffect(() => {
    const getRate = async () => {
      try {
        const rate = await fetchCurrentExchangeRate();
        setLiveExchangeRate(rate);
      } catch (e) {
        console.error("Error fetching rate", e);
      }
    };
    getRate();
  }, []);

  useEffect(() => {
    setBulkPayRate(String(liveExchangeRate));
  }, [liveExchangeRate]);

  useEffect(() => {
    // Fetch only Sales Orders with paymentMethod === 'Transfer'
    const unsubSales = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const oList: any[] = [];
      snap.forEach((d) => {
        const o = d.data();
        if (o.paymentMethod === 'Transfer' && o.status !== 'cancelled' && o.status !== 'returned') {
          oList.push({ id: d.id, ...o });
        }
      });
      setSalesOrders(oList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    const unsubPeriods = onSnapshot(collection(db, 'periodClosings'), (snap) => {
      const closedList: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.status === 'Ditutup') {
          closedList.push(d.id);
        }
      });
      setClosedPeriods(closedList);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      unsubSales();
      unsubPeriods();
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const getOutstanding = (item: any) => (item.totalPrice || 0) - (item.amountPaid || 0);

  const getStatus = (item: any) => {
    const sisa = getOutstanding(item);
    if (sisa <= 0) return { label: 'Dibayar', c: 'var(--green)', bg: 'var(--green-bg)', class: 'dibayar' };
    if ((item.amountPaid || 0) > 0) return { label: 'Sebagian', c: 'var(--teal)', bg: 'var(--teal-bg)', class: 'sebagian' };
    return { label: 'Belum Dibayar', c: 'var(--amber)', bg: 'var(--amber-bg)', class: 'belum' };
  };

  const platforms = Array.from(new Set(salesOrders.map(o => o.platformChannel || 'Other')));
  const platformList = platforms.length > 0 ? platforms : ['7-Eleven', 'FamilyMart', 'IopenMall', 'Shopee'];

  const filteredOrders = activePlatform === 'semua' 
    ? salesOrders 
    : salesOrders.filter(o => (o.platformChannel || 'Other') === activePlatform);

  const totalOutstandingAll = salesOrders.reduce((acc, so) => acc + Math.max(0, getOutstanding(so)), 0);
  const totalCountAll = salesOrders.filter(so => getOutstanding(so) > 0).length;

  const outstandingPlatform = activePlatform === 'semua' 
    ? totalOutstandingAll 
    : filteredOrders.reduce((acc, so) => acc + Math.max(0, getOutstanding(so)), 0);

  const getAutoFillDiterima = (sisaNTD: number, account: '1101' | '1102', rate: number) => {
    if (account === '1101') {
      return sisaNTD.toFixed(2);
    } else {
      const rawRupiah = Math.floor((sisaNTD * rate) / 5000) * 5000;
      return formatInputWithCommas(String(rawRupiah));
    }
  };

  const handleOpenPaymentModal = (item: any) => {
    setSelectedItem(item);
    const amountPaidCents = item.amountPaid || 0;
    const isForm2 = amountPaidCents > 0;
    const sisaCents = Math.max(0, (item.totalPrice || 0) - amountPaidCents);
    const sisaNTD = sisaCents / 100;
    const rate = liveExchangeRate || 500;
    
    setCashAccount('1101');
    setPayRate(String(rate));
    setPaymentMode('lunas');

    setDiterimaInput(getAutoFillDiterima(sisaNTD, '1101', rate));
    setIsPayModalOpen(true);
  };

  const handleClosePaymentModal = () => {
    setIsPayModalOpen(false);
    setSelectedItem(null);
    setDiterimaInput('');
    setConfirmDiffData(null);
  };

  const handleCashAccountChange = (newAccount: '1101' | '1102') => {
    setCashAccount(newAccount);
    if (!selectedItem) return;
    const amountPaidCents = selectedItem.amountPaid || 0;
    const isForm2 = amountPaidCents > 0;
    const sisaCents = Math.max(0, (selectedItem.totalPrice || 0) - amountPaidCents);
    const sisaNTD = sisaCents / 100;
    const rate = parseFloat(cleanCommas(payRate)) || FALLBACK_IDR_PER_NTD;

    if (isForm2 || paymentMode === 'lunas') {
      setDiterimaInput(getAutoFillDiterima(sisaNTD, newAccount, rate));
    } else {
      setDiterimaInput('');
    }
  };

  const handleModeChange = (newMode: 'lunas' | 'sebagian') => {
    setPaymentMode(newMode);
    if (!selectedItem) return;
    const amountPaidCents = selectedItem.amountPaid || 0;
    const sisaCents = Math.max(0, (selectedItem.totalPrice || 0) - amountPaidCents);
    const sisaNTD = sisaCents / 100;
    const rate = parseFloat(cleanCommas(payRate)) || FALLBACK_IDR_PER_NTD;

    if (newMode === 'lunas') {
      setDiterimaInput(getAutoFillDiterima(sisaNTD, cashAccount, rate));
    } else {
      setDiterimaInput('');
    }
  };

  const handleDiterimaInputChange = (val: string) => {
    setDiterimaInput(formatInputWithCommas(val));
  };

  const handleConfirmReverse = async () => {
    if (!reverseModalData) return;
    try {
      const order = reverseModalData;
      const journalSnap = await getDocs(query(collection(db, 'journalEntries'), where('refId', '==', order.id), where('refType', '==', 'sales_order_transfer_payment')));
      const cfSnap = await getDocs(query(collection(db, 'cashFlow'), where('refId', '==', order.id)));
      
      const journalRefs = journalSnap.docs.map(d => d.ref);
      const cfRefs = cfSnap.docs
         .filter(d => d.data().category === 'operating' && d.data().notes?.includes('Pendapatan Diterima di Muka'))
         .map(d => d.ref);

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'salesOrders', order.id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order tidak ditemukan");

        // Check if period is closed before deleting
        const journalsData = journalSnap.docs.map(doc => doc.data());
        for (const jData of journalsData) {
          if (jData.date && isPeriodClosed(jData.date.toDate(), closedPeriods)) {
            throw new Error(`Reverse gagal karena transaksi berada dalam periode akuntansi yang sudah ditutup!`);
          }
        }

        // Delete all payment journals
        for (const jRef of journalRefs) {
          transaction.delete(jRef);
        }
        // Delete all related cashflows
        for (const cfRef of cfRefs) {
          transaction.delete(cfRef);
        }

        // Reset order payment status
        transaction.update(orderRef, {
          amountPaid: 0,
          paymentStatus: 'unpaid',
          isUnpaid: true,
          updatedAt: Timestamp.now()
        });
      });
      setReverseModalData(null);
    } catch (err: any) {
      console.error(err);
      alert(`Gagal membatalkan penerimaan transfer: ${err.message}`);
    }
  };

  // Calculations for current selected order in payment modal
  const modalAmountPaidCents = selectedItem ? (selectedItem.amountPaid || 0) : 0;
  const modalIsForm2 = modalAmountPaidCents > 0;
  const modalSisaCents = selectedItem ? Math.max(0, (selectedItem.totalPrice || 0) - modalAmountPaidCents) : 0;
  const modalSisaNTD = modalSisaCents / 100;
  const modalFxRate = parseFloat(cleanCommas(payRate)) || FALLBACK_IDR_PER_NTD;

  const rawDiterimaNum = parseFloat(cleanCommas(diterimaInput)) || 0;
  let diterimaInNTD = 0;
  if (cashAccount === '1101') {
    diterimaInNTD = rawDiterimaNum;
  } else {
    diterimaInNTD = modalFxRate > 0 ? rawDiterimaNum / modalFxRate : 0;
  }

  let nominalPenerimaanNTD = 0;
  if (!modalIsForm2 && paymentMode === 'sebagian') {
    nominalPenerimaanNTD = diterimaInNTD;
  } else {
    nominalPenerimaanNTD = modalSisaNTD;
  }

  const selisihNTD = diterimaInNTD - modalSisaNTD;
  const absSelisihNTD = Math.abs(selisihNTD);

  const rawCode = selectedItem ? (selectedItem.orderCode || selectedItem.id) : '';
  const orderCodeFormatted = rawCode.startsWith('#') ? rawCode : `#${rawCode}`;

  const handleSavePayment = () => {
    if (!selectedItem) return;

    if (isPeriodClosed(payDate, closedPeriods)) {
      alert(`Tanggal ${payDate} berada di dalam periode akuntansi yang sudah ditutup!`);
      return;
    }

    if (rawDiterimaNum <= 0) {
      alert("Masukkan Jumlah Diterima Sebenarnya yang valid.");
      return;
    }

    // Form 1 Bayar Sebagian -> NEVER show confirmation dialog
    if (!modalIsForm2 && paymentMode === 'sebagian') {
      executePostingTransaction();
      return;
    }

    // Form 1 Lunas Penuh or Form 2 Bayar Sisa -> Check if selisih != 0
    if (absSelisihNTD >= 0.01) {
      setConfirmDiffData({
        nominalNTD: nominalPenerimaanNTD,
        diterimaNTD: diterimaInNTD,
        rawDiterimaNum: rawDiterimaNum,
        selisihNTD: selisihNTD,
        isGain: selisihNTD > 0
      });
      return;
    }

    executePostingTransaction();
  };

  const executePostingTransaction = async () => {
    if (!selectedItem) return;

    const targetCash = cashAccount === '1101' ? AUTO_ACCOUNTS.CASH_NTD : AUTO_ACCOUNTS.CASH_RUPIAH;
    const isRupiah = cashAccount === '1102';

    const payAmountCents = Math.round(nominalPenerimaanNTD * 100);
    const receivedCents = Math.round(diterimaInNTD * 100);

    let journalDesc = `${orderCodeFormatted} - Pendapatan Diterima di Muka`;
    if (!modalIsForm2 && paymentMode === 'sebagian') {
      journalDesc += ' (Sebagian)';
    } else if (modalIsForm2) {
      journalDesc += ' (Sisa)';
    }

    const lines: any[] = [];

    if (isRupiah) {
      const fxRate = parseFloat(cleanCommas(payRate)) || FALLBACK_IDR_PER_NTD;
      const targetRp = Math.round(nominalPenerimaanNTD * fxRate);
      const diterimaRp = Math.round(rawDiterimaNum);
      const selisihRp = diterimaRp - targetRp;

      // 1. Debit 1102 Cash: Rupiah = Jumlah Diterima Sebenarnya (Rp)
      lines.push({
        account: targetCash.name,
        accountCode: targetCash.code,
        debit: receivedCents,
        credit: 0,
        originalCurrency: 'IDR',
        originalDebitIDR: diterimaRp,
        originalCreditIDR: 0
      });

      // 2. Baris 4210 Laba/Rugi Selisih Kurs
      if ((modalIsForm2 || paymentMode === 'lunas') && selisihRp !== 0) {
        if (selisihRp < 0) {
          // Loss (Rugi Selisih Kurs): Debit 4210
          const ntdLossCents = payAmountCents - receivedCents;
          lines.push({
            account: 'Laba/Rugi Selisih Kurs',
            accountCode: '4210',
            debit: Math.max(0, ntdLossCents),
            credit: 0,
            originalCurrency: 'IDR',
            originalDebitIDR: Math.abs(selisihRp),
            originalCreditIDR: 0
          });
        } else {
          // Gain (Untung Selisih Kurs): Kredit 4210
          const ntdGainCents = receivedCents - payAmountCents;
          lines.push({
            account: 'Laba/Rugi Selisih Kurs',
            accountCode: '4210',
            debit: 0,
            credit: Math.max(0, ntdGainCents),
            originalCurrency: 'IDR',
            originalDebitIDR: 0,
            originalCreditIDR: selisihRp
          });
        }
      }

      // 3. Kredit 2110 Pendapatan Diterima di Muka = targetRp (BUKAN Jumlah Diterima Sebenarnya)
      lines.push({
        account: 'Pendapatan Diterima di Muka',
        accountCode: '2110',
        debit: 0,
        credit: payAmountCents,
        originalCurrency: 'IDR',
        originalDebitIDR: 0,
        originalCreditIDR: targetRp
      });

    } else {
      // NTD Logic (Cash: NTD 1101)
      const diffCents = receivedCents - payAmountCents;

      lines.push({
        account: targetCash.name,
        accountCode: targetCash.code,
        debit: receivedCents,
        credit: 0
      });

      if ((modalIsForm2 || paymentMode === 'lunas') && diffCents !== 0) {
        if (diffCents < 0) {
          lines.push({
            account: 'Laba/Rugi Selisih Kurs',
            accountCode: '4210',
            debit: Math.abs(diffCents),
            credit: 0
          });
        } else {
          lines.push({
            account: 'Laba/Rugi Selisih Kurs',
            accountCode: '4210',
            debit: 0,
            credit: diffCents
          });
        }
      }

      lines.push({
        account: 'Pendapatan Diterima di Muka',
        accountCode: '2110',
        debit: 0,
        credit: payAmountCents
      });
    }

    // Verifikasi total Debit = total Kredit sebelum izinkan posting (BLOCK jika Unbalanced)
    const sumDebitNTD = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const sumCreditNTD = lines.reduce((s, l) => s + (l.credit || 0), 0);
    const isBalancedNTD = sumDebitNTD === sumCreditNTD && sumDebitNTD > 0;

    let isBalancedIDR = true;
    if (isRupiah) {
      const sumDebitIDR = lines.reduce((s, l) => s + (l.originalDebitIDR || 0), 0);
      const sumCreditIDR = lines.reduce((s, l) => s + (l.originalCreditIDR || 0), 0);
      isBalancedIDR = sumDebitIDR === sumCreditIDR && sumDebitIDR > 0;
    }

    if (!isBalancedNTD || !isBalancedIDR) {
      alert(`Posting dibatalkan: Transaksi tidak seimbang (BALANCE FAILED). Debit NT$: ${sumDebitNTD / 100}, Kredit NT$: ${sumCreditNTD / 100}${isRupiah ? `, Debit IDR: ${lines.reduce((s, l) => s + (l.originalDebitIDR || 0), 0)}, Kredit IDR: ${lines.reduce((s, l) => s + (l.originalCreditIDR || 0), 0)}` : ''}`);
      return;
    }

    try {
      const orderRef = doc(db, 'salesOrders', selectedItem.id);
      const journalId = await getNextJournalId(payDate);
      const cfId = doc(collection(db, 'cashFlow')).id;

      await ensureAutoAccountExists({ code: '2110', name: 'Pendapatan Diterima di Muka', type: 'Liabilities', subType: 'Kewajiban Lancar' });
      await ensureAutoAccountExists({ code: '4210', name: 'Laba/Rugi Selisih Kurs', type: 'Revenue', subType: 'Pendapatan Lain-lain' });
      await ensureAutoAccountExists(targetCash);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(orderRef);
        if (!snap.exists()) throw new Error("Sales order tidak ditemukan");

        const order = snap.data();
        const curPaid = order.amountPaid || 0;
        const nextPaid = curPaid + payAmountCents;
        const isFullyPaid = nextPaid >= (order.totalPrice || 0) - 5;

        transaction.update(orderRef, {
          amountPaid: nextPaid,
          paymentStatus: isFullyPaid ? 'paid' : 'partial',
          isUnpaid: !isFullyPaid,
          updatedAt: Timestamp.now()
        });

        transaction.set(doc(db, 'journalEntries', journalId), {
          id: journalId,
          date: Timestamp.fromDate(new Date(payDate)),
          description: journalDesc,
          refType: 'sales_order_transfer_payment',
          refId: selectedItem.id,
          isAuto: true,
          createdAt: Timestamp.now(),
          lines
        });

        transaction.set(doc(db, 'cashFlow', cfId), {
          id: cfId,
          date: Timestamp.fromDate(new Date(payDate)),
          ledger: isRupiah ? 'IDR' : 'NTD',
          direction: 'inflow',
          amount: isRupiah ? Math.round(rawDiterimaNum) : receivedCents,
          notes: journalDesc,
          category: 'operating',
          accountCode: targetCash.code,
          refId: selectedItem.id
        });
      });

      setConfirmDiffData(null);
      handleClosePaymentModal();
    } catch (err: any) {
      console.error(err);
      alert(`Gagal memposting pembayaran: ${err.message}`);
    }
  };

  // --- GRID LOGIC ---

  const isSelected = (r: number, c: number) => {
    if (!activeCell) return false;
    const r1 = Math.min(activeCell.r, selectionEnd?.r ?? activeCell.r);
    const r2 = Math.max(activeCell.r, selectionEnd?.r ?? activeCell.r);
    const c1 = Math.min(activeCell.c, selectionEnd?.c ?? activeCell.c);
    const c2 = Math.max(activeCell.c, selectionEnd?.c ?? activeCell.c);
    return r >= r1 && r <= r2 && c >= c1 && c <= c2;
  };

  const applyUniqueConstraint = (newGrid: GridRow[]) => {
    const seen = new Set<string>();
    return newGrid.map(row => {
      const code = row.code.trim().toUpperCase();
      if (!code) return row;
      if (seen.has(code)) return { ...row, amount: '0' };
      seen.add(code);
      return row;
    });
  };

  const handleGridChange = (r: number, c: number, val: string) => {
    let newGrid = grid.map(row => ({...row}));
    newGrid[r] = { ...newGrid[r], [c === 0 ? 'code' : 'amount']: val, status: null, msg: undefined };
    
    if (c === 0) {
      const cVal = val.trim().toUpperCase();
      const matchedOrder = filteredOrders.find(o => (o.orderCode || o.id).toUpperCase() === cVal);
      if (matchedOrder && (!newGrid[r].amount || newGrid[r].amount === '0')) {
        newGrid[r].amount = String(Math.round(getOutstanding(matchedOrder) / 100));
      }
      setShowSuggestFor(r);
      setSuggestIdx(0);
    }
    
    setGrid(applyUniqueConstraint(newGrid));
  };

  const handleDeleteSelection = () => {
    if (!activeCell) return;
    const r1 = Math.min(activeCell.r, selectionEnd?.r ?? activeCell.r);
    const r2 = Math.max(activeCell.r, selectionEnd?.r ?? activeCell.r);
    const c1 = Math.min(activeCell.c, selectionEnd?.c ?? activeCell.c);
    const c2 = Math.max(activeCell.c, selectionEnd?.c ?? activeCell.c);
    
    let newGrid = grid.map(row => ({...row}));
    for (let i = r1; i <= r2; i++) {
      for (let j = c1; j <= c2; j++) {
        newGrid[i] = { ...newGrid[i], [j === 0 ? 'code' : 'amount']: '', status: null, msg: undefined };
      }
    }
    setGrid(applyUniqueConstraint(newGrid));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, startR: number, startC: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    
    const rows = text.split(/\r?\n/);
    let newGrid = grid.map(r => ({...r}));
    
    for (let i = 0; i < rows.length; i++) {
      if (startR + i >= 20) break;
      const cols = rows[i].split('\t');
      for (let j = 0; j < cols.length; j++) {
        if (startC + j > 1) break;
        if (cols[j] !== undefined && cols[j] !== '') {
          const val = cols[j].trim();
          if (startC + j === 0) newGrid[startR + i].code = val;
          if (startC + j === 1) newGrid[startR + i].amount = formatInputWithCommas(val);
        }
      }
      
      if (cols.length === 1 && startC === 0) {
        const codeVal = newGrid[startR + i].code.trim().toUpperCase();
        const matched = filteredOrders.find(o => (o.orderCode || o.id).toUpperCase() === codeVal);
        if (matched && (!newGrid[startR+i].amount || newGrid[startR+i].amount === '0')) {
          newGrid[startR+i].amount = String(Math.round(getOutstanding(matched) / 100));
        }
      }
    }
    
    setGrid(applyUniqueConstraint(newGrid));
    setShowSuggestFor(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (showSuggestFor === r && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx(prev => Math.min(prev + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectSuggestion(suggestions[suggestIdx], r);
        return;
      }
    }
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectionEnd && (selectionEnd.r !== activeCell?.r || selectionEnd.c !== activeCell?.c)) {
        e.preventDefault();
        handleDeleteSelection();
        return;
      }
    }
    
    if (e.key.startsWith('Arrow')) {
      const target = e.currentTarget;
      if (!e.shiftKey) {
        if (e.key === 'ArrowLeft' && target.selectionStart !== 0) return;
        if (e.key === 'ArrowRight' && target.selectionEnd !== target.value.length) return;
      }
      
      e.preventDefault();
      let nextR = activeCell?.r ?? r;
      let nextC = activeCell?.c ?? c;
      
      if (e.shiftKey) {
        nextR = selectionEnd?.r ?? r;
        nextC = selectionEnd?.c ?? c;
      }
      
      if (e.key === 'ArrowUp') nextR = Math.max(0, nextR - 1);
      if (e.key === 'ArrowDown') nextR = Math.min(19, nextR + 1);
      if (e.key === 'ArrowLeft') nextC = Math.max(0, nextC - 1);
      if (e.key === 'ArrowRight') nextC = Math.min(1, nextC + 1);
      
      if (e.shiftKey) {
        setSelectionEnd({ r: nextR, c: nextC });
      } else {
        setActiveCell({ r: nextR, c: nextC });
        setSelectionEnd({ r: nextR, c: nextC });
        document.getElementById(`grid-input-${nextR}-${nextC}`)?.focus();
      }
    }
  };

  const handleSelectSuggestion = (s: any, r: number) => {
    let newGrid = grid.map(row => ({...row}));
    newGrid[r].code = s.orderCode || s.id;
    if (!newGrid[r].amount || newGrid[r].amount === '0') {
      newGrid[r].amount = String(Math.round(getOutstanding(s) / 100));
    }
    setGrid(applyUniqueConstraint(newGrid));
    setShowSuggestFor(null);
    document.getElementById(`grid-input-${r}-1`)?.focus();
  };

  const handleProcessBulk = async () => {
    const hasData = grid.some(r => r.code.trim() !== '');
    if (!hasData) {
      alert('Grid masih kosong.');
      return;
    }

    if (isPeriodClosed(bulkDate, closedPeriods)) {
      alert(`Tanggal ${bulkDate} berada di dalam periode akuntansi yang sudah ditutup!`);
      return;
    }

    let newGrid = grid.map(r => ({...r}));
    let ops: any[] = [];
    let hasError = false;

    for (let i = 0; i < grid.length; i++) {
      const row = grid[i];
      const cVal = row.code.trim().toUpperCase();
      if (!cVal) continue;
      
      const amtCents = Math.round((parseFloat(cleanCommas(row.amount)) || 0) * 100);
      const matchedOrder = filteredOrders.find(o => (o.orderCode || o.id).toUpperCase() === cVal);
      
      if (!matchedOrder) {
        newGrid[i].status = 'error';
        newGrid[i].msg = 'Order tidak ditemukan';
        hasError = true;
      } else if (amtCents > 0) {
        ops.push({ r: i, order: matchedOrder, amountCents: amtCents });
      }
    }

    if (ops.length === 0) {
      setGrid(newGrid);
      if (hasError) alert('Beberapa order tidak ditemukan atau tidak valid.');
      return;
    }

    try {
      await ensureAutoAccountExists({ code: '2110', name: 'Pendapatan Diterima di Muka', type: 'Liabilities', subType: 'Kewajiban Lancar' });
      await ensureAutoAccountExists(bulkCashAccount === '1101' ? AUTO_ACCOUNTS.CASH_NTD : AUTO_ACCOUNTS.CASH_RUPIAH);

      await runTransaction(db, async (transaction) => {
        const orderRefs = ops.map(op => doc(db, 'salesOrders', op.order.id));
        const orderSnaps = await Promise.all(orderRefs.map(ref => transaction.get(ref)));

        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          const snap = orderSnaps[i];
          if (!snap.exists()) throw new Error(`Order ${op.order.orderCode} hilang`);
          
          const orderData = snap.data();
          const curPaid = orderData.amountPaid || 0;
          const nextPaid = curPaid + op.amountCents;
          const isFullyPaid = nextPaid >= (orderData.totalPrice || 0) - 5;
          
          transaction.update(snap.ref, {
            amountPaid: nextPaid,
            paymentStatus: isFullyPaid ? 'paid' : 'partial',
            isUnpaid: !isFullyPaid,
            updatedAt: Timestamp.now()
          });
          
          const targetCash = bulkCashAccount === '1101' ? AUTO_ACCOUNTS.CASH_NTD : AUTO_ACCOUNTS.CASH_RUPIAH;
          const isRupiah = bulkCashAccount === '1102';
          const fxRate = parseFloat(cleanCommas(bulkPayRate)) || FALLBACK_IDR_PER_NTD;
          const paidRupiahWhole = isRupiah ? Math.round((op.amountCents / 100) * fxRate) : 0;
          
          const journalId = await getNextJournalId(bulkDate);
          const cfId = doc(collection(db, 'cashFlow')).id;
          
          transaction.set(doc(db, 'journalEntries', journalId), {
            id: journalId,
            date: Timestamp.fromDate(new Date(bulkDate)),
            description: `${orderData.orderCode || snap.id} - Pendapatan Diterima di Muka`,
            refType: 'sales_order_transfer_payment',
            refId: snap.id,
            isAuto: true,
            createdAt: Timestamp.now(),
            lines: [
              { account: targetCash.name, accountCode: targetCash.code, debit: op.amountCents, credit: 0, ...(isRupiah ? { originalCurrency: 'IDR', originalDebitIDR: paidRupiahWhole, originalCreditIDR: 0 } : {}) },
              { account: 'Pendapatan Diterima di Muka', accountCode: '2110', debit: 0, credit: op.amountCents, ...(isRupiah ? { originalCurrency: 'IDR', originalDebitIDR: 0, originalCreditIDR: paidRupiahWhole } : {}) }
            ]
          });
          
          transaction.set(doc(db, 'cashFlow', cfId), {
            id: cfId,
            date: Timestamp.fromDate(new Date(bulkDate)),
            ledger: isRupiah ? 'IDR' : 'NTD',
            direction: 'inflow',
            amount: isRupiah ? paidRupiahWhole : op.amountCents,
            notes: `${orderData.orderCode || snap.id} - Pendapatan Diterima di Muka`,
            category: 'operating',
            accountCode: targetCash.code,
            refId: snap.id
          });
          
          newGrid[op.r].status = 'success';
        }
      });

      setGrid(newGrid);
    } catch (err: any) {
      console.error(err);
      alert(`Gagal memposting bulk penerimaan: ${err.message}`);
    }
  };

  const usedCodes = grid.map(row => row.code.trim().toUpperCase()).filter(Boolean);
  const activeCode = grid[showSuggestFor ?? 0]?.code.trim().toUpperCase() || '';
  const suggestions = filteredOrders.filter(o => {
    const c = (o.orderCode || o.id).toUpperCase();
    if (!c.includes(activeCode)) return false;
    if (usedCodes.includes(c) && c !== activeCode) return false;
    return true;
  }).slice(0, 10);

  const sumGrid = grid.reduce((sum, row) => sum + (parseFloat(cleanCommas(row.amount)) || 0), 0);
  const lunasCount = grid.filter(r => r.status === 'success').length;
  const partialCount = grid.filter(r => r.status === 'partial').length;
  const errorCount = grid.filter(r => r.status === 'error').length;

  const icons = {
    users: <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6"/><path d="M2.5 19c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M16 4.3a3.2 3.2 0 0 1 0 6.2M20 19c-.5-2.2-1.8-3.7-3.6-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
    store: <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9v10h16V9M2 9l2-5h16l2 5M2 9h20" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 19v-5h6v5" stroke="currentColor" strokeWidth="1.6"/></svg>
  };

  return (
    <div className="income-page w-full" onKeyDown={(e) => {
      if (e.key === 'Escape') {
        if (showSuggestFor !== null) setShowSuggestFor(null);
        else if (isBulkModalOpen) setIsBulkModalOpen(false);
      }
    }}>
      <div className="page-container">
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" /> Penerimaan Transfer (Income)
            </h2>
          </div>
          <button className="btn-bulk" onClick={() => setIsBulkModalOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Terima Semua Transfer
          </button>
        </div>

        <div className="cards-row">
          <button 
            className={`p-card total ${activePlatform === 'semua' ? 'active' : ''}`}
            onClick={() => setActivePlatform('semua')}
          >
            <div className="icon">{icons.users}</div>
            <div className="label">Total Pendapatan Diterima di Muka</div>
            <div className="amount num">NT$ {(totalOutstandingAll / 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div className="sub">{totalCountAll} order outstanding</div>
          </button>

          {platformList.map(p => {
            const items = salesOrders.filter(o => (o.platformChannel || 'Other') === p);
            const sisa = items.reduce((s, o) => s + Math.max(0, getOutstanding(o)), 0);
            const count = items.filter(o => getOutstanding(o) > 0).length;

            return (
              <button 
                key={p}
                className={`p-card ${activePlatform === p ? 'active' : ''}`}
                onClick={() => setActivePlatform(p)}
              >
                <div className="icon">{icons.store}</div>
                <div className="label">{p}</div>
                <div className="amount num">NT$ {(sisa / 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div className="sub">{count} order outstanding</div>
              </button>
            );
          })}
        </div>

        <div className="table-card">
          <div className="table-card-head">
            <h2>{activePlatform === 'semua' ? 'Daftar Penerimaan Transfer' : `Daftar Penerimaan Transfer — ${activePlatform}`}</h2>
            <p>{filteredOrders.length} transaksi ditemukan.</p>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Kode Order</th>
                  <th>Pelanggan / Saluran</th>
                  <th>Tanggal</th>
                  <th className="ta-r">Total Order</th>
                  <th className="ta-r">Diterima</th>
                  <th className="ta-r">Sisa Transfer</th>
                  <th className="ta-c">Status</th>
                  <th className="ta-r">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(o => {
                  const sisa = getOutstanding(o);
                  const st = getStatus(o);
                  const d = o.createdAt ? new Date(o.createdAt.seconds * 1000) : null;
                  const dateStr = d ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` : '-';
                  
                  return (
                    <tr key={o.id}>
                      <td><span className="order-code">{o.orderCode || o.id}</span></td>
                      <td>
                        <span className="cust-name">{o.customerName}</span>
                        <span className="cust-sub">{o.orderType || '-'} · {o.platformChannel || '-'}</span>
                      </td>
                      <td style={{fontSize: '12.5px'}} className="num">{dateStr}</td>
                      <td className="ta-r"><span className="val-billed num">NT$ {((o.totalPrice || 0) / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></td>
                      <td className="ta-r"><span className="val-paid num">NT$ {((o.amountPaid || 0) / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></td>
                      <td className="ta-r">
                        <span className={`val-outstanding num ${sisa <= 0 ? 'zero' : ''}`}>
                          {sisa <= 0 ? '—' : `NT$ ${(sisa / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}`}
                        </span>
                      </td>
                      <td className="ta-c">
                        <span className="status-badge" style={{ '--sc': st.c, '--sb': st.bg } as React.CSSProperties}>
                          {st.label}
                        </span>
                      </td>
                      <td className="ta-r">
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn-row" 
                            disabled={sisa <= 0}
                            onClick={() => handleOpenPaymentModal(o)}
                          >
                            {sisa <= 0 ? 'Lunas' : 'Terima Bayar'}
                          </button>
                          {(o.amountPaid || 0) > 0 && (
                            <button
                              className="btn-row"
                              style={{ color: '#d93025', borderColor: '#d93025', backgroundColor: '#fff' }}
                              onClick={() => setReverseModalData(o)}
                            >
                              Batal
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredOrders.length === 0 && (
            <div className="empty-state">Tidak ada tagihan transfer untuk platform ini.</div>
          )}
        </div>

      </div>

      {/* MODAL: TERIMA SEMUA TRANSFER */}
      {isBulkModalOpen && (
        <div className="overlay open" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsBulkModalOpen(false); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Rekonsiliasi Penerimaan Transfer</h2>
                <p>Terima pembayaran transfer massal dari {activePlatform === 'semua' ? 'semua platform' : activePlatform}.</p>
              </div>
              <button className="modal-close" onClick={() => setIsBulkModalOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            
            <div className="modal-body" onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
              <div className="summary-pair">
                <div className="summary-box recv">
                  <div className="lbl">Total Terima Transfer</div>
                  <div className="val num">NT$ {sumGrid.toLocaleString('en-US', {minimumFractionDigits: 0})}</div>
                </div>
                <div className="summary-box total">
                  <div className="lbl">Total Transfer {activePlatform === 'semua' ? 'Semua Platform' : activePlatform}</div>
                  <div className="val num">NT$ {(outstandingPlatform / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                </div>
              </div>
              
              <div className="tb-row-2col" style={{ marginBottom: 16 }}>
                <div className="tb-field" style={{ marginBottom: 0 }}>
                  <label className="tb-label">Tanggal Transaksi Bayar *</label>
                  <div className="tb-date-wrap">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    <input type="date" className="tb-input" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
                  </div>
                </div>
                <div className="tb-field" style={{ marginBottom: 0 }}>
                  <label className="tb-label">Akun Penerima *</label>
                  <select className="tb-select" value={bulkCashAccount} onChange={e => setBulkCashAccount(e.target.value as '1101'|'1102')}>
                    <option value="1101">1101 - Cash: NTD</option>
                    <option value="1102">1102 - Cash: Rupiah</option>
                  </select>
                </div>
              </div>

              <div className="tb-field" style={{ marginBottom: 16 }}>
                <label className="tb-label">Kurs FX (IDR ➔ NT$) *</label>
                <input type="text" className="tb-input" disabled={true} value={bulkPayRate} onChange={e => setBulkPayRate(formatInputWithCommas(e.target.value))} />
              </div>
              
              {(lunasCount > 0 || partialCount > 0 || errorCount > 0) && (
                <div className="summary-banner">
                  {lunasCount > 0 && <span className="ok"><b>{lunasCount}</b> Lunas</span>}
                  {partialCount > 0 && <span className="partial"><b>{partialCount}</b> Dibayar Sebagian</span>}
                  {errorCount > 0 && <span className="fail"><b>{errorCount}</b> Tidak Ditemukan</span>}
                </div>
              )}
              
              <div className="grid-help">Paste data dari Excel/Sheets. Baris dengan Nomor Order kembar otomatis dinominalkan 0.</div>
              
              <div className="grid-wrap">
                <div className="grid-header-row">
                  <span>#</span>
                  <span>Nomor Order / Kode Referensi</span>
                  <span>Nominal Pelunasan (NT$)</span>
                  <span></span>
                </div>
                <div className="grid-scroll">
                  {grid.map((row, r) => (
                    <div key={r} className={`grid-row ${row.status || ''}`}>
                      <div className="row-num">{r + 1}</div>
                      
                      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <input 
                          id={`grid-input-${r}-0`}
                          value={row.code}
                          className={isSelected(r, 0) ? 'cell-selected' : ''}
                          onChange={(e) => handleGridChange(r, 0, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, r, 0)}
                          onPaste={(e) => handlePaste(e, r, 0)}
                          onMouseDown={(e) => { 
                            if (e.shiftKey && activeCell) { setSelectionEnd({r, c: 0}); } 
                            else { setActiveCell({r, c: 0}); setSelectionEnd({r, c: 0}); setIsDragging(true); } 
                          }}
                          onMouseEnter={() => { if (isDragging) setSelectionEnd({r, c: 0}); }}
                          onFocus={(e) => { 
                            if (!isDragging) {
                              if (activeCell?.r !== r || activeCell?.c !== 0) { setActiveCell({r, c: 0}); setSelectionEnd({r, c: 0}); }
                              setShowSuggestFor(r);
                            }
                          }}
                          onBlur={() => { setTimeout(() => { if (showSuggestFor === r) setShowSuggestFor(null); }, 200); }}
                          placeholder="Ketik/Paste order..."
                        />
                        {showSuggestFor === r && suggestions.length > 0 && (
                          <div className="order-suggest" style={{ position: 'absolute', top: '100%', left: 0, width: '100%' }}>
                            {suggestions.map((s, i) => (
                              <div 
                                key={s.id} 
                                className="order-suggest-item"
                                style={{ backgroundColor: i === suggestIdx ? 'var(--blue-50)' : '' }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectSuggestion(s, r);
                                }}
                              >
                                <span className="oi-no">{s.orderCode || s.id}</span>
                                <span className="oi-cust">{s.customerName}</span>
                                <span className="oi-amt">NT$ {(getOutstanding(s)/100).toLocaleString('en-US')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <input 
                          id={`grid-input-${r}-1`}
                          value={row.amount}
                          className={isSelected(r, 1) ? 'cell-selected' : ''}
                          onChange={(e) => handleGridChange(r, 1, formatInputWithCommas(e.target.value))}
                          onKeyDown={(e) => handleKeyDown(e, r, 1)}
                          onPaste={(e) => handlePaste(e, r, 1)}
                          onMouseDown={(e) => { 
                            if (e.shiftKey && activeCell) { setSelectionEnd({r, c: 1}); } 
                            else { setActiveCell({r, c: 1}); setSelectionEnd({r, c: 1}); setIsDragging(true); } 
                          }}
                          onMouseEnter={() => { if (isDragging) setSelectionEnd({r, c: 1}); }}
                          onFocus={() => { 
                            if (!isDragging) {
                              if (activeCell?.r !== r || activeCell?.c !== 1) { setActiveCell({r, c: 1}); setSelectionEnd({r, c: 1}); }
                            }
                          }}
                          placeholder="0"
                        />
                      </div>

                      <div className={`row-status ${row.status || ''}`}>
                        {row.status === 'success' && <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        {row.status === 'partial' && <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
                        {row.status === 'error' && <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="modal-foot" style={{ marginTop: 16, padding: '16px 0 0', borderTop: 'none', background: 'transparent' }}>
                <div className="grid-status-text">
                   {activeCell ? `Sel terpilih: ${Math.abs((selectionEnd?.r ?? activeCell.r) - activeCell.r) + 1} baris x ${Math.abs((selectionEnd?.c ?? activeCell.c) - activeCell.c) + 1} kolom` : 'Siap'}
                </div>
                <div className="modal-foot-actions">
                  <button className="btn-cancel" onClick={() => setIsBulkModalOpen(false)}>Batal</button>
                  <button className="btn-process" onClick={handleProcessBulk}>Proses Penerimaan Massal</button>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      )}

      {/* Modal Terima Bayar (Per Baris) */}
      {isPayModalOpen && selectedItem && (
        <div className="overlay open" onClick={(e) => { if (e.target === e.currentTarget) handleClosePaymentModal(); }}>
          <div className="tb-modal" style={{ maxWidth: '440px', borderRadius: '24px', padding: '0', overflow: 'hidden' }}>
            
            {/* Header */}
            <div className="tb-head" style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="tb-title" style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💰</span>
                <span>{modalIsForm2 ? 'Bayar Sisa' : 'Rekonsiliasi Penerimaan Transfer'}</span>
              </div>
              <button className="tb-close" onClick={handleClosePaymentModal} style={{ background: '#f4f4f5', border: 'none', borderRadius: '9999px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="tb-body" style={{ padding: '0 24px 24px' }}>
              
              {/* Info Card */}
              <div style={{ backgroundColor: '#f4f4f5', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#71717a', marginBottom: '8px' }}>
                  <span>Kode Order</span>
                  <b style={{ color: '#09090b', fontFamily: 'monospace', fontSize: '14px', fontWeight: 700 }}>
                    {orderCodeFormatted}
                  </b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#71717a', marginBottom: '8px' }}>
                  <span>Nama Pelanggan</span>
                  <b style={{ color: '#09090b', fontWeight: 800 }}>{selectedItem.customerName || '–'}</b>
                </div>

                {modalIsForm2 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#71717a', marginBottom: '8px' }}>
                    <span>Sudah Dibayar</span>
                    <b style={{ color: '#09090b', fontWeight: 700, fontFamily: 'monospace' }}>
                      NT$ {(modalAmountPaidCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </b>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#71717a' }}>
                  <span>Sisa Outstanding</span>
                  <b style={{ color: '#166534', fontSize: '15px', fontWeight: 800, fontFamily: 'monospace' }}>
                    NT$ {modalSisaNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </b>
                </div>
              </div>

              {/* Toggle Pills (Only in Form 1) */}
              {!modalIsForm2 && (
                <div style={{ backgroundColor: '#f4f4f5', borderRadius: '14px', padding: '4px', display: 'flex', gap: '4px', marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => handleModeChange('lunas')}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      backgroundColor: paymentMode === 'lunas' ? '#18181b' : 'transparent',
                      color: paymentMode === 'lunas' ? '#ffffff' : '#52525b',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Lunas Penuh
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('sebagian')}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      backgroundColor: paymentMode === 'sebagian' ? '#18181b' : 'transparent',
                      color: paymentMode === 'sebagian' ? '#ffffff' : '#52525b',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Bayar Sebagian
                  </button>
                </div>
              )}

              {/* Form Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* TANGGAL TRANSAKSI BAYAR */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    TANGGAL TRANSAKSI BAYAR *
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#18181b',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* AKUN PENERIMA */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    AKUN PENERIMA *
                  </label>
                  <select
                    value={cashAccount}
                    onChange={(e) => handleCashAccountChange(e.target.value as '1101' | '1102')}
                    style={{
                      width: '100%',
                      backgroundColor: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#18181b',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="1101">1101 · Cash: NTD</option>
                    <option value="1102">1102 · Cash: Rupiah</option>
                  </select>
                </div>

                {/* KURS FX (Only shown when Akun Penerima = 1102 Cash: Rupiah) */}
                {cashAccount === '1102' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      KURS FX (IDR ➔ NT$) *
                    </label>
                    <input
                      type="text"
                      disabled
                      value={payRate}
                      style={{
                        width: '100%',
                        backgroundColor: '#e4e4e7',
                        border: '1px solid #d4d4d8',
                        borderRadius: '12px',
                        padding: '10px 14px',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#52525b',
                        cursor: 'not-allowed'
                      }}
                    />
                  </div>
                )}

                {/* NOMINAL PENERIMAAN (NT$) - LOCKED */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    NOMINAL PENERIMAAN (NT$)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`NT$ ${nominalPenerimaanNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    style={{
                      width: '100%',
                      backgroundColor: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#18181b',
                      cursor: 'not-allowed',
                      fontFamily: 'monospace'
                    }}
                  />
                  {/* Mode Bayar Sebagian: Hint & Warning */}
                  {!modalIsForm2 && paymentMode === 'sebagian' && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#71717a' }}>
                      <div>Sisa Outstanding setelah transaksi ini: <b>NT$ {Math.max(0, modalSisaNTD - nominalPenerimaanNTD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
                      {nominalPenerimaanNTD >= modalSisaNTD && (
                        <div style={{ color: '#d97706', fontWeight: 700, marginTop: '2px' }}>
                          Jumlah ini menutup semua sisa — gunakan mode Lunas Penuh.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* JUMLAH DITERIMA SEBENARNYA */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    JUMLAH DITERIMA SEBENARNYA ({cashAccount === '1102' ? 'IDR' : 'NT$'}) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={diterimaInput}
                    onChange={(e) => handleDiterimaInputChange(e.target.value)}
                    placeholder="0"
                    style={{
                      width: '100%',
                      backgroundColor: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#18181b',
                      outline: 'none',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>

                {/* ESTIMASI SELISIH (Only in Lunas Penuh / Form 2) */}
                {(modalIsForm2 || paymentMode === 'lunas') && (
                  <div style={{ backgroundColor: '#f4f4f5', borderRadius: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#3f3f46' }}>Estimasi Selisih</span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      color: Math.abs(selisihNTD) < 0.01 ? '#18181b' : (selisihNTD > 0 ? '#15803d' : '#b91c1c')
                    }}>
                      {Math.abs(selisihNTD) < 0.01 
                        ? 'NT$ 0.00' 
                        : `${selisihNTD > 0 ? '+ ' : '- '}NT$ ${absSelisihNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                )}

              </div>

              {/* Modal Foot Actions */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={handleClosePaymentModal}
                  style={{
                    flex: 1,
                    backgroundColor: '#f4f4f5',
                    color: '#27272a',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSavePayment}
                  style={{
                    flex: 2,
                    backgroundColor: modalIsForm2 ? '#3b5974' : '#135d46',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  Posting Transaksi Penerimaan
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL: KONFIRMASI SELISIH KURS */}
      {confirmDiffData && (
        <div className="overlay open" style={{ zIndex: 120 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDiffData(null); }}>
          <div className="modal" style={{ maxWidth: '420px', borderRadius: '20px', padding: '24px' }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 6px', color: '#18181b' }}>Konfirmasi Selisih Kurs</h3>
              <p style={{ fontSize: '13px', color: '#52525b', margin: 0, lineHeight: 1.5 }}>
                Terdapat selisih antara Nominal Penerimaan dan Jumlah Diterima Sebenarnya.
              </p>
            </div>

            <div style={{ backgroundColor: '#f4f4f5', borderRadius: '12px', padding: '14px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Nominal Penerimaan:</span>
                <b style={{ fontFamily: 'monospace' }}>NT$ {confirmDiffData.nominalNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Diterima Sebenarnya:</span>
                <b style={{ fontFamily: 'monospace' }}>
                  NT$ {confirmDiffData.diterimaNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {cashAccount === '1102' && ` (Rp ${confirmDiffData.rawDiterimaNum.toLocaleString('en-US')})`}
                </b>
              </div>
              <div style={{ borderTop: '1px dashed #d4d4d8', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Selisih:</span>
                <b style={{ color: confirmDiffData.isGain ? '#15803d' : '#b91c1c', fontFamily: 'monospace' }}>
                  NT$ {Math.abs(confirmDiffData.selisihNTD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </b>
              </div>
            </div>

            <p style={{ fontSize: '12px', backgroundColor: '#fef3c7', color: '#92400e', padding: '10px 12px', borderRadius: '8px', margin: '0 0 20px', lineHeight: 1.4 }}>
              Selisih ini sebesar <b>NT$ {Math.abs(confirmDiffData.selisihNTD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> akan dicatat sebagai <b>{confirmDiffData.isGain ? 'Untung' : 'Rugi'} Selisih Kurs (4210)</b>.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmDiffData(null)}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#f4f4f5',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#3f3f46',
                  cursor: 'pointer'
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executePostingTransaction}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#135d46',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                Ya, Posting Transaksi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: KONFIRMASI REVERSE PELUNASAN */}
      {reverseModalData && (
        <div className="overlay open" onMouseDown={(e) => { if (e.target === e.currentTarget) setReverseModalData(null); }}>
          <div className="modal" style={{ maxWidth: '400px' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Batalkan Penerimaan</h2>
                <p>Order {reverseModalData.orderCode || reverseModalData.id}</p>
              </div>
              <button className="modal-close" onClick={() => setReverseModalData(null)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px 20px', lineHeight: '1.5' }}>
              <p>Membatalkan penerimaan transfer akan <b>menghapus seluruh riwayat pembayaran</b> untuk order ini sebesar <b>NT$ {((reverseModalData.amountPaid || 0)/100).toLocaleString('en-US')}</b> dan mengembalikannya ke status <b>Belum Dibayar</b>.</p>
              <p style={{ marginTop: '12px' }}>Jurnal akuntansi terkait juga akan dihapus.</p>
            </div>
            <div className="tb-foot">
              <button className="tb-btn-cancel" onClick={() => setReverseModalData(null)}>Kembali</button>
              <button className="tb-btn-post" style={{ background: '#d93025', color: '#fff' }} onClick={handleConfirmReverse}>Konfirmasi Pembatalan</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
