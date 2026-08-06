import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

old_block = """    if (matchedPo) {
      lastScanMatchFieldRef.current = matchType;
      // Check if already in scanned pos"""

new_block = """    if (matchedPo) {
      if (matchedPo.status === 'received') {
        let receivedDateStr = 'N/A';
        if (matchedPo.receipts && matchedPo.receipts.length > 0) {
          const lastReceipt = matchedPo.receipts[matchedPo.receipts.length - 1];
          if (lastReceipt.receivedDate?.seconds) {
            receivedDateStr = formatToYYYYMMDD(new Date(lastReceipt.receivedDate.seconds * 1000));
          }
        } else if (matchedPo.updatedAt?.seconds) {
          receivedDateStr = formatToYYYYMMDD(new Date(matchedPo.updatedAt.seconds * 1000));
        }
        
        setScanSuccessToast(`Barang Sudah Di Terima [${receivedDateStr}]`);
        setTimeout(() => setScanSuccessToast(null), 4000);
        playScanSuccessBeep();
        return;
      }

      lastScanMatchFieldRef.current = matchType;
      // Check if already in scanned pos"""

if old_block in content:
    content = content.replace(old_block, new_block)
    print("Replaced successfully")
else:
    print("Could not find block")

with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)

