import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { SidebarProvider, useSidebar } from './lib/sidebar-context';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';


import { DashboardTab } from './components/DashboardTab';
import { CatalogTab } from './components/CatalogTab';
import { SalesTab } from './components/SalesTab';
import { PurchasesTab } from './components/PurchasesTab';
import { InventoryTab } from './components/InventoryTab';
import { FinancialTab } from './components/FinancialTab';
import { CoaTab } from './components/CoaTab';
import { JournalTab } from './components/JournalTab';
import FreightInTab from './components/FreightInTab';
import { ClosingTab } from './components/ClosingTab';
import { LedgerSummaryTab } from './components/LedgerSummaryTab';
import { TrialBalanceTab } from './components/TrialBalanceTab';
import { FixedAssetsTab } from './components/FixedAssetsTab';
import { AmortisasiTab } from './components/AmortisasiTab';
import { ReportSalesDetailTab } from './components/ReportSalesDetailTab';
import { PerlengkapanTab } from './components/PerlengkapanTab';
import { IklanTab } from './components/IklanTab';
import BebanLainnyaTab from './components/BebanLainnyaTab';
import { OngkosKirimTab } from './components/OngkosKirimTab';
import { IncomeTab } from './components/IncomeTab';
import { PiutangUtangTab } from './components/PiutangUtangTab';
import { PiutangTab } from './components/PiutangTab';
import { UserManagementTab } from './components/UserManagementTab';
import { BusinessPartnerTab } from './components/BusinessPartnerTab';
import { BankKasTab } from './components/BankKasTab';
import { SettingsTab } from './components/SettingsTab';
import { getAccountBalanceForPeriod, isParentAccount } from './lib/decimal-utils';
import { initMobilePresentation } from './lib/mobile-presentation';
import { 
  Lock, 
  Sparkles, 
  HelpCircle, 
  Eye, 
  Layers, 
  BookOpen, 
  TrendingUp,
  LogIn,
  ChevronRight
} from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { user, profile, loading, signInWithGoogle, loginAsDemo, authError } = useAuth();
  const { sidebarHidden, setSidebarHidden } = useSidebar();
  const [activeTab, setActiveTab ] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState<'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang'>('cashflow');

  const hasPerm = (key: string) => {
    if (key === 'settings') return true;
    if (profile?.role === 'owner') return true;
    if (key === 'user-management') return false;
    if (key === 'financial') return !!profile?.permissions?.['financial'];
    if (key === 'partners') return !!profile?.permissions?.['financial.partners'];
    if (key === 'expenses') return !!profile?.permissions?.['perlengkapan'] || !!profile?.permissions?.['iklan'] || !!profile?.permissions?.['financial.partners'];
    if (key === 'double-entry') return !!profile?.permissions?.['double-entry'];
    const doubleEntryTabs = ['coa', 'journal', 'ledger-summary', 'trial-balance', 'closing'];
    if (doubleEntryTabs.includes(key)) {
      if (!profile?.permissions?.['double-entry']) return false;
      return profile?.permissions?.[key] !== false;
    }
    return !!profile?.permissions?.[key];
  };

  useEffect(() => {  
    if (!profile) return;
    if (!hasPerm(activeTab)) {
      const availableTabs = [
        'dashboard', 'catalog', 'sales', 'purchases', 'freight-in', 'inventory',
        'income', 'piutang', 'perlengkapan', 'iklan', 'ongkir', 'beban-lainnya', 'partners', 'fixed-assets',
        'financial', 'double-entry', 'report-sales-detail', 'user-management', 'settings'
      ];
      const firstAvailable = availableTabs.find(tab => hasPerm(tab));
      if (firstAvailable && firstAvailable !== activeTab) {
        setActiveTab(firstAvailable);
      }
    }
  }, [profile, activeTab]);

  const [theme, setTheme]
 = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Re-presents desktop tables/dialogs as mobile-native cards and sheets.
  // Presentational only — inert above 768px. See lib/mobile-presentation.ts.
  useEffect(() => initMobilePresentation(), []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);



  // If loading user state
  if (loading) {
    return (
      <div className="kbi-boot min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col items-center justify-center">
        {/* Mobile: a shelf of book spines draws itself while the app boots */}
        <div className="kbi-boot__shelf md:hidden" role="status" aria-label="Memuat">
          <i /><i /><i />
        </div>
        <p className="kbi-boot__label md:hidden">Memuat ERP</p>

        <div className="hidden md:flex flex-col items-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-650 border-t-transparent"></div>
          <p className="text-sm text-neutral-500 font-medium">Memuat KangenBukuIndo ERP...</p>
        </div>
      </div>
    );
  }

  // Not authenticated login gate screen
  if (!user) {
    return (
      <div className="kbi-auth min-h-screen bg-[#fafafa] dark:bg-[#0b0a0f] flex items-center justify-center p-4">
        <div className="kbi-auth__card w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 shadow-2xl flex flex-col justify-between space-y-8 relative overflow-hidden">

          <div className="kbi-auth__ornament absolute top-0 right-0 p-3 opacity-10">
            <Sparkles className="h-32 w-32 text-indigo-500" />
          </div>

          {/* Mobile-only: a shelf of book spines — the brand in one glance */}
          <div className="kbi-auth__art md:hidden" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>

          <div className="text-center space-y-3 relative z-10">
            <div className="hidden md:inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-650/10 text-indigo-600 mb-2">
              <BookOpen className="h-6 w-6" />
            </div>
            <h2 className="kbi-auth__title text-2xl font-black tracking-tight text-neutral-900 dark:text-white uppercase">KangenBukuIndo</h2>
            <p className="text-xs text-neutral-500 max-w-[280px] mx-auto leading-relaxed">
              Business ERP & Logistics Hub untuk E-Commerce Buku Indonesia di Taiwan.
            </p>
          </div>

          {/* Social Sign-in Buttons */}
          <div className="space-y-4 relative z-10">
            {authError && (
              <div className={`p-4 rounded-xl text-xs font-semibold leading-relaxed border ${
                authError.startsWith('ℹ️') 
                  ? 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300' 
                  : 'bg-rose-50/50 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
              }`}>
                {authError}
              </div>
            )}

            <button
              onClick={() => signInWithGoogle()}
              className="kbi-auth__cta w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2.5 transition shadow-indigo-200 cursor-pointer"
            >
              Sign In with Google Account
            </button>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 text-center space-y-2">
              <p className="text-xs text-neutral-400 font-medium">Atau Masuk Cepat (Ideal untuk Preview):</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => loginAsDemo('owner')}
                  className="py-2.5 px-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Demo Owner
                </button>
                <button
                  onClick={() => loginAsDemo('staff')}
                  className="py-2.5 px-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Demo Staff
                </button>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-center text-neutral-400 font-medium pt-4 border-t border-neutral-100 dark:border-neutral-800">
            KangenBukuIndo Taiwan Group Inc. · All Rights Reserved · NTD/IDR Multi-Ledger
          </div>
        </div>
      </div>
    );
  }

  // Authenticated ERP interface shell layout
  return (
    <div className="min-h-screen bg-[#FAF8F3] dark:bg-[#0c0a12] text-neutral-800 dark:text-neutral-100 flex flex-col md:flex-row relative overflow-hidden select-text">
      {/* Premium ambient decorative blurred blobs */}
      <div className="absolute top-[-10%] left-[-15%] w-[50%] h-[50%] rounded-full bg-sky-200/20 dark:bg-sky-950/10 blur-[130px] pointer-events-none select-none transition-all duration-700"></div>
      <div className="absolute bottom-[5%] right-[-10%] w-[55%] h-[55%] rounded-full bg-blue-200/25 dark:bg-blue-950/10 blur-[150px] pointer-events-none select-none transition-all duration-700"></div>
      <div className="absolute top-[25%] right-[10%] w-[40%] h-[40%] rounded-full bg-cyan-200/15 dark:bg-cyan-950/10 blur-[120px] pointer-events-none select-none transition-all duration-700"></div>

      {/* Universal Desktop Sticky Sidebar Navigation */}
      <Sidebar 
        currentTab={activeTab} 
        setTab={setActiveTab} 
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        theme={theme} 
        toggleTheme={toggleTheme} 
        sidebarHidden={sidebarHidden}
        setSidebarHidden={setSidebarHidden}
      />

      {/* Mobile Top App Bar & Bottom Navigation Shell */}
      <MobileNav
        currentTab={activeTab}
        setTab={setActiveTab}
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      
      {/* Main panel viewport content wrapper */}
      <main className="kbi-main flex-1 p-3 sm:p-6 md:p-8 lg:p-10 max-w-full px-4 sm:px-6 md:px-8 space-y-6 overflow-y-auto h-[calc(100vh-57px)] md:h-screen relative z-10 bg-[#FAF8F3] dark:bg-[#0c0a12] pb-28 md:pb-10">
        
        {/* Tab switcher renderer */}
        {hasPerm(activeTab) ? (
          <>
            {activeTab === 'dashboard' && <DashboardTab setTab={setActiveTab} />}
            {activeTab === 'catalog' && <CatalogTab />}
            {activeTab === 'sales' && <SalesTab />}
            {activeTab === 'purchases' && <PurchasesTab />}
            {activeTab === 'freight-in' && <FreightInTab />}
            {activeTab === 'inventory' && <InventoryTab />}
            {activeTab === 'bank-kas' && <BankKasTab setTab={setActiveTab} />}
            {activeTab === 'financial' && (
              <FinancialTab 
                activeSubTab={activeSubTab} 
                setActiveSubTab={setActiveSubTab} 
              />
            )}
            {activeTab === 'coa' && <CoaTab />}
            {activeTab === 'journal' && <JournalTab setTab={setActiveTab} />}
            {activeTab === 'ledger-summary' && <LedgerSummaryTab setTab={setActiveTab} />}
            {activeTab === 'trial-balance' && <TrialBalanceTab setTab={setActiveTab} />}
            {activeTab === 'closing' && <ClosingTab />}
            {activeTab === 'fixed-assets' && <FixedAssetsTab />}
            {activeTab === 'amortisasi' && <AmortisasiTab />}
            {activeTab === 'income' && <IncomeTab />}
            {activeTab === 'piutang' && <PiutangTab />}
            {activeTab === 'perlengkapan' && <PerlengkapanTab />}
            {activeTab === 'iklan' && <IklanTab />}
            {activeTab === 'beban-lainnya' && <BebanLainnyaTab />}
            {activeTab === 'ongkir' && <OngkosKirimTab setTab={setActiveTab} />}
            {activeTab === 'partners' && <BusinessPartnerTab />}
            {activeTab === 'report-sales-detail' && <ReportSalesDetailTab />}
            {activeTab === 'user-management' && <UserManagementTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Lock className="h-16 w-16 text-neutral-300 dark:text-neutral-700 mb-4" />
            <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mb-2">Akses Ditolak</h2>
            <p className="text-neutral-500 dark:text-neutral-400 max-w-md">
              Anda tidak memiliki izin untuk mengakses modul <b>{activeTab}</b>. Silakan hubungi Owner untuk meminta akses.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <SidebarProvider>
      <AuthProvider>
        <MainAppContent />
      </AuthProvider>
    </SidebarProvider>
  );
}
