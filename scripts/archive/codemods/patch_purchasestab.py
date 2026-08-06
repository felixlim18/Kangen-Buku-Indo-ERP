import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

target = r'''        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <p className="font-text text-\[10px\] tracking-\[0.14em\] uppercase text-\[#A6791E\] dark:text-amber-450 flex items-center gap-2">
              <span className="w-5 h-\[1px\] bg-\[#A6791E\] dark:bg-amber-450 inline-block"></span>
              Procurement · KangenBukuIndo
            </p>
            <h1 className="font-text font-bold text-2xl lg:text-3xl text-neutral-900 dark:text-neutral-150 tracking-tight">
              Purchase Orders
            </h1>
            <p className="text-xs lg:text-\[13px\] text-\[#7A6D62\] dark:text-neutral-400 max-w-lg">
              Kelola pembelian buku, penerimaan bertahap, dan rekonsiliasi sisa PO.
            </p>
          </div>'''

replacement = r'''        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <h1 className="font-text font-bold text-2xl lg:text-3xl text-neutral-900 dark:text-neutral-150 tracking-tight">
              Purchase Orders
            </h1>
          </div>'''

content = re.sub(target, replacement, content)

with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)

print("Done")
