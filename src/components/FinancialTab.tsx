import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { FALLBACK_NTD_PER_IDR } from '../lib/exchangeRateConstants';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  Timestamp,
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { CashFlowEntry, JournalEntry, Payroll, BusinessPartner, Category, CoaAccount } from '../types';
import { NeracaReport, PerubahanModalReport, CashFlowReport, LabaRugiReport } from './FinancialReports';
import { BusinessPartnerTab } from './BusinessPartnerTab';
import { PriveTab } from './PriveTab';
import { PiutangUtangTab } from './PiutangUtangTab';
import { formatNTD, formatIDR, getAccountBalanceForPeriod, formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { isPeriodClosed } from '../lib/period-closing-utils';
import { ensureAutoAccountExists, AUTO_ACCOUNTS, findAccountByRole, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { useAuth } from '../lib/auth-context';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Sliders, 
  User, 
  DollarSign, 
  History, 
  X, 
  Activity, 
  ReceiptText, 
  Scale, 
  Wallet, 
  Users, 
  FileDown,
  Pencil,
  Trash2,
  Calendar 
} from 'lucide-react';
import { Decimal } from 'decimal.js';

interface FinancialTabProps {
  activeSubTab: 'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang';
  setActiveSubTab: (subTab: 'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang') => void;
}

export const FinancialTab: React.FC<FinancialTabProps> = ({ activeSubTab, setActiveSubTab }) => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  
  // Realtime lists
  const [cashflows, setCashflows] = useState<CashFlowEntry[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);

  // Modals state
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);
  const [isPartnerOpen, setIsPartnerOpen] = useState(false);

  // Form Fields
  const [payee, setPayee] = useState('');
  const [payrollPeriod, setPayrollPeriod] = useState('2026-06');
  const [payCurrency, setPayCurrency] = useState<'IDR' | 'NTD'>('NTD');
  const [liveAccounts, setLiveAccounts] = useState<Record<string, AutoAccount>>(AUTO_ACCOUNTS);
  
  useEffect(() => {
    getLiveAutoAccounts().then(setLiveAccounts).catch(console.error);
  }, []);
  
  const [payAmount, setPayAmount] = useState('30,000');
  const [payNotes, setPayNotes] = useState('');
  const [payDate, setPayDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [editingPayroll, setEditingPayroll] = useState<Payroll | null>(null);
  const [payrollToDelete, setPayrollToDelete] = useState<Payroll | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Partner Form
  const [partnerName, setPartnerName] = useState('');
  const [partnerPercent, setPartnerPercent] = useState('10');
  const [partnerCategories, setPartnerCategories] = useState<string[]>([]);

  // Validation Shake States
  const [shakeFields, setShakeFields] = useState<Record<string, boolean>>({});
  const triggerShake = (fieldKey: string) => {
    setShakeFields(prev => ({ ...prev, [fieldKey]: true }));
    setTimeout(() => {
      setShakeFields(prev => ({ ...prev, [fieldKey]: false }));
    }, 500);
  };

  useEffect(() => {
    // Ensure Prive, Setoran Modal and Beban Gaji accounts exist in CoA
    const ensureAccounts = async () => {
      await ensureAutoAccountExists(AUTO_ACCOUNTS.PRIVE);
      await ensureAutoAccountExists(AUTO_ACCOUNTS.SETORAN_MODAL);
      await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_GAJI);
    };
    ensureAccounts();

    // Read Cash flows
    const unsubCf = onSnapshot(collection(db, 'cashFlow'), (snap) => {
      const cList: CashFlowEntry[] = [];
      snap.forEach((d) => cList.push(d.data() as CashFlowEntry));
      setCashflows(cList.sort((a, b) => b.date?.seconds - a.date?.seconds));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Read Journal entries
    const unsubJ = onSnapshot(collection(db, 'journalEntries'), (snap) => {
      const jList: JournalEntry[] = [];
      snap.forEach((d) => jList.push(d.data() as JournalEntry));
      setJournals(jList.sort((a, b) => b.date?.seconds - a.date?.seconds));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Read payroll
    const unsubP = onSnapshot(collection(db, 'payroll'), (snap) => {
      const pList: Payroll[] = [];
      snap.forEach((d) => pList.push({ id: d.id, ...d.data() } as Payroll));
      setPayrolls(pList);
    }, (err) => {
      console.error('Payroll error:', err);
    });

    // Read Business Partners
    const unsubPartners = onSnapshot(collection(db, 'partners'), (snap) => {
      const ptList: BusinessPartner[] = [];
      snap.forEach((d) => ptList.push({ id: d.id, ...d.data() } as BusinessPartner));
      setPartners(ptList);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Read categories
    const unsubCat = onSnapshot(collection(db, 'categories'), (snap) => {
      const cList: Category[] = [];
      snap.forEach((d) => {
        if (!d.id.startsWith('config_')) {
          cList.push({ id: d.id, ...d.data() } as Category);
        }
      });
      setCategories(cList);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Read coa
    const unsubCoA = onSnapshot(collection(db, 'coa'), (snap) => {
      const list: CoaAccount[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as CoaAccount));
      setCoaAccounts(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Read closed periods
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

    return () => {
      unsubCf();
      unsubJ();
      unsubP();
      unsubPartners();
      unsubCat();
      unsubCoA();
      unsubClosings();
    };
  }, []);

  // --- Sub-Tab 1: Cash Flow Positions ---
  const ntdCashflows = cashflows.filter(c => c.ledger === 'NTD');
  const idrCashflows = cashflows.filter(c => c.ledger === 'IDR');

  // --- Sub-Tab 2: Income Statement calculations ---
  // Revenue channels
  const shopeeRevenues = journals
    .flatMap(j => j.lines)
    .filter(l => l.account === 'Revenue:Shopee')
    .reduce((acc, l) => acc + l.credit, 0);

  const websiteRevenues = journals
    .flatMap(j => j.lines)
    .filter(l => l.account === 'Revenue:Website')
    .reduce((acc, l) => acc + l.credit, 0);

  const directRevenues = journals
    .flatMap(j => j.lines)
    .filter(l => l.account.startsWith('Revenue:') && l.account !== 'Revenue:Shopee' && l.account !== 'Revenue:Website')
    .reduce((acc, l) => acc + l.credit, 0);

  const totalRevenue = shopeeRevenues + websiteRevenues + directRevenues;

  // COGS (Double entry COGS)
  const totalCOGS = journals
    .flatMap(j => j.lines)
    .filter(l => l.account === 'COGS')
    .reduce((acc, l) => acc + l.debit, 0);

  const grossProfit = totalRevenue - totalCOGS;

  // Operating Expenses (OpEx)
  // Prorated Forwarder Cargo expenses
  const forwarderExp = journals
    .flatMap(j => j.lines)
    .filter(l => l.account === 'Cash:IDR' || l.account === 'Cash Rupiah' || l.account === 'Cash:NTD')
    // let's estimate payroll salary + other expenses
    .reduce((acc, l) => acc + 0, 0); // Simplified for reporting or we can sum Cashflows categorised under salary or opEx

  const payrollExpensesNTD = payrolls.reduce((acc, p) => {
    // Convert to NTD snapshot
    const amt = p.currency === 'NTD' ? p.amount * 100 : p.amount * 0.17801; // estimated mock conversion
    return acc + amt;
  }, 0);

  const partnerExpensesNTD = journals
    .flatMap(j => j.lines)
    .filter(l => l.accountCode === AUTO_ACCOUNTS.PARTNER_PROFIT_SHARE.code)
    .reduce((acc, l) => acc + l.debit, 0);

  const totalOpEx = payrollExpensesNTD + partnerExpensesNTD;
  const netIncome = grossProfit - totalOpEx;

  // --- Sub-Tab 3: Balance Sheet calculations ---
  // Current Assets
  // Cash NTD & Cash IDR (base values + mutations)
  const ntdInflow = cashflows.filter(c => c.ledger === 'NTD' && c.direction === 'inflow').reduce((acc, c) => acc + c.amount, 0);
  const ntdOutflow = cashflows.filter(c => c.ledger === 'NTD' && c.direction === 'outflow').reduce((acc, c) => acc + c.amount, 0);
  const balanceCashNTD = 15000000 + ntdInflow - ntdOutflow;

  const idrInflow = cashflows.filter(c => c.ledger === 'IDR' && c.direction === 'inflow').reduce((acc, c) => acc + c.amount, 0);
  const idrOutflow = cashflows.filter(c => c.ledger === 'IDR' && c.direction === 'outflow').reduce((acc, c) => acc + c.amount, 0);
  const balanceCashIDR = 85000000 + idrInflow - idrOutflow;

  const balanceCashIDRInNTD = balanceCashIDR * 0.17801; // approx NTD cents

  // Inventory value calculated dynamically from the Chart of Accounts ledger
  const acc1200 = coaAccounts.find(a => a.code === '1200');
  const balanceInventory = acc1200 
    ? Math.round(getAccountBalanceForPeriod(acc1200, coaAccounts, journals, null, null) * 100)
    : 0;

  const totalAssets = balanceCashNTD + balanceCashIDRInNTD + balanceInventory;

  // Current Liabilities & equity calculated dynamically from the Hutang Komisi Reseller (2101) ledger
  const acc2101 = coaAccounts.find(a => a.code === '2101');
  const partnerAccountsPayable = acc2101 
    ? Math.round(getAccountBalanceForPeriod(acc2101, coaAccounts, journals, null, null) * 100)
    : 0;
  const balanceEquity = totalAssets - partnerAccountsPayable; // Balancing equity

  // Add / Edit payroll record
  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    
    let hasValidationError = false;
    if (!payee.trim()) {
      triggerShake('payee');
      hasValidationError = true;
    }
    if (!payAmount) {
      triggerShake('payAmount');
      hasValidationError = true;
    }

    if (hasValidationError) {
      return;
    }

    const amtNum = parseFloat(cleanCommas(payAmount)) || 0;
    const isEditing = !!editingPayroll;

    // Check closed period lock
    const targetDate = new Date(payDate);
    if (isPeriodClosed(targetDate, closedPeriods)) {
      setErrorMsg(`Tidak dapat menyimpan transaksi. Periode bulan ${payDate.substring(0, 7)} sudah ditutup.`);
      return;
    }

    if (isEditing && editingPayroll) {
      const originalPaidAtDate = editingPayroll.paidAt?.seconds 
        ? new Date(editingPayroll.paidAt.seconds * 1000) 
        : editingPayroll.paidAt instanceof Date 
          ? editingPayroll.paidAt 
          : new Date(editingPayroll.paidAt);
      if (isPeriodClosed(originalPaidAtDate, closedPeriods)) {
        setErrorMsg(`Tidak dapat mengubah transaksi. Tanggal transaksi awal (${originalPaidAtDate.toLocaleDateString()}) berada di periode yang sudah ditutup.`);
        return;
      }
    }

    try {
      const pId = isEditing ? editingPayroll!.id : doc(collection(db, 'payroll')).id;
      const parsedDate = new Date(payDate);
      const timestampVal = Timestamp.fromDate(parsedDate);
      
      const amtCents = payCurrency === 'NTD' ? amtNum * 100 : amtNum; // store whole
      const amtNtdCents = payCurrency === 'NTD' ? amtNum * 100 : amtNum * 0.17801;

      // Find Beban Gaji account dynamically
      const bebanGajiAccountObj = findAccountByRole(coaAccounts, 'beban_gaji');
      const bebanGajiCode = bebanGajiAccountObj?.code || '5120';
      const bebanGajiName = bebanGajiAccountObj?.name || 'Beban Gaji';

      const cashAccountCode = payCurrency === 'NTD' ? AUTO_ACCOUNTS.CASH_NTD?.code || '1101' : AUTO_ACCOUNTS.CASH_RUPIAH?.code || '1102';
      const cashAccountName = payCurrency === 'NTD' ? 'Cash:NTD' : 'Cash Rupiah';

      // Setup references
      const payrollRef = doc(db, 'payroll', pId);

      // We need to resolve journalId and cashflowId
      let journalId = editingPayroll?.journalId || '';
      let cashflowId = editingPayroll?.cashflowId || '';

      // Fallback query if editing and those IDs are missing
      if (isEditing && (!journalId || !cashflowId)) {
        // Find journal
        const jSnap = await getDocs(query(collection(db, 'journalEntries'), where('refType', '==', 'payroll'), where('refId', '==', pId)));
        if (!jSnap.empty) {
          journalId = jSnap.docs[0].id;
        } else {
          journalId = await getNextJournalId(payDate);
        }

        // Find cashFlow
        const cfSnap = await getDocs(query(collection(db, 'cashFlow'), where('refType', '==', 'payroll'), where('refId', '==', pId)));
        if (!cfSnap.empty) {
          cashflowId = cfSnap.docs[0].id;
        } else {
          cashflowId = doc(collection(db, 'cashFlow')).id;
        }
      } else if (!isEditing) {
        journalId = await getNextJournalId(payDate);
        cashflowId = doc(collection(db, 'cashFlow')).id;
      }

      const journalRef = doc(db, 'journalEntries', journalId);
      const cashflowRef = doc(db, 'cashFlow', cashflowId);

      // Execute transaction (atomically)
      await runTransaction(db, async (transaction) => {
        // Read Phase first (all reads before writes)
        const payrollSnap = await transaction.get(payrollRef);
        const journalSnap = await transaction.get(journalRef);
        const cashflowSnap = await transaction.get(cashflowRef);

        // Write Phase second
        // 1. Payroll Doc
        const payrollPayload = {
          id: pId,
          payee,
          period: payrollPeriod,
          currency: payCurrency,
          amount: amtNum,
          paidAt: timestampVal,
          notes: payNotes,
          journalId,
          cashflowId
        } as Payroll;
        transaction.set(payrollRef, payrollPayload);

        // 2. Cash Flow Doc
        const cashFlowPayload = {
          id: cashflowId,
          date: timestampVal,
          ledger: payCurrency,
          direction: 'outflow',
          category: 'payroll',
          amount: amtCents,
          amountNTD: amtNtdCents,
          fxRateUsed: payCurrency === 'NTD' ? 1 : FALLBACK_NTD_PER_IDR,
          refType: 'payroll',
          refId: pId,
          description: `Payroll Salary Gaji ${payee} untuk Periode ${payrollPeriod}`,
          createdAt: isEditing && cashflowSnap.exists() ? (cashflowSnap.data()?.createdAt || Timestamp.now()) : Timestamp.now()
        } as CashFlowEntry;
        transaction.set(cashflowRef, cashFlowPayload);

        // 3. Journal Entry Doc
        const journalPayload = {
          id: journalId,
          date: timestampVal,
          description: `Penggajian Gaji ${payee} untuk Periode ${payrollPeriod}`,
          lines: [
            { 
              account: bebanGajiName, 
              accountCode: bebanGajiCode, 
              debit: Math.round(amtNtdCents), 
              credit: 0,
              originalCurrency: payCurrency,
              originalDebitIDR: payCurrency === 'IDR' ? amtNum : 0,
              originalCreditIDR: 0
            },
            { 
              account: cashAccountName, 
              accountCode: cashAccountCode, 
              debit: 0, 
              credit: Math.round(amtNtdCents),
              originalCurrency: payCurrency,
              originalDebitIDR: 0,
              originalCreditIDR: payCurrency === 'IDR' ? amtNum : 0
            }
          ],
          refType: 'payroll',
          refId: pId,
          isAuto: true,
          createdAt: isEditing && journalSnap.exists() ? (journalSnap.data()?.createdAt || Timestamp.now()) : Timestamp.now()
        } as JournalEntry;
        transaction.set(journalRef, journalPayload);

        // Log audit entry if editing
        if (isEditing) {
          const auditId = doc(collection(db, 'auditLog')).id;
          const auditRef = doc(db, 'auditLog', auditId);
          const auditEntry = {
            id: auditId,
            timestamp: Timestamp.now(),
            userEmail: profile?.email || 'unknown@kangenbukuindo.tw',
            userDisplayName: profile?.displayName || 'User',
            action: 'UPDATE',
            journalId: journalId,
            before: journalSnap.exists() ? journalSnap.data() : null,
            after: journalPayload
          };
          transaction.set(auditRef, auditEntry);
        }
      });

      setIsPayrollOpen(false);
      resetPayrollForm();
    } catch (err) {
      console.error("Error saving payroll", err);
      setErrorMsg(err instanceof Error ? err.message : "Gagal menyimpan data payroll.");
    }
  };

  // Delete payroll record
  const handleDeletePayroll = async (payroll: Payroll) => {
    const paidAtDate = payroll.paidAt?.seconds 
      ? new Date(payroll.paidAt.seconds * 1000) 
      : payroll.paidAt instanceof Date 
        ? payroll.paidAt 
        : new Date(payroll.paidAt);
    
    if (isPeriodClosed(paidAtDate, closedPeriods)) {
      alert(`Tidak dapat menghapus transaksi. Tanggal transaksi awal (${paidAtDate.toLocaleDateString()}) berada di periode yang sudah ditutup.`);
      return;
    }

    try {
      const pId = payroll.id;
      const payrollRef = doc(db, 'payroll', pId);

      // We need to resolve journalId and cashflowId
      let journalId = payroll.journalId || '';
      let cashflowId = payroll.cashflowId || '';

      // Fallback query if they are missing
      if (!journalId || !cashflowId) {
        // Find journal
        const jSnap = await getDocs(query(collection(db, 'journalEntries'), where('refType', '==', 'payroll'), where('refId', '==', pId)));
        if (!jSnap.empty) {
          journalId = jSnap.docs[0].id;
        }

        // Find cashFlow
        const cfSnap = await getDocs(query(collection(db, 'cashFlow'), where('refType', '==', 'payroll'), where('refId', '==', pId)));
        if (!cfSnap.empty) {
          cashflowId = cfSnap.docs[0].id;
        }
      }

      const journalRef = journalId ? doc(db, 'journalEntries', journalId) : null;
      const cashflowRef = cashflowId ? doc(db, 'cashFlow', cashflowId) : null;

      await runTransaction(db, async (transaction) => {
        // Read Phase first (all reads before writes)
        const payrollSnap = await transaction.get(payrollRef);
        const journalSnap = journalRef ? await transaction.get(journalRef) : null;
        const cashflowSnap = cashflowRef ? await transaction.get(cashflowRef) : null;

        // Write Phase second
        if (payrollSnap.exists()) {
          transaction.delete(payrollRef);
        }
        if (journalRef && journalSnap && journalSnap.exists()) {
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
            journalId: journalId,
            before: journalSnap.data(),
            after: null
          };
          transaction.set(auditRef, auditEntry);
        }
        if (cashflowRef && cashflowSnap && cashflowSnap.exists()) {
          transaction.delete(cashflowRef);
        }
      });

      setPayrollToDelete(null);
    } catch (err) {
      console.error("Error deleting payroll", err);
      alert(err instanceof Error ? err.message : "Gagal menghapus data payroll.");
    }
  };

  const openEditPayrollModal = (p: Payroll) => {
    setErrorMsg(null);
    setEditingPayroll(p);
    setPayee(p.payee);
    setPayrollPeriod(p.period);
    setPayCurrency(p.currency);
    setPayAmount(formatInputWithCommas(p.amount.toString()));
    setPayNotes(p.notes || '');
    
    // Determine paidAt date for the date picker
    const paidAtDate = p.paidAt?.seconds 
      ? new Date(p.paidAt.seconds * 1000) 
      : p.paidAt instanceof Date 
        ? p.paidAt 
        : new Date(p.paidAt || Date.now());
    setPayDate(paidAtDate.toISOString().split('T')[0]);
    
    setIsPayrollOpen(true);
  };

  const resetPayrollForm = () => {
    setPayee('');
    setPayrollPeriod('2026-06');
    setPayCurrency('NTD');
    setPayAmount('30,000');
    setPayNotes('');
    const today = new Date();
    setPayDate(today.toISOString().split('T')[0]);
    setErrorMsg(null);
    setEditingPayroll(null);
  };

  // Add Business Partner
  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName.trim()) {
      triggerShake('partnerName');
      return;
    }

    try {
      const pId = doc(collection(db, 'partners')).id;
      await setDoc(doc(db, 'partners', pId), {
        id: pId,
        name: partnerName,
        profitSharePercent: 0,
        bookLines: partnerCategories,
        payableBalance: 0
      } as BusinessPartner);

      setIsPartnerOpen(false);
      setPartnerName('');
      setPartnerCategories([]);
    } catch (err) {
      console.error("Error adding partner", err);
    }
  };

  // Settle partner payable payout
  const handleSettlePartner = async (partner: BusinessPartner) => {
    const amountToSettle = partnerAccountsPayable;

    if (amountToSettle <= 0) {
      return;
    }

    try {
      const cfId = doc(collection(db, 'cashFlow')).id;
      await setDoc(doc(db, 'cashFlow', cfId), {
        id: cfId,
        date: Timestamp.now(),
        ledger: 'NTD',
        direction: 'outflow',
        category: 'partners_payout',
        amount: amountToSettle,
        amountNTD: amountToSettle,
        fxRateUsed: 1,
        refType: 'manual',
        refId: partner.id,
        description: `Payout Prive Settle Pembagian Profit Share bagi Partner ${partner.name}`,
        createdAt: Timestamp.now()
      } as CashFlowEntry);

      // Record double entry Journal: Dr Hutang Komisi Reseller (2101) | Cr Cash:NTD (1101)
      const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
      await setDoc(doc(db, 'journalEntries', journalId), {
        id: journalId,
        date: Timestamp.now(),
        description: `Settle Profit Share Partner - ${partner.name}`,
        lines: [
          { account: AUTO_ACCOUNTS.AP_PARTNERS?.name || 'Hutang Komisi Reseller', accountCode: AUTO_ACCOUNTS.AP_PARTNERS?.code || '2101', debit: amountToSettle, credit: 0 },
          { account: AUTO_ACCOUNTS.CASH_NTD?.name || 'Cash:NTD', accountCode: AUTO_ACCOUNTS.CASH_NTD?.code || '1101', debit: 0, credit: amountToSettle }
        ],
        refType: 'manual',
        refId: partner.id,
        isAuto: true,
        createdAt: Timestamp.now()
      } as JournalEntry);

    } catch (err) {
      console.error("Error settling payout", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* SUBTAB 1: Upgraded Cash Flow Report */}
      {activeSubTab === 'cashflow' && (
        <CashFlowReport coaAccounts={coaAccounts} journals={journals} />
      )}

      {/* SUBTAB 2: Income Statement */}
      {activeSubTab === 'profit-loss' && (
        <LabaRugiReport coaAccounts={coaAccounts} journals={journals} />
      )}

      {/* SUBTAB 3: Redesigned Balance Sheet (Neraca) */}
      {activeSubTab === 'neraca' && (
        <NeracaReport coaAccounts={coaAccounts} journals={journals} />
      )}

      {/* SUBTAB 3.5: Statement of Owner's Equity (LPM) */}
      {activeSubTab === 'equity-change' && (
        <PerubahanModalReport coaAccounts={coaAccounts} journals={journals} />
      )}

      {/* SUBTAB 3.6: Prive Feature Tab */}
      {activeSubTab === 'prive' && (
        <PriveTab />
      )}

      {/* SUBTAB 4: Payroll List */}
      {activeSubTab === 'payroll' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5"><DollarSign className="h-4.5 w-4.5 text-indigo-500" /> Payroll Gaji & Transportasi Kantor</h4>
              <p className="text-xs text-neutral-500">Daftar remunerasi administrasi staf and kargo pengiriman.</p>
            </div>
            <button
              onClick={() => setIsPayrollOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded shadow-sm select-none"
            >
              <Plus className="h-3.5 w-3.5" />
              Catat Penggajian
            </button>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs font-bold uppercase border-b border-neutral-200 dark:border-neutral-800">
                  <th className="p-4 text-center">Penerima Gaji (Payee)</th>
                  <th className="p-4 text-center">Periode</th>
                  <th className="p-4 text-center">Waktu Dibayar</th>
                  <th className="p-4 text-center">Mata Uang</th>
                  <th className="p-4 text-center">Jumlah Gaji</th>
                  <th className="p-4 text-center">Keterangan Catatan</th>
                  <th className="p-4 text-center">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-805 text-xs text-neutral-700 dark:text-neutral-350">
                {payrolls.map((p) => {
                  const isClosed = isPeriodClosed(p.paidAt, closedPeriods);
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="p-4 text-center font-bold">{p.payee}</td>
                      <td className="p-4 text-center text-neutral-500 font-medium">{p.period}</td>
                      <td className="p-4 text-center text-xs">
                        <div>{p.paidAt?.seconds ? new Date(p.paidAt.seconds * 1000).toLocaleDateString() : 'N/A'}</div>
                        {isClosed && (
                          <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                            Terkunci
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center uppercase font-numeric font-bold text-neutral-500">{p.currency}</td>
                      <td className="p-4 text-center font-numeric font-bold text-neutral-900 dark:text-white">
                        <div>
                          {p.currency === 'NTD' ? formatNTD(p.amount * 100) : formatNTD(p.amount * 0.17801)}
                        </div>
                        {p.currency === 'IDR' && (
                          <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-normal mt-0.5">
                            ({formatIDR(p.amount)})
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-center text-neutral-400">{p.notes || '-'}</td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openEditPayrollModal(p)}
                            className="p-1.5 text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                            title="Edit Transaksi"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setPayrollToDelete(p)}
                            className="p-1.5 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {payrolls.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-neutral-450 italic">Belum ada data penggajian yang dicatat.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 5: Partners List */}
      {activeSubTab === 'partners' && <BusinessPartnerTab />}


      {/* SUBTAB 6: Utang Usaha */}
      {activeSubTab === 'utang' && (
        <PiutangUtangTab forceMode="utang" />
      )}

      {/* Add/Edit Payroll Modal */}
      {isPayrollOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const hasChanges = payee.trim() !== '' || payAmount.trim() !== '' || payNotes.trim() !== '';
              if (hasChanges) {
                if (!window.confirm("Apakah kamu yakin ingin keluar? Perubahan belum disimpan.")) {
                  return;
                }
              }
              setIsPayrollOpen(false);
              resetPayrollForm();
            }
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-sm font-bold uppercase">
                {editingPayroll ? '✏️ Edit Remunerasi / Gaji Karyawan' : '💵 Catat Remunerasi / Gaji Karyawan'}
              </span>
              <button onClick={() => { setIsPayrollOpen(false); resetPayrollForm(); }} className="text-neutral-450 hover:text-neutral-250">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayroll} className="p-5 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 text-xs font-semibold">
                  ⚠️ {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs uppercase font-bold text-neutral-500 mb-1">Nama Penerima Gaji (Payee) *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Lin Mei Fung / Staf Admin"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg text-sm transition-all focus:outline-none ${
                    shakeFields['payee']
                      ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                      : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:ring-1 focus:ring-indigo-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase font-bold text-neutral-500 mb-1">Periode Bulan *</label>
                  <input
                    type="month"
                    required
                    value={payrollPeriod}
                    onChange={(e) => setPayrollPeriod(e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold text-neutral-450 mb-1">Valuta Bayar</label>
                  <select
                    value={payCurrency}
                    onChange={(e) => setPayCurrency(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded text-xs"
                  >
                    <option value="NTD">NTD (Taiwan)</option>
                    <option value="IDR">IDR (Rupiah)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-neutral-500 mb-1">Tanggal Dibayar *</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-neutral-500 mb-1">Jumlah Nominal Gaji (Rupiah / Dolar NTD) *</label>
                <input
                  type="text"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(formatInputWithCommas(e.target.value))}
                  className={`w-full px-4 py-2 border rounded-lg text-sm font-numeric transition-all focus:outline-none ${
                    shakeFields['payAmount']
                      ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                      : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:ring-1 focus:ring-indigo-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-neutral-500 mb-1">Catatan Gaji / Transport</label>
                <input
                  type="text"
                  placeholder="Gaji rutin admin kangenbukuindo part-time..."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => { setIsPayrollOpen(false); resetPayrollForm(); }}
                  className="px-4 py-2 border border-neutral-305 text-xs font-semibold rounded text-neutral-600 dark:text-neutral-400 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow"
                >
                  {editingPayroll ? 'Simpan Perubahan' : 'Bayar & Posting Laporan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Partner Modal */}
      {isPartnerOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const hasChanges = partnerName.trim() !== '' || partnerPercent.trim() !== '' || partnerCategories.length > 0;
              if (hasChanges) {
                if (!window.confirm("Apakah kamu yakin ingin keluar? Perubahan belum disimpan.")) {
                  return;
                }
              }
              setIsPartnerOpen(false);
            }
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
              <span className="text-sm font-bold uppercase">🤝 Tambah Partner Kolaborasi Buku</span>
              <button onClick={() => setIsPartnerOpen(false)} className="text-neutral-450 hover:text-neutral-250"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleAddPartner} className="p-5 space-y-4">
              <div>
                <label className="block text-xs uppercase font-bold text-neutral-500 mb-1">Nama Partner Bisnis *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama lengkap partner asisten..."
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg text-sm transition-all focus:outline-none ${
                    shakeFields['partnerName']
                      ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                      : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:ring-1 focus:ring-indigo-500'
                  }`}
                />
              </div>



              <div>
                <label className="block text-xs uppercase font-bold text-neutral-505 mb-1">Kategori Buku yang Dipegang</label>
                <div className="grid grid-cols-2 gap-2 mt-1 h-32 overflow-y-auto border p-2 rounded">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={partnerCategories.includes(c.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPartnerCategories([...partnerCategories, c.name]);
                          } else {
                            setPartnerCategories(partnerCategories.filter(name => name !== c.name));
                          }
                        }}
                        className="rounded"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsPartnerOpen(false)}
                  className="px-4 py-2 border border-neutral-305 text-xs font-semibold rounded text-neutral-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow"
                >
                  Daftarkan Partner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Payroll Confirmation Modal */}
      {payrollToDelete && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-5 space-y-4">
            <h4 className="text-sm font-bold text-rose-600 dark:text-rose-450 uppercase flex items-center gap-1.5">
              ⚠️ Konfirmasi Hapus Gaji
            </h4>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Apakah Anda yakin ingin menghapus catatan penggajian untuk <strong>{payrollToDelete.payee}</strong> periode <strong>{payrollToDelete.period}</strong>? Tindakan ini tidak dapat dibatalkan dan akan menghapus jurnal entry serta data cash flow terkait secara otomatis.
            </p>
            <div className="flex justify-end gap-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setPayrollToDelete(null)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-750 text-xs font-semibold rounded text-neutral-650 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeletePayroll(payrollToDelete)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded shadow-xs"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
