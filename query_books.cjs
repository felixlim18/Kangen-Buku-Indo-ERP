const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
async function run() {
  const snapshot = await db.collection("books").get();
  console.log(`Found ${snapshot.size} books total.`);
  
  const activeBooks = snapshot.docs.filter(d => d.data().isActive);
  console.log(`Found ${activeBooks.length} ACTIVE books.`);
  
  const matchingBooks = snapshot.docs.filter(d => {
    const data = d.data();
    return data.bookName && data.bookName.toLowerCase().includes("mahir");
  });
  console.log(`Books matching "mahir":`);
  matchingBooks.forEach(d => console.log(d.id, d.data().bookName, "isActive:", d.data().isActive));
}
run();
