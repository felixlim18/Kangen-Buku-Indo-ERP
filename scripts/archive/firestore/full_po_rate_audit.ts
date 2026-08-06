import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function fullAudit() {
  console.log("=== COMPREHENSIVE PURCHASE ORDER & FX RATE AUDIT ===");
  const posSnap = await getDocs(collection(db, 'purchaseOrders'));
  const fxSnap = await getDocs(collection(db, 'fxRates'));
  
  const fxMap = new Map();
  fxSnap.docs.forEach(d => {
    const data = d.data();
    fxMap.set(data.date, data.idrToNtd); // e.g. "2026-07-21" -> rate
  });

  let totalPoCount = posSnap.size;
  let poWithRates = 0;
  let poNoRates = 0;
  let discrepancies: any[] = [];

  posSnap.docs.forEach(d => {
    const po = d.data();
    const poCode = po.purchaseCode || d.id;
    const priceIDR = po.purchasePriceIDR || 0;
    const priceNTD = po.purchasePriceNTD || 0; // stored in cents or dollars? Let's check!
    const qty = po.qty || 1;
    const fxRate = po.fxRateUsed || 0;

    // Check rate format:
    // Some rates in system are stored as IDR per NTD (e.g. 550 IDR/NTD), 
    // some as IDR -> NTD multiplier (e.g. 0.001818).
    
    // Total IDR for purchase
    const totalIDR = priceIDR * qty;

    // Let's check how NTD was stored in PO record
    // Note: in purchaseOrders, is purchasePriceNTD in cents or dollars?
    // Let's check sample PO values
    if (fxRate > 0) {
      poWithRates++;
    } else {
      poNoRates++;
    }
  });

  console.log(`Total POs: ${totalPoCount}`);
  console.log(`POs with locked fxRateUsed: ${poWithRates}`);
  console.log(`POs without fxRateUsed field: ${poNoRates}`);

  // Print sample 10 POs to inspect exact schema & values
  console.log("\n--- SAMPLE 10 RECENT PURCHASE ORDERS ---");
  posSnap.docs.slice(0, 10).forEach(d => {
    const p = d.data();
    console.log({
      id: d.id,
      code: p.purchaseCode,
      date: p.purchaseDate,
      bookName: p.bookName,
      qty: p.qty,
      purchasePriceIDR: p.purchasePriceIDR,
      purchasePriceNTD: p.purchasePriceNTD,
      fxRateUsed: p.fxRateUsed,
      status: p.status
    });
  });

  process.exit(0);
}

fullAudit().catch(console.error);
