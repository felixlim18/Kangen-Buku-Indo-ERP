import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function checkDb() {
  const freightSnap = await getDocs(collection(db, 'freightIn'));
  const freightList: any[] = [];
  freightSnap.forEach(doc => {
    freightList.push({ id: doc.id, ...doc.data() });
  });

  const poSnap = await getDocs(collection(db, 'purchaseOrders'));
  const poList: any[] = [];
  poSnap.forEach(doc => {
    poList.push({ id: doc.id, ...doc.data() });
  });

  const journalSnap = await getDocs(collection(db, 'journalEntries'));
  const journalList: any[] = [];
  journalSnap.forEach(doc => {
    journalList.push({ id: doc.id, ...doc.data() });
  });

  fs.writeFileSync('./db_status.json', JSON.stringify({
    freightList,
    poList: poList.map(p => ({
      id: p.id,
      purchaseCode: p.purchaseCode,
      status: p.status,
      kodeEkspedisi: p.kodeEkspedisi || '',
      receipts: p.receipts || []
    })),
    journalList: journalList.map(j => ({
      id: j.id,
      description: j.description,
      refId: j.refId,
      refType: j.refType
    }))
  }, null, 2));

  console.log('Database snapshot written to db_status.json');
}

checkDb()
  .then(async () => {
    await deleteApp(app);
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Error checking db:', err);
    await deleteApp(app);
    process.exit(1);
  });
