import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

# Replace the grid div
start_marker = '<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-6 border-b border-[#E7E1D3]/50 dark:border-neutral-800 font-text">'
end_marker = '{/* SECTION 2: DAFTAR BUKU */}'

if start_marker in content and end_marker in content:
    idx_start = content.find(start_marker)
    idx_end = content.find(end_marker, idx_start)
    
    old_section = content[idx_start:idx_end]
    
    new_section = """<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-6 border-b border-[#E7E1D3]/50 dark:border-neutral-800 font-text">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Platform Belanja *</label>
                    <select
                      value={platformId}
                      disabled={isPoViewOnly}
                      onChange={(e) => setPlatformId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text"
                    >
                      <option value="">-- PILIH PLATFORM --</option>
                      {platforms.map(p => (
                        <option key={p.id} value={p.id}>{p.name} [{p.currency}]</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="relative font-text">
                    <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 flex items-center justify-between font-text">
                      <span>Kurs FX (Mata Uang &rarr; NTD)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-[#B7B0A3] dark:text-neutral-500">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type="text"
                        disabled
                        value={
                          platformId 
                            ? `${Number(currentFXRate).toFixed(5).replace(/\\.?0+$/, '')} ${rateFetchStatus === 'success' ? '[Live]' : '[Saved]'}`
                            : '--'
                        }
                        className="w-full pl-9 pr-3 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-800 bg-[#F7F3EA]/30 dark:bg-neutral-950 rounded-lg text-[#8A857D] dark:text-neutral-400 font-numeric font-bold cursor-not-allowed select-none"
                      />
                    </div>
                    {platformId && (
                      <p className="text-[10px] text-[#B7B0A3] dark:text-neutral-500 mt-1 font-numeric">
                        1 {selectedPlatform?.currency || 'Mata Uang'} &asymp; {formatNTD(Math.round(currentFXRate * 100))}
                      </p>
                    )}
                    {platformId && rateFetchStatus === 'failed' && (
                      <div className="mt-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 uppercase tracking-wider animate-pulse font-text">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        Gagal update real-time, memakai kurs tersimpan
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Status Pembayaran *</label>
                  <select
                    value={poPaymentStatus}
                    disabled={isPoViewOnly}
                    onChange={(e) => setPoPaymentStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text"
                  >
                    <option value="paid">Lunas Langsung (Cash)</option>
                    <option value="unpaid">Belum Dibayar (Kredit/Utang)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Nomor Pembelian *</label>
                  <input
                    type="text"
                    required
                    disabled={isPoViewOnly}
                    placeholder="Contoh: ID-9080-X"
                    value={supplierOrderNumber}
                    onChange={(e) => setSupplierOrderNumber(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text ${
                      shakeFields['supplierOrderNumber']
                        ? 'border-red-500 ring-2 ring-red-500 animate-shake'
                        : 'border-[#E7E1D3] dark:border-neutral-700'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Nomor Resi *</label>
                  <input
                    type="text"
                    required
                    disabled={isPoViewOnly}
                    placeholder="Contoh: JP-992923"
                    value={supplierTrackingNumber}
                    onChange={(e) => setSupplierTrackingNumber(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text ${
                      shakeFields['supplierTrackingNumber']
                        ? 'border-red-500 ring-2 ring-red-500 animate-shake'
                        : 'border-[#E7E1D3] dark:border-neutral-700'
                    }`}
                  />
                </div>
              </div>
              """
    content = content.replace(old_section, new_section)
    print("Replaced!")
else:
    print("Markers not found")
    
with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)

