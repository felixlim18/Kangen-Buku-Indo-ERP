import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

# Replace block 1 (Around line 3723)
old1 = """                          <div className="font-text text-[15px] font-bold text-neutral-900 dark:text-neutral-100 mt-1 flex items-baseline gap-1.5 flex-wrap">
                            <span>{platforms.find(p => p.id === po.supplierId)?.name || po.supplierName}</span>
                            {po.supplierOrderNumber && (
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const cleanCode = po.supplierOrderNumber.trim();
                                  try {
                                    await navigator.clipboard.writeText(cleanCode);
                                    setCopiedPoId(po.id);
                                    setTimeout(() => setCopiedPoId(null), 1000);
                                  } catch (err) {
                                    console.error("Gagal menyalin text: ", err);
                                  }
                                }}
                                className="inline-block hover:underline text-[#AB9F92] dark:text-neutral-500 font-text text-[11px] relative font-normal cursor-pointer"
                                title="Klik untuk menyalin"
                              >
                                {po.supplierOrderNumber}
                                {copiedPoId === po.id && (
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                    copied!
                                  </span>
                                )}
                              </button>
                            )}
                          </div>"""

new1 = """                          <div className="font-text text-[15px] font-bold text-neutral-900 dark:text-neutral-100 mt-1 flex items-baseline gap-1.5 flex-wrap">
                            <span>{platforms.find(p => p.id === po.supplierId)?.name || po.supplierName}</span>
                            
                            {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {po.supplierOrderNumber && (
                                  <>
                                    <span className="text-neutral-500 font-normal text-[12px]">No. Order :</span>
                                    <button 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const cleanCode = po.supplierOrderNumber.trim();
                                        try {
                                          await navigator.clipboard.writeText(cleanCode);
                                          setCopiedPoId(po.id + '_order');
                                          setTimeout(() => setCopiedPoId(null), 1000);
                                        } catch (err) {
                                          console.error("Gagal menyalin text: ", err);
                                        }
                                      }}
                                      className="inline-block hover:underline text-indigo-600 dark:text-indigo-400 font-text text-[12px] relative font-bold cursor-pointer"
                                      title="Klik untuk menyalin"
                                    >
                                      {po.supplierOrderNumber}
                                      {copiedPoId === po.id + '_order' && (
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                          copied!
                                        </span>
                                      )}
                                    </button>
                                  </>
                                )}
                                
                                {po.supplierOrderNumber && po.supplierTrackingNumber && (
                                  <span className="text-neutral-300 dark:text-neutral-600">;</span>
                                )}
                                
                                {po.supplierTrackingNumber && (
                                  <>
                                    <span className="text-neutral-500 font-normal text-[12px]">No. Resi :</span>
                                    <button 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const cleanCode = po.supplierTrackingNumber.trim();
                                        try {
                                          await navigator.clipboard.writeText(cleanCode);
                                          setCopiedPoId(po.id + '_tracking');
                                          setTimeout(() => setCopiedPoId(null), 1000);
                                        } catch (err) {
                                          console.error("Gagal menyalin text: ", err);
                                        }
                                      }}
                                      className="inline-block hover:underline text-orange-600 dark:text-orange-400 font-text text-[12px] relative font-bold cursor-pointer"
                                      title="Klik untuk menyalin"
                                    >
                                      {po.supplierTrackingNumber}
                                      {copiedPoId === po.id + '_tracking' && (
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                          copied!
                                        </span>
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>"""

# Replace block 2 (Around line 4381) - Table view
old2 = """                        <div className="text-center font-semibold text-neutral-800 dark:text-neutral-200 flex flex-col items-center justify-center text-center h-full min-h-[44px] px-2 select-text">
                          <span className="block font-bold">{platforms.find(p => p.id === po.supplierId)?.name || po.supplierName}</span>
                          {po.supplierOrderNumber && (
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                const cleanCode = po.supplierOrderNumber.trim();
                                try {
                                  await navigator.clipboard.writeText(cleanCode);
                                  setCopiedPoId(po.id);
                                  setTimeout(() => {
                                    setCopiedPoId(null);
                                  }, 1000);
                                } catch (err) {
                                  console.error("Gagal menyalin text: ", err);
                                }
                              }}
                              className="inline-block mt-0.5 hover:underline text-neutral-500 dark:text-neutral-400 font-numeric text-[10px] cursor-pointer text-center relative"
                              title="Klik untuk menyalin"
                            >
                              {po.supplierOrderNumber}
                              {copiedPoId === po.id && (
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                  copy!
                                </span>
                              )}
                            </button>
                          )}
                        </div>"""

new2 = """                        <div className="text-center font-semibold text-neutral-800 dark:text-neutral-200 flex flex-col items-center justify-center text-center h-full min-h-[44px] px-2 select-text">
                          <span className="block font-bold">{platforms.find(p => p.id === po.supplierId)?.name || po.supplierName}</span>
                          
                          {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                            <div className="flex flex-col items-center gap-0.5 mt-0.5">
                              {po.supplierOrderNumber && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-normal text-neutral-400">Order:</span>
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const cleanCode = po.supplierOrderNumber.trim();
                                      try {
                                        await navigator.clipboard.writeText(cleanCode);
                                        setCopiedPoId(po.id + '_order');
                                        setTimeout(() => setCopiedPoId(null), 1000);
                                      } catch (err) {
                                        console.error("Gagal menyalin text: ", err);
                                      }
                                    }}
                                    className="inline-block hover:underline text-indigo-600 dark:text-indigo-400 font-numeric text-[10px] cursor-pointer text-center relative font-bold"
                                    title="Klik untuk menyalin"
                                  >
                                    {po.supplierOrderNumber}
                                    {copiedPoId === po.id + '_order' && (
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                        copied!
                                      </span>
                                    )}
                                  </button>
                                </div>
                              )}
                              
                              {po.supplierTrackingNumber && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-normal text-neutral-400">Resi:</span>
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const cleanCode = po.supplierTrackingNumber.trim();
                                      try {
                                        await navigator.clipboard.writeText(cleanCode);
                                        setCopiedPoId(po.id + '_tracking');
                                        setTimeout(() => setCopiedPoId(null), 1000);
                                      } catch (err) {
                                        console.error("Gagal menyalin text: ", err);
                                      }
                                    }}
                                    className="inline-block hover:underline text-orange-600 dark:text-orange-400 font-numeric text-[10px] cursor-pointer text-center relative font-bold"
                                    title="Klik untuk menyalin"
                                  >
                                    {po.supplierTrackingNumber}
                                    {copiedPoId === po.id + '_tracking' && (
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                        copied!
                                      </span>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>"""


if old1 in content:
    content = content.replace(old1, new1)
    print("Replaced old1")
else:
    print("Could not find old1")

if old2 in content:
    content = content.replace(old2, new2)
    print("Replaced old2")
else:
    print("Could not find old2")

# Also fix the tasksHistoryPOs and active tasks
old_task1 = """                      {po.supplierOrderNumber && (
                         <p className="font-numeric text-[10px] text-neutral-500">Ref: {po.supplierOrderNumber}</p>
                      )}"""

new_task1 = """                      {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                        <p className="font-text text-[10px] text-neutral-500">
                          {po.supplierOrderNumber && <span>Order: <span className="font-numeric text-indigo-600 dark:text-indigo-400 font-bold">{po.supplierOrderNumber}</span></span>}
                          {po.supplierOrderNumber && po.supplierTrackingNumber && <span className="mx-1">;</span>}
                          {po.supplierTrackingNumber && <span>Resi: <span className="font-numeric text-orange-600 dark:text-orange-400 font-bold">{po.supplierTrackingNumber}</span></span>}
                        </p>
                      )}"""

content = content.replace(old_task1, new_task1)
print("Replaced task refs")

with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)

