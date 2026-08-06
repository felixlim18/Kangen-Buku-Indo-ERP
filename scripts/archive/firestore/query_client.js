import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
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
    console.log(doc.id, " => ", JSON.stringify(doc.data(), null, 2));
  });
}
run();
