import { collection, getDocs, doc, writeBatch, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from './src/lib/firebase';
import { getNextJournalId } from './src/lib/journalUtils';

async function migrate() {
  const snap = await getDocs(collection(db, 'journalEntries'));
  
  const toMigrate: any[] = [];
  snap.docs.forEach(d => {
    if (!/^JU\d{10}$/.test(d.id)) {
      toMigrate.push({ id: d.id, ...d.data() });
    }
  });

  console.log(`Found ${toMigrate.length} journals to migrate out of ${snap.size}`);

  // Sort by createdAt or date to assign sequentially
  toMigrate.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.date).getTime();
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.date).getTime();
    return timeA - timeB;
  });

  const faSnap = await getDocs(collection(db, 'fixedAssets'));
  const amSnap = await getDocs(collection(db, 'amortizations'));
  const loanSnap = await getDocs(collection(db, 'loans'));

  for (let i = 0; i < toMigrate.length; i++) {
    const oldJrn = toMigrate[i];
    const dateStr = typeof oldJrn.date === 'string' ? oldJrn.date : 
                    (oldJrn.date?.toDate ? oldJrn.date.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    
    const newId = await getNextJournalId(dateStr);
    
    // Check if it's referenced anywhere and update
    const batch = writeBatch(db);
    
    // Fixed Assets
    faSnap.docs.forEach(faDoc => {
      let changed = false;
      const data = faDoc.data();
      if (data.acquisitionJournalId === oldJrn.id) {
        data.acquisitionJournalId = newId;
        changed = true;
      }
      if (data.postedDepreciations) {
        data.postedDepreciations.forEach((d: any) => {
          if (d.journalId === oldJrn.id) {
            d.journalId = newId;
            changed = true;
          }
        });
      }
      if (changed) batch.update(faDoc.ref, data);
    });

    // Amortizations
    amSnap.docs.forEach(amDoc => {
      let changed = false;
      const data = amDoc.data();
      if (data.acquisitionJournalId === oldJrn.id) {
        data.acquisitionJournalId = newId;
        changed = true;
      }
      if (data.postings) {
        data.postings.forEach((p: any) => {
          if (p.journalId === oldJrn.id) {
            p.journalId = newId;
            changed = true;
          }
        });
      }
      if (changed) batch.update(amDoc.ref, data);
    });

    // Loans
    loanSnap.docs.forEach(loanDoc => {
      const data = loanDoc.data();
      if (data.journalId === oldJrn.id) {
        batch.update(loanDoc.ref, { journalId: newId });
      }
    });

    // Delete old, insert new
    batch.delete(doc(db, 'journalEntries', oldJrn.id));
    const newData = { ...oldJrn, id: newId, migratedFrom: oldJrn.id };
    batch.set(doc(db, 'journalEntries', newId), newData);

    await batch.commit();
    console.log(`Migrated ${oldJrn.id} -> ${newId}`);
  }

  console.log("Migration complete!");
  process.exit(0);
}

migrate();
