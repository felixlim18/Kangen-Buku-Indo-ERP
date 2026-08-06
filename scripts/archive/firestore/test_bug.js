import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('/app/firebase-service-account.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const booksSnap = await db.collection('inventory').get();
  const salesOrdersSnap = await db.collection('salesOrders').get();
  
  let returnedOrders = [];
  salesOrdersSnap.forEach(snap => {
    let so = snap.data();
    if (so.status === 'returned' || so.status === 'cancelled') {
      returnedOrders.push({ id: snap.id, ...so });
    }
  });

  console.log(`Found ${returnedOrders.length} returned/cancelled orders`);
  for (let so of returnedOrders) {
    if (so.diambilAt) {
      console.log(`Order ${so.orderCode}: ${so.status} with diambilAt`);
    } else {
      console.log(`Order ${so.orderCode}: ${so.status} WITHOUT diambilAt`);
    }
  }
}
run().catch(console.error);
