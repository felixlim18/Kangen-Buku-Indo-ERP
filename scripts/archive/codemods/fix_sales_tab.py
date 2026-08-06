import re

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

# Add imports
imports = """import { ImagePreviewModal } from './ui/ImagePreviewModal';
import { TruncatedTooltip } from './ui/TruncatedTooltip';"""
if "import { ImagePreviewModal }" not in sales:
    sales = sales.replace("import { formatNTD }", imports + "\nimport { formatNTD }")

# Add state for image preview
preview_state = """  const [previewImage, setPreviewImage] = useState<{url: string, title: string} | null>(null);"""
if "const [previewImage, setPreviewImage]" not in sales:
    sales = sales.replace("  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);", preview_state + "\n  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);")

# Update card structure
target_card = """                      <div key={`${it.bookId}-${idx}`} className="kbi-so-item-card">
                        {it.bookCover ? (
                          <div className="w-20 bg-neutral-50 dark:bg-neutral-900 overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-800">
                            <img referrerPolicy="no-referrer" src={it.bookCover} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="kbi-so-spine" style={{backgroundColor: b?.color || '#2B5A9E'}}><BookOpen className="w-4 h-4 text-white" /></div>
                        )}
                        <div className="kbi-so-item-info">
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
                          <div className="kbi-so-item-line-total !p-0 font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap whitespace-pre">{formatNTD(it.lineTotal).replace(' ', '')}</div>
                        </div>
                        <div className="kbi-so-item-actions">
                          <button type="button" className="gift-btn" onClick={() => {
                            const newItems = [...cartItems];
                            newItems[idx].isFree = !newItems[idx].isFree;
                            newItems[idx].lineTotal = newItems[idx].isFree ? 0 : newItems[idx].qty * newItems[idx].unitPrice;
                            setCartItems(newItems);
                          }}><Gift className="w-[15px] h-[15px]" /></button>
                          <button type="button" className="remove-btn" onClick={() => {
                            const newItems = [...cartItems];
                            newItems.splice(idx, 1);
                            setCartItems(newItems);
                          }}><Trash className="w-[15px] h-[15px]" /></button>
                        </div>
                      </div>"""

replacement_card = """                      <div key={`${it.bookId}-${idx}`} className="kbi-so-item-card">
                        {it.bookCover ? (
                          <div 
                            className="w-14 bg-neutral-50 dark:bg-neutral-900 overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-800 cursor-pointer transition hover:opacity-80"
                            onClick={() => setPreviewImage({ url: it.bookCover!, title: it.bookName })}
                          >
                            <img referrerPolicy="no-referrer" src={it.bookCover} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-14 bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-800" style={{backgroundColor: b?.color || '#2B5A9E'}}>
                            <BookOpen className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="kbi-so-item-info">
                          <div className="flex items-center gap-2 max-w-full overflow-hidden">
                            <TruncatedTooltip content={it.bookName} className="kbi-so-item-title">
                              {it.bookName}
                            </TruncatedTooltip>
                            {it.isFree && <span className="kbi-so-gratis-tag shrink-0">GRATIS</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className={`kbi-so-item-stock-note ${backorder ? 'warn' : 'ok'}`}>
                              Stok {stok} pcs
                            </div>
                            {backorder && (
                              <span className="kbi-so-backorder-tag shrink-0">BACKORDER</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col justify-center items-end pr-3 gap-1 border-l border-neutral-100 dark:border-neutral-800/50 pl-2">
                          <div className="kbi-so-qty-stepper !p-0">
                            <button type="button" onClick={() => handleCartQtyChange(idx, -1)}><Minus className="w-[13px] h-[13px]" /></button>
                            <span className="text-sm">{it.qty}</span>
                            <button type="button" onClick={() => handleCartQtyChange(idx, 1)}><Plus className="w-[13px] h-[13px]" /></button>
                          </div>
                          <div className="kbi-so-item-line-total !p-0 font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap whitespace-pre text-xs">{formatNTD(it.lineTotal).replace(' ', '')}</div>
                        </div>
                        <div className="kbi-so-item-actions !border-l-0">
                          <button type="button" className="gift-btn !px-1.5" onClick={() => {
                            const newItems = [...cartItems];
                            newItems[idx].isFree = !newItems[idx].isFree;
                            newItems[idx].lineTotal = newItems[idx].isFree ? 0 : newItems[idx].qty * newItems[idx].unitPrice;
                            setCartItems(newItems);
                          }}><Gift className="w-3.5 h-3.5" /></button>
                          <button type="button" className="remove-btn !px-1.5" onClick={() => {
                            const newItems = [...cartItems];
                            newItems.splice(idx, 1);
                            setCartItems(newItems);
                          }}><Trash className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>"""

if target_card in sales:
    sales = sales.replace(target_card, replacement_card)
    print("Card updated")
else:
    print("Card target not found")

# Add the ImagePreviewModal at the end of the return statement
modal_comp = """      <ImagePreviewModal 
        isOpen={!!previewImage} 
        onClose={() => setPreviewImage(null)} 
        imageUrl={previewImage?.url || ''} 
        title={previewImage?.title} 
      />
    </div>
  );
}"""

if "<ImagePreviewModal" not in sales:
    sales = sales.replace("    </div>\n  );\n}", modal_comp)
    print("Modal added")

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(sales)
