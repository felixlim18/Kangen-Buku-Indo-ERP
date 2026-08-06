import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  writeBatch, 
  Timestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { CoaAccount, JournalEntry } from '../types';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Download, 
  Copy, 
  Search, 
  RefreshCw, 
  TrendingUp, 
  X, 
  Calendar,
  CheckCircle,
  AlertCircle,
  Check,
  ChevronDown
} from 'lucide-react';
import { formatNumber, formatNTDAmount, getAccountBalanceForPeriod, hasAccountPostings, isParentAccount, findParentOf } from '../lib/decimal-utils';
import { DateRangePicker } from './ui/DateRangePicker';

// Default CoA Accounts as fallback & initialization seed per instructions
const DEFAULT_COA_ACCOUNTS: Omit<CoaAccount, 'id' | 'createdAt'>[] = [
  { code: '1101', name: 'Cash:NTD', type: 'Assets', subType: 'Aset Lancar', isActive: true, systemKey: 'cash_ntd' },
  { code: '1102', name: 'Cash Rupiah', type: 'Assets', subType: 'Aset Lancar', isActive: true, systemKey: 'cash_idr' },
  { code: '1103', name: 'Cash:COD', type: 'Assets', subType: 'Aset Lancar', isActive: true },
  { code: '1110', name: 'Piutang Usaha', type: 'Assets', subType: 'Aset Lancar', isActive: true, systemKey: 'piutang_usaha' },
  { code: '1120', name: 'Freight-in Dalam Kapitalisasi', type: 'Assets', subType: 'Aset Lancar', isActive: true, systemKey: 'freight_in_capitalization' },
  { code: '1125', name: 'AR:Platform', type: 'Assets', subType: 'Aset Lancar', isActive: true },
  { code: '1200', name: 'Inventory', type: 'Assets', subType: 'Aset Persediaan', isActive: true, systemKey: 'inventory_parent' },
  { code: '1201', name: 'Inventory On Hand', type: 'Assets', subType: 'Aset Persediaan', parentAccount: '1200 - Inventory', isActive: true, systemKey: 'inventory_on_hand' },
  { code: '1202', name: 'Inventory in Delivery', type: 'Assets', subType: 'Aset Persediaan', parentAccount: '1200 - Inventory', isActive: true, systemKey: 'inventory_in_delivery' },
  { code: '1203', name: 'Inventory in Transit', type: 'Assets', subType: 'Aset Persediaan', parentAccount: '1200 - Inventory', isActive: true, systemKey: 'inventory_in_transit' },
  { code: '2101', name: 'Hutang Komisi Reseller', type: 'Liabilities', subType: 'Kewajiban Lancar', isActive: true },
  { code: '2102', name: 'Accrued Payroll', type: 'Liabilities', subType: 'Kewajiban Lancar', isActive: true },
  { code: '2110', name: 'Pendapatan Diterima di Muka', type: 'Liabilities', subType: 'Kewajiban Lancar', isActive: true },
  { code: '3100', name: 'Modal Awal', type: 'Equity', subType: 'Ekuitas Pemilik', isActive: true, systemKey: 'modal_awal' },
  { code: '4100', name: 'Revenue', type: 'Revenue', subType: 'Pendapatan Usaha', isActive: true, systemKey: 'revenue' },
  { code: '4101', name: 'Revenue:Tokopedia', type: 'Revenue', subType: 'Pendapatan Usaha', isActive: true },
  { code: '4102', name: 'Revenue:Shopee', type: 'Revenue', subType: 'Pendapatan Usaha', isActive: true },
  { code: '4103', name: 'Revenue:Platform', type: 'Revenue', subType: 'Pendapatan Usaha', isActive: true, systemKey: 'revenue_platform' },
  { code: '5100', name: 'COGS', type: 'Expenses', subType: 'Harga Pokok Penjualan', isActive: true, systemKey: 'cogs' },
  { code: '5120', name: 'Beban Gaji', type: 'Expenses', subType: 'Beban Operasional', isActive: true },
  { code: '5130', name: 'Beban Komisi Reseller', type: 'Expenses', subType: 'Beban Kemitraan', isActive: true },
  { code: '5140', name: 'Beban Barang Rusak', type: 'Expenses', subType: 'Biaya Umum dan Administrasi', isActive: true },
  { code: '5500', name: 'Beban Lain-lain', type: 'Expenses', subType: 'Biaya Umum dan Administrasi', isActive: true, systemKey: 'beban_kerugian_pembelian' },
];

// Map subtype (Jenis Akun) directly to its category type for normal balance and grouping section assignment
export const SUBTYPE_TO_CATEGORY_MAP: Record<string, CoaAccount['type']> = {
  'Aset Lancar': 'Assets',
  'Aset Persediaan': 'Assets',
  'Aset Tidak Lancar': 'Assets',
  'Kewajiban Lancar': 'Liabilities',
  'Kewajiban Jangka Panjang': 'Liabilities',
  'Modal Saham': 'Equity',
  'Laba Ditahan': 'Equity',
  'Ekuitas Pemilik': 'Equity',
  'Pendapatan Penjualan': 'Revenue',
  'Pendapatan Lainnya': 'Revenue',
  'Harga Pokok Penjualan (HPP)': 'Expenses',
  'Biaya Penggajian': 'Expenses',
  'Biaya Umum dan Administrasi': 'Expenses',
  // fallback for seeded / pre-existing accounts
  'Aset Tetap': 'Assets',
  'Modal': 'Equity',
  'Beban Kemitraan': 'Expenses',
  'Beban Operasional': 'Expenses',
  'Pendapatan Usaha': 'Revenue',
  'Harga Pokok Penjualan': 'Expenses',
};

export const HEADER_TO_TYPE_MAP: Record<string, CoaAccount['type']> = {
  'ASSETS': 'Assets',
  'LIABILITIES': 'Liabilities',
  'EQUITY': 'Equity',
  'INCOME': 'Revenue',
  'EXPENSES': 'Expenses',
};

export const determineAccountCategory = (subType: string): CoaAccount['type'] => {
  if (SUBTYPE_TO_CATEGORY_MAP[subType]) {
    return SUBTYPE_TO_CATEGORY_MAP[subType];
  }
  const s = subType.toLowerCase();
  if (s.includes('aset') || s.includes('kas') || s.includes('bank') || s.includes('piutang') || s.includes('inventory') || s.includes('perlengkapan')) {
    return 'Assets';
  }
  if (s.includes('kewajiban') || s.includes('utang') || s.includes('hutang') || s.includes('liabilitas')) {
    return 'Liabilities';
  }
  if (s.includes('modal') || s.includes('ekuitas') || s.includes('saham') || s.includes('prive') || s.includes('dividen') || s.includes('retained') || s.includes('ditahan')) {
    return 'Equity';
  }
  if (s.includes('pendapatan') || s.includes('penjualan') || s.includes('income') || s.includes('revenue') || s.includes('omset') || s.includes('omzet') || s.includes('hasil')) {
    return 'Revenue';
  }
  if (s.includes('beban') || s.includes('biaya') || s.includes('ongkir') || s.includes('gaji') || s.includes('hpp') || s.includes('operational') || s.includes('administrasi') || s.includes('expense') || s.includes('kemitraan')) {
    return 'Expenses';
  }
  return 'Assets';
};

export interface JenisAkunOption {
  value: string;
  label: string;
}

export interface JenisAkunGroup {
  header: string;
  options: JenisAkunOption[];
}

export const DEFAULT_JENIS_AKUN_GROUPS: JenisAkunGroup[] = [
  {
    header: 'ASSETS',
    options: [
      { value: 'Aset Lancar', label: 'Aset Lancar' },
      { value: 'Aset Persediaan', label: 'Aset Persediaan' },
      { value: 'Aset Tidak Lancar', label: 'Aset Tidak Lancar' },
    ]
  },
  {
    header: 'LIABILITIES',
    options: [
      { value: 'Kewajiban Lancar', label: 'Kewajiban Lancar' },
      { value: 'Kewajiban Jangka Panjang', label: 'Kewajiban Jangka Panjang' },
      { value: 'Modal Saham', label: 'Modal Saham' },
      { value: 'Laba Ditahan', label: 'Laba Ditahan' },
    ]
  },
  {
    header: 'EQUITY',
    options: [
      { value: 'Ekuitas Pemilik', label: 'Ekuitas Pemilik' }
    ]
  },
  {
    header: 'INCOME',
    options: [
      { value: 'Pendapatan Penjualan', label: 'Pendapatan Penjualan' },
      { value: 'Pendapatan Lainnya', label: 'Pendapatan Lainnya' }
    ]
  },
  {
    header: 'EXPENSES',
    options: [
      { value: 'Harga Pokok Penjualan (HPP)', label: 'Harga Pokok Penjualan (HPP)' },
      { value: 'Biaya Penggajian', label: 'Biaya Penggajian' },
      { value: 'Biaya Umum dan Administrasi', label: 'Biaya Umum dan Administrasi' }
    ]
  }
];

export const CoaTab: React.FC = () => {
  const [accounts, setAccounts] = useState<CoaAccount[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);

  const getDisplayAccountName = (account: CoaAccount) => {
    if (!account.parentAccount) {
      return account.name;
    }
    
    let displayName = account.name || '';
    const parent = findParentOf(account, accounts);
    if (parent) {
      const parentNameLower = (parent.name || '').toLowerCase();
      const displayNameLower = displayName.toLowerCase();
      
      if (displayNameLower.startsWith(parentNameLower + ':')) {
        displayName = displayName.substring(parentNameLower.length + 1).trim();
      } else {
        const colonIndex = displayName.indexOf(':');
        if (colonIndex !== -1) {
          const prefix = displayName.substring(0, colonIndex).trim().toLowerCase();
          if (prefix === parentNameLower || parentNameLower.includes(prefix) || prefix.includes(parentNameLower)) {
            displayName = displayName.substring(colonIndex + 1).trim();
          }
        }
      }
    } else {
      const cleanParentAccount = (account.parentAccount || '').replace(/^\d+\s*-\s*/, '').trim().toLowerCase();
      const displayNameLower = displayName.toLowerCase();
      if (displayNameLower.startsWith(cleanParentAccount + ':')) {
        displayName = displayName.substring(cleanParentAccount.length + 1).trim();
      } else {
        const colonIndex = displayName.indexOf(':');
        if (colonIndex !== -1) {
          const prefix = displayName.substring(0, colonIndex).trim().toLowerCase();
          if (prefix === cleanParentAccount || cleanParentAccount.includes(prefix) || prefix.includes(cleanParentAccount)) {
            displayName = displayName.substring(colonIndex + 1).trim();
          }
        }
      }
    }
    return displayName;
  };

  const [loading, setLoading] = useState(true);
  
  // Migration states
      const [migrating, setMigrating] = useState(false);
  
  // Search and date filters
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [presetLabel, setPresetLabel] = useState('Semua');
  
  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<CoaAccount | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState<CoaAccount | null>(null);
  const [coaModal, setCoaModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'error' | 'success';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'confirm'
  });

  const showCoaAlert = (title: string, message: string, type: 'confirm' | 'error' | 'success', onConfirm?: () => void) => {
    setCoaModal({
      isOpen: true,
      title,
      message,
      type,
      onConfirm
    });
  };

  // Form states
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'Assets' as CoaAccount['type'],
    subType: '',
    parentAccount: '',
    isActive: true,
    description: ''
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Custom modal inputs and dropdown overlays
  const [isSubAccount, setIsSubAccount] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [isJenisDropdownOpen, setIsJenisDropdownOpen] = useState(false);
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);

  // Bulk actions status
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dynamic dropdown states
  const [jenisAkunGroups, setJenisAkunGroups] = useState<JenisAkunGroup[]>(DEFAULT_JENIS_AKUN_GROUPS);
  const [addingHeader, setAddingHeader] = useState<string | null>(null);
  const [newJenisName, setNewJenisName] = useState('');
  const [deleteModeHeaders, setDeleteModeHeaders] = useState<Set<string>>(new Set());

  // Ref container for close on click-outside
  const jenisDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (jenisDropdownRef.current && !jenisDropdownRef.current.contains(event.target as Node)) {
        setIsJenisDropdownOpen(false);
        setAddingHeader(null);
        setNewJenisName('');
        setDeleteModeHeaders(new Set());
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 1. Seed & fetch accounts inside onSnapshot
  useEffect(() => {
    const activeUnsubscribes: (() => void)[] = [];
    let isMounted = true;

    const initDb = async () => {
      try {
        // A1. Active Migration for Freight-In (1120) and AR:Platform (1125)
        try {
          const coaSnap = await getDocs(collection(db, 'coa'));
          const coaDocs = coaSnap.docs;

          const doc1120 = coaDocs.find(d => d.id === '1120');
          const doc5150 = coaDocs.find(d => d.id === '5150');
          
          let migrationNeeded = false;
          // If 1120 exists and is "AR:Platform", we must migrate it to 1125
          if (doc1120 && doc1120.data().name === 'AR:Platform') {
            migrationNeeded = true;
          }
          // If 5150 exists in the database with a name other than Beban Kerugian Pembelian, we must remove it and put it under 1120
          if (doc5150 && doc5150.data().name !== 'Beban Kerugian Pembelian') {
            migrationNeeded = true;
          }
          // If 1120 does not exist at all, we should create it
          const doc1120New = coaDocs.find(d => d.id === '1120' && d.data().name === 'Freight-in Dalam Kapitalisasi');
          if (!doc1120New) {
            migrationNeeded = true;
          }

          if (migrationNeeded) {
            console.log("Database Migration: Starting database migration for Freight-in Dalam Kapitalisasi (1120) and AR:Platform (1125)...");
            const migrationBatch = writeBatch(db);
            
            // 1. Save AR:Platform under 1125
            const docRef1125 = doc(db, 'coa', '1125');
            migrationBatch.set(docRef1125, {
              id: '1125',
              code: '1125',
              name: 'AR:Platform',
              type: 'Assets',
              subType: 'Aset Lancar',
              isActive: true,
              createdAt: Timestamp.now()
            }, { merge: true });

            // 2. Save Freight-in Dalam Kapitalisasi under 1120
            const docRef1120 = doc(db, 'coa', '1120');
            migrationBatch.set(docRef1120, {
              id: '1120',
              code: '1120',
              name: 'Freight-in Dalam Kapitalisasi',
              type: 'Assets',
              subType: 'Aset Lancar',
              isActive: true,
              createdAt: Timestamp.now()
            }, { merge: true });

            // 3. Delete 5150 if it's not the Beban Kerugian Pembelian account
            if (doc5150 && doc5150.data().name !== 'Beban Kerugian Pembelian') {
              migrationBatch.delete(doc(db, 'coa', '5150'));
            }

            await migrationBatch.commit();
            console.log("Database Migration: Database migration for Freight-in and AR:Platform completed successfully.");
          }
        } catch (err) {
          console.error("Error migrating Freight-in and AR:Platform in COA:", err);
        }

        // A. Identify if any legacy non-4-digit COA entries or legacy codes exist
        const snap = await getDocs(collection(db, 'coa'));
        if (!isMounted) return;
        const legacyList: CoaAccount[] = [];

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as CoaAccount;
          if (data.code && (data.code.length !== 4 || data.code === '11102' || data.code === '11301' || data.code === '11300' || data.code === '5140')) {
            legacyList.push({ id: docSnap.id, ...data });
          }
        });

        // Also check if any journal entries contain old "Cash:IDR" or "Freight-in" references
        const journalsSnap = await getDocs(collection(db, 'journalEntries'));
        if (!isMounted) return;
        let hasLegacyJournals = false;
        journalsSnap.docs.forEach((docSnap) => {
          const jData = docSnap.data() as JournalEntry;
          if (jData.lines && Array.isArray(jData.lines)) {
            const hasLegacyLine = jData.lines.some(l => l.account === 'Cash:IDR' || l.account === 'Freight-in');
            if (hasLegacyLine) {
              hasLegacyJournals = true;
            }
          }
        });

        if (legacyList.length > 0 || hasLegacyJournals) {
                  } else {
                  }

        // A2. Resolve duplicate "3101 - Modal Awal" and scan for any other duplicate accounts
        try {
          const allCoaSnap = await getDocs(collection(db, 'coa'));
          const coaDocs = allCoaSnap.docs;
          
          // 1. Specific duplicate resolution for "3101"
          const doc3101 = coaDocs.find(d => d.id === '3101');
          const is3101ModalAwal = doc3101 && (doc3101.data().name === 'Modal Awal' || doc3101.data().name === '3101 - Modal Awal' || doc3101.data().name === 'Modal Awal (3101)');
          if (is3101ModalAwal) {
            console.log("Found duplicate account 3101 - Modal Awal. Initiating resolution...");
            
            // Search and repoint any journal entries referencing 3101-specific names
            const journalsSnap = await getDocs(collection(db, 'journalEntries'));
            const journalBatch = writeBatch(db);
            let updatedJournalsCount = 0;

            journalsSnap.docs.forEach((docSnap) => {
              const jData = docSnap.data() as JournalEntry;
              let changed = false;
              if (jData.lines && Array.isArray(jData.lines)) {
                const updatedLines = jData.lines.map((line) => {
                  const accountName = (line.account || '').trim();
                  if (
                    accountName === '3101 - Modal Awal' || 
                    accountName === 'Modal Awal (3101)' || 
                    accountName === '3101'
                  ) {
                    changed = true;
                    return { ...line, account: 'Modal Awal' };
                  }
                  return line;
                });
                if (changed) {
                  updatedJournalsCount++;
                  journalBatch.update(docSnap.ref, { lines: updatedLines });
                }
              }
            });

            if (updatedJournalsCount > 0) {
              await journalBatch.commit();
              console.log(`Successfully updated ${updatedJournalsCount} journal entries from 3101 to 3100.`);
            }

            // Delete 3101
            await deleteDoc(doc(db, 'coa', '3101'));
            console.log("Successfully deleted duplicate account 3101.");
          }

          // A2.5. Resolve duplicate/wrongly coded "5150 - Beban Kerugian Pembelian" and migrate to "5500"
          try {
            const doc5150 = coaDocs.find(d => d.id === '5150' || d.data().code === '5150');
            if (doc5150) {
              console.log("Found account 5150 - Beban Kerugian Pembelian. Initiating resolution to 5500...");
              
              // 1. Ensure 5500 exists
              const docRef5500 = doc(db, 'coa', '5500');
              await setDoc(docRef5500, {
                id: '5500',
                code: '5500',
                name: 'Beban Kerugian Pembelian',
                type: 'Expenses',
                subType: 'Biaya Umum dan Administrasi',
                isActive: true,
                createdAt: Timestamp.now()
              }, { merge: true });

              // 2. Search and repoint any journal entries referencing 5150 to 5500
              const journalsSnap = await getDocs(collection(db, 'journalEntries'));
              const journalBatch = writeBatch(db);
              let updatedJournalsCount = 0;

              journalsSnap.docs.forEach((docSnap) => {
                const jData = docSnap.data() as JournalEntry;
                let changed = false;
                if (jData.lines && Array.isArray(jData.lines)) {
                  const updatedLines = jData.lines.map((line) => {
                    if (line.accountCode === '5150' || (line.account === 'Beban Kerugian Pembelian' && line.accountCode !== '5500')) {
                      changed = true;
                      return { ...line, accountCode: '5500', account: 'Beban Kerugian Pembelian' };
                    }
                    return line;
                  });
                  if (changed) {
                    updatedJournalsCount++;
                    journalBatch.update(docSnap.ref, { lines: updatedLines });
                  }
                }
              });

              if (updatedJournalsCount > 0) {
                await journalBatch.commit();
                console.log(`Successfully updated ${updatedJournalsCount} journal entries from 5150 to 5500.`);
              }

              // 3. Delete 5150
              await deleteDoc(doc(db, 'coa', '5150'));
              console.log("Successfully deleted duplicate account 5150.");
            }
          } catch (err) {
            console.error("Error migrating Beban Kerugian Pembelian from 5150 to 5500:", err);
          }

          // 2. Scan the rest of the database for any other duplicated accounts (same code but different doc ID)
          const codeToDocMap: Record<string, typeof coaDocs> = {};
          coaDocs.forEach((docSnap) => {
            const data = docSnap.data() as CoaAccount;
            if (data.code) {
              if (!codeToDocMap[data.code]) {
                codeToDocMap[data.code] = [];
              }
              codeToDocMap[data.code].push(docSnap);
            }
          });

          const duplicateBatch = writeBatch(db);
          let hasDuplicateCleanup = false;

          Object.entries(codeToDocMap).forEach(([code, docsList]) => {
            if (docsList.length > 1) {
              console.warn(`Database Integrity Warn: Found ${docsList.length} duplicate documents for COA code ${code}.`);
              
              // We keep the authoritative one: either doc with id === code, or the oldest one
              let authoritativeDoc = docsList.find(d => d.id === code);
              if (!authoritativeDoc) {
                authoritativeDoc = docsList[0];
              }

              docsList.forEach((d) => {
                if (d.id !== authoritativeDoc.id) {
                  console.log(`Database Integrity: Removing extra duplicate document for code ${code} with document ID ${d.id}`);
                  duplicateBatch.delete(d.ref);
                  hasDuplicateCleanup = true;
                }
              });
            }
          });

          if (hasDuplicateCleanup) {
            await duplicateBatch.commit();
            console.log("Duplicate COA code database cleanup completed successfully.");
          }

        } catch (err) {
          console.error("Error running integrity COA duplicate check:", err);
        }

        // B. Upsert/seed 4-digit accounts so they are fully populated in Firestore only if the collection is empty
        if (snap.empty) {
          const seedBatch = writeBatch(db);
          DEFAULT_COA_ACCOUNTS.forEach((acc) => {
            const docRef = doc(db, 'coa', acc.code);
            seedBatch.set(docRef, {
              ...acc,
              id: acc.code,
              createdAt: Timestamp.now()
            }, { merge: true });
          });
          await seedBatch.commit();
        }

        if (!isMounted) return;

        // C. Clean up legacy journalEntries - ensure they have accountCode populated, and standard names
        const nameToCodeMap: Record<string, string> = {
          'cash:ntd': '1101',
          'cash:idr': '1102',
          'cash rupiah': '1102',
          'cash:cod': '1103',
          'ar:platform': '1125',
          'inventory': '1200',
          'inventory on hand': '1201',
          'inventory in delivery': '1202',
          'inventory in transit': '1203',
          'ap:partners': '2101',
          'accrued payroll': '2102',
          'retained earnings': '3100',
          'modal awal': '3100',
          '3101 - modal awal': '3100',
          'modal awal (3101)': '3100',
          'revenue:tokopedia': '4101',
          'revenue:shopee': '4102',
          'revenue:platform': '4103',
          'cogs': '5100',
          'beban gaji': '5120',
          'partnerprofitshare:expense': '5130',
          'freight-in dalam kapitalisasi': '1120',
          'biaya pengiriman / freight-in': '1120',
          'freight-in': '1120'
        };

        // Add live accounts to mapping as well
        const allCoaSnapForMapping = await getDocs(collection(db, 'coa'));
        allCoaSnapForMapping.docs.forEach((d) => {
          const data = d.data() as CoaAccount;
          if (data.name && data.code) {
            nameToCodeMap[data.name.trim().toLowerCase()] = data.code;
          }
        });

        // Get code to name mapping for renaming update
        const codeToNameMap: Record<string, string> = {};
        allCoaSnapForMapping.docs.forEach((d) => {
          const data = d.data() as CoaAccount;
          if (data.name && data.code) {
            codeToNameMap[data.code] = data.name;
          }
        });
        // Add defaults as fallback
        DEFAULT_COA_ACCOUNTS.forEach(acc => {
          if (!codeToNameMap[acc.code]) {
            codeToNameMap[acc.code] = acc.name;
          }
        });

        const journalBatch = writeBatch(db);
        let hasJournalChanges = false;

        journalsSnap.docs.forEach((docSnap) => {
          const jData = docSnap.data() as JournalEntry;
          let changed = false;
          if (jData.lines && Array.isArray(jData.lines)) {
            const updatedLines = jData.lines.map((line) => {
              const accountStr = (line.account || '').trim();
              let targetCode = line.accountCode || '';
              let targetName = accountStr;

              // If accountCode is not present, find it
              if (!targetCode) {
                if (/^\d{4}$/.test(accountStr)) {
                  targetCode = accountStr;
                } else {
                  targetCode = nameToCodeMap[accountStr.toLowerCase()] || '';
                }
              }

              // Explicit code migration
              if (targetCode === '5150' && accountStr.toLowerCase().includes('freight')) {
                targetCode = '1120';
              }
              if (targetCode === '1120' && (accountStr.toLowerCase().includes('platform') || (line.accountCode === '1120' && !accountStr.toLowerCase().includes('freight')))) {
                targetCode = '1125';
              }

              // Resolve correct current name
              if (targetCode && codeToNameMap[targetCode]) {
                targetName = codeToNameMap[targetCode];
              }

              if (line.account !== targetName || line.accountCode !== targetCode) {
                changed = true;
                return { ...line, account: targetName, accountCode: targetCode };
              }
              return line;
            });

            if (changed) {
              hasJournalChanges = true;
              journalBatch.update(docSnap.ref, { lines: updatedLines });
            }
          }
        });

        if (hasJournalChanges) {
          await journalBatch.commit();
        }

        if (!isMounted) return;

        // C. Setup real-time listener for COA
        const unsubCoa = onSnapshot(collection(db, 'coa'), (snap) => {
          if (!isMounted) return;
          const list: CoaAccount[] = [];
          const seen = new Set<string>();
          snap.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() } as CoaAccount;
            if (data.code && !seen.has(data.code)) {
              seen.add(data.code);
              list.push(data);
            }
          });
          setAccounts(list.sort((a, b) => (a.code || '').localeCompare(b.code || '')));
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'coa');
        });
        activeUnsubscribes.push(unsubCoa);

        // D. Setup real-time listener for Journal entries
        const unsubJournal = onSnapshot(collection(db, 'journalEntries'), (snap) => {
          if (!isMounted) return;
          const list: JournalEntry[] = [];
          snap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as JournalEntry);
          });
          setJournals(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'journalEntries');
        });
        activeUnsubscribes.push(unsubJournal);

        // E. Setup real-time listener for customized coa_jenis_akun options
        const unsubJenis = onSnapshot(doc(db, 'categories', 'coa_jenis_akun'), (docSnap) => {
          if (!isMounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.groups) {
              setJenisAkunGroups(data.groups);
            }
          } else {
            setDoc(doc(db, 'categories', 'coa_jenis_akun'), {
              groups: DEFAULT_JENIS_AKUN_GROUPS
            }).catch(e => console.error("Error seeding dynamic coa_jenis_akun:", e));
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'categories/coa_jenis_akun');
        });
        activeUnsubscribes.push(unsubJenis);

        // If unmounted while registrations were in-flight, clean them up immediately
        if (!isMounted) {
          activeUnsubscribes.forEach(unsub => unsub());
        }

      } catch (err) {
        console.error("Error initializing COA Tab data:", err);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initDb();

    return () => {
      isMounted = false;
      activeUnsubscribes.forEach(unsub => unsub());
    };
  }, []);

  ;

  // 2. ACCOUNT BALANCE CALCULATION LOGIC
  // - Asset & Expense accounts: Saldo = Total Debit - Total Kredit
  // - Liability, Equity & Revenue accounts: Saldo = Total Kredit - Total Debit
  // - Filters applied dynamically using start / end dates if present
  const getAccountBalance = (accountName: string, accountType: CoaAccount['type']) => {
    const account = accounts.find(a => a.name === accountName);
    if (!account) return 0;

    const hasPostings = hasAccountPostings(account, accounts, journals);
    if (!hasPostings) return null;

    return getAccountBalanceForPeriod(account, accounts, journals, startDate, endDate);
  };

  // Status toggle in db
  const handleToggleStatus = async (account: CoaAccount) => {
    try {
      const docRef = doc(db, 'coa', account.id);
      await updateDoc(docRef, { isActive: !account.isActive });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coa/${account.id}`);
    }
  };

  // Delete account
  const handleDeleteAccount = (id: string) => {
    const account = accounts.find(acc => acc.id === id);
    if (!account) return;

    // Validation 1: Check if the account has sub-accounts utilizing it as a parent
    const hasChildren = accounts.some(acc => acc.parentAccount === account.name || acc.parentAccount === `${account.code} - ${account.name}`);
    if (hasChildren) {
      showCoaAlert(
        'Tidak Bisa Menghapus',
        `Akun "${account.name}" masih digunakan sebagai Akun Induk oleh akun lain. Silakan ubah akun anak terlebih dahulu.`,
        'error'
      );
      return;
    }

    // Validation 2: Check if there are any journal transactions using this account name or code
    const referencedJournals = journals.filter(entry => 
      entry.lines?.some(line => 
        line.account === account.name || 
        line.accountCode === account.code || 
        line.account === `${account.code} - ${account.name}` ||
        line.account === account.code
      )
    );
    const count = referencedJournals.length;
    if (count > 0) {
      showCoaAlert(
        'Tidak Bisa Menghapus',
        `Tidak bisa menghapus akun ini, sudah digunakan di ${count} entri jurnal. Hapus/reverse transaksi terkait terlebih dahulu.`,
        'error'
      );
      return;
    }

    showCoaAlert(
      'Konfirmasi Hapus Akun',
      `Hapus akun "${account.name}"? Tindakan ini tidak bisa dibatalkan.`,
      'confirm',
      async () => {
        try {
          setAccounts(prev => prev.filter(acc => acc.id !== id));
          await deleteDoc(doc(db, 'coa', id));
          showCoaAlert(
            'Berhasil Dihapus',
            `Akun "${account.name}" telah berhasil dihapus secara permanen dari Bagan Akun.`,
            'success'
          );
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `coa/${id}`);
          showCoaAlert(
            'Gagal Menghapus',
            'Terjadi kesalahan saat menghapus akun dari Firestore database.',
            'error'
          );
        }
      }
    );
  };

  // Dynamic category / jenis_akun helpers
  const handleAddNewJenisAkun = async (header: string) => {
    const trimmed = newJenisName.trim();
    if (!trimmed) return;

    // Check if duplicate
    const exists = jenisAkunGroups.some((g) =>
      g.options.some((opt) => opt.value.toLowerCase() === trimmed.toLowerCase())
    );
    if (exists) {
      alert(`Jenis Akun "${trimmed}" sudah ada!`);
      return;
    }

    const updatedGroups = jenisAkunGroups.map((g) => {
      if (g.header === header) {
        return {
          ...g,
          options: [...g.options, { value: trimmed, label: trimmed }]
        };
      }
      return g;
    });

    try {
      await setDoc(doc(db, 'categories', 'coa_jenis_akun'), {
        groups: updatedGroups
      });
      setAddingHeader(null);
      setNewJenisName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories/coa_jenis_akun');
    }
  };

  const handleDeleteJenisAkun = async (header: string, itemValue: string) => {
    const accountsUsingIt = accounts.filter((acc) => acc.subType === itemValue);
    if (accountsUsingIt.length > 0) {
      alert(`Tidak bisa menghapus, masih digunakan oleh ${accountsUsingIt.length} akun.`);
      return;
    }

    if (!window.confirm(`Apakah Kamu Ingin Menghapus '${itemValue}' dari Jenis Akun?`)) {
      return;
    }

    const updatedGroups = jenisAkunGroups.map((g) => {
      if (g.header === header) {
        return {
          ...g,
          options: g.options.filter((opt) => opt.value !== itemValue)
        };
      }
      return g;
    });

    try {
      await setDoc(doc(db, 'categories', 'coa_jenis_akun'), {
        groups: updatedGroups
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories/coa_jenis_akun');
    }
  };

  const toggleDeleteMode = (header: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setDeleteModeHeaders((prev) => {
      const next = new Set(prev);
      if (next.has(header)) {
        next.delete(header);
      } else {
        next.add(header);
      }
      return next;
    });
  };

  // Open add/edit modal
  const handleOpenAddEdit = (account: CoaAccount | null = null) => {
    setSelectedAccount(account);
    if (account) {
      setFormData({
        code: account.code,
        name: account.name,
        type: account.type,
        subType: account.subType,
        parentAccount: account.parentAccount || '',
        isActive: account.isActive,
        description: account.description || ''
      });
      setIsSubAccount(!!account.parentAccount);
      setParentSearch(account.parentAccount || '');
    } else {
      setFormData({
        code: '',
        name: '',
        type: 'Assets',
        subType: '',
        parentAccount: '',
        isActive: true,
        description: ''
      });
      setIsSubAccount(false);
      setParentSearch('');
    }
    setFormError('');
    setIsJenisDropdownOpen(false);
    setIsParentDropdownOpen(false);
    setIsAddEditOpen(true);
  };

  // Save account (submit)
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError('');

    if (!formData.name) {
      setFormError('Nama Akun harus diisi.');
      return;
    }
    if (!formData.code) {
      setFormError('Kode Akun harus diisi.');
      return;
    }
    if (!formData.subType) {
      setFormError('Jenis Akun harus diisi.');
      return;
    }

    // Check duplicate code (excluding current one)
    const duplicate = accounts.find(acc => acc.code === formData.code && (!selectedAccount || acc.id !== selectedAccount.id));
    if (duplicate) {
      setFormError('Kode akun sudah digunakan oleh akun lain.');
      return;
    }

    // Check duplicate name (excluding current one) - case insensitive and trimmed
    const duplicateName = accounts.find(acc => 
      (acc.name || '').trim().toLowerCase() === formData.name.trim().toLowerCase() && 
      (!selectedAccount || acc.id !== selectedAccount.id)
    );
    if (duplicateName) {
      setFormError(`Nama akun "${formData.name}" sudah digunakan oleh akun lain dengan kode ${duplicateName.code}.`);
      return;
    }

    if (isSubAccount && !formData.parentAccount) {
      setFormError('Akun Induk harus dipilih jika dijadikan sub-akun.');
      return;
    }

    const getCategoryFromSubType = (subType: string): CoaAccount['type'] => {
      const foundGroup = jenisAkunGroups.find(g => 
        g.options.some(opt => opt.value === subType)
      );
      if (foundGroup && HEADER_TO_TYPE_MAP[foundGroup.header]) {
        return HEADER_TO_TYPE_MAP[foundGroup.header];
      }
      return determineAccountCategory(subType);
    };

    const determinedCategory = getCategoryFromSubType(formData.subType);

    setSubmitting(true);
    try {
      if (selectedAccount) {
        // Edit
        const docRef = doc(db, 'coa', selectedAccount.id);
        const oldName = selectedAccount.name;
        const newName = formData.name;
        const oldCode = selectedAccount.code;
        const newCode = formData.code;

        await updateDoc(docRef, {
          code: formData.code,
          name: formData.name,
          type: determinedCategory,
          subType: formData.subType,
          parentAccount: isSubAccount ? formData.parentAccount : '',
          isActive: formData.isActive,
          description: formData.description || ''
        });

        // If name or code changed, cascade to child accounts and all journal entries
        if (oldName !== newName || oldCode !== newCode) {
          // 1. Cascade rename to child accounts
          const childBatch = writeBatch(db);
          let childChanged = false;
          accounts.forEach((acc) => {
            const isMatch = acc.parentAccount === oldName || acc.parentAccount === `${oldCode} - ${oldName}`;
            if (isMatch) {
              childChanged = true;
              childBatch.update(doc(db, 'coa', acc.id), {
                parentAccount: newName
              });
            }
          });
          if (childChanged) {
            await childBatch.commit();
          }

          // 2. Cascade rename to all journal entries referencing this account in the database
          const journalsSnap = await getDocs(collection(db, 'journalEntries'));
          const journalBatch = writeBatch(db);
          let journalChangedCount = 0;

          journalsSnap.docs.forEach((docSnap) => {
            const jData = docSnap.data() as JournalEntry;
            let changed = false;
            if (jData.lines && Array.isArray(jData.lines)) {
              const updatedLines = jData.lines.map((line) => {
                const lineAccount = (line.account || '').trim();
                const lineCode = line.accountCode || '';

                const matchesCode = lineCode === oldCode || lineCode === newCode;
                const matchesName = lineAccount === oldName || lineAccount === `${oldCode} - ${oldName}` || lineAccount === oldCode;

                if (matchesCode || matchesName) {
                  changed = true;
                  return {
                    ...line,
                    account: newName,
                    accountCode: newCode
                  };
                }
                return line;
              });

              if (changed) {
                journalChangedCount++;
                journalBatch.update(docSnap.ref, { lines: updatedLines });
              }
            }
          });

          if (journalChangedCount > 0) {
            await journalBatch.commit();
            console.log(`Cascaded account rename from "${oldName}" to "${newName}" across ${journalChangedCount} journal entries.`);
          }
        }
      } else {
        // Create
        const docRef = doc(collection(db, 'coa'));
        await setDoc(docRef, {
          id: docRef.id,
          code: formData.code,
          name: formData.name,
          type: determinedCategory,
          subType: formData.subType,
          parentAccount: isSubAccount ? formData.parentAccount : '',
          isActive: formData.isActive,
          description: formData.description || '',
          createdAt: Timestamp.now()
        });
      }
      setIsAddEditOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'coa');
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk actions
  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllInSection = (sectionAccounts: CoaAccount[], checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      sectionAccounts.forEach(acc => {
        if (checked) {
          next.add(acc.id);
        } else {
          next.delete(acc.id);
        }
      });
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;

    showCoaAlert(
      'Hapus Masal Akun',
      `Apakah Anda yakin ingin menghapus ${selectedIds.size} akun terpilih secara permanen? Sisa saldo transaksi Anda akan disesuaikan otomatis.`,
      'confirm',
      async () => {
        try {
          const idsArray = Array.from(selectedIds) as string[];
          const idsSet = new Set<string>(idsArray);
          setAccounts(prev => prev.filter(acc => !idsSet.has(acc.id)));
          const batch = writeBatch(db);
          idsArray.forEach(id => {
            batch.delete(doc(db, 'coa', id));
          });
          await batch.commit();
          setSelectedIds(new Set());
          showCoaAlert('Berhasil Dihapus', `${idsArray.length} akun telah berhasil dihapus secara masal.`, 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'coa_bulk');
          showCoaAlert('Gagal Menghapus', 'Terjadi kesalahan saat menghapus paket akun secara masal.', 'error');
        }
      }
    );
  };

  const handleBulkEdit = () => {
    if (selectedIds.size === 0) return;
    alert(`Bulk edit untuk ${selectedIds.size} akun terpilih.`);
  };

  // Export functions (CSV)
  const handleExportCSV = () => {
    const headers = ['Kode', 'Nama', 'Kategori', 'Sub-Jenis', 'Akun Induk', 'Status'];
    const rows = accounts.map(acc => [
      acc.code,
      acc.name,
      acc.type,
      acc.subType,
      acc.parentAccount || '-',
      acc.isActive ? 'Diaktifkan' : 'Nonaktifkan'
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Chart_of_Accounts.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Duplicate/import mockup
  const handleImportMockup = async () => {
    try {
      const batch = writeBatch(db);
      const duplicateSuffix = Math.floor(Math.random() * 100);
      const docRef = doc(collection(db, 'coa'));
      await setDoc(docRef, {
        id: docRef.id,
        code: `X${duplicateSuffix}`,
        name: `Copy Account ${duplicateSuffix}`,
        type: 'Assets',
        subType: 'Aset Lancar',
        parentAccount: '',
        isActive: true,
        createdAt: Timestamp.now()
      });
      alert('Berhasil mengimpor akun baru sebagai contoh.');
    } catch (e) {
      console.error(e);
    }
  };

  // Ledger detail data
  const getLedgerLines = (accountName: string) => {
    const lines: Array<{
      date: any;
      id: string;
      description: string;
      debit: number;
      credit: number;
      refType: string;
    }> = [];

    journals.forEach(entry => {
      if (!entry.lines) return;
      entry.lines.forEach(line => {
        if (line.account === accountName) {
          lines.push({
            date: entry.date,
            id: entry.id,
            description: entry.description,
            debit: line.debit / 100, // stored in cents
            credit: line.credit / 100, // stored in cents
            refType: entry.refType || 'Manual'
          });
        }
      });
    });

    // Sort ledger entries chronologically
    return lines.sort((a, b) => {
      const dateA = a.date?.seconds ? a.date.seconds : new Date(a.date).getTime();
      const dateB = b.date?.seconds ? b.date.seconds : new Date(b.date).getTime();
      return dateA - dateB;
    });
  };

  // Group accounts
  const groupedAccounts = {
    Assets: accounts.filter(acc => acc.type === 'Assets' && (acc.name || '').toLowerCase().includes(searchQuery.toLowerCase())),
    Liabilities: accounts.filter(acc => acc.type === 'Liabilities' && (acc.name || '').toLowerCase().includes(searchQuery.toLowerCase())),
    Equity: accounts.filter(acc => acc.type === 'Equity' && (acc.name || '').toLowerCase().includes(searchQuery.toLowerCase())),
    Revenue: accounts.filter(acc => acc.type === 'Revenue' && (acc.name || '').toLowerCase().includes(searchQuery.toLowerCase())),
    Expenses: accounts.filter(acc => acc.type === 'Expenses' && (acc.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Section per Screenshot layout instructions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div>
          <div className="text-xs text-neutral-450 font-medium tracking-wide font-numeric mb-1">
            Dasbor &gt; Bagan Akun / CoA
          </div>
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
            Kelola Bagan Akun / CoA
          </h1>
        </div>
        
        {/* Top Right Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-teal-600 dark:text-teal-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition flex items-center gap-1.5 text-xs font-semibold"
            title="Export CSV"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          
          <button
            onClick={handleImportMockup}
            className="p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-teal-600 dark:text-teal-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition flex items-center gap-1.5 text-xs font-semibold"
            title="Import/Duplicate"
          >
            <Copy className="h-4 w-4" /> Import Demo
          </button>
          
          <button
            onClick={() => handleOpenAddEdit(null)}
            className="p-2 bg-teal-500 hover:bg-teal-605 text-white rounded-lg transition flex items-center gap-1.5 text-xs font-semibold shadow-xs"
            title="Add Account"
          >
            <Plus className="h-4 w-4" /> Tambah Akun
          </button>
          
          <button
            onClick={handleBulkEdit}
            disabled={selectedIds.size === 0}
            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
              selectedIds.size > 0 
                ? 'border-teal-500 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/20' 
                : 'border-neutral-200 text-neutral-400 cursor-not-allowed dark:border-neutral-800'
            }`}
          >
            Bulk Edit ({selectedIds.size})
          </button>

          <button
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition ${
              selectedIds.size > 0 
                ? 'bg-red-50 text-red-650 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400' 
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed dark:bg-neutral-800'
            }`}
          >
            Bulk Delete
          </button>
        </div>
      </div>

      


      {/* 2. Filter Bar */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker 
            startDate={startDate}
            endDate={endDate}
            presetLabel={presetLabel}
            onChange={(start, end, label) => {
              setStartDate(start);
              setEndDate(end);
              if (label) setPresetLabel(label);
            }}
          />

          <div className="relative">
            <input
              type="text"
              placeholder="Cari nama akun..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-60 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-700 dark:text-neutral-200"
            />
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => {
              setSearchQuery('');
              setStartDate(null);
              setEndDate(null);
              setPresetLabel('Semua');
            }}
            className="p-2 bg-red-50 dark:bg-red-950/15 text-red-650 dark:text-red-400 hover:bg-red-100 rounded-lg transition"
            title="Reset Filters"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3. Accounts Lists (Divided by type sections) */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <RefreshCw className="h-7 w-7 text-teal-500 animate-spin" />
          <span className="ml-2 text-sm text-neutral-500">Memuat Bagan Akun...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {(Object.keys(groupedAccounts) as Array<CoaAccount['type']>).map((type) => {
            const sectionAccounts = groupedAccounts[type];
            const allChecked = sectionAccounts.length > 0 && sectionAccounts.every(acc => selectedIds.has(acc.id));
            
            return (
              <div key={type} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
                {/* Header section name */}
                <div className="bg-neutral-50 dark:bg-neutral-850 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-neutral-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-500" />
                    {type === 'Assets' ? '💰 Assets' : 
                     type === 'Liabilities' ? '💳 Liabilities' : 
                     type === 'Equity' ? '💎 Equity' : 
                     type === 'Revenue' ? '📈 Income' : '📉 Expenses'}
                  </h3>
                  <span className="text-xs text-neutral-500 font-numeric">
                    {sectionAccounts.length} Akun
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-100/50 dark:bg-neutral-950 border-b border-neutral-250 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-semibold">
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) => handleSelectAllInSection(sectionAccounts, e.target.checked)}
                            className="rounded border-neutral-300 dark:border-neutral-700 text-teal-605"
                          />
                        </th>
                        <th className="p-3 w-28">KODE</th>
                        <th className="p-3">NAMA AKUN</th>
                        <th className="p-3 w-40">JENIS</th>
                        <th className="p-3 w-48">NAMA AKUN INDUK</th>
                        <th className="p-3 w-32 text-center">STATUS</th>
                        <th className="p-3 w-32 text-center">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-150 dark:divide-neutral-850">
                      {sectionAccounts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-neutral-450 dark:text-neutral-500">
                            Tidak ada akun untuk kategori ini
                          </td>
                        </tr>
                      ) : (
                        sectionAccounts.map((account, idx) => {
                          const isParent = isParentAccount(account, accounts);
                          const saldo = (isParent || startDate || endDate) 
                            ? getAccountBalance(account.name, account.type)
                            : (account.balance !== undefined ? account.balance : getAccountBalance(account.name, account.type));
                          return (
                            <tr key={`${account.id || account.code}-${idx}`} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/20 transition">
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(account.id)}
                                  onChange={() => handleSelectRow(account.id)}
                                  className="rounded border-neutral-300 dark:border-neutral-700 text-teal-605"
                                />
                              </td>
                              <td className="p-3 font-numeric font-bold text-neutral-700 dark:text-neutral-300">
                                {account.code}
                              </td>
                              <td className="p-3">
                                {account.parentAccount ? (
                                  <div className="flex items-center gap-1.5 pl-4">
                                    <span className="text-neutral-400 dark:text-neutral-500 font-medium">↳</span>
                                    <button
                                      onClick={() => {
                                        setLedgerAccount(account);
                                        setIsLedgerOpen(true);
                                      }}
                                      className="font-semibold text-teal-600 dark:text-teal-400 hover:underline text-left"
                                    >
                                      {getDisplayAccountName(account)}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setLedgerAccount(account);
                                      setIsLedgerOpen(true);
                                    }}
                                    className="font-bold text-teal-600 dark:text-teal-400 hover:underline text-left"
                                  >
                                    {account.name}
                                  </button>
                                )}
                              </td>
                              <td className="p-3 text-neutral-600 dark:text-neutral-400">
                                {account.subType}
                              </td>
                              <td className="p-3 text-neutral-450 dark:text-neutral-500">
                                {account.parentAccount || '-'}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleToggleStatus(account)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider transition uppercase ${
                                    account.isActive 
                                      ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200 dark:border-green-900/35'
                                      : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-750'
                                  }`}
                                >
                                  {account.isActive ? 'Diaktifkan' : 'Nonaktifkan'}
                                </button>
                              </td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setLedgerAccount(account);
                                      setIsLedgerOpen(true);
                                    }}
                                    className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg dark:bg-amber-950/20 dark:text-amber-400 transition"
                                    title="View Ledger Detail"
                                  >
                                    <TrendingUp className="h-3.5 w-3.5" />
                                  </button>
                                  
                                  <button
                                    onClick={() => handleOpenAddEdit(account)}
                                    className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-lg dark:bg-teal-950/20 dark:text-teal-400 transition"
                                    title="Edit Akun"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  
                                  <button
                                    onClick={() => handleDeleteAccount(account.id)}
                                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-650 rounded-lg dark:bg-red-950/20 dark:text-red-400 transition"
                                    title="Delete Akun"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. MODAL: Add / Edit Account */}
      {isAddEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl md:max-w-3xl max-w-lg w-full shadow-2xl relative overflow-visible">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 p-4">
              <h3 className="text-sm font-bold text-neutral-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                {selectedAccount ? '✏️ Ubah Akun' : '➕ Buat Akun Baru'}
              </h3>
              <button 
                onClick={() => setIsAddEditOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveAccount} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-750 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Nama Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-500">
                  Nama<span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Contoh: Kas Kecil"
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-850 dark:text-neutral-150 focus:border-teal-500 transition"
                />
              </div>

              {/* Kode and Jenis Akun */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-500">
                    Kode<span className="text-pink-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="Contoh: 1101"
                    className="w-full p-2 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-850 dark:text-neutral-150 focus:border-teal-500 transition"
                  />
                </div>

                <div className="space-y-1.5 relative" ref={jenisDropdownRef}>
                  <label className="text-xs font-semibold text-neutral-500">
                    Jenis Akun<span className="text-pink-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.subType}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, subType: e.target.value }));
                        setIsJenisDropdownOpen(true);
                      }}
                      onFocus={() => setIsJenisDropdownOpen(true)}
                      placeholder="Pilih atau ketik jenis akun..."
                      className="w-full p-2 pr-8 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-850 dark:text-neutral-150 focus:border-teal-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setIsJenisDropdownOpen(!isJenisDropdownOpen)}
                      className="absolute right-2 top-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {isJenisDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-full max-h-72 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-xl z-55 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, subType: '' }));
                          setIsJenisDropdownOpen(false);
                          setFormData(prev => ({ ...prev, parentAccount: '' }));
                          setParentSearch('');
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between font-medium ${
                          !formData.subType 
                            ? 'bg-teal-505 text-white dark:bg-teal-600' 
                            : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 select-none">
                          <Check className="h-3.5 w-3.5" />
                          Select
                        </span>
                      </button>

                      {jenisAkunGroups.map((group) => {
                        // Filter options based on user matching search, or show all if search is empty
                        const isOptionValue = jenisAkunGroups.some(g => g.options.some(opt => opt.value === formData.subType));
                        const searchLower = (!formData.subType || isOptionValue) ? '' : formData.subType.toLowerCase();
                        
                        const filteredOptions = group.options.filter(opt =>
                          opt.label.toLowerCase().includes(searchLower)
                        );
                        
                        // If user is searching and no options match this group, skip group header
                        if (searchLower && filteredOptions.length === 0) return null;
                        
                        const displayOptions = searchLower ? filteredOptions : group.options;
                        const isDeleting = deleteModeHeaders.has(group.header);

                        return (
                          <div key={group.header} className="border-b border-neutral-150 dark:border-neutral-850 last:border-b-0 pb-1">
                            {/* Group Header with "+" and "x" */}
                            <div className="px-3 py-1.5 flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-neutral-450 dark:text-neutral-500 bg-neutral-50 dark:bg-neutral-850 select-none">
                              <span>{group.header}</span>
                              <div className="flex items-center gap-2">
                                {/* Toggle add form */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setAddingHeader(addingHeader === group.header ? null : group.header);
                                    setNewJenisName('');
                                  }}
                                  className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-500 hover:text-teal-600 cursor-pointer transition flex items-center justify-center"
                                  title={`Tambah jenis akun ke ${group.header}`}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                                {/* Toggle delete mode */}
                                <button
                                  type="button"
                                  onClick={(e) => toggleDeleteMode(group.header, e)}
                                  className={`p-1 rounded cursor-pointer transition flex items-center justify-center ${
                                    isDeleting 
                                      ? 'text-pink-600 bg-pink-100 dark:bg-pink-950/40 font-bold' 
                                      : 'text-neutral-500 hover:text-pink-600 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                  }`}
                                  title={`Kelola/Hapus opsi di ${group.header}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {/* Inline Add Input */}
                            {addingHeader === group.header && (
                              <div className="px-3 py-1.5 flex items-center gap-1.5 bg-teal-50/40 dark:bg-teal-950/20 border-b border-neutral-100 dark:border-neutral-800 transition">
                                <input
                                  type="text"
                                  value={newJenisName}
                                  onChange={(e) => setNewJenisName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddNewJenisAkun(group.header);
                                    } else if (e.key === 'Escape') {
                                      setAddingHeader(null);
                                      setNewJenisName('');
                                    }
                                  }}
                                  placeholder="Nama jenis akun..."
                                  className="flex-1 px-2.5 py-1 border border-teal-305 dark:border-teal-800 rounded bg-white dark:bg-neutral-900 text-xs outline-none text-neutral-850 dark:text-neutral-150 focus:border-teal-500"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddNewJenisAkun(group.header)}
                                  className="p-1 bg-teal-500 hover:bg-teal-600 rounded text-white cursor-pointer transition flex items-center justify-center"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingHeader(null);
                                    setNewJenisName('');
                                  }}
                                  className="p-1 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-350 rounded text-neutral-650 dark:text-neutral-300 cursor-pointer transition flex items-center justify-center"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}

                            {/* Dropdown Options List */}
                            {displayOptions.length === 0 ? (
                              <div className="px-6 py-2 text-center text-[10px] text-neutral-400 dark:text-neutral-500 italic bg-white dark:bg-neutral-900">
                                Belum ada jenis akun
                              </div>
                            ) : (
                              displayOptions.map((opt) => {
                                const isSelected = formData.subType === opt.value;
                                return (
                                  <div
                                    key={opt.value}
                                    className={`w-full flex items-center justify-between transition duration-150 ${
                                      isSelected 
                                        ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 font-semibold' 
                                        : 'text-neutral-700 dark:text-neutral-205 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormData(prev => ({ ...prev, subType: opt.value }));
                                        setIsJenisDropdownOpen(false);
                                        setFormData(prev => ({ ...prev, parentAccount: '' }));
                                        setParentSearch('');
                                      }}
                                      className="flex-1 text-left pl-6 pr-2 py-1.5 text-xs text-neutral-700 dark:text-neutral-250 cursor-pointer whitespace-nowrap"
                                    >
                                      <span>{opt.label}</span>
                                    </button>
                                    {isSelected && !isDeleting && (
                                      <Check className="h-3.5 w-3.5 text-teal-600 mr-3 shrink-0" />
                                    )}
                                    {isDeleting && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          handleDeleteJenisAkun(group.header, opt.value);
                                        }}
                                        className="p-1 hover:bg-pink-100 dark:hover:bg-pink-950/40 rounded text-pink-600 dark:text-pink-400 cursor-pointer transition flex items-center justify-center mr-2 shrink-0"
                                        title={`Hapus ${opt.label}`}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Dual toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Diaktifkan. */}
                <div className="flex items-center space-x-3 bg-neutral-50/80 dark:bg-neutral-850 p-2.5 rounded-xl border border-neutral-200/60 dark:border-neutral-800/80">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${formData.isActive ? 'bg-teal-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-250 ease-in-out ${formData.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200 select-none">
                    Diaktifkan.
                  </span>
                </div>

                {/* Jadikan ini sub-akun */}
                <div className="flex items-center space-x-3 bg-neutral-50/80 dark:bg-neutral-850 p-2.5 rounded-xl border border-neutral-200/60 dark:border-neutral-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSubAccount(!isSubAccount);
                      if (!isSubAccount) {
                        setFormData(prev => ({ ...prev, parentAccount: '' }));
                        setParentSearch('');
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${isSubAccount ? 'bg-teal-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-250 ease-in-out ${isSubAccount ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200 select-none">
                    Jadikan ini sub-akun
                  </span>
                </div>
              </div>

              {/* Searchable Akun Induk */}
              {isSubAccount && (
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-semibold text-neutral-500">
                    Akun Induk<span className="text-pink-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={formData.subType ? "Cari Akun Induk..." : "Pilih Jenis Akun terlebih dahulu"}
                      disabled={!formData.subType}
                      value={parentSearch}
                      onChange={(e) => {
                        setParentSearch(e.target.value);
                        if (formData.parentAccount && e.target.value !== formData.parentAccount) {
                          setFormData(prev => ({ ...prev, parentAccount: '' }));
                        }
                      }}
                      onFocus={() => setIsParentDropdownOpen(true)}
                      className="w-full p-2 pr-7 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-850 dark:text-neutral-150 focus:border-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="absolute right-2 top-2.5">
                      <ChevronDown 
                        className="h-3.5 w-3.5 text-neutral-400 cursor-pointer" 
                        onClick={() => {
                          if (formData.subType) {
                            setIsParentDropdownOpen(!isParentDropdownOpen);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {isParentDropdownOpen && formData.subType && (
                    <div className="absolute left-0 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-xl z-55 py-1">
                      {(() => {
                        const filteredParents = accounts.filter(acc => {
                          const sameSubType = acc.subType === formData.subType;
                          const isNotSelf = acc.id !== selectedAccount?.id;
                          const isActive = acc.isActive;
                          
                          if (!sameSubType || !isNotSelf || !isActive) return false;

                          if (parentSearch && parentSearch !== acc.name) {
                            const searchLower = parentSearch.toLowerCase();
                            return (acc.code || '').toLowerCase().includes(searchLower) || (acc.name || '').toLowerCase().includes(searchLower);
                          }
                          return true;
                        });

                        if (filteredParents.length === 0) {
                          return (
                            <div className="px-3 py-2 text-xs text-neutral-450 dark:text-neutral-550 text-center select-none">
                              Tidak ada akun induk yang cocok dengan Jenis: <span className="font-bold">{formData.subType}</span>
                            </div>
                          );
                        }

                        return filteredParents.map((acc, idx) => (
                          <button
                            key={`${acc.id || acc.code}-${idx}`}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, parentAccount: acc.name }));
                              setParentSearch(acc.name);
                              setIsParentDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between transition ${
                              formData.parentAccount === acc.name 
                                ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-400 font-bold' 
                                : 'text-neutral-750 dark:text-neutral-250'
                            }`}
                          >
                            <span>{acc.code} - {acc.name}</span>
                            {formData.parentAccount === acc.name && (
                              <Check className="h-3 w-3 text-teal-605" />
                            )}
                          </button>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Deskripsi */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-500">Deskripsi</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Masukkan deskripsi akun..."
                  rows={3}
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-850 dark:text-neutral-150 resize-y focus:border-teal-500 transition"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsAddEditOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-lg text-xs font-bold transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-605 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{selectedAccount ? 'Menyimpan...' : 'Membuat...'}</span>
                    </>
                  ) : (
                    <span>{selectedAccount ? 'Simpan' : 'Buat'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: View Ledger Details */}
      {isLedgerOpen && ledgerAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-3xl w-full shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-850">
              <div>
                <h3 className="text-sm font-bold text-neural-800 dark:text-white uppercase tracking-wider">
                  📖 Buku Besar (ledger detail)
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Akun: <span className="font-numeric font-bold text-teal-605">{ledgerAccount.code}</span> - <span className="font-bold">{ledgerAccount.name}</span> ({ledgerAccount.subType})
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsLedgerOpen(false);
                  setLedgerAccount(null);
                }}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-850 text-neutral-500 dark:text-neutral-400 font-bold">
                      <th className="p-3">TANGGAL</th>
                      <th className="p-3">ID JURNAL</th>
                      <th className="p-3">DESKRIPSI</th>
                      <th className="p-3">MODUL REF</th>
                      <th className="p-3 text-right">DEBIT</th>
                      <th className="p-3 text-right">KREDIT</th>
                      <th className="p-3 text-right">SALDO AKHIR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getLedgerLines(ledgerAccount.name).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-neutral-450">
                          Tidak ada entri jurnal yang mencatat akun ini selama periode terpilih.
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        let runningBalance = 0;
                        const normalRule = ledgerAccount.type === 'Assets' || ledgerAccount.type === 'Expenses' ? 'DR' : 'CR';
                        
                        return getLedgerLines(ledgerAccount.name).map((line, idx) => {
                          const dateObj = line.date?.seconds ? new Date(line.date.seconds * 1000) : new Date(line.date);
                          const dateString = isNaN(dateObj.getTime()) ? '-' : dateObj.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });

                          // compute running ledger balance
                          if (normalRule === 'DR') {
                            runningBalance += (line.debit - line.credit);
                          } else {
                            runningBalance += (line.credit - line.debit);
                          }

                          return (
                            <tr key={`${line.id}-${idx}`} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/10 border-b border-neutral-100 dark:border-neutral-850">
                              <td className="p-3 font-medium text-neutral-700 dark:text-neutral-400">
                                {dateString}
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 border border-neutral-200 dark:border-neutral-800 rounded font-bold font-numeric text-[10px] text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
                                  #{line.id.substring(0, 8).toUpperCase()}
                                </span>
                              </td>
                              <td className="p-3 text-neutral-700 dark:text-neutral-300 max-w-xs truncate" title={line.description}>
                                {line.description}
                              </td>
                              <td className="p-3">
                                <span className="text-[10px] uppercase font-bold text-neutral-500">
                                  {line.refType}
                                </span>
                              </td>
                              <td className="p-3 text-right font-numeric text-green-600 dark:text-green-400 font-medium">
                                {line.debit > 0 ? `NT$ ${formatNumber(line.debit)}` : '-'}
                              </td>
                              <td className="p-3 text-right font-numeric text-red-650 dark:text-red-400 font-medium">
                                {line.credit > 0 ? `NT$ ${formatNumber(line.credit)}` : '-'}
                              </td>
                              <td className="p-3 text-right font-numeric font-bold text-neutral-905 dark:text-white">
                                {`NT$ ${formatNumber(runningBalance)}`}
                              </td>
                            </tr>
                          );
                        });
                      })()
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
              <button
                onClick={() => {
                  setIsLedgerOpen(false);
                  setLedgerAccount(null);
                }}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-605 text-white rounded-lg text-xs font-bold transition shadow-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. SYSTEM OVERLAY: Universal Confirmation / Alert Modal */}
      {coaModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                {coaModal.type === 'confirm' && (
                  <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 shrink-0">
                    <Trash2 className="h-5 w-5" />
                  </div>
                )}
                {coaModal.type === 'error' && (
                  <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30 text-red-650 shrink-0">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                )}
                {coaModal.type === 'success' && (
                  <div className="h-10 w-10 flex items-center justify-center rounded-full bg-green-50 dark:bg-green-950/30 text-green-650 shrink-0">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                )}
                <div className="space-y-1.5 flex-1 select-text">
                  <h3 className="font-bold text-neutral-900 dark:text-neutral-100 text-base">
                    {coaModal.title}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-450 leading-relaxed whitespace-pre-line">
                    {coaModal.message}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-neutral-50 dark:bg-neutral-850/50 border-t border-neutral-200 dark:border-neutral-800">
              {coaModal.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => setCoaModal(prev => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-bold rounded-lg text-neutral-600 dark:text-neutral-300 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      setCoaModal(prev => ({ ...prev, isOpen: false }));
                      if (coaModal.onConfirm) coaModal.onConfirm();
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
                  >
                    Ya, Hapus
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setCoaModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-5 py-2 bg-teal-500 hover:bg-teal-605 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
                >
                  Selesai
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
