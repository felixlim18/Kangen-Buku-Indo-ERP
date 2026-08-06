import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = query(collection(db, "salesOrders"), where("orderCode", "==", "S260801013"));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    console.log("No matching documents.");
  }
  querySnapshot.forEach((doc) => {
    console.log("Document ID:", doc.id);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
  
  // also get the most recent orders if this didn't find anything
  if(querySnapshot.empty) {
     const q2 = query(collection(db, "salesOrders"), orderBy("createdAt", "desc"), limit(5));
     const snap = await getDocs(q2);
     snap.forEach(doc => console.log("Recent SO:", doc.id, doc.data().orderCode, " totalPrice:", doc.data().totalPrice));
  }
  process.exit(0);
}
run();
