import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    const jSnap = await getDocs(collection(db, 'journalEntries'));
    const journals = jSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
    fs.writeFileSync('journals.json', JSON.stringify(journals, null, 2));
    console.log(`Saved ${journals.length} journals.`);
    
    const coaSnap = await getDocs(collection(db, 'coaAccounts'));
    const coa = coaSnap.docs.map(d => ({id: d.id, ...d.data()}));
    fs.writeFileSync('coa.json', JSON.stringify(coa, null, 2));
    console.log(`Saved ${coa.length} coa accounts.`);
    
    process.exit(0);
}

run().catch(console.error);
