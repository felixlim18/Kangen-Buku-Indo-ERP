const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = initializeApp({
  projectId: 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7'
});
const db = getFirestore(app);

async function run() {
  const snap = await db.collection('salesOrders').get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`Order: ${data.orderCode}, pickupDetails (Resi/Peng): ${data.pickupDetails}, orderNumber (No Pesanan): ${data.orderNumber}, status: ${data.status}, paymentStatus: ${data.paymentStatus}`);
  });
}
run();
