import { db } from './src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';

async function inspectLedger() {
  const ledgerSnap = await getDocs(collection(db, 'inventoryLedger'));
  console.log("Total inventoryLedger documents:", ledgerSnap.size);
  if (ledgerSnap.size > 0) {
    const sample = ledgerSnap.docs[0].data();
    console.log("Sample ledger doc:", JSON.stringify(sample, null, 2));
  }

  // Count by type
  const types: Record<string, number> = {};
  ledgerSnap.docs.forEach(d => {
    const t = d.data().type || 'UNKNOWN';
    types[t] = (types[t] || 0) + 1;
  });
  console.log("Ledger types distribution:", types);

  process.exit(0);
}

inspectLedger().catch(console.error);
