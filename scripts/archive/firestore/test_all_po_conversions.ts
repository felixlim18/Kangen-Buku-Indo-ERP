import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function testAllPOConversions() {
  const posSnap = await getDocs(collection(db, 'purchaseOrders'));
  let exactCount = 0;
  let abnormalCount = 0;
  let abnormalList: any[] = [];

  posSnap.docs.forEach(d => {
    const p = d.data();
    const idr = p.purchasePriceIDR || 0;
    const ntdCents = p.purchasePriceNTD || 0;
    const ntd = ntdCents / 100; // stored as NT$ cents

    if (idr > 0 && ntd > 0) {
      const effectiveRateIDRperNTD = idr / ntd;
      // Normal range for IDR/NTD is between 500 and 600 IDR per NTD
      if (effectiveRateIDRperNTD < 450 || effectiveRateIDRperNTD > 650) {
        abnormalCount++;
        abnormalList.push({
          code: p.purchaseCode || d.id,
          bookName: p.bookName,
          qty: p.qty,
          idr,
          ntdCents,
          ntd,
          effectiveRateIDRperNTD: effectiveRateIDRperNTD.toFixed(2)
        });
      } else {
        exactCount++;
      }
    }
  });

  console.log(`Total POs checked: ${posSnap.size}`);
  console.log(`Normal FX Conversion POs (450-650 IDR/NTD): ${exactCount}`);
  console.log(`Abnormal FX Conversion POs: ${abnormalCount}`);

  if (abnormalList.length > 0) {
    console.log("\nAbnormal POs details:");
    console.table(abnormalList);
  }

  process.exit(0);
}

testAllPOConversions().catch(console.error);
