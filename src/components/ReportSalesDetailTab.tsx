import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { SalesOrder, OrderTypeConfig, ChannelConfig } from '../types';
import { formatNTD, formatNumber } from '../lib/decimal-utils';
import { DateRangePicker } from './ui/DateRangePicker';
import { 
  BarChart3, 
  Calendar, 
  ShoppingBag, 
  Hash, 
  TrendingUp, 
  TrendingDown, 
  Globe, 
  Layers,
  ArrowRight,
  Sparkles,
  ChevronRight
} from 'lucide-react';

const DEFAULT_CHANNELS = ['WhatsApp', 'Shopee', 'Messenger', 'Instagram', 'LINE', 'Website'];
const DEFAULT_ORDER_TYPES = ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Shopee Ads', 'Tokopedia Ads'];

export const ReportSalesDetailTab: React.FC = () => {
  // --------------------------------------------------------
  // 1. States & Database Sync
  // --------------------------------------------------------
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Unified Date Range Picker states
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    return new Date();
  });
  const [presetLabel, setPresetLabel] = useState('Bulan Ini');

  useEffect(() => {
    // 1. Subscribe to completed Sales Orders
    const unsubOrders = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const list: SalesOrder[] = [];
      snap.forEach((d) => {
        const order = d.data() as SalesOrder;
        // Only include completed/closed orders
        if (order.status === 'completed') {
          list.push({ id: d.id, ...order });
        }
      });
      setOrders(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading sales orders in reports:", err);
      setLoading(false);
    });

    // 2. Subscribe to categories for custom Channels and Type Orders
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      const typesList: OrderTypeConfig[] = [];
      const channelsList: ChannelConfig[] = [];
      
      snap.forEach((d) => {
        const item = d.data();
        if (d.id.startsWith('config_type_')) {
          typesList.push({ id: d.id, name: item.name } as OrderTypeConfig);
        } else if (d.id.startsWith('config_channel_')) {
          channelsList.push({ id: d.id, name: item.name } as ChannelConfig);
        }
      });

      setOrderTypes(typesList);
      setChannels(channelsList);
    }, (err) => {
      console.error("Error loading categories in reports:", err);
    });

    return () => {
      unsubOrders();
      unsubCategories();
    };
  }, []);

  // --------------------------------------------------------
  // 2. Resolve Active List of Configurations
  // --------------------------------------------------------
  const resolvedChannels = useMemo(() => {
    return channels.length > 0 
      ? channels 
      : DEFAULT_CHANNELS.map((name, idx) => ({ id: `default_channel_${idx}`, name }));
  }, [channels]);

  const resolvedOrderTypes = useMemo(() => {
    return orderTypes.length > 0 
      ? orderTypes 
      : DEFAULT_ORDER_TYPES.map((name, idx) => ({ id: `default_type_${idx}`, name }));
  }, [orderTypes]);

  // --------------------------------------------------------
  // 3. Compute Dates for Current and Comparative Period
  // --------------------------------------------------------
  const periodRanges = useMemo(() => {
    let currStart = startDate ? new Date(startDate) : null;
    let currEnd = endDate ? new Date(endDate) : null;

    let prevStartDate = new Date();
    let prevEndDate = new Date();
    let periodLabel = '';
    let prevPeriodLabel = '';

    if (currStart && currEnd) {
      currStart.setHours(0, 0, 0, 0);
      currEnd.setHours(23, 59, 59, 999);

      const durationMs = currEnd.getTime() - currStart.getTime() + 24 * 60 * 60 * 1000;
      
      prevEndDate = new Date(currStart.getTime() - 1);
      prevStartDate = new Date(currStart.getTime() - durationMs);

      const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      periodLabel = `${formatter.format(currStart)} - ${formatter.format(currEnd)}`;
      prevPeriodLabel = `${formatter.format(prevStartDate)} - ${formatter.format(prevEndDate)}`;
    } else {
      // "Semua" - No date bounds
      currStart = new Date(1970, 0, 1);
      currEnd = new Date(2100, 11, 31);
      prevStartDate = new Date(1970, 0, 1);
      prevEndDate = new Date(1970, 0, 1);
      periodLabel = 'Semua Periode';
      prevPeriodLabel = 'Tidak ada periode pembanding';
    }

    return {
      startDate: currStart,
      endDate: currEnd,
      prevStartDate,
      prevEndDate,
      periodLabel,
      prevPeriodLabel
    };
  }, [startDate, endDate]);

  // Helper to parse Firestore Timestamp or date standard
  const getOrderDate = (order: SalesOrder): Date => {
    if (!order.orderDate) return new Date(order.createdAt?.seconds * 1000 || Date.now());
    if (order.orderDate.seconds !== undefined) {
      return new Date(order.orderDate.seconds * 1000);
    }
    return new Date(order.orderDate);
  };

  // Filter completed orders in memory for efficiency & exact math
  const { currentPeriodOrders, prevPeriodOrders } = useMemo(() => {
    const curr: SalesOrder[] = [];
    const prev: SalesOrder[] = [];

    orders.forEach(order => {
      const orderDate = getOrderDate(order);
      if (orderDate >= periodRanges.startDate && orderDate <= periodRanges.endDate) {
        curr.push(order);
      } else if (orderDate >= periodRanges.prevStartDate && orderDate <= periodRanges.prevEndDate) {
        prev.push(order);
      }
    });

    return {
      currentPeriodOrders: curr,
      prevPeriodOrders: prev
    };
  }, [orders, periodRanges]);

  // --------------------------------------------------------
  // 4. Compute Top-level Grand Totals (Summary Cards)
  // --------------------------------------------------------
  const grandTotals = useMemo(() => {
    // Current period
    let totalNominalCents = 0;
    let totalQty = 0;
    let countSO = currentPeriodOrders.length;

    currentPeriodOrders.forEach(order => {
      totalNominalCents += order.totalPrice || 0;
      if (order.items) {
        order.items.forEach(item => {
          totalQty += item.qty || 0;
        });
      }
    });

    // Previous period
    let prevTotalNominalCents = 0;
    let prevTotalQty = 0;
    let prevCountSO = prevPeriodOrders.length;

    prevPeriodOrders.forEach(order => {
      prevTotalNominalCents += order.totalPrice || 0;
      if (order.items) {
        order.items.forEach(item => {
          prevTotalQty += item.qty || 0;
        });
      }
    });

    return {
      current: {
        nominalCents: totalNominalCents,
        qty: totalQty,
        countSO
      },
      prev: {
        nominalCents: prevTotalNominalCents,
        qty: prevTotalQty,
        countSO: prevCountSO
      }
    };
  }, [currentPeriodOrders, prevPeriodOrders]);

  // --------------------------------------------------------
  // 5. Aggregate Sales Breakdown by Channel
  // --------------------------------------------------------
  const channelBreakdown = useMemo(() => {
    const data = resolvedChannels.map(channel => {
      const channelNameLower = (channel.name || '').toLowerCase().trim();

      // Current Period aggregates
      let totalNominalCents = 0;
      let totalQty = 0;
      let countSO = 0;

      currentPeriodOrders.forEach(order => {
        const orderChannel = (order.platformChannel || '').toLowerCase().trim();
        if (orderChannel === channelNameLower) {
          totalNominalCents += order.totalPrice || 0;
          countSO += 1;
          if (order.items) {
            order.items.forEach(item => {
              totalQty += item.qty || 0;
            });
          }
        }
      });

      // Previous Period aggregates for comparative subline
      let prevTotalNominalCents = 0;
      currentPeriodOrders.forEach(order => {
        // Just calculating for previous to compare Total Nominal
      });
      prevPeriodOrders.forEach(order => {
        const orderChannel = (order.platformChannel || '').toLowerCase().trim();
        if (orderChannel === channelNameLower) {
          prevTotalNominalCents += order.totalPrice || 0;
        }
      });

      return {
        id: channel.id,
        name: channel.name,
        totalNominalCents,
        totalQty,
        countSO,
        prevTotalNominalCents
      };
    });

    // Sort by Total Nominal descending
    return data.sort((a, b) => b.totalNominalCents - a.totalNominalCents);
  }, [resolvedChannels, currentPeriodOrders, prevPeriodOrders]);

  // --------------------------------------------------------
  // 6. Aggregate Sales Breakdown by Type Order
  // --------------------------------------------------------
  const typeOrderBreakdown = useMemo(() => {
    const data = resolvedOrderTypes.map(typeOrder => {
      const typeNameLower = (typeOrder.name || '').toLowerCase().trim();

      // Current Period aggregates
      let totalNominalCents = 0;
      let totalQty = 0;
      let countSO = 0;

      currentPeriodOrders.forEach(order => {
        const orderType = (order.orderType || '').toLowerCase().trim();
        if (orderType === typeNameLower) {
          totalNominalCents += order.totalPrice || 0;
          countSO += 1;
          if (order.items) {
            order.items.forEach(item => {
              totalQty += item.qty || 0;
            });
          }
        }
      });

      // Previous Period aggregates for comparative subline
      let prevTotalNominalCents = 0;
      prevPeriodOrders.forEach(order => {
        const orderType = (order.orderType || '').toLowerCase().trim();
        if (orderType === typeNameLower) {
          prevTotalNominalCents += order.totalPrice || 0;
        }
      });

      return {
        id: typeOrder.id,
        name: typeOrder.name,
        totalNominalCents,
        totalQty,
        countSO,
        prevTotalNominalCents
      };
    });

    // Sort by Total Nominal descending
    return data.sort((a, b) => b.totalNominalCents - a.totalNominalCents);
  }, [resolvedOrderTypes, currentPeriodOrders, prevPeriodOrders]);

  // Comparative trend rendering helpers
  const renderComparativeTrend = (curr: number, prev: number, isCurrency: boolean = false) => {
    if (prev === 0) {
      return (
        <span className="text-[10px] text-neutral-400 font-medium">
          {isCurrency ? formatNTD(0) : '0'} (periode lalu)
        </span>
      );
    }

    const pctDiff = ((curr - prev) / prev) * 100;
    const isUp = pctDiff >= 0;

    return (
      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-neutral-450 dark:text-neutral-500">
        <span>Periode Lalu: <strong className="font-numeric">{isCurrency ? formatNTD(prev) : formatNumber(prev)}</strong></span>
        <span className={`inline-flex items-center font-semibold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-505 dark:text-rose-400'}`}>
          {isUp ? <TrendingUp className="h-3 w-3 mr-0.5 inline" /> : <TrendingDown className="h-3 w-3 mr-0.5 inline" />}
          {isUp ? '+' : ''}{pctDiff.toFixed(1)}%
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" id="report-sales-view">
      {/* 1. Header and Quick Filter Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-550/10 rounded-xl text-indigo-550 dark:text-indigo-400">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-neutral-850 dark:text-white">Rincian Penjualan</h1>
            <p className="text-xs text-neutral-450 dark:text-neutral-400 mt-0.5">
              Analisis performa penjualan terfilter berdasarkan Channel dan Tipe Order
            </p>
          </div>
        </div>

        {/* Filters and mode switcher */}
        <div className="flex items-center gap-3 self-stretch md:self-auto">
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
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          <p className="text-xs text-neutral-450 dark:text-neutral-400 mt-3 font-semibold">Mengambil Data Penjualan...</p>
        </div>
      ) : (
        <>
          {/* 2. Grand Total Overview Summary Cards */}
          <div className="space-y-3" id="grand-total-summary">
            <h3 className="text-xs font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-widest pl-1">
              TOTAL KESELURUHAN ({periodRanges.periodLabel})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Grand Total Nominal */}
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total Nominal</span>
                  <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mt-1 font-numeric text-indigo-600 dark:text-indigo-400">
                    {formatNTD(grandTotals.current.nominalCents)}
                  </h2>
                  {renderComparativeTrend(grandTotals.current.nominalCents, grandTotals.prev.nominalCents, true)}
                </div>
                <div className="h-11 w-11 rounded-lg bg-indigo-550/10 text-indigo-550 dark:text-indigo-400 flex items-center justify-center">
                  <ShoppingBag className="h-5 w-5" />
                </div>
              </div>

              {/* Grand Total Qty */}
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total Qty Terjual</span>
                  <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mt-1 font-numeric text-emerald-600 dark:text-emerald-400">
                    {formatNumber(grandTotals.current.qty)} <span className="text-xs font-text text-neutral-500">Unit</span>
                  </h2>
                  {renderComparativeTrend(grandTotals.current.qty, grandTotals.prev.qty, false)}
                </div>
                <div className="h-11 w-11 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Hash className="h-5 w-5" />
                </div>
              </div>

              {/* Grand Total Count SO */}
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Jumlah Transaksi SO</span>
                  <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mt-1 font-numeric text-amber-600 dark:text-amber-400">
                    {formatNumber(grandTotals.current.countSO)} <span className="text-xs font-text text-neutral-500">Order</span>
                  </h2>
                  {renderComparativeTrend(grandTotals.current.countSO, grandTotals.prev.countSO, false)}
                </div>
                <div className="h-11 w-11 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Breakdown Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Column 1: By Channel */}
            <div className="space-y-4" id="breakdown-by-channel">
              <div className="flex items-center gap-2 pl-1">
                <Globe className="h-4.5 w-4.5 text-indigo-500" />
                <h3 className="text-xs font-bold text-neutral-450 dark:text-neutral-400 uppercase tracking-widest">
                  Analisis Berdasarkan Channel
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {channelBreakdown.map((item) => (
                  <div 
                    key={item.id} 
                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4.5 shadow-2xs hover:shadow-xs transition duration-250 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{item.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 font-semibold font-numeric">
                          {item.countSO} SO
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-neutral-850 dark:text-neutral-150 mt-2 font-numeric">
                        {formatNTD(item.totalNominalCents)}
                      </h4>
                      <p className="text-[10px] text-neutral-450 dark:text-neutral-500 mt-0.5">
                        Qty Terjual: <span className="font-numeric font-medium">{formatNumber(item.totalQty)} unit</span>
                      </p>
                    </div>
                    
                    <div className="border-t border-neutral-100 dark:border-neutral-800/60 mt-3 pt-2.5">
                      {renderComparativeTrend(item.totalNominalCents, item.prevTotalNominalCents, true)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: By Type Order */}
            <div className="space-y-4" id="breakdown-by-type">
              <div className="flex items-center gap-2 pl-1">
                <Layers className="h-4.5 w-4.5 text-emerald-500" />
                <h3 className="text-xs font-bold text-neutral-450 dark:text-neutral-400 uppercase tracking-widest">
                  Analisis Berdasarkan Sumber Order
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {typeOrderBreakdown.map((item) => (
                  <div 
                    key={item.id} 
                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4.5 shadow-2xs hover:shadow-xs transition duration-250 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{item.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 font-semibold font-numeric">
                          {item.countSO} SO
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-neutral-850 dark:text-neutral-150 mt-2 font-numeric">
                        {formatNTD(item.totalNominalCents)}
                      </h4>
                      <p className="text-[10px] text-neutral-450 dark:text-neutral-500 mt-0.5">
                        Qty Terjual: <span className="font-numeric font-medium">{formatNumber(item.totalQty)} unit</span>
                      </p>
                    </div>

                    <div className="border-t border-neutral-100 dark:border-neutral-800/60 mt-3 pt-2.5">
                      {renderComparativeTrend(item.totalNominalCents, item.prevTotalNominalCents, true)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
