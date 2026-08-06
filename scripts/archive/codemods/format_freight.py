import re

with open('src/components/FreightInTab.tsx', 'r') as f:
    content = f.read()

old1 = """                                                {po.supplierOrderNumber && (
                                                  <span className="inline-block px-1.5 py-0.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-numeric text-[9px] border border-neutral-200 dark:border-neutral-700 ml-2">
                                                    Ref: {po.supplierOrderNumber}
                                                  </span>
                                                )}"""

new1 = """                                                {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-numeric text-[9px] border border-neutral-200 dark:border-neutral-700 ml-2">
                                                    {po.supplierOrderNumber && <span>Order: <span className="font-bold text-indigo-600 dark:text-indigo-400">{po.supplierOrderNumber}</span></span>}
                                                    {po.supplierOrderNumber && po.supplierTrackingNumber && <span className="mx-0.5">;</span>}
                                                    {po.supplierTrackingNumber && <span>Resi: <span className="font-bold text-orange-600 dark:text-orange-400">{po.supplierTrackingNumber}</span></span>}
                                                  </span>
                                                )}"""

if old1 in content:
    content = content.replace(old1, new1)
    print("Replaced freight ref")
else:
    print("Could not find old1")

with open('src/components/FreightInTab.tsx', 'w') as f:
    f.write(content)
