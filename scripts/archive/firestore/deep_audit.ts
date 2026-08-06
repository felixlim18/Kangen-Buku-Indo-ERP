import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function deepAudit() {
  console.log("=== DEEP AUDIT OF PURCHASE ORDERS & EXCHANGE RATES ===");
  const posSnap = await getDocs(collection(db, 'purchaseOrders'));
  const pos = posSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

  console.log(`\nFound ${pos.length} Purchase Orders in Firestore.`);
  
  let poErrors: string[] = [];

  pos.forEach((po: any) => {
    const code = po.purchaseCode || po.docId;
    const priceIDR = po.purchasePriceIDR || 0;
    const priceNTD = po.purchasePriceNTD || 0;
    const qty = po.qty || 0;
    const fxRate = po.fxRateUsed || 0;

    // In KangenBukuIndo:
    // fxRateUsed is stored either as IDR per NTD (e.g. 487.8 IDR = 1 NTD, so NTD = IDR / rate)
    // or as NTD per 10000 IDR or direct multiplier.
    // Let's check how the system converts IDR -> NTD in code.
    // Usually: priceNTD (in cents) = Math.round((priceIDR * qty) / fxRate * 100) or similar.
    
    // Let's check calculation
    const calcTotalIDR = priceIDR * qty;
    let expectedNTD = 0;
    if (fxRate > 0) {
      if (fxRate > 100) {
        // e.g. 500 IDR / NTD
        expectedNTD = calcTotalIDR / fxRate;
      } else {
        expectedNTD = calcTotalIDR * fxRate;
      }
    }

    console.log(`PO: ${code} | Book: ${po.bookName} | Qty: ${qty} | PriceIDR: ${priceIDR} | TotalIDR: ${calcTotalIDR} | Rate: ${fxRate} | Stored NTD: ${priceNTD} | Expected NTD: ${expectedNTD.toFixed(2)} | Status: ${po.status}`);

    if (Math.abs(priceNTD - expectedNTD) > 5 && expectedNTD > 0) {
      poErrors.push(`PO ${code}: Stored NTD = ${priceNTD}, Expected NTD = ${expectedNTD.toFixed(2)} (Diff = ${(priceNTD - expectedNTD).toFixed(2)})`);
    }
  });

  console.log("\n=== DISCREPANCIES IN POs ===");
  if (poErrors.length === 0) {
    console.log("No price/rate conversion discrepancies found in PO records.");
  } else {
    poErrors.forEach(e => console.log(" - " + e));
  }

  // Next: Audit Journal Entries for Inventory vs Perpetual Inventory calculation
  console.log("\n=== AUDITING INVENTORY RECONCILIATION ===");
  const journalsSnap = await getDocs(collection(db, 'journalEntries'));
  let total1201Debit = 0;
  let total1201Credit = 0;
  let total1202Debit = 0;
  let total1202Credit = 0;

  journalsSnap.docs.forEach(d => {
    const data = d.data();
    const lines = data.lines || [];
    lines.forEach((l: any) => {
      const code = (l.accountCode || '').trim();
      const name = (l.account || '').trim().toLowerCase();
      if (code === '1201' || name === 'inventory on hand') {
        total1201Debit += (l.debit || 0);
        total1201Credit += (l.credit || 0);
      }
      if (code === '1202' || name === 'inventory in delivery') {
        total1202Debit += (l.debit || 0);
        total1202Credit += (l.credit || 0);
      }
    });
  });

  const net1201Cents = total1201Debit - total1201Credit;
  const net1202Cents = total1202Debit - total1202Credit;
  const netTotalInventoryLedgerNTD = (net1201Cents + net1202Cents) / 100;

  console.log(`Journal Ledger 1201 (On Hand) Net: NT$ ${(net1201Cents / 100).toLocaleString()}`);
  console.log(`Journal Ledger 1202 (In Delivery) Net: NT$ ${(net1202Cents / 100).toLocaleString()}`);
  console.log(`Total Inventory Account (1201+1202) in Journals: NT$ ${netTotalInventoryLedgerNTD.toLocaleString()}`);

  process.exit(0);
}

deepAudit().catch(console.error);
