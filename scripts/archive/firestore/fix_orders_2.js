import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

async function run() {
  const snap = await getDocs(collection(db, 'salesOrders'));
  const fixedOrders = [];
  const fixedItems = new Set();
  
  snap.forEach(docSnap => {
    const data = docSnap.data();
    // Revert what I changed:
    if (data.status === 'returned' && data.diambilAt) {
      fixedOrders.push({ id: docSnap.id, ...data });
      if (data.items) {
        data.items.forEach(item => {
           if (item.bookName) fixedItems.add(item.bookName);
        });
      }
    }
  });

  console.log(`Found ${fixedOrders.length} orders to fix.`);
  for (const order of fixedOrders) {
    await updateDoc(doc(db, 'salesOrders', order.id), {
      status: 'cancelled'
    });
    console.log(`Fixed order ${order.orderCode}`);
  }
  
  console.log('Fixed item names:');
  console.log(Array.from(fixedItems).join(', '));
  process.exit(0);
}
run().catch(console.error);
