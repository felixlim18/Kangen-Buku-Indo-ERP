// Read-only diagnostic script: replicate InventoryTab.tsx reconciliation logic
// against live Firestore data to find which book(s)/month(s) drive the mismatch.
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json');
const app = initializeApp({ credential: cert(serviceAccount), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

function toDate(ts) {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function getBookQtyInReceipt(po, r, bookId) {
  const poItems = po.items || [];
  const hasBook = poItems.some((it) => it.bookId === bookId);
  if (!hasBook) return 0;
  if (poItems.length <= 1) return r.receivedQty || 0;
  const matchedItem = poItems.find((it) => it.bookId === bookId);
  if (!matchedItem) return 0;
  const totalPoQty = poItems.reduce((acc, it) => acc + (it.qty || 0), 0) || 1;
  const itemPoQty = matchedItem.qty || 0;
  return Math.round((itemPoQty / totalPoQty) * (r.receivedQty || 0));
}

async function main() {
  console.log('Fetching collections...');
  const [booksSnap, invSnap, ledgerSnap, poSnap, soSnap, freightSnap, journalSnap, damagedSnap] = await Promise.all([
    db.collection('catalog').get(),
    db.collection('inventory').get(),
    db.collection('inventoryLedger').get(),
    db.collection('purchaseOrders').get(),
    db.collection('salesOrders').get(),
    db.collection('freightIn').get(),
    db.collection('journalEntries').get(),
    db.collection('damagedStock').get().catch(() => ({ docs: [] })),
  ]);

  const books = booksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const inventoryList = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const ledgerEntries = ledgerSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const purchaseOrders = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const salesOrders = soSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const freightIn = freightSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const journals = journalSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const damagedRecords = damagedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Loaded: books=${books.length} inv=${inventoryList.length} ledger=${ledgerEntries.length} po=${purchaseOrders.length} so=${salesOrders.length} freight=${freightIn.length} journals=${journals.length} damaged=${damagedRecords.length}`);

  function isFreightCodeCapitalized(fCode) {
    const cleanFCode = fCode.toUpperCase().trim();
    const fRecord = freightIn.find(f => f.freightCode?.toUpperCase().trim() === cleanFCode);
    if (fRecord && fRecord.isCapitalized) return true;
    return journals.some(j =>
      (j.freightCode?.toUpperCase() === cleanFCode || j.refId?.toUpperCase() === cleanFCode) &&
      (j.description || '').toUpperCase().includes('KAPITALISASI')
    );
  }

  function calculatePerpetualInventoryState(bookId, upToMonthStr) {
    const bookInventory = inventoryList.find(i => i.bookId === bookId);
    const initialStock = bookInventory ? (bookInventory.initialStock || 0) : 0;
    let runningStock = initialStock;
    let runningValueCents = 0;
    let currentAverageCost = 0;

    let endOfMonth = null;
    if (upToMonthStr) {
      const [year, month] = upToMonthStr.split('-').map(Number);
      endOfMonth = new Date(year, month, 1);
    }

    const poReceiptEvents = ledgerEntries
      .filter(e => e.bookId === bookId && e.type === 'purchase_received' && e.reversed !== true)
      .map(entry => {
        let cost = 0;
        if (entry.unitCost !== undefined && entry.unitCost !== null && entry.unitCost > 0) {
          cost = (entry.qtyDelta || 0) * entry.unitCost;
        } else {
          const po = purchaseOrders.find(p => p.id === entry.refId);
          if (po) {
            if (po.items && po.items.length > 0) {
              const poItem = po.items.find(it => it.bookId === bookId);
              if (poItem) {
                const discount = po.discount || 0;
                const totalQtyOrdered = po.items.reduce((acc, it) => acc + (it.qty || 0), 0) || 1;
                const diskon_per_buku = discount * ((poItem.qty || 0) / totalQtyOrdered);
                const netItemPriceNTDTotal = (poItem.priceNTDTotal || 0) - diskon_per_buku;
                const netUnitCost = poItem.qty > 0 ? (netItemPriceNTDTotal / poItem.qty) : (poItem.pricePerItem || 0);
                cost = (entry.qtyDelta || 0) * netUnitCost;
              } else {
                cost = (entry.qtyDelta || 0) * (entry.unitCost || 0);
              }
            } else {
              const netUnitCost = po.qty > 0 ? (po.purchasePriceNTD / po.qty) : (po.pricePerUnitNTD || 0);
              cost = (entry.qtyDelta || 0) * netUnitCost;
            }
          } else {
            cost = (entry.qtyDelta || 0) * (entry.unitCost || 0);
          }
        }
        return { type: 'purchase_received', timestamp: entry.timestamp, qtyDelta: entry.qtyDelta || 0, cost, refId: entry.refId, id: entry.id };
      });

    const bookPos = purchaseOrders.filter(p =>
      p.status !== 'cancelled' &&
      p.receipts && p.receipts.length > 0 &&
      (p.bookId === bookId || (p.items && p.items.some(it => it.bookId === bookId)))
    );

    const freightCapitalizationEvents = [];
    freightIn.forEach(fRec => {
      if (!fRec.freightCode) return;
      if (!isFreightCodeCapitalized(fRec.freightCode)) return;
      const fCode = fRec.freightCode.toUpperCase().trim();
      let totalQtyReceivedInFreight = 0;
      purchaseOrders.forEach(p => {
        if (p.receipts && p.receipts.length > 0) {
          p.receipts.forEach(rx => {
            if (rx.kodeEkspedisi && rx.kodeEkspedisi.toUpperCase().trim() === fCode) {
              totalQtyReceivedInFreight += rx.receivedQty || 0;
            }
          });
        } else if (p.kodeEkspedisi && p.kodeEkspedisi.toUpperCase().trim() === fCode) {
          totalQtyReceivedInFreight += p.qtyReceived || p.qty || 0;
        }
      });
      if (totalQtyReceivedInFreight <= 0) return;
      const usedFallback = !fRec.totalHargaPengirimanNTD && !fRec.exchangeRate;
      const totalFreightNTDCents = fRec.totalHargaPengirimanNTD
        ? Math.round(fRec.totalHargaPengirimanNTD * 100)
        : Math.round((fRec.totalKg || 0) * (fRec.ratePerKg || 0) * (fRec.exchangeRate || 0.0017801) * 100);

      bookPos.forEach(po => {
        po.receipts.forEach(r => {
          if (r.kodeEkspedisi && r.kodeEkspedisi.toUpperCase().trim() === fCode) {
            const qtyReceived = getBookQtyInReceipt(po, r, bookId);
            if (qtyReceived > 0) {
              const freightAllocatedCents = Math.round((qtyReceived / totalQtyReceivedInFreight) * totalFreightNTDCents);
              const timestamp = fRec.createdAt || new Date();
              freightCapitalizationEvents.push({ type: 'freight_capitalized', timestamp, freightAllocatedCents, freightCode: fRec.freightCode, usedFallback });
            }
          }
        });
      });
    });

    const activeSalesOrders = salesOrders.filter(so => so.status === 'completed' && so.items && so.items.some(it => it.bookId === bookId));
    const dispatchedLedgerEntries = ledgerEntries.filter(e => e.bookId === bookId && e.type === 'DISPATCHED' && e.reversed !== true);
    const completedCogsJournals = journals.filter(j => j.refType === 'sales_order_completed' && (j.lines || []).some(l => (l.accountCode || '').trim() === '1202'));
    const salesOutflows = activeSalesOrders.map(so => {
      const item = so.items.find(it => it.bookId === bookId);
      const qty = item?.qty || 0;
      const completedJournal = completedCogsJournals.find(j => j.refId === so.id);
      const dispatchEntry = dispatchedLedgerEntries.find(e => e.refId === so.id);
      return { type: 'outflow', timestamp: completedJournal ? completedJournal.date : (dispatchEntry ? dispatchEntry.timestamp : (so.orderDate || so.createdAt)), qtyDelta: qty, refId: so.id, id: so.id, cogsSnapshot: item?.cogsSnapshot };
    });

    const damagedOutflows = ledgerEntries
      .filter(e => e.bookId === bookId && e.reversed !== true && e.type === 'damaged_stock')
      .map(entry => ({ type: 'outflow', timestamp: entry.timestamp, qtyDelta: Math.abs(entry.qtyDelta || 0), refId: entry.refId, id: entry.id }));

    const outflowEvents = [...salesOutflows, ...damagedOutflows];
    const allEvents = [...poReceiptEvents, ...freightCapitalizationEvents, ...outflowEvents];
    allEvents.sort((a, b) => {
      const dateA = toDate(a.timestamp).getTime();
      const dateB = toDate(b.timestamp).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const order = t => t === 'purchase_received' ? 1 : t === 'freight_capitalized' ? 2 : 3;
      return order(a.type) - order(b.type);
    });

    let usedFreightFallbackCount = 0;
    for (const event of allEvents) {
      if (endOfMonth && toDate(event.timestamp) >= endOfMonth) break;
      if (event.type === 'purchase_received') {
        runningStock += event.qtyDelta;
        runningValueCents += event.cost;
        currentAverageCost = runningStock > 0 ? runningValueCents / runningStock : 0;
      } else if (event.type === 'freight_capitalized') {
        if (event.usedFallback) usedFreightFallbackCount++;
        runningValueCents += event.freightAllocatedCents;
        currentAverageCost = runningStock > 0 ? runningValueCents / runningStock : 0;
      } else if (event.type === 'outflow') {
        const hppCents = event.qtyDelta * currentAverageCost;
        runningStock = Math.max(0, runningStock - event.qtyDelta);
        runningValueCents = Math.max(0, runningValueCents - hppCents);
      }
    }
    return { runningStock, runningValueCents, currentAverageCost, usedFreightFallbackCount };
  }

  function computeReportValuationSum(monthStr) {
    let sum = 0;
    const perBook = [];
    for (const book of books) {
      const state = calculatePerpetualInventoryState(book.id, monthStr);
      sum += state.runningValueCents;
      perBook.push({ bookId: book.id, bookName: book.bookName, valueCents: state.runningValueCents, stock: state.runningStock, avgCost: state.currentAverageCost });
    }
    return { sum: sum / 100, perBook };
  }

  function computeDbInventoryBalance(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    const endOfMonth = new Date(year, month, 1);
    let totalDebit = 0, totalCredit = 0;
    journals.forEach(entry => {
      const entryDate = toDate(entry.date);
      if (entryDate >= endOfMonth) return;
      (entry.lines || []).forEach(line => {
        const codeClean = (line.accountCode || '').trim();
        const nameLower = (line.account || '').trim().toLowerCase();
        if (codeClean === '1201' || nameLower === 'inventory on hand' || codeClean === '1202' || nameLower === 'inventory in delivery') {
          totalDebit += line.debit || 0;
          totalCredit += line.credit || 0;
        }
      });
    });
    return (totalDebit - totalCredit) / 100;
  }

  // Determine month range to scan: from earliest ledger/journal entry to current month
  const allDates = [
    ...ledgerEntries.map(e => toDate(e.timestamp)),
    ...journals.map(j => toDate(j.date)),
  ].filter(d => d.getTime() > 0);
  if (allDates.length === 0) {
    console.log('No dated records found.');
    return;
  }
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const now = new Date();
  const months = [];
  let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor <= now) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  console.log(`\nScanning ${months.length} months from ${months[0]} to ${months[months.length - 1]}...\n`);
  console.log('Month      | ReportValuationSum | DbInventoryBalance | Mismatch');
  console.log('-----------|--------------------:|-------------------:|---------:');

  const results = [];
  for (const m of months) {
    const { sum, perBook } = computeReportValuationSum(m);
    const bal = computeDbInventoryBalance(m);
    const mismatch = sum - bal;
    results.push({ month: m, sum, bal, mismatch, perBook });
    if (Math.abs(mismatch) > 0.05) {
      console.log(`${m}    | ${sum.toFixed(2).padStart(19)} | ${bal.toFixed(2).padStart(18)} | ${mismatch.toFixed(2)}`);
    }
  }

  // Find month closest to target mismatch 6689.35
  const target = 6689.35;
  let closest = results.reduce((best, r) => Math.abs(Math.abs(r.mismatch) - target) < Math.abs(Math.abs(best.mismatch) - target) ? r : best, results[0]);
  console.log(`\nClosest match to target 6689.35 -> month=${closest.month} mismatch=${closest.mismatch.toFixed(2)}`);

  // For that month, show per-book contribution vs prior month to isolate which books/events drive it
  console.log(`\nTop 15 books by |value| contribution in ${closest.month}:`);
  const sortedBooks = [...closest.perBook].sort((a, b) => Math.abs(b.valueCents) - Math.abs(a.valueCents)).slice(0, 15);
  sortedBooks.forEach(b => console.log(`  ${b.bookName || b.bookId}: value=${(b.valueCents/100).toFixed(2)} stock=${b.stock} avgCost=${(b.avgCost/100).toFixed(4)}`));

  // Diagnostics: freight fallback usage, PO edits after ship, mismatched outflow months
  console.log('\n--- Freight records missing exchangeRate/totalHargaPengirimanNTD (fallback used) ---');
  freightIn.forEach(f => {
    if (!f.totalHargaPengirimanNTD && !f.exchangeRate) {
      console.log(`  freightCode=${f.freightCode} totalKg=${f.totalKg} ratePerKg=${f.ratePerKg} (would use fallback 0.0017801)`);
    }
  });

  console.log('\n--- Sales orders where orderDate month != journal (sales_order_shipped) date month ---');
  let mismatchCount = 0;
  for (const so of salesOrders) {
    if (so.status !== 'completed' && so.status !== 'confirmed') continue;
    const shippedJournal = journals.find(j => j.refId === so.id && j.refType === 'sales_order_shipped');
    if (!shippedJournal) continue;
    const soDate = toDate(so.orderDate || so.createdAt);
    const jDate = toDate(shippedJournal.date);
    const soMonth = `${soDate.getFullYear()}-${String(soDate.getMonth()+1).padStart(2,'0')}`;
    const jMonth = `${jDate.getFullYear()}-${String(jDate.getMonth()+1).padStart(2,'0')}`;
    if (soMonth !== jMonth) {
      mismatchCount++;
      if (mismatchCount <= 20) {
        console.log(`  SO ${so.orderCode || so.id}: orderDate month=${soMonth} vs shippedJournal month=${jMonth}`);
      }
    }
  }
  console.log(`Total SO with month mismatch: ${mismatchCount}`);

  console.log('\n--- Full month-by-month summary (all months, including near-zero) ---');
  results.forEach(r => {
    console.log(`${r.month}: report=${r.sum.toFixed(2)} db=${r.bal.toFixed(2)} mismatch=${r.mismatch.toFixed(2)}`);
  });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
