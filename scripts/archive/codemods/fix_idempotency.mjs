import fs from 'fs';
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const regex = /    try \{\n      const batch = writeBatch\(db\);/;
const replacement = `    try {
      // Idempotency validation: check if the exact same receive was already processed a few seconds ago
      const poRefForCheck = doc(db, 'purchaseOrders', selectedPo.id);
      const poSnapForCheck = await getDoc(poRefForCheck);
      if (poSnapForCheck.exists()) {
         const latestPo = poSnapForCheck.data();
         if (latestPo.receipts && latestPo.receipts.length > 0) {
            const lastReceipt = latestPo.receipts[latestPo.receipts.length - 1];
            const now = Timestamp.now().seconds;
            if (lastReceipt.receivedDate && now - lastReceipt.receivedDate.seconds < 5) {
               alert("Transaksi penerimaan barang ini sudah diproses (mungkin tombol tertekan dua kali). Mengabaikan request ganda.");
               setIsProcessingReceive(false);
               setIsReceiveOpen(false);
               return;
            }
         }
      }

      const batch = writeBatch(db);`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/PurchasesTab.tsx', content);
