import { db } from './src/lib/firebase.ts';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

async function main() {
    const q = query(collection(db, 'journalEntries'));
    const snap = await getDocs(q);
    let found = false;
    snap.forEach(d => {
        if (d.id === 'JU26073118') {
            console.log("Found EXACT MATCH:", JSON.stringify(d.data(), null, 2));
            found = true;
        } else if (d.id.includes('JU260731')) {
            console.log("Found related (JU260731):", d.id, JSON.stringify(d.data(), null, 2));
        }
    });
    if (!found) console.log("Not found anywhere.");
    process.exit(0);
}
main().catch(console.error);
