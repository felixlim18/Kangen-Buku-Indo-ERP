const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

const app = initializeApp({
  credential: cert(config.serviceAccount)
});
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const snap = await db.collection('salesOrders').where('orderCode', '==', 'S260801013').get();
  if (snap.empty) {
    console.log("Not found by orderCode, checking all docs for S260801013");
    const all = await db.collection('salesOrders').get();
    let found = false;
    all.forEach(doc => {
       if (doc.id === 'S260801013' || doc.data().orderCode === 'S260801013') {
          console.log("Found:", JSON.stringify(doc.data(), null, 2));
          found = true;
       }
    });
    if (!found) console.log("Still not found");
  } else {
    snap.forEach(doc => {
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  }
}
run();
