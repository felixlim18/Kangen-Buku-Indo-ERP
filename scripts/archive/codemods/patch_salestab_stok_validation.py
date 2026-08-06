import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

target = r'''                          \{\(order\.status === 'draft' \|\| !order\.status\) && isStaffValue \? \(
                            <>
                              <button
                                onClick=\{\(\) => \{
                                  setSelectedOrderForProses\(order\);
                                  setProsesOrderNo\(''\);
                                  setProsesResi\(''\);
                                  const d = new Date\(\);
                                  setProsesDate\(`\$\{d\.getFullYear\(\)\}-\$\{String\(d\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\)\}-\$\{String\(d\.getDate\(\)\)\.padStart\(2, '0'\)\}`\);
                                  setIsProsesConfirmOpen\(true\);
                                \}\}
                                className="w-24 h-7 text-\[10px\] sm:text-\[11px\] font-bold uppercase tracking-wider text-white rounded-lg transition cursor-pointer text-center flex items-center justify-center shadow-xs whitespace-nowrap hover:opacity-90"
                                style=\{\{ backgroundColor: '#2b5a9e' \}\}
                                title="Proses ke Gudang & Kirim"
                              >
                                Proses
                              </button>
                              <button'''

replacement = r'''                          {(order.status === 'draft' || !order.status) && isStaffValue ? (
                            <>
                              {(() => {
                                const insufficientItemsList = [];
                                for (const item of order.items || []) {
                                  const inv = inventories.find(i => i.bookId === item.bookId);
                                  const available = inv ? (inv.endingStock || 0) : 0;
                                  if (available < item.qty) {
                                    insufficientItemsList.push({name: item.bookName, stock: available, needed: item.qty});
                                  }
                                }
                                const isBlocked = insufficientItemsList.length > 0;
                                
                                return (
                                  <div className="relative group">
                                    <button
                                      onClick={() => {
                                        if (isBlocked) {
                                          safeAlert(`Stok fisik belum mencukupi untuk memproses order ini:\n\n${insufficientItemsList.map(it => `- ${it.name} (Tersedia ${it.stock}, Butuh ${it.needed})`).join('\n')}\n\nOrder harus menunggu barang masuk sebelum bisa diproses.`);
                                          return;
                                        }
                                        setSelectedOrderForProses(order);
                                        setProsesOrderNo('');
                                        setProsesResi('');
                                        const d = new Date();
                                        setProsesDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                                        setIsProsesConfirmOpen(true);
                                      }}
                                      className={`w-24 h-7 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white rounded-lg transition cursor-pointer text-center flex items-center justify-center shadow-xs whitespace-nowrap ${isBlocked ? 'bg-neutral-400 hover:bg-neutral-500' : 'hover:opacity-90'}`}
                                      style={!isBlocked ? { backgroundColor: '#2b5a9e' } : {}}
                                    >
                                      Proses
                                    </button>
                                    {isBlocked && (
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] sm:max-w-[250px] bg-neutral-900 text-white text-[10px] p-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-50">
                                        <div className="font-bold mb-1 text-rose-300">Stok Tidak Mencukupi</div>
                                        <div className="flex flex-col gap-1">
                                          {insufficientItemsList.map((it, idx) => (
                                            <div key={idx} className="truncate whitespace-normal leading-tight">
                                              • {it.name}: Tersedia <span className="font-numeric">{it.stock}</span>, Butuh <span className="font-numeric">{it.needed}</span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-neutral-900"></div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              <button'''

if re.search(target, content):
    content = re.sub(target, replacement, content)
    with open('src/components/SalesTab.tsx', 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Failed to find target")
