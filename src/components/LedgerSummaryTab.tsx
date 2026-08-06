import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { JournalEntry, CoaAccount, JournalEntryLine } from '../types';
import { DateRangePicker } from './ui/DateRangePicker';
import { 
  Search, 
  RefreshCw, 
  Download, 
  ChevronDown, 
  Check, 
  X, 
  Copy, 
  ArrowUpRight, 
  ArrowDownLeft, 
  FileText 
} from 'lucide-react';
import { formatIDR } from '../lib/decimal-utils';
import { getSortedAndFormattedJournals } from './JournalTab';

// Grouping and parent checking helpers identical to JournalTab
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

interface AccountDropdownProps {
  accounts: CoaAccount[];
  selectedValue: string;
  onSelect: (value: string) => void;
}

export const AccountDropdown: React.FC<AccountDropdownProps> = ({
  accounts,
  selectedValue,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedAccount = accounts.find(acc => acc.name === selectedValue);

  const buildDropdownItems = () => {
    const categories: ('Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses')[] = [
      'Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'
    ];
    const items: any[] = [];

    // "Select Account" placeholder option at the very top
    items.push({
      type: 'all_placeholder',
      label: 'Select Account',
      accountName: ''
    });

    categories.forEach(cat => {
      const catLabel = cat === 'Revenue' ? 'Income' : cat;
      const catAccs = accounts.filter(acc => acc.type === cat);
      if (catAccs.length === 0) return;

      items.push({ type: 'category', label: catLabel.toUpperCase() });

      const parents = catAccs.filter(acc => isParentAccount(acc, accounts));
      const sortedCatAccs = [...catAccs].sort((a, b) => a.code.localeCompare(b.code));

      const rootAccs = sortedCatAccs.filter(acc => !findParentOf(acc, accounts));

      rootAccs.forEach(acc => {
        const isParent = parents.some(p => p.id === acc.id);
        if (isParent) {
          items.push({
            type: 'parent_header',
            label: acc.name,
            code: acc.code,
            indent: 1
          });

          const children = sortedCatAccs.filter(child => findParentOf(child, accounts)?.id === acc.id);
          children.forEach(child => {
            const isChildParent = isParentAccount(child, accounts);
            if (isChildParent) {
              items.push({
                type: 'parent_header',
                label: child.name,
                code: child.code,
                indent: 2
              });

              const subChildren = sortedCatAccs.filter(sub => findParentOf(sub, accounts)?.id === child.id);
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

  const allItems = useMemo(buildDropdownItems, [accounts]);

  const getFilteredItems = () => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase().trim();

    const filtered: any[] = [];
    filtered.push(allItems[0]); // Always keep "Select Account" at top

    let currentCategory: any = null;
    let currentParent: any = null;
    let pendingCategoryAdded = false;
    let pendingParentAdded = false;

    allItems.slice(1).forEach(item => {
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

  const filteredItems = getFilteredItems();

  return (
    <div ref={containerRef} className="relative w-64 text-left font-text select-none">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 hover:border-neutral-450 dark:hover:border-neutral-600 rounded-lg text-xs text-neutral-800 dark:text-neutral-200 transition duration-150 focus:outline-none"
      >
        <span className="truncate font-semibold text-neutral-700 dark:text-neutral-300">
          {selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : 'Select Account'}
        </span>
        <ChevronDown size={14} className="text-neutral-450 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1.5 w-[300px] sm:w-[350px] bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl flex flex-col max-h-[380px] overflow-hidden animate-fadeIn">
          {/* Header Search Box */}
          <div className="p-2 border-b border-neutral-100 dark:border-neutral-900 flex items-center gap-2 bg-neutral-50/50 dark:bg-neutral-900/50 shrink-0">
            <Search size={14} className="text-neutral-450 ml-1 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Cari Kode atau Nama akun..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-xs text-neutral-800 dark:text-neutral-200 py-1"
            />
            {query && (
              <button 
                type="button" 
                onClick={() => setQuery('')} 
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* List Scroll Area */}
          <div className="overflow-y-auto py-1 max-h-[320px] flex-1">
            {filteredItems.map((item, idx) => {
              if (item.type === 'all_placeholder') {
                const isSelected = selectedValue === '';
                return (
                  <div
                    key="all-placeholder"
                    onClick={() => {
                      onSelect('');
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={`px-4 py-2 text-xs font-semibold cursor-pointer transition flex items-center justify-between ${
                      isSelected 
                        ? 'bg-neutral-100 dark:bg-neutral-900 text-teal-600 dark:text-teal-400 font-bold' 
                        : 'text-neutral-750 dark:text-neutral-300 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20'
                    }`}
                  >
                    <span>{item.label}</span>
                    {isSelected && <Check size={12} />}
                  </div>
                );
              }

              if (item.type === 'category') {
                return (
                  <div 
                    key={`cat-${idx}`} 
                    className="text-[9px] tracking-wider text-neutral-400 dark:text-neutral-500 font-extrabold px-4 py-1.5 bg-neutral-100/30 dark:bg-neutral-900/10 select-none uppercase mt-1.5 first:mt-0 font-numeric"
                  >
                    {item.label}
                  </div>
                );
              }

              if (item.type === 'parent_header') {
                const indentClass = item.indent === 2 ? 'pl-6' : 'pl-4';
                return (
                  <div 
                    key={`p-head-${idx}`} 
                    className={`${indentClass} py-1.5 pr-4 text-[10px] font-extrabold text-neutral-400 dark:text-neutral-500 select-none uppercase font-numeric tracking-wide flex items-center gap-1 bg-neutral-50/20 dark:bg-neutral-900/5`}
                  >
                    <span>📁</span>
                    <span>{item.code} - {item.label}</span>
                  </div>
                );
              }

              // leaf item setup
              const isSelected = item.account.name === selectedValue;
              const indentClass = item.indent === 3 ? 'pl-10' : item.indent === 2 ? 'pl-7' : 'pl-4';

              return (
                <div
                  key={`leaf-${idx}`}
                  onClick={() => {
                    onSelect(item.account.name);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`${indentClass} pr-4 py-2 flex items-center justify-between text-xs cursor-pointer transition ${
                    isSelected 
                      ? 'bg-neutral-100 dark:bg-neutral-900 text-teal-600 dark:text-teal-400 font-bold' 
                      : 'text-neutral-750 dark:text-neutral-300 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20'
                  }`}
                >
                  <span className={`${isSelected ? 'font-bold' : 'font-normal'}`}>
                    {item.code} - {item.label}
                  </span>
                  {isSelected && (
                    <Check size={12} className="text-teal-600 dark:text-teal-400 shrink-0 font-bold" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const LedgerSummaryTab: React.FC<{ setTab: (tab: string) => void }> = ({ setTab }) => {
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [rawJournals, setRawJournals] = useState<JournalEntry[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(500);

  // Date Filters (default to current month, 1st to last day)
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    return new Date();
  });
  const [presetLabel, setPresetLabel] = useState<string>('Bulan Ini');

  const [selectedAccountName, setSelectedAccountName] = useState<string>(() => {
    const saved = localStorage.getItem('ledger_summary_filter_account');
    if (saved) {
      localStorage.removeItem('ledger_summary_filter_account');
      return saved;
    }
    return '';
  });
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Detailed modal state
  const [selectedJournalForDetail, setSelectedJournalForDetail] = useState<(JournalEntry & { displayJournalId: string; sequence: number }) | null>(null);
  const [copiedDetailId, setCopiedDetailId] = useState(false);

  // Load COA accounts and Journals in real-time
  useEffect(() => {
    const unsubAccounts = onSnapshot(collection(db, 'coa'), (snap) => {
      const accList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoaAccount));
      setCoaAccounts(accList);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    const unsubJournals = onSnapshot(collection(db, 'journalEntries'), (snap) => {
      const journList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry));
      setRawJournals(journList);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    // Fetch exchange rate
    const fetchExchangeRate = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/TWD');
        if (res.ok) {
          const data = await res.json();
          if (data && data.rates && typeof data.rates.IDR === 'number') {
            setExchangeRate(data.rates.IDR);
            localStorage.setItem('journal_fx_rate', String(data.rates.IDR));
            return;
          }
        }
      } catch (err) {
        // Fallback
      }
      const cachedRate = localStorage.getItem('journal_fx_rate');
      if (cachedRate) {
        setExchangeRate(parseFloat(cachedRate) || 500);
      }
    };

    fetchExchangeRate();

    return () => {
      unsubAccounts();
      unsubJournals();
    };
  }, []);

  // Helper date parsing
  const getEntryDate = (dateField: any): Date => {
    if (!dateField) return new Date();
    if (dateField.seconds) {
      return new Date(dateField.seconds * 1000);
    }
    if (dateField instanceof Date) {
      return dateField;
    }
    return new Date(dateField);
  };

  const isDebitIncreasing = (acc: CoaAccount | null, line: JournalEntryLine) => {
    if (acc) {
      return acc.type === 'Assets' || acc.type === 'Expenses';
    }
    // Fallback based on code prefix
    const code = line.accountCode || '';
    if (code) {
      return code.startsWith('1') || code.startsWith('5');
    }
    // Fallback based on name search
    const name = (line.account || '').toLowerCase();
    if (name.includes('cash') || name.includes('kas') || name.includes('inventory') || name.includes('stok') || name.includes('ar:') || name.includes('beban') || name.includes('biaya') || name.includes('cogs')) {
      return true;
    }
    return false; // Default to Liabilities/Equity/Revenue (Credit-increasing)
  };

  // Precalculated Ledger Lines
  const precalculatedLines = useMemo(() => {
    if (coaAccounts.length === 0 || rawJournals.length === 0) return [];

    // Create maps for fast COA lookups
    const coaByCode: Record<string, CoaAccount> = {};
    const coaByName: Record<string, CoaAccount> = {};
    coaAccounts.forEach(acc => {
      coaByCode[acc.code] = acc;
      coaByName[acc.name] = acc;
    });

    // Sort journals chronologically (oldest to newest) to process running balances deterministically
    const formattedJournals = getSortedAndFormattedJournals(rawJournals);
    const chronologicalJournals = [...formattedJournals].sort((a, b) => {
      const timeA = getEntryDate(a.date).getTime();
      const timeB = getEntryDate(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.sequence - b.sequence;
    });

    const accountBalances: Record<string, number> = {};
    const allLines: any[] = [];

    chronologicalJournals.forEach((journal) => {
      if (!journal.lines) return;

      journal.lines.forEach((line, idx) => {
        const accCode = line.accountCode || '';
        const accName = line.account || '';

        const coaAcc = (accCode ? coaByCode[accCode] : null) || coaByName[accName];
        const accKey = coaAcc ? coaAcc.code : (accCode || accName);
        const resolvedAccName = coaAcc ? coaAcc.name : accName;
        const resolvedAccCode = coaAcc ? coaAcc.code : accCode;

        const isDebitInc = isDebitIncreasing(coaAcc, line);

        const debitCents = line.debit || 0;
        const creditCents = line.credit || 0;

        const impact = isDebitInc ? (debitCents - creditCents) : (creditCents - debitCents);

        const prevBalance = accountBalances[accKey] || 0;
        const nextBalance = prevBalance + impact;
        accountBalances[accKey] = nextBalance;

        allLines.push({
          id: `${journal.id}-${idx}`,
          journalId: journal.id,
          displayJournalId: journal.displayJournalId,
          date: getEntryDate(journal.date),
          description: journal.description || '',
          line,
          accountName: resolvedAccName,
          accountCode: resolvedAccCode,
          runningBalance: nextBalance / 100, // NT$ scaled decimal representation
          journalWithMetadata: journal
        });
      });
    });

    return allLines;
  }, [coaAccounts, rawJournals]);

  // Filtered Lines View
  const filteredLines = useMemo(() => {
    let result = [...precalculatedLines];

    // Filter by Account (Exact match on name, because selectedAccountName contains the exact COA account name)
    if (selectedAccountName) {
      result = result.filter(item => item.accountName === selectedAccountName);
    }

    // Filter by Date Range
    if (startDate) {
      const startDateTime = new Date(startDate.getTime());
      startDateTime.setHours(0, 0, 0, 0);
      result = result.filter(item => item.date.getTime() >= startDateTime.getTime());
    }
    if (endDate) {
      const endDateTime = new Date(endDate.getTime());
      endDateTime.setHours(23, 59, 59, 999);
      result = result.filter(item => item.date.getTime() <= endDateTime.getTime());
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => {
        return (
          item.description.toLowerCase().includes(q) ||
          item.displayJournalId.toLowerCase().includes(q) ||
          item.accountName.toLowerCase().includes(q) ||
          item.accountCode.toLowerCase().includes(q)
        );
      });
    }

    // Sort chronologically (oldest first) as requested
    return result.sort((a, b) => {
      const timeA = a.date.getTime();
      const timeB = b.date.getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });
  }, [precalculatedLines, selectedAccountName, startDate, endDate, searchQuery]);

  // Sum total row of current filtered/displayed rows
  const totals = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;
    filteredLines.forEach(item => {
      debitSum += item.line.debit || 0;
      creditSum += item.line.credit || 0;
    });
    return {
      debit: debitSum / 100,
      credit: creditSum / 100
    };
  }, [filteredLines]);

  // Reset Filters
  const handleResetFilters = () => {
    const d = new Date();
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    
    setStartDate(start);
    setEndDate(end);
    setSelectedAccountName('');
    setSearchQuery('');
  };

  // Export to CSV function
  const handleExportCSV = () => {
    if (filteredLines.length === 0) {
      alert('Tidak ada data untuk diexport.');
      return;
    }

    // Construct Header
    const headers = ['TANGGAL TRANSAKSI', 'REFERENSI', 'AKUN COA', 'DEBIT (NT$)', 'KREDIT (NT$)', 'BALANCE (NT$)'];
    const rows = filteredLines.map(item => {
      const dateStr = `${item.date.getFullYear()}/${String(item.date.getMonth() + 1).padStart(2, '0')}/${String(item.date.getDate()).padStart(2, '0')}`;
      const refStr = item.displayJournalId;
      const coaStr = item.accountCode ? `${item.accountCode} - ${item.accountName}` : item.accountName;
      const debitStr = ((item.line.debit || 0) / 100).toFixed(2);
      const creditStr = ((item.line.credit || 0) / 100).toFixed(2);
      const balanceStr = item.runningBalance.toFixed(2);

      return [
        `"${dateStr}"`,
        `"${refStr}"`,
        `"${coaStr.replace(/"/g, '""')}"`,
        debitStr,
        creditStr,
        balanceStr
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const startStr = startDate ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}` : 'All';
    const endStr = endDate ? `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}` : 'All';
    link.setAttribute('download', `Ledger_Summary_${startStr}_to_${endStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLiveAccountName = (line: JournalEntryLine) => {
    if (!line) return '';
    if (line.accountCode) {
      const found = coaAccounts.find(a => a.code === line.accountCode);
      if (found) return found.name;
    }
    const foundByName = coaAccounts.find(a => a.name.trim().toLowerCase() === (line.account || '').trim().toLowerCase());
    if (foundByName) return foundByName.name;
    return line.account;
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div>
          <div className="text-xs text-neutral-450 font-medium tracking-wide font-numeric mb-1">
            Dasbor &gt; Ledger Summary
          </div>
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
            Ledger Summary
          </h1>
        </div>

        {/* Small Export button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-teal-600 dark:text-teal-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition flex items-center gap-1.5 text-xs font-semibold"
            title="Export CSV"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
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

          {/* Account Combobox Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-medium whitespace-nowrap">Account:</span>
            <AccountDropdown 
              accounts={coaAccounts} 
              selectedValue={selectedAccountName} 
              onSelect={setSelectedAccountName} 
            />
          </div>

          {/* Text Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Cari deskripsi, No Jurnal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-60 border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg text-xs outline-none text-neutral-700 dark:text-neutral-200 font-medium"
            />
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          {/* Search Action (Teal) */}
          <button
            onClick={() => {}} // Live-filtering does the work, button can act as placeholder feedback
            className="p-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition shadow-xs"
            title="Search"
          >
            <Search className="h-4.5 w-4.5" />
          </button>

          {/* Reset Action (Pink) */}
          <button
            onClick={handleResetFilters}
            className="p-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition shadow-xs"
            title="Refresh / Reset Filters"
          >
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* 3. Ledger Summary Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xs overflow-hidden select-text">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-bold font-numeric tracking-wider">
                <th className="px-6 py-3.5 w-[15%]">TANGGAL TRANSAKSI</th>
                <th className="px-6 py-3.5 w-[15%]">REFERENSI</th>
                <th className="px-6 py-3.5 w-[25%]">AKUN COA</th>
                <th className="px-6 py-3.5 text-right w-[15%]">DEBIT</th>
                <th className="px-6 py-3.5 text-right w-[15%]">KREDIT</th>
                <th className="px-6 py-3.5 text-right w-[15%]">BALANCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-150 dark:divide-neutral-850 font-numeric text-neutral-700 dark:text-neutral-300">
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-450 font-numeric">
                    Tidak ada baris buku besar yang cocok dengan filter yang dipilih.
                  </td>
                </tr>
              ) : (
                filteredLines.map((item) => {
                  const debitAmount = (item.line.debit || 0) / 100;
                  const creditAmount = (item.line.credit || 0) / 100;
                  const isIdrCurrency = item.line.originalCurrency === 'IDR';

                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/5 transition duration-150"
                    >
                      {/* Tanggal Transaksi */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {`${item.date.getFullYear()}/${String(item.date.getMonth() + 1).padStart(2, '0')}/${String(item.date.getDate()).padStart(2, '0')}`}
                      </td>

                      {/* Referensi (Clickable link to Modal) */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedJournalForDetail(item.journalWithMetadata)}
                          className="text-teal-600 dark:text-teal-400 hover:underline font-extrabold cursor-pointer text-left"
                        >
                          {item.displayJournalId}
                        </button>
                      </td>

                      {/* Akun COA (Clickable to filter by account) */}
                      <td className="px-6 py-4 font-semibold text-neutral-800 dark:text-neutral-200">
                        <button
                          onClick={() => setSelectedAccountName(item.accountName)}
                          className="hover:underline hover:text-teal-600 dark:hover:text-teal-400 text-left cursor-pointer"
                        >
                          {item.accountCode ? `${item.accountCode} - ${item.accountName}` : item.accountName}
                        </button>
                      </td>

                      {/* Debit */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {debitAmount > 0 ? (
                          <div className="space-y-0.5">
                            <div className="font-extrabold text-neutral-800 dark:text-neutral-200">
                              NT$ {debitAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {isIdrCurrency && item.line.originalDebitIDR ? (
                              <div className="text-[10px] text-neutral-450 dark:text-neutral-500">
                                {formatIDR(item.line.originalDebitIDR)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-700">-</span>
                        )}
                      </td>

                      {/* Kredit */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {creditAmount > 0 ? (
                          <div className="space-y-0.5">
                            <div className="font-extrabold text-neutral-850 dark:text-neutral-200">
                              NT$ {creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {isIdrCurrency && item.line.originalCreditIDR ? (
                              <div className="text-[10px] text-neutral-450 dark:text-neutral-500">
                                {formatIDR(item.line.originalCreditIDR)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-700">-</span>
                        )}
                      </td>

                      {/* Running Balance */}
                      <td className="px-6 py-4 text-right whitespace-nowrap font-extrabold text-neutral-900 dark:text-white">
                        NT$ {item.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Row */}
            {filteredLines.length > 0 && (
              <tfoot>
                <tr className="bg-neutral-50/50 dark:bg-neutral-950/20 font-extrabold border-t-2 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200">
                  <td colSpan={3} className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-right">
                    Total
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap font-numeric font-extrabold text-neutral-900 dark:text-white">
                    NT$ {totals.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap font-numeric font-extrabold text-neutral-900 dark:text-white">
                    NT$ {totals.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* JOURNAL ENTRY DETAIL MODAL */}
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
                      {(() => {
                        const dObj = getEntryDate(selectedJournalForDetail.date);
                        return isNaN(dObj.getTime())
                          ? '-'
                          : `${dObj.getFullYear()}/${String(dObj.getMonth() + 1).padStart(2, '0')}/${String(dObj.getDate()).padStart(2, '0')}`;
                      })()}
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
            </div>
          </div>
        );
      })()}
    </div>
  );
};
