import re

with open('src/index.css', 'r') as f:
    css = f.read()

target_css = """
.kbi-so-item-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: #18181b;

}"""
replacement_css = """
.kbi-so-item-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: #18181b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}"""
css = css.replace(target_css, replacement_css)

with open('src/index.css', 'w') as f:
    f.write(css)

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

target_jsx = """                          <div className="flex flex-col items-start gap-1 mt-1">
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

replacement_jsx = """                          <div className="flex items-center gap-2 mt-1">
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
                          <div className="kbi-so-item-line-total !p-0 font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap whitespace-pre">{formatNTD(it.lineTotal).replace('\\n', '')}</div>
                        </div>"""

if target_jsx in sales:
    sales = sales.replace(target_jsx, replacement_jsx)
    with open('src/components/SalesTab.tsx', 'w') as f:
        f.write(sales)
    print("JSX updated successfully")
else:
    print("Target JSX not found")

