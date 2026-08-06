import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  getDocs,
  Timestamp, 
  writeBatch 
} from 'firebase/firestore';
import { 
  TrendingUp, 
  AlertTriangle, 
  ShoppingBag, 
  Package, 
  Target, 
  CreditCard, 
  Scale, 
  BookOpen, 
  Clock, 
  DollarSign, 
  Truck, 
  Pin, 
  Check, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  ArrowRight, 
  User, 
  Box, 
  Calendar, 
  ListChecks, 
  FileText, 
  ExternalLink,
  ShieldAlert,
  ArrowUp,
  X,
  Boxes,
  Receipt
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { 
  formatNTD, 
  formatNTDAmount,
  formatIDR, 
  formatNumber, 
  cleanCommas, 
  formatInputWithCommas,
  calculateEquityModalAtDate
} from '../lib/decimal-utils';
import { getAllBooksStockData } from '../lib/inventory-utils';
import { DashboardNote, DashboardTask, PricingTier, CoaAccount } from '../types';

interface DashboardTabProps {
  setTab?: (tab: string) => void;
}

const DEFAULT_PRICING_TIERS: PricingTier[] = [
  { from: 10000,  to: 29999,  mkt: 199,  umum: 170 },
  { from: 30000,  to: 39999,  mkt: 299,  umum: 270 },
  { from: 40000,  to: 49999,  mkt: 399,  umum: 370 },
  { from: 50000,  to: 69999,  mkt: 499,  umum: 470 },
  { from: 70000,  to: 89999,  mkt: 559,  umum: 530 },
  { from: 90000,  to: 109999, mkt: 599,  umum: 570 },
  { from: 110000, to: 129999, mkt: 659,  umum: 630 },
  { from: 130000, to: 149999, mkt: 699,  umum: 670 },
  { from: 150000, to: 169999, mkt: 759,  umum: 730 },
  { from: 170000, to: 189999, mkt: 799,  umum: 770 },
  { from: 190000, to: 209999, mkt: 859,  umum: 830 },
  { from: 210000, to: 229999, mkt: 899,  umum: 870 },
  { from: 230000, to: 249999, mkt: 959,  umum: 930 },
  { from: 250000, to: 269999, mkt: 999,  umum: 970 },
  { from: 270000, to: 289999, mkt: 1059, umum: 1030 },
  { from: 290000, to: 309999, mkt: 1099, umum: 1070 },
  { from: 310000, to: 329999, mkt: 1159, umum: 1130 },
  { from: 330000, to: 349999, mkt: 1199, umum: 1170 },
  { from: 350000, to: 369999, mkt: 1259, umum: 1230 },
  { from: 370000, to: 389999, mkt: 1299, umum: 1270 },
  { from: 390000, to: 409999, mkt: 1359, umum: 1330 },
  { from: 410000, to: 429999, mkt: 1399, umum: 1370 },
  { from: 430000, to: 449999, mkt: 1459, umum: 1430 },
  { from: 450000, to: 469999, mkt: 1499, umum: 1470 },
  { from: 470000, to: 489999, mkt: 1559, umum: 1530 },
  { from: 490000, to: 509999, mkt: 1599, umum: 1570 },
  { from: 510000, to: 529999, mkt: 1659, umum: 1630 }
];

const DEFAULT_NOTES: DashboardNote[] = [];

const DEFAULT_TASKS: DashboardTask[] = [];

const formatToLocalYYYYMMDD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getOrderISODate = (order: any): string => {
  if (!order) return '';
  const dateObj = order.orderDate || order.purchaseDate || order.createdAt;
  if (!dateObj) return order.date || order.tanggal || '';
  if (typeof dateObj === 'string') {
    return dateObj.slice(0, 10);
  }
  if (typeof dateObj.toDate === 'function') {
    return formatToLocalYYYYMMDD(dateObj.toDate());
  }
  if (typeof dateObj.seconds === 'number') {
    return formatToLocalYYYYMMDD(new Date(dateObj.seconds * 1000));
  }
  if (dateObj instanceof Date) {
    return formatToLocalYYYYMMDD(dateObj);
  }
  return '';
};

export const DashboardTab: React.FC<DashboardTabProps> = ({ setTab }) => {
  const { user, profile } = useAuth();

  // Permission checks for 4 sub-tabs
  const isOwner = profile?.role === 'owner';
  const hasDashboardMain = isOwner || !!profile?.permissions?.['dashboard'];

  const canAccessOmset = isOwner || (hasDashboardMain && profile?.permissions?.['dashboard.omset'] !== false);
  const canAccessPeringatan = isOwner || (hasDashboardMain && profile?.permissions?.['dashboard.peringatan'] !== false);
  const canAccessCatatan = isOwner || (hasDashboardMain && profile?.permissions?.['dashboard.catatan'] !== false);
  const canAccessHarga = isOwner || (hasDashboardMain && profile?.permissions?.['dashboard.harga'] !== false);

  const allowedPanels = useMemo(() => {
    const list: ('omset' | 'peringatan' | 'catatan' | 'harga')[] = [];
    if (canAccessOmset) list.push('omset');
    if (canAccessPeringatan) list.push('peringatan');
    if (canAccessCatatan) list.push('catatan');
    if (canAccessHarga) list.push('harga');
    return list;
  }, [canAccessOmset, canAccessPeringatan, canAccessCatatan, canAccessHarga]);

  // Navigation tab state
  const [activePanel, setActivePanel] = useState<'omset' | 'peringatan' | 'catatan' | 'harga'>('omset');

  useEffect(() => {
    if (allowedPanels.length > 0 && !allowedPanels.includes(activePanel)) {
      setActivePanel(allowedPanels[0]);
    }
  }, [allowedPanels, activePanel]);

  // Selected period
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Real-time Collections Data
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [adsPurchases, setAdsPurchases] = useState<any[]>([]);
  const [freightIns, setFreightIns] = useState<any[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [damagedRecords, setDamagedRecords] = useState<any[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);

  // Notes & Tasks & Tiers state
  const [notes, setNotes] = useState<DashboardNote[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  // Toggles for collapsible sections
  const [notesCompletedOpen, setNotesCompletedOpen] = useState(false);
  const [tasksCompletedOpen, setTasksCompletedOpen] = useState(false);
  const [addTierFormOpen, setAddTierFormOpen] = useState(false);
  const [addTaskRowOpen, setAddTaskRowOpen] = useState(false);

  // Form states
  const [noteInput, setNoteInput] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [taskDueInput, setTaskDueInput] = useState<'today' | 'week' | 'later'>('today');

  // Pricing calculator inputs & tier additions
  const [calcIn, setCalcIn] = useState('');
  const [tierFrom, setTierFrom] = useState('');
  const [tierToVal, setTierToVal] = useState('');
  const [tierMkt, setTierMkt] = useState('');
  const [tierUmum, setTierUmum] = useState('');
  const [tierError, setTierError] = useState('');

  // Severity filter for Alerts Tab
  const [sevFilter, setSevFilter] = useState<'semua' | 'kritis' | 'perhatian' | 'info'>('semua');

  // Author identity detection
  const currentAuthorName = useMemo(() => {
    if (profile?.displayName) return profile.displayName;
    if (user?.displayName) return user.displayName;
    if (user?.email) {
      const prefix = user.email.split('@')[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return 'Felix';
  }, [profile, user]);

  const currentAuthorKey = useMemo(() => {
    const role = profile?.role || 'owner';
    return role === 'owner' ? 'felix' : 'admin';
  }, [profile]);

  // Subscriptions
  useEffect(() => {
    const unsubSales = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      setSalesOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubPOs = onSnapshot(collection(db, 'purchaseOrders'), (snap) => {
      setPurchaseOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubBooks = onSnapshot(collection(db, 'books'), (snap) => {
      setBooks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubJournals = onSnapshot(collection(db, 'journalEntries'), (snap) => {
      setJournals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubAds = onSnapshot(collection(db, 'adsPurchases'), (snap) => {
      setAdsPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubFI = onSnapshot(collection(db, 'freightIn'), (snap) => {
      setFreightIns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubInv = onSnapshot(collection(db, 'inventory'), (snap) => {
      setInventoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubLedger = onSnapshot(collection(db, 'inventoryLedger'), (snap) => {
      setLedgerEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubDamaged = onSnapshot(collection(db, 'damagedStock'), (snap) => {
      setDamagedRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    const unsubCoA = onSnapshot(collection(db, 'coa'), (snap) => {
      setCoaAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as CoaAccount)));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Notes
    const unsubNotes = onSnapshot(collection(db, 'dashboardNotes'), (snap) => {
      const list: DashboardNote[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as DashboardNote));
      setNotes(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Tasks
    const unsubTasks = onSnapshot(collection(db, 'dashboardTasks'), (snap) => {
      const list: DashboardTask[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as DashboardTask));
      setTasks(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Pricing Tiers
    const unsubTiers = onSnapshot(collection(db, 'pricingTiers'), (snap) => {
      if (snap.empty) {
        setTiers(DEFAULT_PRICING_TIERS);
        // Seed default pricing tiers into Firestore
        const batch = writeBatch(db);
        DEFAULT_PRICING_TIERS.forEach((tier, idx) => {
          const { id, ...data } = tier;
          const tierId = id || `tier_${idx + 1}`;
          batch.set(doc(db, 'pricingTiers', tierId), { ...data, createdAt: Timestamp.now() });
        });
        batch.commit().catch(err => console.error('Error seeding tiers:', err));
      } else {
        const list: PricingTier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingTier));
        list.sort((a, b) => a.from - b.from);
        setTiers(list);
      }
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    return () => {
      unsubSales();
      unsubPOs();
      unsubBooks();
      unsubJournals();
      unsubAds();
      unsubFI();
      unsubInv();
      unsubLedger();
      unsubDamaged();
      unsubCoA();
      unsubNotes();
      unsubTasks();
      unsubTiers();
    };
  }, []);

  // Cleanup effect to remove old mock notes & tasks from Firestore
  useEffect(() => {
    const clearMockNotesAndTasks = async () => {
      try {
        const snapNotes = await getDocs(collection(db, 'dashboardNotes'));
        if (!snapNotes.empty) {
          const mockDocIds = ['1', '2', '3', '4', '5', '6'];
          const batch = writeBatch(db);
          let hasDeletes = false;
          snapNotes.docs.forEach(d => {
            if (mockDocIds.includes(d.id)) {
              batch.delete(d.ref);
              hasDeletes = true;
            }
          });
          if (hasDeletes) await batch.commit();
        }

        const snapTasks = await getDocs(collection(db, 'dashboardTasks'));
        if (!snapTasks.empty) {
          const mockTaskIds = ['1', '2', '3', '4', '5', '6', '7', '8'];
          const batch = writeBatch(db);
          let hasDeletes = false;
          snapTasks.docs.forEach(d => {
            if (mockTaskIds.includes(d.id)) {
              batch.delete(d.ref);
              hasDeletes = true;
            }
          });
          if (hasDeletes) await batch.commit();
        }
      } catch (err) {
        if (String(err).includes('Quota') || String(err).includes('quota')) { console.warn('Quota exceeded clearing mock notes/tasks'); } else { console.error('Error clearing mock notes/tasks:', err); }
      }
    };
    clearMockNotesAndTasks();
  }, []);

  // ═══════════════════════════════════════════
  // OMSET CALCULATION
  // ═══════════════════════════════════════════
  const todayStr = useMemo(() => {
    return formatToLocalYYYYMMDD(new Date());
  }, []);

  // Today's Sales Orders
  const todaySalesOrders = useMemo(() => {
    return salesOrders.filter(so => {
      if (so.status === 'cancelled') return false;
      const dateStr = getOrderISODate(so);
      return dateStr === todayStr;
    });
  }, [salesOrders, todayStr]);

  const todayOmsetNTD = useMemo(() => {
    return todaySalesOrders.reduce((sum, so) => {
      const cents = typeof so.totalPrice === 'number' ? so.totalPrice : (typeof so.subtotal === 'number' ? so.subtotal : 0);
      return sum + (cents / 100);
    }, 0);
  }, [todaySalesOrders]);

  const todayTxCount = todaySalesOrders.length;

  // Yesterday's Omset for Delta
  const yesterdayOmsetNTD = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yStr = formatToLocalYYYYMMDD(d);
    const yesterdayOrders = salesOrders.filter(so => {
      if (so.status === 'cancelled') return false;
      const dateStr = getOrderISODate(so);
      return dateStr === yStr;
    });
    return yesterdayOrders.reduce((sum, so) => {
      const cents = typeof so.totalPrice === 'number' ? so.totalPrice : (typeof so.subtotal === 'number' ? so.subtotal : 0);
      return sum + (cents / 100);
    }, 0);
  }, [salesOrders]);

  const deltaPct = useMemo(() => {
    if (yesterdayOmsetNTD <= 0) return todayOmsetNTD > 0 ? 100 : 0;
    return Math.round(((todayOmsetNTD - yesterdayOmsetNTD) / yesterdayOmsetNTD) * 1000) / 10;
  }, [todayOmsetNTD, yesterdayOmsetNTD]);

  // 7-day sparkline (Monday to Sunday)
  const sparklineWeek = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const days = [
      { d: 'Sen', offset: mondayOffset },
      { d: 'Sel', offset: mondayOffset + 1 },
      { d: 'Rab', offset: mondayOffset + 2 },
      { d: 'Kam', offset: mondayOffset + 3 },
      { d: 'Jum', offset: mondayOffset + 4 },
      { d: 'Sab', offset: mondayOffset + 5 },
      { d: 'Min', offset: mondayOffset + 6 }
    ];

    return days.map(({ d, offset }) => {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + offset);
      const dateStr = formatToLocalYYYYMMDD(targetDate);
      const isToday = dateStr === todayStr;

      const dayOrders = salesOrders.filter(so => {
        if (so.status === 'cancelled') return false;
        const sDate = getOrderISODate(so);
        return sDate === dateStr;
      });

      const val = dayOrders.reduce((sum, so) => {
        const cents = typeof so.totalPrice === 'number' ? so.totalPrice : (typeof so.subtotal === 'number' ? so.subtotal : 0);
        return sum + (cents / 100);
      }, 0);

      return { d, v: val, today: isToday };
    });
  }, [salesOrders, todayStr]);

  const maxSparkVal = useMemo(() => {
    const max = Math.max(...sparklineWeek.map(w => w.v));
    return max > 0 ? max : 1;
  }, [sparklineWeek]);

  // Monthly Sales Orders & Purchase Orders
  const monthlySO = useMemo(() => {
    return salesOrders.filter(so => {
      if (so.status === 'cancelled') return false;
      const sDate = getOrderISODate(so);
      return sDate.startsWith(selectedMonth);
    });
  }, [salesOrders, selectedMonth]);

  const monthlySOTotalNTD = useMemo(() => {
    return monthlySO.reduce((sum, so) => {
      const cents = typeof so.totalPrice === 'number' ? so.totalPrice : (typeof so.subtotal === 'number' ? so.subtotal : 0);
      return sum + (cents / 100);
    }, 0);
  }, [monthlySO]);

  const monthlySOCOGSNTD = useMemo(() => {
    return monthlySO.reduce((sum, so) => {
      let soCogsCents = 0;
      if (Array.isArray(so.items)) {
        soCogsCents = so.items.reduce((itemSum: number, item: any) => {
          return itemSum + ((item.cogsSnapshot || 0) * (item.qty || 1));
        }, 0);
      }
      return sum + (soCogsCents / 100);
    }, 0);
  }, [monthlySO]);

  const monthlyPO = useMemo(() => {
    return purchaseOrders.filter(po => {
      if (po.status === 'cancelled') return false;
      const pDate = getOrderISODate(po);
      return pDate.startsWith(selectedMonth);
    });
  }, [purchaseOrders, selectedMonth]);

  const monthlyPOCount = monthlyPO.length;

  const monthlyPOTotalNTD = useMemo(() => {
    return monthlyPO.reduce((sum, po) => {
      const cents = typeof po.purchasePriceNTD === 'number' ? po.purchasePriceNTD : 0;
      return sum + (cents / 100);
    }, 0);
  }, [monthlyPO]);

  // ROAS Calculation (Matches IklanTab logic)
  const monthlyAdSpendNTD = useMemo(() => {
    return adsPurchases.reduce((sum, ad) => {
      const adDate = ad.date || (ad.createdAt?.toDate ? formatToLocalYYYYMMDD(ad.createdAt.toDate()) : '');
      if (adDate.startsWith(selectedMonth)) {
        const cents = typeof ad.amountNTD === 'number' ? ad.amountNTD : (typeof ad.amount === 'number' ? ad.amount * 100 : 0);
        return sum + (cents / 100);
      }
      return sum;
    }, 0);
  }, [adsPurchases, selectedMonth]);

  const monthlyAdRevenueNTD = useMemo(() => {
    const attributedSO = monthlySO.filter(so => 
      Boolean(so.orderType && so.orderType.trim() !== '')
    );
    return attributedSO.reduce((sum, so) => {
      const cents = typeof so.totalPrice === 'number' ? so.totalPrice : (typeof so.subtotal === 'number' ? so.subtotal : 0);
      return sum + (cents / 100);
    }, 0);
  }, [monthlySO]);

  const roasRatio = useMemo(() => {
    if (monthlyAdSpendNTD <= 0) return 0;
    return monthlyAdRevenueNTD / monthlyAdSpendNTD;
  }, [monthlyAdRevenueNTD, monthlyAdSpendNTD]);

  // Cash Ledger Balances (Account 1101 & 1102)
  const { ntdLedgerBalance, idrLedgerBalance } = useMemo(() => {
    let ntd = 0;
    let idr = 0;
    journals.forEach(j => {
      (j.lines || []).forEach((l: any) => {
        const code = l.accountCode || '';
        const debit = (l.debit || 0) / 100;
        const credit = (l.credit || 0) / 100;
        const cashNtdCode = coaAccounts.find(a => a.systemKey === 'cash_ntd')?.code || '1101';
        const cashIdrCode = coaAccounts.find(a => a.systemKey === 'cash_idr')?.code || '1102';
        if (code === cashNtdCode) {
          ntd += (debit - credit);
        } else if (code === cashIdrCode) {
          idr += (debit - credit);
        }
      });
    });
    return { ntdLedgerBalance: ntd, idrLedgerBalance: idr };
  }, [journals, coaAccounts]);

  const totalCashCombinedNTD = ntdLedgerBalance + idrLedgerBalance;

  // Canonical Real-time Stock Data across all books
  const allBooksStock = useMemo(() => {
    return getAllBooksStockData(
      books,
      inventoryList,
      ledgerEntries,
      purchaseOrders,
      salesOrders,
      damagedRecords
    );
  }, [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords]);

  // Financial Position
  const { modalEquity, revenueSelesaiNTD, labaBersihNTD, isBalanced } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);

    // 1. Calculate Equity Modal as of end of selected month using standard accounting utility
    const equityData = calculateEquityModalAtDate(endOfMonth, coaAccounts, journals);
    const modalEquityVal = equityData.modalEkuitas;

    // 2. Revenue & Expenses for the selected month from journal entries
    let revThisMonth = 0;
    let expThisMonth = 0;

    journals.forEach(j => {
      let entryDate: Date | null = null;
      if (j.date?.toDate) {
        entryDate = j.date.toDate();
      } else if (j.date?.seconds) {
        entryDate = new Date(j.date.seconds * 1000);
      } else if (j.date) {
        entryDate = new Date(j.date);
      }

      if (entryDate && entryDate >= startOfMonth && entryDate <= endOfMonth) {
        (j.lines || []).forEach((l: any) => {
          const code = l.accountCode || '';
          const debit = (l.debit || 0) / 100;
          const credit = (l.credit || 0) / 100;

          if (code.startsWith('4')) {
            revThisMonth += (credit - debit);
          } else if (code.startsWith('5')) {
            expThisMonth += (debit - credit);
          }
        });
      }
    });

    // Fallback revenue from Sales Orders in selected month if journals have not been posted
    const soRevenueCents = monthlySO
      .filter(so => so.status === 'completed' || so.status === 'shipped' || so.status === 'packed' || so.status === 'confirmed')
      .reduce((sum, so) => {
        const cents = typeof so.totalPrice === 'number' ? so.totalPrice : (typeof so.subtotal === 'number' ? so.subtotal : 0);
        return sum + cents;
      }, 0);
    const soRevenueNTD = soRevenueCents / 100;

    const finalRev = revThisMonth > 0 ? revThisMonth : soRevenueNTD;
    const labaBersihVal = revThisMonth > 0 ? (revThisMonth - expThisMonth) : (soRevenueNTD - expThisMonth);

    // 3. Balance Sheet check (Status Rekonsiliasi)
    let totalAssets = 0;
    let totalLiabilities = 0;

    journals.forEach(j => {
      let entryDate: Date | null = null;
      if (j.date?.toDate) {
        entryDate = j.date.toDate();
      } else if (j.date?.seconds) {
        entryDate = new Date(j.date.seconds * 1000);
      } else if (j.date) {
        entryDate = new Date(j.date);
      }

      if (!entryDate || entryDate <= endOfMonth) {
        (j.lines || []).forEach((l: any) => {
          const code = l.accountCode || '';
          const debit = (l.debit || 0) / 100;
          const credit = (l.credit || 0) / 100;

          if (code.startsWith('1')) totalAssets += (debit - credit);
          if (code.startsWith('2')) totalLiabilities += (credit - debit);
        });
      }
    });

    const diff = Math.abs(totalAssets - (totalLiabilities + modalEquityVal));
    const balanced = totalAssets > 0 ? (diff < 1.0) : true;

    return {
      modalEquity: modalEquityVal,
      revenueSelesaiNTD: finalRev,
      labaBersihNTD: labaBersihVal,
      isBalanced: balanced
    };
  }, [journals, selectedMonth, monthlySO, coaAccounts]);

  // Action Required Lists
  const booksToBuy = useMemo(() => {
    return allBooksStock.filter(b => {
      const minSafety = b.minStok || b.minOrder || 0;
      return b.stok <= minSafety || b.stok <= 0 || b.status === 'minus' || b.status === 'habis' || b.status === 'menipis';
    }).sort((a, b) => {
      const orderMap: Record<string, number> = { minus: 0, habis: 1, menipis: 2, aman: 3 };
      return (orderMap[a.status] ?? 3) - (orderMap[b.status] ?? 3);
    }).slice(0, 10);
  }, [allBooksStock]);

  const packedSalesOrders = useMemo(() => {
    return salesOrders.filter(so => {
      if (so.status === 'cancelled' || so.status === 'completed' || so.isDraft) return false;
      return so.status === 'packed';
    });
  }, [salesOrders]);

  const ordersToShip = useMemo(() => {
    if (packedSalesOrders.length > 0) return packedSalesOrders.slice(0, 10);
    return salesOrders.filter(so => {
      if (so.status === 'cancelled' || so.status === 'completed' || so.isDraft) return false;
      return so.status === 'confirmed' || so.status === 'pending';
    }).slice(0, 10);
  }, [packedSalesOrders, salesOrders]);

  // ═══════════════════════════════════════════
  // PERINGATAN (ALERTS) TAB FEED
  // ═══════════════════════════════════════════
  const alertsList = useMemo(() => {
    const list: Array<{
      sev: 'kritis' | 'perhatian' | 'info';
      mod: string;
      ic: string;
      t: string;
      d: string;
      act: string;
      tabTarget: string;
    }> = [];

    // 1. Packed Sales Orders awaiting shipment (Harus Dikirim)
    const packed = salesOrders.filter(so => so.status === 'packed');
    if (packed.length > 0) {
      list.push({
        sev: 'kritis',
        mod: 'Sales Orders',
        ic: 'truck',
        t: `${packed.length} order berstatus dikemas (siap kirim)`,
        d: `Perlu segera dicetak label/resi & dikirim ke ekspedisi`,
        act: 'Buka Sales',
        tabTarget: 'sales'
      });
    }

    // 2. Draft or Unconfirmed Sales Orders or pending > 3 days
    salesOrders.forEach(so => {
      if (so.status === 'draft' || so.status === 'confirmed' || so.status === 'pending' || so.isDraft) {
        const orderDate = so.createdAt?.toDate ? so.createdAt.toDate() : new Date(so.orderDate || so.date || Date.now());
        const ageDays = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
        const valNTD = (typeof so.totalPrice === 'number' ? so.totalPrice : 0) / 100;
        if (ageDays >= 3) {
          list.push({
            sev: ageDays >= 7 ? 'kritis' : 'perhatian',
            mod: 'Sales Orders',
            ic: 'clock',
            t: `Order #${so.orderCode || so.id} pending ${ageDays} hari`,
            d: `${so.customerName || so.customerPlatformName || so.buyerName || 'Pelanggan'} · NT$ ${formatNumber(valNTD)}`,
            act: 'Lihat Order',
            tabTarget: 'sales'
          });
        }
      }
    });

    // 3. Stock Alerts from allBooksStock
    const minusBooks = allBooksStock.filter(b => b.status === 'minus');
    if (minusBooks.length > 0) {
      list.push({
        sev: 'kritis',
        mod: 'Stok & Value',
        ic: 'box',
        t: `${minusBooks.length} judul buku stok minus`,
        d: `Stok fisik negatif — kemungkinan ada penerimaan PO yang belum tercatat`,
        act: 'Cek Stok',
        tabTarget: 'inventory'
      });
    }

    const habisBooks = allBooksStock.filter(b => b.status === 'habis');
    if (habisBooks.length > 0) {
      list.push({
        sev: 'perhatian',
        mod: 'Stok & Value',
        ic: 'box',
        t: `${habisBooks.length} judul buku stok habis (0 pcs)`,
        d: `Buku populer habis — disarankan buat PO pembelian baru`,
        act: 'Buat PO',
        tabTarget: 'purchases'
      });
    }

    const menipisBooks = allBooksStock.filter(b => b.status === 'menipis');
    if (menipisBooks.length > 0) {
      list.push({
        sev: 'info',
        mod: 'Stok & Value',
        ic: 'box',
        t: `${menipisBooks.length} judul buku stok menipis`,
        d: `Stok berada di bawah atau sama dengan safety stock`,
        act: 'Katalog',
        tabTarget: 'catalog'
      });
    }

    // 4. Purchase Orders: Pending or Partial POs
    const openPOs = purchaseOrders.filter(po => po.status === 'pending' || po.status === 'partial');
    if (openPOs.length > 0) {
      list.push({
        sev: 'perhatian',
        mod: 'Purchase Orders',
        ic: 'truck',
        t: `${openPOs.length} PO menunggu penerimaan barang`,
        d: `Barang masih dalam pengiriman (Inventory in Transit)`,
        act: 'Terima PO',
        tabTarget: 'purchases'
      });
    }

    // 5. Freight-In: Not capitalized
    const unjournaledFI = freightIns.filter(fi => fi.isCapitalized === false || !fi.journalId);
    if (unjournaledFI.length > 0) {
      list.push({
        sev: 'info',
        mod: 'Freight In',
        ic: 'truck',
        t: `${unjournaledFI.length} Freight-In belum dikapitalisasi`,
        d: `Perlu dikapitalisasi agar HPP landed cost terhitung presisi`,
        act: 'Jurnalkan',
        tabTarget: 'freight-in'
      });
    }

    // Sort Kritis first, then Perlu Perhatian, then Info
    const orderMap = { kritis: 0, perhatian: 1, info: 2 };
    list.sort((a, b) => orderMap[a.sev] - orderMap[b.sev]);

    return list;
  }, [salesOrders, allBooksStock, purchaseOrders, freightIns]);

  const alertCounts = useMemo(() => {
    return {
      kritis: alertsList.filter(a => a.sev === 'kritis').length,
      perhatian: alertsList.filter(a => a.sev === 'perhatian').length,
      info: alertsList.filter(a => a.sev === 'info').length,
      total: alertsList.length
    };
  }, [alertsList]);

  const filteredAlerts = useMemo(() => {
    if (sevFilter === 'semua') return alertsList;
    return alertsList.filter(a => a.sev === sevFilter);
  }, [alertsList, sevFilter]);

  // ═══════════════════════════════════════════
  // HANDLERS FOR NOTES & TASKS & TIERS
  // ═══════════════════════════════════════════

  // Notes
  const handleAddNote = async () => {
    if (!noteInput.trim()) return;
    try {
      const d = new Date();
      const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      const formattedDate = `${d.getDate()} ${months[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      const newNote = {
        txt: noteInput.trim(),
        who: currentAuthorKey,
        authorName: currentAuthorName,
        when: formattedDate,
        pin: false,
        read: false,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, 'dashboardNotes'), newNote);
      setNoteInput('');
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  };

  const handleToggleReadNote = async (note: DashboardNote) => {
    try {
      if (note.id) {
        await setDoc(doc(db, 'dashboardNotes', note.id), { ...note, read: !note.read }, { merge: true });
      } else {
        setNotes(prev => prev.map(n => n === note ? { ...n, read: !n.read } : n));
      }
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  const handleTogglePinNote = async (note: DashboardNote) => {
    try {
      if (note.id) {
        await setDoc(doc(db, 'dashboardNotes', note.id), { ...note, pin: !note.pin }, { merge: true });
      } else {
        setNotes(prev => prev.map(n => n === note ? { ...n, pin: !n.pin } : n));
      }
    } catch (err) {
      console.error('Failed to pin note:', err);
    }
  };

  const handleDeleteNote = async (note: DashboardNote) => {
    try {
      if (note.id) {
        await deleteDoc(doc(db, 'dashboardNotes', note.id));
      } else {
        setNotes(prev => prev.filter(n => n !== note));
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleClearAllNotes = async () => {
    if (!window.confirm('Hapus semua catatan tim?')) return;
    try {
      const snap = await getDocs(collection(db, 'dashboardNotes'));
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      setNotes([]);
    } catch (err) {
      console.error('Failed to clear all notes:', err);
    }
  };

  // Tasks
  const handleSaveTask = async () => {
    if (!taskInput.trim()) return;
    try {
      const newTask = {
        t: taskInput.trim(),
        due: taskDueInput,
        done: false,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, 'dashboardTasks'), newTask);
      setTaskInput('');
    } catch (err) {
      console.error('Failed to save task:', err);
    }
  };

  const handleToggleTaskDone = async (task: DashboardTask) => {
    try {
      if (task.id) {
        await setDoc(doc(db, 'dashboardTasks', task.id), { ...task, done: !task.done }, { merge: true });
      } else {
        setTasks(prev => prev.map(t => t === task ? { ...t, done: !t.done } : t));
      }
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleDeleteTask = async (task: DashboardTask) => {
    try {
      if (task.id) {
        await deleteDoc(doc(db, 'dashboardTasks', task.id));
      } else {
        setTasks(prev => prev.filter(t => t !== task));
      }
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleClearAllTasks = async () => {
    if (!window.confirm('Hapus semua perlu perbaikan?')) return;
    try {
      const snap = await getDocs(collection(db, 'dashboardTasks'));
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      setTasks([]);
    } catch (err) {
      console.error('Failed to clear all tasks:', err);
    }
  };

  // Pricing Tiers Add
  const handleAddTier = async () => {
    setTierError('');
    const parseNum = (val: string) => Number(val.replace(/[^\d]/g, ''));
    const from = parseNum(tierFrom);
    const to = parseNum(tierToVal);
    const mkt = parseNum(tierMkt);
    const umum = parseNum(tierUmum);

    if (!from || !to || !mkt || !umum) {
      setTierError('Lengkapi keempat kolom dengan angka yang valid.');
      return;
    }
    if (to <= from) {
      setTierError('Batas atas range harus lebih besar dari batas bawah.');
      return;
    }
    const overlap = tiers.some(t => from <= t.to && to >= t.from);
    if (overlap) {
      setTierError('Range ini bertumpuk dengan tingkat yang sudah ada — tolong periksa lagi.');
      return;
    }
    if (umum > mkt) {
      setTierError('Peringatan: Harga Umum biasanya lebih rendah dari Harga Marketplace.');
    }

    try {
      const newTier = { from, to, mkt, umum, createdAt: Timestamp.now() };
      await addDoc(collection(db, 'pricingTiers'), newTier);

      setTierFrom('');
      setTierToVal('');
      setTierMkt('');
      setTierUmum('');
      setTierError('');

      // Auto scroll to new tier
      setTimeout(() => {
        const row = document.querySelector(`tr[data-tier-from="${from}"]`);
        if (row) {
          row.classList.add('hit');
          row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 300);
    } catch (err) {
      console.error('Failed to add tier:', err);
    }
  };

  const handleDeleteTier = async (tier: PricingTier) => {
    if (tiers.length <= 1) return;
    try {
      if (tier.id) {
        await deleteDoc(doc(db, 'pricingTiers', tier.id));
      } else {
        setTiers(prev => prev.filter(t => t !== tier));
      }
    } catch (err) {
      console.error('Failed to delete tier:', err);
    }
  };

  // Calculator Matching
  const calcMatchResult = useMemo(() => {
    const rawVal = Number(calcIn.replace(/[^\d]/g, ''));
    if (!rawVal) return { matchedTier: null, messageType: 'blank' };

    if (tiers.length === 0) return { matchedTier: null, messageType: 'blank' };

    if (rawVal < tiers[0].from) {
      return { matchedTier: null, messageType: 'below', lowestFrom: tiers[0].from };
    }

    const lastTier = tiers[tiers.length - 1];
    if (rawVal > lastTier.to) {
      return { matchedTier: null, messageType: 'above', highestTo: lastTier.to };
    }

    const matched = tiers.find(t => rawVal >= t.from && rawVal <= t.to);
    if (matched) {
      return { matchedTier: matched, messageType: 'match' };
    }

    // Fallback if inside gap
    return { matchedTier: null, messageType: 'blank' };
  }, [calcIn, tiers]);

  // Task Progress Ring Percentage
  const activeTasks = useMemo(() => tasks.filter(t => !t.done), [tasks]);
  const completedTasks = useMemo(() => tasks.filter(t => t.done), [tasks]);
  const taskPct = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((completedTasks.length / tasks.length) * 100);
  }, [tasks, completedTasks]);

  const circleCircumference = 2 * Math.PI * 18;
  const strokeDashoffset = circleCircumference * (1 - taskPct / 100);

  // Active notes split
  const activeNotes = useMemo(() => {
    return notes.filter(n => !n.read).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
  }, [notes]);

  const completedNotes = useMemo(() => {
    return notes.filter(n => n.read);
  }, [notes]);

  return (
    <div className="w-full max-w-[1360px] mx-auto pb-20 select-text font-['Lexend'] text-[#0d1117] antialiased">
      {/* Dynamic CSS Styles for exact design match */}
      <style>{`
        :root {
          --ink: #0d1117;
          --ink-2: #3d4451;
          --ink-3: #6b7280;
          --ink-4: #9ca3af;
          --ink-5: #c9cdd4;
          --bg: #fafbfc;
          --surface: #ffffff;
          --line: #ebedf0;
          --line-2: #f4f5f7;

          --brand: #2b5a9e;
          --brand-dark: #1e4275;
          --brand-tint: #eef3fa;
          --emerald: #0f7a52;
          --emerald-tint: #e7f5ef;
          --emerald-bar: #4fbb8c;
          --amber: #b45309;
          --amber-tint: #fef3e2;
          --amber-2: #d97706;
          --rose: #a8323b;
          --rose-tint: #fbecec;
          --red: #dc2626;
          --red-tint: #fde3e1;
          --violet: #5b3fa8;
          --violet-tint: #f0ecfa;
          --sky: #1d6fa5;
          --sky-tint: #e8f2f9;

          --sh-1: 0 1px 2px rgba(13,17,23,.04);
          --sh-2: 0 2px 8px -2px rgba(13,17,23,.08), 0 1px 3px rgba(13,17,23,.04);
          --sh-3: 0 12px 32px -8px rgba(13,17,23,.14);

          --r-xl: 18px;
          --r-lg: 14px;
          --r-md: 10px;
          --r-sm: 8px;
        }

        .n {
          font-family: 'Inter', sans-serif !important;
          font-variant-numeric: tabular-nums;
        }

        /* ── HERO ── */
        .hero {
          background: var(--ink);
          color: #fff;
          border-radius: var(--r-xl);
          padding: 22px 24px 18px;
          position: relative;
          overflow: hidden;
          box-shadow: var(--sh-3);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .hero::after {
          content: "";
          position: absolute;
          right: -60px;
          top: -60px;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.07), transparent 70%);
        }

        /* ── KPI ── */
        .kpi {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--r-lg);
          padding: 17px 18px;
          box-shadow: var(--sh-1);
          display: flex;
          flex-direction: column;
        }

        /* ── PRICE TABLE HIGHLIGHT ── */
        tbody tr.hit {
          background: linear-gradient(115deg, var(--brand-tint) 0%, var(--brand-tint) 55%, transparent 100%) !important;
          box-shadow: inset 3px 0 0 0 var(--brand) !important;
        }

        .lbody::-webkit-scrollbar {
          width: 7px;
        }
        .lbody::-webkit-scrollbar-thumb {
          background: var(--line);
          border-radius: 99px;
          border: 2px solid var(--surface);
        }
        .lbody::-webkit-scrollbar-thumb:hover {
          background: var(--ink-5);
        }
      `}</style>

      {/* MASTHEAD HEADER (INTEGRATED & NON-REDUNDANT) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        {/* Title visible on desktop only (since top app-bar displays business identity on mobile) */}
        <div className="hidden md:flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0d1117] text-white flex items-center justify-center shrink-0 shadow-xs">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0d1117] tracking-tight m-0">Dashboard</h1>
            <div className="text-xs text-neutral-400 mt-0.5 font-numeric">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Control Bar: Active Period & Panel Selector */}
        <div className="flex items-center justify-between md:justify-end gap-2.5 w-full md:w-auto flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2 bg-white border border-neutral-200 px-3 py-1.5 rounded-full text-xs font-semibold text-neutral-600 shadow-xs shrink-0">
            <span className="text-neutral-400">Periode ·</span>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none outline-none font-numeric font-bold text-neutral-800 cursor-pointer text-xs"
            />
          </div>

          <div className="flex gap-1 bg-white border border-neutral-200 rounded-xl p-1 shadow-xs overflow-x-auto max-w-full no-scrollbar">
            {canAccessOmset && (
              <button 
                type="button"
                onClick={() => setActivePanel('omset')}
                className={`inline-flex items-center gap-1.5 border-none font-semibold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                  activePanel === 'omset' ? 'bg-[#0d1117] text-white' : 'bg-transparent text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                <span>Omset</span>
              </button>
            )}

            {canAccessPeringatan && (
              <button 
                type="button"
                onClick={() => setActivePanel('peringatan')}
                className={`inline-flex items-center gap-1.5 border-none font-semibold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors relative whitespace-nowrap ${
                  activePanel === 'peringatan' ? 'bg-[#0d1117] text-white' : 'bg-transparent text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Peringatan</span>
                {alertCounts.total > 0 && (
                  <span className="w-4 h-4 rounded-full bg-red-600 text-white font-numeric text-[9px] font-extrabold flex items-center justify-center ml-0.5 shrink-0">
                    {alertCounts.total}
                  </span>
                )}
              </button>
            )}

            {canAccessCatatan && (
              <button 
                type="button"
                onClick={() => setActivePanel('catatan')}
                className={`inline-flex items-center gap-1.5 border-none font-semibold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                  activePanel === 'catatan' ? 'bg-[#0d1117] text-white' : 'bg-transparent text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Catatan</span>
              </button>
            )}

            {canAccessHarga && (
              <button 
                type="button"
                onClick={() => setActivePanel('harga')}
                className={`inline-flex items-center gap-1.5 border-none font-semibold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                  activePanel === 'harga' ? 'bg-[#0d1117] text-white' : 'bg-transparent text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 shrink-0" />
                <span>Harga</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {allowedPanels.length === 0 && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center space-y-3 my-6">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-base font-bold text-neutral-800">Akses Dashboard Terbatas</h3>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            Anda belum diberikan izin untuk mengakses tab Omset, Peringatan, Catatan, atau Harga Jual. Silakan hubungi Owner untuk mengatur hak akses Anda.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          TAB 1: OMSET
      ═══════════════════════════════════════════ */}
      {activePanel === 'omset' && (
        <div className="space-y-5">
          {/* GRID QUICK-ACTIONS (MOBILE OPTIMIZED SHORTCUTS - STRICT 4 DESIGN TOKENS) */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <button
              type="button"
              onClick={() => setTab?.('sales')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-[#EAE7E1] dark:border-neutral-700 shadow-xs hover:border-[#14654A] dark:hover:border-emerald-500 transition cursor-pointer text-center group active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-[#E7F1EC] text-[#14654A] dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-[#16181B] dark:text-white font-['Lexend'] truncate w-full">+ Sales</span>
            </button>

            <button
              type="button"
              onClick={() => setTab?.('purchases')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-[#EAE7E1] dark:border-neutral-700 shadow-xs hover:border-[#14654A] dark:hover:border-emerald-500 transition cursor-pointer text-center group active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-[#F8F0DF] text-[#A67A22] dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                <Box className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-[#16181B] dark:text-white font-['Lexend'] truncate w-full">+ PO Beli</span>
            </button>

            <button
              type="button"
              onClick={() => setTab?.('freight-in')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-[#EAE7E1] dark:border-neutral-700 shadow-xs hover:border-[#14654A] dark:hover:border-emerald-500 transition cursor-pointer text-center group active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-[#EAEFF5] text-[#3F5875] dark:bg-slate-950/60 dark:text-slate-300 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                <Truck className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-[#16181B] dark:text-white font-['Lexend'] truncate w-full">Freight In</span>
            </button>

            <button
              type="button"
              onClick={() => setTab?.('ongkir')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-[#EAE7E1] dark:border-neutral-700 shadow-xs hover:border-[#14654A] dark:hover:border-emerald-500 transition cursor-pointer text-center group active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-[#F8EAE6] text-[#A9503B] dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-[#16181B] dark:text-white font-['Lexend'] truncate w-full">Ongkir</span>
            </button>

            <button
              type="button"
              onClick={() => setTab?.('inventory')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-[#EAE7E1] dark:border-neutral-700 shadow-xs hover:border-[#14654A] dark:hover:border-emerald-500 transition cursor-pointer text-center group active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-[#E7F1EC] text-[#14654A] dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                <Boxes className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-[#16181B] dark:text-white font-['Lexend'] truncate w-full">Cek Stok</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePanel('catatan')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-[#EAE7E1] dark:border-neutral-700 shadow-xs hover:border-[#14654A] dark:hover:border-emerald-500 transition cursor-pointer text-center group active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-[#F8F0DF] text-[#A67A22] dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-[#16181B] dark:text-white font-['Lexend'] truncate w-full">Catatan</span>
            </button>
          </div>

          {/* SECTION: OPERASIONAL HARI INI */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 whitespace-nowrap">
              Operasional Hari Ini
            </span>
            <span className="flex-1 h-px bg-neutral-200"></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.55fr_1fr_1fr_1fr] gap-3">
            {/* 1. KARTU HERO (Omset Hari Ini) */}
            <div className="hero">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-white/60">
                    Omset Hari Ini (NTD)
                  </div>
                  <div className="font-numeric text-3xl font-extrabold tracking-tight leading-none my-2">
                    {formatNTDAmount(todayOmsetNTD)}
                  </div>
                  <div className="text-xs text-white/50">
                    dari <span className="font-numeric font-bold">{todayTxCount}</span> transaksi retail
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 bg-[#4fbb8c]/20 text-[#7fdcae] font-numeric text-[11.5px] font-bold px-2.5 py-1 rounded-full shrink-0">
                  <ArrowUp className="w-3 h-3" />
                  {deltaPct}%
                </span>
              </div>

              {/* Sparkline 7 Batang */}
              <div className="flex items-end gap-1.5 h-[46px] mt-auto pt-4">
                {sparklineWeek.map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer" title={`${item.d}: NT$ ${formatNumber(item.v)}`}>
                    <div 
                      className={`w-full rounded-xs transition-colors ${
                        item.today ? 'bg-[#7fdcae] group-hover:bg-[#9ce9c4]' : 'bg-white/15 group-hover:bg-white/35'
                      }`}
                      style={{ height: `${Math.max((item.v / maxSparkVal) * 38, 3)}px` }}
                    />
                    <span className={`font-numeric text-[9px] ${item.today ? 'text-white/80 font-bold' : 'text-white/40'}`}>
                      {item.d}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. KARTU ORDER BULAN INI (Sales Order & Purchase Order) */}
            <div className="kpi justify-center p-4">
              <div className="flex items-center w-full">
                {/* Sales Order */}
                <div className="flex-1 flex flex-col items-center text-center gap-1">
                  <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center bg-[#eef3fa] text-[#2b5a9e]">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="font-numeric text-xl font-extrabold tracking-tight leading-none text-neutral-900 mt-0.5">
                    {monthlySO.length} <span className="text-[11px] font-semibold text-neutral-500">Order</span>
                  </div>
                  <div className="flex flex-col items-center leading-tight gap-0.5 mb-0.5">
                    <div className="font-numeric text-xs font-bold text-[#2b5a9e]" title="Total Revenue">
                      Rev: NT$ {formatNumber(monthlySOTotalNTD)}
                    </div>
                    <div className="font-numeric text-[10.5px] font-semibold text-[#a8323b]" title="Cost of Goods Sold">
                      HPP: NT$ {formatNumber(monthlySOCOGSNTD)}
                    </div>
                  </div>
                  <div className="text-[10.5px] text-neutral-500 font-medium leading-tight mt-0.5">
                    Sales Order
                  </div>
                  <button 
                    onClick={() => setTab?.('sales')} 
                    className="text-[11px] font-semibold text-[#2b5a9e] hover:underline cursor-pointer bg-transparent border-none p-0 mt-0.5"
                  >
                    Lihat →
                  </button>
                </div>

                <div className="w-px self-stretch bg-neutral-200 mx-2"></div>

                {/* Purchase Order */}
                <div className="flex-1 flex flex-col items-center text-center gap-1">
                  <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center bg-[#fef3e2] text-[#d97706]">
                    <Box className="w-4 h-4" />
                  </div>
                  <div className="font-numeric text-xl font-extrabold tracking-tight leading-none text-neutral-900 mt-0.5">
                    {monthlyPOCount} <span className="text-[11px] font-semibold text-neutral-500">Order</span>
                  </div>
                  <div className="font-numeric text-xs font-bold text-[#d97706]">
                    NT$ {formatNumber(monthlyPOTotalNTD)}
                  </div>
                  <div className="text-[10.5px] text-neutral-500 font-medium leading-tight">
                    Purchase Order
                  </div>
                  <button 
                    onClick={() => setTab?.('purchases')} 
                    className="text-[11px] font-semibold text-[#d97706] hover:underline cursor-pointer bg-transparent border-none p-0 mt-0.5"
                  >
                    Lihat →
                  </button>
                </div>
              </div>
            </div>

            {/* 3. KARTU ROAS BULAN INI */}
            <div className="kpi">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11.5px] font-semibold text-neutral-500">ROAS (Bulan Ini)</span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#f0ecfa] text-[#5b3fa8]">
                  <Target className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="font-numeric text-2xl font-bold tracking-tight text-[#0f7a52] mb-1">
                {roasRatio > 0 ? `${roasRatio.toFixed(2)}x` : '0x'} <span className="text-sm font-semibold text-neutral-400">Return</span>
              </div>
              <div className="text-[11.5px] text-neutral-400 mt-auto leading-normal">
                NT$ {formatNumber(monthlyAdRevenueNTD)} dari NT$ {formatNumber(monthlyAdSpendNTD)} belanja iklan
              </div>
              <div className="text-[11.5px] mt-1">
                <button onClick={() => setTab?.('iklan')} className="text-[#a8323b] font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
                  Lihat Riwayat Iklan →
                </button>
              </div>
            </div>

            {/* 4. KARTU SALDO KAS BANK */}
            <div className="kpi">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11.5px] font-semibold text-neutral-500">Saldo Kas Bank</span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#e7f5ef] text-[#0f7a52]">
                  <CreditCard className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2.5">
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                  <div className="text-[10.5px] text-neutral-400 font-medium mb-1">NTD Ledger</div>
                  <div className="font-numeric text-sm font-bold tracking-tight text-neutral-900">
                    {formatNTDAmount(ntdLedgerBalance)}
                  </div>
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                  <div className="text-[10.5px] text-neutral-400 font-medium mb-1">IDR Ledger</div>
                  <div className="font-numeric text-sm font-bold tracking-tight text-[#0f7a52]">
                    {formatNTDAmount(idrLedgerBalance)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 bg-[#e7f5ef] border border-[#cfe8db] rounded-lg p-2.5">
                <span className="text-xs font-semibold text-[#0f7a52]">Saldo Kas Gabungan</span>
                <span className="font-numeric text-[15px] font-extrabold text-[#0f7a52] tracking-tight">
                  {formatNTDAmount(totalCashCombinedNTD)}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION: POSISI FINANSIAL */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 whitespace-nowrap">
              Posisi Finansial · {selectedMonth}
            </span>
            <span className="flex-1 h-px bg-neutral-200"></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="kpi">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11.5px] font-semibold text-neutral-500">Modal (Ekuitas Pemilik)</span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#f0ecfa] text-[#5b3fa8]">
                  <Scale className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="font-numeric text-2xl font-bold tracking-tight text-neutral-900 mb-1">
                {formatNTDAmount(modalEquity)}
              </div>
              <div className="text-[11.5px] text-neutral-400">live per hari ini</div>
            </div>

            <div className="kpi">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11.5px] font-semibold text-neutral-500">Revenue (Bulan Ini)</span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#eef3fa] text-[#2b5a9e]">
                  <TrendingUp className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="font-numeric text-2xl font-bold tracking-tight text-[#2b5a9e] mb-1">
                {formatNTDAmount(revenueSelesaiNTD)}
              </div>
              <div className="text-[11.5px] text-neutral-400">diakui dari order Selesai</div>
            </div>

            <div className="kpi">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11.5px] font-semibold text-neutral-500">Laba Bersih Bulan Ini</span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#e7f5ef] text-[#0f7a52]">
                  <TrendingUp className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="font-numeric text-2xl font-bold tracking-tight text-[#0f7a52] mb-1">
                {formatNTDAmount(labaBersihNTD)}
              </div>
              <div className="text-[11.5px] text-neutral-400">akumulasi laba berjalan</div>
            </div>

            <div className="kpi">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11.5px] font-semibold text-neutral-500">Status Rekonsiliasi</span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-neutral-100 text-neutral-600">
                  <Scale className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mb-2">
                {isBalanced ? (
                  <span className="inline-flex items-center gap-1.5 bg-[#e7f5ef] text-[#0f7a52] text-xs font-bold px-3 py-1.5 rounded-full">
                    <Check className="w-3.5 h-3.5" />
                    Balanced
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-[#fbecec] text-[#a8323b] text-xs font-bold px-3 py-1.5 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Unbalanced
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-neutral-400">Aset = Liabilitas + Modal</div>
            </div>
          </div>

          {/* SECTION: PERLU TINDAKAN */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 whitespace-nowrap">
              Perlu Tindakan
            </span>
            <span className="flex-1 h-px bg-neutral-200"></span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* List 1: Buku Perlu Dibeli */}
            <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
              <div className="p-4 border-b border-neutral-200 flex items-center gap-2.5">
                <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center bg-[#fbecec] text-[#a8323b]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>
                <h3 className="text-13px font-bold text-neutral-900 flex-1 m-0">Buku Perlu Dibeli</h3>
                <span className="font-numeric text-xs font-semibold bg-neutral-100 border border-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                  {booksToBuy.length} judul
                </span>
              </div>

              <div className="max-h-[322px] overflow-y-auto lbody">
                {booksToBuy.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-400">Semua stok buku aman di atas safety stock.</div>
                ) : (
                  booksToBuy.map((b, idx) => {
                    const title = b.bookName || b.title || 'Buku';
                    const safety = b.minStok || b.minOrder || b.safetyStock || 0;
                    const stock = b.stok !== undefined ? b.stok : (b.physicalStock !== undefined ? b.physicalStock : (b.stock || 0));
                    return (
                      <div key={b.id || idx} className="flex items-center gap-3 p-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <div className="w-8 h-[41px] rounded bg-gradient-to-br from-[#d9cbb8] to-[#b9a68d] shrink-0 flex items-center justify-center text-white overflow-hidden">
                          {b.cover ? (
                            <img src={b.cover} alt={title} className="w-full h-full object-cover" />
                          ) : (
                            <BookOpen className="w-3.5 h-3.5 opacity-80" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs text-neutral-900 truncate mb-0.5">{title}</div>
                          <div className="font-numeric text-[11px] text-neutral-400">Safety stock: {safety} pcs</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`font-numeric text-[11.5px] font-bold ${stock <= 0 ? 'text-[#a8323b]' : 'text-neutral-700'}`}>
                            Stok: {stock} pcs
                          </span>
                          <button 
                            onClick={() => setTab?.('purchases')}
                            className="bg-[#0d1117] hover:bg-black text-white border-none rounded-md px-3 py-1 font-semibold text-[11.5px] cursor-pointer transition-colors"
                          >
                            Beli PO
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t border-neutral-200 bg-neutral-50">
                <button onClick={() => setTab?.('catalog')} className="text-xs font-semibold text-[#2b5a9e] hover:underline inline-flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer">
                  Lihat semua katalog <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List 2: Harus Dikirim Hari Ini */}
            <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
              <div className="p-4 border-b border-neutral-200 flex items-center gap-2.5">
                <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center bg-[#eef3fa] text-[#2b5a9e]">
                  <Truck className="w-3.5 h-3.5" />
                </span>
                <h3 className="text-13px font-bold text-neutral-900 flex-1 m-0">Harus Dikirim Hari Ini</h3>
                <span className="font-numeric text-xs font-semibold bg-[#eef3fa] text-[#2b5a9e] border border-[#2b5a9e]/20 px-2 py-0.5 rounded-full">
                  {packedSalesOrders.length} order dikemas
                </span>
              </div>

              <div className="max-h-[322px] overflow-y-auto lbody">
                {ordersToShip.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-400">Tidak ada pengiriman pending hari ini.</div>
                ) : (
                  ordersToShip.map((so, idx) => {
                    const buyer = so.customerName || so.customerPlatformName || so.buyerName || 'Pelanggan';
                    const qty = Array.isArray(so.items) ? so.items.reduce((sum: number, it: any) => sum + (it.qty || 0), 0) : (so.totalQty || 1);
                    const courier = so.pickupLogistics || so.platformChannel || so.courierName || '—';
                    const isPacked = so.status === 'packed';

                    return (
                      <div key={so.id || idx} className="flex items-center justify-between gap-3 p-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-numeric font-bold text-xs text-[#2b5a9e]">#{so.orderCode || so.id}</span>
                            <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isPacked ? 'bg-[#e7f5ef] text-[#0f7a52]' : 'bg-[#fef3e2] text-[#b45309]'
                            }`}>
                              {isPacked ? 'Dikemas' : (so.status || 'Draft')}
                            </span>
                          </div>
                          <div className="font-bold text-xs text-neutral-900 truncate">{buyer}</div>
                          <div className="text-[11px] text-neutral-400">{qty} buku · via {courier}</div>
                        </div>

                        <button 
                          onClick={() => setTab?.('sales')}
                          className="bg-[#2b5a9e] hover:bg-[#1e4275] text-white border-none rounded-md px-3 py-1.5 font-semibold text-[11.5px] cursor-pointer transition-colors shrink-0"
                        >
                          Buka Sales
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t border-neutral-200 bg-neutral-50">
                <button onClick={() => setTab?.('sales')} className="text-xs font-semibold text-[#2b5a9e] hover:underline inline-flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer">
                  Buka data penjualan <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          TAB 2: PERINGATAN (BARU)
      ═══════════════════════════════════════════ */}
      {activePanel === 'peringatan' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 whitespace-nowrap">
              Pusat Peringatan · Semua Modul
            </span>
            <span className="flex-1 h-px bg-neutral-200"></span>
          </div>

          {/* 3 Severity Filter Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => setSevFilter(sevFilter === 'kritis' ? 'semua' : 'kritis')}
              className={`bg-white border rounded-xl p-4 cursor-pointer text-left transition-all relative overflow-hidden shadow-xs border-neutral-200 hover:border-neutral-400 ${
                sevFilter === 'kritis' ? 'border-[#dc2626] bg-[#fde3e1] border-l-4' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#dc2626]" />
                <span className={`text-xs font-semibold ${sevFilter === 'kritis' ? 'text-[#dc2626]' : 'text-neutral-500'}`}>Kritis</span>
              </div>
              <div className={`font-numeric text-2xl font-extrabold tracking-tight ${sevFilter === 'kritis' ? 'text-[#dc2626]' : 'text-neutral-900'}`}>
                {alertCounts.kritis}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">
                {alertCounts.kritis ? 'perlu ditindak segera' : 'tidak ada masalah'}
              </div>
            </button>

            <button
              onClick={() => setSevFilter(sevFilter === 'perhatian' ? 'semua' : 'perhatian')}
              className={`bg-white border rounded-xl p-4 cursor-pointer text-left transition-all relative overflow-hidden shadow-xs border-neutral-200 hover:border-neutral-400 ${
                sevFilter === 'perhatian' ? 'border-[#d97706] bg-[#fef3e2] border-l-4' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#d97706]" />
                <span className={`text-xs font-semibold ${sevFilter === 'perhatian' ? 'text-[#d97706]' : 'text-neutral-500'}`}>Perlu Perhatian</span>
              </div>
              <div className={`font-numeric text-2xl font-extrabold tracking-tight ${sevFilter === 'perhatian' ? 'text-[#d97706]' : 'text-neutral-900'}`}>
                {alertCounts.perhatian}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">
                {alertCounts.perhatian ? 'perlu dipantau' : 'tidak ada masalah'}
              </div>
            </button>

            <button
              onClick={() => setSevFilter(sevFilter === 'info' ? 'semua' : 'info')}
              className={`bg-white border rounded-xl p-4 cursor-pointer text-left transition-all relative overflow-hidden shadow-xs border-neutral-200 hover:border-neutral-400 ${
                sevFilter === 'info' ? 'border-[#1d6fa5] bg-[#e8f2f9] border-l-4' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#1d6fa5]" />
                <span className={`text-xs font-semibold ${sevFilter === 'info' ? 'text-[#1d6fa5]' : 'text-neutral-500'}`}>Info</span>
              </div>
              <div className={`font-numeric text-2xl font-extrabold tracking-tight ${sevFilter === 'info' ? 'text-[#1d6fa5]' : 'text-neutral-900'}`}>
                {alertCounts.info}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">
                {alertCounts.info ? 'pemberitahuan' : 'tidak ada'}
              </div>
            </button>
          </div>

          {/* Alert Feed List */}
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex items-center gap-2.5">
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center bg-neutral-100 text-neutral-600">
                <ShieldAlert className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-13px font-bold text-neutral-900 flex-1 m-0">
                {sevFilter === 'semua' ? 'Semua Peringatan' : `Peringatan — ${sevFilter.charAt(0).toUpperCase() + sevFilter.slice(1)}`}
              </h3>
              <span className="font-numeric text-xs font-semibold bg-neutral-100 border border-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                {filteredAlerts.length}
              </span>
            </div>

            <div className="max-h-[560px] overflow-y-auto lbody">
              {filteredAlerts.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400">Tidak ada peringatan aktif saat ini.</div>
              ) : (
                filteredAlerts.map((a, idx) => {
                  const borderCol = a.sev === 'kritis' ? '#dc2626' : a.sev === 'perhatian' ? '#d97706' : '#1d6fa5';
                  const bgCol = a.sev === 'kritis' ? '#fde3e1' : a.sev === 'perhatian' ? '#fef3e2' : '#e8f2f9';

                  return (
                    <div 
                      key={idx} 
                      className="flex items-start gap-3 p-3.5 border-b border-neutral-100 relative hover:bg-neutral-50 transition-colors"
                      style={{ borderLeft: `3px solid ${borderCol}` }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: bgCol, color: borderCol }}>
                        {a.ic === 'clock' && <Clock className="w-4 h-4" />}
                        {a.ic === 'box' && <Box className="w-4 h-4" />}
                        {a.ic === 'truck' && <Truck className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs text-neutral-900 mb-1">{a.t}</div>
                        <div className="text-[11.5px] text-neutral-500 leading-normal" dangerouslySetInnerHTML={{ __html: a.d }} />
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="font-numeric text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: bgCol, color: borderCol }}>
                          {a.mod}
                        </span>
                        <button 
                          onClick={() => setTab?.(a.tabTarget)}
                          className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-semibold text-[11.5px] px-3 py-1 rounded-md cursor-pointer transition-colors"
                        >
                          {a.act} →
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          TAB 3: CATATAN
      ═══════════════════════════════════════════ */}
      {activePanel === 'catatan' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 whitespace-nowrap">
              Catatan & Task Tim
            </span>
            <span className="flex-1 h-px bg-neutral-200"></span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Card 1: Catatan Tim */}
            <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
              <div className="p-4 border-b border-neutral-200 flex items-center gap-2.5">
                <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center bg-[#fef3e2] text-[#b45309]">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <h3 className="text-13px font-bold text-neutral-900 flex-1 m-0">Catatan Tim</h3>
                <span className="font-numeric text-xs font-semibold bg-neutral-100 border border-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                  {notes.length}
                </span>
                {notes.length > 0 && (
                  <button
                    onClick={handleClearAllNotes}
                    title="Hapus Semua Catatan"
                    className="p-1 text-neutral-400 hover:text-rose-600 transition-colors ml-1 cursor-pointer bg-transparent border-none"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Baris Tambah Catatan (NO DROPDOWN - AUTHOR IS AUTOMATIC FROM LOGGED IN SESSION) */}
              <div className="flex gap-2 p-3.5 border-b border-neutral-200 bg-neutral-50/50">
                <input 
                  type="text" 
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                  placeholder="Tulis catatan baru…" 
                  className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-xs outline-none bg-white focus:border-[#2b5a9e]"
                />
                
                <span className="inline-flex items-center gap-1.5 bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-700 shrink-0 whitespace-nowrap" title="Otomatis terdeteksi dari akun yang login">
                  <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span>{currentAuthorName}</span>
                </span>

                <button 
                  onClick={handleAddNote}
                  className="bg-[#0d1117] hover:bg-black text-white border-none rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer transition-colors shrink-0"
                >
                  Tambah
                </button>
              </div>

              {/* Notes List View */}
              <div className="max-h-[560px] overflow-y-auto lbody">
                {activeNotes.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-400">
                    Belum ada catatan aktif.
                  </div>
                ) : (
                  activeNotes.map((n, idx) => {
                  const isFelix = n.who === 'felix';
                  const barColor = isFelix ? '#5b3fa8' : '#1d6fa5';
                  const bgTag = isFelix ? '#f0ecfa' : '#e8f2f9';

                  return (
                    <div 
                      key={n.id || idx} 
                      className={`flex gap-3 p-3.5 border-b border-neutral-100 relative transition-colors ${
                        n.pin ? 'bg-[#fef3e2]' : 'hover:bg-neutral-50'
                      }`}
                      style={{ borderLeft: `3px solid ${barColor}` }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-neutral-900 leading-relaxed">{n.txt}</div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: bgTag, color: barColor }}>
                            {n.authorName || (isFelix ? 'Felix' : 'Admin')}
                          </span>
                          <span className="font-numeric text-[10.5px] text-neutral-400">{n.when}</span>
                        </div>
                      </div>

                      <div className="flex gap-0.5 shrink-0">
                        <button 
                          onClick={() => handleToggleReadNote(n)} 
                          title="Tandai sudah dibaca"
                          className="w-6.5 h-6.5 rounded-md border-none bg-transparent hover:bg-neutral-200/60 text-neutral-400 hover:text-neutral-700 flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleTogglePinNote(n)} 
                          title="Sematkan / Pin"
                          className={`w-6.5 h-6.5 rounded-md border-none bg-transparent flex items-center justify-center cursor-pointer transition-colors ${
                            n.pin ? 'text-[#b45309]' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60'
                          }`}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteNote(n)} 
                          title="Hapus"
                          className="w-6.5 h-6.5 rounded-md border-none bg-transparent text-neutral-400 hover:text-[#a8323b] hover:bg-[#fbecec] flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

                {/* Collapsible Section: Selesai Dibaca */}
                <div className="border-t border-neutral-200">
                  <div 
                    onClick={() => setNotesCompletedOpen(!notesCompletedOpen)}
                    className="flex items-center gap-2 p-3 px-4 cursor-pointer text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 text-xs font-medium transition-colors"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${notesCompletedOpen ? 'rotate-90' : ''}`} />
                    <span>Selesai Dibaca <b className="font-numeric">({completedNotes.length})</b></span>
                  </div>

                  {notesCompletedOpen && (
                    <div className="opacity-70 bg-neutral-50/50">
                      {completedNotes.length === 0 ? (
                        <div className="p-3 px-4 text-xs text-neutral-400">Belum ada catatan yang ditandai selesai.</div>
                      ) : (
                        completedNotes.map((n, idx) => {
                          const isFelix = n.who === 'felix';
                          const barColor = isFelix ? '#5b3fa8' : '#1d6fa5';
                          const bgTag = isFelix ? '#f0ecfa' : '#e8f2f9';

                          return (
                            <div 
                              key={n.id || idx} 
                              className="flex gap-3 p-3.5 border-b border-neutral-100 relative hover:bg-neutral-100/50 transition-colors"
                              style={{ borderLeft: `3px solid ${barColor}` }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-neutral-700 leading-relaxed">{n.txt}</div>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: bgTag, color: barColor }}>
                                    {n.authorName || (isFelix ? 'Felix' : 'Admin')}
                                  </span>
                                  <span className="font-numeric text-[10.5px] text-neutral-400">{n.when}</span>
                                </div>
                              </div>

                              <div className="flex gap-0.5 shrink-0">
                                <button 
                                  onClick={() => handleToggleReadNote(n)} 
                                  title="Tandai belum dibaca"
                                  className="w-6.5 h-6.5 rounded-md border-none bg-transparent text-[#0f7a52] flex items-center justify-center cursor-pointer transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteNote(n)} 
                                  title="Hapus"
                                  className="w-6.5 h-6.5 rounded-md border-none bg-transparent text-neutral-400 hover:text-[#a8323b] hover:bg-[#fbecec] flex items-center justify-center cursor-pointer transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Task Admin */}
            <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
              <div className="p-4 border-b border-neutral-200 flex items-center gap-3">
                {/* Ring Progress Percentage */}
                <div className="w-[44px] h-[44px] relative shrink-0">
                  <svg className="w-[44px] h-[44px] -rotate-90" viewBox="0 0 44 44">
                    <circle className="fill-none stroke-neutral-200 stroke-[5]" cx="22" cy="22" r="18" />
                    <circle 
                      className="fill-none stroke-[#4fbb8c] stroke-[5] stroke-linecap-round transition-all duration-500" 
                      cx="22" 
                      cy="22" 
                      r="18" 
                      style={{
                        strokeDasharray: circleCircumference,
                        strokeDashoffset: strokeDashoffset
                      }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-numeric text-[11px] font-extrabold text-neutral-900">
                    {taskPct}%
                  </span>
                </div>

                <div className="flex-1">
                  <h3 className="text-13px font-bold text-neutral-900 m-0 mb-0.5">Perlu Perbaikan</h3>
                  <p className="font-numeric text-[11.5px] text-neutral-400 m-0">
                    {completedTasks.length} dari {tasks.length} selesai
                  </p>
                </div>

                {tasks.length > 0 && (
                  <button 
                    onClick={handleClearAllTasks}
                    title="Hapus Semua Task"
                    className="p-1 text-neutral-400 hover:text-rose-600 transition-colors mr-1 cursor-pointer bg-transparent border-none"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                <button 
                  onClick={() => setAddTaskRowOpen(!addTaskRowOpen)}
                  className="bg-[#2b5a9e] hover:bg-[#1e4275] text-white border-none rounded-lg px-3 py-1.5 font-semibold text-[11.5px] cursor-pointer transition-colors shrink-0"
                >
                  + Task
                </button>
              </div>

              {/* Form Tambah Task */}
              {addTaskRowOpen && (
                <div className="flex gap-2 p-3.5 border-b border-neutral-200 bg-neutral-50/50">
                  <input 
                    type="text" 
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTask()}
                    placeholder="Tulis task baru…" 
                    className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-xs outline-none bg-white focus:border-[#2b5a9e]"
                  />
                  <select 
                    value={taskDueInput}
                    onChange={(e) => setTaskDueInput(e.target.value as any)}
                    className="border border-neutral-200 rounded-lg px-2.5 py-2 text-xs text-neutral-700 bg-white outline-none cursor-pointer shrink-0"
                  >
                    <option value="today">Hari Ini</option>
                    <option value="week">Minggu Ini</option>
                    <option value="later">Nanti</option>
                  </select>
                  <button 
                    onClick={handleSaveTask}
                    className="bg-[#0d1117] hover:bg-black text-white border-none rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer transition-colors shrink-0"
                  >
                    Simpan
                  </button>
                </div>
              )}

              {/* Tasks List View */}
              <div className="max-h-[560px] overflow-y-auto lbody">
                {activeTasks.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-400">
                    Belum ada task aktif.
                  </div>
                ) : (
                  activeTasks.map((t, idx) => {
                  const dueMeta = t.due === 'today' 
                    ? { label: 'Hari Ini', c: '#a8323b', bg: '#fbecec' }
                    : t.due === 'week'
                    ? { label: 'Minggu Ini', c: '#b45309', bg: '#fef3e2' }
                    : { label: 'Nanti', c: '#6b7280', bg: '#f4f5f7' };

                  return (
                    <div key={t.id || idx} className="flex items-start gap-3 p-3.5 border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <button
                        onClick={() => handleToggleTaskDone(t)}
                        className="w-[18px] h-[18px] rounded-md border-[1.8px] border-neutral-300 flex items-center justify-center mt-0.5 cursor-pointer bg-white transition-colors shrink-0 hover:border-[#0f7a52]"
                      >
                        <Check className="w-3 h-3 text-white opacity-0" />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-neutral-900 leading-normal">{t.t}</div>
                        <div className="mt-1">
                          <span className="font-numeric text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ color: dueMeta.c, backgroundColor: dueMeta.bg }}>
                            {dueMeta.label}
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={() => handleDeleteTask(t)}
                        className="w-6.5 h-6.5 rounded-md border-none bg-transparent text-neutral-400 hover:text-[#a8323b] hover:bg-[#fbecec] flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}

                {/* Collapsible Section: Completed Tasks */}
                <div className="border-t border-neutral-200">
                  <div 
                    onClick={() => setTasksCompletedOpen(!tasksCompletedOpen)}
                    className="flex items-center gap-2 p-3 px-4 cursor-pointer text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 text-xs font-medium transition-colors"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${tasksCompletedOpen ? 'rotate-90' : ''}`} />
                    <span>Completed <b className="font-numeric">({completedTasks.length})</b></span>
                  </div>

                  {tasksCompletedOpen && (
                    <div className="opacity-70 bg-neutral-50/50">
                      {completedTasks.length === 0 ? (
                        <div className="p-3 px-4 text-xs text-neutral-400">Belum ada task yang selesai.</div>
                      ) : (
                        completedTasks.map((t, idx) => {
                          const dueMeta = t.due === 'today' 
                            ? { label: 'Hari Ini', c: '#a8323b', bg: '#fbecec' }
                            : t.due === 'week'
                            ? { label: 'Minggu Ini', c: '#b45309', bg: '#fef3e2' }
                            : { label: 'Nanti', c: '#6b7280', bg: '#f4f5f7' };

                          return (
                            <div key={t.id || idx} className="flex items-start gap-3 p-3.5 border-b border-neutral-100 hover:bg-neutral-100/50 transition-colors">
                              <button
                                onClick={() => handleToggleTaskDone(t)}
                                className="w-[18px] h-[18px] rounded-md bg-[#0f7a52] border-[1.8px] border-[#0f7a52] flex items-center justify-center mt-0.5 cursor-pointer shrink-0"
                              >
                                <Check className="w-3 h-3 text-white" />
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-neutral-400 line-through leading-normal">{t.t}</div>
                                <div className="mt-1">
                                  <span className="font-numeric text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ color: dueMeta.c, backgroundColor: dueMeta.bg }}>
                                    {dueMeta.label}
                                  </span>
                                </div>
                              </div>

                              <button 
                                onClick={() => handleDeleteTask(t)}
                                className="w-6.5 h-6.5 rounded-md border-none bg-transparent text-neutral-400 hover:text-[#a8323b] hover:bg-[#fbecec] flex items-center justify-center cursor-pointer transition-colors shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          TAB 4: HARGA JUAL
      ═══════════════════════════════════════════ */}
      {activePanel === 'harga' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 whitespace-nowrap">
              Kalkulator Harga Jual
            </span>
            <span className="flex-1 h-px bg-neutral-200"></span>
          </div>

          {/* KALKULATOR HARGA JUAL */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {/* Input Harga Beli */}
              <div>
                <div className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 mb-2">
                  Harga Beli (Rupiah)
                </div>
                <div className="flex items-center gap-2.5 border-1.5 border-neutral-200 rounded-xl p-3 focus-within:border-[#2b5a9e] transition-colors">
                  <span className="font-numeric font-bold text-base text-neutral-400 shrink-0">Rp</span>
                  <input 
                    type="text" 
                    value={calcIn}
                    onChange={(e) => setCalcIn(formatInputWithCommas(e.target.value))}
                    placeholder="0" 
                    inputMode="numeric"
                    className="border-none outline-none bg-transparent w-full font-numeric text-xl font-bold text-neutral-900 tracking-tight placeholder-neutral-300"
                  />
                </div>
              </div>

              {/* Output Harga Marketplace */}
              <div className="bg-[#2b5a9e] text-white rounded-xl p-3.5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold tracking-wider uppercase opacity-60 shrink-0">Harga Marketplace</span>
                <span className={`font-numeric text-2xl font-extrabold tracking-tight ${!calcMatchResult.matchedTier ? 'opacity-35' : ''}`}>
                  {calcMatchResult.matchedTier ? formatNTD(calcMatchResult.matchedTier.mkt * 100) : 'NT$ —'}
                </span>
              </div>

              {/* Output Harga Umum */}
              <div className="bg-[#e7f5ef] border-1.5 border-[#bfe5d3] rounded-xl p-3.5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold tracking-wider uppercase text-[#0f7a52] opacity-75 shrink-0">Harga Umum</span>
                <span className={`font-numeric text-2xl font-extrabold tracking-tight text-[#0f7a52] ${!calcMatchResult.matchedTier ? 'opacity-35' : ''}`}>
                  {calcMatchResult.matchedTier ? formatNTD(calcMatchResult.matchedTier.umum * 100) : 'NT$ —'}
                </span>
              </div>
            </div>

            {/* Note Dynamic Bar */}
            <div className="mt-3.5 pt-3 border-t border-dashed border-neutral-200 text-xs text-neutral-500 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span>
                {calcMatchResult.messageType === 'blank' && (
                  'Ketik harga beli dalam Rupiah — sistem otomatis cari tingkat yang sesuai dan tandai barisnya di tabel.'
                )}
                {calcMatchResult.messageType === 'below' && (
                  <>
                    <span className="text-[#a8323b] font-semibold">Di bawah tingkat terendah</span> — batas bawah paling kecil saat ini <b className="font-numeric">{formatIDR(calcMatchResult.lowestFrom)}</b>.
                  </>
                )}
                {calcMatchResult.messageType === 'above' && (
                  <>
                    <span className="text-[#a8323b] font-semibold">Di luar tingkat tertinggi</span> — tingkat terakhir berhenti di <b className="font-numeric">{formatIDR(calcMatchResult.highestTo)}</b>.{' '}
                    <span 
                      onClick={() => setAddTierFormOpen(true)}
                      className="text-[#2b5a9e] font-semibold underline cursor-pointer"
                    >
                      Tambah tingkat baru →
                    </span>
                  </>
                )}
                {calcMatchResult.messageType === 'match' && calcMatchResult.matchedTier && (
                  <>
                    Masuk tingkat <b className="font-numeric">{formatIDR(calcMatchResult.matchedTier.from)} – {formatIDR(calcMatchResult.matchedTier.to)}</b> · selisih Marketplace vs Umum <b className="font-numeric">{formatNTD((calcMatchResult.matchedTier.mkt - calcMatchResult.matchedTier.umum) * 100)}</b>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* TABEL DAFTAR TINGKAT HARGA */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 whitespace-nowrap">
              Daftar Tingkat Harga
            </span>
            <span className="flex-1 h-px bg-neutral-200"></span>
          </div>

          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex items-center gap-2.5">
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center bg-[#eef3fa] text-[#2b5a9e]">
                <DollarSign className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-13px font-bold text-neutral-900 flex-1 m-0">Tingkat Harga Jual</h3>
              <span className="font-numeric text-xs font-semibold bg-neutral-100 border border-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                {tiers.length} tingkat
              </span>
              
              <button 
                onClick={() => setAddTierFormOpen(!addTierFormOpen)}
                className={`w-6.5 h-6.5 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:text-neutral-900 cursor-pointer flex items-center justify-center transition-transform duration-200 ${
                  addTierFormOpen ? 'rotate-180 bg-neutral-100' : ''
                }`}
                title={addTierFormOpen ? 'Sembunyikan form tambah tingkat' : 'Tampilkan form tambah tingkat'}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* FORM TAMBAH TINGKAT (DEFAULT CLOSED) */}
            {addTierFormOpen && (
              <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-neutral-400 mb-1.5">
                    Range Harga (IDR)
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={tierFrom}
                      onChange={(e) => setTierFrom(formatInputWithCommas(e.target.value))}
                      placeholder="530,000" 
                      inputMode="numeric"
                      className="w-full border border-neutral-200 rounded-lg p-2 font-numeric text-xs bg-white outline-none focus:border-[#2b5a9e]"
                    />
                    <span className="text-neutral-400 font-bold shrink-0">–</span>
                    <input 
                      type="text" 
                      value={tierToVal}
                      onChange={(e) => setTierToVal(formatInputWithCommas(e.target.value))}
                      placeholder="549,999" 
                      inputMode="numeric"
                      className="w-full border border-neutral-200 rounded-lg p-2 font-numeric text-xs bg-white outline-none focus:border-[#2b5a9e]"
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-neutral-400 mb-1.5">
                    Harga Marketplace (NT$)
                  </label>
                  <input 
                    type="text" 
                    value={tierMkt}
                    onChange={(e) => setTierMkt(formatInputWithCommas(e.target.value))}
                    placeholder="1,699" 
                    inputMode="numeric"
                    className="w-full border border-neutral-200 rounded-lg p-2 font-numeric text-xs bg-white outline-none focus:border-[#2b5a9e]"
                  />
                </div>

                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-neutral-400 mb-1.5">
                    Harga Umum (NT$)
                  </label>
                  <input 
                    type="text" 
                    value={tierUmum}
                    onChange={(e) => setTierUmum(formatInputWithCommas(e.target.value))}
                    placeholder="1,670" 
                    inputMode="numeric"
                    className="w-full border border-neutral-200 rounded-lg p-2 font-numeric text-xs bg-white outline-none focus:border-[#2b5a9e]"
                  />
                </div>

                <button 
                  onClick={handleAddTier}
                  className="bg-[#0d1117] hover:bg-black text-white border-none rounded-lg px-4 py-2 font-semibold text-xs cursor-pointer transition-colors shrink-0"
                >
                  + Tambah Tingkat
                </button>

                {tierError && (
                  <div className="w-full text-xs text-[#a8323b] font-semibold mt-1">
                    {tierError}
                  </div>
                )}
              </div>
            )}

            {/* Price Tiers Table */}
            <div className="max-h-[560px] overflow-y-auto lbody">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-white border-b border-neutral-200 sticky top-0 z-10 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    <th className="text-left py-2.5 px-4">Range Harga Beli (Rp)</th>
                    <th className="text-right py-2.5 px-4">Harga Marketplace</th>
                    <th className="text-right py-2.5 px-4">Harga Umum</th>
                    <th className="text-center py-2.5 px-4 w-[52px]">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t, idx) => {
                    const isHit = calcMatchResult.matchedTier && calcMatchResult.matchedTier.from === t.from;

                    return (
                      <tr 
                        key={idx} 
                        data-tier-from={t.from}
                        className={`border-b border-neutral-100 transition-colors text-xs hover:bg-neutral-50 ${
                          isHit ? 'hit' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <span className="font-numeric font-semibold text-neutral-700">
                            {formatIDR(t.from)} – {formatIDR(t.to)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className="font-numeric font-bold text-[#2b5a9e]">
                            {formatNTD(t.mkt * 100)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className="font-numeric font-bold text-[#0f7a52]">
                            {formatNTD(t.umum * 100)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button 
                            onClick={() => handleDeleteTier(t)}
                            className="w-6.5 h-6.5 rounded-md border-none bg-transparent text-neutral-400 hover:text-[#a8323b] hover:bg-[#fbecec] inline-flex items-center justify-center cursor-pointer transition-colors"
                            title="Hapus tingkat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
