import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function main() {
    const snap = await getDocs(collection(db, 'journalEntries'));
    snap.forEach(d => {
        if (d.id.startsWith('JU260731')) {
            console.log("Found JU ID:", d.id, "Description:", d.data().description);
        }
    });
    process.exit(0);
}
main().catch(console.error);
