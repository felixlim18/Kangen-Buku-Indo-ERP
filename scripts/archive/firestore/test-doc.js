import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc } from 'firebase/firestore';
const app = initializeApp({ projectId: 'test' });
const db = getFirestore(app);
const ref = doc(collection(db, 'test'));
console.log("ID is:", ref.id);
