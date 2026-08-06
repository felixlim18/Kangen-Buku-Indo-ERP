import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function checkSuppliers() {
  const snap = await getDocs(collection(db, 'purchaseOrders'));
  const platformsSnap = await getDocs(collection(db, 'platforms'));
  
  console.log("=== PLATFORMS / SUPPLIERS IN MASTER DATA ===");
  platformsSnap.docs.forEach(d => {
    console.log(`ID: ${d.id} | Name: ${d.data().name} | Currency: ${d.data().currency}`);
  });

  console.log("\n=== CHECKING POs FOR CURRENCY / SUPPLIER MISMATCHES ===");
  snap.docs.forEach(d => {
    const po = d.data();
    const idr = po.purchasePriceIDR;
    const ntd = (po.purchasePriceNTD || 0) / 100;
    if (po.supplierName?.toLowerCase().includes('shopee') || po.supplierName?.toLowerCase().includes('tokopedia') || po.supplierName?.toLowerCase().includes('tokko')) {
      if (!idr || idr === 0) {
        console.log(`[INDONESIA SUPPLIER WITH NO IDR] Code: ${po.purchaseCode || d.id} | Supplier: ${po.supplierName} | NTD: ${ntd}`);
      }
    }
  });

  process.exit(0);
}

checkSuppliers().catch(console.error);
