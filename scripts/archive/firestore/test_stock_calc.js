import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

async function run() {
  const books = (await getDocs(collection(db, 'inventory'))).docs.map(d => ({id: d.id, ...d.data()}));
  const salesOrders = (await getDocs(collection(db, 'salesOrders'))).docs.map(d => ({id: d.id, ...d.data()}));
  const damagedRecords = (await getDocs(collection(db, 'damagedStock'))).docs.map(d => ({id: d.id, ...d.data()}));
  const ledgerEntries = (await getDocs(collection(db, 'inventoryLedger'))).docs.map(d => ({id: d.id, ...d.data()}));
  const purchaseOrders = (await getDocs(collection(db, 'purchaseOrders'))).docs.map(d => ({id: d.id, ...d.data()}));

  const bookId = books.find(b => b.bookName === 'Becoming Supernatural')?.id;
  if(!bookId) return console.log('Book not found');

  const validPoIds = new Set(purchaseOrders.map((p) => p.id));

  let initial = books.find(b => b.id === bookId)?.initialStock || 0;
  let received = 0;
  ledgerEntries.forEach(e => {
     if (e.bookId === bookId && e.type === 'purchase_received' && validPoIds.has(e.refId)) {
        received += e.qtyDelta || 0;
     }
  });

  let shipped = 0;
  salesOrders.forEach(so => {
    if (so.status === 'packed' || so.status === 'shipped' || so.status === 'confirmed' || so.status === 'completed' || (so.status === 'returned' && !so.diambilAt)) {
      so.items?.forEach(item => {
        if (item.bookId === bookId && !item.markedTertinggal && !item.markedRefund) {
          shipped += item.qty || 0;
        }
      });
    }
  });

  let damaged = 0;
  damagedRecords.forEach(rec => {
    if (rec.bookId === bookId) {
      const isSurplus = rec.adjustmentType === 'Barang Lebih' || rec.type === 'surplus';
      damaged += isSurplus ? -(rec.qty || 0) : (rec.qty || 0);
    }
  });

  console.log(`Initial: ${initial}, Received: ${received}, Shipped: ${shipped}, Damaged: ${damaged}`);
  console.log(`Stok Digudang: ${initial + received - shipped - damaged}`);

  // Print all SOs containing this book that are shipped
  console.log('Shipped SOs:');
  salesOrders.forEach(so => {
    so.items?.forEach(item => {
      if (item.bookId === bookId && !item.markedTertinggal && !item.markedRefund) {
        console.log(`- SO ${so.orderCode}: status=${so.status}, qty=${item.qty}, diambilAt=${!!so.diambilAt}`);
      }
    });
  });
}
run().catch(console.error);
