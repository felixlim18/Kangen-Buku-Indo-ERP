import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

async function run() {
  const snap = await getDocs(collection(db, 'salesOrders'));
  
  snap.forEach(async docSnap => {
    const data = docSnap.data();
    if (data.status === 'cancelled' && data.diambilAt && data.precedingStatus !== 'returned') {
      await updateDoc(doc(db, 'salesOrders', docSnap.id), {
        precedingStatus: 'returned'
      });
      console.log(`Fixed precedingStatus for order ${data.orderCode}`);
    }
  });

  setTimeout(() => process.exit(0), 3000);
}
run().catch(console.error);
