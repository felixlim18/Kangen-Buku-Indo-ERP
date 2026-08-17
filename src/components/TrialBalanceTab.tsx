import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CoaAccount, JournalEntry, JournalEntryLine } from '../types';
import { 
  Printer, 
  Download, 
  Filter, 
  Calendar,
  RefreshCw,
  Search,
  FileSpreadsheet
} from 'lucide-react';
import { formatNTD, getAccountDebitCreditForPeriod, isParentAccount, findParentOf, isDescendantOf, sortAccountsHierarchical } from '../lib/decimal-utils';
import { useAuth } from '../lib/auth-context';
import { DateRangePicker } from './ui/DateRangePicker';
import { formatDate } from '../lib/date-utils';

// Formatting date helper: YYYY/MM/DD
const formatDisplayDateIndo = (dateVal: Date | string | null) => {
  return formatDate(dateVal);
};

interface TrialBalanceTabProps {
  setTab: (tab: string) => void;
}

export const TrialBalanceTab: React.FC<TrialBalanceTabProps> = ({ setTab }) => {
  const { user, profile } = useAuth();
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [rawJournals, setRawJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Date Filters (default: 2026-01-01 to today)
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), 0, 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    return new Date();
  });
  const [presetLabel, setPresetLabel] = useState<string>('Bulan Ini');

  // Real-time listener for COA accounts and journal entries
  useEffect(() => {
    const unsubCOA = onSnapshot(collection(db, 'coa'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoaAccount));
      setCoaAccounts(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    const unsubJournals = onSnapshot(collection(db, 'journalEntries'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry));
      setRawJournals(list);
      setLoading(false);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    return () => {
      unsubCOA();
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

  // Compute final values for all accounts including rollups for parent accounts using shared logic
  const processedAccounts = useMemo(() => {
    const results: Record<string, { 
      debit: number; 
      credit: number; 
      grossDebit: number; 
      grossCredit: number; 
      isParent: boolean; 
      isLeaf: boolean 
    }> = {};

    coaAccounts.forEach(acc => {
      const isParent = isParentAccount(acc, coaAccounts);
      const { debitCents, creditCents } = getAccountDebitCreditForPeriod(acc, coaAccounts, rawJournals, startDate, endDate);
      
      // Calculate net values based on normal balance rules
      let netDebit = 0;
      let netCredit = 0;
      const isNormalDebit = acc.type === 'Assets' || acc.type === 'Expenses';

      if (isNormalDebit) {
        const net = debitCents - creditCents;
        if (net > 0) {
          netDebit = net;
        } else if (net < 0) {
          netCredit = Math.abs(net);
        }
      } else {
        const net = creditCents - debitCents;
        if (net > 0) {
          netCredit = net;
        } else if (net < 0) {
          netDebit = Math.abs(net);
        }
      }

      results[acc.code] = {
        grossDebit: debitCents,
        grossCredit: creditCents,
        debit: netDebit,
        credit: netCredit,
        isParent: isParent,
        isLeaf: !isParent
      };
    });

    return results;
  }, [coaAccounts, rawJournals, startDate, endDate]);

  // Helper to check if an account or any of its children has activity
  const isAccountActive = (acc: CoaAccount) => {
    const vals = processedAccounts[acc.code];
    if (!vals) return false;
    return vals.grossDebit > 0 || vals.grossCredit > 0;
  };

  // Group and sort accounts per category (Assets, Liabilities, Equity, Revenue/Income, Expenses)
  const categories = [
    { key: 'Assets', label: 'Assets' },
    { key: 'Liabilities', label: 'Liabilities' },
    { key: 'Equity', label: 'Equity' },
    { key: 'Revenue', label: 'Income' }, // Display Revenue as Income
    { key: 'Expenses', label: 'Expenses' }
  ];

  // Map category to formatted list of accounts (with parent-child hierarchy)
  const categoryData = useMemo(() => {
    const data: Record<string, any[]> = {};

    categories.forEach(cat => {
      const catAccounts = coaAccounts.filter(acc => acc.type === cat.key);
      const activeCatAccs = catAccounts.filter(acc => isAccountActive(acc));

      if (activeCatAccs.length === 0) {
        data[cat.key] = [];
        return;
      }

      // Use shared hierarchical sorting helper
      const sortedAccs = sortAccountsHierarchical(activeCatAccs, coaAccounts);
      const list: any[] = [];

      sortedAccs.forEach(acc => {
        const isParent = isParentAccount(acc, coaAccounts);
        const vals = processedAccounts[acc.code] || { debit: 0, credit: 0 };
        const hasParent = findParentOf(acc, coaAccounts) !== null;

        list.push({
          account: acc,
          debit: vals.debit,
          credit: vals.credit,
          isParent: isParent,
          indent: hasParent ? 1 : 0
        });
      });

      data[cat.key] = list;
    });

    return data;
  }, [coaAccounts, processedAccounts]);

  // Grand totals of leaf accounts
  const grandTotals = useMemo(() => {
    let debitTotal = 0;
    let creditTotal = 0;

    coaAccounts.forEach(acc => {
      const isParent = isParentAccount(acc, coaAccounts);
      // Only sum leaf accounts to prevent double counting
      if (!isParent) {
        const vals = processedAccounts[acc.code];
        if (vals) {
          debitTotal += vals.debit;
          creditTotal += vals.credit;
        }
      }
    });

    return { debit: debitTotal, credit: creditTotal };
  }, [coaAccounts, processedAccounts]);

  // Handle click on Account Name to redirect to Ledger Summary
  const handleAccountClick = (accName: string) => {
    localStorage.setItem('ledger_summary_filter_account', accName);
    setTab('ledger-summary');
  };

  // Reset Filters to default: year-start through today
  const handleResetFilters = () => {
    const d = new Date();
    setStartDate(new Date(d.getFullYear(), 0, 1));
    setEndDate(new Date());
    setPresetLabel('Bulan Ini');
  };

  // Export to CSV Function
  const handleExportCSV = () => {
    const headers = ['Category', 'Account Code', 'Account Name', 'Debit (NT$)', 'Kredit (NT$)'];
    const rows: string[][] = [];

    categories.forEach(cat => {
      const items = categoryData[cat.key];
      if (!items || items.length === 0) return;

      // Add a header row for the category
      rows.push([`[${cat.label.toUpperCase()}]`, '', '', '', '']);

      items.forEach(item => {
        const namePrefix = item.indent > 0 ? '   ' : '';
        const nameDisplay = namePrefix + item.account.name;
        const debitStr = item.debit > 0 ? (item.debit / 100).toFixed(2) : '-';
        const creditStr = item.credit > 0 ? (item.credit / 100).toFixed(2) : '-';

        rows.push([
          cat.label,
          item.account.code,
          `"${nameDisplay.replace(/"/g, '""')}"`,
          debitStr,
          creditStr
        ]);
      });
    });

    // Add empty spacer row
    rows.push(['', '', '', '', '']);

    // Add total row
    rows.push([
      'TOTAL',
      '',
      'Grand Total (Leaf Accounts Only)',
      (grandTotals.debit / 100).toFixed(2),
      (grandTotals.credit / 100).toFixed(2)
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const startStr = startDate ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}` : 'All';
    const endStr = endDate ? `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}` : 'All';
    link.setAttribute('download', `Trial_Balance_${startStr}_to_${endStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Function
  const handlePrint = () => {
    window.print();
  };

  const companyName = profile?.displayName || user?.displayName || 'Rumah Buku';

  return (
    <div className="space-y-6">
      {/* Dynamic style tag to format printer output professionally */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
            background-color: white !important;
            color: black !important;
          }
          #trial-balance-print-area, #trial-balance-print-area * {
            visibility: visible;
          }
          #trial-balance-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
            background-color: white !important;
          }
          /* Remove layout headers/sidebars during printing */
          header, sidebar, nav, button, .no-print {
            display: none !important;
          }
          .table-header {
            background-color: #f3f4f6 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .parent-row {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}} />

      {/* 1. Page Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5 no-print">
        <div>
          <div id="trial-balance-breadcrumb" className="text-xs text-neutral-450 font-medium tracking-wide font-numeric mb-1">
            Dasbor &gt; Trial Balance
          </div>
          <h1 id="trial-balance-title" className="text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
            Trial Balance
          </h1>
        </div>

        {/* 3-Icon-Button Row (Teal Styling consistent with reference) */}
        <div className="flex items-center gap-2">
          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="p-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-teal-600 dark:text-teal-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition shadow-xs flex items-center justify-center"
            title="Cetak Trial Balance"
          >
            <Printer className="h-4 w-4" />
          </button>

          {/* Export Button */}
          <button
            onClick={handleExportCSV}
            className="p-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-teal-600 dark:text-teal-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition shadow-xs flex items-center justify-center"
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
          </button>

          {/* Reset Filters / Filter Button */}
          <button
            onClick={handleResetFilters}
            className="p-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition shadow-xs flex items-center justify-center"
            title="Reset Tanggal"
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Filters Row */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl flex flex-wrap items-center gap-4 no-print">
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
      </div>

      {/* 3. Trial Balance Content Sheet */}
      <div id="trial-balance-print-area" className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs overflow-hidden">
        
        {/* Subtitle Section as requested */}
        <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/20">
          <h2 id="trial-balance-company" className="text-lg font-bold text-neutral-800 dark:text-white mb-0.5">
            {companyName}
          </h2>
          <p id="trial-balance-subtitle" className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
            Trial Balance of <span className="font-semibold">{companyName}</span> as of <span className="font-semibold text-neutral-700 dark:text-neutral-200">{formatDisplayDateIndo(startDate)}</span> to <span className="font-semibold text-neutral-700 dark:text-neutral-200">{formatDisplayDateIndo(endDate)}</span>
          </p>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-6 w-6 text-teal-500 animate-spin" />
            <p className="text-xs text-neutral-400 font-medium">Memuat neraca saldo...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 table-header text-xs text-neutral-500 dark:text-neutral-400 font-bold">
                  <th className="py-3 px-6 text-left font-semibold">Account</th>
                  <th className="py-3 px-6 text-left font-semibold w-36">Account Code</th>
                  <th className="py-3 px-6 text-right font-semibold w-48">Debit</th>
                  <th className="py-3 px-6 text-right font-semibold w-48">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-850">
                {categories.map(cat => {
                  const items = categoryData[cat.key];
                  if (!items || items.length === 0) return null;

                  return (
                    <React.Fragment key={cat.key}>
                      {/* Category Header Row */}
                      <tr className="bg-neutral-100/40 dark:bg-neutral-900/40">
                        <td colSpan={4} className="py-2.5 px-6 text-xs font-black text-neutral-750 dark:text-neutral-300 uppercase tracking-wider">
                          {cat.label}
                        </td>
                      </tr>

                      {/* Account Rows */}
                      {items.map((item, index) => {
                        const isParent = item.isParent;
                        const indentClass = item.indent > 0 ? 'pl-12' : 'pl-6';
                        
                        return (
                          <tr 
                            key={`${cat.key}-${item.account.code}-${index}`}
                            className={`transition hover:bg-neutral-50/30 dark:hover:bg-neutral-850/10 ${
                              isParent ? 'bg-neutral-50/30 dark:bg-neutral-900/20 font-bold parent-row' : 'text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            {/* Account Name */}
                            <td className={`py-3 px-6 text-xs ${indentClass}`}>
                              {isParent ? (
                                <span className="font-bold text-neutral-905 dark:text-white">
                                  {item.account.name}
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAccountClick(item.account.name)}
                                  className="text-teal-600 dark:text-teal-400 hover:underline font-medium text-left outline-none transition"
                                >
                                  {item.account.name}
                                </button>
                              )}
                            </td>

                            {/* Account Code */}
                            <td className="py-3 px-6 text-xs font-numeric">
                              {item.account.code}
                            </td>

                            {/* Debit Value (NT$ only) */}
                            <td className="py-3 px-6 text-right text-xs font-numeric">
                              {item.debit > 0 ? (
                                <span className={isParent ? "font-bold text-neutral-900 dark:text-white" : ""}>
                                  {formatNTD(item.debit)}
                                </span>
                              ) : (
                                <span className="text-neutral-300 dark:text-neutral-700">-</span>
                              )}
                            </td>

                            {/* Kredit Value (NT$ only) */}
                            <td className="py-3 px-6 text-right text-xs font-numeric">
                              {item.credit > 0 ? (
                                <span className={isParent ? "font-bold text-neutral-900 dark:text-white" : ""}>
                                  {formatNTD(item.credit)}
                                </span>
                              ) : (
                                <span className="text-neutral-300 dark:text-neutral-700">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* grand totals row */}
                <tr className="border-t-2 border-neutral-300 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-950/40 text-neutral-900 dark:text-white">
                  <td className="py-4 px-6 text-xs font-extrabold uppercase tracking-wide">
                    Total
                  </td>
                  <td className="py-4 px-6 text-xs text-neutral-400 font-medium">
                    (Leaf Accounts Only)
                  </td>
                  <td className="py-4 px-6 text-right text-xs font-numeric font-extrabold text-teal-600 dark:text-teal-400">
                    {formatNTD(grandTotals.debit)}
                  </td>
                  <td className="py-4 px-6 text-right text-xs font-numeric font-extrabold text-teal-600 dark:text-teal-400">
                    {formatNTD(grandTotals.credit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
