import { getNextJournalId } from '../lib/journalUtils';
import { formatDate } from '../lib/date-utils';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  Timestamp, 
  writeBatch,
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { fetchCurrentExchangeRate } from '../lib/period-closing-utils';
import { FALLBACK_IDR_PER_NTD } from '../lib/exchangeRateConstants';
import { useAuth } from '../lib/auth-context';
import { JournalEntry, CoaAccount, JournalEntryLine, AuditLogEntry } from '../types';
import { DateRangePicker } from './ui/DateRangePicker';
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
  CheckCircle2,
  AlertCircle,
  Undo2,
  FileText,
  Eye, 
  EyeOff, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Check, 
  Info,
  Lock
} from 'lucide-react';
import { formatIDR } from '../lib/decimal-utils';
import { useRef } from 'react';
import { sanitizePurchaseOrders } from '../lib/db-helpers';

interface AccountComboboxProps {
  accounts: CoaAccount[];
  selectedValue: string;
  onSelect: (value: string) => void;
  isShaking?: boolean;
}

export const isJournalLocked = (entry: any) => {
  return false;
};

const isParentAccount = (acc: CoaAccount, allAccs: CoaAccount[]) => {
  return allAccs.some(other => {
    if (!other.parentAccount) return false;
    const cleanParent = other.parentAccount.trim().toLowerCase();
    const nameLower = (acc.name || '').trim().toLowerCase();
    return (
      cleanParent === nameLower ||
      cleanParent === `${acc.code} - ${acc.name || ''}`.trim().toLowerCase() ||
      cleanParent === acc.id.trim().toLowerCase()
    );
  });
};

const findParentOf = (acc: CoaAccount, allAccs: CoaAccount[]) => {
  if (!acc.parentAccount) return null;
  const cleanParent = acc.parentAccount.trim().toLowerCase();
  return allAccs.find(p => 
    (p.name || '').trim().toLowerCase() === cleanParent ||
    `${p.code} - ${p.name || ''}`.trim().toLowerCase() === cleanParent ||
    p.id.trim().toLowerCase() === cleanParent
  );
};

type DropdownItem = 
  | { type: 'category'; label: string }
  | { type: 'parent_header'; label: string; code: string; indent: number }
  | { type: 'leaf'; account: CoaAccount; label: string; code: string; indent: number };

const buildDropdownItems = (allAccounts: CoaAccount[], selectedValue?: string): DropdownItem[] => {
  const categories: ('Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses')[] = [
    'Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'
  ];
  
  const items: DropdownItem[] = [];
  
  // Filter active accounts or currently selected one (to support historical entries gracefully)
  const filteredAccounts = allAccounts.filter(acc => acc.isActive || acc.name === selectedValue);
  
  categories.forEach(cat => {
    const catLabel = cat === 'Revenue' ? 'Income' : cat;
    const catAccs = filteredAccounts.filter(acc => acc.type === cat);
    if (catAccs.length === 0) return;
    
    // Add category header
    items.push({ type: 'category', label: catLabel.toUpperCase() });
    
    // Separate parent accounts and independent/child accounts
    const parents = catAccs.filter(acc => isParentAccount(acc, filteredAccounts));
    const sortedCatAccs = [...catAccs].sort((a, b) => a.code.localeCompare(b.code));
    
    const rootAccs = sortedCatAccs.filter(acc => {
      const parent = findParentOf(acc, filteredAccounts);
      return !parent;
    });
    
    rootAccs.forEach(acc => {
      const isParent = parents.some(p => p.id === acc.id);
      if (isParent) {
        // It's a parent header (non-selectable)
        items.push({
          type: 'parent_header',
          label: acc.name,
          code: acc.code,
          indent: 1
        });
        
        // Find and append its children
        const children = sortedCatAccs.filter(child => {
          const parent = findParentOf(child, filteredAccounts);
          return parent?.id === acc.id;
        });
        
        children.forEach(child => {
          const isChildParent = isParentAccount(child, filteredAccounts);
          if (isChildParent) {
            items.push({
              type: 'parent_header',
              label: child.name,
              code: child.code,
              indent: 2
            });
            
            // Find sub-children
            const subChildren = sortedCatAccs.filter(sub => {
              const parent = findParentOf(sub, filteredAccounts);
              return parent?.id === child.id;
            });
            subChildren.forEach(sub => {
              items.push({
                type: 'leaf',
                account: sub,
                label: sub.name,
                code: sub.code,
                indent: 3
              });
            });
          } else {
            items.push({
              type: 'leaf',
              account: child,
              label: child.name,
              code: child.code,
              indent: 2
            });
          }
        });
      } else {
        // It's an independent leaf (selectable)
        items.push({
          type: 'leaf',
          account: acc,
          label: acc.name,
          code: acc.code,
          indent: 1
        });
      }
    });
  });
  
  return items;
};

const getFilteredItems = (allItems: DropdownItem[], query: string) => {
  if (!query.trim()) return allItems;
  const q = query.toLowerCase().trim();
  
  const filtered: DropdownItem[] = [];
  let currentCategory: DropdownItem | null = null;
  let currentParent: DropdownItem | null = null;
  let pendingParentAdded = false;
  let pendingCategoryAdded = false;
  
  allItems.forEach(item => {
    if (item.type === 'category') {
      currentCategory = item;
      pendingCategoryAdded = false;
      currentParent = null;
      pendingParentAdded = false;
    } else if (item.type === 'parent_header') {
      currentParent = item;
      pendingParentAdded = false;
    } else if (item.type === 'leaf') {
      const matchesName = item.label.toLowerCase().includes(q);
      const matchesCode = item.code.toLowerCase().includes(q);
      
      if (matchesName || matchesCode) {
        if (currentCategory && !pendingCategoryAdded) {
          filtered.push(currentCategory);
          pendingCategoryAdded = true;
        }
        if (item.indent === 2 && currentParent && !pendingParentAdded) {
          filtered.push(currentParent);
          pendingParentAdded = true;
        }
        filtered.push(item);
      }
    }
  });
  
  return filtered;
};

export const AccountCombobox: React.FC<AccountComboboxProps> = ({
  accounts,
  selectedValue,
  onSelect,
  isShaking = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = buildDropdownItems(accounts, selectedValue);
  const filteredItems = getFilteredItems(allItems, query);
  const selectableLeafItems = filteredItems.filter(item => item.type === 'leaf') as { type: 'leaf'; account: CoaAccount; label: string; code: string; indent: number }[];

  const [highlightedIdx, setHighlightedIdx] = useState(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && selectableLeafItems.length > 0) {
      const activeEl = document.getElementById(`acc-item-${highlightedIdx}`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIdx, isOpen, selectableLeafItems.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        const currentIdx = selectableLeafItems.findIndex(item => item.account.name === selectedValue);
        setHighlightedIdx(currentIdx >= 0 ? currentIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(prev => (prev + 1) % Math.max(1, selectableLeafItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(prev => (prev - 1 + selectableLeafItems.length) % Math.max(1, selectableLeafItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectableLeafItems[highlightedIdx]) {
        onSelect(selectableLeafItems[highlightedIdx].account.name);
        setIsOpen(false);
        setQuery('');
      }
    }
  };

  const handleSelect = (accountName: string) => {
    onSelect(accountName);
    setIsOpen(false);
    setQuery('');
  };

  const selectedAccount = accounts.find(acc => acc.name === selectedValue);

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full text-left font-text select-none ${isShaking ? 'animate-shake' : ''}`}
    >
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            const currentIdx = selectableLeafItems.findIndex(item => item.account.name === selectedValue);
            setHighlightedIdx(currentIdx >= 0 ? currentIdx : 0);
          }
        }}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-neutral-900 border ${
          isShaking ? 'border-red-500 ring-2 ring-red-500/20' : 'border-neutral-250 dark:border-neutral-805 hover:border-neutral-400 dark:hover:border-neutral-705'
        } rounded-lg text-sm text-neutral-800 dark:text-neutral-200 transition duration-150 focus:outline-none`}
      >
        <span className="truncate">
          {selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : '-- Pilih Akun --'}
        </span>
        <ChevronDown size={14} className="text-neutral-450 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1.5 w-[360px] sm:w-[480px] md:w-[550px] max-w-[95vw] bg-white dark:bg-neutral-950 border border-neutral-250 dark:border-neutral-805 rounded-xl shadow-2xl flex flex-col max-h-[420px] overflow-hidden animate-fadeIn">
          {/* Header Search Box */}
          <div className="p-3 border-b border-neutral-150 dark:border-neutral-900 flex items-center gap-2 bg-neutral-50/50 dark:bg-neutral-900/50 shrink-0">
            <Search size={16} className="text-neutral-450 ml-1 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Cari Kode atau Nama akun..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIdx(0);
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 py-1"
            />
            {query && (
              <button 
                type="button" 
                onClick={() => setQuery('')} 
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-350"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* List Scroll Area */}
          <div className="overflow-y-auto py-1.5 max-h-[350px] flex-1">
            {filteredItems.length === 0 ? (
              <div className="text-center py-8 text-xs text-neutral-450 font-numeric">
                Tidak ada akun yang cocok.
              </div>
            ) : (
              (() => {
                let currentSelectableCounter = -1;
                return filteredItems.map((item, idx) => {
                  if (item.type === 'category') {
                    return (
                      <div 
                        key={`cat-${idx}`} 
                        className="text-[10px] tracking-wider text-neutral-400 dark:text-neutral-500 font-extrabold px-4 py-2.5 bg-neutral-100/50 dark:bg-neutral-900/30 select-none uppercase mt-2 first:mt-0 font-numeric border-b border-neutral-150/40 dark:border-neutral-850/40"
                      >
                        {item.label}
                      </div>
                    );
                  }

                  if (item.type === 'parent_header') {
                    const indentClass = item.indent === 3 ? 'pl-10' : item.indent === 2 ? 'pl-7' : 'pl-4';
                    return (
                      <div 
                        key={`p-head-${idx}`} 
                        className={`${indentClass} py-2.5 pr-4 text-[11px] font-extrabold text-neutral-400 dark:text-neutral-500 select-none uppercase font-numeric tracking-wide bg-neutral-50/45 dark:bg-neutral-900/20 border-b border-dashed border-neutral-150/50 dark:border-neutral-850/30 flex items-center gap-1.5`}
                      >
                        <span>📁</span>
                        <span>{item.code} - {item.label} (Parent)</span>
                      </div>
                    );
                  }

                  // leaf item setup
                  currentSelectableCounter++;
                  const isHighlighted = highlightedIdx === currentSelectableCounter;
                  const isSelected = item.account.name === selectedValue;
                  const itemIndex = currentSelectableCounter;
                  const indentClass = item.indent === 3 ? 'pl-12' : item.indent === 2 ? 'pl-8' : item.indent === 1 ? 'pl-5' : 'pl-4';

                  return (
                    <div
                      id={`acc-item-${itemIndex}`}
                      key={`leaf-${itemIndex}`}
                      onClick={() => handleSelect(item.account.name)}
                      onMouseEnter={() => setHighlightedIdx(itemIndex)}
                      className={`${indentClass} pr-4 py-2.5 flex items-center justify-between text-xs cursor-pointer transition ${
                        isHighlighted 
                          ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50' 
                          : 'text-neutral-750 dark:text-neutral-300 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20'
                      }`}
                    >
                      <span className={`${isSelected ? 'font-bold text-teal-650 dark:text-teal-400' : 'font-normal'}`}>
                        {item.code} - {item.label}
                      </span>
                      {isSelected && (
                        <Check size={14} className="text-teal-600 dark:text-teal-400 shrink-0 font-bold" />
                      )}
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export function getSortedAndFormattedJournals(journalsList: JournalEntry[]): (JournalEntry & { displayJournalId: string; sequence: number })[] {
  // 1. Sort chronologically (oldest first) to assign sequence numbers deterministically
  const sortedOldestFirst = [...journalsList].sort((a, b) => {
    const timeA = a.date?.seconds 
      ? a.date.seconds * 1000 
      : (a.date instanceof Date ? a.date.getTime() : (a.date ? new Date(a.date).getTime() : 0));
    const timeB = b.date?.seconds 
      ? b.date.seconds * 1000 
      : (b.date instanceof Date ? b.date.getTime() : (b.date ? new Date(b.date).getTime() : 0));
    
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    
    // Secondary tie-breaker using creation time or document ID to guarantee absolute stability
    const createdA = a.createdAt?.seconds ? a.createdAt.seconds : 0;
    const createdB = b.createdAt?.seconds ? b.createdAt.seconds : 0;
    if (createdA !== createdB) {
      return createdA - createdB;
    }
    
    return a.id.localeCompare(b.id);
  });

  // 2. Assign sequence numbers per day
  const dayCounters: Record<string, number> = {};
  const formattedList = sortedOldestFirst.map((entry) => {
    const dateObj = entry.date?.seconds 
      ? new Date(entry.date.seconds * 1000) 
      : (entry.date instanceof Date ? entry.date : (entry.date ? new Date(entry.date) : new Date()));
    
    let yy = '26';
    let mm = '01';
    let dd = '01';
    
    if (!isNaN(dateObj.getTime())) {
      yy = String(dateObj.getFullYear()).slice(-2);
      mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      dd = String(dateObj.getDate()).padStart(2, '0');
    }
    
    const dateStr = `${yy}${mm}${dd}`;
    dayCounters[dateStr] = (dayCounters[dateStr] || 0) + 1;
    const sequence = dayCounters[dateStr];
    let displayJournalId = (entry as any).journalNumber || entry.id;

    return {
      ...entry,
      displayJournalId,
      sequence,
    };
  });

  // 3. Sort newest FIRST by Nomor Jurnal Descending
  return formattedList.sort((a, b) => {
    const aId = a.displayJournalId || '';
    const bId = b.displayJournalId || '';
    
    const cmp = bId.localeCompare(aId);
    if (cmp !== 0) return cmp;
    
    // Fallback to Date DESC
    const timeA = a.date?.seconds 
      ? a.date.seconds * 1000 
      : (a.date instanceof Date ? a.date.getTime() : (a.date ? new Date(a.date).getTime() : 0));
    const timeB = b.date?.seconds 
      ? b.date.seconds * 1000 
      : (b.date instanceof Date ? b.date.getTime() : (b.date ? new Date(b.date).getTime() : 0));
    return timeB - timeA;
  });
}

function getEnrichedFreightList(list: any[]): (any & { docNo: string })[] {
  // Helper to parse date
  const parseCreatedAt = (createdAt: any): Date | null => {
    if (!createdAt) return null;
    if (typeof createdAt.toDate === 'function') {
      return createdAt.toDate();
    }
    if (typeof createdAt.seconds === 'number') {
      return new Date(createdAt.seconds * 1000);
    }
    if (createdAt instanceof Date) {
      return createdAt;
    }
    if (typeof createdAt === 'string') {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof createdAt === 'number') {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const formatDateToYYMMDD = (date: Date): string => {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  };

  const docNoMap: Record<string, string> = {};
  const withDate: { rec: any; date: Date; dateStr: string }[] = [];
  const withoutDate: any[] = [];

  list.forEach(rec => {
    if (rec.docNo) {
      docNoMap[rec.freightCode] = rec.docNo;
    } else {
      const parsed = parseCreatedAt(rec.createdAt);
      if (parsed) {
        withDate.push({
          rec,
          date: parsed,
          dateStr: formatDateToYYMMDD(parsed)
        });
      } else {
        withoutDate.push(rec);
      }
    }
  });

  // Sort withDate chronologically (ascending).
  // If timestamps are identical, sort by freightCode to be 100% deterministic.
  withDate.sort((a, b) => {
    const timeA = a.date.getTime();
    const timeB = b.date.getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.rec.freightCode.localeCompare(b.rec.freightCode);
  });

  // Assign sequence numbers to withDate grouped by dateStr
  const countsPerDay: Record<string, number> = {};

  withDate.forEach(item => {
    const dateStr = item.dateStr;
    if (!countsPerDay[dateStr]) {
      countsPerDay[dateStr] = 0;
    }
    countsPerDay[dateStr] += 1;
    const seq = countsPerDay[dateStr];
    docNoMap[item.rec.freightCode] = `FI${dateStr}${String(seq).padStart(2, '0')}`;
  });

  // Sort withoutDate alphabetically by freightCode to be 100% deterministic
  withoutDate.sort((a, b) => a.freightCode.localeCompare(b.freightCode));

  withoutDate.forEach((rec, idx) => {
    const seq = idx + 1;
    docNoMap[rec.freightCode] = `FI000000${String(seq).padStart(2, '0')}`;
  });

  return list.map(rec => ({
    ...rec,
    docNo: docNoMap[rec.freightCode] || `FI00000001`
  }));
}

interface JournalTabProps {
  setTab?: (tab: string) => void;
}

export const JournalTab: React.FC<JournalTabProps> = ({ setTab }) => {
  const { profile } = useAuth();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<CoaAccount[]>([]);
  const [freightInList, setFreightInList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  


  const freightDocNoMap = useMemo(() => {
    const enriched = getEnrichedFreightList(freightInList);
    const m: Record<string, string> = {};
    enriched.forEach(f => {
      if (f.freightCode) {
        m[f.freightCode.toUpperCase()] = f.docNo;
      }
    });
    return m;
  }, [freightInList]);

  const unstandardizedPoJournals = useMemo(() => {
    const standardDescriptions = [
      "Pemesanan Barang",
      "Penerimaan Barang",
      "Penerimaan Barang Sebagian",
      "Penerimaan Barang Sisa"
    ];
    return journals.filter(j => j.id?.startsWith('JU-PO-') && !standardDescriptions.includes(j.description || ''));
  }, [journals]);

  const [selectedJournalForDetail, setSelectedJournalForDetail] = useState<(JournalEntry & { displayJournalId: string; sequence: number }) | null>(null);
  const [copiedDetailId, setCopiedDetailId] = useState(false);

  // Search and date filters
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    return new Date();
  });
  const [presetLabel, setPresetLabel] = useState<string>('Bulan Ini');
  const [searchQuery, setSearchQuery] = useState('');
  const [journalPage, setJournalPage] = useState<number>(1);

  useEffect(() => {
    setJournalPage(1);
  }, [searchQuery, startDate, endDate]);

  // Currency tracking (NTD vs IDR)
  const [selectedCurrency, setSelectedCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [exchangeRate, setExchangeRate] = useState<number>(FALLBACK_IDR_PER_NTD); // 1 TWD = ~500 IDR rate

  // Description presets state
  const [descriptionPresets, setDescriptionPresets] = useState<string[]>([]);
  const [showPresetsList, setShowPresetsList] = useState(false);

  // Validation Shake tracking
  const [shaking, setShaking] = useState<Record<string, boolean>>({});
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);

  // Table row expand/collapse tracking
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [migrating, setMigrating] = useState(false);
  const [confirmMigration, setConfirmMigration] = useState(false);

  const triggerShake = (key: string) => {
    setShaking(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setShaking(prev => ({ ...prev, [key]: false }));
    }, 500);
  };

  // Form toggles
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modal dialog states
  const [journalModal, setJournalModal] = useState<{
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

  const showJournalAlert = (title: string, message: string, type: 'confirm' | 'error' | 'success', onConfirm?: () => void) => {
    setJournalModal({
      isOpen: true,
      title,
      message,
      type,
      onConfirm
    });
  };

  // Form Fields - General Info
  const [entryDate, setEntryDate] = useState(new Date().toISOString().substring(0, 10));
  const [description, setDescription] = useState('');
  const [refId, setRefId] = useState('');
  const [refType, setRefType] = useState('Manual');

  const getLiveAccountName = (line: JournalEntryLine | UIJournalLine) => {
    if (!line) return '';
    if (line.accountCode) {
      const found = accounts.find(a => a.code === line.accountCode);
      if (found) return found.name;
    }
    const foundByName = accounts.find(a => (a.name || '').trim().toLowerCase() === (line.account || '').trim().toLowerCase());
    if (foundByName) return foundByName.name;
    return line.account;
  };

  // Form Fields - Debet / Kredit Line Items
  // Keep values as whole strings (for inputs), e.g. "500000"
  type UIJournalLine = {
    account: string;
    accountCode?: string;
    debit: string;
    credit: string;
  };
  const [lines, setLines] = useState<UIJournalLine[]>([
    { account: '', accountCode: '', debit: '', credit: '' },
    { account: '', accountCode: '', debit: '', credit: '' }
  ]);

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // 1. Double entry listeners on load
  useEffect(() => {
    // Load presets from LocalStorage or populate default values
    const storedPresets = localStorage.getItem('journal_desc_presets');
    if (storedPresets) {
      setDescriptionPresets(JSON.parse(storedPresets));
    } else {
      const defaultPresets = [
        'Saldo Awal Akun',
        'Setoran Modal Pemilik',
        'Penyesuaian Persediaan Barang',
        'Pembayaran Sewa Kantor',
        'Pembayaran Gaji Karyawan',
        'Penjualan Shopee settlement'
      ];
      setDescriptionPresets(defaultPresets);
      localStorage.setItem('journal_desc_presets', JSON.stringify(defaultPresets));
    }

    fetchCurrentExchangeRate().then((rate) => {
      if (rate && rate > 0) setExchangeRate(rate);
    });

    // Read accounts to show in dropdowns
    
    const fetchAccounts = async () => {
      try {
        const snap = await getDocs(collection(db, 'coa'));
        
      const list: CoaAccount[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as CoaAccount));
      setAccounts(list);
    
      } catch (error) {
        
      handleFirestoreError(error, OperationType.LIST, 'coa');
    
      }
    };
    fetchAccounts();


    // Read purchase orders
    
    const fetchPos = async () => {
      try {
        const snap = await getDocs(collection(db, 'purchaseOrders'));
        
      const pList: any[] = [];
      snap.forEach(d => pList.push({ id: d.id, ...d.data() }));
      setPurchaseOrders(sanitizePurchaseOrders(pList));
    
      } catch (err) {
        
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    
      }
    };
    fetchPos();


    // Read freightIn records for docNo resolution
    
    const fetchFreightIn = async () => {
      try {
        const snap = await getDocs(collection(db, 'freightIn'));
        
      const fList: any[] = [];
      snap.forEach(d => fList.push({ id: d.id, ...d.data() }));
      setFreightInList(fList);
    
      } catch (err) {
        
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    
      }
    };
    fetchFreightIn();


    // Read journal entries
    
    const fetchJournals = async () => {
      try {
        const snap = await getDocs(collection(db, 'journalEntries'));
        
      const list: JournalEntry[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as JournalEntry));
      setJournals(getSortedAndFormattedJournals(list));
      setLoading(false);
    
      } catch (error) {
        
      handleFirestoreError(error, OperationType.LIST, 'journalEntries');
    
      }
    };
    fetchJournals();


    // Read closed periods
    
    const fetchClosings = async () => {
      try {
        const snap = await getDocs(collection(db, 'periodClosings'));
        
      const closedList: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data && data.status === 'Ditutup') {
          closedList.push(d.id);
        }
      });
      localStorage.setItem('closed_periods', JSON.stringify(closedList));
      setClosedPeriods(closedList);
    
      } catch (error) {
        
      handleFirestoreError(error, OperationType.LIST, 'periodClosings');
    
      }
    };
    fetchClosings();


    return () => {
      
      
      
      
      
    };
  }, []);

  // 2. Calculating Live debits and credits from UI lines with thousand separators support
  const parseLineVal = (val: string) => {
    if (!val) return 0;
    // For IDR, remove periods (used as thousand separators in Indonesia)
    if (selectedCurrency === 'IDR') {
      const cleaned = val.replace(/\./g, '').replace(/,/g, '');
      return parseFloat(cleaned) || 0;
    }
    return parseFloat(val.replace(/,/g, '')) || 0;
  };

  const totalDebitSum = lines.reduce((acc, line) => {
    return acc + parseLineVal(line.debit);
  }, 0);

  const totalCreditSum = lines.reduce((acc, line) => {
    return acc + parseLineVal(line.credit);
  }, 0);

  const isBalanced = totalDebitSum === totalCreditSum && totalDebitSum > 0;

  // Add line to form
  const handleAddLine = () => {
    setLines(prev => [...prev, { account: '', accountCode: '', debit: '', credit: '' }]);
  };

  // Remove line from form
  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) {
      setFormError('Entri jurnal double-entry minimal harus memiliki 2 baris audit.');
      return;
    }
    setLines(prev => prev.filter((_, idx) => idx !== index));
  };

  // Line field change logic with live formatting
  const handleLineChange = (index: number, field: keyof UIJournalLine, value: string) => {
    setLines(prev => {
      const next = [...prev];
      if (field === 'debit' || field === 'credit') {
        const cleanDigits = value.replace(/\D/g, ''); // integers only, strip decimal & others
        if (cleanDigits === '') {
          next[index][field] = '';
        } else {
          next[index][field] = parseInt(cleanDigits, 10).toLocaleString('en-US');
        }
        
        // If debit is filled, clear credit (since single transaction is debit OR credit)
        if (field === 'debit' && cleanDigits !== '') {
          next[index].credit = '';
        }
        // If credit is filled, clear debit
        if (field === 'credit' && cleanDigits !== '') {
          next[index].debit = '';
        }
      } else if (field === 'account') {
        next[index].account = value;
        const found = accounts.find(a => a.name === value);
        next[index].accountCode = found ? found.code : '';
      } else {
        next[index][field] = value;
      }

      return next;
    });
  };

  const handleStandardize = async () => {
    setMigrating(true);
    try {
      const batch = writeBatch(db);
      let count = 0;
      
      for (const j of unstandardizedPoJournals) {
        let newDesc = '';
        if (j.id.endsWith('-create')) {
          newDesc = 'Pemesanan Barang';
        } else if (j.id.includes('-rec-capitalize-')) {
          const match = j.id.match(/^JU-PO-(.+?)-rec-capitalize-(.+)$/);
          if (match) {
            const poId = match[1];
            const eventId = match[2];
            
            try {
              const eventsSnap = await getDocs(collection(db, 'purchaseOrders', poId, 'receiptEvents'));
              const events: any[] = [];
              eventsSnap.forEach(doc => events.push({ id: doc.id, ...doc.data() }));
              events.sort((a, b) => {
                const ta = a.timestamp?.seconds || 0;
                const tb = b.timestamp?.seconds || 0;
                return ta - tb;
              });
              
              const index = events.findIndex(ev => ev.id === eventId);
              if (index !== -1) {
                const currentEvent = events[index];
                const priorEvents = events.slice(0, index);
                
                const isFinal = currentEvent.eventType === 'final' || index === events.length - 1;
                const wasPartialBefore = priorEvents.length > 0;
                
                if (isFinal) {
                  if (wasPartialBefore) {
                    newDesc = "Penerimaan Barang Sisa";
                  } else {
                    newDesc = "Penerimaan Barang";
                  }
                } else {
                  newDesc = "Penerimaan Barang Sebagian";
                }
              }
            } catch (e) {
              console.error("Failed fetching receiptEvents subcollection:", e);
            }
          }
        }
        
        // Fallback
        if (!newDesc) {
          if ((j.description || '').includes('Pemesanan')) {
            newDesc = 'Pemesanan Barang';
          } else if ((j.description || '').includes('Sisa')) {
            newDesc = "Penerimaan Barang Sisa";
          } else if ((j.description || '').includes('Sebagian')) {
            newDesc = "Penerimaan Barang Sebagian";
          } else {
            newDesc = "Penerimaan Barang";
          }
        }
        
        if (newDesc && newDesc !== j.description) {
          batch.update(doc(db, 'journalEntries', j.id), { description: newDesc });
          count++;
        }
      }
      
      if (count > 0) {
        const auditId = doc(collection(db, 'auditLog')).id;
        const auditRef = doc(db, 'auditLog', auditId);
        const auditEntry: AuditLogEntry = {
          id: auditId,
          timestamp: Timestamp.now(),
          userEmail: profile?.email || auth.currentUser?.email || 'unknown@kangenbukuindo.tw',
          userDisplayName: profile?.displayName || auth.currentUser?.displayName || 'User',
          action: 'STANDARDIZE_DESCRIPTIONS',
          journalId: 'bulk',
          before: null,
          after: { count } as any
        };
        batch.set(auditRef, auditEntry);
        await batch.commit();
        showJournalAlert('Sukses', `Berhasil menstandardisasi ${count} deskripsi jurnal PO.`, 'success');
      } else {
        showJournalAlert('Info', 'Seluruh deskripsi jurnal PO sudah sesuai standar.', 'success');
      }
    } catch (err: any) {
      console.error("Migration failed:", err);
      showJournalAlert('Gagal', `Gagal melakukan standarisasi: ${err.message}`, 'error');
    } finally {
      setMigrating(false);
      setConfirmMigration(false);
    }
  };

  // Safe delete with custom confirmation overlay & instant state cleanup
  const handleDeleteJournal = (id: string) => {
    const entry = journals.find(e => e.id === id);
    if (!entry) return;

    if (entry.date) {
      const dateObj = entry.date.seconds ? new Date(entry.date.seconds * 1000) : new Date(entry.date);
      const yyyyMm = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      if (closedPeriods.includes(yyyyMm)) {
        showJournalAlert(
          'Periode Ditutup',
          `Transaksi ini berada di periode ${yyyyMm} yang telah ditutup dan dikunci. Tidak dapat menghapus transaksi ini.`,
          'error'
        );
        return;
      }
    }

    if (isJournalLocked(entry)) {
      showJournalAlert(
        'Akses Ditolak',
        `Entri jurnal otomatis tidak dapat dihapus secara manual karena terkait dengan transaksi bisnis otomatis atau sistem (misalnya Pembelian atau Sales Order) demi menjaga keseimbangan neraca dan integritas audit.`,
        'error'
      );
      return;
    }

    showJournalAlert(
      'Hapus Entri Jurnal',
      `Apakah Anda yakin ingin menghapus entri jurnal "${entry.description || 'Tanpa Deskripsi'}" secara permanen? Transaksi ini akan dikeluarkan dari perhitungan saldo Bagan Akun secara otomatis.`,
      'confirm',
      async () => {
        // Optimistically filter the entry from local state to trigger instant recalculations
        const originalJournals = [...journals];
        setJournals(prev => prev.filter(e => e.id !== id));

        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'journalEntries', id));

          const auditId = doc(collection(db, 'auditLog')).id;
          const auditRef = doc(db, 'auditLog', auditId);
          const auditEntry: AuditLogEntry = {
            id: auditId,
            timestamp: Timestamp.now(),
            userEmail: profile?.email || auth.currentUser?.email || 'unknown@kangenbukuindo.tw',
            userDisplayName: profile?.displayName || auth.currentUser?.displayName || 'User',
            action: 'DELETE',
            journalId: id,
            before: entry,
            after: null
          };
          batch.set(auditRef, auditEntry);
          await batch.commit();

          showJournalAlert(
            'Entri Jurnal Dihapus',
            'Entri jurnal telah berhasil dihapus secara permanen dan saldo akun-akun terkait telah diperbarui.',
            'success'
          );
        } catch (error) {
          // Revert back local state if delete transaction failed
          setJournals(originalJournals);
          handleFirestoreError(error, OperationType.DELETE, `journalEntries/${id}`);
          showJournalAlert(
            'Gagal Menghapus Jurnal',
            'Terjadi kesalahan saat menghapus entri jurnal dari Firestore database.',
            'error'
          );
        }
      }
    );
  };

  // Sequential ID Generator for Journals: JU[YY][MM][DD][2-digit sequence]
    const handleBeginEdit = (entry: JournalEntry) => {
    if (isJournalLocked(entry)) {
      showJournalAlert(
        'Akses Ditolak',
        'Entri jurnal otomatis tidak dapat diedit secara manual demi menjaga integritas pembukuan.',
        'error'
      );
      return;
    }
    if (entry && entry.date) {
      const dateObj = entry.date.seconds ? new Date(entry.date.seconds * 1000) : new Date(entry.date);
      const yyyyMm = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      if (closedPeriods.includes(yyyyMm)) {
        showJournalAlert(
          'Periode Ditutup',
          `Transaksi ini berada di periode ${yyyyMm} yang telah ditutup dan dikunci. Tidak dapat mengubah transaksi ini.`,
          'error'
        );
        return;
      }
    }

    setEditingId(entry.id);
    const dateObj = entry.date?.seconds ? new Date(entry.date.seconds * 1000) : new Date(entry.date);
    setEntryDate(isNaN(dateObj.getTime()) ? new Date().toISOString().substring(0, 10) : dateObj.toISOString().substring(0, 10));
    setDescription(entry.description);
    
    // Determine currency
    const isIdr = entry.lines?.some(l => l.originalCurrency === 'IDR') || false;
    setSelectedCurrency(isIdr ? 'IDR' : 'NTD');

    // Populate lines, formatting with thousands separator
    const convertedLines: UIJournalLine[] = entry.lines.map(l => {
      const isLineIdr = l.originalCurrency === 'IDR';
      let debNum = 0;
      let credNum = 0;
      if (isLineIdr) {
        debNum = l.originalDebitIDR || 0;
        credNum = l.originalCreditIDR || 0;
      } else {
        debNum = l.debit / 100;
        credNum = l.credit / 100;
      }

      const liveName = l.accountCode ? (accounts.find(a => a.code === l.accountCode)?.name || l.account) : l.account;

      return {
        account: liveName,
        accountCode: l.accountCode || '',
        debit: debNum > 0 ? debNum.toLocaleString('en-US') : '',
        credit: credNum > 0 ? credNum.toLocaleString('en-US') : ''
      };
    });
    setLines(convertedLines);
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  // Save/Submit Form
  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (entryDate) {
      const targetPeriod = entryDate.substring(0, 7);
      if (closedPeriods.includes(targetPeriod)) {
        triggerShake('date');
        setFormError(`Periode ${targetPeriod} sudah ditutup. Tidak dapat membuat atau mengubah entri jurnal.`);
        return;
      }
    }

    let hasValidationError = false;

    // Check date
    if (!entryDate) {
      triggerShake('date');
      hasValidationError = true;
    }

    // Check account selection
    lines.forEach((line, idx) => {
      if (!line.account || line.account === '' || line.account === '--') {
        triggerShake(`line-account-${idx}`);
        hasValidationError = true;
      }
    });

    // Check balance rule
    if (!isBalanced) {
      triggerShake('balance');
      hasValidationError = true;
    }

    if (hasValidationError) {
      setFormError('Lengkapi semua field wajib dan pastikan jurnal seimbang (Debit = Kredit).');
      return;
    }

    try {
      // Map UI lines to DB JournalEntryLine
      let dbLines: JournalEntryLine[] = lines.map(line => {
        const rawDebit = parseLineVal(line.debit);
        const rawCredit = parseLineVal(line.credit);
        
        if (selectedCurrency === 'IDR') {
          return {
            account: line.account,
            accountCode: line.accountCode || '',
            debit: Math.round((rawDebit / exchangeRate) * 100),
            credit: Math.round((rawCredit / exchangeRate) * 100),
            originalCurrency: 'IDR',
            originalDebitIDR: rawDebit,
            originalCreditIDR: rawCredit
          };
        } else {
          return {
            account: line.account,
            accountCode: line.accountCode || '',
            debit: Math.round(rawDebit * 100),
            credit: Math.round(rawCredit * 100)
          };
        }
      });

      // Simple rounding correction to enforce mathematical balance in DB NTD cents
      dbLines = dbLines.map(line => ({
        ...line,
        debit: Math.round(line.debit),
        credit: Math.round(line.credit)
      }));

      const finalDebitSumInCents = dbLines.reduce((s, l) => s + l.debit, 0);
      const finalCreditSumInCents = dbLines.reduce((s, l) => s + l.credit, 0);
      const centDiff = finalDebitSumInCents - finalCreditSumInCents;
      if (centDiff !== 0) {
        const lineToAdjust = dbLines.find(l => centDiff > 0 ? l.credit > 0 : l.debit > 0);
        if (lineToAdjust) {
          if (centDiff > 0) {
            lineToAdjust.credit += centDiff;
          } else {
            lineToAdjust.debit -= centDiff;
          }
        }
      }

      const dateTimestamp = Timestamp.fromDate(new Date(entryDate));
      const newId = editingId || (await getNextJournalId(entryDate));
      const refDoc = doc(db, 'journalEntries', newId);

      const entryPayload: JournalEntry = {
        id: newId,
        date: dateTimestamp,
        description: description.trim(),
        lines: dbLines,
        refId: '',
        refType: 'Manual',
        createdAt: editingId ? (journals.find(j => j.id === editingId)?.createdAt || Timestamp.now()) : Timestamp.now()
      };

      const batch = writeBatch(db);
      batch.set(refDoc, entryPayload, { merge: true });

      if (editingId) {
        const beforeSnapshot = journals.find(j => j.id === editingId);
        if (beforeSnapshot) {
          const auditId = doc(collection(db, 'auditLog')).id;
          const auditRef = doc(db, 'auditLog', auditId);
          const auditEntry: AuditLogEntry = {
            id: auditId,
            timestamp: Timestamp.now(),
            userEmail: profile?.email || auth.currentUser?.email || 'unknown@kangenbukuindo.tw',
            userDisplayName: profile?.displayName || auth.currentUser?.displayName || 'User',
            action: 'EDIT',
            journalId: editingId,
            before: beforeSnapshot,
            after: entryPayload
          };
          batch.set(auditRef, auditEntry);
        }
      }

      await batch.commit();

      setFormSuccess(editingId ? 'Entri jurnal berhasil disimpan!' : 'Entri jurnal baru berhasil dibuat!');
      setTimeout(() => {
        setEditingId(null);
        setDescription('');
        setRefId('');
        setRefType('Manual');
        setLines([
          { account: '', accountCode: '', debit: '', credit: '' },
          { account: '', accountCode: '', debit: '', credit: '' }
        ]);
        setFormSuccess('');
        setShowForm(false);
      }, 1000);

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'journalEntries');
      setFormError('Gagal menyimpan jurnal ke basis data.');
    }
  };

  // Duplicate mockup action
  const handleDuplicateJournal = (entry: JournalEntry) => {
    setEditingId(null); // Make sure it's a new one
    setDescription(`Copy: ${entry.description || ''}`);
    
    // Determine currency
    const isIdr = entry.lines?.some(l => l.originalCurrency === 'IDR') || false;
    setSelectedCurrency(isIdr ? 'IDR' : 'NTD');

    const convertedLines: UIJournalLine[] = entry.lines.map(l => {
      const isLineIdr = l.originalCurrency === 'IDR';
      let debNum = 0;
      let credNum = 0;
      if (isLineIdr) {
        debNum = l.originalDebitIDR || 0;
        credNum = l.originalCreditIDR || 0;
      } else {
        debNum = l.debit / 100;
        credNum = l.credit / 100;
      }

      const liveName = l.accountCode ? (accounts.find(a => a.code === l.accountCode)?.name || l.account) : l.account;

      return {
        account: liveName,
        accountCode: l.accountCode || '',
        debit: debNum > 0 ? debNum.toLocaleString('en-US') : '',
        credit: credNum > 0 ? credNum.toLocaleString('en-US') : ''
      };
    });
    setLines(convertedLines);
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
    showJournalAlert(
      'Templat Jurnal Disalin',
      'Entri jurnal asal berhasil dimuat sebagai templat baru pada Form popup.',
      'success'
    );
  };

  // Filters calculation
  const sortedAndFormattedJournals = useMemo(() => {
    return getSortedAndFormattedJournals(journals);
  }, [journals]);

  const filteredJournals = sortedAndFormattedJournals.filter(entry => {
    // Filter by Date
    if (entry.date) {
      const entryDate = entry.date.seconds 
        ? new Date(entry.date.seconds * 1000) 
        : new Date(entry.date);
      
      if (startDate) {
        const start = new Date(startDate.getTime());
        start.setHours(0, 0, 0, 0);
        if (entryDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate.getTime());
        end.setHours(23, 59, 59, 999);
        if (entryDate > end) return false;
      }
    }

    // Filter by Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hasAccountSearch = entry.lines?.some(l => l.account && l.account.toLowerCase().includes(q));
      const hasDescSearch = entry.description ? entry.description.toLowerCase().includes(q) : false;
      const hasIdSearch = entry.displayJournalId ? entry.displayJournalId.toLowerCase().includes(q) : false;
      const hasRefSearch = entry.refId ? entry.refId.toLowerCase().includes(q) : false;
      
      if (!hasAccountSearch && !hasDescSearch && !hasIdSearch && !hasRefSearch) return false;
    }

    return true;
  });

  const journalsPerPage = 50;
  const totalJournalPages = Math.ceil(filteredJournals.length / journalsPerPage) || 1;
  const currentJournalPage = Math.min(Math.max(1, journalPage), totalJournalPages);
  const paginatedJournals = filteredJournals.slice((currentJournalPage - 1) * journalsPerPage, currentJournalPage * journalsPerPage);

  // Calculate overall totals
  const overallDebitTotal = journals.reduce((acc, entry) => {
    if (!entry.lines) return acc;
    const entryDeb = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
    return acc + entryDeb;
  }, 0) / 100;

  const overallCreditTotal = journals.reduce((acc, entry) => {
    if (!entry.lines) return acc;
    const entryCred = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
    return acc + entryCred;
  }, 0) / 100;

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div>
          <div className="text-xs text-neutral-450 font-medium tracking-wide font-numeric mb-1">
            Dasbor &gt; Akun Jurnal
          </div>
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
            Daftar Entri / Akun Jurnal
          </h1>
        </div>

        {/* Top-Right Action to trigger slide creation form */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingId(null);
              setShowForm(!showForm);
              setLines([
                { account: '', accountCode: '', debit: '', credit: '' },
                { account: '', accountCode: '', debit: '', credit: '' }
              ]);
              setDescription('');
              setFormError('');
              setFormSuccess('');
            }}
            className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition font-bold text-xs shadow-xs flex items-center gap-1.5"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Sembunyikan Form' : 'Buat Jurnal'}
          </button>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
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
              placeholder="Cari deskripsi, No Ref, akun..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-64 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-700 dark:text-neutral-200"
            />
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSearchQuery('');
            }}
            className="p-2 bg-pink-50 dark:bg-pink-950/15 text-pink-650 dark:text-pink-400 hover:bg-pink-100 rounded-lg transition"
            title="Reset Filters"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3. "Buat Entri Jurnal" FORM - FULLSCREEN POPUP MODAL OVERLAY */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-250 dark:border-neutral-805 p-6 rounded-2xl space-y-4 shadow-2xl max-w-7xl w-full max-h-[96vh] overflow-y-auto relative animate-fadeIn select-text">
            
            {/* Header with Title and Close Button */}
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="space-y-1">
                <h2 className="text-sm font-extrabold text-neutral-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>📝</span> {editingId ? `Ubah Entri Jurnal Jasa` : 'Buat Entri Jurnal Baru'}
                </h2>
                <p className="text-[11px] text-neutral-450">
                  Formulir entri pencatatan akuntansi ganda (double-entry ledger)
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="p-1 px-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 rounded-lg text-xs font-bold text-neutral-450 hover:text-neutral-600 transition"
                type="button"
              >
                Tutup [X]
              </button>
            </div>

            <form onSubmit={handleSaveJournal} className="space-y-5">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/30 rounded-xl text-xs text-red-755 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-950/10 border border-green-200 dark:border-green-900/30 text-green-755 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* TWO-COLUMN SIDE-BY-SIDE GRID LAYOUT */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* COLUMN 1: INFORMASI UMUM */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl space-y-4 lg:col-span-4 flex flex-col justify-start">
                  <h3 className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest border-b border-neutral-200/40 pb-2 mb-1">
                    🗒️ Informasi Umum
                  </h3>

                  <div className="space-y-4">
                    {/* Pre-generated Journal Number Readout */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-500">Nomor Jurnal (Sistem Tergenerate)</label>
                      <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl font-numeric text-xs font-bold text-teal-600 dark:text-teal-400">
                        {editingId || "Otomatis"}
                        <span className="text-[10px] font-normal text-neutral-400 ml-1.5">(Otomatis resets daily)</span>
                      </div>
                    </div>

                    {/* Date Input with shake validation */}
                    <div className={`space-y-1.5 ${shaking['date'] ? 'animate-shake' : ''}`}>
                      <label className="text-xs font-semibold text-neutral-500">Tanggal Transaksi <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        required
                        value={entryDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          const targetPeriod = val.substring(0, 7);
                          if (closedPeriods.includes(targetPeriod)) {
                            setFormError(`Periode ${targetPeriod} sudah ditutup. Silakan pilih tanggal di periode terbuka.`);
                          } else {
                            setFormError('');
                          }
                          setEntryDate(val);
                        }}
                        className={`w-full p-2.5 border ${
                          shaking['date'] ? 'border-red-500 ring-2 ring-red-500/10' : 'border-neutral-300 dark:border-neutral-750'
                        } bg-transparent rounded-xl text-xs outline-none text-neutral-800 dark:text-neutral-100 font-bold`}
                      />
                      {entryDate && closedPeriods.includes(entryDate.substring(0, 7)) && (
                        <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Periode ini sudah ditutup. Harap pilih periode terbuka.
                        </p>
                      )}
                    </div>

                    {/* Currency toggle for original transactions */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-500">Mata Uang Input</label>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setSelectedCurrency('NTD')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition ${
                            selectedCurrency === 'NTD' 
                              ? 'bg-white dark:bg-neutral-900 text-teal-650 dark:text-teal-400 shadow-sm' 
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          NT$ (Taiwan Dollar)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCurrency('IDR')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition ${
                            selectedCurrency === 'IDR' 
                              ? 'bg-white dark:bg-neutral-900 text-teal-650 dark:text-teal-400 shadow-sm' 
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          Rp (Rupiah IDR)
                        </button>
                      </div>
                      {selectedCurrency === 'IDR' && (
                        <div className="text-[10px] text-neutral-450 mt-1 flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-950 p-2.5 border border-neutral-200 dark:border-neutral-800 rounded-xl leading-relaxed">
                          <Info size={13} className="text-teal-500 shrink-0" />
                          <span>Kurs Aktif: 1 NTD ≈ <strong>Rp {Math.round(exchangeRate)}</strong>. Pengisian Debit/Kredit dlm Rupiah (Rp) & otomatis dikonversi ke NTD secara presisi.</span>
                        </div>
                      )}
                    </div>

                    {/* Deskripsi Transaksi (Optional Combobox with Preset) */}
                    <div className="relative space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-neutral-500">Deskripsi Transaksi</label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (!description.trim()) return;
                              if (descriptionPresets.includes(description.trim())) return;
                              const next = [...descriptionPresets, description.trim()];
                              setDescriptionPresets(next);
                              localStorage.setItem('journal_desc_presets', JSON.stringify(next));
                            }}
                            className="p-1 px-1.5 rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 text-[10px] flex items-center gap-1 font-numeric hover:bg-neutral-200"
                            title="Simpan Deskripsi Saat Ini Sebagai Template"
                          >
                            <Plus size={10} /> + Simpan Preset
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowPresetsList(!showPresetsList)}
                            className={`p-1 rounded ${showPresetsList ? 'bg-teal-50 text-teal-600' : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-450'} transition`}
                            title="Lihat Template Preset"
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={3}
                        value={description}
                        placeholder="Uraian ringkas deskripsi transaksi jurnal..."
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full p-2.5 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl text-xs outline-none text-neutral-800 dark:text-neutral-100 resize-none leading-relaxed font-text"
                      />

                      {showPresetsList && (
                        <div className="absolute left-0 right-0 z-50 mt-1 p-2 bg-white dark:bg-neutral-950 border border-neutral-250 dark:border-neutral-805 rounded-xl shadow-2xl space-y-1 max-h-48 overflow-y-auto animate-fadeIn select-none">
                          <div className="text-[9.5px] uppercase font-bold text-neutral-400 px-2 py-1 font-numeric tracking-wider border-b border-neutral-200/50 mb-1 flex items-center justify-between">
                            <span>REUSABLE PRESETS</span>
                            <button type="button" onClick={() => setShowPresetsList(false)} className="text-neutral-400 hover:text-neutral-600">
                              [Tutup]
                            </button>
                          </div>
                          {descriptionPresets.length === 0 ? (
                            <div className="text-center py-4 text-xs text-neutral-400 font-numeric">
                              Tidak ada preset. ketik teks dan klik + untuk menyimpan.
                            </div>
                          ) : (
                            descriptionPresets.map((preset, pIdx) => (
                              <div
                                key={pIdx}
                                className="group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-neutral-100 dark:hover:bg-neutral-905 cursor-pointer text-neutral-700 dark:text-neutral-300 transition"
                              >
                                <span 
                                  onClick={() => {
                                    setDescription(preset);
                                    setShowPresetsList(false);
                                  }}
                                  className="flex-1 text-left truncate font-medium pr-2"
                                >
                                  {preset}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = descriptionPresets.filter(p => p !== preset);
                                    setDescriptionPresets(next);
                                    localStorage.setItem('journal_desc_presets', JSON.stringify(next));
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition duration-150 shrink-0"
                                  title="Hapus Preset"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: DEBET / KREDIT LINE ITEMS */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-805 p-5 rounded-2xl space-y-4 lg:col-span-8 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest border-b border-neutral-200/40 pb-2 mb-4">
                      📊 Audit Line Items ({selectedCurrency})
                    </h3>

                    <div className="overflow-x-auto pb-60">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-400 font-extrabold">
                            <th className="pb-2 w-[44%] uppercase tracking-wide">PILIH AKUN (COA) <span className="text-red-500">*</span></th>
                            <th className="pb-2 text-right w-[24%] uppercase tracking-wide">DEBIT ({selectedCurrency})</th>
                            <th className="pb-2 text-right w-[24%] uppercase tracking-wide">KREDIT ({selectedCurrency})</th>
                            <th className="pb-2 w-[8%] text-center font-bold">AKSI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line, index) => (
                            <tr key={index} className="border-b border-neutral-50 dark:border-neutral-900">
                              {/* Searchable hierarchical account selection */}
                              <td className="py-2.5 pr-2">
                                <AccountCombobox
                                  accounts={accounts}
                                  selectedValue={line.account}
                                  onSelect={(val) => handleLineChange(index, 'account', val)}
                                  isShaking={shaking[`line-account-${index}`]}
                                />
                              </td>

                              {/* Real-time formatted debit input */}
                              <td className="py-2.5 px-1 text-right">
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={line.debit}
                                  disabled={line.credit !== ''}
                                  onChange={(e) => handleLineChange(index, 'debit', e.target.value)}
                                  className="w-full p-2 text-right border border-neutral-250 dark:border-neutral-805 hover:border-neutral-400 rounded-lg text-xs outline-none font-numeric font-bold text-green-600 dark:text-green-400 bg-neutral-50/20 disabled:opacity-30 disabled:bg-neutral-100 dark:disabled:bg-neutral-900"
                                />
                                {selectedCurrency === 'IDR' && line.debit !== '' && (
                                  <div className="text-[10px] text-neutral-450 mt-1 font-numeric mr-1">
                                    ≈ NT$ {Math.round(parseLineVal(line.debit) / exchangeRate).toLocaleString('en-US')}
                                  </div>
                                )}
                              </td>

                              {/* Real-time formatted credit input */}
                              <td className="py-2.5 pl-1 text-right">
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={line.credit}
                                  disabled={line.debit !== ''}
                                  onChange={(e) => handleLineChange(index, 'credit', e.target.value)}
                                  className="w-full p-2 text-right border border-neutral-250 dark:border-neutral-805 hover:border-neutral-400 rounded-lg text-xs outline-none font-numeric font-bold text-red-655 dark:text-red-400 bg-neutral-50/20 disabled:opacity-30 disabled:bg-neutral-100 dark:disabled:bg-neutral-900"
                                />
                                {selectedCurrency === 'IDR' && line.credit !== '' && (
                                  <div className="text-[10px] text-neutral-450 mt-1 font-numeric mr-1">
                                    ≈ NT$ {Math.round(parseLineVal(line.credit) / exchangeRate).toLocaleString('en-US')}
                                  </div>
                                )}
                              </td>

                              {/* Remove line */}
                              <td className="py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(index)}
                                  className="p-1.5 text-neutral-400 hover:text-red-550 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-950 rounded-lg transition-all"
                                  title="Hapus Baris Audit"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="mt-3.5 text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Tambah Baris Transaksi
                    </button>
                  </div>

                  {/* Audit Balance Verification with shaking state */}
                  <div className={`border-t border-neutral-200 dark:border-neutral-800 pt-4 mt-6 ${shaking['balance'] ? 'animate-shake' : ''}`}>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-neutral-50 dark:bg-neutral-955 p-3.5 rounded-xl border border-neutral-150 dark:border-neutral-805">
                      
                      {/* Live balanced audit indicator badge */}
                      <div className="flex items-center gap-2">
                        {isBalanced ? (
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200 dark:border-green-905 px-3 py-1.5 rounded-full">
                            <CheckCircle2 className="h-4 w-4" /> Balanced
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-450 border border-red-200 dark:border-red-905 px-3 py-1.5 rounded-full">
                            <AlertCircle className="h-4 w-4 animate-pulse" /> Balance Failed
                          </div>
                        )}
                      </div>

                      {/* Numeric values */}
                      <div className="flex flex-col items-end gap-1.5 text-right w-full sm:w-auto">
                        <div className="text-xs text-neutral-550 font-bold font-numeric">
                          Total Debit ({selectedCurrency}):{' '}
                          <span className="font-extrabold text-green-600 dark:text-green-400">
                            {selectedCurrency === 'IDR' ? 'Rp ' : 'NT$ '}
                            {selectedCurrency === 'IDR' ? totalDebitSum.toLocaleString('id-ID') : totalDebitSum.toLocaleString('en-US')}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-550 font-bold font-numeric">
                          Total Kredit ({selectedCurrency}):{' '}
                          <span className="font-extrabold text-red-655 dark:text-red-400">
                            {selectedCurrency === 'IDR' ? 'Rp ' : 'NT$ '}
                            {selectedCurrency === 'IDR' ? totalCreditSum.toLocaleString('id-ID') : totalCreditSum.toLocaleString('en-US')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 mt-5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowForm(false);
                          setEditingId(null);
                        }}
                        className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-500 font-bold rounded-lg text-xs transition"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 text-xs font-extrabold rounded-lg transition shadow-md bg-teal-500 hover:bg-teal-600 text-white cursor-pointer"
                      >
                        {editingId ? 'Simpan Perubahan' : 'Posting Jurnal Buku Besar'}
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MAIN JOURNALS LIST TABLE */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <RefreshCw className="h-7 w-7 text-teal-500 animate-spin" />
          <span className="ml-2 text-sm text-neutral-500">Memuat Jurnal Transaksi...</span>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-805 rounded-xl overflow-hidden shadow-xs">
          
          <div className="bg-neutral-50 dark:bg-neutral-850 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-neutral-800 dark:text-white uppercase tracking-wider">
              📝 Daftar Jurnal Buku Besar
            </h3>
            <span className="text-xs text-neutral-500 font-numeric">
              Total {filteredJournals.length} Entri Jurnal
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-100/50 dark:bg-neutral-950 border-b border-neutral-250 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-semibold">
                  <th className="p-3 w-32">TANGGAL</th>
                  <th className="p-3 w-36">NOMOR JURNAL</th>
                  <th className="p-3">DESKRIPSI TRANSAKSI</th>
                  <th className="p-3 text-right w-52">DEBIT</th>
                  <th className="p-3 text-right w-52">KREDIT</th>
                  <th className="p-3 w-28 text-center">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-150 dark:divide-neutral-850">
                {filteredJournals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-450 dark:text-neutral-500 font-numeric">
                      Tidak ada entri jurnal ditemukan.
                    </td>
                  </tr>
                ) : (
                  paginatedJournals.map((entry) => {
                    const formattedDate = formatDate(entry.date);
                    
                    const isExpanded = !!expandedRows[entry.id];
                    
                    const debitLines = entry.lines?.filter(l => (l.debit || 0) > 0) || [];
                    const creditLines = entry.lines?.filter(l => (l.credit || 0) > 0) || [];
                    const isMultiLine = debitLines.length > 1 || creditLines.length > 1;

                    // Combined values
                    const combinedDebitNTD = debitLines.reduce((s, l) => s + (l.debit || 0), 0) / 100;
                    const combinedCreditNTD = creditLines.reduce((s, l) => s + (l.credit || 0), 0) / 100;

                    const totalIdrDebit = debitLines.some(l => l.originalCurrency === 'IDR')
                      ? debitLines.reduce((s, l) => s + (l.originalDebitIDR || 0), 0)
                      : null;

                    const totalIdrCredit = creditLines.some(l => l.originalCurrency === 'IDR')
                      ? creditLines.reduce((s, l) => s + (l.originalCreditIDR || 0), 0)
                      : null;

                    return (
                      <tr key={entry.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/10 transition align-top">
                        {/* 1. Date Format: YYYY/MM/DD */}
                        <td className="p-3 font-numeric text-neutral-700 dark:text-neutral-300 font-bold whitespace-nowrap">
                          {formattedDate}
                        </td>

                        {/* 2. Journal Number with Copyable Badge (Clickable, links to Detail Modal) */}
                        <td className="p-3">
                          <button
                            onClick={() => setSelectedJournalForDetail(entry)}
                            className="px-2 py-1 border border-neutral-200 hover:border-teal-500 dark:border-neutral-850 dark:hover:border-teal-500 rounded-lg font-bold font-numeric text-[10.5px] text-teal-650 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 bg-neutral-50 hover:bg-teal-50/10 dark:bg-neutral-950 block w-max transition duration-150 shadow-2xs cursor-pointer select-none"
                            type="button"
                            title="Klik untuk melihat detail jurnal"
                          >
                            {entry.displayJournalId}
                          </button>
                        </td>

                        {/* 3. Description & presets triggers */}
                        <td className="p-3">
                          {(() => {
                            let relatedPo = null;
                            const poIdMatch = entry.id.match(/^JU-PO-(.+?)-(create|rec-freight|rec-capitalize)(?:-.+)?$/);
                            let cleanAction = '';

                            if (poIdMatch) {
                              const poId = poIdMatch[1];
                              const suffixType = poIdMatch[2];
                              relatedPo = purchaseOrders.find(p => p.id === poId);
                              if (relatedPo) {
                                if (suffixType === 'create') {
                                  cleanAction = 'Pemesanan Barang';
                                } else if (suffixType === 'rec-freight') {
                                  cleanAction = 'Pembayaran Freight-in';
                                } else if (suffixType === 'rec-capitalize') {
                                  cleanAction = 'Penerimaan Barang';
                                }
                              }
                            } else if (entry.refId) {
                              relatedPo = purchaseOrders.find(p => p.id === entry.refId || p.purchaseCode === entry.refId);
                            }

                            const poCode = relatedPo ? (relatedPo.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '') || '') : '';
                            const getCleanDescription = (desc: string) => {
                              if (!desc) return '(Tidak ada deskripsi)';
                              const parts = desc.split(' - ');
                              if (parts.length > 1) {
                                  return parts.slice(1).join(' - ');
                              }
                              return desc.replace(/^Purchase\s+#[^\s]+\s*/i, '');
                            };
                            const displayedDesc = cleanAction || getCleanDescription(entry.description);

                            if (relatedPo) {
                              const isRecCapitalize = poIdMatch && poIdMatch[2] === 'rec-capitalize';
                              let freightCodeFromEntry = (entry as any).freightCode || '';
                              let isWithFreight = (entry as any).isReceivedWithFreight;

                              if (isRecCapitalize) {
                                return (
                                  <div className="flex flex-col space-y-1 items-start">
                                    <button
                                      onClick={() => {
                                        localStorage.setItem('search_po_filter', poCode);
                                        if (setTab) setTab('purchases');
                                      }}
                                      className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline text-left cursor-pointer text-[13px] font-numeric"
                                      type="button"
                                    >
                                      PO #{poCode}
                                    </button>
                                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 leading-relaxed text-xs">
                                      {entry.description || '(Tidak ada deskripsi)'}
                                    </span>
                                  </div>
                                );
                              }

                              // Default fallback for other PO entries (e.g. create, rec-freight)
                              return (
                                <div className="flex flex-col space-y-1 items-start">
                                  <button
                                    onClick={() => {
                                      localStorage.setItem('search_po_filter', poCode);
                                      if (setTab) setTab('purchases');
                                    }}
                                    className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline text-left cursor-pointer text-[13px] font-numeric"
                                    type="button"
                                  >
                                    PO #{poCode}
                                  </button>
                                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 leading-relaxed text-xs">
                                    {entry.description || '(Tidak ada deskripsi)'}
                                  </span>
                                </div>
                              );
                            } else {
                              const fCode = (entry as any).freightCode || (entry.id.startsWith('JU-FR-') ? (entry.id.endsWith('-capitalize') || entry.id.endsWith('-payment') ? entry.id.split('-')[2] : '') : '');
                              if (fCode) {
                                const cleanFCode = fCode.toUpperCase().trim();
                                const docNoFreight = freightDocNoMap[cleanFCode] || cleanFCode;
                                return (
                                  <div className="flex flex-col space-y-1 items-start">
                                    <button
                                      onClick={() => {
                                        localStorage.setItem('search_freight_filter', docNoFreight);
                                        if (setTab) setTab('freight-in');
                                      }}
                                      className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline text-left cursor-pointer text-[13px] font-numeric"
                                      type="button"
                                    >
                                      {docNoFreight}
                                    </button>
                                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 leading-relaxed text-xs">
                                      {getCleanDescription(entry.description)}
                                    </span>
                                  </div>
                                );
                              }
                              return (
                                <span className="font-bold text-neutral-800 dark:text-neutral-100 break-words leading-relaxed text-xs">
                                  {entry.description || '(Tidak ada deskripsi)'}
                                </span>
                              );
                            }
                          })()}
                        </td>

                        {/* 4. DEBIT (NT$ | Account) stacked */}
                        <td className="p-3 text-right">
                          {(!isMultiLine || !isExpanded) ? (
                            // Collapsed/Combined View
                            (<div className="space-y-0.5">
                              {debitLines.some(l => l.originalCurrency === 'IDR') ? (
                                <>
                                  <div className="font-numeric font-extrabold text-[12.5px] text-neutral-850 dark:text-neutral-100">
                                    NT$ {combinedDebitNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="font-numeric text-[10px] text-neutral-450 dark:text-neutral-500 font-semibold">
                                    {formatIDR(totalIdrDebit ?? 0)}
                                  </div>
                                </>
                              ) : (
                                <div className="font-numeric font-extrabold text-[12.5px] text-neutral-850 dark:text-neutral-100">
                                  NT$ {combinedDebitNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              <div className="space-y-1 mt-1 text-right">
                                {debitLines.map((line, lIdx) => (
                                  <div key={lIdx} className="text-[10.5px] text-neutral-500 font-semibold flex items-center justify-end gap-1 select-none leading-tight break-words whitespace-normal text-right">
                                    <span>{getLiveAccountName(line)}</span>
                                    <span className="text-green-600 font-bold shrink-0">↑</span>
                                  </div>
                                ))}
                              </div>
                            </div>)
                          ) : (
                            // Expanded List View
                            (<div className="space-y-3">
                              {debitLines.map((line, lIdx) => {
                                const isLineIdr = line.originalCurrency === 'IDR';
                                return (
                                  <div key={lIdx} className="border-b border-dashed border-neutral-150 dark:border-neutral-800 last:border-0 pb-1.5 last:pb-0 mb-1.5 last:mb-0 space-y-0.5">
                                    {isLineIdr ? (
                                      <>
                                        <div className="font-numeric font-extrabold text-neutral-805 dark:text-neutral-100 text-xs">
                                          NT$ {((line.debit || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                        <div className="font-numeric text-[10px] text-neutral-450 dark:text-neutral-500">
                                          {formatIDR(line.originalDebitIDR || 0)}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="font-numeric font-extrabold text-neutral-800 dark:text-neutral-200 text-xs">
                                        NT$ {((line.debit || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                      </div>
                                    )}
                                    <div className="text-[10px] text-neutral-500 font-semibold flex flex-wrap items-center justify-end gap-1 leading-tight">
                                      <span>{getLiveAccountName(line)}</span>
                                      <span className="text-green-600 font-bold">↑</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>)
                          )}
                        </td>

                        {/* 5. KREDIT (NT$ | Account) stacked */}
                        <td className="p-3 text-right">
                          {(!isMultiLine || !isExpanded) ? (
                            // Collapsed/Combined View
                            (<div className="space-y-0.5">
                              {creditLines.some(l => l.originalCurrency === 'IDR') ? (
                                <>
                                  <div className="font-numeric font-extrabold text-[12.5px] text-neutral-850 dark:text-neutral-100">
                                    NT$ {combinedCreditNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="font-numeric text-[10px] text-neutral-450 dark:text-neutral-500 font-semibold">
                                    {formatIDR(totalIdrCredit ?? 0)}
                                  </div>
                                </>
                              ) : (
                                <div className="font-numeric font-extrabold text-[12.5px] text-neutral-850 dark:text-neutral-100">
                                  NT$ {combinedCreditNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              <div className="space-y-1 mt-1 text-right">
                                {creditLines.map((line, lIdx) => (
                                  <div key={lIdx} className="text-[10.5px] text-neutral-500 font-semibold flex items-center justify-end gap-1 select-none leading-tight break-words whitespace-normal text-right">
                                    <span>{getLiveAccountName(line)}</span>
                                    <span className="text-red-500 font-bold shrink-0">↓</span>
                                  </div>
                                ))}
                              </div>
                            </div>)
                          ) : (
                            // Expanded List View
                            (<div className="space-y-3">
                              {creditLines.map((line, lIdx) => {
                                const isLineIdr = line.originalCurrency === 'IDR';
                                return (
                                  <div key={lIdx} className="border-b border-dashed border-neutral-150 dark:border-neutral-800 last:border-0 pb-1.5 last:pb-0 mb-1.5 last:mb-0 space-y-0.5">
                                    {isLineIdr ? (
                                      <>
                                        <div className="font-numeric font-extrabold text-neutral-805 dark:text-neutral-100 text-xs">
                                          NT$ {((line.credit || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                        <div className="font-numeric text-[10px] text-neutral-450 dark:text-neutral-500">
                                          {formatIDR(line.originalCreditIDR || 0)}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="font-numeric font-extrabold text-neutral-800 dark:text-neutral-200 text-xs">
                                        NT$ {((line.credit || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                      </div>
                                    )}
                                    <div className="text-[10px] text-neutral-500 font-semibold flex flex-wrap items-center justify-end gap-1 leading-tight">
                                      <span>{getLiveAccountName(line)}</span>
                                      <span className="text-red-500 font-bold">↓</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>)
                          )}
                        </td>

                        {/* 6. Simple aligned actions (Edit/Delete template actions) */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Duplicate/view template action */}
                            <button
                              onClick={() => handleDuplicateJournal(entry)}
                              className="p-1.5 bg-neutral-105 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg transition"
                              title="Salin sebagai Jurnal Baru"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>

                            {/* Edit Action */}
                            {!isJournalLocked(entry) ? (
                              <button
                                onClick={() => handleBeginEdit(entry)}
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg dark:bg-amber-955/20 dark:text-amber-400 transition"
                                title="Edit Jurnal"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <div className="w-6.5 h-6.5" />
                            )}

                            {/* Delete Action */}
                            {!isJournalLocked(entry) ? (
                              <button
                                onClick={() => handleDeleteJournal(entry.id)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-650 rounded-lg dark:bg-red-955/20 dark:text-red-400 transition"
                                title="Delete Jurnal"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <div className="p-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 rounded-lg cursor-not-allowed" title="Auto - Tidak Bisa Dihapus">
                                <Lock className="h-3.5 w-3.5" />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalJournalPages > 1 && (
            <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 px-4 py-3 bg-neutral-50/50 dark:bg-neutral-950/30 font-text">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                Menampilkan <span className="font-bold text-neutral-800 dark:text-neutral-200">{((currentJournalPage - 1) * journalsPerPage) + 1}</span> - <span className="font-bold text-neutral-800 dark:text-neutral-200">{Math.min(currentJournalPage * journalsPerPage, filteredJournals.length)}</span> dari <span className="font-bold text-neutral-800 dark:text-neutral-200">{filteredJournals.length}</span> jurnal
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentJournalPage === 1}
                  onClick={() => setJournalPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                
                {Array.from({ length: totalJournalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  if (totalJournalPages > 5 && Math.abs(pageNum - currentJournalPage) > 1 && pageNum !== 1 && pageNum !== totalJournalPages) {
                    if (pageNum === 2 || pageNum === totalJournalPages - 1) {
                      return <span key={pageNum} className="text-xs text-neutral-400 px-1 select-none">...</span>;
                    }
                    return null;
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setJournalPage(pageNum)}
                      className={`h-6 w-6 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                        currentJournalPage === pageNum
                          ? 'bg-teal-600 text-white shadow-xs border border-teal-600'
                          : 'border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={currentJournalPage === totalJournalPages}
                  onClick={() => setJournalPage((p) => Math.min(totalJournalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2.5. JOURNAL ENTRY DETAIL MODAL */}
      {selectedJournalForDetail && (() => {
        const isOriginalIdr = selectedJournalForDetail.lines?.some(l => l.originalCurrency === 'IDR') || false;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-fadeIn flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-neutral-150 dark:border-neutral-800">
                <div>
                  <h3 className="font-extrabold text-neutral-900 dark:text-neutral-50 text-base">
                    Detail Entri Jurnal Umum
                  </h3>
                  <p className="text-[11px] text-neutral-450 mt-0.5">
                    Audit Buku Besar Elektronik
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedJournalForDetail(null);
                    setCopiedDetailId(false);
                  }}
                  className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition cursor-pointer"
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 space-y-6 overflow-y-auto flex-1 select-text">
                {/* Metadata row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-neutral-50 dark:bg-neutral-950 p-4 border border-neutral-200 dark:border-neutral-850 rounded-xl">
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                      Nomor Jurnal
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="font-numeric font-bold text-xs text-teal-650 dark:text-teal-400">
                        {selectedJournalForDetail.displayJournalId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedJournalForDetail.displayJournalId);
                          setCopiedDetailId(true);
                          setTimeout(() => setCopiedDetailId(false), 2000);
                        }}
                        className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded text-neutral-450 hover:text-neutral-700 transition"
                        title="Salin Nomor Jurnal"
                      >
                        {copiedDetailId ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                      </button>

                      {/* Display original currency tagging badge inside modal header */}
                      {isOriginalIdr ? (
                        <div className="inline-flex items-center px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-extrabold rounded bg-rose-50 text-rose-750 dark:bg-rose-955/20 dark:text-rose-400 border border-rose-200 dark:border-rose-905 select-none font-numeric">
                          Mata Uang: Rp
                        </div>
                      ) : (
                        <div className="inline-flex items-center px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-extrabold rounded bg-teal-50 text-teal-750 dark:bg-teal-955/20 dark:text-teal-400 border border-teal-200 dark:border-teal-905 select-none font-numeric">
                          Mata Uang: NT$
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                      Tanggal Transaksi
                    </div>
                    <div className="font-numeric text-xs text-neutral-800 dark:text-neutral-200 mt-1.5 font-bold">
                      {formatDate(selectedJournalForDetail.date)}
                    </div>
                  </div>
                </div>

                {/* Description box */}
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                    Deskripsi Transaksi
                  </div>
                  <div className="p-3 bg-neutral-50/50 dark:bg-neutral-950/20 border border-neutral-150 dark:border-neutral-850 rounded-xl text-xs font-semibold text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">
                    {selectedJournalForDetail.description || '(Tidak ada deskripsi)'}
                  </div>
                </div>

                {/* Journal Line Items Table */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                    Rincian Entri Jurnal (Debit & Kredit)
                  </div>
                  <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-bold font-numeric">
                          <th className="p-3 w-[45%]">AKUN COA</th>
                          <th className="p-3 text-right w-[27.5%]">DEBIT</th>
                          <th className="p-3 text-right w-[27.5%]">KREDIT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-150 dark:divide-neutral-850 font-numeric">
                        {selectedJournalForDetail.lines?.map((line, lIdx) => {
                          const lineDebNTD = (line.debit || 0) / 100;
                          const lineCredNTD = (line.credit || 0) / 100;
                          
                          return (
                            <tr key={lIdx} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/5">
                              <td className="p-3 font-semibold text-neutral-700 dark:text-neutral-300">
                                {getLiveAccountName(line)}
                              </td>
                              <td className="p-3 text-right">
                                {isOriginalIdr ? (
                                  line.originalDebitIDR && line.originalDebitIDR > 0 ? (
                                    <div className="font-extrabold text-green-600 dark:text-green-400">
                                      {formatIDR(line.originalDebitIDR)}
                                      <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-normal mt-0.5">
                                        NT$ {lineDebNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    </div>
                                  ) : lineDebNTD > 0 ? (
                                    <div className="font-extrabold text-green-600 dark:text-green-400">
                                      {formatIDR(lineDebNTD * exchangeRate)}
                                      <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-normal mt-0.5">
                                        NT$ {lineDebNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-neutral-300 dark:text-neutral-700">-</span>
                                  )
                                ) : (
                                  lineDebNTD > 0 ? (
                                    <div className="font-extrabold text-green-600 dark:text-green-400">
                                      NT$ {lineDebNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  ) : (
                                    <span className="text-neutral-300 dark:text-neutral-700">-</span>
                                  )
                                )}
                              </td>
                              <td className="p-3 text-right">
                                {isOriginalIdr ? (
                                  line.originalCreditIDR && line.originalCreditIDR > 0 ? (
                                    <div className="font-extrabold text-red-600 dark:text-red-400">
                                      {formatIDR(line.originalCreditIDR)}
                                      <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-normal mt-0.5">
                                        NT$ {lineCredNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    </div>
                                  ) : lineCredNTD > 0 ? (
                                    <div className="font-extrabold text-red-600 dark:text-red-400">
                                      {formatIDR(lineCredNTD * exchangeRate)}
                                      <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-normal mt-0.5">
                                        NT$ {lineCredNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-neutral-300 dark:text-neutral-700">-</span>
                                  )
                                ) : (
                                  lineCredNTD > 0 ? (
                                    <div className="font-extrabold text-red-600 dark:text-red-400">
                                      NT$ {lineCredNTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  ) : (
                                    <span className="text-neutral-300 dark:text-neutral-700">-</span>
                                  )
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        {(() => {
                          const sumDeb = (selectedJournalForDetail.lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0) / 100;
                          const sumCred = (selectedJournalForDetail.lines?.reduce((s, l) => s + (l.credit || 0), 0) || 0) / 100;
                          const sumDebIDR = selectedJournalForDetail.lines?.reduce((s, l) => s + (l.originalDebitIDR || 0), 0) || 0;
                          const sumCredIDR = selectedJournalForDetail.lines?.reduce((s, l) => s + (l.originalCreditIDR || 0), 0) || 0;

                          return (
                            <tr className="bg-neutral-50/50 dark:bg-neutral-950/20 font-bold border-t border-neutral-200 dark:border-neutral-800">
                              <td className="p-3 text-neutral-500 font-bold">Total Balance</td>
                              <td className="p-3 text-right font-numeric font-extrabold text-green-600 dark:text-green-400">
                                {isOriginalIdr ? (
                                  <>
                                    {formatIDR(sumDebIDR)}
                                    <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-normal mt-0.5">
                                      NT$ {sumDeb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    NT$ {sumDeb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </>
                                )}
                              </td>
                              <td className="p-3 text-right font-numeric font-extrabold text-red-650 dark:text-red-400">
                                {isOriginalIdr ? (
                                  <>
                                    {formatIDR(sumCredIDR)}
                                    <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-normal mt-0.5">
                                      NT$ {sumCred.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    NT$ {sumCred.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end px-6 py-4 bg-neutral-50 dark:bg-neutral-850/50 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() => {
                    setSelectedJournalForDetail(null);
                    setCopiedDetailId(false);
                  }}
                  className="px-5 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
                  type="button"
                >
                  Tutup Detail
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. SYSTEM OVERLAY: Universal Confirmation / Alert Modal */}
      {journalModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-6">
              <div className="flex items-start gap-4">
                {journalModal.type === 'confirm' && (
                  <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 shrink-0">
                    <Trash2 className="h-5 w-5" />
                  </div>
                )}
                {journalModal.type === 'error' && (
                  <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30 text-red-650 shrink-0">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                )}
                {journalModal.type === 'success' && (
                  <div className="h-10 w-10 flex items-center justify-center rounded-full bg-green-50 dark:bg-green-950/30 text-green-655 shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                )}
                <div className="space-y-1.5 flex-1 select-text">
                  <h3 className="font-bold text-neutral-900 dark:text-neutral-100 text-base">
                    {journalModal.title}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-450 leading-relaxed whitespace-pre-line">
                    {journalModal.message}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-neutral-50 dark:bg-neutral-850/50 border-t border-neutral-200 dark:border-neutral-800">
              {journalModal.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => setJournalModal(prev => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-850 text-xs font-bold rounded-lg text-neutral-600 dark:text-neutral-300 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      setJournalModal(prev => ({ ...prev, isOpen: false }));
                      if (journalModal.onConfirm) journalModal.onConfirm();
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
                  >
                    Ya, Hapus
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setJournalModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
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
