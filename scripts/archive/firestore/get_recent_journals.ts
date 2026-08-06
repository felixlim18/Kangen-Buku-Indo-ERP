import { db } from './src/lib/firebase.ts';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

async function main() {
    const q = query(collection(db, 'journalEntries'), orderBy('date', 'desc'), limit(10));
    const snap = await getDocs(q);
    snap.forEach(d => {
        console.log("ID:", d.id, "Description:", d.data().description);
    });
    process.exit(0);
}
main().catch(console.error);
