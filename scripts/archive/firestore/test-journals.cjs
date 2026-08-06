const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp({ projectId: 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7' });
const db = getFirestore();

async function run() {
  const snap = await db.collection('journalEntries').where('refId', '>=', 'ADJ-INV-').where('refId', '<=', 'ADJ-INV-\uf8ff').get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`Journal ${doc.id}: date=${data.date?.toDate().toISOString()}, refId=${data.refId}, lines=`, data.lines);
  });
}
run();
