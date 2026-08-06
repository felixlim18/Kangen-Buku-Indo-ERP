import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

# 1. Add state variables
state_target = r"  // Applied Advanced Filter values\n  const \[appliedStartDate, setAppliedStartDate\] = useState\(''\);"
state_replacement = r"""  // Global Date Filter
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');
  const [globalDateLabel, setGlobalDateLabel] = useState<'Custom' | 'Current Month' | 'All'>('All');

  // Applied Advanced Filter values
  const [appliedStartDate, setAppliedStartDate] = useState('');"""
content = re.sub(state_target, state_replacement, content)

# 2. Add dateFilteredOrders and update statusFiltered
filter_target = r"  // 1\. Filter by Active Filter Tab \(Status row selector\)\n  const statusFiltered = orders\.filter\(\(order\) => {"
filter_replacement = r"""  // 0. Filter by Global Date Filter (Before cards and status tab)
  const dateFilteredOrders = useMemo(() => {
    return orders.filter(order => {
      const orderDateMs = order.orderDate?.seconds ? order.orderDate.seconds * 1000 : 0;
      if (!orderDateMs) return true;

      if (globalStartDate) {
        const startMs = new Date(globalStartDate).setHours(0, 0, 0, 0);
        if (orderDateMs < startMs) return false;
      }
      if (globalEndDate) {
        const endMs = new Date(globalEndDate).setHours(23, 59, 59, 999);
        if (orderDateMs > endMs) return false;
      }
      return true;
    });
  }, [orders, globalStartDate, globalEndDate]);

  // 1. Filter by Active Filter Tab (Status row selector)
  const statusFiltered = dateFilteredOrders.filter((order) => {"""
content = re.sub(filter_target, filter_replacement, content)

# 3. Add UI and update cards to use dateFilteredOrders
ui_target = r'''      \{\/\* 2\. TOP RIBBON SELECTOR \(REDESIGN KARTU STATISTIK\) \*\/\}\n      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 self-start w-full">'''
ui_replacement = r'''      {/* 1.5 GLOBAL DATE FILTER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={globalStartDate}
            onChange={(e) => {
              setGlobalStartDate(e.target.value);
              setGlobalDateLabel('Custom');
            }}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-[#2b5a9e] focus:border-[#2b5a9e] text-neutral-800 dark:text-neutral-100"
          />
          <span className="text-neutral-500 font-medium">-</span>
          <input
            type="date"
            value={globalEndDate}
            onChange={(e) => {
              setGlobalEndDate(e.target.value);
              setGlobalDateLabel('Custom');
            }}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-[#2b5a9e] focus:border-[#2b5a9e] text-neutral-800 dark:text-neutral-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
              const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
              const pad = (n: number) => n.toString().padStart(2, '0');
              setGlobalStartDate(`${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`);
              setGlobalEndDate(`${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`);
              setGlobalDateLabel('Current Month');
            }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors border ${
              globalDateLabel === 'Current Month'
                ? 'bg-[#2b5a9e]/10 border-[#2b5a9e]/30 text-[#2b5a9e] dark:bg-[#2b5a9e]/20 dark:border-[#2b5a9e]/50 dark:text-[#6a9eeb]'
                : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            Bulan Ini
          </button>
          <button
            type="button"
            onClick={() => {
              setGlobalStartDate('');
              setGlobalEndDate('');
              setGlobalDateLabel('All');
            }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors border ${
              globalDateLabel === 'All'
                ? 'bg-[#2b5a9e]/10 border-[#2b5a9e]/30 text-[#2b5a9e] dark:bg-[#2b5a9e]/20 dark:border-[#2b5a9e]/50 dark:text-[#6a9eeb]'
                : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            Semua
          </button>
        </div>
      </div>

      {/* 2. TOP RIBBON SELECTOR (REDESIGN KARTU STATISTIK) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 self-start w-full">'''
content = re.sub(ui_target, ui_replacement, content)

# 4. update orders to dateFilteredOrders in the map body
map_target = r'''          let count = 0;
          if \(tab === 'Semua'\) count = orders\.length;
          else if \(tab === 'Menunggu'\) count = orders\.filter\(o => o\.status === 'draft'\)\.length;
          else if \(tab === 'Dikirim'\) count = orders\.filter\(o => o\.status === 'shipped' \|\| o\.status === 'confirmed'\)\.length;
          else if \(tab === 'Return'\) count = orders\.filter\(o => o\.status === 'returned'\)\.length;
          else if \(tab === 'Berhasil'\) count = orders\.filter\(o => o\.status === 'completed'\)\.length;
          else if \(tab === 'Cancel'\) count = orders\.filter\(o => o\.status === 'cancelled'\)\.length;

          const isActive = activeFilterTab === tab;

          return \(
            <button
              key=\{tab\}
              onClick=\{\(\) => \{
                setActiveFilterTab\(tab\);
                setExpandedOrderId\(null\);
                setCurrentPage\(1\);
              \}\}
              className=\{`flex flex-col items-start p-4 rounded-xl border bg-white transition-all cursor-pointer text-left relative overflow-hidden \$\{
                isActive 
                  \? 'border-\[#2b5a9e\] border-2 shadow-sm' 
                  : 'border-\[#e4e9f1\] border hover:border-neutral-300'
              \}`\}
              style=\{isActive \? \{ padding: '15px' \} : \{\}\} \/\/ Adjust padding to compensate for 2px border vs 1px border so height stays stable
            >
              <div className=\{`font-\['Inter'\] font-bold text-\[28px\] leading-none mb-1 \$\{isActive \? 'text-\[#2b5a9e\]' : 'text-\[#1c2431\]'\}`\}>
                \{count\}
              <\/div>
              <div className="font-\['Lexend'\] font-semibold text-\[13px\] text-\[#5f6b7d\] tracking-tight">
                \{label\}
              <\/div>
              \{tab === 'Menunggu' && \(
                <div className="font-\['Inter'\] font-medium text-\[12px\] text-\[#9aa4b2\] mt-1 whitespace-nowrap">
                  \{formatNTD\(orders\.filter\(o => o\.status === 'draft'\)\.reduce\(\(sum, order\) => sum \+ \(order\.totalPrice \|\| 0\), 0\)\)\} menunggu
                <\/div>
              \)\}'''

map_replacement = r'''          let count = 0;
          if (tab === 'Semua') count = dateFilteredOrders.length;
          else if (tab === 'Menunggu') count = dateFilteredOrders.filter(o => o.status === 'draft').length;
          else if (tab === 'Dikirim') count = dateFilteredOrders.filter(o => o.status === 'shipped' || o.status === 'confirmed').length;
          else if (tab === 'Return') count = dateFilteredOrders.filter(o => o.status === 'returned').length;
          else if (tab === 'Berhasil') count = dateFilteredOrders.filter(o => o.status === 'completed').length;
          else if (tab === 'Cancel') count = dateFilteredOrders.filter(o => o.status === 'cancelled').length;

          const isActive = activeFilterTab === tab;

          return (
            <button
              key={tab}
              onClick={() => {
                setActiveFilterTab(tab);
                setExpandedOrderId(null);
                setCurrentPage(1);
              }}
              className={`flex flex-col items-start p-4 rounded-xl border bg-white transition-all cursor-pointer text-left relative overflow-hidden ${
                isActive 
                  ? 'border-[#2b5a9e] border-2 shadow-sm' 
                  : 'border-[#e4e9f1] border hover:border-neutral-300'
              }`}
              style={isActive ? { padding: '15px' } : {}} // Adjust padding to compensate for 2px border vs 1px border so height stays stable
            >
              <div className={`font-['Inter'] font-bold text-[28px] leading-none mb-1 ${isActive ? 'text-[#2b5a9e]' : 'text-[#1c2431]'}`}>
                {count}
              </div>
              <div className="font-['Lexend'] font-semibold text-[13px] text-[#5f6b7d] tracking-tight">
                {label}
              </div>
              {tab === 'Menunggu' && (
                <div className="font-['Inter'] font-medium text-[12px] text-[#9aa4b2] mt-1 whitespace-nowrap">
                  {formatNTD(dateFilteredOrders.filter(o => o.status === 'draft').reduce((sum, order) => sum + (order.totalPrice || 0), 0))} menunggu
                </div>
              )}'''

content = re.sub(map_target, map_replacement, content)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)
print("done")
