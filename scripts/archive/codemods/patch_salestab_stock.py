import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

# Replace the "available" logic in proses slot
target1 = r"""                                  const inv = inventories\.find\(i => i\.bookId === item\.bookId\);
                                  const available = inv \? \(inv\.endingStock \|\| 0\) : 0;"""
replacement1 = r"""                                  const available = getCurrentKontrolStokForBook(item.bookId, inventories, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);"""
content = re.sub(target1, replacement1, content)

# Replace the "available" logic in handleProsesSubmit (modal confirmation)
target2 = r"""           const inv = inventories\.find\(i => i\.bookId === item\.bookId\);
           const available = inv \? inv\.endingStock : 0;"""
replacement2 = r"""           const available = getCurrentKontrolStokForBook(item.bookId, inventories, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);"""
content = re.sub(target2, replacement2, content)

# Replace the "stok" logic in the new order dropdown suggestion list
target3 = r"const stok = inventories\.find\(i => i\.bookId === b\.id\)\?\.readyStock \|\| 0;"
replacement3 = r"const stok = getCurrentKontrolStokForBook(b.id, inventories, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);"
content = re.sub(target3, replacement3, content)

# Replace the "stok" logic in the new order selected items list
target4 = r"const stok = inventories\.find\(inv => inv\.bookId === it\.bookId\)\?\.readyStock \|\| 0;"
replacement4 = r"const stok = getCurrentKontrolStokForBook(it.bookId, inventories, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);"
content = re.sub(target4, replacement4, content)

# BulkProcessModal props update
target_bulk = r"""<BulkProcessModal 
           isOpen=\{isBulkProcessOpen\} 
           onClose=\{\(\) => setIsBulkProcessOpen\(false\)\} 
           menungguOrders=\{searchedOrders\.filter\(o => o\.status === 'draft'\)\} 
           inventories=\{inventories\}
        />"""
replacement_bulk = r"""<BulkProcessModal 
           isOpen={isBulkProcessOpen} 
           onClose={() => setIsBulkProcessOpen(false)} 
           menungguOrders={searchedOrders.filter(o => o.status === 'draft')} 
           inventories={inventories}
           ledgerEntries={ledgerEntries}
           purchaseOrders={purchaseOrders}
           salesOrders={salesOrders}
           damagedRecords={damagedRecords}
        />"""
content = re.sub(target_bulk, replacement_bulk, content)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)
