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

interface SalesOrderMobileFilterProps {
  activeFilterTab: string;
  setActiveFilterTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  // Status counts & sums
  allCount: number;
  pendingCount: number;
  pendingSum: number;
  packedCount: number;
  packedSum: number;
  shippedCount: number;
  shippedSum: number;
  completedCount: number;
  completedSum: number;
  returnedCount: number;
  returnedSum: number;
  cancelledCount: number;
  cancelledSum: number;
  canViewAmount: boolean;
  // Date filter props
  globalStartDate: string;
  globalEndDate: string;
  globalDateLabel?: string;
  onDateChange: (start: string, end: string, label?: string) => void;
  // Advanced Filter state & props
  isAdvancedActive?: boolean;
  selectedChannel?: string;
  setSelectedChannel?: (channel: string) => void;
  selectedLogistics?: string;
  setSelectedLogistics?: (logistics: string) => void;
  channelList: { name: string; color?: string }[];
  logisticsList: { name: string }[];
  onResetFilters: () => void;
}

export const SalesOrderMobileFilter: React.FC<SalesOrderMobileFilterProps> = ({
  activeFilterTab,
  setActiveFilterTab,
  searchQuery,
  setSearchQuery,
  allCount,
  pendingCount,
  pendingSum,
  packedCount,
  packedSum,
  shippedCount,
  shippedSum,
  completedCount,
  completedSum,
  returnedCount,
  returnedSum,
  cancelledCount,
  cancelledSum,
  canViewAmount,
  globalStartDate,
  globalEndDate,
  globalDateLabel,
  onDateChange,
  isAdvancedActive,
  selectedChannel,
  setSelectedChannel,
  selectedLogistics,
  setSelectedLogistics,
  channelList,
  logisticsList,
  onResetFilters,
}) => {
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const statusTabs = [
    { key: 'Semua', label: 'Semua', count: allCount, sum: 0, color: '#0d1117', bg: 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900', inactiveBg: 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300' },
    { key: 'Pending', label: 'Pending', count: pendingCount, sum: pendingSum, color: '#b45309', bg: 'bg-amber-500 text-white', inactiveBg: 'bg-white dark:bg-neutral-900 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300' },
    { key: 'Dikemas', label: 'Dikemas', count: packedCount, sum: packedSum, color: '#6366f1', bg: 'bg-indigo-600 text-white', inactiveBg: 'bg-white dark:bg-neutral-900 border-indigo-200 dark:border-indigo-900/40 text-indigo-800 dark:text-indigo-300' },
    { key: 'Dikirim', label: 'Dikirim', count: shippedCount, sum: shippedSum, color: '#1d6fa5', bg: 'bg-sky-600 text-white', inactiveBg: 'bg-white dark:bg-neutral-900 border-sky-200 dark:border-sky-900/40 text-sky-800 dark:text-sky-300' },
    { key: 'Berhasil', label: 'Selesai', count: completedCount, sum: completedSum, color: '#0f7a52', bg: 'bg-emerald-600 text-white', inactiveBg: 'bg-white dark:bg-neutral-900 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300' },
    { key: 'Return', label: 'Return', count: returnedCount, sum: returnedSum, color: '#a8323b', bg: 'bg-rose-600 text-white', inactiveBg: 'bg-white dark:bg-neutral-900 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300' },
    { key: 'Cancel', label: 'Cancel', count: cancelledCount, sum: cancelledSum, color: '#5b6472', bg: 'bg-neutral-600 text-white', inactiveBg: 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400' },
  ];

  return (
    <div className="space-y-2.5 md:hidden">
      {/* 1. Mobile Search & Quick Filter Row */}
      <div className="flex items-center gap-2">
        {/* Search Bar Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            data-vaul-no-drag
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari order, nama pembeli, no resi..."
            className="w-full h-10 pl-9 pr-8 bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800 rounded-xl text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-full"
              aria-label="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Date & Filter Drawer Trigger Button */}
        <button
          type="button"
          onClick={() => setIsFilterDrawerOpen(true)}
          className={`h-10 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition shadow-2xs cursor-pointer ${
            isAdvancedActive || (globalDateLabel && globalDateLabel !== 'Bulan Ini')
              ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-950/40 dark:border-brand-800 dark:text-brand-300'
              : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300'
          }`}
          aria-label="Buka filter dan periode"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="max-w-[70px] truncate">{globalDateLabel || 'Filter'}</span>
        </button>
      </div>

      {/* 2. Horizontally Scrolling Status Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-3 px-3">
        {statusTabs.map((tab) => {
          const isActive =
            activeFilterTab === tab.key ||
            ((activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai') && tab.key === 'Berhasil');

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilterTab(isActive && tab.key !== 'Semua' ? 'Semua' : tab.key)}
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 flex-shrink-0 text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
                isActive ? `${tab.bg} border-transparent shadow-xs` : tab.inactiveBg
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Mobile Filter Bottom Sheet Drawer */}
      <Drawer.Root
        open={isFilterDrawerOpen}
        onOpenChange={(open) => setIsFilterDrawerOpen(open)}
        shouldScaleBackground={false}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 max-h-[90dvh] flex flex-col bg-white dark:bg-neutral-900 rounded-t-[22px] z-[10000] outline-none shadow-2xl border-t border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-800">
              <div className="mx-auto w-12 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mb-3 cursor-grab" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                    Filter & Periode Penjualan
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Sesuaikan rentang tanggal dan kriteria pesanan
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div data-vaul-no-drag className="p-4 space-y-4 overflow-y-auto flex-1 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
              {/* Date Range Picker Section */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 block">
                  Rentang Tanggal
                </label>
                <div className="w-full">
                  <DateRangePicker
                    startDate={globalStartDate}
                    endDate={globalEndDate}
                    presetLabel={globalDateLabel}
                    onChange={(start, end, label) => {
                      onDateChange(start, end, label);
                    }}
                  />
                </div>
              </div>

              {/* Channel Filter Section */}
              {channelList.length > 0 && setSelectedChannel && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 block">
                    Channel Penjualan
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedChannel('')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        !selectedChannel
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      Semua Channel
                    </button>
                    {channelList.map((ch) => {
                      const isSel = selectedChannel?.toLowerCase() === ch.name.toLowerCase();
                      return (
                        <button
                          key={ch.name}
                          type="button"
                          onClick={() => setSelectedChannel(isSel ? '' : ch.name)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            isSel
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {ch.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Logistics Filter Section */}
              {logisticsList.length > 0 && setSelectedLogistics && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 block">
                    Opsi Pengiriman
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedLogistics('')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        !selectedLogistics
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      Semua Ekspedisi
                    </button>
                    {logisticsList.map((lg) => {
                      const isSel = selectedLogistics?.toLowerCase() === lg.name.toLowerCase();
                      return (
                        <button
                          key={lg.name}
                          type="button"
                          onClick={() => setSelectedLogistics(isSel ? '' : lg.name)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            isSel
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {lg.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons inside Drawer */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetFilters();
                    setIsFilterDrawerOpen(false);
                  }}
                  className="flex-1 h-11 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="flex-1 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>Terapkan</span>
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
};
