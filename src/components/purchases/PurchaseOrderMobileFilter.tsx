import React, { useState } from 'react';
import { Drawer } from 'vaul';
import {
  Search,
  X,
  SlidersHorizontal,
  Calendar,
  Filter,
  Check,
  RotateCcw,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { formatNTD } from '../../lib/decimal-utils';
import { DateRangePicker } from '../ui/DateRangePicker';

export interface PurchaseOrderMobileFilterProps {
  activeFilterTab: string;
  setActiveFilterTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  // Status counts & sums
  allCount: number;
  pendingCount: number;
  pendingSum: number;
  partialCount: number;
  partialSum: number;
  receivedCount: number;
  receivedSum: number;
  cancelledCount: number;
  cancelledSum: number;
  canViewAmount: boolean;
  // Date filter props
  startDate: any;
  endDate: any;
  datePresetLabel?: string;
  onDateChange: (start: any, end: any, label?: string) => void;
  // Platform filter props
  selectedPlatform?: string;
  setSelectedPlatform?: (platformId: string) => void;
  platforms?: Array<{ id: string; name: string; currency?: string }>;
  onResetFilters?: () => void;
}

export const PurchaseOrderMobileFilter: React.FC<PurchaseOrderMobileFilterProps> = React.memo(({
  activeFilterTab,
  setActiveFilterTab,
  searchQuery,
  setSearchQuery,
  allCount,
  pendingCount,
  pendingSum,
  partialCount,
  partialSum,
  receivedCount,
  receivedSum,
  cancelledCount,
  cancelledSum,
  canViewAmount,
  startDate,
  endDate,
  datePresetLabel,
  onDateChange,
  selectedPlatform,
  setSelectedPlatform,
  platforms = [],
  onResetFilters,
}) => {
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const statusTabs = [
    { key: 'Semua', label: 'Semua', count: allCount, sum: 0, color: '#0d1117', activeBg: 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900', inactiveBorder: 'border-[#E7E1D2] dark:border-neutral-800' },
    { key: 'Menunggu', label: 'Menunggu', count: pendingCount, sum: pendingSum, color: '#A6791E', activeBg: 'bg-[#A6791E] text-white shadow-xs', inactiveBorder: 'border-[#E7E1D2] dark:border-neutral-800' },
    { key: 'Sebagian', label: 'Sebagian', count: partialCount, sum: partialSum, color: '#48607F', activeBg: 'bg-[#48607F] text-white shadow-xs', inactiveBorder: 'border-[#E7E1D2] dark:border-neutral-800' },
    { key: 'Diterima', label: 'Diterima', count: receivedCount, sum: receivedSum, color: '#4C6B4F', activeBg: 'bg-[#4C6B4F] text-white shadow-xs', inactiveBorder: 'border-[#E7E1D2] dark:border-neutral-800' },
    { key: 'Cancel', label: 'Cancel', count: cancelledCount, sum: cancelledSum, color: '#A34A32', activeBg: 'bg-[#A34A32] text-white shadow-xs', inactiveBorder: 'border-[#E7E1D2] dark:border-neutral-800' },
  ];

  const isPlatformActive = Boolean(selectedPlatform && selectedPlatform !== 'all' && selectedPlatform !== '');
  const isDateActive = Boolean(datePresetLabel && datePresetLabel !== 'Semua' && datePresetLabel !== 'Semua Tanggal');
  const activeFiltersCount = (isPlatformActive ? 1 : 0) + (isDateActive ? 1 : 0);

  return (
    <div className="space-y-2.5 md:hidden">
      {/* 1. Mobile Search & Filter Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 flex items-center bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-xl px-3 h-11 focus-within:border-[#6B1F3D] focus-within:ring-2 focus-within:ring-[#6B1F3D]/10 transition shadow-xs">
          <Search className="w-4 h-4 text-neutral-400 shrink-0 mr-2" />
          <input
            type="text"
            placeholder="Cari No. PO, Supplier, Resi, Buku..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none outline-none font-['Lexend'] text-[13px] text-neutral-900 dark:text-white placeholder-neutral-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition shrink-0 active:bg-neutral-100 dark:active:bg-neutral-800 cursor-pointer"
              aria-label="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Trigger Button (44px min target) */}
        <button
          type="button"
          onClick={() => setIsFilterDrawerOpen(true)}
          className={`flex items-center justify-center gap-1.5 h-11 min-w-[44px] px-3.5 rounded-xl border font-['Lexend'] text-xs font-semibold transition shrink-0 shadow-xs cursor-pointer active:scale-95 duration-150 ${
            activeFiltersCount > 0
              ? 'bg-[#6B1F3D]/10 dark:bg-[#6B1F3D]/25 border-[#6B1F3D] text-[#6B1F3D] dark:text-rose-300'
              : 'bg-white dark:bg-neutral-900 border-[#E7E1D2] dark:border-neutral-800 text-neutral-700 dark:text-neutral-200 hover:border-neutral-300'
          }`}
          aria-label="Buka filter lanjutan"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filter</span>
          {activeFiltersCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#6B1F3D] text-white text-[10px] font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* 2. Horizontally Scrollable Status Chips Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 hide-scrollbar snap-x">
        {statusTabs.map((tab) => {
          const isActive = activeFilterTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilterTab(tab.key)}
              className={`snap-start flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all duration-150 border cursor-pointer select-none active:scale-[0.98] ${
                isActive
                  ? `${tab.activeBg} border-transparent shadow-xs scale-[1.02]`
                  : `bg-white dark:bg-neutral-900 ${tab.inactiveBorder} text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-700`
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: isActive ? '#FFFFFF' : tab.color }}
              />
              <span>{tab.label}</span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {tab.count}
              </span>
              {canViewAmount && tab.sum > 0 && !isActive && (
                <span className="text-[10px] text-neutral-400 font-normal">
                  · {formatNTD(tab.sum)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Slide-up Filter Bottom Sheet (vaul) */}
      <Drawer.Root open={isFilterDrawerOpen} onOpenChange={setIsFilterDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay 
            className="fixed inset-0 bg-black/60 z-[9999] backdrop-blur-[2px]" 
            onClick={(e) => e.stopPropagation()}
          />
          <Drawer.Content
            className="fixed bottom-0 left-0 right-0 z-[10000] bg-white dark:bg-neutral-900 rounded-t-[24px] max-h-[88dvh] flex flex-col border-t border-[#E7E1D2] dark:border-neutral-800 outline-none pb-safe"
            data-vaul-no-drag
          >
            {/* Grab Handle */}
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-3 mb-2 cursor-grab active:cursor-grabbing" />

            {/* Header (44px target for close) */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#6B1F3D] dark:text-rose-400" />
                <h3 className="font-['Lexend'] font-bold text-[16px] text-neutral-900 dark:text-white">
                  Filter Pembelian
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(false)}
                className="w-11 h-11 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Tutup filter"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Content */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1 font-['Lexend']" data-vaul-no-drag>
              {/* Date Filter Section */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Periode Tanggal PO
                </label>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  presetLabel={datePresetLabel}
                  onChange={(start, end, label) => {
                    onDateChange(start, end, label);
                  }}
                />
              </div>

              {/* Platform Selector Section */}
              {platforms.length > 0 && setSelectedPlatform && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                    Platform / Supplier
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPlatform('')}
                      className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left border transition cursor-pointer active:scale-[0.98] ${
                        !selectedPlatform || selectedPlatform === 'all' || selectedPlatform === ''
                          ? 'bg-[#6B1F3D]/10 border-[#6B1F3D] text-[#6B1F3D] dark:text-rose-300 font-bold'
                          : 'bg-white dark:bg-neutral-900 border-[#E7E1D2] dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                      }`}
                    >
                      Semua Platform
                    </button>
                    {platforms.map((plat) => {
                      const isSelected = selectedPlatform === plat.id;
                      return (
                        <button
                          key={plat.id}
                          type="button"
                          onClick={() => setSelectedPlatform(plat.id)}
                          className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left border truncate transition cursor-pointer active:scale-[0.98] ${
                            isSelected
                              ? 'bg-[#6B1F3D]/10 border-[#6B1F3D] text-[#6B1F3D] dark:text-rose-300 font-bold'
                              : 'bg-white dark:bg-neutral-900 border-[#E7E1D2] dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                          }`}
                        >
                          {plat.name} {plat.currency ? `(${plat.currency})` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Action Buttons (44px min targets) */}
            <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 flex items-center gap-3 shrink-0">
              {onResetFilters && (
                <button
                  type="button"
                  onClick={() => {
                    onResetFilters();
                    setIsFilterDrawerOpen(false);
                  }}
                  className="flex-1 min-h-[44px] py-3 px-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-center cursor-pointer active:scale-98"
                >
                  Reset Filter
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(false)}
                className="flex-1 min-h-[44px] py-3 px-4 rounded-xl bg-[#6B1F3D] hover:bg-[#4E1530] text-white text-xs font-bold shadow-sm transition text-center cursor-pointer active:scale-98"
              >
                Terapkan
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
});

PurchaseOrderMobileFilter.displayName = 'PurchaseOrderMobileFilter';
