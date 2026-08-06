import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    // Wait, earlier getDocs(collection(db, 'coaAccounts')) returned 0. Let's try 'accounts' or 'coaAccounts' or 'coa'
    const c1 = await getDocs(collection(db, 'coaAccounts'));
    console.log('coaAccounts:', c1.docs.length);
    
    // Some versions used 'coa' or 'accounts'
    const c2 = await getDocs(collection(db, 'accounts'));
    console.log('accounts:', c2.docs.length);
    
    // Maybe we just check the source code for the collection name
    process.exit(0);
}
run().catch(console.error);
