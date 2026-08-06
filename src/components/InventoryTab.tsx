import { getNextJournalId } from '../lib/journalUtils';
import { FALLBACK_NTD_PER_IDR } from '../lib/exchangeRateConstants';
import React, { useState, useEffect, useMemo } from 'react';
import { Decimal } from 'decimal.js';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  setDoc,
  getDocs,
  query, 
  where,
  Timestamp,
  writeBatch,
  deleteField
} from 'firebase/firestore';
import { DiagnosticReportModal } from './DiagnosticReportModal';
import { Book, InventoryRecord, InventoryLedgerEntry, DamagedStock, JournalEntry } from '../types';
import { formatNTD, formatNTDExact } from '../lib/decimal-utils';
import { getCurrentKontrolStokForBook, getPhysicalOnHandStockForBook, getAllBooksStockData } from '../lib/inventory-utils';
import { ensureAutoAccountExists } from '../lib/journalAuto';
import { useAuth } from '../lib/auth-context';
import { isPeriodClosed, getYearMonth } from '../lib/period-closing-utils';
import { 
  Boxes, 
  TrendingUp, 
  TriangleAlert, 
  History, 
  X, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle,
  Calendar,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  ShieldAlert,
  Wrench,
  SlidersHorizontal,
  Pencil,
  PackageX,
  PackagePlus,
  Package,
  Filter
} from 'lucide-react';

const SPINES = ["#4C4EA3", "#3E3226", "#8A6A2F", "#54463A", "#7A3B4A", "#2E2A24"];
function spineColor(title: string) { 
  let s = 0; 
  for (let i=0; i<title.length; i++) s += title.charCodeAt(i); 
  return SPINES[s % SPINES.length]; 
}

const CUSTOM_STYLES = `
  .kbi-inventory {
    --paper: #F4F4F7;
    --card: #FFFFFF;
    --card-alt: #F0F0F6;
    --ink: #1B1E2A;
    --ink-muted: #6E7180;
    --ink-faint: #9C9EAE;
    --line: #E4E4EC;
    --line-strong: #D2D2E0;

    --yellow: #A8860B;
    --yellow-dark: #8A6E0A;
    --yellow-soft: #FBF3D3;

    --green: #3D7A4F;
    --green-soft: #DCEEE0;
    --amber: #B67F2A;
    --amber-soft: #F3E6CE;
    --gray: #6E7180;
    --gray-soft: #EBEBF0;
    --red: #B5502F;
    --red-soft: #F4E3DA;
  }

  .dark .kbi-inventory {
    --paper: #0a0a0a;
    --card: #171717;
    --card-alt: #262626;
    --ink: #f5f5f5;
    --ink-muted: #a3a3a3;
    --ink-faint: #525252;
    --line: #262626;
    --line-strong: #404040;
    --yellow: #ca8a04;
    --yellow-dark: #a16207;
    --yellow-soft: #422006;
    --green: #16a34a;
    --green-soft: #052e16;
    --amber: #d97706;
    --amber-soft: #451a03;
    --gray: #a3a3a3;
    --gray-soft: #262626;
    --red: #dc2626;
    --red-soft: #450a0a;
  }

  .kbi-inventory { color: var(--ink); font-family: var(--font-text); }
  
  .kbi-header-card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 26px 30px; display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .kbi-eyebrow { display: flex; align-items: center; gap: 8px; font-family: var(--font-numeric); font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--yellow); margin-bottom: 6px; }
  .kbi-eyebrow .dash { width: 18px; height: 1px; background: var(--yellow); display: inline-block; }
  .kbi-page-title { font-family: var(--font-text); font-size: 27px; font-weight: 600; margin: 0 0 4px; }
  .kbi-page-subtitle { font-size: 13px; color: var(--ink-muted); margin: 0; max-width: 50ch; }
  .kbi-btn-download-pdf { display: inline-flex; align-items: center; gap: 8px; background: var(--yellow); color: #fff; border: none; padding: 11px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; transition: background-color 0.15s ease; }
  .kbi-btn-download-pdf:hover { background: var(--yellow-dark); }
  .kbi-btn-red { display: inline-flex; align-items: center; gap: 8px; background: var(--red); color: #fff; border: none; padding: 11px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; transition: background-color 0.15s ease; }
  .kbi-btn-red:hover { filter: brightness(0.9); }

  .kbi-toolbar-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .kbi-tabs { display: inline-flex; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 4px; gap: 2px; }
  .kbi-tabs button { border: none; background: none; padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 700; letter-spacing: 0.03em; cursor: pointer; color: var(--ink-muted); font-family: inherit; }
  .kbi-tabs button.active { background: var(--yellow-soft); color: var(--yellow-dark); }

  .kbi-filter-chips { display: inline-flex; gap: 6px; }
  .kbi-filter-chips button { border: 1px solid var(--line); background: var(--card); padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: var(--ink-muted); font-family: inherit; }
  .kbi-filter-chips button.active { background: var(--yellow); border-color: var(--yellow); color: #fff; }
  .kbi-filter-chips .count { font-family: var(--font-numeric); margin-left: 4px; opacity: 0.8; }

  .kbi-search-box { position: relative; flex: 1 1 220px; max-width: 320px; }
  .kbi-search-box svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-faint); }
  .kbi-search-box input { width: 100%; padding: 9px 12px 9px 36px; border-radius: 9px; border: 1px solid var(--line); background: var(--card); font-size: 13px; font-family: inherit; color: var(--ink); }

  .kbi-minus-banner { display: flex; align-items: center; gap: 12px; background: var(--red-soft); border: 1px solid var(--red); border-radius: 12px; padding: 14px 18px; margin-bottom: 18px; }
  .kbi-minus-banner svg { color: var(--red); flex-shrink: 0; }
  .kbi-minus-banner strong { color: var(--red); font-size: 14px; }
  .kbi-minus-banner span.sub { display: block; font-size: 12px; color: var(--red); opacity: 0.8; margin-top: 2px; }

  .kbi-table-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .kbi-t-head, .kbi-t-row { display: grid; grid-template-columns: 52px 1.4fr 0.5fr 0.7fr 0.7fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.8fr 0.9fr; gap: 8px; align-items: center; padding: 12px 18px; }
  .kbi-t-head { background: var(--card-alt); }
  .kbi-t-head span { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); font-family: var(--font-numeric); }
  .kbi-t-row { border-top: 1px solid var(--line); }
  .kbi-t-row.sev-minus { background: linear-gradient(to right, var(--red-soft) 0%, transparent 3%); }

  .kbi-book-cover { width: 40px; height: 52px; border-radius: 6px; }
  .kbi-book-info .nama { font-family: var(--font-text); font-weight: 500; font-size: 14.5px; }

  .kbi-val-center { text-align: center; font-family: var(--font-numeric); font-size: 13.5px; }
  .kbi-val-center.clickable { cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; color: var(--red); font-weight: 700; }
  .kbi-val-center.negative { color: var(--red); font-weight: 700; }

  .kbi-status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; font-family: var(--font-numeric); }
  .kbi-status-pill .dot { width: 6px; height: 6px; border-radius: 999px; }
  .status-aman { background: var(--green-soft); color: var(--green); } .status-aman .dot { background: var(--green); }
  .status-menipis { background: var(--amber-soft); color: var(--amber); } .status-menipis .dot { background: var(--amber); }
  .status-habis { background: var(--gray-soft); color: var(--gray); } .status-habis .dot { background: var(--gray); }
  .status-minus { background: var(--red-soft); color: var(--red); } .status-minus .dot { background: var(--red); }

  .kbi-saran-beli { font-family: var(--font-numeric); font-size: 13px; text-align: center; }
  .kbi-saran-beli strong { color: var(--red); font-weight: 700; }
  .kbi-saran-beli .muted { color: var(--ink-faint); }

  @media (max-width: 900px) {
    .kbi-t-head, .kbi-t-row { grid-template-columns: 40px 1.6fr 0.9fr 1.1fr; }
    .kbi-t-head span:nth-child(3), .kbi-t-row > div:nth-child(3),
    .kbi-t-head span:nth-child(4), .kbi-t-row > div:nth-child(4),
    .kbi-t-head span:nth-child(5), .kbi-t-row > div:nth-child(5),
    .kbi-t-head span:nth-child(7), .kbi-t-row > div:nth-child(7),
    .kbi-t-head span:nth-child(8), .kbi-t-row > div:nth-child(8),
    .kbi-t-head span:nth-child(10), .kbi-t-row > div:nth-child(10) { display: none; }
  }
`;

export const InventoryTab: React.FC = () => {
  const { user, profile } = useAuth();
  const isStaffValue = profile?.role === 'owner' || profile?.role === 'staff';

  const hasPerm = (key: string) => {
    if (profile?.role === 'owner') return true;
    return !!profile?.permissions?.[key];
  };

  // Sub-tabs: 'kontrol_stok', 'monthly', or 'adjustments'
  const [activeSubTab, setActiveSubTab] = useState<'kontrol_stok' | 'monthly' | 'adjustments'>('kontrol_stok');
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const [currentPageKontrol, setCurrentPageKontrol] = useState(1);
  const [currentPageMonthly, setCurrentPageMonthly] = useState(1);

  // Core data states
  const [books, setBooks] = useState<Book[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<InventoryLedgerEntry[]>([]);
  const [damagedRecords, setDamagedRecords] = useState<DamagedStock[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [freightIn, setFreightIn] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);

  // Period / Month selection (defaults to current month)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  });

  // Ledger details drawer state
  const [selectedBookForLedger, setSelectedBookForLedger] = useState<Book | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [bookLedgerEntries, setBookLedgerEntries] = useState<InventoryLedgerEntry[]>([]);

  // Modals state
  const [isDamageModalOpen, setIsDamageModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DamagedStock | null>(null);
  const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<DamagedStock | null>(null);

  // Filters for Penyesuaian tab
  const [adjFilter, setAdjFilter] = useState<'semua' | 'Barang Rusak' | 'Barang Lebih'>('semua');
  const [adjSearchTerm, setAdjSearchTerm] = useState('');

  // Form states for Stock Adjustment
  const [adjustmentType, setAdjustmentType] = useState<'Barang Rusak' | 'Barang Lebih'>('Barang Rusak');
  const [damageBookName, setDamageBookName] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [damageQty, setDamageQty] = useState(''); // Visual string with commas
  const [damageDate, setDamageDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [damageNotes, setDamageNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Toast / System Alert Notification
  const [alertState, setAlertState] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | null }>({
    title: '',
    message: '',
    type: null
  });

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info') => {
    setAlertState({ title, message, type });
    setTimeout(() => {
      setAlertState({ title: '', message: '', type: null });
    }, 4500);
  };


  // Load Realtime Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          catSnap, invSnap, ledgerSnap, damagedSnap,
          journalsSnap, closedSnap, poSnap, freightSnap, soSnap
        ] = await Promise.all([
          getDocs(collection(db, 'catalog')),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'inventoryLedger')),
          getDocs(collection(db, 'damagedStock')),
          getDocs(collection(db, 'journalEntries')),
          getDocs(collection(db, 'closedPeriods')),
          getDocs(collection(db, 'purchaseOrders')),
          getDocs(collection(db, 'freightIn')),
          getDocs(collection(db, 'salesOrders'))
        ]);
        
        // Catalog
        const bList = [];
        catSnap.forEach((d) => bList.push({ id: d.id, ...d.data() }));
        setBooks(bList);

        // Inventory
        const iList = [];
        invSnap.forEach((d) => iList.push(d.data()));
        setInventoryList(iList);

        // Ledger
        const lList = [];
        ledgerSnap.forEach((d) => lList.push(d.data()));
        setLedgerEntries(lList);
        
        // Damaged
        const dList = [];
        damagedSnap.forEach((d) => dList.push(d.data()));
        setDamagedRecords(dList);

        // Journals
        const jList = [];
        journalsSnap.forEach((d) => jList.push({ id: d.id, ...d.data() }));
        setJournals(jList);

        // Closed Periods
        const cpList = [];
        closedSnap.forEach((d) => cpList.push(d.id));
        setClosedPeriods(cpList);

        // POs
        const poList = [];
        poSnap.forEach((d) => poList.push({ id: d.id, ...d.data() }));
        setPurchaseOrders(poList);

        // Freight
        const fList = [];
        freightSnap.forEach((d) => fList.push({ id: d.id, ...d.data() }));
        setFreightIn(fList);

        // SOs
        const soList = [];
        soSnap.forEach((d) => soList.push({ id: d.id, ...d.data() }));
        setSalesOrders(soList);

      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
           console.warn('Quota exceeded while fetching InventoryTab data');
        } else {
           console.error('Error fetching data for InventoryTab:', err);
        }
      }
    };

    loadData();
  }, []);

  // Auto-repair existing damagedStock COA account and journal entries
  useEffect(() => {
    const repairDamagedStockJournals = async () => {
      try {
        // 1. Ensure COA 5500 is named 'Beban Lain-lain'
        const coa5500Ref = doc(db, 'coa', '5500');
        const coa5500Snap = await getDoc(coa5500Ref);
        if (!coa5500Snap.exists() || coa5500Snap.data()?.name !== 'Beban Lain-lain') {
          await setDoc(coa5500Ref, {
            id: '5500',
            code: '5500',
            name: 'Beban Lain-lain',
            type: 'Expenses',
            subType: 'Biaya Umum dan Administrasi',
            isActive: true
          }, { merge: true });
        }

        // 2. Fetch all damagedStock and journalEntries
        const damagedSnap = await getDocs(collection(db, 'damagedStock'));
        const journalsSnap = await getDocs(collection(db, 'journalEntries'));

        if (damagedSnap.empty && journalsSnap.empty) return;

        const batch = writeBatch(db);
        let updatedCount = 0;

        const inventorySnap = await getDocs(collection(db, 'inventory'));
        const inventoryMap = new Map();
        inventorySnap.forEach(doc => inventoryMap.set(doc.id, doc.data()));

        const damagedList: DamagedStock[] = [];
        damagedSnap.forEach((dDoc) => {
          const d = dDoc.data() as any;
          let needsFix = false;
          let newUnitCost = d.unitCost || 0;
          let newTotalCost = d.totalCost || 0;
          let newNotes = d.notes || d.note || '';
          let newAdjustmentType = d.adjustmentType || 'Barang Rusak';
          const qty = d.qty || 0;

          if (d.totalLossNTD !== undefined && d.totalLossNTD > 0 && newTotalCost === 0) {
              newTotalCost = d.totalLossNTD;
              newUnitCost = d.landedCostNTD || (qty > 0 ? d.totalLossNTD / qty : 0);
              needsFix = true;
          }

          if (newTotalCost === 0 && qty > 0) {
              const inv = inventoryMap.get(d.bookId);
              if (inv) {
                  newUnitCost = inv.movingAverageCost || 0;
                  newTotalCost = newUnitCost * qty;
                  needsFix = true;
              }
          }
          
          if (!d.adjustmentType || (d.note && !d.notes)) needsFix = true;

          if (needsFix) {
              batch.update(dDoc.ref, {
                  unitCost: newUnitCost,
                  totalCost: newTotalCost,
                  notes: newNotes,
                  adjustmentType: newAdjustmentType,
                  ...(d.landedCostNTD !== undefined ? { landedCostNTD: deleteField() } : {}),
                  ...(d.totalLossNTD !== undefined ? { totalLossNTD: deleteField() } : {}),
                  ...(d.note !== undefined ? { note: deleteField() } : {})
              });

              batch.set(doc(db, 'inventoryLedger', `LEDGER-${dDoc.id}`), {
                  unitCost: newUnitCost,
                  costPerUnitCents: deleteField()
              }, { merge: true });
              
              d.unitCost = newUnitCost;
              d.totalCost = newTotalCost;
              d.notes = newNotes;
              d.adjustmentType = newAdjustmentType;
              updatedCount++;
          }
          
          damagedList.push(d as DamagedStock);
        });

        journalsSnap.forEach((jDoc) => {
          const jData = jDoc.data() as JournalEntry;
          let needsUpdate = false;
          let newDescription = jData.description || '';
          let newLines = jData.lines ? [...jData.lines] : [];

          // Find if this journal belongs to a damagedStock entry
          const matchedDamaged = damagedList.find(
            (d) => d.journalId === jDoc.id || d.id === jData.refId || d.id === jData.id
          );

          if (matchedDamaged) {
            const isDamage = matchedDamaged.adjustmentType === 'Barang Rusak' || (matchedDamaged as any).type !== 'surplus';
            const rawQty = matchedDamaged.qty || 0;
            const bookName = matchedDamaged.bookName || 'Barang';
            const notes = matchedDamaged.notes || '';
            const totalAmount = (matchedDamaged.totalCost && matchedDamaged.totalCost > 0)
              ? matchedDamaged.totalCost
              : rawQty * (matchedDamaged.unitCost || 0);

            // Format description
            const baseDesc = isDamage
              ? `Barang Rusak - ${bookName} ${rawQty} pcs`
              : `Pendapatan Lain-lain - Barang Lebih - ${bookName} ${rawQty} pcs`;
            const expectedDesc = `${baseDesc}${notes ? ' - ' + notes : ''}`;

            if (jData.description !== expectedDesc) {
              newDescription = expectedDesc;
              needsUpdate = true;
            }

            // Amount from existing journal line if totalAmount is 0
            const existingAmount = totalAmount > 0
              ? totalAmount
              : (jData.lines?.[0]?.debit || jData.lines?.[0]?.credit || jData.lines?.[1]?.debit || jData.lines?.[1]?.credit || 0);

            const expectedLines = isDamage ? [
              { account: 'Beban Lain-lain', accountCode: '5500', debit: existingAmount, credit: 0 },
              { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: existingAmount }
            ] : [
              { account: 'Inventory On Hand', accountCode: '1201', debit: existingAmount, credit: 0 },
              { account: 'Beban Lain-lain', accountCode: '5500', debit: 0, credit: existingAmount }
            ];

            if (JSON.stringify(newLines) !== JSON.stringify(expectedLines)) {
              newLines = expectedLines;
              needsUpdate = true;
            }
          } else {
            // Unmatched journals that mention stock adjustment or damaged stock
            const descLower = (jData.description || '').toLowerCase();
            const isAdjustment = descLower.includes('barang rusak') || descLower.includes('barang lebih') || descLower.includes('penyesuaian stok') || descLower.includes('damaged stock');

            if (isAdjustment && jData.lines && Array.isArray(jData.lines)) {
              const updatedLines = jData.lines.map((l) => {
                if (l.account === 'Beban Kerugian Pembelian' || l.account === 'Beban Barang Rusak' || l.accountCode === '5140') {
                  needsUpdate = true;
                  return { ...l, accountCode: '5500', account: 'Beban Lain-lain' };
                }
                if (l.accountCode === '5500' && l.account !== 'Beban Lain-lain') {
                  needsUpdate = true;
                  return { ...l, account: 'Beban Lain-lain' };
                }
                return l;
              });

              if (needsUpdate) {
                newLines = updatedLines;
              }
            }
          }

          if (needsUpdate) {
            updatedCount++;
            batch.update(jDoc.ref, {
              description: newDescription,
              lines: newLines
            });
          }
        });

        if (updatedCount > 0) {
          await batch.commit();
          console.log(`[DamagedStock Migration] Repaired ${updatedCount} damaged stock journal entries to Beban Lain-lain (5500).`);
        }
      } catch (err) {
        console.error('Error repairing damaged stock journals:', err);
      }
    };

    repairDamagedStockJournals();
  }, []);

  // Keep Book Ledger timeline in sync with updates to ledgerEntries or inventoryList
  useEffect(() => {
    if (!selectedBookForLedger) {
      setBookLedgerEntries([]);
      return;
    }
    
    // Filter to only 'purchase_received', 'COMPLETED_SALE', 'COMPLETED (SALE)', 'DISPATCHED', 'sale_shipped'
    const allowedTypes = ['purchase_received', 'COMPLETED_SALE', 'COMPLETED (SALE)', 'DISPATCHED', 'sale_shipped'];
    const chronological = ledgerEntries
      .filter((e) => {
        if (e.bookId !== selectedBookForLedger.id) return false;
        if (!allowedTypes.includes(e.type)) return false;
        
        const so = salesOrders.find((s) => s.id === e.refId);
        if (e.type === 'DISPATCHED' || e.type === 'sale_shipped') {
          return so !== undefined && (so.status === 'shipped' || so.status === 'dikirim');
        }
        if (e.type === 'COMPLETED_SALE' || e.type === 'COMPLETED (SALE)') {
          return so !== undefined && (so.status === 'completed' || so.status === 'Selesai');
        }
        return true;
      })
      .sort((a, b) => {
        const tA = a.timestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || 0;
        return tA - tB; // oldest first
      });

    const bookInventory = inventoryList.find((i) => i.bookId === selectedBookForLedger.id);
    const initialStock = bookInventory ? bookInventory.initialStock : 0;

    let runningBalance = initialStock;
    const computedEntries = chronological.map((entry) => {
      runningBalance += entry.qtyDelta;
      return {
        ...entry,
        balanceAfter: runningBalance
      };
    });

    // Sort to display: newest first
    computedEntries.sort((a, b) => {
      const tA = a.timestamp?.seconds || 0;
      const tB = b.timestamp?.seconds || 0;
      return tB - tA;
    });

    setBookLedgerEntries(computedEntries);
  }, [selectedBookForLedger, ledgerEntries, inventoryList]);

  // Fetch / Filter Specific Book Ledger timeline on click
  const handleRowClick = (book: Book) => {
    setSelectedBookForLedger(book);
    setIsLedgerOpen(true);
  };

  // Helper date utility - check if timestamp belongs to a specific month
  const isTimestampInMonth = (timestamp: any, monthStr: string): boolean => {
    if (!timestamp) return false;
    let date: Date;
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp && typeof timestamp.seconds === 'number') {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return false;
    
    const [year, month] = monthStr.split('-').map(Number);
    return date.getFullYear() === year && (date.getMonth() + 1) === month;
  };

  // Helper date utility - check if timestamp is strictly before a specific month
  const isTimestampBeforeMonth = (timestamp: any, monthStr: string): boolean => {
    if (!timestamp) return false;
    let date: Date;
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp && typeof timestamp.seconds === 'number') {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return false;
    
    const [year, month] = monthStr.split('-').map(Number);
    const dYear = date.getFullYear();
    const dMonth = date.getMonth() + 1;
    if (dYear < year) return true;
    if (dYear === year && dMonth < month) return true;
    return false;
  };

  // Visual text formatting for Indonesian Months
  const formatMonthYearID = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const monthsID = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const idx = Number(month) - 1;
    return `${monthsID[idx]} ${year}`;
  };

  // Change Month with arrows
  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    let nextYear = year;
    let nextMonth = month - 1;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setSelectedMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setSelectedMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  };

  // Generate 12 months for select dropdown
  const getDropdownMonthsList = () => {
    const list: string[] = [];
    const currentYear = 2026;
    for (let m = 12; m >= 1; m--) {
      list.push(`${currentYear}-${String(m).padStart(2, '0')}`);
    }
    return list;
  };

  // Search filtering logic
  const filteredBooks = books.filter((b) => 
    b && b.bookName && b.bookName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Damaged stock visual formatter
  const handleQtyChange = (val: string) => {
    const clean = val.replace(/[^0-9]/g, '');
    if (clean === '') {
      setDamageQty('');
      return;
    }
    setDamageQty(Number(clean).toLocaleString('en-US'));
  };

  const handleOpenAddModal = () => {
    setEditingRecord(null);
    setAdjustmentType('Barang Rusak');
    setDamageBookName('');
    setDamageQty('');
    setDamageDate(() => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    });
    setDamageNotes('');
    setFormError('');
    setFormSuccess('');
    setIsDamageModalOpen(true);
  };

  const handleOpenEditModal = (record: DamagedStock) => {
    if (isPeriodClosed(record.date, closedPeriods)) {
      showAlert('Periode Terkunci', `Transaksi pada periode ${record.date.substring(0, 7)} telah ditutup dan tidak dapat diubah.`, 'error');
      return;
    }
    setEditingRecord(record);
    setAdjustmentType(record.adjustmentType || 'Barang Rusak');
    setDamageBookName(record.bookName || '');
    setDamageQty((record.qty || 0).toLocaleString('en-US'));
    setDamageDate(record.date || '');
    setDamageNotes(record.notes || '');
    setFormError('');
    setFormSuccess('');
    setIsDamageModalOpen(true);
  };

  const handleOpenDeleteModal = (record: DamagedStock) => {
    if (isPeriodClosed(record.date, closedPeriods)) {
      showAlert('Periode Terkunci', `Transaksi pada periode ${record.date.substring(0, 7)} telah ditutup dan tidak dapat dihapus.`, 'error');
      return;
    }
    setRecordToDelete(record);
    setIsConfirmDeleteOpen(true);
  };

  const handleSaveNotesOnly = async () => {
    if (!editingRecord) return;
    try {
      const batch = writeBatch(db);
      const damagedRef = doc(db, 'damagedStock', editingRecord.id);
      batch.update(damagedRef, {
        notes: damageNotes,
        updatedAt: Timestamp.now()
      });

      if (editingRecord.journalId) {
        const isDamage = editingRecord.adjustmentType === 'Barang Rusak';
        const baseDesc = isDamage
          ? `${editingRecord.adjustmentType} - ${editingRecord.bookName} ${editingRecord.qty} pcs`
          : `Pendapatan Lain-lain - ${editingRecord.adjustmentType} - ${editingRecord.bookName} ${editingRecord.qty} pcs`;
        const newJournalDesc = `${baseDesc}${damageNotes ? ' - ' + damageNotes : ''}`;

        const journalRef = doc(db, 'journalEntries', editingRecord.journalId);
        batch.update(journalRef, {
          description: newJournalDesc
        });
      }

      await batch.commit();
      setFormSuccess('Catatan penyesuaian berhasil diperbarui!');
      showAlert('Berhasil', 'Catatan penyesuaian berhasil diperbarui.', 'success');
      setTimeout(() => {
        setIsDamageModalOpen(false);
        setEditingRecord(null);
        setFormSuccess('');
      }, 800);
    } catch (err: any) {
      console.error('Error updating notes:', err);
      setFormError('Gagal memperbarui catatan.');
    }
  };

  const handleExecuteEditSubmit = async () => {
    if (!editingRecord) return;
    setIsEditConfirmOpen(false);

    try {
      await ensureAutoAccountExists({ code: '5500', name: 'Beban Lain-lain', type: 'Expenses', subType: 'Biaya Umum dan Administrasi' });
      await ensureAutoAccountExists({ code: '1201', name: 'Inventory On Hand', type: 'Assets', subType: 'Aset Persediaan' });

      const rawQty = Number(damageQty.replace(/,/g, ''));
      const trimmedBookName = damageBookName.trim();
      const book = books.find((b) => b.id === trimmedBookName || b.bookName.toLowerCase() === trimmedBookName.toLowerCase());
      const targetBookId = book ? book.id : `MANUAL-${Date.now()}`;
      const targetBookName = book ? book.bookName : trimmedBookName;

      const bookInventory = book ? inventoryList.find((i) => i.bookId === book.id) : null;
      const movingAverageCost = (bookInventory && bookInventory.movingAverageCost > 0) ? bookInventory.movingAverageCost : (book ? (book.priceNTD || 0) : 0);

      const batch = writeBatch(db);

      // 1. Revert old record stock effect
      const oldBookInventory = inventoryList.find((i) => i.bookId === editingRecord.bookId);
      const oldEnding = oldBookInventory ? oldBookInventory.endingStock : 0;
      const oldReady = getCurrentKontrolStokForBook(editingRecord.bookId, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);
      const oldAvgCost = oldBookInventory ? oldBookInventory.movingAverageCost : 0;

      const oldIsSurplus = editingRecord.adjustmentType === 'Barang Lebih' || (editingRecord as any).type === 'surplus';
      const oldQtyRevert = oldIsSurplus ? -editingRecord.qty : editingRecord.qty;

      const revertedEnding = oldEnding + oldQtyRevert;
      const revertedReady = oldReady + oldQtyRevert;
      const revertedValue = Math.max(0, revertedEnding * oldAvgCost);

      const oldInvRef = doc(db, 'inventory', editingRecord.bookId);
      batch.set(oldInvRef, {
        endingStock: revertedEnding,
        readyStock: revertedReady,
        totalInventoryValue: revertedValue,
        stockStatus: revertedEnding > 0 ? 'in_stock' : 'sold_out',
        lastUpdated: Timestamp.now()
      }, { merge: true });

      batch.delete(doc(db, 'inventoryLedger', `LEDGER-${editingRecord.id}`));
      if (editingRecord.journalId) {
        batch.delete(doc(db, 'journalEntries', editingRecord.journalId));
      }

      // 2. Apply new record stock effect
      const isDamage = adjustmentType === 'Barang Rusak';
      const newQtyChange = isDamage ? -rawQty : rawQty;
      const baseEnding = (editingRecord.bookId === targetBookId) ? revertedEnding : (bookInventory ? bookInventory.endingStock : 0);
      const baseReady = (editingRecord.bookId === targetBookId) ? revertedReady : getCurrentKontrolStokForBook(targetBookId, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);

      const nextEnding = baseEnding + newQtyChange;
      const nextReady = baseReady + newQtyChange;
      const nextValue = Math.max(0, nextEnding * movingAverageCost);

      const newInvRef = doc(db, 'inventory', targetBookId);
      batch.set(newInvRef, {
        endingStock: nextEnding,
        readyStock: nextReady,
        totalInventoryValue: nextValue,
        stockStatus: nextEnding > 0 ? 'in_stock' : 'sold_out',
        lastUpdated: Timestamp.now()
      }, { merge: true });

      // 3. Update damagedStock document
      const totalAmount = rawQty * movingAverageCost;
      const newJournalId = await getNextJournalId(damageDate);
      const damagedRef = doc(db, 'damagedStock', editingRecord.id);

      const docNoToUse = editingRecord.docNo || (() => {
        const dateClean = damageDate.replace(/-/g, '').slice(2);
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        return `PS${dateClean}${randomSuffix}`;
      })();

      batch.set(damagedRef, {
        id: editingRecord.id,
        docNo: docNoToUse,
        adjustmentType: adjustmentType,
        bookId: targetBookId,
        bookName: targetBookName,
        qty: rawQty,
        date: damageDate,
        notes: damageNotes,
        unitCost: movingAverageCost,
        totalCost: totalAmount,
        journalId: newJournalId,
        updatedAt: Timestamp.now()
      }, { merge: true });

      // 4. Create new ledger entry
      const ledgerRef = doc(db, 'inventoryLedger', `LEDGER-${editingRecord.id}`);
      batch.set(ledgerRef, {
        id: `LEDGER-${editingRecord.id}`,
        bookId: targetBookId,
        type: isDamage ? 'damaged_stock' : 'stock_surplus',
        qtyDelta: newQtyChange,
        unitCost: movingAverageCost,
        refCollection: 'damagedStock',
        refId: editingRecord.id,
        balanceAfter: nextEnding,
        movingAvgAfter: movingAverageCost,
        timestamp: Timestamp.fromDate(new Date(damageDate)),
        userId: profile?.email || 'system'
      } as InventoryLedgerEntry);

      // 5. Create new journal entry
      const baseDesc = isDamage
        ? `${adjustmentType} - ${targetBookName} ${rawQty} pcs`
        : `Pendapatan Lain-lain - ${adjustmentType} - ${targetBookName} ${rawQty} pcs`;
      const journalDescription = `${baseDesc}${damageNotes ? ' - ' + damageNotes : ''}`;

      const journalLines = isDamage ? [
        { account: 'Beban Lain-lain', accountCode: '5500', debit: totalAmount, credit: 0 },
        { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: totalAmount }
      ] : [
        { account: 'Inventory On Hand', accountCode: '1201', debit: totalAmount, credit: 0 },
        { account: 'Beban Lain-lain', accountCode: '5500', debit: 0, credit: totalAmount }
      ];

      const journalRef = doc(db, 'journalEntries', newJournalId);
      batch.set(journalRef, {
        id: newJournalId,
        date: Timestamp.fromDate(new Date(damageDate)),
        description: journalDescription,
        lines: journalLines,
        refType: 'System',
        refId: editingRecord.id,
        createdAt: Timestamp.now()
      } as JournalEntry);

      await batch.commit();

      showAlert('Berhasil Diubah', 'Penyesuaian stok berhasil diperbarui, stok disesuaikan, dan jurnal baru diposting.', 'success');
      setIsDamageModalOpen(false);
      setEditingRecord(null);
    } catch (err: any) {
      console.error('Error updating adjustment:', err);
      setFormError('Gagal memperbarui penyesuaian stok.');
      showAlert('Gagal Menyimpan', 'Terjadi kesalahan saat memproses perubahan.', 'error');
    }
  };

  // Submit Stock Adjustment logic
  const handleAddDamageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!adjustmentType) {
      setFormError('Pilih Jenis Penyesuaian.');
      return;
    }

    const trimmedBookName = damageBookName.trim();
    if (!trimmedBookName) {
      setFormError('Isi Nama Barang terlebih dahulu.');
      return;
    }

    const rawQty = Number(damageQty.replace(/,/g, ''));
    if (isNaN(rawQty) || rawQty <= 0) {
      setFormError('Jumlah Qty harus berupa angka positif.');
      return;
    }

    if (!damageDate) {
      setFormError('Silakan pilih tanggal.');
      return;
    }

    // Check closed period lock
    const transactionPeriod = damageDate.substring(0, 7); // "YYYY-MM"
    if (closedPeriods.includes(transactionPeriod)) {
      setFormError(`Periode ${transactionPeriod} telah ditutup dan dikunci. Transaksi tidak dapat diproses.`);
      return;
    }

    // Handle Edit Mode
    if (editingRecord) {
      const origPeriod = editingRecord.date.substring(0, 7);
      if (closedPeriods.includes(origPeriod)) {
        setFormError(`Periode asal (${origPeriod}) telah ditutup dan dikunci.`);
        return;
      }

      const isOnlyNotesChanged =
        editingRecord.adjustmentType === adjustmentType &&
        editingRecord.bookName.trim().toLowerCase() === trimmedBookName.toLowerCase() &&
        editingRecord.qty === rawQty &&
        editingRecord.date === damageDate;

      if (isOnlyNotesChanged) {
        await handleSaveNotesOnly();
        return;
      }

      setIsEditConfirmOpen(true);
      return;
    }

    // Handle Create Mode
    const book = books.find((b) => b.id === trimmedBookName || b.bookName.toLowerCase() === trimmedBookName.toLowerCase());
    const targetBookId = book ? book.id : `MANUAL-${Date.now()}`;
    const targetBookName = book ? book.bookName : trimmedBookName;

    const bookInventory = book ? inventoryList.find((i) => i.bookId === book.id) : null;
    const movingAverageCost = (bookInventory && bookInventory.movingAverageCost > 0) ? bookInventory.movingAverageCost : (book ? (book.priceNTD || 0) : 0);
    const currentPhysical = book ? getPhysicalOnHandStockForBook(book.id, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords) : 0;
    const currentReady = book ? getCurrentKontrolStokForBook(book.id, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords) : 0;
    const currentEnding = bookInventory ? bookInventory.endingStock : 0;

    const isDamage = adjustmentType === 'Barang Rusak';

    if (isDamage && book && currentPhysical < rawQty) {
      setFormError(`Stok di gudang tidak mencukupi. Stok di gudang saat ini: ${currentPhysical} pcs, jumlah rusak: ${rawQty} pcs.`);
      return;
    }

    try {
      await ensureAutoAccountExists({
        code: '5500',
        name: 'Beban Lain-lain',
        type: 'Expenses',
        subType: 'Biaya Umum dan Administrasi'
      });
      await ensureAutoAccountExists({
        code: '1201',
        name: 'Inventory On Hand',
        type: 'Assets',
        subType: 'Aset Persediaan'
      });

      const batch = writeBatch(db);

      const damagedId = doc(collection(db, 'damagedStock')).id;
      const journalId = await getNextJournalId(damageDate);
      const ledgerId = `LEDGER-${damagedId}`;

      const dateClean = damageDate.replace(/-/g, '').slice(2);
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const docNo = `PS${dateClean}${randomSuffix}`;

      const qtyChange = isDamage ? -rawQty : rawQty;
      const nextEndingStock = currentEnding + qtyChange;
      const nextKontrolStok = currentReady + qtyChange;
      const nextValue = Math.max(0, nextEndingStock * movingAverageCost);

      const invRef = doc(db, 'inventory', targetBookId);
      batch.set(invRef, {
        bookId: targetBookId,
        initialStock: bookInventory ? bookInventory.initialStock : 0,
        totalPurchased: bookInventory ? bookInventory.totalPurchased : 0,
        totalDispatched: bookInventory ? bookInventory.totalDispatched : 0,
        endingStock: nextEndingStock,
        readyStock: nextKontrolStok,
        inTransitStock: bookInventory ? bookInventory.inTransitStock : 0,
        ordersPlaced: bookInventory ? bookInventory.ordersPlaced : 0,
        ordersShipped: bookInventory ? bookInventory.ordersShipped : 0,
        movingAverageCost,
        totalInventoryValue: nextValue,
        stockStatus: nextEndingStock > 0 ? 'in_stock' : 'sold_out',
        lastUpdated: Timestamp.now()
      }, { merge: true });

      const ledgerRef = doc(db, 'inventoryLedger', ledgerId);
      batch.set(ledgerRef, {
        id: ledgerId,
        bookId: targetBookId,
        type: isDamage ? 'damaged_stock' : 'stock_surplus',
        qtyDelta: qtyChange,
        unitCost: movingAverageCost,
        refCollection: 'damagedStock',
        refId: damagedId,
        balanceAfter: nextEndingStock,
        movingAvgAfter: movingAverageCost,
        timestamp: Timestamp.fromDate(new Date(damageDate)),
        userId: profile?.email || 'system'
      } as InventoryLedgerEntry);

      const totalAmount = rawQty * movingAverageCost;
      const damagedRef = doc(db, 'damagedStock', damagedId);
      batch.set(damagedRef, {
        id: damagedId,
        docNo: docNo,
        adjustmentType: adjustmentType,
        bookId: targetBookId,
        bookName: targetBookName,
        qty: rawQty,
        date: damageDate,
        notes: damageNotes,
        unitCost: movingAverageCost,
        totalCost: totalAmount,
        journalId: journalId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      const baseDesc = isDamage
        ? `${adjustmentType} - ${targetBookName} ${rawQty} pcs`
        : `Pendapatan Lain-lain - ${adjustmentType} - ${targetBookName} ${rawQty} pcs`;
      const journalDescription = `${baseDesc}${damageNotes ? ' - ' + damageNotes : ''}`;

      const journalLines = isDamage ? [
        { account: 'Beban Lain-lain', accountCode: '5500', debit: totalAmount, credit: 0 },
        { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: totalAmount }
      ] : [
        { account: 'Inventory On Hand', accountCode: '1201', debit: totalAmount, credit: 0 },
        { account: 'Beban Lain-lain', accountCode: '5500', debit: 0, credit: totalAmount }
      ];

      const journalRef = doc(db, 'journalEntries', journalId);
      batch.set(journalRef, {
        id: journalId,
        date: Timestamp.fromDate(new Date(damageDate)),
        description: journalDescription,
        lines: journalLines,
        refType: 'System',
        refId: damagedId,
        createdAt: Timestamp.now()
      } as JournalEntry);

      await batch.commit();

      setFormSuccess(`Penyesuaian stok (${adjustmentType}) berhasil diproses!`);
      showAlert('Transaksi Berhasil', `Penyesuaian stok (${adjustmentType}) berhasil dan jurnal terposting otomatis.`, 'success');

      setTimeout(() => {
        setIsDamageModalOpen(false);
        setEditingRecord(null);
        setAdjustmentType('Barang Rusak');
        setDamageBookName('');
        setDamageQty('');
        setDamageNotes('');
        setFormSuccess('');
      }, 1000);

    } catch (error) {
      console.error(error);
      setFormError('Gagal menyimpan penyesuaian ke database.');
      showAlert('Gagal Menyimpan', 'Terjadi kesalahan internal Firestore.', 'error');
    }
  };

  // Revert/Delete Stock Adjustment logic
  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;

    // Check closed period lock
    const transactionPeriod = recordToDelete.date.substring(0, 7);
    if (closedPeriods.includes(transactionPeriod)) {
      showAlert('Periode Ditutup', `Transaksi di periode ${transactionPeriod} tidak dapat dihapus karena telah dikunci.`, 'error');
      setIsConfirmDeleteOpen(false);
      setRecordToDelete(null);
      return;
    }

    try {
      const batch = writeBatch(db);

      const bookInventory = inventoryList.find((i) => i.bookId === recordToDelete.bookId);
      const currentEnding = bookInventory ? bookInventory.endingStock : 0;
      const currentReady = getCurrentKontrolStokForBook(recordToDelete.bookId, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);
      const movingAverageCost = bookInventory ? bookInventory.movingAverageCost : 0;

      const isSurplus = recordToDelete.adjustmentType === 'Barang Lebih' || (recordToDelete as any).type === 'surplus';
      const qtyRevert = isSurplus ? -recordToDelete.qty : recordToDelete.qty;

      // 1. Restore Inventory
      const nextEndingStock = currentEnding + qtyRevert;
      const nextKontrolStok = currentReady + qtyRevert;
      const nextValue = Math.max(0, nextEndingStock * movingAverageCost);

      const invRef = doc(db, 'inventory', recordToDelete.bookId);
      batch.set(invRef, {
        endingStock: nextEndingStock,
        readyStock: nextKontrolStok,
        totalInventoryValue: nextValue,
        stockStatus: nextEndingStock > 0 ? 'in_stock' : 'sold_out',
        lastUpdated: Timestamp.now()
      }, { merge: true });

      // 2. Delete damaged stock record
      batch.delete(doc(db, 'damagedStock', recordToDelete.id));

      // 3. Delete corresponding ledger entry
      batch.delete(doc(db, 'inventoryLedger', `LEDGER-${recordToDelete.id}`));

      // 4. Delete corresponding auto-journal entry
      if (recordToDelete.journalId) {
        batch.delete(doc(db, 'journalEntries', recordToDelete.journalId));
      }

      await batch.commit();

      showAlert('Berhasil Dibatalkan', `Penyesuaian stok berhasil dibatalkan, stok ${recordToDelete.bookName} telah dikembalikan.`, 'success');
    } catch (error) {
      console.error(error);
      showAlert('Gagal Dibatalkan', 'Terjadi kesalahan saat membatalkan penyesuaian stok.', 'error');
    } finally {
      setIsConfirmDeleteOpen(false);
      setRecordToDelete(null);
    }
  };

  // Helper to retrieve the Kode Freight-in value from a purchase order record
  const getKodeFreightIn = (po: any): string => {
    if (!po) return '';
    if (typeof po.kodeEkspedisi === 'string') {
      return po.kodeEkspedisi.toUpperCase();
    }
    if (!po.receipts || po.receipts.length === 0) return '';
    const withField = po.receipts.find((r: any) => r.kodeEkspedisi);
    if (withField && withField.kodeEkspedisi) {
      return withField.kodeEkspedisi;
    }
    for (const r of po.receipts) {
      if (r.notes) {
        const matchFreight = r.notes.match(/Freight-in:\s*([^\s\]\n]+)/i);
        if (matchFreight && matchFreight[1]) return matchFreight[1].toUpperCase();
        const matchResi = r.notes.match(/Resi:\s*([^\s\]\n]+)/i);
        if (matchResi && matchResi[1]) return matchResi[1].toUpperCase();
        const matchKode = r.notes.match(/\[Kode\s+Freight-in:\s*([^\]\n]+)\]/i);
        if (matchKode && matchKode[1]) return matchKode[1].toUpperCase();
        const matchKodeOld = r.notes.match(/\[Kode\s+Ekspedisi:\s*([^\]\n]+)\]/i);
        if (matchKodeOld && matchKodeOld[1]) return matchKodeOld[1].toUpperCase();
      }
    }
    return '';
  };

  const getPoFreightCodes = (po: any): string[] => {
    if (!po) return [];
    const codesSet = new Set<string>();
    if (typeof po.kodeEkspedisi === 'string' && po.kodeEkspedisi.trim()) {
      codesSet.add(po.kodeEkspedisi.trim().toUpperCase());
    }
    if (po.receipts && Array.isArray(po.receipts)) {
      po.receipts.forEach((r: any) => {
        if (typeof r.kodeEkspedisi === 'string' && r.kodeEkspedisi.trim()) {
          codesSet.add(r.kodeEkspedisi.trim().toUpperCase());
        }
        if (r.notes) {
          const matchFreight = r.notes.match(/Freight-in:\s*([^\s\]\n]+)/i);
          if (matchFreight && matchFreight[1]) codesSet.add(matchFreight[1].trim().toUpperCase());
          const matchResi = r.notes.match(/Resi:\s*([^\s\]\n]+)/i);
          if (matchResi && matchResi[1]) codesSet.add(matchResi[1].trim().toUpperCase());
          const matchKode = r.notes.match(/\[Kode\s+Freight-in:\s*([^\]\n]+)\]/i);
          if (matchKode && matchKode[1]) codesSet.add(matchKode[1].trim().toUpperCase());
          const matchKodeOld = r.notes.match(/\[Kode\s+Ekspedisi:\s*([^\]\n]+)\]/i);
          if (matchKodeOld && matchKodeOld[1]) codesSet.add(matchKodeOld[1].trim().toUpperCase());
        }
      });
    }
    return Array.from(codesSet).filter(Boolean);
  };

  const getBookQtyInReceipt = (po: any, r: any, bookId: string): number => {
    if (!r.receivedQtyDetails) {
      const poBookId = po.bookId || '';
      if (poBookId === bookId) {
        return r.receivedQty || 0;
      }
      return 0;
    }
    const detail = r.receivedQtyDetails.find((d: any) => d.bookId === bookId);
    return detail ? detail.qty || 0 : 0;
  };

  const getPoTotalItemsReceived = (po: any): number => {
    if (!po) return 0;
    let count = 0;
    if (po.items && po.items.length > 0) {
      po.items.forEach((it: any) => {
        count += (it.qtyReceived || 0);
      });
    } else {
      count += (po.qtyReceived || 0);
    }
    return count;
  };

  const parseEventDate = (timestamp: any): Date => {
    if (!timestamp) return new Date(0);
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000);
    return new Date(timestamp);
  };

  const getCapitalizationTimestamp = (fRec: any, journalsList: any[]) => {
    if (fRec.capitalizationJournalId) {
      const j = journalsList.find(x => x.id === fRec.capitalizationJournalId);
      if (j && j.date) return j.date;
    }
    return fRec.createdAt || Timestamp.now();
  };

  interface PerpetualState {
    runningStock: number;
    runningValueCents: number;
    currentAverageCost: number;
  }

  const calculatePerpetualInventoryState = (bookId: string, upToMonthStr?: string, includeDispatchedAsOutflow: boolean = false): PerpetualState => {
    const bookInventory = inventoryList.find(i => i.bookId === bookId);
    const initialStock = bookInventory ? (bookInventory.initialStock || 0) : 0;
    const initialCost = 0; // MUST be calculated from actual journals, not cache
    
    let runningStock = initialStock;
    let runningValueCents = initialStock * initialCost;
    let currentAverageCost = initialCost;

    let endOfMonth: Date | null = null;
    if (upToMonthStr) {
      const [year, month] = upToMonthStr.split('-').map(Number);
      endOfMonth = new Date(year, month, 1); // Next month start, exclusive
    }

    // 1. PO Receipts (Barang Masuk) - from actual inventory ledger, not cached PO receipts
    const poReceiptEvents = ledgerEntries
      .filter(e => e.bookId === bookId && e.type === 'purchase_received' && e.reversed !== true)
      .map(entry => {
        let cost = 0;
        if (entry.unitCost !== undefined && entry.unitCost !== null && entry.unitCost > 0) {
          cost = (entry.qtyDelta || 0) * entry.unitCost;
        } else {
          const po = purchaseOrders.find(p => p.id === entry.refId);
          if (po) {
            if (po.items && po.items.length > 0) {
              const poItem = po.items.find((it: any) => it.bookId === bookId);
              if (poItem) {
                const discount = po.discount || 0;
                const totalQtyOrdered = po.items.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
                const diskon_per_buku = discount * ((poItem.qty || 0) / totalQtyOrdered);
                const netItemPriceNTDTotal = (poItem.priceNTDTotal || 0) - diskon_per_buku;
                const netUnitCost = poItem.qty > 0 ? (netItemPriceNTDTotal / poItem.qty) : (poItem.pricePerItem || 0);
                cost = (entry.qtyDelta || 0) * netUnitCost;
              } else {
                cost = (entry.qtyDelta || 0) * (entry.unitCost || 0);
              }
            } else {
              // Legacy PO: po.purchasePriceNTD is already net!
              const netUnitCost = po.qty > 0 ? (po.purchasePriceNTD / po.qty) : (po.pricePerUnitNTD || 0);
              cost = (entry.qtyDelta || 0) * netUnitCost;
            }
          } else {
            cost = (entry.qtyDelta || 0) * (entry.unitCost || 0);
          }
        }
        return {
          type: 'purchase_received',
          timestamp: entry.timestamp,
          qtyDelta: entry.qtyDelta || 0,
          cost: cost,
          refId: entry.refId,
          id: entry.id
        };
      });

    // 2. Freight Capitalization (Freight Dikapitalisasi)
    const bookPos = purchaseOrders.filter(p => 
      p.status !== 'cancelled' && 
      p.receipts && p.receipts.length > 0 &&
      (p.bookId === bookId || (p.items && p.items.some((it: any) => it.bookId === bookId)))
    );

    const isFreightCodeCapitalized = (fCode: string): boolean => {
      const cleanFCode = fCode.toUpperCase().trim();
      const fRecord = freightIn.find(f => f.freightCode?.toUpperCase().trim() === cleanFCode);
      if (fRecord && fRecord.isCapitalized) return true;
      return journals.some(j => 
        (j.freightCode?.toUpperCase() === cleanFCode || j.refId?.toUpperCase() === cleanFCode) &&
        (j.description || '').toUpperCase().includes('KAPITALISASI')
      );
    };

    const freightCapitalizationEvents: any[] = [];
    freightIn.forEach(fRec => {
      if (!fRec.freightCode) return;
      if (!isFreightCodeCapitalized(fRec.freightCode)) return;

      const fCode = fRec.freightCode.toUpperCase().trim();

      // Total received qty for all books under this freight code
      let totalQtyReceivedInFreight = 0;
      purchaseOrders.forEach(p => {
        if (p.receipts && p.receipts.length > 0) {
          p.receipts.forEach((rx: any) => {
            if (rx.kodeEkspedisi && rx.kodeEkspedisi.toUpperCase().trim() === fCode) {
              totalQtyReceivedInFreight += rx.receivedQty || 0;
            }
          });
        } else if (p.kodeEkspedisi && p.kodeEkspedisi.toUpperCase().trim() === fCode) {
          totalQtyReceivedInFreight += p.qtyReceived || p.qty || 0;
        }
      });

      if (totalQtyReceivedInFreight <= 0) return;

      const totalFreightNTDCents = fRec.totalHargaPengirimanNTD 
        ? Math.round(fRec.totalHargaPengirimanNTD * 100) 
        : Math.round((fRec.totalKg || 0) * (fRec.ratePerKg || 0) * (fRec.exchangeRate || FALLBACK_NTD_PER_IDR) * 100);

      // Now find each receipt batch of our book under this freight
      bookPos.forEach(po => {
        po.receipts.forEach((r: any) => {
          if (r.kodeEkspedisi && r.kodeEkspedisi.toUpperCase().trim() === fCode) {
            const qtyReceived = getBookQtyInReceipt(po, r, bookId);
            if (qtyReceived > 0) {
              const freightAllocatedCents = Math.round((qtyReceived / totalQtyReceivedInFreight) * totalFreightNTDCents);
              const timestamp = getCapitalizationTimestamp(fRec, journals);

              freightCapitalizationEvents.push({
                type: 'freight_capitalized',
                timestamp: timestamp,
                freightCode: fRec.freightCode,
                freightAllocatedCents: freightAllocatedCents
              });
            }
          }
        });
      });
    });

    // 3. Outflows (Sales and Damaged Stock)
    const activeSalesOrders = salesOrders.filter(so => {
      if (so.status !== 'completed') return false;
      return so.items && so.items.some((it: any) => it.bookId === bookId);
    });

    // Value only actually leaves the 1201+1202 pool when the sale is confirmed 'completed' (Dr HPP
    // / Cr 1202) - dispatch (Dr 1202 / Cr 1201) is just an internal transfer that keeps the combined
    // balance unchanged. Use that completed-journal date as the outflow timestamp so the value
    // reduction lands in the same month the journal actually posted it. Falls back to the dispatch
    // ledger timestamp, then orderDate/createdAt, if no completed COGS journal exists yet (legacy data).
    const dispatchedLedgerEntries = ledgerEntries.filter(e => e.bookId === bookId && e.type === 'DISPATCHED' && e.reversed !== true);
    const completedCogsJournals = journals.filter(j => j.refType === 'sales_order_completed' && (j.lines || []).some((l: any) => (l.accountCode || '').trim() === '1202'));

    const salesOutflows = activeSalesOrders.map(so => {
      const item = so.items.find((it: any) => it.bookId === bookId);
      const qty = item?.qty || 0;
      const completedJournal = completedCogsJournals.find(j => j.refId === so.id);
      const dispatchEntry = dispatchedLedgerEntries.find(e => e.refId === so.id);
      return {
        type: 'outflow',
        timestamp: completedJournal ? completedJournal.date : (dispatchEntry ? dispatchEntry.timestamp : (so.orderDate || so.createdAt)),
        qtyDelta: qty,
        refId: so.id,
        id: so.id
      };
    });

    const damagedOutflows = ledgerEntries
      .filter(e => e.bookId === bookId && e.reversed !== true && e.type === 'damaged_stock')
      .map(entry => ({
        type: 'outflow',
        timestamp: entry.timestamp,
        qtyDelta: Math.abs(entry.qtyDelta || 0),
        refId: entry.refId,
        id: entry.id
      }));

    const outflowEvents = [...salesOutflows, ...damagedOutflows];

    // Combine and sort chronologically
    const allEvents = [...poReceiptEvents, ...freightCapitalizationEvents, ...outflowEvents];

    allEvents.sort((a, b) => {
      const dateA = parseEventDate(a.timestamp).getTime();
      const dateB = parseEventDate(b.timestamp).getTime();
      if (dateA !== dateB) return dateA - dateB;

      const getOrder = (type: string) => {
        if (type === 'purchase_received') return 1;
        if (type === 'freight_capitalized') return 2;
        return 3; // outflow
      };
      return getOrder(a.type) - getOrder(b.type);
    });

    // Process one by one
    for (const event of allEvents) {
      if (endOfMonth && parseEventDate(event.timestamp) >= endOfMonth) {
        break;
      }

      if (event.type === 'purchase_received') {
        runningStock += event.qtyDelta;
        runningValueCents += event.cost;
        if (runningStock > 0) {
          currentAverageCost = runningValueCents / runningStock;
        } else {
          currentAverageCost = 0;
        }
      } 
      else if (event.type === 'freight_capitalized') {
        runningValueCents += event.freightAllocatedCents;
        if (runningStock > 0) {
          currentAverageCost = runningValueCents / runningStock;
        } else {
          currentAverageCost = 0;
        }
      } 
      else if (event.type === 'outflow') {
        const hppCents = event.qtyDelta * currentAverageCost;
        runningStock = Math.max(0, runningStock - event.qtyDelta);
        runningValueCents = Math.max(0, runningValueCents - hppCents);
      }
    }

    return {
      runningStock,
      runningValueCents,
      currentAverageCost
    };
  };

  const calculateEndingLedgerBalanceForBook = (bookId: string, upToMonthStr: string): number => {
    return calculatePerpetualInventoryState(bookId, upToMonthStr).runningValueCents;
  };

  // Monthly Report calculations
  const reportRows = React.useMemo(() => books.map((book) => {
    const bookInventory = inventoryList.find((i) => i.bookId === book.id);

    // Get previous month string
    const [y, m] = selectedMonth.split('-').map(Number);
    let prevMonthStr = '';
    if (m === 1) {
      prevMonthStr = `${y - 1}-12`;
    } else {
      prevMonthStr = `${y}-${String(m - 1).padStart(2, '0')}`;
    }

    const stateAtPrevMonth = calculatePerpetualInventoryState(book.id, prevMonthStr);
    const stateAtSelectedMonth = calculatePerpetualInventoryState(book.id, selectedMonth);

    const stokAwal = stateAtPrevMonth.runningStock;
    const stokAkhir = stateAtSelectedMonth.runningStock;
    const totalNilaiStok = stateAtSelectedMonth.runningValueCents;
    const hargaRataRata = stateAtSelectedMonth.currentAverageCost;

    // Monthly activities
    const currentMonthEntries = ledgerEntries.filter((e) => e.bookId === book.id && isTimestampInMonth(e.timestamp, selectedMonth));
    const stokMasuk = currentMonthEntries
      .filter((e) => e.type === 'purchase_received' && purchaseOrders.some((p) => p.id === e.refId))
      .reduce((acc, cur) => acc + (cur.qtyDelta || 0), 0);

    const dispatchedThisMonth = currentMonthEntries.filter((e) => e.type === 'DISPATCHED');
    const stokKeluar = salesOrders
      .filter((so) => {
        if (so.status !== 'completed') return false;
        const completedJournal = journals.find((j) => j.refType === 'sales_order_completed' && j.refId === so.id && (j.lines || []).some((l: any) => (l.accountCode || '').trim() === '1202'));
        if (completedJournal) return isTimestampInMonth(completedJournal.date, selectedMonth);
        const dispatchEntry = dispatchedThisMonth.find((e) => e.refId === so.id);
        if (dispatchEntry) return true;
        const hasAnyDispatchEntry = ledgerEntries.some((e) => e.bookId === book.id && e.type === 'DISPATCHED' && e.refId === so.id);
        if (hasAnyDispatchEntry) return false; // dispatched, but in a different month
        const ts = so.orderDate || so.createdAt; // legacy fallback: no dispatch ledger entry at all
        return ts && isTimestampInMonth(ts, selectedMonth);
      })
      .reduce((acc, so) => {
        const item = so.items?.find((i: any) => i.bookId === book.id);
        return acc + (item?.qty || 0);
      }, 0);

    const rusak = damagedRecords
      .filter((rec) => rec.bookId === book.id && rec.date && rec.date.startsWith(selectedMonth))
      .reduce((acc, cur) => acc + (cur.qty || 0), 0);

    return {
      book,
      hargaRataRata,
      stokAwal,
      stokMasuk,
      stokKeluar,
      rusak,
      stokAkhir,
      totalNilaiStok,
      minStock: book.minOrder || 0
    };
  }), [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords, selectedMonth]);

  // Monthly report table sort state
  const [sortFieldMonthly, setSortFieldMonthly] = useState<string>('status');
  const [sortDirectionMonthly, setSortDirectionMonthly] = useState<'asc' | 'desc'>('asc');

  const handleSortMonthly = (field: string) => {
    if (sortFieldMonthly === field) {
      setSortDirectionMonthly((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortFieldMonthly(field);
      setSortDirectionMonthly('asc');
    }
    setCurrentPageMonthly(1);
  };

  const getMonthlyStatusRank = (stokAkhir: number, minStock: number) => {
    if (stokAkhir <= 0) return 2; // Habis (Sold)
    if (stokAkhir < minStock) return 1; // Di Bawah Batas
    return 0; // Aman (In-Stock)
  };

  // Calculate sorted & filtered Report rows
  const sortedReportRows = React.useMemo(() => {
    const filtered = reportRows.filter(
      (row) => row.book && row.book.bookName && row.book.bookName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      let result = 0;

      if (sortFieldMonthly === 'status') {
        const rankA = getMonthlyStatusRank(a.stokAkhir, a.minStock);
        const rankB = getMonthlyStatusRank(b.stokAkhir, b.minStock);
        result = rankA - rankB;
        if (result === 0) {
          result = b.stokAkhir - a.stokAkhir || (a.book?.bookName || '').localeCompare(b.book?.bookName || '');
        }
      } else if (sortFieldMonthly === 'bookName') {
        result = (a.book?.bookName || '').localeCompare(b.book?.bookName || '');
      } else if (sortFieldMonthly === 'hargaRataRata') {
        result = a.hargaRataRata - b.hargaRataRata;
      } else if (sortFieldMonthly === 'stokAwal') {
        result = a.stokAwal - b.stokAwal;
      } else if (sortFieldMonthly === 'stokMasuk') {
        result = a.stokMasuk - b.stokMasuk;
      } else if (sortFieldMonthly === 'stokKeluar') {
        result = a.stokKeluar - b.stokKeluar;
      } else if (sortFieldMonthly === 'rusak') {
        result = a.rusak - b.rusak;
      } else if (sortFieldMonthly === 'stokAkhir') {
        result = a.stokAkhir - b.stokAkhir;
      } else if (sortFieldMonthly === 'totalNilaiStok') {
        result = a.totalNilaiStok - b.totalNilaiStok;
      } else if (sortFieldMonthly === 'minStock') {
        result = a.minStock - b.minStock;
      }

      return sortDirectionMonthly === 'asc' ? result : -result;
    });
  }, [reportRows, searchTerm, sortFieldMonthly, sortDirectionMonthly]);

  const totalPagesMonthly = Math.ceil(sortedReportRows.length / 50);
  const paginatedReportRows = sortedReportRows.slice((currentPageMonthly - 1) * 50, currentPageMonthly * 50);

  const reportValuationSum = reportRows.reduce((acc, cur) => acc + cur.totalNilaiStok, 0) / 100;

  // Calculate actual Inventory On Hand & In Delivery (codes: 1201 & 1202) ledger balance up to selected month end
  const { dbInventoryBalance, reconciliationMismatch, hasMismatch } = React.useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const endOfMonth = new Date(year, month, 1); // Next month start, exclusive

    let totalDebit = 0;
    let totalCredit = 0;

    journals.forEach((entry) => {
      const entryDate = entry.date?.toDate 
        ? entry.date.toDate() 
        : new Date(entry.date?.seconds * 1000 || entry.date);

      if (entryDate >= endOfMonth) return; // filter entries past selected month

      entry.lines?.forEach((line) => {
        const codeClean = (line.accountCode || '').trim();
        const nameLower = (line.account || '').trim().toLowerCase();
        if (
          codeClean === '1201' || 
          nameLower === 'inventory on hand' ||
          codeClean === '1202' ||
          nameLower === 'inventory in delivery'
        ) {
          totalDebit += line.debit || 0;
          totalCredit += line.credit || 0;
        }
      });
    });

    const balance = (totalDebit - totalCredit) / 100; // cents to standard dollars
    const mismatchAmt = Math.abs(reportValuationSum - balance);
    const has = mismatchAmt > 0.05; // toleransi rounding kecil
    return { dbInventoryBalance: balance, reconciliationMismatch: mismatchAmt, hasMismatch: has };
  }, [journals, selectedMonth, reportValuationSum]);

  const [isPostingAdjustment, setIsPostingAdjustment] = useState(false);

  const handlePostAdjustmentJournal = async () => {
    if (!hasMismatch || reconciliationMismatch <= 0) return;
    
    if (closedPeriods.includes(selectedMonth)) {
      showAlert('Periode Terkunci', `Periode ${selectedMonth} telah ditutup dan dikunci. Jurnal penyesuaian tidak dapat ditambahkan.`, 'error');
      return;
    }

    setIsPostingAdjustment(true);
    try {
      const diffCents = Math.round((reportValuationSum - dbInventoryBalance) * 100);
      if (diffCents === 0) return;

      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDayOfMonth = new Date(year, month, 0, 23, 59, 59);

      const batch = writeBatch(db);
      const journalRef = doc(db, 'journalEntries', `ADJ-INV-${selectedMonth}`);

      const absDiffCents = Math.abs(diffCents);

      let lines = [];
      if (diffCents > 0) {
        // Fisik > Ledger -> Debit 1201 (Penambahan Inventory On Hand), Credit 4201 (Laba/Rugi Selisih Kurs / Rounding)
        lines = [
          {
            accountCode: '1201',
            account: 'Inventory On Hand',
            debit: absDiffCents,
            credit: 0
          },
          {
            accountCode: '4201',
            account: 'Laba/Rugi Selisih Kurs',
            debit: 0,
            credit: absDiffCents
          }
        ];
      } else {
        // Fisik < Ledger -> Debit 4201, Credit 1201
        lines = [
          {
            accountCode: '4201',
            account: 'Laba/Rugi Selisih Kurs',
            debit: absDiffCents,
            credit: 0
          },
          {
            accountCode: '1201',
            account: 'Inventory On Hand',
            debit: 0,
            credit: absDiffCents
          }
        ];
      }

      const journalEntry = {
        date: Timestamp.fromDate(lastDayOfMonth),
        refId: `ADJ-INV-${selectedMonth}`,
        description: `Jurnal Penyesuaian Selisih Pembulatan Persediaan Fisik vs Ledger (${selectedMonth})`,
        refType: 'inventory_adjustment',
        lines,
        createdAt: Timestamp.now(),
        createdByName: profile?.displayName || user?.displayName || user?.email || 'Sistem ERP'
      };

      batch.set(journalRef, journalEntry);
      await batch.commit();

      setJournals(prev => {
        const existingIdx = prev.findIndex(j => j.id === journalRef.id);
        if (existingIdx >= 0) {
          const newArr = [...prev];
          newArr[existingIdx] = { id: journalRef.id, ...journalEntry } as JournalEntry;
          return newArr;
        }
        return [...prev, { id: journalRef.id, ...journalEntry } as JournalEntry];
      });

      showAlert('Berhasil Rekonsiliasi', `Jurnal Penyesuaian Selisih Pembulatan sebesar ${formatNTD(absDiffCents)} telah berhasil diposting.`, 'success');
    } catch (err: any) {
      console.error('Failed to post adjustment journal:', err);
      handleFirestoreError(err, OperationType.WRITE, 'journalEntries');
    } finally {
      setIsPostingAdjustment(false);
    }
  };

  // Filter damaged stock lists for current month view
  const currentMonthDamagedList = damagedRecords.filter((rec) => 
    rec.date && rec.date.startsWith(selectedMonth)
  );

  const [filterStock, setFilterStock] = useState<'semua' | 'minus'>('semua');

  const getStatusOfBook = (stok: number, minStok: number) => {
    if (stok < 0) return "minus";
    if (stok === 0) return "habis";
    if (stok <= minStok) return "menipis";
    return "aman";
  };

  const STATUS_LABEL: Record<string, string> = { minus: "MINUS", habis: "HABIS", menipis: "MENIPIS", aman: "AMAN" };
  const SEVERITY_RANK: Record<string, number> = { minus: 0, menipis: 1, habis: 2, aman: 3 };

  const allBooksWithStock = React.useMemo(() => {
    return getAllBooksStockData(books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);
  }, [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords]);

  const allMinus = allBooksWithStock.filter(b => b.status === 'minus');

  const sortedBooksList = React.useMemo(() => {
    let list = [...allBooksWithStock].sort((a, b) => {
      // 1. Minus stock always at the top
      const raMinus = a.stok < 0 ? 0 : 1;
      const rbMinus = b.stok < 0 ? 0 : 1;
      if (raMinus !== rbMinus) return raMinus - rbMinus;

      // 2. If Stok, Stok Diorder, and Stok Dikirim are ALL 0, push to bottom
      const raEmpty = (a.stok === 0 && a.stokDiorder === 0 && a.stokDikirim === 0) ? 1 : 0;
      const rbEmpty = (b.stok === 0 && b.stokDiorder === 0 && b.stokDikirim === 0) ? 1 : 0;
      if (raEmpty !== rbEmpty) return raEmpty - rbEmpty;

      // 3. Sort by Stok (Z-A / highest first)
      if (b.stok !== a.stok) return b.stok - a.stok;

      // 4. Sort by Stok Diorder (Z-A / highest first)
      if (b.stokDiorder !== a.stokDiorder) return b.stokDiorder - a.stokDiorder;

      // 5. Sort by Stok Dikirim (Z-A / highest first)
      if (b.stokDikirim !== a.stokDikirim) return b.stokDikirim - a.stokDikirim;

      // 6. Fallback alphabetical
      return (a.bookName || '').localeCompare(b.bookName || '');
    });

    if (filterStock === 'minus') {
      list = list.filter(b => b.status === 'minus');
    }

    if (searchTerm) {
      list = list.filter(b => b.bookName.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return list;
  }, [allBooksWithStock, filterStock, searchTerm]);

  const totalPagesKontrol = Math.ceil(sortedBooksList.length / 50);
  const paginatedBooksList = sortedBooksList.slice((currentPageKontrol - 1) * 50, currentPageKontrol * 50);

  // Penyesuaian tab filtering & metrics
  const currentMonthAdjustments = useMemo(() => {
    return damagedRecords.filter(rec => !selectedMonth || rec.date.startsWith(selectedMonth));
  }, [damagedRecords, selectedMonth]);

  const filteredAdjustments = useMemo(() => {
    return currentMonthAdjustments.filter((rec) => {
      // Type filter
      if (adjFilter !== 'semua') {
        const isSurplus = rec.adjustmentType === 'Barang Lebih' || (rec as any).type === 'surplus';
        if (adjFilter === 'Barang Rusak' && isSurplus) return false;
        if (adjFilter === 'Barang Lebih' && !isSurplus) return false;
      }
      // Search filter
      if (adjSearchTerm.trim()) {
        const q = adjSearchTerm.toLowerCase();
        const bName = (rec.bookName || '').toLowerCase();
        const docNo = (rec.docNo || rec.id || '').toLowerCase();
        const notes = (rec.notes || '').toLowerCase();
        if (!bName.includes(q) && !docNo.includes(q) && !notes.includes(q)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [currentMonthAdjustments, adjFilter, adjSearchTerm]);

  const totalDamageCount = currentMonthAdjustments.filter(r => r.adjustmentType === 'Barang Rusak' || (r as any).type !== 'surplus').length;
  const totalDamageValue = currentMonthAdjustments.filter(r => r.adjustmentType === 'Barang Rusak' || (r as any).type !== 'surplus').reduce((acc, curr) => acc + (curr.totalCost || 0), 0);

  const totalSurplusCount = currentMonthAdjustments.filter(r => r.adjustmentType === 'Barang Lebih' || (r as any).type === 'surplus').length;
  const totalSurplusValue = currentMonthAdjustments.filter(r => r.adjustmentType === 'Barang Lebih' || (r as any).type === 'surplus').reduce((acc, curr) => acc + (curr.totalCost || 0), 0);

  const handleDownloadPdf = () => {
    window.print(); // Fallback simpler action as PDF library might require heavy asset injections
  };

  return (
    <div className="space-y-6 kbi-inventory">
      <style dangerouslySetInnerHTML={{ __html: CUSTOM_STYLES }} />
      {/* Toast Alert System Notification Banner */}
      {alertState.type && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-lg transition-all animate-in fade-in slide-in-from-top-4 ${
          alertState.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400' 
            : alertState.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-955/20 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-400'
            : 'bg-indigo-50 dark:bg-neutral-900 border-indigo-200 dark:border-neutral-800 text-indigo-800 dark:text-indigo-400'
        }`}>
          <div className="mt-0.5">
            {alertState.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : alertState.type === 'error' ? (
              <TriangleAlert className="h-5 w-5" />
            ) : (
              <Info className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm leading-tight">{alertState.title}</h4>
            <p className="text-xs mt-1 opacity-90 leading-normal">{alertState.message}</p>
          </div>
        </div>
      )}

      {/* Modern Tab Control & Period Navigator Segment */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-indigo-500" /> Stok &amp; Value
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button className="kbi-btn-download-pdf" onClick={handleDownloadPdf}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download PDF
          </button>
        </div>
      </div>

      <div className="kbi-toolbar-row">
        <div style={{display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'}}>
          <div className="kbi-tabs">
            {hasPerm('inventory.kontrol') && (
              <button
                onClick={() => setActiveSubTab('kontrol_stok')}
                className={activeSubTab === 'kontrol_stok' ? 'active' : ''}
              >
                KONTROL STOK
              </button>
            )}
            {hasPerm('inventory.laporan') && (
              <button
                onClick={() => setActiveSubTab('monthly')}
                className={activeSubTab === 'monthly' ? 'active' : ''}
              >
                LAPORAN BULANAN
              </button>
            )}
            {isStaffValue && (
              <button
                onClick={() => setActiveSubTab('adjustments')}
                className={activeSubTab === 'adjustments' ? 'active' : ''}
              >
                PENYESUAIAN
              </button>
            )}
          </div>
          
          {activeSubTab === 'kontrol_stok' && (
            <div className="kbi-filter-chips">
              <button 
                className={filterStock === 'semua' ? 'active' : ''} 
                onClick={() => setFilterStock('semua')}
              >
                Semua <span className="count">{books.length}</span>
              </button>
              <button 
                className={filterStock === 'minus' ? 'active' : ''} 
                onClick={() => setFilterStock('minus')}
              >
                Perlu Dibeli <span className="count">{allMinus.length}</span>
              </button>
            </div>
          )}
        </div>

        {activeSubTab !== 'adjustments' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="kbi-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Cari nama buku..."
                autoComplete="off"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPageKontrol(1); setCurrentPageMonthly(1); }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sub-tab B Period Switcher Controls */}
      {activeSubTab === 'monthly' && (
        <div className="bg-neutral-50 dark:bg-neutral-950 p-3 rounded-2xl border border-neutral-150 dark:border-neutral-850 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 bg-white dark:bg-neutral-900 rounded-lg border hover:bg-neutral-50 text-neutral-600 dark:text-neutral-400"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100 min-w-32 text-center select-none">
              {formatMonthYearID(selectedMonth)}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 bg-white dark:bg-neutral-900 rounded-lg border hover:bg-neutral-50 text-neutral-600 dark:text-neutral-400"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month Dropdown Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">Pilih Bulan:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-neutral-900 border text-neutral-700 dark:text-neutral-300 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {getDropdownMonthsList().map((m) => (
                <option key={m} value={m}>
                  {formatMonthYearID(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Sub-tab A: Kontrol Stok view */}
      {activeSubTab === 'kontrol_stok' && (
        <div className="space-y-4">
          {allMinus.length > 0 && (
            <div className="kbi-minus-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <strong>{allMinus.length} buku stoknya minus, perlu PO segera</strong>
                <span className="sub">Diurutkan dari yang paling minus. Klik baris untuk lihat order penyebabnya.</span>
              </div>
            </div>
          )}

          <div className="kbi-table-card">
            <div className="kbi-t-head">
              <span>Foto</span>
              <span>Nama Buku</span>
              <span style={{textAlign:"center"}}>Min. Stok</span>
              <span style={{textAlign:"center"}}>Harga Umum</span>
              <span style={{textAlign:"center"}}>Harga Marketplace</span>
              <span style={{textAlign:"center"}}>Stok</span>
              <span style={{textAlign:"center"}}>Stok Digudang</span>
              <span style={{textAlign:"center"}}>Dalam Perjalanan</span>
              <span style={{textAlign:"center"}}>Stok Diorder</span>
              <span style={{textAlign:"center"}}>Stok Dikirim</span>
              <span style={{textAlign:"center"}}>Status</span>
              <span style={{textAlign:"center"}}>Saran Beli</span>
            </div>
            <div>
              {paginatedBooksList.map((b) => {
                const isMinus = b.status === "minus";
                const saranBeli = isMinus ? Math.abs(b.stok) + b.minStok : null;
                const coverSvgSvg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='52'><rect width='40' height='52' rx='6' fill='${spineColor(b.bookName)}'/></svg>`);
                return (
                  <div key={b.id} className={`kbi-t-row sev-${b.status} cursor-pointer`} onClick={() => handleRowClick(b as unknown as Book)}>
                    <img 
                      className="kbi-book-cover" 
                      src={b.cover || `data:image/svg+xml,${coverSvgSvg}`} 
                      alt="" 
                      referrerPolicy="no-referrer" 
                    />
                    <div className="kbi-book-info">
                      <div 
                        className="nama cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(b.bookName);
                        }}
                        title="Klik untuk copy nama buku"
                      >
                        {b.bookName}
                      </div>
                    </div>
                    <div className="kbi-val-center font-bold">{b.minStok}</div>
                    <div className="kbi-val-center font-bold">{formatNTD(b.generalPrice || 0)}</div>
                    <div className="kbi-val-center font-bold">{formatNTD(b.shopeePrice || 0)}</div>
                    <div className={`kbi-val-center font-bold ${isMinus ? "text-[#ff1e1e]" : "text-[#3d7a4f]"}`}>{b.stok} pcs</div>
                    <div className="kbi-val-center font-bold text-neutral-700 dark:text-neutral-200">{b.stokDigudang} pcs</div>
                    <div className="kbi-val-center font-bold text-amber-600 dark:text-amber-400">{(b as any).stokDalamPerjalanan || 0} pcs</div>
                    <div className="kbi-val-center font-bold">{b.stokDiorder} pcs</div>
                    <div className="kbi-val-center font-bold">{b.stokDikirim} pcs</div>
                    <div style={{textAlign:"center"}}>
                      <span className={`kbi-status-pill status-${b.status}`}><span className="dot"></span>{STATUS_LABEL[b.status]}</span>
                    </div>
                    <div className="kbi-saran-beli">
                      {isMinus ? <strong style={{ color: '#debf00', borderColor: '#261007' }}>{saranBeli} pcs</strong> : <span className="muted">&mdash;</span>}
                    </div>
                  </div>
                );
              })}
              
              {sortedBooksList.length === 0 && (
                <div className="p-12 text-center text-neutral-400 text-sm">
                  Tidak ada buku yang cocok dengan pencarian Anda.
                </div>
              )}
            </div>
            {totalPagesKontrol > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800">
                <div className="text-sm text-neutral-500">
                  Menampilkan {Math.min((currentPageKontrol - 1) * 50 + 1, sortedBooksList.length)} - {Math.min(currentPageKontrol * 50, sortedBooksList.length)} dari {sortedBooksList.length} Barang
                </div>
                <div className="flex gap-2">
                  <button disabled={currentPageKontrol === 1} onClick={() => setCurrentPageKontrol(p => p - 1)} className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300">Prev</button>
                  <button disabled={currentPageKontrol === totalPagesKontrol} onClick={() => setCurrentPageKontrol(p => p + 1)} className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-tab B: Monthly Report view */}
      {activeSubTab === 'monthly' && (
        <div className="space-y-6">
          {/* Mismatch Reconciliation Warning Banner */}
          <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs transition-all ${
            hasMismatch 
              ? 'bg-amber-50 dark:bg-amber-955/20 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-400'
              : 'bg-emerald-50 dark:bg-emerald-955/10 border-emerald-150 dark:border-emerald-900 text-emerald-800 dark:text-emerald-400'
          }`}>
            <div className="flex items-start gap-3 flex-1">
              <div className="mt-0.5 shrink-0">
                {hasMismatch ? (
                  <TriangleAlert className="h-5 w-5 text-amber-500" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                )}
              </div>
              <div>
                <h4 className="font-bold text-sm">
                  {hasMismatch ? 'Selisih Rekonsiliasi Terdeteksi!' : 'Konsistensi Audit Buku Besar 100% Balanced'}
                </h4>
                <p className="text-xs mt-0.5 opacity-90 leading-relaxed">
                  {hasMismatch 
                    ? `Total nilai fisik laporan (${formatNTD(reportValuationSum * 100)}) tidak sesuai dengan saldo akhir Akun Inventory On Hand 1201 & In Delivery 1202 (${formatNTD(dbInventoryBalance * 100)}). Selisih: ${formatNTD(reconciliationMismatch * 100)}.`
                    : `Semua nilai fisik stok (${formatNTD(reportValuationSum * 100)}) sepenuhnya sesuai dengan total saldo buku besar Akun Inventory On Hand (1201) & In Delivery (1202) di Bagan Akun.`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
              <div className="text-right font-numeric text-xs whitespace-nowrap bg-white/40 dark:bg-black/30 p-2.5 rounded-xl border border-neutral-200/20">
                <p>Fisik: {formatNTD(reportValuationSum * 100)}</p>
                <p>Ledger: {formatNTD(dbInventoryBalance * 100)}</p>
              </div>

              {hasMismatch && (
                <button
                  onClick={handlePostAdjustmentJournal}
                  disabled={isPostingAdjustment}
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                  title="Posting Jurnal Penyesuaian Pembulatan Otomatis"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  {isPostingAdjustment ? 'Proses...' : 'Selesaikan Selisih'}
                </button>
              )}
            </div>
          </div>

          {/* Master valuation table */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/20 flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
                <Boxes className="h-5 w-5 text-indigo-500" /> Buku Besar & Penilaian Mutasi Bulanan
              </h3>
              <p className="text-[10px] text-neutral-400 italic">Klik baris produk untuk melakukan audit historis ledger keluar-masuk barang.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase border-b border-neutral-200 dark:border-neutral-800">
                    <th className="p-4 text-center w-12">Foto</th>
                    <th 
                      className="p-4 text-left cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('bookName')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nama Buku</span>
                        {sortFieldMonthly === 'bookName' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('hargaRataRata')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Harga Rata-Rata</span>
                        {sortFieldMonthly === 'hargaRataRata' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('stokAwal')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Stok Awal</span>
                        {sortFieldMonthly === 'stokAwal' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center text-emerald-600 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('stokMasuk')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Stok Masuk</span>
                        {sortFieldMonthly === 'stokMasuk' && (
                          <span className="text-emerald-700 dark:text-emerald-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center text-rose-500 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('stokKeluar')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Stok Keluar</span>
                        {sortFieldMonthly === 'stokKeluar' && (
                          <span className="text-rose-600 dark:text-rose-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center text-rose-400 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('rusak')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Rusak</span>
                        {sortFieldMonthly === 'rusak' && (
                          <span className="text-rose-500 dark:text-rose-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('stokAkhir')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Stok Akhir</span>
                        {sortFieldMonthly === 'stokAkhir' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('totalNilaiStok')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Total Nilai Stok</span>
                        {sortFieldMonthly === 'totalNilaiStok' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('minStock')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Min. Stok</span>
                        {sortFieldMonthly === 'minStock' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                      onClick={() => handleSortMonthly('status')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Status</span>
                        {sortFieldMonthly === 'status' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{sortDirectionMonthly === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-805 text-xs font-medium">
                  {paginatedReportRows.map(({
                    book,
                    hargaRataRata,
                    stokAwal,
                    stokMasuk,
                    stokKeluar,
                    rusak,
                    stokAkhir,
                    totalNilaiStok,
                    minStock
                  }) => {
                    const isBelowMin = stokAkhir < minStock;
                    return (
                      <tr
                        key={book.id}
                        onClick={() => handleRowClick(book)}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 cursor-pointer transition text-neutral-700 dark:text-neutral-300"
                      >
                        <td className="p-3 text-center">
                          <img src={book.cover} alt="" className="h-8 w-6 object-cover rounded shadow-sm mx-auto referrer-no-referrer" referrerPolicy="no-referrer" />
                        </td>
                        <td className="p-3 text-left font-semibold text-neutral-900 dark:text-neutral-100">
                          <div
                            className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-block"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(book.bookName);
                            }}
                            title="Klik untuk copy nama buku"
                          >
                            {book.bookName}
                          </div>
                        </td>
                        <td className="p-3 text-center font-numeric">
                          {formatNTD(hargaRataRata)}
                        </td>
                        <td className="p-3 text-center font-numeric text-neutral-500">
                          {stokAwal.toLocaleString('en-US')}
                        </td>
                        <td className="p-3 text-center font-numeric text-emerald-600">
                          {stokMasuk > 0 ? `+${stokMasuk}` : '-'}
                        </td>
                        <td className="p-3 text-center font-numeric text-rose-500">
                          {stokKeluar > 0 ? `-${stokKeluar}` : '-'}
                        </td>
                        <td className="p-3 text-center font-numeric text-rose-400 font-bold">
                          {rusak > 0 ? `-${rusak}` : '-'}
                        </td>
                        <td className="p-3 text-center font-numeric font-bold text-neutral-900 dark:text-white">
                          {stokAkhir.toLocaleString('en-US')}
                        </td>
                        <td className="p-3 text-center font-numeric font-bold text-indigo-600 dark:text-indigo-400">
                          {formatNTD(totalNilaiStok)}
                        </td>
                        <td className="p-3 text-center font-numeric text-neutral-400">
                          {minStock}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            stokAkhir <= 0
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-955/20'
                              : isBelowMin
                              ? 'bg-amber-50 text-amber-600 dark:bg-amber-955/20'
                              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-955/20'
                          }`}>
                            {stokAkhir <= 0 ? 'Habis (Sold)' : isBelowMin ? 'Di Bawah Batas' : 'Aman (In-Stock)'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {sortedReportRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-10 text-center text-neutral-400">
                        Belum ada data katalog buku.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPagesMonthly > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 rounded-b-[18px]">
                <div className="text-sm text-neutral-500">
                  Menampilkan {Math.min((currentPageMonthly - 1) * 50 + 1, sortedReportRows.length)} - {Math.min(currentPageMonthly * 50, sortedReportRows.length)} dari {sortedReportRows.length} Barang
                </div>
                <div className="flex gap-2">
                  <button disabled={currentPageMonthly === 1} onClick={() => setCurrentPageMonthly(p => p - 1)} className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300">Prev</button>
                  <button disabled={currentPageMonthly === totalPagesMonthly} onClick={() => setCurrentPageMonthly(p => p + 1)} className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300">Next</button>
                </div>
              </div>
            )}
          </div>

          {/* Damaged records of current month section */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/20">
              <h3 className="text-sm font-bold uppercase text-neutral-800 dark:text-neutral-100">
                Log Catatan Barang Rusak — Periode {formatMonthYearID(selectedMonth)}
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase border-b border-neutral-200 dark:border-neutral-800">
                    <th className="p-4 text-left">Tanggal</th>
                    <th className="p-4 text-left">Nama Buku</th>
                    <th className="p-4 text-center">Jumlah (Qty)</th>
                    <th className="p-4 text-right">Landed Avg Cost</th>
                    <th className="p-4 text-right">Total Kerugian (NTD)</th>
                    <th className="p-4 text-left">Catatan</th>
                    {isStaffValue && <th className="p-4 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-805 text-xs text-neutral-700 dark:text-neutral-300">
                  {currentMonthDamagedList.map((rec) => (
                    <tr key={rec.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/25">
                      <td className="p-4 font-numeric font-bold">{rec.date}</td>
                      <td className="p-4 font-semibold">{rec.bookName}</td>
                      <td className="p-4 text-center font-numeric font-bold text-rose-500">{rec.qty.toLocaleString('en-US')} pcs</td>
                      <td className="p-4 text-right font-numeric">{formatNTD(rec.unitCost)}</td>
                      <td className="p-4 text-right font-numeric font-bold text-rose-600 dark:text-rose-450">{formatNTD(rec.totalCost)}</td>
                      <td className="p-4 text-left italic text-neutral-500">{rec.notes || '-'}</td>
                      {isStaffValue && (
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleOpenDeleteModal(rec)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-600 rounded-lg transition"
                            title="Hapus / Pulihkan Stok"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}

                  {currentMonthDamagedList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-neutral-400 italic">
                        Tidak ada catatan barang rusak yang diinput pada bulan ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab C: Penyesuaian Stok view */}
      {activeSubTab === 'adjustments' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl shadow-xs flex items-center gap-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Total Penyesuaian</span>
                <span className="text-xl font-bold text-neutral-800 dark:text-neutral-100 font-numeric">{currentMonthAdjustments.length} Transaksi</span>
                <span className="text-xs text-neutral-500 block mt-0.5">Periode {formatMonthYearID(selectedMonth)}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-rose-200/80 dark:border-rose-900/50 p-5 rounded-2xl shadow-xs flex items-center gap-4">
              <div className="p-3 bg-rose-50 dark:bg-rose-955/30 text-rose-600 dark:text-rose-400 rounded-xl">
                <PackageX className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider block">Barang Rusak</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-rose-600 dark:text-rose-400 font-numeric">{totalDamageCount} Transaksi</span>
                  <span className="text-xs font-bold text-neutral-500">({formatNTD(totalDamageValue)})</span>
                </div>
                <span className="text-xs text-neutral-500 block mt-0.5">Beban Lain-lain (5500)</span>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-emerald-200/80 dark:border-emerald-900/50 p-5 rounded-2xl shadow-xs flex items-center gap-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <PackagePlus className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Barang Lebih</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-numeric">{totalSurplusCount} Transaksi</span>
                  <span className="text-xs font-bold text-neutral-500">({formatNTD(totalSurplusValue)})</span>
                </div>
                <span className="text-xs text-neutral-500 block mt-0.5">Pendapatan Lain-lain (5500)</span>
              </div>
            </div>
          </div>

          {/* Section "Riwayat" Navigator + Filter Chips + Search + Action */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-50/50 dark:bg-neutral-950/40">
              {/* Period Navigator */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 bg-white dark:bg-neutral-900 rounded-lg border hover:bg-neutral-50 text-neutral-600 dark:text-neutral-400"
                  title="Bulan Sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100 min-w-32 text-center select-none">
                  {formatMonthYearID(selectedMonth)}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 bg-white dark:bg-neutral-900 rounded-lg border hover:bg-neutral-50 text-neutral-600 dark:text-neutral-400"
                  title="Bulan Berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="ml-2 px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-neutral-900 border text-neutral-700 dark:text-neutral-300 font-medium focus:outline-none"
                >
                  {getDropdownMonthsList().map((m) => (
                    <option key={m} value={m}>
                      {formatMonthYearID(m)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Chips & Action */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setAdjFilter('semua')}
                    className={`px-3 py-1 rounded-lg transition ${adjFilter === 'semua' ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500'}`}
                  >
                    Semua ({currentMonthAdjustments.length})
                  </button>
                  <button
                    onClick={() => setAdjFilter('Barang Rusak')}
                    className={`px-3 py-1 rounded-lg transition ${adjFilter === 'Barang Rusak' ? 'bg-white dark:bg-neutral-900 text-rose-600 shadow-xs' : 'text-neutral-500'}`}
                  >
                    Barang Rusak ({totalDamageCount})
                  </button>
                  <button
                    onClick={() => setAdjFilter('Barang Lebih')}
                    className={`px-3 py-1 rounded-lg transition ${adjFilter === 'Barang Lebih' ? 'bg-white dark:bg-neutral-900 text-emerald-600 shadow-xs' : 'text-neutral-500'}`}
                  >
                    Barang Lebih ({totalSurplusCount})
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari barang / doc..."
                    value={adjSearchTerm}
                    onChange={(e) => setAdjSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-neutral-800 dark:text-neutral-200 w-44"
                  />
                  <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
                </div>

                {isStaffValue && (
                  <button
                    onClick={handleOpenAddModal}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                  >
                    <Plus className="h-4 w-4" /> Tambah Penyesuaian
                  </button>
                )}
              </div>
            </div>

            {/* Adjustment History Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase border-b border-neutral-200 dark:border-neutral-800">
                    <th className="p-4 text-left">Tanggal</th>
                    <th className="p-4 text-left">No. Dokumen</th>
                    <th className="p-4 text-left">Jenis</th>
                    <th className="p-4 text-left">Nama Barang</th>
                    <th className="p-4 text-center">Qty</th>
                    <th className="p-4 text-right">Nilai NTD</th>
                    <th className="p-4 text-left">Catatan / Keterangan</th>
                    {isStaffValue && <th className="p-4 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-805 text-xs text-neutral-700 dark:text-neutral-300">
                  {filteredAdjustments.map((rec) => {
                    const isSurplus = rec.adjustmentType === 'Barang Lebih' || (rec as any).type === 'surplus';
                    const isLocked = isPeriodClosed(rec.date, closedPeriods);

                    return (
                      <tr key={rec.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/25 transition">
                        <td className="p-4 font-numeric font-bold whitespace-nowrap">{rec.date}</td>
                        <td className="p-4 font-mono font-bold text-neutral-500 whitespace-nowrap">{rec.docNo || rec.id.slice(0, 10)}</td>
                        <td className="p-4 whitespace-nowrap">
                          {isSurplus ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              <PackagePlus className="h-3 w-3" /> Barang Lebih
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-955/40 dark:text-rose-400">
                              <PackageX className="h-3 w-3" /> Barang Rusak
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-semibold text-neutral-900 dark:text-white">{rec.bookName}</td>
                        <td className={`p-4 text-center font-numeric font-bold whitespace-nowrap ${isSurplus ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isSurplus ? `+${rec.qty}` : `-${rec.qty}`} pcs
                        </td>
                        <td className="p-4 text-right font-numeric font-bold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                          {formatNTD(rec.totalCost)}
                        </td>
                        <td className="p-4 italic text-neutral-500 max-w-xs truncate">{rec.notes || '-'}</td>
                        {isStaffValue && (
                          <td className="p-4 text-center whitespace-nowrap">
                            {isLocked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-400 text-[10px] font-bold cursor-not-allowed" title={`Periode ${rec.date.substring(0, 7)} telah ditutup`}>
                                <ShieldAlert className="h-3 w-3 text-amber-500" /> Terkunci
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleOpenEditModal(rec)}
                                  className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-lg transition"
                                  title="Edit Penyesuaian"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleOpenDeleteModal(rec)}
                                  className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-600 dark:text-rose-400 rounded-lg transition"
                                  title="Batal / Revert Penyesuaian"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {filteredAdjustments.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-neutral-400 italic">
                        Tidak ada catatan penyesuaian stok pada periode atau filter ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Ledger History Timeline Drawer (on row click) */}
      {isLedgerOpen && selectedBookForLedger && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsLedgerOpen(false);
              setSelectedBookForLedger(null);
            }
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-end z-50 animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 w-full max-w-lg h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-800 dark:text-neutral-100 flex items-center gap-1.5">
                  <History className="h-4.5 w-4.5 text-indigo-500" />
                  Alur Masuk/Keluar Barang
                </h3>
                <p className="text-[11px] text-neutral-400 line-clamp-1 mt-1 leading-none">{selectedBookForLedger.bookName}</p>
              </div>
              <button 
                onClick={() => {
                  setIsLedgerOpen(false);
                  setSelectedBookForLedger(null);
                }} 
                className="text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 p-1.5 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Ledger chronological timeline view */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <h4 className="text-xs uppercase font-bold text-neutral-400 tracking-wider">Audit Trail (Kronologis Ledger)</h4>
              
              <div className="relative border-l-2 border-neutral-200 dark:border-neutral-800 ml-3.5 space-y-5 py-2 animate-in fade-in delay-75">
                {bookLedgerEntries.map((entry, idx) => {
                  const isAdd = entry.type === 'purchase_received';
                  return (
                    <div key={entry.id || idx} className="relative pl-6">
                      {/* Timeline dot icon indicator */}
                      <span className={`absolute -left-[11px] top-1.5 h-5 w-5 rounded-full border-2 border-white dark:border-neutral-900 flex items-center justify-center ${
                        isAdd 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-rose-500 text-white'
                      }`}>
                        {isAdd ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      </span>

                      <div className="bg-neutral-50 dark:bg-neutral-950/45 border rounded-lg p-3 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-bold leading-none ${isAdd ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isAdd ? `+${entry.qtyDelta} Pcs` : `${entry.qtyDelta} Pcs`}
                          </span>
                          <span className={`text-[9px] font-bold font-numeric px-1.5 py-0.5 rounded uppercase ${
                            isAdd 
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' 
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
                          }`}>
                            {isAdd ? 'RECEIVED (PO)' : 'COMPLETED (SALE)'}
                          </span>
                        </div>
                        
                        <p className="text-[11px] text-neutral-500 leading-normal font-medium">
                          {isAdd 
                            ? `Penerimaan Cargo PO ${entry.refId || ''}` 
                            : `Penyelesaian Transaksi - Invoice ${entry.refId || ''}`}
                        </p>

                        <div className="flex justify-between pt-1 text-[10px] font-numeric text-neutral-400 border-t border-neutral-100 dark:border-neutral-805">
                          <span>Unit Landed: {formatNTD(entry.unitCost)}</span>
                          <span>Baki Akhir: {entry.balanceAfter} pcs</span>
                        </div>

                        <p className="text-[9px] text-right text-neutral-450 italic mt-0.5">
                          {entry.timestamp?.seconds 
                            ? new Date(entry.timestamp.seconds * 1000).toLocaleString('zh-TW', { hour12: false }) 
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {bookLedgerEntries.length === 0 && (
                  <div className="pl-6 text-xs text-neutral-500 py-6 italic text-center">
                    Belum ada catatan mutasi ledger untuk buku ini.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Styled Dialog / Modal: PENYESUAIAN STOK */}
      {isDamageModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-amber-50/20 dark:bg-amber-950/20">
              <h3 className="text-sm font-bold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5" /> Form Penyesuaian Stok
              </h3>
              <button
                onClick={() => setIsDamageModalOpen(false)}
                className="text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 p-1.5 rounded-lg"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleAddDamageSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed">
                  {formSuccess}
                </div>
              )}

              {/* 1. Jenis Penyesuaian */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Jenis Penyesuaian *
                </label>
                <select
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as 'Barang Rusak' | 'Barang Lebih')}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                >
                  <option value="Barang Rusak">Barang Rusak</option>
                  <option value="Barang Lebih">Barang Lebih</option>
                </select>
              </div>

              {/* 2. Tanggal */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Tanggal *
                </label>
                <input
                  type="date"
                  value={damageDate}
                  onChange={(e) => setDamageDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                />
              </div>

              {/* 3. Nama Barang */}
              <div className="relative">
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Nama Barang *
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Ketik manual atau cari nama barang..."
                  value={damageBookName}
                  onChange={(e) => {
                    setDamageBookName(e.target.value);
                    setShowItemDropdown(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => {
                    if (damageBookName.trim().length > 0) {
                      setShowItemDropdown(true);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                />

                {showItemDropdown && damageBookName.trim().length > 0 && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowItemDropdown(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-52 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl py-1 text-xs">
                      {(() => {
                        const searchLower = damageBookName.trim().toLowerCase();
                        const matches = books.filter((b) => b && b.bookName && b.bookName.toLowerCase().includes(searchLower)).slice(0, 30);

                        if (matches.length === 0) {
                          return (
                            <div className="px-3.5 py-2.5 text-neutral-400 dark:text-neutral-500 italic">
                              Tidak ada barang ditemukan. (Dapat diketik manual)
                            </div>
                          );
                        }

                        return matches.map((b) => {
                          const physicalStock = getPhysicalOnHandStockForBook(b.id, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setDamageBookName(b.bookName);
                                setShowItemDropdown(false);
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-amber-50 dark:hover:bg-neutral-800 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-850/50 last:border-0 transition-colors"
                            >
                              <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate pr-2">
                                {b.bookName}
                              </span>
                              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                Stok di gudang: {physicalStock} pcs
                              </span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </>
                )}
              </div>

              {/* 4. Jumlah Qty */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Jumlah Qty *
                </label>
                <input
                  type="text"
                  placeholder="0"
                  value={damageQty}
                  onChange={(e) => handleQtyChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-200 font-numeric focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                />
              </div>

              {/* 4b. Harga Rata-Rata (Hanya untuk Jenis Penyesuaian 'Barang Lebih') */}
              {adjustmentType === 'Barang Lebih' && (
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Harga Rata-Rata
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={(() => {
                      const trimmedName = damageBookName.trim().toLowerCase();
                      if (!trimmedName) return 'NT$ 0.00 (Pilih nama barang terlebih dahulu)';
                      const matchedBook = books.find((b) => b && (b.id === damageBookName.trim() || (b.bookName && b.bookName.toLowerCase() === trimmedName)));
                      const matchedInv = matchedBook ? inventoryList.find((i) => i.bookId === matchedBook.id) : null;
                      const avgCostCents = (matchedInv && typeof matchedInv.movingAverageCost === 'number' && matchedInv.movingAverageCost > 0)
                        ? matchedInv.movingAverageCost
                        : (matchedBook ? (matchedBook.priceNTD || 0) : (editingRecord?.unitCost || 0));
                      return formatNTD(avgCostCents);
                    })()}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 font-numeric font-bold cursor-not-allowed opacity-90"
                  />
                  <p className="text-[10px] text-neutral-450 dark:text-neutral-500 mt-1 italic">
                    * Terisi otomatis dari harga rata-rata (average price) persediaan terakhir.
                  </p>
                </div>
              )}

              {/* 5. Keterangan */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Keterangan / Catatan (Opsional)
                </label>
                <textarea
                  placeholder="Alasan penyesuaian (misal: barang rusak/cacat, temuan selisih lebih opname, dll)"
                  rows={3}
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-850">
                <button
                  type="button"
                  onClick={() => setIsDamageModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase transition shadow-xs"
                >
                  Proses Jurnal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Beautiful Custom Confirmation Dialog for HAPUS / BATAL PENYESUAIAN STOK */}
      {isConfirmDeleteOpen && recordToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2 text-rose-600">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-sm font-bold uppercase">Batal / Hapus Penyesuaian</h3>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Apakah Anda yakin ingin membatalkan/menghapus entri penyesuaian untuk <span className="font-bold text-neutral-800 dark:text-neutral-200">"{recordToDelete.bookName}"</span> sebanyak <span className="font-bold text-rose-600 font-numeric">{recordToDelete.qty} pcs</span> ({recordToDelete.adjustmentType || 'Barang Rusak'})?
              </p>
              <div className="bg-neutral-50 dark:bg-neutral-950 p-3 rounded-xl border space-y-1.5 text-[11px] text-neutral-500">
                <p>Tindakan ini akan secara otomatis:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Revert stok <span className="font-bold text-neutral-800 dark:text-neutral-200">{recordToDelete.adjustmentType === 'Barang Lebih' ? `-${recordToDelete.qty}` : `+${recordToDelete.qty}`} pcs</span> ke posisi semula.</li>
                  <li>Menghapus log di chronological inventory ledger.</li>
                  <li>Membatalkan/menghapus entri jurnal senilai <span className="font-bold text-neutral-800 dark:text-neutral-200">{formatNTD(recordToDelete.totalCost)}</span>.</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmDeleteOpen(false);
                    setRecordToDelete(null);
                  }}
                  className="flex-1 py-2 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase transition"
                >
                  Batal &amp; Revert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for EDIT PENYESUAIAN STOK */}
      {isEditConfirmOpen && editingRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Pencil className="h-5 w-5" />
              <h3 className="text-sm font-bold uppercase">Konfirmasi Perubahan Penyesuaian</h3>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Pengeditan transaksi penyesuaian stok ini akan diproses dalam <strong>1 transaksi atomik</strong> dengan rincian berikut:
              </p>

              <div className="bg-neutral-50 dark:bg-neutral-950 p-3.5 rounded-xl border space-y-2 text-xs">
                <div className="flex justify-between border-b pb-1.5 text-neutral-500">
                  <span>Nama Barang:</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">{damageBookName}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5 text-neutral-500">
                  <span>Jenis Penyesuaian:</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">{adjustmentType}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5 text-neutral-500">
                  <span>Jumlah Qty:</span>
                  <span className="font-bold text-amber-600">{damageQty} pcs</span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Tanggal Transaksi:</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">{damageDate}</span>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold">Prosedur Otomatis System:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Membatalkan &amp; revert stok dari data lama secara presisi.</li>
                  <li>Menerapkan entri penyesuaian baru ke saldo persediaan.</li>
                  <li>Membatalkan jurnal lama dan memposting entri jurnal otomatis baru.</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditConfirmOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteEditSubmit}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase transition shadow-xs"
                >
                  Konfirmasi &amp; Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DiagnosticReportModal 
        isOpen={showDiagnostic} 
        onClose={() => setShowDiagnostic(false)} 
        books={books} 
        inventoryList={inventoryList} 
      />
    </div>
  );
};
