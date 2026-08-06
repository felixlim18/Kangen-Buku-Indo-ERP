import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function audit() {
  console.log("=== AUDITING PURCHASE ORDERS & INVENTORY ===");
  const posSnap = await getDocs(collection(db, 'purchaseOrders'));
  const pos = posSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Total Purchase Orders: ${pos.length}`);
  
  let totalPoNtd = 0;
  pos.forEach((p: any) => {
    console.log(`PO: ${p.purchaseCode || p.id} | Book: ${p.bookName} | Qty: ${p.qty} | Status: ${p.status} | Price IDR: ${p.purchasePriceIDR} | Rate: ${p.fxRateUsed} | Price NTD: ${p.purchasePriceNTD}`);
    if (p.status === 'received' || p.status === 'completed') {
      totalPoNtd += (p.purchasePriceNTD || 0);
    }
  });

  const invSnap = await getDocs(collection(db, 'inventory'));
  console.log("\n=== INVENTORY RECORDS ===");
  invSnap.docs.forEach((d: any) => {
    const data = d.data();
    console.log(`Book ID: ${d.id} | Name: ${data.bookName} | Stock: ${data.endingStock} | MAC: ${data.movingAverageCost} | Total Value NTD: ${data.totalInventoryValue / 100}`);
  });

  process.exit(0);
}

audit().catch(console.error);
