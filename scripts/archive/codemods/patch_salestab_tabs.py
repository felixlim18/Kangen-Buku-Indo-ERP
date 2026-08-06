import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

old_ribbon = r'''      \{\/\* 2\. TOP RIBBON SELECTOR \*\/\}.*?      <\/div>'''

new_ribbon = r'''      {/* 2. TOP RIBBON SELECTOR (REDESIGN KARTU STATISTIK) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 self-start w-full">
        {(['Semua', 'Menunggu', 'Dikirim', 'Return', 'Berhasil', 'Cancel'] as const).map((tab) => {
          const label = tab === 'Berhasil' ? 'Selesai' : tab;
          let count = 0;
          if (tab === 'Semua') count = orders.length;
          else if (tab === 'Menunggu') count = orders.filter(o => o.status === 'draft').length;
          else if (tab === 'Dikirim') count = orders.filter(o => o.status === 'shipped' || o.status === 'confirmed').length;
          else if (tab === 'Return') count = orders.filter(o => o.status === 'returned').length;
          else if (tab === 'Berhasil') count = orders.filter(o => o.status === 'completed').length;
          else if (tab === 'Cancel') count = orders.filter(o => o.status === 'cancelled').length;

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
                  : 'border-[#e4e9f1] border-1 hover:border-neutral-300'
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
                  {formatNTD(orders.filter(o => o.status === 'draft').reduce((sum, order) => sum + (order.totalPrice || 0), 0))} menunggu
                </div>
              )}
            </button>
          );
        })}
      </div>'''

content = re.sub(old_ribbon, new_ribbon, content, flags=re.DOTALL)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)

print("Patched!")
