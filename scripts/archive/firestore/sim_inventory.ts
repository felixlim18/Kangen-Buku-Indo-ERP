import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function sim() {
  const booksSnap = await getDocs(collection(db, 'books'));
  const books = booksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const ledgerSnap = await getDocs(collection(db, 'inventoryLedger'));
  const ledgerEntries = ledgerSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const poSnap = await getDocs(collection(db, 'purchaseOrders'));
  const purchaseOrders = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const fiSnap = await getDocs(collection(db, 'freightIn'));
  const freightIns = fiSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Build events per book as done in calculatePerpetualInventoryState
  function calculatePerpetualInventoryState(bookId: string, upToMonthStr: string) {
    const bookEntries = ledgerEntries.filter((e: any) => {
      if (e.bookId !== bookId) return false;
      const ts = e.date || e.timestamp;
      let dateObj: Date | null = null;
      if (ts?.toDate) dateObj = ts.toDate();
      else if (ts?.seconds) dateObj = new Date(ts.seconds * 1000);
      else if (ts) dateObj = new Date(ts);
      if (!dateObj || isNaN(dateObj.getTime())) return false;

      const [y, m] = upToMonthStr.split('-').map(Number);
      const endOfMonth = new Date(y, m, 1);
      return dateObj < endOfMonth;
    });

    // Sort entries by date
    bookEntries.sort((a: any, b: any) => {
      const tA = a.date?.seconds || a.timestamp?.seconds || 0;
      const tB = b.date?.seconds || b.timestamp?.seconds || 0;
      return tA - tB;
    });

    let runningStock = 0;
    let runningValueCents = 0;
    let currentAverageCost = 0;

    for (const entry of bookEntries) {
      if (entry.type === 'INITIAL_STOCK' || entry.type === 'purchase_received' || entry.type === 'PURCHASE') {
        const qty = entry.qtyDelta || entry.qty || 0;
        const costPerUnit = entry.costPerUnitCents || (entry.totalCostCents ? entry.totalCostCents / qty : 0);
        runningStock += qty;
        runningValueCents += (qty * costPerUnit);
        if (runningStock > 0) currentAverageCost = runningValueCents / runningStock;
      } else if (entry.type === 'DISPATCHED' || entry.type === 'SALE' || entry.type === 'OUTFLOW') {
        const qty = Math.abs(entry.qtyDelta || entry.qty || 0);
        const hppCents = qty * currentAverageCost;
        runningStock = Math.max(0, runningStock - qty);
        runningValueCents = Math.max(0, runningValueCents - hppCents);
      }
    }

    return { runningStock, runningValueCents, currentAverageCost };
  }

  let totalReportValuationCents = 0;
  let booksWithValue = 0;

  books.forEach((book: any) => {
    const state = calculatePerpetualInventoryState(book.id, '2026-07');
    totalReportValuationCents += state.runningValueCents;
    if (state.runningStock > 0 || state.runningValueCents > 0) {
      booksWithValue++;
    }
  });

  console.log(`Report Valuation Sum (Physical Perpetual Value): NT$ ${(totalReportValuationCents / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}`);

  // Now calculate DB Inventory Balance (Journal Entries 1201 + 1202)
  const journalsSnap = await getDocs(collection(db, 'journalEntries'));
  let totalDebit = 0;
  let totalCredit = 0;

  journalsSnap.docs.forEach(d => {
    const entry: any = d.data();
    const entryDate = entry.date?.toDate ? entry.date.toDate() : new Date(entry.date?.seconds * 1000 || entry.date);
    if (entryDate >= new Date(2026, 7, 1)) return; // up to July 2026 end

    entry.lines?.forEach((line: any) => {
      const codeClean = (line.accountCode || '').trim();
      const nameLower = (line.account || '').trim().toLowerCase();
      if (
        codeClean === '1201' || 
        nameLower === 'inventory on hand' ||
        codeClean === '1202' ||
        nameLower === 'inventory in delivery'
      ) {
        totalDebit += line.debit || 0;
        totalCredit += line.credit || 0;
      }
    });
  });

  const dbInventoryBalanceNTD = (totalDebit - totalCredit) / 100;
  console.log(`DB Journal Inventory Balance (1201 + 1202): NT$ ${dbInventoryBalanceNTD.toLocaleString('en-US', {minimumFractionDigits: 2})}`);

  const diffNTD = (totalReportValuationCents / 100) - dbInventoryBalanceNTD;
  console.log(`Difference (Report - Journal): NT$ ${diffNTD.toLocaleString('en-US', {minimumFractionDigits: 2})}`);

  process.exit(0);
}

sim().catch(console.error);
