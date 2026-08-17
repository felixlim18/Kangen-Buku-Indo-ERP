import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { FALLBACK_IDR_PER_NTD } from '../lib/exchangeRateConstants';
import { collection, onSnapshot, doc, runTransaction, Timestamp, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../lib/auth-context';
import { AUTO_ACCOUNTS, ensureAutoAccountExists, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { isPeriodClosed, fetchCurrentExchangeRate } from '../lib/period-closing-utils';
import { Receipt, Plus, X } from 'lucide-react';
import './PiutangTab.css';

type Cell = { r: number; c: number };
type GridRow = { code: string; amount: string; status?: 'success'|'partial'|'error'|null; msg?: string };

export const PiutangTab: React.FC = () => {
  const { user } = useAuth();
  
  // Real-time data
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [manualReceivables, setManualReceivables] = useState<any[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);
  const [liveExchangeRate, setLiveExchangeRate] = useState<number>(FALLBACK_IDR_PER_NTD);

  // UI states
  const [activePlatform, setActivePlatform] = useState<string>('semua');

  // Modal Single states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [reverseModalData, setReverseModalData] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [cashAccount, setCashAccount] = useState<'1101' | '1102'>('1101');
  const [payRate, setPayRate] = useState('');
  const [liveAccounts, setLiveAccounts] = useState<Record<string, AutoAccount>>(AUTO_ACCOUNTS);

  // Manual Receivable modal states
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDebtorName, setManualDebtorName] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCurrency, setManualCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [manualFxRate, setManualFxRate] = useState(String(FALLBACK_IDR_PER_NTD));
  const [manualCreditAccountCode, setManualCreditAccountCode] = useState('');
  const [manualTermsDays, setManualTermsDays] = useState<30 | 60 | 90>(30);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualNotes, setManualNotes] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  
  useEffect(() => {
    getLiveAutoAccounts().then(setLiveAccounts).catch(console.error);
  }, []);
  
  const [payDate, setPayDate] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  });

  // Bulk Modal states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(payDate);
  const [bulkCashAccount, setBulkCashAccount] = useState<'1101'|'1102'>('1101');
  const [bulkPayRate, setBulkPayRate] = useState(String(FALLBACK_IDR_PER_NTD));
  const [grid, setGrid] = useState<GridRow[]>(() => Array.from({ length: 20 }, () => ({ code: '', amount: '' })));
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
    const unsubSales = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const oList: any[] = [];
      snap.forEach((d) => {
        const o = d.data();
        const isPiutang = o.wasPiutang === true || 
                          o.paymentStatus === 'unpaid' || 
                          o.paymentStatus === 'partial' || 
                          o.isUnpaid === true || 
                          o.paymentMethod === 'Unpaid' || 
                          o.paymentMethod === 'Belum Dibayar';
        if ((o.status === 'completed' || o.status === 'shipped') && isPiutang) {
          oList.push({ id: d.id, source: 'so', ...o });
        }
      });
      setSalesOrders(oList.sort((a, b) => (b.completedAt?.seconds || b.createdAt?.seconds) - (a.completedAt?.seconds || a.createdAt?.seconds)));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    const unsubManual = onSnapshot(collection(db, 'manualReceivables'), (snap) => {
      const mList: any[] = [];
      snap.forEach((d) => {
        const m = d.data();
        if (m.paymentStatus === 'paid') return; // lunas, tidak perlu tampil di daftar outstanding
        mList.push({
          id: d.id,
          source: 'manual',
          orderCode: m.receivableCode,
          orderNumber: '',
          customerName: m.debtorName,
          platformChannel: 'Manual',
          orderType: 'Piutang Manual',
          pickupLogistics: m.notes || '-',
          totalPrice: m.amountNTD || 0,
          amountPaid: m.amountPaid || 0,
          paymentStatus: m.paymentStatus,
          dueDate: m.dueDate || null,
          createdAt: m.createdAt,
          creditAccountCode: m.creditAccountCode,
          creditAccountName: m.creditAccountName
        });
      });
      setManualReceivables(mList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, err => console.error("Manual receivables snapshot error:", err));

    const unsubCoa = onSnapshot(collection(db, 'coa'), (snap) => {
      setCoaAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error("CoA snapshot error:", err));

    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      unsubSales();
      unsubManual();
      unsubCoa();
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Gabungan piutang dari Sales Order + Piutang Manual, untuk tampilan/aggregasi terpadu
  const allPiutangItems = [...salesOrders, ...manualReceivables];

  const getOutstanding = (item: any) => (item.totalPrice || 0) - (item.amountPaid || 0);

  const getStatus = (item: any) => {
    const sisa = getOutstanding(item);
    if (sisa <= 0) return { label: 'Dibayar', c: 'var(--green)', bg: 'var(--green-bg)', class: 'dibayar' };
    if ((item.amountPaid || 0) > 0) return { label: 'Sebagian', c: 'var(--teal)', bg: 'var(--teal-bg)', class: 'sebagian' };
    return { label: 'Belum Dibayar', c: 'var(--amber)', bg: 'var(--amber-bg)', class: 'belum' };
  };

  const platforms = Array.from(new Set(allPiutangItems.map(o => o.platformChannel || 'Other')));
  const platformList = platforms.length > 0 ? platforms : ['7-Eleven', 'FamilyMart', 'IopenMall', 'Shopee'];

  const filteredOrdersUnsorted = activePlatform === 'semua'
    ? allPiutangItems
    : allPiutangItems.filter(o => (o.platformChannel || 'Other') === activePlatform);

  const filteredOrders = [...filteredOrdersUnsorted].sort((a, b) => {
    const sisaA = getOutstanding(a);
    const sisaB = getOutstanding(b);
    const lunasA = sisaA <= 0;
    const lunasB = sisaB <= 0;

    if (lunasA !== lunasB) {
      return lunasA ? 1 : -1;
    }

    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeB - timeA;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activePlatform]);

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const searchedSum = filteredOrders.reduce((sum, order) => sum + getOutstanding(order), 0);


  const totalOutstandingAll = allPiutangItems.reduce((acc, so) => acc + Math.max(0, getOutstanding(so)), 0);
  const totalCountAll = allPiutangItems.filter(so => getOutstanding(so) > 0).length;

  const outstandingPlatform = activePlatform === 'semua' 
    ? totalOutstandingAll 
    : filteredOrders.reduce((acc, so) => acc + Math.max(0, getOutstanding(so)), 0);

  const handleOpenPaymentModal = (item: any) => {
    setSelectedItem(item);
    setPayAmount(String(Math.round(getOutstanding(item) / 100)));
    setCashAccount('1101');
    setPayRate(String(liveExchangeRate || FALLBACK_IDR_PER_NTD));
    setIsPayModalOpen(true);
  };

  const handleClosePaymentModal = () => {
    setIsPayModalOpen(false);
    setSelectedItem(null);
    setPayAmount('');
  };

  const handleConfirmReverse = async () => {
    if (!reverseModalData) return;
    try {
      const order = reverseModalData;
      const journalSnap = await getDocs(query(collection(db, 'journalEntries'), where('refId', '==', order.id), where('refType', '==', 'sales_order_payment')));
      const cfSnap = await getDocs(query(collection(db, 'cashFlow'), where('refId', '==', order.id)));
      
      const journalRefs = journalSnap.docs.map(d => d.ref);
      const cfRefs = cfSnap.docs
         .filter(d => d.data().category === 'operating' && d.data().notes?.includes('Terima Piutang'))
         .map(d => d.ref);

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, order.source === 'manual' ? 'manualReceivables' : 'salesOrders', order.id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Data piutang tidak ditemukan");

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
      alert(`Gagal membatalkan pelunasan: ${err.message}`);
    }
  };

  const handleSavePayment = async () => {
    if (!selectedItem) return;

    const parsedAmount = parseFloat(cleanCommas(payAmount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Masukkan nominal pembayaran yang valid.");
      return;
    }
    const payAmountCents = Math.round(parsedAmount * 100);
    const fxRate = parseFloat(cleanCommas(payRate)) || FALLBACK_IDR_PER_NTD;
    const outstanding = getOutstanding(selectedItem);

    if (payAmountCents > outstanding + 10) {
      alert(`Nominal pembayaran melebihi sisa piutang: NT$ ${(outstanding / 100).toLocaleString('en-US')}`);
      return;
    }

    try {
      const isManual = selectedItem.source === 'manual';
      const orderRef = doc(db, isManual ? 'manualReceivables' : 'salesOrders', selectedItem.id);
      const journalId = await getNextJournalId(payDate);
      const cfId = doc(collection(db, 'cashFlow')).id;

      await ensureAutoAccountExists({ code: '1110', name: 'Piutang Usaha', type: 'Assets', subType: 'Aset Lancar' });
      await ensureAutoAccountExists(cashAccount === '1101' ? AUTO_ACCOUNTS.CASH_NTD : AUTO_ACCOUNTS.CASH_RUPIAH);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(orderRef);
        if (!snap.exists()) throw new Error("Data piutang tidak ditemukan");

        const order = snap.data();
        const curPaid = order.amountPaid || 0;
        const nextPaid = curPaid + payAmountCents;
        const isFullyPaid = nextPaid >= (order.totalPrice || 0) - 5;

        transaction.update(orderRef, {
          amountPaid: nextPaid,
          paymentStatus: isFullyPaid ? 'paid' : 'partial',
          ...(isManual ? {} : { isUnpaid: !isFullyPaid, wasPiutang: true }),
          updatedAt: Timestamp.now()
        });

        const targetCash = cashAccount === '1101' ? AUTO_ACCOUNTS.CASH_NTD : AUTO_ACCOUNTS.CASH_RUPIAH;
        const isRupiah = cashAccount === '1102';
        const paidRupiahWhole = isRupiah ? Math.round(parsedAmount * fxRate) : 0;

        transaction.set(doc(db, 'journalEntries', journalId), {
          id: journalId,
          date: Timestamp.fromDate(new Date(payDate)),
          description: `Terima Pembayaran Piutang ${isManual ? 'Manual' : 'SO'} ${order.orderCode || order.receivableCode || selectedItem.id} - ${order.customerName || order.debtorName}`,
          refType: 'sales_order_payment',
          refId: selectedItem.id,
          isAuto: true,
          createdAt: Timestamp.now(),
          lines: [
            { account: targetCash.name, accountCode: targetCash.code, debit: payAmountCents, credit: 0, ...(isRupiah ? { originalCurrency: 'IDR', originalDebitIDR: paidRupiahWhole, originalCreditIDR: 0 } : {}) },
            { account: 'Piutang Usaha', accountCode: '1110', debit: 0, credit: payAmountCents, ...(isRupiah ? { originalCurrency: 'IDR', originalDebitIDR: 0, originalCreditIDR: paidRupiahWhole } : {}) }
          ]
        });

        transaction.set(doc(db, 'cashFlow', cfId), {
          id: cfId,
          date: Timestamp.fromDate(new Date(payDate)),
          ledger: isRupiah ? 'IDR' : 'NTD',
          direction: 'inflow',
          amount: isRupiah ? paidRupiahWhole : payAmountCents,
          notes: `Terima Piutang ${order.orderCode || order.receivableCode || selectedItem.id} - ${order.customerName || order.debtorName}`,
          category: 'operating',
          accountCode: targetCash.code,
          refId: selectedItem.id
        });
      });

      handleClosePaymentModal();
    } catch (err: any) {
      console.error(err);
      alert(`Gagal memposting pembayaran: ${err.message}`);
    }
  };

  // --- GRID LOGIC ---

  const findMatchedOrder = (codeStr: string) => {
    const clean = codeStr.trim().toUpperCase();
    if (!clean) return null;
    return filteredOrders.find(o =>
      (o.orderCode || o.id).toUpperCase() === clean ||
      (o.orderNumber && o.orderNumber.toUpperCase() === clean)
    ) || allPiutangItems.find(o =>
      (o.orderCode || o.id).toUpperCase() === clean ||
      (o.orderNumber && o.orderNumber.toUpperCase() === clean)
    );
  };

  const resetManualForm = () => {
    setManualDebtorName('');
    setManualAmount('');
    setManualCurrency('NTD');
    setManualFxRate(String(liveExchangeRate || FALLBACK_IDR_PER_NTD));
    setManualCreditAccountCode('');
    setManualTermsDays(30);
    setManualDate(new Date().toISOString().split('T')[0]);
    setManualNotes('');
  };

  const handleAddManualReceivable = async () => {
    if (!manualDebtorName.trim() || !manualAmount || !manualCreditAccountCode) {
      alert('Lengkapi nama pengutang, nominal, dan akun lawan.');
      return;
    }
    const parsedAmount = parseFloat(cleanCommas(manualAmount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Masukkan nominal yang valid.');
      return;
    }
    if (manualCreditAccountCode === '1110') {
      alert('Akun lawan tidak boleh Piutang Usaha (1110) itu sendiri.');
      return;
    }

    const fxRate = parseFloat(cleanCommas(manualFxRate)) || FALLBACK_IDR_PER_NTD;
    const amountCents = Math.round(parsedAmount * 100);
    let amountNTDCents = amountCents;
    let amountIDRWhole = 0;
    if (manualCurrency === 'IDR') {
      amountIDRWhole = parsedAmount;
      amountNTDCents = Math.round((parsedAmount / fxRate) * 100);
    }

    setIsSubmittingManual(true);
    try {
      const creditAccount = coaAccounts.find(a => a.code === manualCreditAccountCode);
      const creditAccountName = creditAccount?.name || manualCreditAccountCode;

      const receivableId = doc(collection(db, 'manualReceivables')).id;
      const dateObj = new Date(manualDate);
      const yy = String(dateObj.getFullYear()).substring(2);
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const yymmdd = `${yy}${mm}${dd}`;

      const existingSnap = await getDocs(collection(db, 'manualReceivables'));
      let sequence = 1;
      existingSnap.forEach(d => {
        const code = d.data().receivableCode || '';
        if (code.startsWith(`PT${yymmdd}`)) {
          const parsedSeq = parseInt(code.substring(8), 10);
          if (!isNaN(parsedSeq) && parsedSeq >= sequence) sequence = parsedSeq + 1;
        }
      });
      const receivableCode = `PT${yymmdd}${String(sequence).padStart(3, '0')}`;

      const dueDateObj = new Date(manualDate);
      dueDateObj.setDate(dueDateObj.getDate() + manualTermsDays);
      const dueDateStr = dueDateObj.toISOString().split('T')[0];

      await ensureAutoAccountExists({ code: '1110', name: 'Piutang Usaha', type: 'Assets', subType: 'Aset Lancar' });

      const journalId = await getNextJournalId(manualDate);

      await runTransaction(db, async (transaction) => {
        transaction.set(doc(db, 'manualReceivables', receivableId), {
          id: receivableId,
          receivableCode,
          debtorName: manualDebtorName.trim(),
          amountNTD: amountNTDCents,
          amountIDR: amountIDRWhole,
          currency: manualCurrency,
          exchangeRate: fxRate,
          creditAccountCode: manualCreditAccountCode,
          creditAccountName,
          paymentTermsDays: manualTermsDays,
          dueDate: dueDateStr,
          notes: manualNotes || '',
          amountPaid: 0,
          paymentStatus: 'unpaid',
          journalId,
          createdAt: Timestamp.now(),
          createdBy: user?.uid || 'anonymous'
        });

        transaction.set(doc(db, 'journalEntries', journalId), {
          id: journalId,
          date: Timestamp.fromDate(new Date(manualDate)),
          description: `Piutang Manual ${receivableCode} - ${manualDebtorName.trim()}`,
          refType: 'manual_receivable',
          refId: receivableId,
          isAuto: true,
          createdAt: Timestamp.now(),
          lines: [
            { account: 'Piutang Usaha', accountCode: '1110', debit: amountNTDCents, credit: 0 },
            { account: creditAccountName, accountCode: manualCreditAccountCode, debit: 0, credit: amountNTDCents }
          ]
        });
      });

      setIsManualModalOpen(false);
      resetManualForm();
      alert(`Piutang manual ${receivableCode} berhasil dicatat.`);
    } catch (err: any) {
      console.error(err);
      alert(`Gagal mencatat piutang manual: ${err.message}`);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const isSelected = (r: number, c: number) => {
    if (!activeCell) return false;
    const r1 = Math.min(activeCell.r, selectionEnd?.r ?? activeCell.r);
    const r2 = Math.max(activeCell.r, selectionEnd?.r ?? activeCell.r);
    const c1 = Math.min(activeCell.c, selectionEnd?.c ?? activeCell.c);
    const c2 = Math.max(activeCell.c, selectionEnd?.c ?? activeCell.c);
    return r >= r1 && r <= r2 && c >= c1 && c <= c2;
  };

  const handleResetGrid = () => {
    setGrid(Array.from({ length: 20 }, () => ({ code: '', amount: '' })));
    setActiveCell(null);
    setSelectionEnd(null);
    setShowSuggestFor(null);
  };

  const applyUniqueConstraint = (newGrid: GridRow[]) => {
    const seenOrderKeys = new Set<string>();
    return newGrid.map(row => {
      const code = row.code.trim().toUpperCase();
      if (!code) return { ...row, amount: '', status: null, msg: undefined };
      const matched = findMatchedOrder(code);
      const key = matched ? matched.id : code;
      if (seenOrderKeys.has(key)) return { ...row, amount: '0' };
      seenOrderKeys.add(key);
      return row;
    });
  };

  const handleGridChange = (r: number, c: number, val: string) => {
    let newGrid = grid.map(row => ({...row}));
    newGrid[r] = { ...newGrid[r], [c === 0 ? 'code' : 'amount']: val, status: null, msg: undefined };
    
    if (c === 0) {
      const cVal = val.trim().toUpperCase();
      if (!cVal) {
        newGrid[r].amount = '';
      } else {
        const matchedOrder = findMatchedOrder(cVal);
        if (matchedOrder && (!newGrid[r].amount || newGrid[r].amount === '0')) {
          newGrid[r].amount = String(Math.round(getOutstanding(matchedOrder) / 100));
        }
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
      if (c1 <= 0 && c2 >= 0) {
        newGrid[i].amount = '';
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
        const matched = findMatchedOrder(codeVal);
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
    const typed = newGrid[r].code.trim().toUpperCase();
    const sOrdNo = (s.orderNumber || '').toUpperCase();
    const sDocCode = (s.orderCode || s.id).toUpperCase();

    if (sOrdNo && sOrdNo.includes(typed) && !sDocCode.includes(typed)) {
      newGrid[r].code = s.orderNumber;
    } else {
      newGrid[r].code = s.orderCode || s.id;
    }

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

    let newGrid = grid.map(r => ({...r}));
    let ops: any[] = [];
    let hasError = false;

    for (let i = 0; i < grid.length; i++) {
      const row = grid[i];
      const cVal = row.code.trim().toUpperCase();
      if (!cVal) continue;
      
      const amtCents = Math.round((parseFloat(cleanCommas(row.amount)) || 0) * 100);
      const matchedOrder = findMatchedOrder(cVal);
      
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
      await ensureAutoAccountExists({ code: '1110', name: 'Piutang Usaha', type: 'Assets', subType: 'Aset Lancar' });
      await ensureAutoAccountExists(bulkCashAccount === '1101' ? AUTO_ACCOUNTS.CASH_NTD : AUTO_ACCOUNTS.CASH_RUPIAH);

      await runTransaction(db, async (transaction) => {
        const orderRefs = ops.map(op => doc(db, op.order.source === 'manual' ? 'manualReceivables' : 'salesOrders', op.order.id));
        const orderSnaps = await Promise.all(orderRefs.map(ref => transaction.get(ref)));

        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          const snap = orderSnaps[i];
          const isManual = op.order.source === 'manual';
          if (!snap.exists()) throw new Error(`${isManual ? 'Piutang manual' : 'Order'} ${op.order.orderCode} hilang`);

          const orderData = snap.data();
          const curPaid = orderData.amountPaid || 0;
          const nextPaid = curPaid + op.amountCents;
          const isFullyPaid = nextPaid >= (orderData.totalPrice || 0) - 5;

          transaction.update(snap.ref, {
            amountPaid: nextPaid,
            paymentStatus: isFullyPaid ? 'paid' : 'partial',
            ...(isManual ? {} : { isUnpaid: !isFullyPaid, wasPiutang: true }),
            updatedAt: Timestamp.now()
          });

          const targetCash = bulkCashAccount === '1101' ? AUTO_ACCOUNTS.CASH_NTD : AUTO_ACCOUNTS.CASH_RUPIAH;
          const isRupiah = bulkCashAccount === '1102';
          const fxRate = parseFloat(cleanCommas(bulkPayRate)) || FALLBACK_IDR_PER_NTD;
          const paidRupiahWhole = isRupiah ? Math.round((op.amountCents / 100) * fxRate) : 0;

          const journalId = await getNextJournalId(bulkDate);
          const cfId = doc(collection(db, 'cashFlow')).id;
          const displayCode = orderData.orderCode || orderData.receivableCode || snap.id;
          const displayName = orderData.customerName || orderData.debtorName;

          transaction.set(doc(db, 'journalEntries', journalId), {
            id: journalId,
            date: Timestamp.fromDate(new Date(bulkDate)),
            description: `Terima Pembayaran Piutang ${isManual ? 'Manual' : 'SO'} ${displayCode} - ${displayName}`,
            refType: 'sales_order_payment',
            refId: snap.id,
            isAuto: true,
            createdAt: Timestamp.now(),
            lines: [
              { account: targetCash.name, accountCode: targetCash.code, debit: op.amountCents, credit: 0, ...(isRupiah ? { originalCurrency: 'IDR', originalDebitIDR: paidRupiahWhole, originalCreditIDR: 0 } : {}) },
              { account: 'Piutang Usaha', accountCode: '1110', debit: 0, credit: op.amountCents, ...(isRupiah ? { originalCurrency: 'IDR', originalDebitIDR: 0, originalCreditIDR: paidRupiahWhole } : {}) }
            ]
          });

          transaction.set(doc(db, 'cashFlow', cfId), {
            id: cfId,
            date: Timestamp.fromDate(new Date(bulkDate)),
            ledger: isRupiah ? 'IDR' : 'NTD',
            direction: 'inflow',
            amount: isRupiah ? paidRupiahWhole : op.amountCents,
            notes: `Terima Piutang ${displayCode} - ${displayName}`,
            category: 'operating',
            accountCode: targetCash.code,
            refId: snap.id
          });

          newGrid[op.r].status = isFullyPaid ? 'success' : 'partial';
        }
      });

      alert(`Berhasil memproses pelunasan massal (${ops.length} transaksi).`);
      handleResetGrid();
    } catch (err: any) {
      console.error(err);
      alert(`Gagal memposting bulk pelunasan: ${err.message}`);
    }
  };

  const usedCodes = grid.map(row => row.code.trim().toUpperCase()).filter(Boolean);
  const activeCode = grid[showSuggestFor ?? 0]?.code.trim().toUpperCase() || '';
  const searchPool = activePlatform === 'semua' ? allPiutangItems : filteredOrders;
  const suggestions = searchPool.filter(o => {
    const c1 = (o.orderCode || o.id).toUpperCase();
    const c2 = (o.orderNumber || '').toUpperCase();
    const matchesCode = c1.includes(activeCode) || c2.includes(activeCode);
    if (!matchesCode) return false;
    
    const isUsed = usedCodes.some(uc => uc === c1 || (c2 && uc === c2));
    if (isUsed && c1 !== activeCode && c2 !== activeCode) return false;
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
    <div className="piutang-page w-full" onKeyDown={(e) => {
      if (e.key === 'Escape') {
        if (showSuggestFor !== null) setShowSuggestFor(null);
        else if (isBulkModalOpen) setIsBulkModalOpen(false);
      }
    }}>
      <div className="page-container">
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-indigo-500" /> Piutang Usaha
            </h2>
          </div>
          <div className="flex gap-2">
            <button className="btn-bulk" style={{ backgroundColor: 'transparent', color: 'var(--indigo, #4f46e5)', border: '1px solid var(--indigo, #4f46e5)' }} onClick={() => { resetManualForm(); setIsManualModalOpen(true); }}>
              <Plus className="h-4 w-4" />
              Tambah Piutang Manual
            </button>
            <button className="btn-bulk" onClick={() => setIsBulkModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Terima Semua Piutang
            </button>
          </div>
        </div>

        <div className="cards-row">
          <button 
            className={`p-card total ${activePlatform === 'semua' ? 'active' : ''}`}
            onClick={() => setActivePlatform('semua')}
          >
            <div className="icon">{icons.users}</div>
            <div className="label">Total Piutang Usaha</div>
            <div className="amount num">NT$ {(totalOutstandingAll / 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div className="sub">{totalCountAll} order outstanding</div>
          </button>

          {platformList.map(p => {
            const items = allPiutangItems.filter(o => (o.platformChannel || 'Other') === p);
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
            <h2>{activePlatform === 'semua' ? 'Daftar Piutang Usaha' : `Daftar Piutang Usaha — ${activePlatform}`}</h2>
            <p>{filteredOrders.length} transaksi ditemukan.</p>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Kode Order</th>
                  <th>Pelanggan / Saluran</th>
                  <th>Tanggal</th>
                  <th className="ta-r">Tagihan</th>
                  <th className="ta-r">Terbayar</th>
                  <th className="ta-r">Outstanding</th>
                  <th className="ta-c">Status</th>
                  <th className="ta-c">Jatuh Tempo</th>
                  <th className="ta-r">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map(o => {
                  const sisa = getOutstanding(o);
                  const st = getStatus(o);
                  const d = o.createdAt ? new Date(o.createdAt.seconds * 1000) : null;
                  const dateStr = d ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` : '-';
                  const todayStr = new Date().toISOString().split('T')[0];
                  const isOverdue = sisa > 0 && !!o.dueDate && o.dueDate < todayStr;

                  return (
                    <tr key={o.id}>
                      <td>
                        <span className="order-code">{o.orderCode || o.id}</span>
                        {o.source === 'manual' && (
                          <span className="status-badge" style={{ marginLeft: 6, '--sc': 'var(--indigo, #4f46e5)', '--sb': 'var(--indigo-bg, #eef2ff)' } as React.CSSProperties}>Manual</span>
                        )}
                        {o.orderNumber && <span className="order-no">{o.orderNumber}</span>}
                      </td>
                      <td>
                        <span className="cust-name">{o.customerName}</span>
                        <span className="cust-sub">{o.orderType || '-'} · {o.platformChannel || '-'} · {o.pickupLogistics || '-'}</span>
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
                      <td className="ta-c" style={{fontSize: '12.5px'}}>
                        {o.dueDate ? (
                          <span
                            className="status-badge"
                            style={isOverdue
                              ? ({ '--sc': 'var(--red, #d93025)', '--sb': 'var(--red-bg, #fdeceb)' } as React.CSSProperties)
                              : ({ '--sc': 'var(--neutral-500, #6b7280)', '--sb': 'var(--neutral-100, #f3f4f6)' } as React.CSSProperties)}
                          >
                            {o.dueDate}{isOverdue ? ' · Terlambat' : ''}
                          </span>
                        ) : '-'}
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
            <div className="empty-state">Tidak ada piutang untuk platform ini.</div>
          )}
          
          {/* Foot Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-4.5 py-3.5 border-t border-[#E7E1D2] dark:border-neutral-800 text-[12.5px] text-[#9ca3af] gap-3">
            <div>
              Menampilkan <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-200">{paginatedOrders.length}</b> dari <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-200">{filteredOrders.length}</b> Piutang Usaha
            </div>
            <div className="flex items-center gap-4">
              <div>
                Nilai total <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-200">NT$ {(searchedSum / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}</b>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="px-2.5 py-1 text-xs font-semibold rounded border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 disabled:opacity-40 cursor-pointer"
                  >
                    Prev
                  </button>
                  <span className="font-['Inter'] text-xs font-medium text-[#6b7280]">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="px-2.5 py-1 text-xs font-semibold rounded border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* MODAL: TERIMA SEMUA PIUTANG */}
      {isBulkModalOpen && (
        <div className="overlay open" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsBulkModalOpen(false); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Rekonsiliasi Pelunasan Piutang</h2>
                <p>Terima pembayaran piutang massal dari {activePlatform === 'semua' ? 'semua platform' : activePlatform}.</p>
              </div>
              <button className="modal-close" onClick={() => setIsBulkModalOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            
            <div className="modal-body" onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
              <div className="summary-pair">
                <div className="summary-box recv">
                  <div className="lbl">Total Terima Piutang</div>
                  <div className="val num">NT$ {sumGrid.toLocaleString('en-US', {minimumFractionDigits: 0})}</div>
                </div>
                <div className="summary-box total">
                  <div className="lbl">Total Piutang {activePlatform === 'semua' ? 'Semua Platform' : activePlatform}</div>
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
              
              <div className="flex items-center justify-between grid-help" style={{ marginBottom: 6 }}>
                <span>Paste data dari Excel/Sheets. Baris dengan Nomor Order kembar otomatis dinominalkan 0.</span>
                <button 
                  type="button" 
                  onClick={handleResetGrid} 
                  className="text-[11px] text-red-600 dark:text-red-400 hover:underline font-semibold cursor-pointer ml-2"
                >
                  Kosongkan Tabel
                </button>
              </div>
              
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
                                <span className="oi-no">
                                  {s.orderCode || s.id}
                                  {s.orderNumber && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--blue-700)', fontFamily: 'monospace', fontWeight: 600 }}>({s.orderNumber})</span>}
                                </span>
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
                  <button className="btn-process" onClick={handleProcessBulk}>Proses Pelunasan Massal</button>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      )}

      {/* Modal Terima Bayar (Per Baris) */}
      {isPayModalOpen && selectedItem && (
        <div className="overlay open" onClick={(e) => { if (e.target === e.currentTarget) handleClosePaymentModal(); }}>
          <div className="tb-modal">
            <div className="tb-head">
              <div className="tb-title">💰 Rekonsiliasi Pelunasan Piutang</div>
              <button className="tb-close" onClick={handleClosePaymentModal}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="tb-body">
              <div className="tb-info">
                <div className="tb-info-row"><span>Kode Order:</span><b>{selectedItem.orderCode || selectedItem.id}</b></div>
                <div className="tb-info-row"><span>Nama Pelanggan:</span><b>{selectedItem.customerName}</b></div>
                <div className="tb-info-divider"></div>
                <div className="tb-info-row">
                  <span>Sisa Outstanding:</span>
                  <b className="tb-outstanding num">NT$ {(getOutstanding(selectedItem) / 100).toLocaleString('en-US', {minimumFractionDigits:2})}</b>
                </div>
              </div>

              <div className="tb-field">
                <label className="tb-label">Tanggal Transaksi Bayar *</label>
                <div className="tb-date-wrap">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  <input type="date" className="tb-input" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>

              <div className="tb-row-2col">
                <div className="tb-field">
                  <label className="tb-label">Akun Penerima *</label>
                  <select className="tb-select" value={cashAccount} onChange={e => setCashAccount(e.target.value as '1101'|'1102')}>
                    <option value="1101">1101 - Cash: NTD</option>
                    <option value="1102">1102 - Cash: Rupiah</option>
                  </select>
                </div>
                <div className="tb-field">
                  <label className="tb-label">Kurs FX (IDR ➔ NT$) *</label>
                  <input type="text" className="tb-input" disabled={true} value={payRate} onChange={e => setPayRate(formatInputWithCommas(e.target.value))} />
                </div>
              </div>

              <div className="tb-field">
                <label className="tb-label"><span className="tb-label-highlight">Nominal Pelunasan (NT$) *</span></label>
                <input type="text" className="tb-input tb-input-lg" value={payAmount} onChange={e => setPayAmount(formatInputWithCommas(e.target.value))} />
              </div>
            </div>

            <div className="tb-foot">
              <button className="tb-btn-cancel" onClick={handleClosePaymentModal}>Batal</button>
              <button className="tb-btn-post" onClick={handleSavePayment}>Posting Transaksi Pelunasan</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH PIUTANG MANUAL */}
      {isManualModalOpen && (
        <div className="overlay open" onClick={(e) => { if (e.target === e.currentTarget) setIsManualModalOpen(false); }}>
          <div className="tb-modal">
            <div className="tb-head">
              <div className="tb-title">📝 Tambah Piutang Manual</div>
              <button className="tb-close" onClick={() => setIsManualModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="tb-body">
              <div className="tb-field">
                <label className="tb-label">Nama Pengutang *</label>
                <input type="text" className="tb-input" value={manualDebtorName} onChange={e => setManualDebtorName(e.target.value)} placeholder="Nama orang/pihak yang berutang" />
              </div>

              <div className="tb-field">
                <label className="tb-label">Tanggal Transaksi *</label>
                <div className="tb-date-wrap">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  <input type="date" className="tb-input" value={manualDate} onChange={e => setManualDate(e.target.value)} />
                </div>
              </div>

              <div className="tb-row-2col">
                <div className="tb-field">
                  <label className="tb-label">Mata Uang</label>
                  <select className="tb-select" value={manualCurrency} onChange={e => setManualCurrency(e.target.value as 'NTD' | 'IDR')}>
                    <option value="NTD">NTD</option>
                    <option value="IDR">IDR (Rupiah)</option>
                  </select>
                </div>
                <div className="tb-field">
                  <label className="tb-label">Kurs (IDR ➔ NT$) {manualCurrency === 'IDR' ? '*' : ''}</label>
                  <input type="text" className="tb-input" disabled={manualCurrency !== 'IDR'} value={manualFxRate} onChange={e => setManualFxRate(formatInputWithCommas(e.target.value))} />
                </div>
              </div>

              <div className="tb-field">
                <label className="tb-label"><span className="tb-label-highlight">Nominal ({manualCurrency}) *</span></label>
                <input type="text" className="tb-input tb-input-lg" value={manualAmount} onChange={e => setManualAmount(formatInputWithCommas(e.target.value))} />
              </div>

              <div className="tb-field">
                <label className="tb-label">Akun Lawan (Kredit) *</label>
                <select className="tb-select" value={manualCreditAccountCode} onChange={e => setManualCreditAccountCode(e.target.value)}>
                  <option value="">-- Pilih Akun --</option>
                  {coaAccounts.filter(a => a.code !== '1110' && a.isActive !== false).sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(a => (
                    <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div className="tb-field">
                <label className="tb-label">Umur Piutang</label>
                <select className="tb-select" value={manualTermsDays} onChange={e => setManualTermsDays(Number(e.target.value) as 30 | 60 | 90)}>
                  <option value={30}>30 Hari</option>
                  <option value={60}>60 Hari</option>
                  <option value={90}>90 Hari</option>
                </select>
              </div>

              <div className="tb-field">
                <label className="tb-label">Keterangan</label>
                <input type="text" className="tb-input" value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="Opsional" />
              </div>
            </div>

            <div className="tb-foot">
              <button className="tb-btn-cancel" onClick={() => setIsManualModalOpen(false)}>Batal</button>
              <button className="tb-btn-post" disabled={isSubmittingManual} onClick={handleAddManualReceivable}>
                {isSubmittingManual ? 'Memproses...' : 'Simpan Piutang Manual'}
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
                <h2>Batalkan Pelunasan</h2>
                <p>Order {reverseModalData.orderCode || reverseModalData.id}</p>
              </div>
              <button className="modal-close" onClick={() => setReverseModalData(null)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px 20px', lineHeight: '1.5' }}>
              <p>Membatalkan pelunasan akan <b>menghapus seluruh riwayat pembayaran</b> untuk order ini sebesar <b>NT$ {((reverseModalData.amountPaid || 0)/100).toLocaleString('en-US')}</b> dan mengembalikannya ke status <b>Belum Dibayar</b>.</p>
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
