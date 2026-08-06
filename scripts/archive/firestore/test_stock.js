import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('/app/firebase-service-account.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const booksSnap = await db.collection('inventory').get();
  const salesOrdersSnap = await db.collection('salesOrders').get();
  
  const books = booksSnap.docs.map(d => ({id: d.id, ...d.data()}));
  const salesOrders = salesOrdersSnap.docs.map(d => ({id: d.id, ...d.data()}));
  
  let returnedOrders = salesOrders.filter(so => so.status === 'returned' || so.status === 'cancelled');
  console.log(`Found ${returnedOrders.length} returned/cancelled orders`);
  
  returnedOrders.forEach(o => {
    if(o.diambilAt) {
       console.log(`Order ${o.orderCode || o.id} is ${o.status} with diambilAt set.`);
    } else if (o.status === 'returned') {
       console.log(`Order ${o.orderCode || o.id} is returned without diambilAt.`);
    }
  });

}
run().catch(console.error);
