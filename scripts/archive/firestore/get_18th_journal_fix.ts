import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function main() {
    const snap = await getDocs(collection(db, 'journalEntries'));
    let entries = [];
    snap.forEach(d => {
        entries.push({...d.data(), docId: d.id});
    });
    
    // filter to 2026-07-31
    const july31 = entries.filter(e => {
        const dateObj = e.date?.seconds 
           ? new Date(e.date.seconds * 1000) 
           : (e.date instanceof Date ? e.date : (e.date ? new Date(e.date) : new Date()));
        
        let yy = '26';
        let mm = '01';
        let dd = '01';
        
        if (!isNaN(dateObj.getTime())) {
          yy = String(dateObj.getFullYear()).slice(-2);
          mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          dd = String(dateObj.getDate()).padStart(2, '0');
        }
        return `${yy}${mm}${dd}` === '260731';
    });

    july31.sort((a, b) => {
        const timeA = a.date?.seconds 
           ? a.date.seconds * 1000 
           : (a.date instanceof Date ? a.date.getTime() : (a.date ? new Date(a.date).getTime() : 0));
        const timeB = b.date?.seconds 
           ? b.date.seconds * 1000 
           : (b.date instanceof Date ? b.date.getTime() : (b.date ? new Date(b.date).getTime() : 0));
        
        if (timeA !== timeB) return timeA - timeB;
        
        const createdA = a.createdAt?.seconds ? a.createdAt.seconds : 0;
        const createdB = b.createdAt?.seconds ? b.createdAt.seconds : 0;
        if (createdA !== createdB) {
          return createdA - createdB;
        }
        
        return (a.id || a.docId).localeCompare(b.id || b.docId);
    });

    july31.forEach((e, idx) => {
        const sequence = idx + 1;
        const displayJournalId = `JU260731${String(sequence).padStart(2, '0')}`;
        if (displayJournalId === 'JU26073118') {
             console.log("MATCH:", displayJournalId);
             console.log(JSON.stringify(e, null, 2));
        }
    });

    process.exit(0);
}
main().catch(console.error);
