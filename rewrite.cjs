const fs = require('fs');

let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf-8');

const startLine = `<div className="kbi-so-field">\n                  <label className="kbi-so-label">Tanggal Pembelian *</label>`;
const endMarker = `              {/* RIGHT: Nama Buku / Barang */}`;

const sIdx = content.indexOf(startLine);
const eIdx = content.indexOf(endMarker);

if (sIdx === -1 || eIdx === -1) {
    console.log("Markers not found", {sIdx, eIdx});
    process.exit(1);
}

const before = content.slice(0, sIdx);
const after = content.slice(eIdx);

const newBlock = `
                {/* SECTION 1: Profil & Sumber */}
                <div className="mb-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800/60 bg-white dark:bg-[#1C1C1E] shadow-sm">
                  <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 mb-3 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-neutral-100 dark:border-neutral-800/50">
                    <User className="w-3.5 h-3.5 text-brand-500" /> Profil & Sumber
                  </h3>

                  <div className="kbi-so-field">
                    <label className="kbi-so-label">Tanggal Pembelian *</label>
                    <input 
                      type="date"
                      className="kbi-so-ledger-input font-numeric"
                      value={orderDateInput}
                      onChange={(e) => setOrderDateInput(e.target.value)}
                    />
                  </div>

                  <div className="kbi-so-field">
                    <label className="kbi-so-label">{buyerType === 'marketplace' ? 'Nama Platform *' : 'Nama Pembeli *'}</label>
                    <input 
                      className={\`kbi-so-ledger-input \${shakeFields[buyerType === 'marketplace' ? 'customerPlatformName' : 'customerName'] ? 'animate-shake border-red-500' : ''}\`}
                      placeholder={buyerType === 'marketplace' ? "Contoh: Shopee, Tokopedia..." : "Nama asli penerima..."} 
                      value={buyerType === 'marketplace' ? customerPlatformName : customerName}
                      onChange={(e) => {
                        if (buyerType === 'marketplace') {
                          setCustomerPlatformName(e.target.value);
                          setCustomerName('');
                        } else {
                          setCustomerName(e.target.value);
                        }
                      }}
                      onBlur={() => {
                        if (buyerType === 'marketplace') {
                          setCustomerPlatformName(customerPlatformName.trim());
                        } else {
                          setCustomerName(customerName.trim().toUpperCase());
                        }
                      }}
                    />
                  </div>

                  {buyerType === 'marketplace' && (
                    <div className="kbi-so-field">
                      <label className="kbi-so-label">Sumber Orderan *</label>
                      <div className="kbi-so-select-wrap relative">
                        <select 
                          className="kbi-so-ledger-input" 
                          value={platformChannel} 
                          onChange={e => setPlatformChannel(e.target.value)}
                        >
                          {!platformChannel && <option value="" disabled>-- Pilih Sumber Orderan --</option>}
                          {filteredChannels.map((c, cIdx) => (
                            <option key={\`\${c.id || c.name}-\${cIdx}\`} value={c.name}>{c.name}</option>
                          ))}
                          {platformChannel && !filteredChannels.some(c => c.name === platformChannel) && (
                            <option value={platformChannel}>{platformChannel}</option>
                          )}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {buyerType !== 'marketplace' && (
                    <>
                      <div className="kbi-so-field">
                        <label className="kbi-so-label">Nama Platform *</label>
                        <input 
                          className={\`kbi-so-ledger-input \${shakeFields['customerPlatformName'] ? 'animate-shake border-red-500' : ''}\`}
                          placeholder="Contoh: Andrea Hirata" 
                          value={customerPlatformName}
                          onChange={(e) => setCustomerPlatformName(e.target.value)}
                          onBlur={() => setCustomerPlatformName(customerPlatformName.trim())}
                        />
                      </div>

                      <div className="kbi-so-field">
                        <label className="kbi-so-label">Sumber Orderan *</label>
                        <div className="kbi-so-select-wrap relative">
                          <select 
                            className="kbi-so-ledger-input" 
                            value={platformChannel} 
                            onChange={e => setPlatformChannel(e.target.value)}
                          >
                            {!platformChannel && <option value="" disabled>-- Pilih Sumber Orderan --</option>}
                            {filteredChannels.map((c, cIdx) => (
                              <option key={\`\${c.id || c.name}-\${cIdx}\`} value={c.name}>{c.name}</option>
                            ))}
                            {platformChannel && !filteredChannels.some(c => c.name === platformChannel) && (
                              <option value={platformChannel}>{platformChannel}</option>
                            )}
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        </div>
                      </div>

                      <div className="kbi-so-field">
                        <label className="kbi-so-label">No. Handphone *</label>
                        <input 
                          className={\`kbi-so-ledger-input \${shakeFields['phoneNumber'] ? 'animate-shake !border-red-500 !ring-red-500 border-2' : ''}\`}
                          placeholder="0984287114" 
                          value={formatPhoneNumber(phoneNumber)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\\D/g, '');
                            if (digits.length > 10) {
                              triggerShake('phoneNumber');
                              return;
                            }
                            setPhoneNumber(digits);
                          }}
                        />
                      </div>

                      {buyerType !== 'reseller' && (
                        <div className="kbi-so-field">
                          <label className="kbi-so-label">Sumber Campaign</label>
                          <div className="kbi-so-select-wrap relative">
                            <select 
                              className="kbi-so-ledger-input" 
                              value={orderType} 
                              onChange={e => setOrderType(e.target.value)}
                            >
                              <option value="">-- Pilih Sumber Campaign --</option>
                              {resolvedOrderTypes.map((t, tIdx) => (
                                <option key={\`\${t.id || t.name}-\${tIdx}\`} value={t.name}>{t.name}</option>
                              ))}
                              {orderType && !resolvedOrderTypes.some(t => t.name === orderType) && (
                                <option value={orderType}>{orderType}</option>
                              )}
                            </select>
                            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* SECTION 2: Pengiriman & Pembayaran (for non-marketplace) */}
                {buyerType !== 'marketplace' && (
                  <div className="mb-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800/60 bg-white dark:bg-[#1C1C1E] shadow-sm">
                    <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 mb-3 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-neutral-100 dark:border-neutral-800/50">
                      <Truck className="w-3.5 h-3.5 text-brand-500" /> Pengiriman & Pembayaran
                    </h3>

                    <div className="kbi-so-field-row">
                      <div>
                        <label className="kbi-so-label">Opsi Pengiriman</label>
                        <div className="kbi-so-select-wrap relative">
                          <select 
                            className="kbi-so-ledger-input" 
                            value={pickupLogistics} 
                            onChange={e => setPickupLogistics(e.target.value)}
                          >
                            {!pickupLogistics && <option value="" disabled>-- Pilih Opsi Pengiriman --</option>}
                            {availableLogistics.map((l, lIdx) => (
                              <option key={\`\${l.id || l.name}-\${lIdx}\`} value={l.name}>{l.name}</option>
                            ))}
                            {pickupLogistics && !availableLogistics.some(l => l.name === pickupLogistics) && (
                              <option value={pickupLogistics}>{pickupLogistics}</option>
                            )}
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="kbi-so-label">Metode Bayar</label>
                        <div className="kbi-so-select-wrap relative">
                          <select className="kbi-so-ledger-input" value={paymentMethod} onChange={(e: any) => handlePaymentMethodChange(e.target.value)}>
                            <option value="COD">COD</option>
                            <option value="Transfer">Transfer</option>
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div className="kbi-so-field">
                      <label className="kbi-so-label">Kode Toko / Alamat</label>
                      <textarea 
                        className="kbi-so-ledger-input" 
                        placeholder="Contoh: Toko No. 991823..."
                        value={pickupDetails}
                        onChange={e => setPickupDetails(e.target.value)}
                      ></textarea>
                    </div>

                    <div className="kbi-so-field-row">
                      <div>
                        <label className="kbi-so-label">Foto Fapiao / Alamat</label>
                        <input 
                          type="file" 
                          id="fotoAlamatInput" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setAddressPhotoFile(file);
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setAddressPhotoUrl(ev.target?.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        {!addressPhotoUrl ? (
                          <label htmlFor="fotoAlamatInput" className="kbi-so-upload-box h-[42px] flex items-center justify-center gap-2 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500 text-xs mt-1">
                            <UploadCloud className="w-4 h-4" />
                            <span>Upload Foto</span>
                          </label>
                        ) : (
                          <div className="mt-1">
                            <div 
                              className="w-16 h-16 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 relative group cursor-pointer shadow-sm"
                              onClick={() => setPreviewImage({ url: addressPhotoUrl, title: 'Foto Fapiao / Alamat' })}
                            >
                              <img src={addressPhotoUrl} alt="Preview" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                              <button type="button" className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 shadow-sm" onClick={(e) => { e.stopPropagation(); setAddressPhotoUrl(''); setAddressPhotoFile(null); }}>
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="kbi-so-label">Platform Order</label>
                        <div className="kbi-so-select-wrap relative">
                          <select 
                            className="kbi-so-ledger-input" 
                            value={platformOrder} 
                            onChange={e => {
                              const val = e.target.value;
                              setPlatformOrder(val);
                              if (!editingOrder) {
                                const listToUse = buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment;
                                const matched = listToUse.find((p: any) => p.name === val);
                                if (matched && matched.adminFee !== undefined) {
                                  setPlatformFeeInput(String(matched.adminFee));
                                } else {
                                  setPlatformFeeInput('0');
                                }
                              }
                            }}
                          >
                            {!platformOrder && <option value="" disabled>-- Pilih Platform --</option>}
                            {(buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment).map((p, pIdx) => (
                              <option key={\`\${p.id || p.name}-\${pIdx}\`} value={p.name}>{p.name}</option>
                            ))}
                            {platformOrder && !(buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment).some(p => p.name === platformOrder) && (
                              <option value={platformOrder}>{platformOrder}</option>
                            )}
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 3: Detail Tambahan */}
                <div className="mb-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800/60 bg-white dark:bg-[#1C1C1E] shadow-sm">
                  <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 mb-3 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-neutral-100 dark:border-neutral-800/50">
                    <FileText className="w-3.5 h-3.5 text-brand-500" /> Detail Tambahan
                  </h3>

                  <div className="kbi-so-field">
                    <label className="kbi-so-label">Nomor Order</label>
                    <div className="kbi-so-nomor-row">
                      <input className="kbi-so-ledger-input font-numeric" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Opsional (Otomatis jika kosong)" />
                      <button type="button" className="kbi-so-copy-btn" onClick={() => navigator.clipboard.writeText(orderNumber)} title="Salin Nomor Order">
                        <Copy className="w-[15px] h-[15px]" />
                      </button>
                    </div>
                  </div>

                  <div className="kbi-so-field">
                    <label className="kbi-so-label">Note dari Customer</label>
                    <textarea 
                      className="kbi-so-ledger-input" 
                      placeholder="Catatan tambahan dari pembeli..."
                      value={customerNote}
                      onChange={e => setCustomerNote(e.target.value)}
                    ></textarea>
                  </div>

                  <div className="flex items-center justify-between p-3 mb-3 rounded-xl border border-neutral-200 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-neutral-900/40 transition-colors">
                    <div className="flex flex-col pr-3">
                      <label className="kbi-so-label" style={{ marginBottom: 2 }}>Perlu Konfirmasi Sebelum Kirim</label>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight normal-case font-normal">Munculkan peringatan cek data sebelum dikemas</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={perluKonfirmasiSebelumKirim}
                        onChange={(e) => setPerluKonfirmasiSebelumKirim(e.target.checked)}
                      />
                      <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-brand-500 shadow-sm"></div>
                    </label>
                  </div>

                  <div className="kbi-so-field" style={{ marginBottom: 0 }}>
                    <label className="kbi-so-label">Tanggal Diminta Kirim</label>
                    <div className="relative group">
                      <input 
                        type="date"
                        className="kbi-so-ledger-input font-numeric w-full pr-10 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                        value={estimatedShippingDate} 
                        onChange={e => setEstimatedShippingDate(e.target.value)} 
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 group-hover:text-brand-500 transition-colors">
                        <Calendar className="w-[15px] h-[15px]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
`;

fs.writeFileSync('src/components/SalesTab.tsx', before + newBlock + after);
console.log("Successfully rewrote left column.");
