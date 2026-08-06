import re

with open('src/index.css', 'r') as f:
    css = f.read()

# Make card wider
css = css.replace("max-width: 64rem;", "max-width: 76rem;")

# Make title wrap
css = css.replace("""  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;""", "")

with open('src/index.css', 'w') as f:
    f.write(css)

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

# Fix layout of backorder and title
target = """                          <div className="flex items-center gap-2 mt-1">
                            <div className={`kbi-so-item-stock-note ${backorder ? 'warn' : 'ok'}`}>
                              Stok {stok} pcs
                            </div>
                            {backorder && (
                              <span className="kbi-so-backorder-tag">BACKORDER</span>
                            )}
                          </div>"""
replacement = """                          <div className="flex flex-col items-start gap-1 mt-1">
                            <div className={`kbi-so-item-stock-note ${backorder ? 'warn' : 'ok'}`}>
                              Stok {stok} pcs
                            </div>
                            {backorder && (
                              <span className="kbi-so-backorder-tag">BACKORDER</span>
                            )}
                          </div>"""

if target in sales:
    sales = sales.replace(target, replacement)
    with open('src/components/SalesTab.tsx', 'w') as f:
        f.write(sales)
    print("SalesTab replaced successfully")
else:
    print("SalesTab target not found")
