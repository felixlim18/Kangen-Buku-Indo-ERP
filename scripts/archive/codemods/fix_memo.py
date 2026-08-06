import re

with open('src/components/InventoryTab.tsx', 'r') as f:
    content = f.read()

# Wrap allBooksWithStock in useMemo
old_all_books = """  const allBooksWithStock = books.map(book => {
    const stok = getCurrentKontrolStokForBook(book.id, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);
    const bookInventory = inventoryList.find(i => i.bookId === book.id);
    const stokDikirim = bookInventory ? (bookInventory.shippedStock || 0) : 0;
    
    // Compute Stok Diorder dynamically from draft sales orders
    const stokDiorder = salesOrders
      .filter(so => so.status === 'draft' && !so.isDraft)
      .reduce((total, so) => {
        const item = so.items?.find((i: any) => i.bookId === book.id);
        return total + (item?.qty || 0);
      }, 0);

    const minStok = book.minOrder || 0;
    const status = getStatusOfBook(stok, minStok);
    return { ...book, stok, stokDikirim, stokDiorder, minStok, status };
  });"""

new_all_books = """  const allBooksWithStock = React.useMemo(() => books.map(book => {
    const stok = getCurrentKontrolStokForBook(book.id, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);
    const bookInventory = inventoryList.find(i => i.bookId === book.id);
    const stokDikirim = bookInventory ? (bookInventory.shippedStock || 0) : 0;
    
    // Compute Stok Diorder dynamically from draft sales orders
    const stokDiorder = salesOrders
      .filter(so => so.status === 'draft' && !so.isDraft)
      .reduce((total, so) => {
        const item = so.items?.find((i: any) => i.bookId === book.id);
        return total + (item?.qty || 0);
      }, 0);

    const minStok = book.minOrder || 0;
    const status = getStatusOfBook(stok, minStok);
    return { ...book, stok, stokDikirim, stokDiorder, minStok, status };
  }), [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords]);"""

if old_all_books in content:
    content = content.replace(old_all_books, new_all_books)
else:
    print("Could not find allBooksWithStock block")

with open('src/components/InventoryTab.tsx', 'w') as f:
    f.write(content)
