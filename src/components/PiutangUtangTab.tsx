import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { FALLBACK_IDR_PER_NTD } from '../lib/exchangeRateConstants';
import { 
  collection, 
  onSnapshot, 
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  writeBatch,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { useAuth } from '../lib/auth-context';
import { AUTO_ACCOUNTS, ensureAutoAccountExists, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { formatNTD, formatIDR, formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { fetchCurrentExchangeRate } from '../lib/period-closing-utils';
import { 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Briefcase, 
  Users, 
  ChevronRight, 
  Plus, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Layers,
  ArrowRight,
  RotateCcw,
  Trash2,
  CreditCard,
  RefreshCw
} from 'lucide-react';

interface PiutangUtangTabProps {
  forceMode?: 'piutang' | 'utang';
}

export const PiutangUtangTab: React.FC<PiutangUtangTabProps> = ({ forceMode }) => {
  const { user } = useAuth();
  const [activeSegment, setActiveSegment] = useState<'piutang' | 'utang'>(forceMode || 'piutang');
  
  // States for real-time lists
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  
  // Payment Modal states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [cashAccount, setCashAccount] = useState<'1101' | '1102'>('1101');
  const [payRate, setPayRate] = useState(String(FALLBACK_IDR_PER_NTD)); // IDR to NTD rate (IDR / rate = NTD)
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

  // Add Loan Modal states
  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);
  const [loanCreditorName, setLoanCreditorName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanCurrency, setLoanCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [loanCashAccount, setLoanCashAccount] = useState<'1101' | '1102'>('1101');
  const [loanFxRate, setLoanFxRate] = useState(String(FALLBACK_IDR_PER_NTD));
  const [loanDate, setLoanDate] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  });
  const [loanDueDate, setLoanDueDate] = useState('');
  const [loanNotes, setLoanNotes] = useState('');
  const [isSubmittingLoan, setIsSubmittingLoan] = useState(false);

  // Delete confirmation modal states
  const [confirmingCancelUtang, setConfirmingCancelUtang] = useState<any | null>(null);
  const [isCancelingUtang, setIsCancelingUtang] = useState(false);

  // Real-time FX exchange rate state
  const [liveExchangeRate, setLiveExchangeRate] = useState<number>(500);
  const [isRefreshingFx, setIsRefreshingFx] = useState(false);

  // Function to refresh real-time FX exchange rate from API
  const refreshLiveFxRate = async () => {
    setIsRefreshingFx(true);
    try {
      const rate = await fetchCurrentExchangeRate();
      if (rate && !isNaN(rate) && rate > 0) {
        const rounded = Math.round(rate * 100) / 100;
        setLiveExchangeRate(rounded);
        setPayRate(String(rounded));
        setLoanFxRate(String(rounded));
        return rounded;
      }
    } catch (err) {
      console.error("Error fetching live FX rate in PiutangUtangTab", err);
    } finally {
      setIsRefreshingFx(false);
    }
    return liveExchangeRate;
  };

  useEffect(() => {
    refreshLiveFxRate();
  }, []);

  useEffect(() => {
    // 1. Subscribe to sales orders in real-time
    const unsubSales = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const oList: any[] = [];
      snap.forEach((d) => {
        const o = d.data();
        // Include orders that are unpaid or have outstanding balance
        const isUnpaid = o.paymentStatus === 'unpaid' || o.isUnpaid === true || o.paymentMethod === 'Unpaid' || o.paymentMethod === 'Belum Dibayar';
        if ((o.status === 'completed' || o.status === 'shipped') && isUnpaid) {
          oList.push({ id: d.id, ...o });
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

    // 2. Subscribe to purchase orders in real-time (Fetch ONLY credit/unpaid/tempo POs, excluding paid/cash purchases)
    const unsubPurchases = onSnapshot(collection(db, 'purchaseOrders'), (snap) => {
      const pList: any[] = [];
      snap.forEach((d) => {
        const po = d.data();
        const isFullyPaid = po.paymentStatus === 'paid' || 
                            po.isUnpaid === false || 
                            po.paymentStatus === 'Lunas Langsung (Cash)' || 
                            po.paymentStatus === 'lunas' ||
                            (po.amountPaid !== undefined && po.amountPaid > 0 && po.amountPaid >= (po.purchasePriceNTD || 0));
        if (!isFullyPaid) {
          pList.push({ id: d.id, ...po });
        }
      });
      setPurchaseOrders(pList.sort((a, b) => (b.purchaseDate?.seconds || b.createdAt?.seconds) - (a.purchaseDate?.seconds || a.createdAt?.seconds)));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // 3. Subscribe to manual loans in real-time
    const unsubLoans = onSnapshot(collection(db, 'loans'), (snap) => {
      const lList: any[] = [];
      snap.forEach((d) => {
        lList.push({ id: d.id, ...d.data() });
      });
      setLoans(lList.sort((a, b) => {
        const dateA = a.loanDate ? new Date(a.loanDate).getTime() : 0;
        const dateB = b.loanDate ? new Date(b.loanDate).getTime() : 0;
        return dateB - dateA;
      }));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    return () => {
      unsubSales();
      unsubPurchases();
      unsubLoans();
    };
  }, []);



  const formatToYYYYMMDD = (dateVal: any) => {
    if (!dateVal) return '-';
    let d: Date;
    if (dateVal.seconds) {
      d = new Date(dateVal.seconds * 1000);
    } else if (dateVal instanceof Date) {
      d = dateVal;
    } else {
      const cleanStr = String(dateVal).replace(/[-/]/g, '');
      if (cleanStr.length === 8 && /^\d{8}$/.test(cleanStr)) {
        return cleanStr;
      }
      d = new Date(dateVal);
    }
    if (isNaN(d.getTime())) return '-';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };

  // Filter currency accounts based on selected currency
  useEffect(() => {
    if (loanCurrency === 'IDR') {
      setLoanCashAccount('1102');
    } else {
      setLoanCashAccount('1101');
    }
  }, [loanCurrency]);

  // Calculate high-level summary widgets for Piutang Usaha (A/R)
  const totalPiutangCents = salesOrders.reduce((acc, so) => {
    const outstanding = (so.totalPrice || 0) - (so.amountPaid || 0);
    return acc + Math.max(0, outstanding);
  }, 0);

  // Merge Purchase Orders & Loans into a unified Accounts Payable (Utang Usaha) array
  const unifiedUtangItems = React.useMemo(() => {
    const poItems = purchaseOrders
      .filter((po) => {
        const isFullyPaid = po.paymentStatus === 'paid' || 
                            po.isUnpaid === false || 
                            po.paymentStatus === 'Lunas Langsung (Cash)' || 
                            po.paymentStatus === 'lunas' ||
                            (po.amountPaid !== undefined && po.amountPaid > 0 && po.amountPaid >= (po.purchasePriceNTD || 0));
        return !isFullyPaid;
      })
      .map((po) => ({
        id: po.id,
        isLoan: false,
        code: po.purchaseCode || `PO-${po.id.substring(0, 5).toUpperCase()}`,
        creditor: po.supplierName,
        date: po.purchaseDate?.seconds ? new Date(po.purchaseDate.seconds * 1000).toISOString().split('T')[0] : po.purchaseDate || '',
        dueDate: po.dueDate || '',
        totalAmount: po.purchasePriceNTD || 0,
        totalAmountIDR: po.purchasePriceIDR || 0,
        amountPaid: po.amountPaid || 0,
        paymentStatus: po.paymentStatus || 'unpaid',
        description: `Buku: ${po.bookName || '-'}`,
        exchangeRate: po.exchangeRate || 500,
        originalItem: po
      }));

    const loanItems = loans.map((ln) => ({
      id: ln.id,
      isLoan: true,
      code: ln.loanCode || `LN-${ln.id.substring(0, 5).toUpperCase()}`,
      creditor: ln.creditorName,
      date: ln.loanDate || '',
      dueDate: ln.dueDate || '',
      totalAmount: ln.amountNTD || 0,
      totalAmountIDR: ln.amountIDR || 0,
      amountPaid: ln.amountPaid || 0,
      paymentStatus: ln.paymentStatus || 'unpaid',
      description: ln.notes || '',
      exchangeRate: ln.exchangeRate || 500,
      originalItem: ln
    }));

    return [...poItems, ...loanItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [purchaseOrders, loans]);

  // Calculate high-level summary widgets for Utang Usaha (A/P)
  const statsUtang = React.useMemo(() => {
    let totalOutstanding = 0;
    let totalUnpaid = 0;
    let totalPartial = 0;
    let totalOverdue = 0;
    let totalPaid = 0;

    let countOutstanding = 0;
    let countUnpaid = 0;
    let countPartial = 0;
    let countOverdue = 0;
    let countPaid = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    unifiedUtangItems.forEach((item) => {
      const outstanding = item.totalAmount - item.amountPaid;
      
      if (item.paymentStatus === 'paid') {
        totalPaid += item.totalAmount;
        countPaid++;
      } else {
        totalOutstanding += outstanding;
        countOutstanding++;

        if (item.amountPaid === 0) {
          totalUnpaid += outstanding;
          countUnpaid++;
        } else if (item.amountPaid > 0 && item.amountPaid < item.totalAmount) {
          totalPartial += outstanding;
          countPartial++;
        }

        if (item.dueDate && item.dueDate < todayStr) {
          totalOverdue += outstanding;
          countOverdue++;
        }
      }
    });

    return {
      totalOutstanding,
      totalUnpaid,
      totalPartial,
      totalOverdue,
      totalPaid,
      countOutstanding,
      countUnpaid,
      countPartial,
      countOverdue,
      countPaid
    };
  }, [unifiedUtangItems]);

  const handleOpenPaymentModal = (item: any) => {
    setSelectedItem(item);
    const outstanding = item.totalAmount - item.amountPaid;
    
    // Default to full outstanding payment (converted from cents to whole NT$)
    setPayAmount(String(Math.round(outstanding / 100)));
    const isIdr = (item.originalItem?.purchasePriceIDR || 0) > 0 || item.originalItem?.cashAccount === '1102' || (item.originalItem?.supplierName || item.creditor || '').toLowerCase().includes('shopee');
    setCashAccount(isIdr ? '1102' : '1101');
    const effectiveRate = item.exchangeRate && item.exchangeRate !== 500 ? item.exchangeRate : (liveExchangeRate || 500);
    setPayRate(String(effectiveRate));
    setIsPayModalOpen(true);
  };

  const handleClosePaymentModal = () => {
    setIsPayModalOpen(false);
    setSelectedItem(null);
    setPayAmount('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const parsedAmount = parseFloat(cleanCommas(payAmount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Masukkan nominal pembayaran yang valid.");
      return;
    }

    const payAmountCents = Math.round(parsedAmount * 100);
    const fxRate = parseFloat(cleanCommas(payRate)) || FALLBACK_IDR_PER_NTD;

    // Check closed periods first
    try {
      const stored = localStorage.getItem('closed_periods');
      const closedPeriods: string[] = stored ? JSON.parse(stored) : [];
      if (closedPeriods.length > 0) {
        const paymentDateObj = new Date(payDate);
        const yyyy = paymentDateObj.getFullYear();
        const mm = String(paymentDateObj.getMonth() + 1).padStart(2, '0');
        const periodId = `${yyyy}-${mm}`;
        if (closedPeriods.includes(periodId)) {
          alert(`Tidak dapat melakukan posting pembayaran pada periode ${periodId} yang telah ditutup!`);
          return;
        }
      }
    } catch (err) {
      console.error("Failed to parse closed periods lock", err);
    }

    if (activeSegment === 'piutang') {
      const outstanding = (selectedItem.totalPrice || 0) - (selectedItem.amountPaid || 0);
      if (payAmountCents > outstanding + 10) { // small tolerance for float rounding
        alert(`Nominal pembayaran melebihi sisa piutang: ${formatNTD(outstanding)}`);
        return;
      }

      // Execute Piutang Payment transaction
      try {
        const orderRef = doc(db, 'salesOrders', selectedItem.id);
        const dateStr = payDate ? new Date(payDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const journalId = await getNextJournalId(dateStr);
        const journalRef = doc(db, 'journalEntries', journalId);
        const cfId = doc(collection(db, 'cashFlow')).id;
        const cfRef = doc(db, 'cashFlow', cfId);

        await ensureAutoAccountExists(liveAccounts.PIUTANG_USAHA);
        await ensureAutoAccountExists(cashAccount === '1101' ? liveAccounts.CASH_NTD : liveAccounts.CASH_RUPIAH);

        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(orderRef);
          if (!snap.exists()) {
            throw new Error("Sales order tidak ditemukan");
          }
          const order = snap.data();
          const curPaid = order.amountPaid || 0;
          const nextPaid = curPaid + payAmountCents;
          const isFullyPaid = nextPaid >= (order.totalPrice || 0) - 5; // tolerance

          // 1. Update Sales Order
          transaction.update(orderRef, {
            amountPaid: nextPaid,
            paymentStatus: isFullyPaid ? 'paid' : 'partial',
            isUnpaid: !isFullyPaid,
            updatedAt: Timestamp.now()
          });

          // 2. Journal Entry: Dr Cash (1101/1102) | Cr Piutang Usaha (1110)
          const targetCash = cashAccount === '1101' ? liveAccounts.CASH_NTD : liveAccounts.CASH_RUPIAH;
          const isRupiah = cashAccount === '1102';
          const paidRupiahWhole = isRupiah ? Math.round(parsedAmount * fxRate) : 0;

          transaction.set(journalRef, {
            id: journalId,
            date: Timestamp.fromDate(new Date(payDate)),
            description: `Terima Pembayaran Piutang SO ${order.orderCode} - ${order.customerName}`,
            refType: 'sales_order_payment',
            refId: selectedItem.id,
            isAuto: true,
            createdAt: Timestamp.now(),
            lines: [
              {
                account: targetCash.name,
                accountCode: targetCash.code,
                debit: payAmountCents,
                credit: 0,
                ...(isRupiah ? {
                  originalCurrency: 'IDR',
                  originalDebitIDR: paidRupiahWhole,
                  originalCreditIDR: 0
                } : {})
              },
              {
                account: 'Piutang Usaha',
                accountCode: '1110',
                debit: 0,
                credit: payAmountCents,
                ...(isRupiah ? {
                  originalCurrency: 'IDR',
                  originalDebitIDR: 0,
                  originalCreditIDR: paidRupiahWhole
                } : {})
              }
            ]
          });

          // 3. Write CashFlow
          transaction.set(cfRef, {
            id: cfId,
            date: Timestamp.fromDate(new Date(payDate)),
            ledger: isRupiah ? 'IDR' : 'NTD',
            direction: 'inflow',
            category: 'sales_payment',
            amount: isRupiah ? paidRupiahWhole : payAmountCents,
            amountNTD: Math.round(payAmountCents / 100),
            fxRateUsed: fxRate,
            refType: 'sales_order',
            refId: selectedItem.id,
            description: `Penerimaan Piutang SO ${order.orderCode} - ${order.customerName}`,
            createdAt: Timestamp.now()
          });
        });

        handleClosePaymentModal();
      } catch (err: any) {
        console.error("Error posting piutang payment", err);
        alert(`Gagal memposting pembayaran: ${err.message}`);
      }
    } else {
      // Execute Utang/Loan Payment transaction
      const outstanding = selectedItem.totalAmount - selectedItem.amountPaid;
      if (payAmountCents > outstanding + 10) {
        alert(`Nominal pelunasan melebihi sisa utang: ${formatNTD(outstanding)}`);
        return;
      }

      try {
        const isLoan = selectedItem.isLoan === true;
        const targetRef = isLoan ? doc(db, 'loans', selectedItem.id) : doc(db, 'purchaseOrders', selectedItem.id);
        const dateStr = payDate ? new Date(payDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const journalId = await getNextJournalId(dateStr);
        const journalRef = doc(db, 'journalEntries', journalId);
        const cfId = doc(collection(db, 'cashFlow')).id;
        const cfRef = doc(db, 'cashFlow', cfId);

        // Kreditur (nama orang/partner) disimpan sebagai detail transaksi di dokumen
        // loans/purchaseOrders itu sendiri (selectedItem.creditor) - bukan sebagai akun
        // COA terpisah. Semua transaksi utang, baik pinjaman maupun PO, selalu pakai
        // akun induk Utang Usaha (2100) yang sama.
        const debitAccountName = 'Utang Usaha';
        const debitAccountCode = '2100';
        await ensureAutoAccountExists(liveAccounts.UTANG_USAHA || { code: '2100', name: 'Utang Usaha', type: 'Liabilities', subType: 'Kewajiban Lancar', systemKey: 'utang_usaha' });

        await ensureAutoAccountExists(cashAccount === '1101' ? liveAccounts.CASH_NTD : liveAccounts.CASH_RUPIAH);

        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(targetRef);
          if (!snap.exists()) {
            throw new Error(`${isLoan ? 'Pinjaman' : 'Purchase order'} tidak ditemukan`);
          }
          const itemData = snap.data();
          const curPaid = itemData.amountPaid || 0;
          const nextPaid = curPaid + payAmountCents;
          
          const limitAmount = isLoan ? (itemData.amountNTD || 0) : (itemData.purchasePriceNTD || 0);
          const isFullyPaid = nextPaid >= limitAmount - 5;

          // 1. Update Document
          transaction.update(targetRef, {
            amountPaid: nextPaid,
            paymentStatus: isFullyPaid ? 'paid' : 'partial',
            ...(!isLoan ? { isUnpaid: !isFullyPaid } : {}),
            updatedAt: Timestamp.now()
          });

          // 2. Journal Entry: Dr Utang Usaha (2100/2100-XXX) | Cr Cash (1101/1102)
          const targetCash = cashAccount === '1101' ? liveAccounts.CASH_NTD : liveAccounts.CASH_RUPIAH;
          const isRupiah = cashAccount === '1102';
          const paidRupiahWhole = isRupiah ? Math.round(parsedAmount * fxRate) : 0;

          const descriptionStr = isLoan 
            ? `Pelunasan Pinjaman ${selectedItem.code} - ${selectedItem.creditor}`
            : `Pelunasan Utang PO ${itemData.purchaseCode || selectedItem.id} - ${itemData.supplierName}`;

          transaction.set(journalRef, {
            id: journalId,
            date: Timestamp.fromDate(new Date(payDate)),
            description: descriptionStr,
            refType: isLoan ? 'loan_payment' : 'purchase_order_payment',
            refId: selectedItem.id,
            isAuto: true,
            createdAt: Timestamp.now(),
            lines: [
              {
                account: debitAccountName,
                accountCode: debitAccountCode,
                debit: payAmountCents,
                credit: 0,
                ...(isRupiah ? {
                  originalCurrency: 'IDR',
                  originalDebitIDR: paidRupiahWhole,
                  originalCreditIDR: 0
                } : {})
              },
              {
                account: targetCash.name,
                accountCode: targetCash.code,
                debit: 0,
                credit: payAmountCents,
                ...(isRupiah ? {
                  originalCurrency: 'IDR',
                  originalDebitIDR: 0,
                  originalCreditIDR: paidRupiahWhole
                } : {})
              }
            ]
          });

          // 3. Write CashFlow
          transaction.set(cfRef, {
            id: cfId,
            date: Timestamp.fromDate(new Date(payDate)),
            ledger: isRupiah ? 'IDR' : 'NTD',
            direction: 'outflow',
            category: isLoan ? 'loan_repayment' : 'wholesale_purchase',
            amount: isRupiah ? paidRupiahWhole : payAmountCents,
            amountNTD: Math.round(payAmountCents / 100),
            fxRateUsed: fxRate,
            refType: isLoan ? 'loan' : 'purchase_order',
            refId: selectedItem.id,
            description: descriptionStr,
            createdAt: Timestamp.now()
          });
        });

        handleClosePaymentModal();
      } catch (err: any) {
        console.error("Error posting utang payment", err);
        alert(`Gagal memposting pembayaran: ${err.message}`);
      }
    }
  };

  // Add Loan Form submit handler
  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanCreditorName.trim() || !loanAmount) {
      alert("Lengkapi field modal yang ditandai bintang.");
      return;
    }

    const parsedAmount = parseFloat(cleanCommas(loanAmount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Ketik nominal pinjaman yang valid.");
      return;
    }

    const fxRate = parseFloat(cleanCommas(loanFxRate)) || FALLBACK_IDR_PER_NTD;
    const amountCents = Math.round(parsedAmount * 100);

    let amountNTDCents = amountCents;
    let amountIDRWhole = 0;

    if (loanCurrency === 'IDR') {
      amountIDRWhole = parsedAmount;
      // NTD = IDR / fxRate
      amountNTDCents = Math.round((parsedAmount / fxRate) * 100);
    } else {
      amountNTDCents = amountCents;
      amountIDRWhole = 0;
    }

    // Check closed periods first
    try {
      const stored = localStorage.getItem('closed_periods');
      const closedPeriods: string[] = stored ? JSON.parse(stored) : [];
      if (closedPeriods.length > 0) {
        const loanDateObj = new Date(loanDate);
        const yyyy = loanDateObj.getFullYear();
        const mm = String(loanDateObj.getMonth() + 1).padStart(2, '0');
        const periodId = `${yyyy}-${mm}`;
        if (closedPeriods.includes(periodId)) {
          alert(`Tidak dapat menambah pinjaman pada periode ${periodId} yang telah ditutup!`);
          return;
        }
      }
    } catch (err) {
      console.error("Failed to parse closed periods lock", err);
    }

    setIsSubmittingLoan(true);

    try {
      const loanId = doc(collection(db, 'loans')).id;
      
      // Generate code format: PY + YYMMDD + [000] sequence
      const loanDateObj = new Date(loanDate);
      const yy = String(loanDateObj.getFullYear()).substring(2);
      const mmStr = String(loanDateObj.getMonth() + 1).padStart(2, '0');
      const ddStr = String(loanDateObj.getDate()).padStart(2, '0');
      const yymmdd = `${yy}${mmStr}${ddStr}`;

      const loansSnap = await getDocs(collection(db, 'loans'));
      let sequence = 1;
      loansSnap.forEach(doc => {
        const data = doc.data();
        const code = data.loanCode || '';
        if (code.startsWith(`PY${yymmdd}`)) {
          const seqStr = code.substring(8);
          const parsedSeq = parseInt(seqStr, 10);
          if (!isNaN(parsedSeq) && parsedSeq >= sequence) {
            sequence = parsedSeq + 1;
          }
        }
      });
      const seqFormatted = String(sequence).padStart(3, '0');
      const loanCode = `PY${yymmdd}${seqFormatted}`;

      const dateStr = loanDate ? new Date(loanDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const journalId = await getNextJournalId(dateStr);
      const cfId = doc(collection(db, 'cashFlow')).id;

      const cleanCreditor = loanCreditorName.trim();
      // Kreditur disimpan sebagai detail transaksi (creditorName di dokumen loan) -
      // bukan sebagai akun COA terpisah. Semua pinjaman pakai akun induk Utang Usaha (2100).
      const childCode = '2100';
      const childName = 'Utang Usaha';

      // 1. Ensure akun induk Utang Usaha ada di COA collection
      await ensureAutoAccountExists(liveAccounts.UTANG_USAHA || { code: '2100', name: 'Utang Usaha', type: 'Liabilities', subType: 'Kewajiban Lancar', systemKey: 'utang_usaha' });

      const targetCash = loanCashAccount === '1101' ? liveAccounts.CASH_NTD : liveAccounts.CASH_RUPIAH;
      const isRupiah = loanCashAccount === '1102';

      await runTransaction(db, async (transaction) => {
        // A. Set loan document
        transaction.set(doc(db, 'loans', loanId), {
          id: loanId,
          loanCode,
          creditorName: cleanCreditor,
          amountNTD: amountNTDCents,
          amountIDR: amountIDRWhole,
          currency: loanCurrency,
          exchangeRate: fxRate,
          cashAccount: loanCashAccount,
          amountPaid: 0,
          paymentStatus: 'unpaid',
          loanDate: loanDate,
          dueDate: loanDueDate || '',
          notes: loanNotes || '',
          journalId,
          cfId,
          isLoan: true,
          createdAt: Timestamp.now()
        });

        // B. Set dynamic double-entry journal (Debit Cash | Credit Utang Usaha - [Kreditur])
        transaction.set(doc(db, 'journalEntries', journalId), {
          id: journalId,
          date: Timestamp.fromDate(new Date(loanDate)),
          description: `Penerimaan Pinjaman ${loanCode} dari ${cleanCreditor}`,
          refType: 'loan_disbursement',
          refId: loanId,
          isAuto: true,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: targetCash.name,
              accountCode: targetCash.code,
              debit: amountNTDCents,
              credit: 0,
              ...(isRupiah || loanCurrency === 'IDR' ? {
                originalCurrency: 'IDR',
                originalDebitIDR: amountIDRWhole || Math.round((amountNTDCents / 100) * fxRate),
                originalCreditIDR: 0
              } : {})
            },
            {
              account: childName,
              accountCode: childCode,
              debit: 0,
              credit: amountNTDCents,
              ...(isRupiah || loanCurrency === 'IDR' ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: amountIDRWhole || Math.round((amountNTDCents / 100) * fxRate)
              } : {})
            }
          ]
        });

        // C. Set cashFlow ledger entry
        transaction.set(doc(db, 'cashFlow', cfId), {
          id: cfId,
          date: Timestamp.fromDate(new Date(loanDate)),
          ledger: isRupiah ? 'IDR' : 'NTD',
          direction: 'inflow',
          category: 'loan_disbursement',
          amount: isRupiah ? (amountIDRWhole || Math.round((amountNTDCents / 100) * fxRate)) : amountNTDCents,
          amountNTD: Math.round(amountNTDCents / 100),
          fxRateUsed: fxRate,
          refType: 'loan',
          refId: loanId,
          description: `Penerimaan Pinjaman ${loanCode} dari ${cleanCreditor}`,
          createdAt: Timestamp.now()
        });
      });

      // Reset modal and close
      setIsAddLoanModalOpen(false);
      setLoanCreditorName('');
      setLoanAmount('');
      setLoanCurrency('NTD');
      setLoanFxRate(String(FALLBACK_IDR_PER_NTD));
      setLoanNotes('');
      setLoanDueDate('');
      alert(`Pinjaman modal ${loanCode} berhasil ditambahkan dan jurnal kas telah diposting!`);
    } catch (err: any) {
      console.error("Gagal menambahkan pinjaman", err);
      alert(`Gagal menyimpan data pinjaman: ${err.message}`);
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  // Cancel / Delete Utang & Journals handler
  const handleConfirmCancelUtang = async () => {
    if (!confirmingCancelUtang) return;
    const item = confirmingCancelUtang;
    setIsCancelingUtang(true);

    try {
      // Check closed periods first
      const stored = localStorage.getItem('closed_periods');
      const closedPeriods: string[] = stored ? JSON.parse(stored) : [];
      if (closedPeriods.length > 0 && item.date) {
        const dateObj = new Date(item.date);
        if (!isNaN(dateObj.getTime())) {
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const periodId = `${yyyy}-${mm}`;
          if (closedPeriods.includes(periodId)) {
            alert(`Tidak dapat membatalkan transaksi pada periode ${periodId} yang telah ditutup!`);
            setIsCancelingUtang(false);
            return;
          }
        }
      }

      if (item.isLoan) {
        const loanSnap = await getDoc(doc(db, 'loans', item.id));
        const loan = loanSnap.exists() ? loanSnap.data() : null;

        // ALL READS MUST BE EXECUTED BEFORE ANY WRITES/DELETES IN FIRESTORE TRANSACTION
        const paymentJournalsSnap = await getDocs(query(collection(db, 'journalEntries'), where('refId', '==', item.id)));
        const codeJournalsSnap = await getDocs(query(collection(db, 'journalEntries'), where('docCode', '==', item.code)));
        const refCodeJournalsSnap = await getDocs(query(collection(db, 'journalEntries'), where('refCode', '==', item.code)));
        const paymentCashflowsSnap = await getDocs(query(collection(db, 'cashFlow'), where('refId', '==', item.id)));
        const codeCashflowsSnap = await getDocs(query(collection(db, 'cashFlow'), where('refCode', '==', item.code)));

        await runTransaction(db, async (transaction) => {
          // 1. Delete loan document
          transaction.delete(doc(db, 'loans', item.id));

          // 2. Delete loan creation journal entry
          if (loan && loan.journalId) {
            transaction.delete(doc(db, 'journalEntries', loan.journalId));
          }

          // 3. Delete loan payment & code journals
          paymentJournalsSnap.forEach(d => transaction.delete(d.ref));
          codeJournalsSnap.forEach(d => transaction.delete(d.ref));
          refCodeJournalsSnap.forEach(d => transaction.delete(d.ref));

          // 4. Delete related cash flows
          if (loan && loan.cfId) {
            transaction.delete(doc(db, 'cashFlow', loan.cfId));
          }
          paymentCashflowsSnap.forEach(d => transaction.delete(d.ref));
          codeCashflowsSnap.forEach(d => transaction.delete(d.ref));
        });
      } else {
        // Deleting PO Utang
        const poId = item.id;
        const poCode = item.code;

        const journalsQuery1 = query(collection(db, 'journalEntries'), where('refId', '==', poId));
        const journalsQuery2 = query(collection(db, 'journalEntries'), where('refId', '==', poCode));
        const journalsQuery3 = query(collection(db, 'journalEntries'), where('docCode', '==', poCode));
        const journalsQuery4 = query(collection(db, 'journalEntries'), where('refCode', '==', poCode));

        const cfQuery1 = query(collection(db, 'cashFlow'), where('refId', '==', poId));
        const cfQuery2 = query(collection(db, 'cashFlow'), where('refCode', '==', poCode));

        const [jSnap1, jSnap2, jSnap3, jSnap4, cfSnap1, cfSnap2] = await Promise.all([
          getDocs(journalsQuery1), getDocs(journalsQuery2), getDocs(journalsQuery3), getDocs(journalsQuery4),
          getDocs(cfQuery1), getDocs(cfQuery2)
        ]);

        const batch = writeBatch(db);
        batch.delete(doc(db, 'purchaseOrders', poId));
        batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-create`));
        batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-rec-freight`));
        batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-rec-capitalize`));
        batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-rec-capitalize-mig`));

        jSnap1.forEach(d => batch.delete(d.ref));
        jSnap2.forEach(d => batch.delete(d.ref));
        jSnap3.forEach(d => batch.delete(d.ref));
        jSnap4.forEach(d => batch.delete(d.ref));

        cfSnap1.forEach(d => batch.delete(d.ref));
        cfSnap2.forEach(d => batch.delete(d.ref));

        await batch.commit();
      }

      setConfirmingCancelUtang(null);
      alert(`Transaksi ${item.code} berhasil dibatalkan dan seluruh jurnal terkait telah dibersihkan.`);
    } catch (err: any) {
      console.error("Gagal membatalkan utang", err);
      alert(`Gagal membatalkan utang: ${err.message}`);
    } finally {
      setIsCancelingUtang(false);
    }
  };

  // Reverse Payment (Undo Pelunasan) handler
  const handleReversePayment = async (item: any) => {
    // Check closed periods first
    try {
      const stored = localStorage.getItem('closed_periods');
      const closedPeriods: string[] = stored ? JSON.parse(stored) : [];
      if (closedPeriods.length > 0) {
        const dateObj = new Date(item.date);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const periodId = `${yyyy}-${mm}`;
        if (closedPeriods.includes(periodId)) {
          alert(`Tidak dapat membatalkan pelunasan pada periode ${periodId} yang telah ditutup!`);
          return;
        }
      }
    } catch (err) {
      console.error("Failed to parse closed periods lock", err);
    }

    if (!confirm(`Apakah Anda yakin ingin membatalkan (reverse) pelunasan untuk ${item.code} - ${item.creditor}? Status item akan diubah kembali menjadi Belum Dibayar.`)) {
      return;
    }

    try {
      const isLoan = item.isLoan === true;
      const refType = isLoan ? 'loan_payment' : 'purchase_order_payment';

      // Find all payment journals
      const journalSnap = await getDocs(query(collection(db, 'journalEntries'), where('refId', '==', item.id), where('refType', '==', refType)));
      const cfSnap = await getDocs(query(collection(db, 'cashFlow'), where('refId', '==', item.id)));

      const journalRefs = journalSnap.docs.map(d => d.ref);
      const cfRefs = cfSnap.docs
        .filter(d => d.data().direction === 'outflow' && (d.data().category === 'wholesale_purchase' || d.data().category === 'loan_repayment'))
        .map(d => d.ref);

      await runTransaction(db, async (transaction) => {
        // Delete payment journals
        for (const jRef of journalRefs) {
          transaction.delete(jRef);
        }
        // Delete related cashflows
        for (const cfRef of cfRefs) {
          transaction.delete(cfRef);
        }

        // Reset payment status
        if (isLoan) {
          transaction.update(doc(db, 'loans', item.id), {
            amountPaid: 0,
            paymentStatus: 'unpaid',
            updatedAt: Timestamp.now()
          });
        } else {
          transaction.update(doc(db, 'purchaseOrders', item.id), {
            amountPaid: 0,
            paymentStatus: 'unpaid',
            isUnpaid: true,
            updatedAt: Timestamp.now()
          });
        }
      });
      alert("Pelunasan berhasil direverse dan status dikembalikan menjadi Belum Dibayar.");
    } catch (err: any) {
      console.error("Error reversing payment", err);
      alert(`Gagal membatalkan pelunasan: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 font-['Lexend'] text-neutral-800">

      {/* 1. Header stylized as a premium card box matching PiutangTab */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm mb-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#7a2f5f]" />
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">
            {activeSegment === 'piutang' ? 'Piutang Usaha' : 'Utang Usaha'}
          </h2>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          {!forceMode && (
            <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveSegment('piutang')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeSegment === 'piutang'
                    ? 'bg-white dark:bg-neutral-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                🤝 Piutang
              </button>
              <button
                onClick={() => setActiveSegment('utang')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeSegment === 'utang'
                    ? 'bg-[#7a2f5f] text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                💳 Utang
              </button>
            </div>
          )}

          {activeSegment === 'utang' && (
            <button
              onClick={() => setIsAddLoanModalOpen(true)}
              className="bg-[#7a2f5f] hover:bg-[#5c2249] text-white flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Plus className="h-3.5 w-3.5" /> Tambah Pinjaman
            </button>
          )}
        </div>
      </div>

      {/* 2. Bento Grid of 5 Summary Cards */}
      {activeSegment === 'piutang' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-blue-500" /> TOTAL PIUTANG USAHA
              </span>
              <div className="text-2xl font-black font-['Inter'] text-neutral-900 dark:text-white mt-1 tabular-nums">
                {formatNTD(totalPiutangCents)}
              </div>
              <p className="text-[10px] text-neutral-450">Tagihan kredit pelanggan aktif (Akun 1110)</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
          {/* Card 1: Total Outstanding */}
          <div className="bg-gradient-to-br from-[#3a1530] to-[#7a2f5f] text-white p-5 rounded-2xl border border-transparent shadow-sm relative overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
            <span className="text-[#f2e1ec] text-[10px] font-bold uppercase tracking-wider block mb-1">
              Total Utang Usaha
            </span>
            <div className="font-extrabold text-xl font-['Inter'] tabular-nums tracking-tight mt-1.5">
              {formatNTD(statsUtang.totalOutstanding)}
            </div>
            <p className="text-[10px] text-[#f2e1ec]/85 mt-2 font-medium">
              {statsUtang.countOutstanding} tagihan outstanding
            </p>
          </div>

          {/* Card 2: Belum Dibayar */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl transition-all duration-300 hover:scale-[1.01] hover:shadow-sm">
            <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block mb-1">
              Belum Dibayar
            </span>
            <div className="font-extrabold text-xl font-['Inter'] text-[#7a2f5f] tabular-nums tracking-tight mt-1.5">
              {formatNTD(statsUtang.totalUnpaid)}
            </div>
            <p className="text-[10px] text-neutral-400 mt-2 font-medium">
              {statsUtang.countUnpaid} tagihan
            </p>
          </div>

          {/* Card 3: Sebagian */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl transition-all duration-300 hover:scale-[1.01] hover:shadow-sm">
            <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block mb-1">
              Sebagian
            </span>
            <div className="font-extrabold text-xl font-['Inter'] text-[#94437a] tabular-nums tracking-tight mt-1.5">
              {formatNTD(statsUtang.totalPartial)}
            </div>
            <p className="text-[10px] text-neutral-400 mt-2 font-medium">
              {statsUtang.countPartial} tagihan
            </p>
          </div>

          {/* Card 4: Terlambat */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl transition-all duration-300 hover:scale-[1.01] hover:shadow-sm">
            <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block mb-1">
              Terlambat
            </span>
            <div className="font-extrabold text-xl font-['Inter'] text-red-600 dark:text-red-400 tabular-nums tracking-tight mt-1.5">
              {formatNTD(statsUtang.totalOverdue)}
            </div>
            <p className="text-[10px] text-red-450 dark:text-red-500/80 mt-2 font-medium">
              {statsUtang.countOverdue} jatuh tempo
            </p>
          </div>

          {/* Card 5: Lunas */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl transition-all duration-300 hover:scale-[1.01] hover:shadow-sm">
            <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block mb-1">
              Lunas
            </span>
            <div className="font-extrabold text-xl font-['Inter'] text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight mt-1.5">
              {formatNTD(statsUtang.totalPaid)}
            </div>
            <p className="text-[10px] text-neutral-400 mt-2 font-medium">
              {statsUtang.countPaid} diselesaikan
            </p>
          </div>
        </div>
      )}

      {/* 3. Main Listing Container */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/55 dark:bg-neutral-950/25">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-1.5 uppercase tracking-wide">
              {activeSegment === 'piutang' ? '📊 Daftar Outstanding Piutang Usaha' : '🛍️ Daftar Outstanding & Pinjaman Utang'}
            </h3>
            <p className="text-xs text-neutral-450 mt-0.5 font-medium">
              {activeSegment === 'piutang' 
                ? 'Daftar piutang dari pesanan yang dikirim/selesai dengan metode Belum Dibayar.' 
                : 'Daftar invoice supplier kargo, penerbit buku, dan pinjaman modal pihak ketiga.'}
            </p>
          </div>
          <span className="text-xs bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full font-bold">
            {activeSegment === 'piutang' ? `${salesOrders.length} Order` : `${unifiedUtangItems.length} Tagihan`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[1000px]">
            <thead>
              <tr className={`text-neutral-500 dark:text-neutral-400 text-xs font-bold border-b border-neutral-200 dark:border-neutral-800 ${activeSegment === 'utang' ? 'bg-[#faf1f7] dark:bg-[#3a1530]/15' : 'bg-neutral-50 dark:bg-neutral-950'}`}>
                <th className="p-4">Kode Doc</th>
                <th className="p-4">{activeSegment === 'piutang' ? 'Pelanggan / Saluran' : 'Kreditur'}</th>
                <th className="p-4 text-center">Tanggal</th>
                <th className="p-4 text-center">Jatuh Tempo</th>
                <th className="p-4 text-right">Tagihan</th>
                <th className="p-4 text-right">Terbayar</th>
                <th className="p-4 text-right text-[#7a2f5f] dark:text-[#f2e1ec]">Sisa</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs text-neutral-750 dark:text-neutral-300">
              {activeSegment === 'piutang' ? (
                salesOrders.map((so) => {
                  const outstanding = (so.totalPrice || 0) - (so.amountPaid || 0);
                  const statusBadge = so.amountPaid > 0 ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 text-[10px] uppercase font-bold py-0.5 px-2 rounded-full border border-amber-200/40' : 'bg-red-100 dark:bg-red-950/40 text-red-600 text-[10px] uppercase font-bold py-0.5 px-2 rounded-full border border-red-200/40';
                  const labelStatus = so.amountPaid > 0 ? 'Sebagian' : 'Belum Bayar';

                  return (
                    <tr key={so.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/30 transition duration-150">
                      <td className="p-4 font-['Inter'] tabular-nums">
                        <div className="font-bold text-neutral-900 dark:text-white">{so.orderCode || so.id}</div>
                        {so.orderNumber && (
                          <div className="text-[11px] text-neutral-500 font-mono font-medium mt-0.5">{so.orderNumber}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-neutral-800 dark:text-neutral-100">{so.customerName}</div>
                        <div className="text-[10px] text-neutral-450 mt-0.5">{so.orderType || 'Retail'} • {so.platformChannel || 'WhatsApp'} • {so.pickupLogistics || '-'}</div>
                      </td>
                      <td className="p-4 text-center text-neutral-500 font-medium font-['Inter']">
                        {formatToYYYYMMDD(so.completedAt || so.createdAt)}
                      </td>
                      <td className="p-4 text-center text-neutral-450 font-medium font-['Inter']">
                        -
                      </td>
                      <td className="p-4 text-right font-bold text-neutral-800 dark:text-neutral-200 font-['Inter'] tabular-nums">{formatNTD(so.totalPrice)}</td>
                      <td className="p-4 text-right text-emerald-600 dark:text-emerald-400 font-bold font-['Inter'] tabular-nums">
                        {formatNTD(so.amountPaid || 0)}
                      </td>
                      <td className="p-4 text-right font-extrabold text-blue-600 dark:text-blue-400 font-['Inter'] tabular-nums">
                        {formatNTD(outstanding)}
                      </td>
                      <td className="p-4 text-center">
                        <span className={statusBadge}>{labelStatus}</span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleOpenPaymentModal({
                            id: so.id,
                            isLoan: false,
                            totalAmount: so.totalPrice,
                            amountPaid: so.amountPaid || 0,
                            exchangeRate: so.exchangeRate || 500,
                            originalItem: so
                          })}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider transition duration-150 flex items-center gap-1 mx-auto"
                        >
                          <Plus className="h-3 w-3" /> Terima Bayar
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                unifiedUtangItems.map((item) => {
                  const outstanding = item.totalAmount - item.amountPaid;
                  
                  let statusBadge = '';
                  let labelStatus = '';
                  
                  if (item.paymentStatus === 'paid') {
                    statusBadge = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-bold py-0.5 px-2 rounded-full border border-emerald-100 dark:border-emerald-900/40';
                    labelStatus = 'Lunas';
                  } else if (item.amountPaid > 0) {
                    statusBadge = 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[10px] uppercase font-bold py-0.5 px-2 rounded-full border border-amber-100 dark:border-amber-900/40';
                    labelStatus = 'Sebagian';
                  } else {
                    statusBadge = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[10px] uppercase font-bold py-0.5 px-2 rounded-full border border-red-100 dark:border-red-900/40';
                    labelStatus = 'Belum Bayar';
                  }

                  return (
                    <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/30 transition duration-150">
                      <td className="p-4">
                        <span className="font-bold text-neutral-900 dark:text-white font-['Inter'] tabular-nums block">{item.code}</span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-neutral-800 dark:text-neutral-100 uppercase">{item.creditor}</div>
                        <div className="text-[10px] text-neutral-450 mt-0.5 leading-relaxed">{item.description}</div>
                      </td>
                      <td className="p-4 text-center text-neutral-500 font-medium font-['Inter']">
                        {formatToYYYYMMDD(item.date)}
                      </td>
                      <td className="p-4 text-center text-neutral-500 font-medium font-['Inter']">
                        {formatToYYYYMMDD(item.dueDate)}
                      </td>
                      <td className="p-4 text-right font-['Inter'] tabular-nums">
                        <div className="font-bold text-neutral-800 dark:text-neutral-200">{formatNTD(item.totalAmount)}</div>
                        {item.totalAmountIDR > 0 && (
                          <div className="text-[10px] text-neutral-400 font-normal mt-0.5">{formatIDR(item.totalAmountIDR)}</div>
                        )}
                      </td>
                      <td className="p-4 text-right text-emerald-600 dark:text-emerald-400 font-bold font-['Inter'] tabular-nums">
                        {formatNTD(item.amountPaid)}
                      </td>
                      <td className="p-4 text-right font-extrabold text-[#7a2f5f] dark:text-[#f2e1ec] font-['Inter'] tabular-nums text-sm">
                        {formatNTD(outstanding)}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={statusBadge}>{labelStatus}</span>
                          {item.paymentStatus === 'paid' && (
                            <button
                              onClick={() => handleReversePayment(item)}
                              title="Reverse Pelunasan ke Belum Dibayar"
                              className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-red-500 transition"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {outstanding > 0 ? (
                            <button
                              onClick={() => handleOpenPaymentModal(item)}
                              className="px-3 py-1.5 bg-[#7a2f5f] hover:bg-[#5c2249] text-white font-bold rounded-lg text-[10px] uppercase tracking-wider transition shadow-xs flex items-center gap-1"
                            >
                              <Plus className="h-3 w-3" /> Bayar Utang
                            </button>
                          ) : (
                            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-1">
                              ✓ Selesai
                            </span>
                          )}

                          {(!item.amountPaid || item.amountPaid === 0) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingCancelUtang(item);
                              }}
                              title="Batalkan Utang & Jurnal"
                              className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200/50 hover:border-red-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" /> Batal
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}

              {activeSegment === 'piutang' && salesOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-neutral-450">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-xs text-neutral-500">Pristine! Tidak ada Piutang Usaha yang outstanding.</p>
                  </td>
                </tr>
              )}

              {activeSegment === 'utang' && unifiedUtangItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-neutral-450">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-xs text-neutral-500">Bersih! Tidak ada Utang Supplier atau Pinjaman yang tercatat.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Payment Modal */}
      {isPayModalOpen && selectedItem && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePaymentModal();
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn"
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5">
                {activeSegment === 'piutang' ? '💰 Rekonsiliasi Pelunasan Piutang' : '💸 Pembayaran Pelunasan Utang'}
              </span>
              <button 
                onClick={handleClosePaymentModal} 
                className="text-neutral-400 hover:text-neutral-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-5 space-y-4">
              <div className="bg-neutral-50 dark:bg-neutral-950 p-4 rounded-xl space-y-2 border border-neutral-100 dark:border-neutral-900">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-450">Referensi Dokumen:</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-100 font-['Inter']">
                    {selectedItem.code || selectedItem.id}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-450">{activeSegment === 'piutang' ? 'Nama Pelanggan:' : 'Nama Supplier/Kreditur:'}</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-100">
                    {activeSegment === 'piutang' ? selectedItem.customerName : selectedItem.creditor}
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-dashed border-neutral-200 dark:border-neutral-800">
                  <span className="text-neutral-450">Sisa Outstanding:</span>
                  <span className={`font-bold font-['Inter'] tabular-nums ${activeSegment === 'piutang' ? 'text-blue-600 dark:text-blue-400' : 'text-[#7a2f5f] dark:text-[#f2e1ec]'}`}>
                    {formatNTD(selectedItem.totalAmount - selectedItem.amountPaid)}
                  </span>
                </div>
              </div>

              {/* Input Form Fields */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Tanggal Transaksi Bayar *</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs"
                  />
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Kas Rekening Penerima *</label>
                  <select
                    value={cashAccount}
                    onChange={(e) => setCashAccount(e.target.value as any)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs"
                  >
                    <option value="1101">{liveAccounts.CASH_NTD?.code || '1101'} - {liveAccounts.CASH_NTD?.name || 'Cash:NTD'}</option>
                    <option value="1102">{liveAccounts.CASH_RUPIAH?.code || '1102'} - {liveAccounts.CASH_RUPIAH?.name || 'Cash Rupiah'}</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-500">Kurs FX (IDR ➔ NT$)*</label>
                    <button
                      type="button"
                      onClick={refreshLiveFxRate}
                      disabled={isRefreshingFx}
                      className="text-[9px] text-blue-600 dark:text-blue-400 hover:underline font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Sinkronkan dengan Kurs Real-Time dari API"
                    >
                      <RefreshCw className={`h-2.5 w-2.5 ${isRefreshingFx ? 'animate-spin' : ''}`} />
                      <span>Real-Time: Rp {liveExchangeRate}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    disabled={cashAccount === '1101'}
                    value={payRate}
                    onChange={(e) => setPayRate(formatInputWithCommas(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs font-['Inter'] disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-75 disabled:cursor-not-allowed font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Nominal Pelunasan (NT$) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ketik jumlah NT$..."
                  value={payAmount}
                  onChange={(e) => setPayAmount(formatInputWithCommas(e.target.value))}
                  className="w-full px-4 py-2.5 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-sm font-bold font-['Inter']"
                />
              </div>

              {cashAccount === '1102' && payAmount && (
                <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-850 dark:text-amber-400 p-3 rounded-lg text-[10px] leading-relaxed border border-amber-100 dark:border-amber-900/40 flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="font-medium">
                    Pembayaran Rupiah setara dengan <strong className="font-['Inter']">{formatIDR(Math.round(parseFloat(cleanCommas(payAmount)) * parseFloat(cleanCommas(payRate))))}</strong> akan dikreditkan dari rekening Cash Rupiah (Akun 1102).
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={handleClosePaymentModal}
                  className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-xs font-bold rounded-lg text-neutral-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-white rounded-lg text-xs font-extrabold shadow-sm ${
                    activeSegment === 'piutang' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#7a2f5f] hover:bg-[#5c2249]'
                  }`}
                >
                  Posting Transaksi Pelunasan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add Loan Modal */}
      {isAddLoanModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddLoanModalOpen(false);
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn"
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-1.5 text-[#7a2f5f] dark:text-[#f2e1ec]">
                🏦 Tambah Penerimaan Pinjaman Modal
              </span>
              <button 
                onClick={() => setIsAddLoanModalOpen(false)} 
                className="text-neutral-400 hover:text-neutral-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddLoan} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Nama Kreditur / Pemberi Pinjaman *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Bank Taiwan, Owner's Sister, dll..."
                    value={loanCreditorName}
                    onChange={(e) => setLoanCreditorName(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Mata Uang Pinjaman *</label>
                  <select
                    value={loanCurrency}
                    onChange={(e) => setLoanCurrency(e.target.value as any)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs"
                  >
                    <option value="NTD">NT$ (New Taiwan Dollar)</option>
                    <option value="IDR">IDR (Rupiah Indonesia)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Nominal Pinjaman *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nominal pinjaman..."
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(formatInputWithCommas(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs font-bold font-['Inter']"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Akun Kas Penerima *</label>
                  <select
                    value={loanCashAccount}
                    onChange={(e) => setLoanCashAccount(e.target.value as any)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs"
                    disabled={loanCurrency === 'IDR'} // lock to 1102 if currency is IDR
                  >
                    <option value="1101">1101 - Cash NTD</option>
                    <option value="1102">1102 - Cash Rupiah</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-500">Kurs FX (IDR ➔ NT$) *</label>
                    <button
                      type="button"
                      onClick={refreshLiveFxRate}
                      disabled={isRefreshingFx}
                      className="text-[9px] text-[#7a2f5f] dark:text-[#f2e1ec] hover:underline font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Sinkronkan dengan Kurs Real-Time dari API"
                    >
                      <RefreshCw className={`h-2.5 w-2.5 ${isRefreshingFx ? 'animate-spin' : ''}`} />
                      <span>Real-Time: Rp {liveExchangeRate}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    disabled={loanCurrency === 'NTD'}
                    value={loanFxRate}
                    onChange={(e) => setLoanFxRate(formatInputWithCommas(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs font-bold font-['Inter'] disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Tanggal Terima Pinjaman *</label>
                  <input
                    type="date"
                    required
                    value={loanDate}
                    onChange={(e) => setLoanDate(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Tanggal Jatuh Tempo (Opsional)</label>
                  <input
                    type="date"
                    value={loanDueDate}
                    onChange={(e) => setLoanDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Keterangan / Notes</label>
                  <textarea
                    placeholder="Detail tambahan mengenai pinjaman modal..."
                    value={loanNotes}
                    onChange={(e) => setLoanNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-xs font-medium"
                  />
                </div>
              </div>

              {loanAmount && (
                <div className="bg-[#faf1f7] dark:bg-[#3a1530]/15 border border-[#f2e1ec]/50 p-4 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-[#7a2f5f] dark:text-[#f2e1ec] block text-[10px] uppercase tracking-wider">
                    Simulasi Akuntansi Jurnal Auto
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                    <div className="border-r border-neutral-200 dark:border-neutral-800 pr-2">
                      <strong className="text-neutral-500 capitalize block text-[9px]">Sisi Debit (Uang Masuk)</strong>
                      <span className="font-bold text-emerald-600 block">
                        Akun {loanCashAccount === '1101' ? `${liveAccounts.CASH_NTD?.code || '1101'} - NTD` : `${liveAccounts.CASH_RUPIAH?.code || '1102'} - IDR`}
                      </span>
                      <span className="font-['Inter'] font-semibold">
                        {loanCurrency === 'IDR'
                          ? `NT$ ${Math.round(parseFloat(cleanCommas(loanAmount)) / parseFloat(cleanCommas(loanFxRate))).toLocaleString('id-ID')} (${formatIDR(parseFloat(cleanCommas(loanAmount)))})`
                          : formatNTD(parseFloat(cleanCommas(loanAmount)) * 100)
                        }
                      </span>
                    </div>
                    <div className="pl-2">
                      <strong className="text-neutral-500 capitalize block text-[9px]">Sisi Kredit (Utang Bertambah)</strong>
                      <span className="font-bold text-[#7a2f5f] dark:text-[#f2e1ec] block">
                        Akun 2100-{loanCreditorName ? loanCreditorName.replace(/[^a-zA-Z0-9]/g, '').substring(0,6).toUpperCase() : 'XXXX'}
                      </span>
                      <span className="font-['Inter'] font-semibold">
                        {loanCurrency === 'IDR'
                          ? `NT$ ${Math.round(parseFloat(cleanCommas(loanAmount)) / parseFloat(cleanCommas(loanFxRate))).toLocaleString('id-ID')} (${formatIDR(parseFloat(cleanCommas(loanAmount)))})`
                          : formatNTD(parseFloat(cleanCommas(loanAmount)) * 100)
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAddLoanModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-xs font-bold rounded-lg text-neutral-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLoan}
                  className="px-5 py-2 bg-[#7a2f5f] hover:bg-[#5c2249] text-white rounded-lg text-xs font-extrabold shadow-sm transition disabled:opacity-50"
                >
                  {isSubmittingLoan ? 'Memposting Jurnal...' : 'Tambah & Posting Jurnal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Delete Confirmation Modal */}
      {confirmingCancelUtang && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget && !isCancelingUtang) {
              setConfirmingCancelUtang(null);
            }
          }}
          className="fixed inset-0 bg-neutral-950/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="h-6 w-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">Batalkan & Hapus Utang?</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Apakah Anda yakin ingin membatalkan & menghapus transaksi <strong className="text-neutral-800 dark:text-neutral-200">{confirmingCancelUtang.code}</strong> ({confirmingCancelUtang.creditor || 'Kreditur'})? Seluruh data jurnal dan pencatatan terkait akan dihapus secara permanen.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isCancelingUtang}
                onClick={() => setConfirmingCancelUtang(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isCancelingUtang}
                onClick={handleConfirmCancelUtang}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCancelingUtang && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Konfirmasi Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
