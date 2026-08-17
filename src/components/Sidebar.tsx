import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { useSettings } from '../lib/use-settings';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  ShoppingCart, 
  Package, 
  Grid, 
  Bell, 
  DollarSign, 
  Settings, 
  LogOut, 
  User, 
  Sun, 
  Moon, 
  Sparkles,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Scale,
  Truck,
  Building,
  BarChart3,
  LineChart,
  Receipt,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
  activeSubTab: 'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang';
  setActiveSubTab: (subTab: 'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang') => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  sidebarHidden?: boolean;
  setSidebarHidden?: (hidden: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  setTab, 
  activeSubTab,
  setActiveSubTab,
  theme, 
  toggleTheme, 
  sidebarHidden, 
  setSidebarHidden 
}) => {
  const { user, profile, logout, loginAsDemo } = useAuth();
  const { branding } = useSettings();
  const [isAccountingOpen, setIsAccountingOpen] = useState(currentTab === 'financial');
  const [isDoubleEntryOpen, setIsDoubleEntryOpen] = useState(currentTab === 'coa' || currentTab === 'journal' || currentTab === 'closing' || currentTab === 'ledger-summary' || currentTab === 'trial-balance' || currentTab === 'audit-log');
  const [isReportOpen, setIsReportOpen] = useState(currentTab === 'report-sales-detail' || currentTab === 'report-user-activity');
  const [isExpensesOpen, setIsExpensesOpen] = useState(currentTab === 'perlengkapan' || currentTab === 'iklan' || currentTab === 'partners' || currentTab === 'beban-lainnya');
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? window.navigator.onLine : true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (currentTab === 'financial') {
      setIsAccountingOpen(true);
    }
  }, [currentTab]);

  useEffect(() => {
    if (currentTab === 'perlengkapan' || currentTab === 'iklan' || currentTab === 'partners' || currentTab === 'beban-lainnya') {
      setIsExpensesOpen(true);
    }
  }, [currentTab]);

  useEffect(() => {
    if (currentTab === 'coa' || currentTab === 'journal' || currentTab === 'closing' || currentTab === 'ledger-summary' || currentTab === 'trial-balance' || currentTab === 'audit-log') {
      setIsDoubleEntryOpen(true);
    }
  }, [currentTab]);

  useEffect(() => {
    if (currentTab === 'report-sales-detail' || currentTab === 'report-user-activity') {
      setIsReportOpen(true);
    }
  }, [currentTab]);

  const hasPerm = (key: string) => {
    if (key === 'settings') return true;
    if (profile?.role === 'owner') return true;
    if (key === 'user-management') return false;
    if (key === 'financial') return !!profile?.permissions?.['financial'];
    if (key === 'partners') return !!profile?.permissions?.['financial.partners'];
    if (key === 'expenses') return !!profile?.permissions?.['perlengkapan'] || !!profile?.permissions?.['iklan'] || !!profile?.permissions?.['financial.partners'] || !!profile?.permissions?.['beban-lainnya'];
    if (key === 'double-entry') return !!profile?.permissions?.['double-entry'];
    const doubleEntryTabs = ['coa', 'journal', 'ledger-summary', 'trial-balance', 'closing'];
    if (doubleEntryTabs.includes(key)) {
      if (!profile?.permissions?.['double-entry']) return false;
      return profile?.permissions?.[key] !== false;
    }
    return !!profile?.permissions?.[key];
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Grid },
    { id: 'daily-report', label: 'Laporan Harian', icon: LineChart },
    { id: 'catalog', label: 'Katalog Buku', icon: BookOpen },
    { id: 'sales', label: 'Sales Orders', icon: ShoppingCart },
    { id: 'purchases', label: 'Purchase Orders', icon: Package },
    { id: 'freight-in', label: 'Freight In', icon: Truck },
    { id: 'inventory', label: 'Stok & Value', icon: ShieldAlert },
    { id: 'bank-kas', label: 'Bank & Kas', icon: Building }
  ].filter(m => hasPerm(m.id));

  const subItems = [
    { id: 'cashflow', label: 'Arus Kas Laporan', emoji: '📂' },
    { id: 'profit-loss', label: 'Laba Rugi', emoji: '📊' },
    { id: 'prive', label: 'Modal & Prive', emoji: '💸' },
    { id: 'neraca', label: 'Neraca (Balance Sheet)', emoji: '🏛️' },
    { id: 'equity-change', label: 'Perubahan Modal', emoji: '📈' },
    { id: 'utang', label: 'Utang Usaha', emoji: '💳' },
    { id: 'payroll', label: 'Gaji & Payroll', emoji: '💵', permKey: 'financial.payroll' }
  ].filter(s => s.permKey ? hasPerm(s.permKey) : true) as any[];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30';
      case 'staff':
        return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
      default:
        return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    }
  };

  return (
    <div className={`hidden md:flex transition-all duration-300 ${sidebarHidden ? 'w-16' : 'w-56'} border-r border-neutral-200/70 dark:border-neutral-800 bg-white/75 dark:bg-neutral-950/70 backdrop-blur-xl text-neutral-800 dark:text-neutral-100 flex-col h-screen sticky top-0 shrink-0 shadow-sm z-30`}>
      {/* Brand Header */}
      <div className={`p-4 border-b border-neutral-200/70 dark:border-neutral-850 flex items-start ${sidebarHidden ? 'justify-center' : 'justify-between'} min-h-[85px] shrink-0 relative`}>
        <div 
          onClick={() => setTab('settings')}
          className={`flex items-start gap-3 cursor-pointer group rounded-xl p-1 -m-1 transition min-w-0 flex-1 ${
            currentTab === 'settings' 
              ? 'bg-neutral-100 dark:bg-neutral-900 ring-1 ring-neutral-200 dark:ring-neutral-800' 
              : 'hover:bg-neutral-100/70 dark:hover:bg-neutral-900/50'
          }`}
          title="Klik untuk Pengaturan Usaha"
        >
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 via-sky-500 to-indigo-650 flex items-center justify-center font-bold tracking-wider text-white select-text shadow-md shadow-indigo-500/10 overflow-hidden group-hover:scale-105 transition-transform" title={branding.namaUsaha || "KangenBukuIndo"}>
              {branding.iconUrl ? (
                <img src={branding.iconUrl} alt="Icon" className="h-full w-full object-contain p-0.5 bg-white/90 rounded-md" />
              ) : branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="h-full w-full object-contain p-0.5 bg-white/90 rounded-md" />
              ) : (
                'KB'
              )}
            </div>
            {/* Hide/Unhide Sidebar button directly underneath KB logo */}
            {setSidebarHidden && (
              <button
                id={sidebarHidden ? "unhide-sidebar-button" : "hide-sidebar-button"}
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarHidden(!sidebarHidden);
                }}
                className="p-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition duration-200 cursor-pointer"
                title={sidebarHidden ? "Tampilkan Sidebar" : "Sembunyikan Sidebar"}
              >
                {sidebarHidden ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
          {!sidebarHidden && (
            <div className="pt-0.5 min-w-0 pr-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-semibold tracking-tight text-neutral-800 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                  {branding.namaUsaha || "KangenBukuIndo"}
                </h1>
                <Settings className={`h-3 w-3 shrink-0 transition ${currentTab === 'settings' ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-400 opacity-0 group-hover:opacity-100'}`} />
              </div>
              <p className="text-[10px] text-neutral-400 font-medium truncate">ERP E-Commerce TW</p>
            </div>
          )}
        </div>
        
        {!sidebarHidden && (
          <button 
            id="theme-toggler"
            onClick={toggleTheme}
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-850 transition text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer mt-0.5 shrink-0"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 p-3 ${sidebarHidden ? 'flex flex-col items-center space-y-3' : 'space-y-1'} overflow-y-auto`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              id={`nav-${item.id}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              className={sidebarHidden
                ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text ${
                    isActive 
                      ? 'bg-blue-50/50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-450 border border-blue-200/55 dark:border-blue-900/30 shadow-xs' 
                      : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
                  }`
                : `relative w-full flex items-center gap-3 py-2.5 rounded-r-full text-sm transition duration-200 select-text ${
                    isActive 
                      ? 'pl-6 pr-3 font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/15' 
                      : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
                  }`
              }
              title={sidebarHidden ? item.label : undefined}
            >
              {/* Vertical pill border indicator */}
              {!sidebarHidden && isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-gradient bg-gradient-to-b from-blue-550 via-sky-500 to-indigo-500" style={{ width: '4px' }} />
              )}
              <Icon className={`h-4.5 w-4.5 transition duration-150 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white'}`} />
              {!sidebarHidden && <span>{item.label}</span>}
            </button>
          );
        })}

        {hasPerm("income") && (
        <>
        {/* Standalone Income section (above Expenses) */}
        <button
          id="nav-income"
          onClick={() => setTab('income')}
          className={sidebarHidden
            ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative ${
                currentTab === 'income'
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/15 text-emerald-600 dark:text-emerald-450 border border-emerald-200/55 dark:border-emerald-900/30 shadow-xs' 
                  : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
              }`
            : `relative w-full flex items-center gap-3 py-2.5 rounded-r-full text-sm transition duration-200 select-text ${
                currentTab === 'income'
                  ? 'pl-6 pr-3 font-semibold text-emerald-600 dark:text-emerald-450 bg-emerald-50/50 dark:bg-emerald-900/15' 
                  : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
              }`
          }
          title={sidebarHidden ? 'Penerimaan Transfer' : undefined}
        >
          {!sidebarHidden && currentTab === 'income' && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-500 rounded-r" style={{ width: '4px' }} />
          )}
          <TrendingUp className={`h-4.5 w-4.5 transition duration-150 ${currentTab === 'income' ? 'text-emerald-500 dark:text-emerald-400' : 'text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white'}`} />
          {!sidebarHidden && <span className="font-semibold text-xs truncate">Penerimaan Transfer</span>}
        </button>

        </>
        )}
        {hasPerm("piutang") && (
        <>
        {/* Standalone Piutang Usaha section */}
        <button
          id="nav-piutang"
          onClick={() => setTab('piutang')}
          className={sidebarHidden
            ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative ${
                currentTab === 'piutang'
                  ? 'bg-blue-50/50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-450 border border-blue-200/55 dark:border-blue-900/30 shadow-xs' 
                  : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
              }`
            : `relative w-full flex items-center gap-3 py-2.5 rounded-r-full text-sm transition duration-200 select-text ${
                currentTab === 'piutang'
                  ? 'pl-6 pr-3 font-semibold text-blue-600 dark:text-blue-450 bg-blue-50/50 dark:bg-blue-900/15' 
                  : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
              }`
          }
          title={sidebarHidden ? 'Piutang Usaha' : undefined}
        >
          {!sidebarHidden && currentTab === 'piutang' && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-blue-500 rounded-r" style={{ width: '4px' }} />
          )}
          <Receipt className={`h-4.5 w-4.5 transition duration-150 ${currentTab === 'piutang' ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white'}`} />
          {!sidebarHidden && <span className="font-semibold">Piutang Usaha</span>}
        </button>

        </>
        )}
        {(hasPerm("perlengkapan") || hasPerm("iklan") || hasPerm("financial.partners") || hasPerm("beban-lainnya")) && (
        <>
        {/* Accordion Expenses section */}
        <div className="flex flex-col space-y-1">
          <button
            id="nav-expenses-trigger"
            onClick={() => setIsExpensesOpen(!isExpensesOpen)}
            className={sidebarHidden
              ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative ${
                  (currentTab === 'perlengkapan' || currentTab === 'iklan' || currentTab === 'partners' || currentTab === 'beban-lainnya')
                    ? 'bg-rose-50/50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-450 border border-rose-200/55 dark:border-rose-900/30 shadow-xs' 
                    : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
                }`
              : `relative w-full flex items-center justify-between py-2.5 rounded-r-full text-sm transition duration-200 select-text ${
                  (currentTab === 'perlengkapan' || currentTab === 'iklan' || currentTab === 'partners' || currentTab === 'beban-lainnya')
                    ? 'pl-6 pr-3 font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/15' 
                    : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
                }`
            }
            title={sidebarHidden ? 'Expenses' : undefined}
          >
            {!sidebarHidden && (currentTab === 'perlengkapan' || currentTab === 'iklan' || currentTab === 'partners' || currentTab === 'beban-lainnya') && (
              <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-gradient bg-gradient-to-b from-rose-550 via-pink-500 to-rose-500" style={{ width: '4px' }} />
            )}
            <div className="flex items-center gap-3 min-w-0">
              <Receipt className={`h-4.5 w-4.5 transition duration-150 ${(currentTab === 'perlengkapan' || currentTab === 'iklan' || currentTab === 'partners' || currentTab === 'beban-lainnya') ? 'text-rose-500 dark:text-rose-400' : 'text-neutral-400 group-hover:text-neutral-905'}`} />
              {!sidebarHidden && <span className="truncate font-semibold">Expenses</span>}
            </div>
            {!sidebarHidden && (
              <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform duration-200 shrink-0 ${isExpensesOpen ? 'rotate-180' : ''}`} />
            )}
          </button>

          <AnimatePresence initial={false}>
            {isExpensesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className={`flex flex-col space-y-1 overflow-hidden ${sidebarHidden ? 'items-center pt-1 pb-2' : 'pl-4 pb-2'}`}
              >
                {[
                  { id: 'perlengkapan', label: 'Perlengkapan', emoji: '🧹', permKey: 'perlengkapan' },
                  { id: 'iklan', label: 'Iklan', emoji: '📢', permKey: 'iklan' },
                  { id: 'ongkir', label: 'Ongkos Kirim', emoji: '🚚', permKey: 'ongkir' },
                  { id: 'beban-lainnya', label: 'Beban Lainnya', emoji: '🧾', permKey: 'beban-lainnya' },
                  { id: 'partners', label: 'Business Partners / Reseller', emoji: '🤝', permKey: 'financial.partners' }
                ].filter(sub => hasPerm(sub.permKey)).map((sub) => {
                  const isSubActive = currentTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      id={`nav-expenses-${sub.id}`}
                      onClick={() => {
                        setTab(sub.id);
                      }}
                      className={sidebarHidden
                        ? `h-9 w-9 flex items-center justify-center rounded-lg transition duration-200 text-sm select-text relative ${
                            isSubActive
                              ? 'bg-rose-50/50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-450 border border-rose-200/55 dark:border-rose-900/30 shadow-xs'
                              : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45'
                          }`
                        : `relative w-full flex items-center gap-2.5 py-1.5 pl-6 pr-3 rounded-r-full text-xs transition duration-200 select-text ${
                            isSubActive
                              ? 'font-bold text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-900/10'
                              : 'font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/30 dark:hover:bg-neutral-850/30 hover:text-neutral-950 dark:hover:text-white'
                          }`
                      }
                      title={sub.label}
                    >
                      {!sidebarHidden && isSubActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-rose-550" style={{ width: '3px' }} />
                      )}
                      <span className="text-sm shrink-0" style={{ fontSize: '13px' }}>{sub.emoji}</span>
                      {!sidebarHidden && <span className="truncate">{sub.label}</span>}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        </>
        )}
        {/* Accordion Accounting Suite section */}
        {hasPerm('financial') && (
        <div className="flex flex-col space-y-1">
          <button
            id="nav-financial"
            onClick={() => setIsAccountingOpen(!isAccountingOpen)}
            className={sidebarHidden
              ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative ${
                  currentTab === 'financial'
                    ? 'bg-blue-50/50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-450 border border-blue-200/55 dark:border-blue-900/30 shadow-xs' 
                    : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
                }`
              : `relative w-full flex items-center justify-between py-2.5 rounded-r-full text-sm transition duration-200 select-text ${
                  currentTab === 'financial'
                    ? 'pl-6 pr-3 font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/15' 
                    : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
                }`
            }
            title={sidebarHidden ? 'Accounting Suite' : undefined}
          >
            {!sidebarHidden && currentTab === 'financial' && (
              <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-gradient bg-gradient-to-b from-blue-550 via-sky-500 to-indigo-500" style={{ width: '4px' }} />
            )}
            <div className="flex items-center gap-3 min-w-0">
              <DollarSign className={`h-4.5 w-4.5 transition duration-150 ${currentTab === 'financial' ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-400 group-hover:text-neutral-905'}`} />
              {!sidebarHidden && <span className="truncate">Accounting Suite</span>}
            </div>
            {!sidebarHidden && (
              <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform duration-200 shrink-0 ${isAccountingOpen ? 'rotate-180' : ''}`} />
            )}
          </button>

          <AnimatePresence initial={false}>
            {isAccountingOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className={`flex flex-col space-y-1 overflow-hidden ${sidebarHidden ? 'items-center pt-1 pb-2' : 'pl-4 pb-2'}`}
              >
                {subItems.map((sub) => {
                  const isSubActive = currentTab === 'financial' && activeSubTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      id={`nav-financial-${sub.id}`}
                      onClick={() => {
                        setTab('financial');
                        setActiveSubTab(sub.id);
                      }}
                      className={sidebarHidden
                        ? `h-9 w-9 flex items-center justify-center rounded-lg transition duration-200 text-sm select-text relative ${
                            isSubActive
                              ? 'bg-blue-50/50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-450 border border-blue-200/55 dark:border-blue-900/30 shadow-xs'
                              : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45'
                          }`
                        : `relative w-full flex items-center gap-2.5 py-1.5 pl-6 pr-3 rounded-r-full text-xs transition duration-200 select-text ${
                            isSubActive
                              ? 'font-bold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10'
                              : 'font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/30 dark:hover:bg-neutral-850/30 hover:text-neutral-950 dark:hover:text-white'
                          }`
                      }
                      title={sub.label}
                    >
                      {!sidebarHidden && isSubActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-blue-550" style={{ width: '3px' }} />
                      )}
                      <span className="text-sm shrink-0" style={{ fontSize: '13px' }}>{sub.emoji}</span>
                      {!sidebarHidden && <span className="truncate">{sub.label}</span>}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}

        {/* Accordion Double Entry section */}
        {hasPerm('double-entry') && (
        <div className="flex flex-col space-y-1">
          <button
            id="nav-double-entry"
            onClick={() => setIsDoubleEntryOpen(!isDoubleEntryOpen)}
            className={sidebarHidden
              ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative ${
                  (currentTab === 'coa' || currentTab === 'journal')
                    ? 'bg-teal-50/50 dark:bg-teal-950/15 text-teal-605 dark:text-teal-450 border border-teal-200/55 dark:border-teal-900/30 shadow-xs' 
                    : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
                }`
              : `relative w-full flex items-center justify-between py-2.5 rounded-r-full text-sm transition duration-200 select-text ${
                  (currentTab === 'coa' || currentTab === 'journal' || currentTab === 'closing' || currentTab === 'ledger-summary' || currentTab === 'trial-balance' || currentTab === 'audit-log')
                    ? 'pl-6 pr-3 font-semibold text-teal-605 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/15' 
                    : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
                }`
            }
            title={sidebarHidden ? 'Double Entry' : undefined}
          >
            {!sidebarHidden && (currentTab === 'coa' || currentTab === 'journal' || currentTab === 'closing' || currentTab === 'ledger-summary' || currentTab === 'trial-balance' || currentTab === 'audit-log') && (
              <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-500 rounded-r" style={{ width: '4px' }} />
            )}
            <div className="flex items-center gap-3 min-w-0">
              <Scale className={`h-4.5 w-4.5 transition duration-150 ${(currentTab === 'coa' || currentTab === 'journal' || currentTab === 'closing' || currentTab === 'ledger-summary' || currentTab === 'trial-balance' || currentTab === 'audit-log') ? 'text-teal-500 dark:text-teal-400' : 'text-neutral-400 group-hover:text-neutral-905'}`} />
              {!sidebarHidden && <span className="truncate font-semibold">Double Entry</span>}
            </div>
            {!sidebarHidden && (
              <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform duration-200 shrink-0 ${isDoubleEntryOpen ? 'rotate-180' : ''}`} />
            )}
          </button>

          <AnimatePresence initial={false}>
            {isDoubleEntryOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className={`flex flex-col space-y-1 overflow-hidden ${sidebarHidden ? 'items-center pt-1 pb-2' : 'pl-4 pb-2'}`}
              >
                {[
                  { id: 'coa', label: 'Bagan Akun / CoA' },
                  { id: 'journal', label: 'Akun Jurnal' },
                  { id: 'ledger-summary', label: 'Ledger Summary' },
                  { id: 'trial-balance', label: 'Trial Balance' },
                  { id: 'closing', label: 'Tutup Periode' }
                ].filter(sub => hasPerm(sub.id)).map((sub) => {
                  const isSubActive = currentTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      id={`nav-double-entry-${sub.id}`}
                      onClick={() => {
                        setTab(sub.id);
                      }}
                      className={sidebarHidden
                        ? `h-9 w-9 flex items-center justify-center rounded-lg transition duration-200 text-sm select-text relative ${
                            isSubActive
                              ? 'bg-teal-50/50 dark:bg-teal-950/15 text-teal-605 dark:text-teal-450 border border-teal-200/55 dark:border-teal-900/30 table-cell-shadow'
                              : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45'
                          }`
                        : `relative w-full flex items-center gap-2.5 py-1.5 pl-6 pr-3 rounded-r-full text-xs transition duration-200 select-text ${
                            isSubActive
                              ? 'font-bold text-teal-600 dark:text-teal-400 bg-teal-50/30 dark:bg-teal-950/10'
                              : 'font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/30 dark:hover:bg-neutral-850/30 hover:text-neutral-950 dark:hover:text-white'
                          }`
                      }
                      title={sub.label}
                    >
                      {!sidebarHidden && isSubActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-teal-500" style={{ width: '3px' }} />
                      )}
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSubActive ? 'bg-teal-500' : 'bg-neutral-400 dark:bg-neutral-600'}`} />
                      {!sidebarHidden && <span className="truncate">{sub.label}</span>}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}

        {/* Standalone Aset Tetap Section */}
        {hasPerm('fixed-assets') && (
        <button
          id="nav-fixed-assets"
          onClick={() => setTab('fixed-assets')}
          className={sidebarHidden
            ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative mt-1 ${
                currentTab === 'fixed-assets'
                  ? 'bg-blue-50/50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-450 border border-blue-200/55 dark:border-blue-900/30 shadow-xs' 
                  : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
              }`
            : `relative w-full flex items-center gap-3 py-2.5 rounded-r-full text-sm transition duration-200 select-text mt-1 ${
                currentTab === 'fixed-assets'
                  ? 'pl-6 pr-3 font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/15' 
                  : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
              }`
          }
          title={sidebarHidden ? 'Aset Tetap' : undefined}
        >
          {!sidebarHidden && currentTab === 'fixed-assets' && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-gradient bg-gradient-to-b from-blue-550 via-sky-500 to-indigo-500" style={{ width: '4px' }} />
          )}
          <Building className={`h-4.5 w-4.5 transition duration-150 ${currentTab === 'fixed-assets' ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white'}`} />
          {!sidebarHidden && <span>Aset Tetap</span>}
        </button>
        )}

        {/* Standalone Amortisasi Section */}
        {hasPerm('amortisasi') && (
        <button
          id="nav-amortisasi"
          onClick={() => setTab('amortisasi')}
          className={sidebarHidden
            ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative mt-1 ${
                currentTab === 'amortisasi'
                  ? 'bg-amber-50/50 dark:bg-amber-950/15 text-amber-600 dark:text-amber-450 border border-amber-200/55 dark:border-amber-900/30 shadow-xs' 
                  : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
              }`
            : `relative w-full flex items-center gap-3 py-2.5 rounded-r-full text-sm transition duration-200 select-text mt-1 ${
                currentTab === 'amortisasi'
                  ? 'pl-6 pr-3 font-semibold text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/15' 
                  : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
              }`
          }
          title={sidebarHidden ? 'Amortisasi' : undefined}
        >
          {!sidebarHidden && currentTab === 'amortisasi' && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-gradient bg-gradient-to-b from-amber-500 to-orange-500" style={{ width: '4px' }} />
          )}
          <Receipt className={`h-4.5 w-4.5 transition duration-150 ${currentTab === 'amortisasi' ? 'text-amber-500 dark:text-amber-400' : 'text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white'}`} />
          {!sidebarHidden && <span>Amortisasi</span>}
        </button>
        )}

        {/* Accordion Report section */}
        {(hasPerm('report-sales-detail') || hasPerm('report-user-activity')) && (
        <div className="flex flex-col space-y-1">
          <button
            id="nav-reports"
            onClick={() => setIsReportOpen(!isReportOpen)}
            className={sidebarHidden
              ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative mt-1 ${
                  (currentTab === 'report-sales-detail' || currentTab === 'report-user-activity')
                    ? 'bg-indigo-50/50 dark:bg-indigo-950/15 text-indigo-600 dark:text-indigo-400 border border-indigo-200/55 dark:border-indigo-900/30 shadow-xs' 
                    : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
                }`
              : `relative w-full flex items-center justify-between py-2.5 rounded-r-full text-sm transition duration-200 select-text mt-1 ${
                  (currentTab === 'report-sales-detail' || currentTab === 'report-user-activity')
                    ? 'pl-6 pr-3 font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/15' 
                    : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
                }`
            }
            title={sidebarHidden ? 'Report' : undefined}
          >
            {!sidebarHidden && (currentTab === 'report-sales-detail' || currentTab === 'report-user-activity') && (
              <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-indigo-550 rounded-r" style={{ width: '4px' }} />
            )}
            <div className="flex items-center gap-3 min-w-0">
              <BarChart3 className={`h-4.5 w-4.5 transition duration-150 ${(currentTab === 'report-sales-detail' || currentTab === 'report-user-activity') ? 'text-indigo-500 dark:text-indigo-400' : 'text-neutral-400 group-hover:text-neutral-905'}`} />
              {!sidebarHidden && <span className="truncate">Report</span>}
            </div>
            {!sidebarHidden && (
              <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform duration-200 shrink-0 ${isReportOpen ? 'rotate-180' : ''}`} />
            )}
          </button>

          <AnimatePresence initial={false}>
            {isReportOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className={`flex flex-col space-y-1 overflow-hidden ${sidebarHidden ? 'items-center pt-1 pb-2' : 'pl-4 pb-2'}`}
              >
                {[
                  { id: 'report-sales-detail', label: 'Laporan Rincian Penjualan', show: hasPerm('report-sales-detail') },
                  { id: 'report-user-activity', label: 'Kegiatan User', show: hasPerm('report-user-activity') }
                ].filter(sub => sub.show).map((sub) => {
                  const isSubActive = currentTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      id={`nav-reports-${sub.id}`}
                      onClick={() => {
                        setTab(sub.id);
                      }}
                      className={sidebarHidden
                        ? `h-9 w-9 flex items-center justify-center rounded-lg transition duration-200 text-sm select-text relative ${
                            isSubActive
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/15 text-indigo-600 dark:text-indigo-400 border border-indigo-200/55 dark:border-indigo-900/30 table-cell-shadow'
                              : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45'
                          }`
                        : `relative w-full flex items-center gap-2.5 py-1.5 pl-6 pr-3 rounded-r-full text-xs transition duration-200 select-text ${
                            isSubActive
                              ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10'
                              : 'font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/30 dark:hover:bg-neutral-850/30 hover:text-neutral-950 dark:hover:text-white'
                          }`
                      }
                      title={sub.label}
                    >
                      {!sidebarHidden && isSubActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-indigo-500" style={{ width: '3px' }} />
                      )}
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSubActive ? 'bg-indigo-500' : 'bg-neutral-400 dark:bg-neutral-600'}`} />
                      {!sidebarHidden && <span className="truncate">{sub.label}</span>}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}

        {/* Standalone User Management Section */}
        {hasPerm('user-management') && (
        <button
          id="nav-user-management"
          onClick={() => setTab('user-management')}
          className={sidebarHidden
            ? `h-10 w-10 flex items-center justify-center rounded-lg transition duration-200 select-text relative mt-1 ${
                currentTab === 'user-management'
                  ? 'bg-rose-50/50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-450 border border-rose-200/55 dark:border-rose-900/30 shadow-xs' 
                  : 'text-neutral-550 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/45 hover:text-neutral-900 dark:hover:text-white'
              }`
            : `relative w-full flex items-center gap-3 py-2.5 rounded-r-full text-sm transition duration-200 select-text mt-1 ${
                currentTab === 'user-management'
                  ? 'pl-6 pr-3 font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/15' 
                  : 'px-3 font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-neutral-850/40 hover:text-neutral-950 dark:hover:text-white'
              }`
          }
          title={sidebarHidden ? 'Manajemen User' : undefined}
        >
          {!sidebarHidden && currentTab === 'user-management' && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-gradient bg-gradient-to-b from-rose-550 via-rose-500 to-rose-600" style={{ width: '4px' }} />
          )}
          <ShieldCheck className={`h-4.5 w-4.5 transition duration-150 ${currentTab === 'user-management' ? 'text-rose-500 dark:text-rose-400' : 'text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white'}`} />
          {!sidebarHidden && <span>Manajemen User</span>}
        </button>
        )}
      </nav>

      {/* Offline Mode Indicator */}
      {!isOnline && (
        <div className={`mx-3 mb-3 px-3 py-2 bg-amber-500/10 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-900/40 rounded-xl flex items-center gap-2 ${sidebarHidden ? 'justify-center mx-1 px-1.5' : ''}`}>
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </div>
          {!sidebarHidden && (
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 select-none">
              Mode Offline (Lokal Aktif)
            </span>
          )}
        </div>
      )}

      {/* User Information Profile Section */}
      <div className={`p-3 border-t border-neutral-200/70 dark:border-neutral-850 bg-neutral-50/50 dark:bg-neutral-950/40 shrink-0 ${sidebarHidden ? 'flex flex-col items-center justify-center' : ''}`}>
        {user ? (
          sidebarHidden ? (
            <div className="flex flex-col items-center gap-3 py-1">
              <div 
                id="user-avatar" 
                onClick={() => setTab('settings')}
                className="h-9 w-9 rounded-full bg-neutral-100 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-blue-500 dark:text-blue-400 uppercase font-bold text-xs cursor-pointer hover:ring-2 hover:ring-blue-500/30 transition" 
                title={`${profile?.displayName || 'User'} - Klik untuk Pengaturan`}
              >
                {profile?.displayName?.slice(0, 2) || 'KB'}
              </div>
              <button
                id="logout-button"
                onClick={logout}
                className="p-2 rounded-md border border-neutral-205 dark:border-neutral-800 text-neutral-500 hover:text-blue-500 dark:text-neutral-400 dark:hover:text-blue-450 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition cursor-pointer"
                title="Keluar Sesi"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div 
                onClick={() => setTab('settings')}
                className={`flex items-center gap-3 p-1.5 -m-1.5 rounded-xl cursor-pointer group transition ${
                  currentTab === 'settings'
                    ? 'bg-neutral-200/60 dark:bg-neutral-800/80 ring-1 ring-neutral-300 dark:ring-neutral-700'
                    : 'hover:bg-neutral-200/40 dark:hover:bg-neutral-850/60'
                }`}
                title="Klik untuk Pengaturan Usaha"
              >
                <div id="user-avatar" className="h-9 w-9 rounded-full bg-neutral-100 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-blue-550 dark:text-blue-400 uppercase font-bold shrink-0">
                  {profile?.displayName?.slice(0, 2) || 'KB'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{profile?.displayName}</p>
                    <Settings className={`h-3.5 w-3.5 shrink-0 transition ${currentTab === 'settings' ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-400 opacity-0 group-hover:opacity-100'}`} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-numeric uppercase tracking-wider ${getRoleBadge(profile?.role || 'staff')}`}>
                      {profile?.role}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setTab('settings')}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Pengaturan</span>
                </button>
                <button
                  id="logout-button"
                  onClick={logout}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/10 transition cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          )
        ) : (
          sidebarHidden ? (
            <button
              onClick={() => loginAsDemo('owner')}
              className="h-10 w-10 bg-gradient-to-tr from-blue-500 to-indigo-650 rounded-lg flex items-center justify-center text-white hover:opacity-90 shadow-md cursor-pointer"
              title="Demo Owner Login"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          ) : (
            <div className="space-y-3 p-1">
              <div className="flex items-center gap-2 text-blue-500 dark:text-blue-400">
                <Sparkles className="h-4 w-4 shrink-0 animate-pulse" />
                <p className="text-xs font-semibold">Akses Instan Demo</p>
              </div>
              
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-normal font-medium">
                Silahkan klik satu-tombol di bawah untuk langsung mencoba sebagai Owner (Akses penuh) atau Staff.
              </p>
              
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  id="demo-owner-login"
                  onClick={() => loginAsDemo('owner')}
                  className="px-2 py-1.5 bg-gradient-to-tr from-blue-500 to-sky-500 hover:opacity-95 rounded text-[10px] font-bold text-center select-text text-white shadow-md cursor-pointer transition"
                >
                  Owner
                </button>
                <button
                  id="demo-staff-login"
                  onClick={() => loginAsDemo('staff')}
                  className="px-2 py-1.5 bg-neutral-105 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-800 rounded text-[10px] font-bold text-center select-text text-neutral-700 dark:text-neutral-300 cursor-pointer transition"
                >
                  Staff
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
