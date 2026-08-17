const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const oldCardsHTML = `              <div className="kbi-ocard__top pb-1">
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0 mr-2">
                  <span className="font-bold text-neutral-900 dark:text-white text-[13px] leading-none truncate max-w-[100px]">{order.orderCode}</span>
                  <span className="text-neutral-300 dark:text-neutral-600 leading-none text-xs">•</span>
                  <span className="font-bold text-[#2b5a9e] dark:text-brand-400 text-[13px] leading-none truncate flex-1">{order.customerName}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandedOrderId(expandedOrderId === order.id ? null : order.id); }}
                  className="kbi-ocard__status shrink-0"
                  style={{ backgroundColor: pillBg, color: pillColor, minHeight: '24px', padding: '2px 6px' }}
                  aria-expanded={expandedOrderId === order.id}
                >
                  <span className="kbi-ocard__statusdot" style={{ backgroundColor: pillColor }} />
                  {pillLabel}
                </button>
              </div>

              <div className="kbi-ocard__body pt-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                  <span className="font-medium">{formattedDate}</span>
                  
                  {showReadyStockHighlight && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-1 py-0.5 rounded-[4px] font-semibold"><Check className="h-3 w-3" />Stok siap</span>
                  )}
                  {showOverdueHighlight && (
                    <span className="inline-flex items-center px-1 py-0.5 rounded-[4px] font-semibold" style={{ backgroundColor: isCritical ? '#fde3e1' : '#fef3e0', color: isCritical ? '#a8323b' : '#b45309' }}>{overdueDays} hari</span>
                  )}
                  {isPinnedOrder && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-1 py-0.5 rounded-[4px] font-semibold"><Pin className="h-3 w-3 fill-current" />Disematkan</span>
                  )}

                  <span className="text-neutral-300 dark:text-neutral-600">•</span>
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    {order.paymentMethod || 'COD'}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">•</span>
                  <span className="truncate max-w-[80px]" style={{ color: channelColor }}>{channelName}</span>
                </div>

                <div className="kbi-ocard__pricerow mb-0">
                  <span className="kbi-ocard__qty">Qty <b>{orderQty}</b></span>
                  {canViewAmount && (
                    <div className="kbi-ocard__figures">
                      <div className="kbi-ocard__total">{formatNTD(order.totalPrice)}</div>
                      {!!order.discount && <div className="kbi-ocard__disc">−{formatNTD(order.discount)}</div>}
                    </div>
                  )}
                </div>
              </div>`;

const newCardsHTML = `              <div className="kbi-ocard__top pb-1">
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0 mr-2">
                  <span className="font-bold text-neutral-900 dark:text-white text-[13px] leading-none truncate max-w-[100px]">{order.orderCode}</span>
                  <span className="text-neutral-300 dark:text-neutral-600 leading-none text-xs">•</span>
                  <span className="font-semibold text-[11.5px] truncate flex-1" style={{ color: channelColor }}>{channelName}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandedOrderId(expandedOrderId === order.id ? null : order.id); }}
                  className="kbi-ocard__status shrink-0"
                  style={{ backgroundColor: pillBg, color: pillColor, minHeight: '24px', padding: '2px 6px' }}
                  aria-expanded={expandedOrderId === order.id}
                >
                  <span className="kbi-ocard__statusdot" style={{ backgroundColor: pillColor }} />
                  {pillLabel}
                </button>
              </div>

              <div className="kbi-ocard__body pt-1">
                {/* Baris 2: Nomor Order + Copy */}
                {order.orderNumber && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[12px] font-mono text-neutral-600 dark:text-neutral-400">{order.orderNumber}</span>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(order.orderNumber);
                        }
                      }}
                      className="text-neutral-400 hover:text-brand-500 transition-colors p-1"
                      title="Copy Nomor Order"
                    >
                      <Copy className="w-[12px] h-[12px]" />
                    </button>
                  </div>
                )}

                {/* Baris 3: Nama Pembeli */}
                <div className="font-bold text-[#2b5a9e] dark:text-brand-400 text-[13px] mb-2 leading-none">{order.customerName}</div>

                {/* Baris 4: Date + Tags + COD */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                  <span className="font-medium">{formattedDate}</span>
                  
                  {showReadyStockHighlight && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-1 py-0.5 rounded-[4px] font-semibold"><Check className="h-3 w-3" />Stok siap</span>
                  )}
                  {showOverdueHighlight && (
                    <span className="inline-flex items-center px-1 py-0.5 rounded-[4px] font-semibold" style={{ backgroundColor: isCritical ? '#fde3e1' : '#fef3e0', color: isCritical ? '#a8323b' : '#b45309' }}>{overdueDays} hari</span>
                  )}
                  {isPinnedOrder && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-1 py-0.5 rounded-[4px] font-semibold"><Pin className="h-3 w-3 fill-current" />Disematkan</span>
                  )}

                  <span className="text-neutral-300 dark:text-neutral-600">•</span>
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    {order.paymentMethod || 'COD'}
                  </span>
                </div>

                {/* Baris 5: Qty + Diskon + Total */}
                <div className="flex items-center justify-between mt-1 mb-0">
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span>Qty: <b className="text-neutral-700 dark:text-neutral-300">{orderQty}</b></span>
                    {!!order.discount && (
                      <>
                        <span className="text-neutral-300 dark:text-neutral-600">•</span>
                        <span>Diskon: <b className="text-rose-500">−{formatNTD(order.discount)}</b></span>
                      </>
                    )}
                  </div>
                  {canViewAmount && (
                    <div className="font-black text-[#2b5a9e] dark:text-[#818cf8] text-[13px]">
                      {formatNTD(order.totalPrice)}
                    </div>
                  )}
                </div>
              </div>`;

if (content.includes(oldCardsHTML)) {
  content = content.replace(oldCardsHTML, newCardsHTML);
  fs.writeFileSync('src/components/SalesTab.tsx', content);
  console.log('Mobile cards successfully replaced!');
} else {
  console.error('Could not find the exact old cards HTML block.');
}
