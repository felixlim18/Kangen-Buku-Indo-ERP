import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatNumber } from '../lib/decimal-utils';
import { formatDate } from '../lib/date-utils';
import { Calendar, TrendingUp, TrendingDown, RefreshCw, BarChart2 } from 'lucide-react';

export default function DailyReportTab() {
  const [loading, setLoading] = useState(true);
  const [journals, setJournals] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

  // Toggle states for the Financial Chart
  const [showRev, setShowRev] = useState(true);
  const [showExp, setShowExp] = useState(true);
  const [showNet, setShowNet] = useState(true);
  const [showGrowth, setShowGrowth] = useState(false);

  // Toggle states for the Operational Chart
  const [showSales, setShowSales] = useState(true);
  const [showPurchase, setShowPurchase] = useState(true);
  const [showSalesQty, setShowSalesQty] = useState(true);
  const [showPurchaseQty, setShowPurchaseQty] = useState(true);

  useEffect(() => {
    const unsubJ = onSnapshot(collection(db, 'journalEntries'), (snap) => {
      setJournals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.error('Error fetching journals:', error);
      setLoading(false);
    });

    const unsubS = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      setSalesOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error('Error fetching sales:', error));

    const unsubP = onSnapshot(collection(db, 'purchaseOrders'), (snap) => {
      setPurchaseOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error('Error fetching purchases:', error));

    return () => {
      unsubJ();
      unsubS();
      unsubP();
    };
  }, []);

  const { chartData, metrics } = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const sixtyDaysAgo = new Date(thirtyDaysAgo);
    sixtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    sixtyDaysAgo.setHours(0, 0, 0, 0);

    const dayMap: Record<string, any> = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const mStr = `${formatDate(d)} (${dayNames[d.getDay()]})`;
      dayMap[iso] = {
        dateStr: mStr,
        fullIso: iso,
        rev: 0,
        exp: 0,
        net: 0,
        sales: 0,
        purchase: 0,
        salesQty: 0,
        purchaseQty: 0
      };
    }

    let revCurrent = 0;
    let expCurrent = 0;
    let revPrev = 0;
    let expPrev = 0;

    // Process Journals
    journals.forEach(j => {
      let entryDate: Date | null = null;
      if (j.date?.toDate) entryDate = j.date.toDate();
      else if (j.date?.seconds) entryDate = new Date(j.date.seconds * 1000);
      else if (j.date) entryDate = new Date(j.date);

      if (!entryDate) return;

      const iso = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}`;

      (j.lines || []).forEach((l: any) => {
        const code = String(l.accountCode || '');
        const debit = (l.debit || 0) / 100;
        const credit = (l.credit || 0) / 100;

        let isRev = false;
        let isExp = false;
        let val = 0;

        if (code.startsWith('4')) {
          isRev = true;
          val = credit - debit;
        } else if (code.startsWith('5') || code.startsWith('6')) {
          isExp = true;
          val = debit - credit;
        }

        if (val === 0) return;

        // Current 30 days
        if (entryDate >= thirtyDaysAgo && entryDate <= today) {
          if (isRev) revCurrent += val;
          if (isExp) expCurrent += val;
          
          if (dayMap[iso]) {
            if (isRev) dayMap[iso].rev += val;
            if (isExp) dayMap[iso].exp += val;
            dayMap[iso].net = dayMap[iso].rev - dayMap[iso].exp;
          }
        } 
        // Previous 30 days
        else if (entryDate >= sixtyDaysAgo && entryDate < thirtyDaysAgo) {
          if (isRev) revPrev += val;
          if (isExp) expPrev += val;
        }
      });
    });

    // Process Sales Orders
    salesOrders.forEach(so => {
      if (so.status === 'cancelled' || so.status === 'returned' || so.isDraft) return; // Exclude inactive orders
      
      let entryDate: Date | null = null;
      const dateVal = so.orderDate || so.createdAt;
      if (dateVal?.toDate) entryDate = dateVal.toDate();
      else if (dateVal?.seconds) entryDate = new Date(dateVal.seconds * 1000);
      else if (dateVal) entryDate = new Date(dateVal);
      
      if (!entryDate) return;
      
      if (entryDate >= thirtyDaysAgo && entryDate <= today) {
        const iso = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}`;
        if (dayMap[iso]) {
          dayMap[iso].sales += (so.totalPrice || so.subtotal || 0) / 100;
          dayMap[iso].salesQty += (so.items || []).reduce((acc: number, item: any) => acc + (Number(item.qty) || 0), 0);
        }
      }
    });

    // Process Purchase Orders
    purchaseOrders.forEach(po => {
      if (po.status === 'cancelled' || po.status === 'returned' || po.status === 'draft') return; // Exclude inactive orders

      let entryDate: Date | null = null;
      const dateVal = po.purchaseDate || po.createdAt;
      if (dateVal?.toDate) entryDate = dateVal.toDate();
      else if (dateVal?.seconds) entryDate = new Date(dateVal.seconds * 1000);
      else if (dateVal) entryDate = new Date(dateVal);
      
      if (!entryDate) return;

      if (entryDate >= thirtyDaysAgo && entryDate <= today) {
        const iso = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}`;
        if (dayMap[iso]) {
          dayMap[iso].purchase += (po.purchasePriceNTD || 0) / 100;
          dayMap[iso].purchaseQty += (po.items || []).reduce((acc: number, item: any) => acc + (Number(item.qty) || 0), 0);
        }
      }
    });

    const arr = Object.values(dayMap).map((d: any, i, fullArr) => {
      let growth = 0;
      if (i > 0 && fullArr[i - 1].rev > 0) {
        growth = ((d.rev - fullArr[i - 1].rev) / fullArr[i - 1].rev) * 100;
      }
      return { ...d, growth: parseFloat(growth.toFixed(1)) };
    });

    const netCurrent = revCurrent - expCurrent;
    const netPrev = revPrev - expPrev;

    const revGrowth = revPrev === 0 ? (revCurrent > 0 ? 100 : 0) : ((revCurrent - revPrev) / revPrev) * 100;
    const netGrowth = netPrev === 0 ? (netCurrent > 0 ? 100 : (netCurrent < 0 ? -100 : 0)) : ((netCurrent - netPrev) / Math.abs(netPrev)) * 100;

    return { 
      chartData: arr,
      metrics: { revCurrent, expCurrent, netCurrent, revGrowth, netGrowth }
    };
  }, [journals, salesOrders, purchaseOrders]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-neutral-500">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
        <p>Memuat Laporan Harian...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-text animate-fade-in p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-indigo-500" />
            Laporan Harian (30 Hari Terakhir)
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
            Analisis Revenue, Expense, dan Profitabilitas harian berdasarkan data live secara Real-Time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wider">Total Revenue</p>
          <h3 className="text-3xl font-numeric font-extrabold text-neutral-900 dark:text-white">NT$ {formatNumber(metrics.revCurrent)}</h3>
          <div className="flex items-center gap-1.5 mt-3">
            {metrics.revGrowth >= 0 ? (
              <span className="flex items-center text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-md">
                <TrendingUp className="h-3 w-3 mr-1" /> +{metrics.revGrowth.toFixed(1)}%
              </span>
            ) : (
              <span className="flex items-center text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-2 py-1 rounded-md">
                <TrendingDown className="h-3 w-3 mr-1" /> {metrics.revGrowth.toFixed(1)}%
              </span>
            )}
            <span className="text-[11px] text-neutral-400 font-medium">vs 30 hari sebelumnya</span>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wider">Total Expense</p>
          <h3 className="text-3xl font-numeric font-extrabold text-neutral-900 dark:text-white">NT$ {formatNumber(metrics.expCurrent)}</h3>
          <div className="mt-3">
            <span className="text-[11px] text-neutral-400 font-medium bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded-md">
              Mencakup Beban Pokok (HPP) & Operasional
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-indigo-600 dark:to-purple-800 rounded-2xl p-6 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-semibold text-white/80 mb-2 uppercase tracking-wider">Laba Bersih (Net Profit)</p>
          <h3 className="text-3xl font-numeric font-extrabold text-white">NT$ {formatNumber(metrics.netCurrent)}</h3>
          <div className="flex items-center gap-1.5 mt-3">
            {metrics.netGrowth >= 0 ? (
              <span className="flex items-center text-xs font-bold text-white bg-white/20 px-2 py-1 rounded-md backdrop-blur-sm">
                <TrendingUp className="h-3 w-3 mr-1" /> +{metrics.netGrowth.toFixed(1)}%
              </span>
            ) : (
              <span className="flex items-center text-xs font-bold text-white bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm">
                <TrendingDown className="h-3 w-3 mr-1" /> {metrics.netGrowth.toFixed(1)}%
              </span>
            )}
            <span className="text-[11px] text-white/70 font-medium">vs 30 hari sebelumnya</span>
          </div>
        </div>
      </div>

      {/* CHART 1: KEUANGAN */}
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Trend Harian (Keuangan)</h3>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowRev(!showRev)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${showRev ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showRev ? 'bg-emerald-500' : 'bg-neutral-400'}`} /> Revenue
            </button>
            <button onClick={() => setShowExp(!showExp)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${showExp ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showExp ? 'bg-rose-500' : 'bg-neutral-400'}`} /> Expense
            </button>
            <button onClick={() => setShowNet(!showNet)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${showNet ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showNet ? 'bg-indigo-500' : 'bg-neutral-400'}`} /> Laba Bersih
            </button>
            <button onClick={() => setShowGrowth(!showGrowth)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 border ${showGrowth ? 'border-amber-400 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showGrowth ? 'bg-amber-500' : 'bg-neutral-400'}`} /> Growth %
            </button>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(163, 163, 163, 0.15)" />
              <XAxis dataKey="dateStr" tick={{ fontSize: 12, fill: '#888' }} tickLine={false} axisLine={false} />
              
              <YAxis yAxisId="left" tickFormatter={(val) => `${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} tick={{ fontSize: 12, fill: '#888' }} tickLine={false} axisLine={false} />
              {showGrowth && <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `${val}%`} tick={{ fontSize: 12, fill: '#f59e0b' }} tickLine={false} axisLine={false} />}
              
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                formatter={(val: number, name: string) => {
                  if (name === 'Growth %') return [`${val}%`, name];
                  return [`NT$ ${formatNumber(val)}`, name];
                }}
                labelStyle={{ fontWeight: 'bold', color: '#6366f1' }}
              />
              
              {showRev && <Area yAxisId="left" type="monotone" name="Revenue" dataKey="rev" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />}
              {showExp && <Area yAxisId="left" type="monotone" name="Expense" dataKey="exp" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />}
              {showNet && <Area yAxisId="left" type="monotone" name="Laba Bersih" dataKey="net" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />}
              {showGrowth && <Area yAxisId="right" type="monotone" name="Growth %" dataKey="growth" stroke="#f59e0b" strokeWidth={2} fill="none" />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CHART 2: OPERASIONAL */}
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Trend Harian (Operasional Order)</h3>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowSales(!showSales)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 border ${showSales ? 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showSales ? 'bg-blue-500' : 'bg-neutral-400'}`} /> Sales (NT$)
            </button>
            <button onClick={() => setShowPurchase(!showPurchase)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 border ${showPurchase ? 'border-orange-400 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20' : 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showPurchase ? 'bg-orange-500' : 'bg-neutral-400'}`} /> Purchase (NT$)
            </button>
            <button onClick={() => setShowSalesQty(!showSalesQty)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 border ${showSalesQty ? 'border-cyan-400 text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20' : 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showSalesQty ? 'bg-cyan-500' : 'bg-neutral-400'}`} /> Sales Qty
            </button>
            <button onClick={() => setShowPurchaseQty(!showPurchaseQty)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 border ${showPurchaseQty ? 'border-fuchsia-400 text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/20' : 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800'}`}>
              <div className={`w-3 h-3 rounded-full ${showPurchaseQty ? 'bg-fuchsia-500' : 'bg-neutral-400'}`} /> Purchase Qty
            </button>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPurchase" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSalesQty" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPurchaseQty" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d946ef" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#d946ef" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(163, 163, 163, 0.15)" />
              <XAxis dataKey="dateStr" tick={{ fontSize: 12, fill: '#888' }} tickLine={false} axisLine={false} />
              
              <YAxis yAxisId="left" tickFormatter={(val) => `${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} tick={{ fontSize: 12, fill: '#888' }} tickLine={false} axisLine={false} />
              {(showSalesQty || showPurchaseQty) && <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `${val}`} tick={{ fontSize: 12, fill: '#f59e0b' }} tickLine={false} axisLine={false} />}
              
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                formatter={(val: number, name: string) => {
                  if (name === 'Sales Qty' || name === 'Purchase Qty') return [`${val} Buku`, name];
                  return [`NT$ ${formatNumber(val)}`, name];
                }}
                labelStyle={{ fontWeight: 'bold', color: '#6366f1' }}
              />
              
              {showSales && <Area yAxisId="left" type="monotone" name="Sales (NT$)" dataKey="sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />}
              {showPurchase && <Area yAxisId="left" type="monotone" name="Purchase (NT$)" dataKey="purchase" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorPurchase)" />}
              {showSalesQty && <Area yAxisId="right" type="monotone" name="Sales Qty" dataKey="salesQty" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorSalesQty)" />}
              {showPurchaseQty && <Area yAxisId="right" type="monotone" name="Purchase Qty" dataKey="purchaseQty" stroke="#d946ef" strokeWidth={2} fillOpacity={1} fill="url(#colorPurchaseQty)" />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
