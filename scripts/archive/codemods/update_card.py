import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

target = """                        <div className="kbi-so-item-info">
                          <div className="kbi-so-item-title-row">
                            <span className="kbi-so-item-title">{it.bookName}</span>
                            {it.isFree && <span className="kbi-so-gratis-tag">GRATIS</span>}
                            {backorder && <span className="kbi-so-backorder-tag">BACKORDER</span>}
                          </div>
                          <div className={`kbi-so-item-stock-note ${backorder ? 'warn' : 'ok'}`}>
                            {backorder ? `Stok ${stok} pcs — kurang ${shortfall} pcs, perlu PO` : `Stok tersedia: ${stok} pcs`}
                          </div>
                        </div>
                        <div className="kbi-so-qty-stepper">
                          <button type="button" onClick={() => handleCartQtyChange(idx, -1)}><Minus className="w-[13px] h-[13px]" /></button>
                          <span>{it.qty}</span>
                          <button type="button" onClick={() => handleCartQtyChange(idx, 1)}><Plus className="w-[13px] h-[13px]" /></button>
                        </div>
                        <div className="kbi-so-item-line-total">{formatNTD(it.lineTotal)}</div>"""

replacement = """                        <div className="kbi-so-item-info">
                          <div className="kbi-so-item-title-row">
                            <span className="kbi-so-item-title" title={it.bookName}>{it.bookName}</span>
                            {it.isFree && <span className="kbi-so-gratis-tag">GRATIS</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`kbi-so-item-stock-note ${backorder ? 'warn' : 'ok'}`}>
                              Stok {stok} pcs
                            </div>
                            {backorder && (
                              <span className="kbi-so-backorder-tag">BACKORDER</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col justify-center items-end pr-4 gap-1.5 border-l border-neutral-100 dark:border-neutral-800/50 pl-3">
                          <div className="kbi-so-qty-stepper !p-0">
                            <button type="button" onClick={() => handleCartQtyChange(idx, -1)}><Minus className="w-[13px] h-[13px]" /></button>
                            <span>{it.qty}</span>
                            <button type="button" onClick={() => handleCartQtyChange(idx, 1)}><Plus className="w-[13px] h-[13px]" /></button>
                          </div>
                          <div className="kbi-so-item-line-total !p-0 font-bold text-brand-600 dark:text-brand-400">{formatNTD(it.lineTotal)}</div>
                        </div>"""

if target in content:
    content = content.replace(target, replacement)
    with open('src/components/SalesTab.tsx', 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Target not found")
