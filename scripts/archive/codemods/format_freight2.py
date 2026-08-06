import re

with open('src/components/FreightInTab.tsx', 'r') as f:
    content = f.read()

old1 = """                                              {po.supplierOrderNumber && (
                                                <div className="font-numeric text-[9px] text-neutral-400 mt-0.5">
                                                  Ref: {po.supplierOrderNumber}
                                                </div>
                                              )}"""

new1 = """                                              {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                                                <div className="font-text text-[9px] text-neutral-400 mt-0.5">
                                                  {po.supplierOrderNumber && <span>Order: <span className="font-numeric font-bold text-indigo-600 dark:text-indigo-400">{po.supplierOrderNumber}</span></span>}
                                                  {po.supplierOrderNumber && po.supplierTrackingNumber && <span className="mx-0.5">;</span>}
                                                  {po.supplierTrackingNumber && <span>Resi: <span className="font-numeric font-bold text-orange-600 dark:text-orange-400">{po.supplierTrackingNumber}</span></span>}
                                                </div>
                                              )}"""

if old1 in content:
    content = content.replace(old1, new1)
    print("Replaced freight ref")
else:
    print("Could not find old1")

with open('src/components/FreightInTab.tsx', 'w') as f:
    f.write(content)
