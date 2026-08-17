import React, { useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { useSettings } from '../lib/use-settings';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Grid,
  X,
  Search,
  Truck,
  BookOpen,
  Receipt,
  DollarSign,
  Scale,
  Building,
  BarChart3,
  Users,
  Settings,
  Sun,
  Moon,
  TrendingUp,
  LineChart,
  ArrowLeft,
  SearchX
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, animate } from 'motion/react';

interface MobileNavProps {
  currentTab: string;
  setTab: (tab: string) => void;
  activeSubTab: 'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang';
  setActiveSubTab: (subTab: 'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang') => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentTab,
  setTab,
  activeSubTab,
  setActiveSubTab,
  theme,
  toggleTheme,
}) => {
  const { profile } = useAuth();
  const { branding } = useSettings();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [entryPoint, setEntryPoint] = useState<'nav' | 'sheet'>('nav');
  const [searchQuery, setSearchQuery] = useState('');
  const [dragPreviewTab, setDragPreviewTab] = useState<string | null>(null);
  const dragControls = useDragControls();
  const pullY = useMotionValue<number | string>("100%");
  
  // Stretch physics for dock
  const dockStretch = useMotionValue(0);
  const dockScaleX = useTransform(dockStretch, (x) => {
    return 1 + (Math.abs(x as number) / 60) * 0.8;
  });
  const dockOriginX = useTransform(dockStretch, (x) => {
    return (x as number) >= 0 ? 0 : 1;
  });
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const touchStartY = React.useRef(0);
  const isPullingDown = React.useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isPullingDown.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!bodyRef.current) return;
    if (bodyRef.current.scrollTop <= 0) {
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) {
        isPullingDown.current = true;
        pullY.set(dy * 0.6); // Elastic resistance
      } else {
        isPullingDown.current = false;
      }
    } else {
      isPullingDown.current = false;
    }
  };

  const handleTouchEnd = () => {
    if (isPullingDown.current) {
      const currentY = pullY.get();
      if (typeof currentY === 'number' && currentY > 80) {
        setIsMoreOpen(false);
      } else {
        animate(pullY, 0, { type: 'spring', damping: 25, stiffness: 200 });
      }
      isPullingDown.current = false;
    }
  };

  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      setIsMoreOpen(false);
    }
  };

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

  const handleNavigate = (
    tab: string,
    subTab?: 'cashflow' | 'profit-loss' | 'payroll' | 'partners' | 'prive' | 'neraca' | 'equity-change' | 'utang',
    source: 'nav' | 'sheet' = 'sheet'
  ) => {
    setEntryPoint(source);
    setTab(tab);
    if (subTab) {
      setActiveSubTab(subTab);
    }
    setIsMoreOpen(false);
  };

  const handleBackClick = () => {
    if (entryPoint === 'sheet') {
      setIsMoreOpen(true);
    } else {
      setTab('dashboard');
    }
  };

  // Get active label for top bar title
  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard': return branding.namaUsaha || 'KangenBukuIndo';
      case 'daily-report': return 'Laporan Harian';
      case 'catalog': return 'Katalog Buku';
      case 'sales': return 'Sales Orders';
      case 'purchases': return 'Purchase Orders';
      case 'freight-in': return 'Freight In Logistik';
      case 'inventory': return 'Stok & Value Buku';
      case 'bank-kas': return 'Bank & Kas';
      case 'financial':
        if (activeSubTab === 'cashflow') return 'Laporan Arus Kas';
        if (activeSubTab === 'profit-loss') return 'Laporan Laba Rugi';
        if (activeSubTab === 'prive') return 'Modal & Prive';
        if (activeSubTab === 'neraca') return 'Neraca / Balance Sheet';
        if (activeSubTab === 'equity-change') return 'Perubahan Modal';
        if (activeSubTab === 'utang') return 'Utang Usaha';
        if (activeSubTab === 'payroll') return 'Gaji & Payroll';
        return 'Accounting Suite';
      case 'coa': return 'Chart of Accounts (CoA)';
      case 'journal': return 'Jurnal Umum';
      case 'ledger-summary': return 'Ringkasan Buku Besar';
      case 'trial-balance': return 'Neraca Saldo / Trial Balance';
      case 'closing': return 'Tutup Periode';
      case 'fixed-assets': return 'Manajemen Aset Tetap';
      case 'amortisasi': return 'Jadwal Amortisasi';
      case 'income': return 'Penerimaan Transfer';
      case 'piutang': return 'Piutang Usaha';
      case 'perlengkapan': return 'Beban Perlengkapan';
      case 'iklan': return 'Beban Iklan Marketplace';
      case 'ongkir': return 'Ongkos Kirim';
      case 'beban-lainnya': return 'Beban Lainnya';
      case 'partners': return 'Business Partners / Reseller';
      case 'report-sales-detail': return 'Laporan Rincian Penjualan';
      case 'report-user-activity': return 'Kegiatan User';
      case 'user-management': return 'Manajemen Pengguna';
      case 'settings': return 'Pengaturan Usaha';
      default: return 'KangenBukuIndo ERP';
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  // Dock slots — order preserved from the original bottom bar.
  const dockItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, always: true },
    { id: 'sales', label: 'Sales', icon: ShoppingCart },
    { id: 'purchases', label: 'Purchases', icon: Package },
    { id: 'inventory', label: 'Stok', icon: Boxes },
  ].filter((d) => d.always || hasPerm(d.id));

  const operasional = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'daily-report', label: 'Laporan Harian', icon: LineChart },
    { id: 'sales', label: 'Sales Orders', icon: ShoppingCart },
    { id: 'purchases', label: 'Purchase Orders', icon: Package },
    { id: 'freight-in', label: 'Freight In', icon: Truck },
    { id: 'inventory', label: 'Stok & Value', icon: Boxes },
    { id: 'catalog', label: 'Katalog Buku', icon: BookOpen },
  ].filter((m) => hasPerm(m.id)).filter((m) => matches(m.label));

  const biaya = [
    { id: 'perlengkapan', label: 'Perlengkapan', emoji: '🧹', permKey: 'perlengkapan' },
    { id: 'iklan', label: 'Iklan Marketplace', emoji: '📢', permKey: 'iklan' },
    { id: 'ongkir', label: 'Ongkos Kirim', emoji: '🚚', permKey: 'ongkir' },
    { id: 'beban-lainnya', label: 'Beban Lainnya', emoji: '🧾', permKey: 'beban-lainnya' },
    { id: 'partners', label: 'Business Partners', emoji: '🤝', permKey: 'financial.partners' },
  ].filter((s) => hasPerm(s.permKey)).filter((s) => matches(s.label));

  const transaksi = [
    { id: 'income', label: 'Penerimaan Transfer', icon: TrendingUp, tone: 't-forest' },
    { id: 'piutang', label: 'Piutang Usaha', icon: Receipt, tone: 't-slate' },
    { id: 'fixed-assets', label: 'Aset Tetap', icon: Building, tone: 't-slate' },
    { id: 'amortisasi', label: 'Amortisasi', icon: Receipt, tone: 't-gold' },
  ].filter((s) => hasPerm(s.id)).filter((s) => matches(s.label));

  const laporanKeuangan = [
    { id: 'cashflow', label: 'Arus Kas', emoji: '📂' },
    { id: 'profit-loss', label: 'Laba Rugi', emoji: '📊' },
    { id: 'prive', label: 'Modal & Prive', emoji: '💸' },
    { id: 'neraca', label: 'Neraca', emoji: '🏛️' },
    { id: 'equity-change', label: 'Perubahan Modal', emoji: '📈' },
    { id: 'utang', label: 'Utang Usaha', emoji: '💳' },
    { id: 'payroll', label: 'Payroll', emoji: '💵', permKey: 'financial.payroll' },
  ].filter((s) => (s.permKey ? hasPerm(s.permKey) : true)).filter((s) => matches(s.label));

  const doubleEntry = [
    { id: 'coa', label: 'Bagan Akun (CoA)' },
    { id: 'journal', label: 'Jurnal Umum' },
    { id: 'ledger-summary', label: 'Ledger Summary' },
    { id: 'trial-balance', label: 'Trial Balance' },
    { id: 'closing', label: 'Tutup Periode' },
  ].filter((s) => hasPerm(s.id)).filter((s) => matches(s.label));

  const heroCatalog = hasPerm('catalog') && matches('Katalog Buku');
  const heroFreight = hasPerm('freight-in') && matches('Freight In');
  const showLaporan = (hasPerm('report-sales-detail') && matches('Laporan Rincian Penjualan')) || (hasPerm('report-user-activity') && matches('Kegiatan User'));
  const showUsers = hasPerm('user-management') && matches('Manajemen User');
  const showSettings = matches('Pengaturan Usaha');

  const nothingFound =
    !heroCatalog && !heroFreight && operasional.length === 0 && biaya.length === 0 &&
    transaksi.length === 0 && laporanKeuangan.length === 0 && doubleEntry.length === 0 &&
    !showLaporan && !showUsers && !showSettings;

  const dockTouchStartX = React.useRef(0);

  const handleDockTouchStart = (e: React.TouchEvent) => {
    dockTouchStartX.current = e.touches[0].clientX;
    dockStretch.set(0);
    setDragPreviewTab(null);
  };

  const handleDockTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const dx = currentX - dockTouchStartX.current;
    
    // Animate stretch
    dockStretch.set(dx);

    if (Math.abs(dx) > 60) {
      const activeId = dragPreviewTab !== null ? dragPreviewTab : (isMoreOpen ? 'lainnya' : currentTab);
      const allDockIds = [...dockItems.map(d => d.id), 'lainnya'];
      const currentIndex = allDockIds.indexOf(activeId);
      
      const shift = Math.sign(dx);
      const newIndex = currentIndex + shift;
      
      if (newIndex >= 0 && newIndex < allDockIds.length) {
        const targetId = allDockIds[newIndex];
        setDragPreviewTab(targetId);
        
        dockTouchStartX.current = currentX;
        dockStretch.set(0);
      } else {
        dockStretch.set(shift * 60);
      }
    }
  };

  const handleDockTouchEnd = (e: React.TouchEvent) => {
    animate(dockStretch, 0, { type: "spring", bounce: 0.5 });
    
    if (dragPreviewTab !== null) {
      if (dragPreviewTab === 'lainnya') {
        setIsMoreOpen(true);
      } else {
        setIsMoreOpen(false);
        handleNavigate(dragPreviewTab, undefined, 'nav');
      }
      setDragPreviewTab(null);
    }
  };

  return (
    <>
      {/* ── TOP BAR · the "bound edge" ────────────────────────────────────── */}
      <header className="md:hidden kbi-mtop">
        <div className="kbi-mtop__left">
          {currentTab !== 'dashboard' && currentTab !== 'sales' && currentTab !== 'purchases' ? (
            <button
              type="button"
              onClick={handleBackClick}
              className="kbi-mtop__back"
              aria-label={entryPoint === 'sheet' ? 'Kembali ke Menu' : 'Kembali ke Dashboard'}
              title={entryPoint === 'sheet' ? 'Kembali ke Menu' : 'Kembali ke Dashboard'}
            >
              <ArrowLeft className="w-[18px] h-[18px] stroke-[2.4]" />
            </button>
          ) : null}

          <div className="kbi-mtop__titles">
            <h1 className="kbi-mtop__title">{getTabTitle()}</h1>
            <p className="kbi-mtop__eyebrow">
              {currentTab === 'dashboard' ? 'Ringkasan Usaha' : (branding.namaUsaha || 'KangenBukuIndo ERP')}
            </p>
          </div>
        </div>

        <div className="kbi-mtop__actions">
          {currentTab === 'dashboard' && (
            <>
              <button
                type="button"
                onClick={toggleTheme}
                className="kbi-mtop__icon"
                aria-label={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                title="Ganti Tema"
              >
                {theme === 'dark'
                  ? <Sun className="w-[17px] h-[17px] text-amber-400" />
                  : <Moon className="w-[17px] h-[17px]" />}
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('settings', undefined, 'nav')}
                className={`kbi-mtop__icon ${currentTab === 'settings' ? 'is-active' : ''}`}
                aria-label="Pengaturan Usaha"
                title="Pengaturan Usaha"
              >
                <Settings className="w-[17px] h-[17px]" />
              </button>
            </>
          )}
          <div id="top-header-actions-portal"></div>
        </div>
      </header>

      {/* ── BOTTOM DOCK · floating shelf with a bookmark ribbon ───────────── */}
      <nav 
        className="md:hidden kbi-mdock" 
        aria-label="Navigasi utama"
        onTouchStart={handleDockTouchStart}
        onTouchMove={handleDockTouchMove}
        onTouchEnd={handleDockTouchEnd}
      >
        {dockItems.map((item) => {
          const Icon = item.icon;
          const effectiveTab = dragPreviewTab !== null ? dragPreviewTab : (isMoreOpen ? 'lainnya' : currentTab);
          const isActive = effectiveTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id, undefined, 'nav')}
              className={`kbi-mdock__btn ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="activeDockBubble"
                  className="kbi-mdock__bubble"
                  transition={{ type: "spring", bounce: 0.55, duration: 0.55 }}
                  style={{ scaleX: dockScaleX, originX: dockOriginX }}
                />
              )}
              <span className="kbi-mdock__icon">
                <Icon className="w-[19px] h-[19px]" />
              </span>
              <span className="kbi-mdock__label">{item.label}</span>
            </button>
          );
        })}

        {(() => {
          const effectiveTab = dragPreviewTab !== null ? dragPreviewTab : (isMoreOpen ? 'lainnya' : currentTab);
          const isLainnyaActive = effectiveTab === 'lainnya';
          
          return (
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              className={`kbi-mdock__btn ${isLainnyaActive ? 'is-active' : ''}`}
              aria-expanded={isLainnyaActive}
            >
              {isLainnyaActive && (
                <motion.div
                  layoutId="activeDockBubble"
                  className="kbi-mdock__bubble"
                  transition={{ type: "spring", bounce: 0.55, duration: 0.55 }}
                  style={{ scaleX: dockScaleX, originX: dockOriginX }}
                />
              )}
              <span className="kbi-mdock__icon">
                <Grid className="w-[19px] h-[19px]" />
              </span>
              <span className="kbi-mdock__label">Lainnya</span>
            </button>
          );
        })()}
      </nav>

      {/* ── "LAINNYA" SHEET · the module library ──────────────────────────── */}
      <AnimatePresence>
        {isMoreOpen && (
          <motion.div 
            className="md:hidden kbi-msheet-scrim" 
            role="dialog" 
            aria-modal="true" 
            aria-label="Semua modul"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="fixed inset-0" onClick={() => setIsMoreOpen(false)} />

            <motion.div 
              className="kbi-msheet"
              style={{ y: pullY }}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.8 }}
              onDragEnd={handleDragEnd}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div 
                className="kbi-msheet__grip"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: "none", cursor: "grab" }}
              >
                <span />
              </div>

              <div 
                className="kbi-msheet__head"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: "none" }}
              >
                <div className="kbi-msheet__headrow">
                  <div>
                    <h2 className="kbi-msheet__title">Semua Modul</h2>
                    <p className="kbi-msheet__sub">KangenBukuIndo ERP</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMoreOpen(false)}
                    className="kbi-msheet__close"
                    aria-label="Tutup menu"
                  >
                    <X className="w-[19px] h-[19px]" />
                  </button>
                </div>

              <div className="kbi-msheet__search">
                <Search className="w-[17px] h-[17px]" />
                <input
                  type="text"
                  placeholder="Cari nama modul…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Cari modul"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="kbi-msheet__clear"
                    aria-label="Hapus pencarian"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div 
              className="kbi-msheet__body"
              ref={bodyRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {nothingFound && (
                <div className="kbi-mempty">
                  <div className="kbi-mempty__glyph"><SearchX className="w-6 h-6" /></div>
                  <div className="kbi-mempty__title">Modul tidak ditemukan</div>
                  <div className="kbi-mempty__cap">
                    Tidak ada modul yang cocok dengan “{searchQuery}”.
                  </div>
                </div>
              )}

              {/* Akses Utama — rendered as book covers with coloured spines */}
              {(heroCatalog || heroFreight) && (
                <div>
                  <div className="kbi-msheet__legend">Akses Utama</div>
                  <div className="kbi-msheet__grid">
                    {heroCatalog && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('catalog')}
                        className={`kbi-mhero t-forest ${currentTab === 'catalog' ? 'is-active' : ''}`}
                      >
                        <span className="kbi-mhero__glyph"><BookOpen className="w-[18px] h-[18px]" /></span>
                        <span>
                          <span className="kbi-mhero__title block">Katalog Buku</span>
                          <span className="kbi-mhero__cap block">Master ISBN & Harga</span>
                        </span>
                      </button>
                    )}
                    {heroFreight && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('freight-in')}
                        className={`kbi-mhero t-slate ${currentTab === 'freight-in' ? 'is-active' : ''}`}
                      >
                        <span className="kbi-mhero__glyph"><Truck className="w-[18px] h-[18px]" /></span>
                        <span>
                          <span className="kbi-mhero__title block">Freight In</span>
                          <span className="kbi-mhero__cap block">Logistik & Impor</span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Operasional Utama */}
              {operasional.length > 0 && (
                <div>
                  <div className="kbi-msheet__legend">Operasional Utama</div>
                  <div className="kbi-msheet__grid">
                    {operasional.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNavigate(item.id)}
                          className={`kbi-mtile t-forest ${isActive ? 'is-active' : ''}`}
                        >
                          <span className="kbi-mtile__glyph"><Icon className="w-4 h-4" /></span>
                          <span className="kbi-mtile__label">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Biaya & Utang */}
              {biaya.length > 0 && (
                <div style={{ ['--m-legend' as any]: 'var(--m-rust)' }}>
                  <div className="kbi-msheet__legend">Biaya &amp; Utang</div>
                  <div className="kbi-msheet__grid">
                    {biaya.map((sub) => {
                      const isActive = currentTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleNavigate(sub.id)}
                          className={`kbi-mtile t-rust ${isActive ? 'is-active' : ''}`}
                        >
                          <span className="kbi-mtile__glyph">{sub.emoji}</span>
                          <span className="kbi-mtile__label">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Transaksi Keuangan Standalone */}
              {transaksi.length > 0 && (
                <div style={{ ['--m-legend' as any]: 'var(--m-slate)' }}>
                  <div className="kbi-msheet__legend">
                    <Receipt className="w-3.5 h-3.5" />
                    Transaksi Standalone
                  </div>
                  <div className="kbi-msheet__grid">
                    {transaksi.map((sub) => {
                      const Icon = sub.icon;
                      const isActive = currentTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleNavigate(sub.id)}
                          className={`kbi-mtile ${sub.tone} ${isActive ? 'is-active' : ''}`}
                        >
                          <span className="kbi-mtile__glyph"><Icon className="w-4 h-4" /></span>
                          <span className="kbi-mtile__label">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Accounting Suite — Laporan Keuangan */}
              {hasPerm('financial') && laporanKeuangan.length > 0 && (
                <div>
                  <div className="kbi-msheet__legend">
                    <DollarSign className="w-3.5 h-3.5" />
                    Laporan Keuangan
                  </div>
                  <div className="kbi-msheet__grid">
                    {laporanKeuangan.map((sub) => {
                      const isActive = currentTab === 'financial' && activeSubTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleNavigate('financial', sub.id as any)}
                          className={`kbi-mtile t-forest ${isActive ? 'is-active' : ''}`}
                        >
                          <span className="kbi-mtile__glyph">{sub.emoji}</span>
                          <span className="kbi-mtile__label">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Accounting Suite — Double Entry */}
              {hasPerm('double-entry') && doubleEntry.length > 0 && (
                <div style={{ ['--m-legend' as any]: 'var(--m-slate)' }}>
                  <div className="kbi-msheet__legend">
                    <Scale className="w-3.5 h-3.5" />
                    Double Entry System
                  </div>
                  <div className="kbi-msheet__grid">
                    {doubleEntry.map((sub) => {
                      const isActive = currentTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleNavigate(sub.id)}
                          className={`kbi-mtile t-slate ${isActive ? 'is-active' : ''}`}
                        >
                          <span className="kbi-mtile__glyph">
                            <span className="w-1.5 h-1.5 rounded-full bg-current block" />
                          </span>
                          <span className="kbi-mtile__label">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Laporan */}
              {showLaporan && (
                <div style={{ ['--m-legend' as any]: 'var(--m-gold)' }}>
                  <div className="kbi-msheet__legend">Laporan</div>
                  <div className="kbi-msheet__grid">
                    {hasPerm('report-sales-detail') && matches('Laporan Rincian Penjualan') && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('report-sales-detail')}
                        className={`kbi-mtile kbi-mtile--wide t-forest ${currentTab === 'report-sales-detail' ? 'is-active' : ''}`}
                      >
                        <span className="kbi-mtile__glyph"><BarChart3 className="w-4 h-4" /></span>
                        <span className="kbi-mtile__label">Laporan Rincian Penjualan</span>
                      </button>
                    )}
                    {hasPerm('report-user-activity') && matches('Kegiatan User') && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('report-user-activity')}
                        className={`kbi-mtile kbi-mtile--wide t-forest ${currentTab === 'report-user-activity' ? 'is-active' : ''}`}
                      >
                        <span className="kbi-mtile__glyph"><BarChart3 className="w-4 h-4" /></span>
                        <span className="kbi-mtile__label">Kegiatan User</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Pengaturan & Sistem */}
              {(showUsers || showSettings) && (
                <div style={{ ['--m-legend' as any]: 'var(--m-ink-3)' }}>
                  <div className="kbi-msheet__legend">Pengaturan &amp; Sistem</div>
                  <div className="kbi-msheet__grid">
                    {showUsers && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('user-management')}
                        className={`kbi-mtile t-forest ${currentTab === 'user-management' ? 'is-active' : ''}`}
                      >
                        <span className="kbi-mtile__glyph"><Users className="w-4 h-4" /></span>
                        <span className="kbi-mtile__label">Manajemen User</span>
                      </button>
                    )}
                    {showSettings && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('settings')}
                        className={`kbi-mtile t-forest ${currentTab === 'settings' ? 'is-active' : ''}`}
                      >
                        <span className="kbi-mtile__glyph"><Settings className="w-4 h-4" /></span>
                        <span className="kbi-mtile__label">Pengaturan Usaha</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
