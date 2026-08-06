import re

with open('src/components/BulkProcessModal.tsx', 'r') as f:
    content = f.read()

target = r'''  const handleProcess = async \(\) => \{
    setIsProcessing\(true\);
    let successCount = 0;
    let errorCount = 0;
    let notYetDueCount = 0;
    const newRows = \[\.\.\.rows\];'''

replacement = r'''  const handleProcess = async () => {
    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    let notYetDueCount = 0;
    const newRows = [...rows];
    
    // Copy current endingStock to track reductions during this batch
    const localStockMap = new Map<string, number>();
    for (const inv of inventories) {
      localStockMap.set(inv.bookId, inv.endingStock || 0);
    }'''

content = content.replace(target, replacement)

target2 = r'''      if \(!order\) \{
        row\.status = 'error';
        row\.deskripsi = 'Order tidak ditemukan atau bukan status Menunggu';
        row\.deskripsiType = '';
        errorCount\+\+;
        continue;
      \}'''

replacement2 = r'''      if (!order) {
        row.status = 'error';
        row.deskripsi = 'Order tidak ditemukan atau bukan status Menunggu';
        row.deskripsiType = '';
        errorCount++;
        continue;
      }
      
      // Client-side stock validation tracking
      let hasInsufficientStock = false;
      const insufficientList: string[] = [];
      for (const item of order.items || []) {
        const available = localStockMap.get(item.bookId) || 0;
        if (available < item.qty) {
          hasInsufficientStock = true;
          insufficientList.push(`${item.bookName} (Tersedia ${available}, Butuh ${item.qty})`);
        }
      }
      if (hasInsufficientStock) {
        row.status = 'error';
        row.deskripsi = `Stok tidak cukup: ${insufficientList.join(', ')}`;
        row.deskripsiType = 'warn';
        errorCount++;
        continue;
      }
      
      // Deduct from local stock tracker for subsequent rows in this loop
      for (const item of order.items || []) {
        const available = localStockMap.get(item.bookId) || 0;
        localStockMap.set(item.bookId, available - item.qty);
      }'''

content = content.replace(target2, replacement2)

with open('src/components/BulkProcessModal.tsx', 'w') as f:
    f.write(content)
