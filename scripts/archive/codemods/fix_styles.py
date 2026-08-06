with open('src/components/InventoryTab.tsx', 'r') as f:
    content = f.read()

old_content = """                    <div className="kbi-val-center">{b.minStok}</div>
                    <div className="kbi-val-center">{formatNTD(b.generalPrice || 0)}</div>
                    <div className="kbi-val-center">{formatNTD(b.shopeePrice || 0)}</div>
                    <div className={`kbi-val-center ${isMinus ? "negative" : ""}`}>{b.stok} pcs</div>
                    <div className="kbi-val-center text-amber-600 dark:text-amber-400 font-semibold">{b.stokDiorder} pcs</div>
                    <div className="kbi-val-center text-blue-600 dark:text-blue-400 font-semibold">{b.stokDikirim} pcs</div>
                    <div style={{textAlign:"center"}}>
                      <span className={`kbi-status-pill status-${b.status}`}><span className="dot"></span>{STATUS_LABEL[b.status]}</span>
                    </div>
                    <div className="kbi-saran-beli">
                      {isMinus ? <strong>{saranBeli} pcs</strong> : <span className="muted">&mdash;</span>}
                    </div>"""

new_content = """                    <div className="kbi-val-center font-bold">{b.minStok}</div>
                    <div className="kbi-val-center font-bold">{formatNTD(b.generalPrice || 0)}</div>
                    <div className="kbi-val-center font-bold">{formatNTD(b.shopeePrice || 0)}</div>
                    <div className={`kbi-val-center font-bold ${isMinus ? "text-[#ff1e1e]" : "text-[#3d7a4f]"}`}>{b.stok} pcs</div>
                    <div className="kbi-val-center font-bold">{b.stokDiorder} pcs</div>
                    <div className="kbi-val-center font-bold">{b.stokDikirim} pcs</div>
                    <div style={{textAlign:"center"}}>
                      <span className={`kbi-status-pill status-${b.status}`}><span className="dot"></span>{STATUS_LABEL[b.status]}</span>
                    </div>
                    <div className="kbi-saran-beli">
                      {isMinus ? <strong style={{ color: '#debf00', borderColor: '#261007' }}>{saranBeli} pcs</strong> : <span className="muted">&mdash;</span>}
                    </div>"""

if old_content in content:
    content = content.replace(old_content, new_content)
    with open('src/components/InventoryTab.tsx', 'w') as f:
        f.write(content)
    print("Replaced successfully")
else:
    print("Not found")
