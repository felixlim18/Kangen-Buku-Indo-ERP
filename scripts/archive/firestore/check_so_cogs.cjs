const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7' });
const db = getFirestore(app);

async function run() {
  const snap = await db.collection('salesOrders').orderBy('createdAt', 'desc').limit(5).get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log('--- SO:', data.orderCode || data.id, 'TotalPrice:', data.totalPrice);
    if (data.items) {
       data.items.forEach(i => console.log('Item COGS:', i.cogsSnapshot, 'qty:', i.qty, 'Price:', i.unitPrice));
    }
  });
}
run();
