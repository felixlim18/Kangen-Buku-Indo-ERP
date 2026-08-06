import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function check1to1() {
  const snap = await getDocs(collection(db, 'purchaseOrders'));
  console.log("Searching for POs where IDR price roughly equals NTD price...");
  
  let found = 0;
  snap.docs.forEach(d => {
    const po = d.data();
    const idr = po.purchasePriceIDR || 0;
    const ntdCents = po.purchasePriceNTD || 0;
    const ntd = ntdCents / 100;

    // Check if IDR > 0 and NTD == IDR (or NTD > IDR * 0.5)
    if (idr > 0 && Math.abs(idr - ntd) < 10) {
      found++;
      console.log(`[FOUND 1:1 PO] ID: ${d.id} | Code: ${po.purchaseCode} | Book: ${po.bookName} | IDR: ${idr} | NTD: ${ntd} | Supplier: ${po.supplierName}`);
    }
  });

  if (found === 0) {
    console.log("No exact 1:1 POs found in Firestore.");
  } else {
    console.log(`Total 1:1 POs found: ${found}`);
  }

  process.exit(0);
}

check1to1().catch(console.error);
