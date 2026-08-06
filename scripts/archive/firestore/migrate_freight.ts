import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function runMigration() {
  console.log('--- Starting Freight-In Backfill/Migration ---');
  
  const freightSnap = await getDocs(collection(db, 'freightIn'));
  console.log(`Found ${freightSnap.size} freightIn documents in total.`);

  for (const fDoc of freightSnap.docs) {
    const data = fDoc.data();
    const freightCode = data.freightCode || fDoc.id;
    console.log(`Processing Freight-In: ${freightCode} (DocNo: ${data.docNo || 'N/A'})`);

    const ratePerKg = data.ratePerKg || 0;
    const totalKg = data.totalKg || 0;
    const calculatedTotalHargaPengiriman = ratePerKg * totalKg;

    let status = data.status || 'belum_dipakai';
    let exchangeRate = data.exchangeRate || 0.0017801;
    let totalHargaPengiriman = data.totalHargaPengiriman !== undefined ? data.totalHargaPengiriman : calculatedTotalHargaPengiriman;
    let totalHargaPengirimanNTD = data.totalHargaPengirimanNTD !== undefined ? data.totalHargaPengirimanNTD : 0;
    let sudahDijurnal = data.sudahDijurnal !== undefined ? data.sudahDijurnal : false;
    let journalId = data.journalId || '';

    // Check if payment journal exists
    const paymentJournalId = `JU-FR-${freightCode.trim().toUpperCase()}-payment`;
    const journalDocSnap = await getDoc(doc(db, 'journalEntries', paymentJournalId));

    if (journalDocSnap.exists()) {
      console.log(`  -> Found existing payment journal: ${paymentJournalId}`);
      const journalData = journalDocSnap.data();
      const lines = journalData.lines || [];
      const line1120 = lines.find((l: any) => l.accountCode === '1120' || l.account === 'Freight-in Dalam Kapitalisasi');
      
      if (line1120) {
        const debitCents = line1120.debit || 0;
        const debitIDR = line1120.originalDebitIDR || 0;
        
        totalHargaPengiriman = debitIDR > 0 ? debitIDR : calculatedTotalHargaPengiriman;
        totalHargaPengirimanNTD = debitCents / 100;
        
        if (totalHargaPengiriman > 0) {
          exchangeRate = totalHargaPengirimanNTD / totalHargaPengiriman;
        }
        
        sudahDijurnal = true;
        status = 'sudah_dijurnal';
        journalId = paymentJournalId;
        console.log(`  -> Restored values from journal entry:`);
        console.log(`     * totalHargaPengiriman: ${totalHargaPengiriman} IDR`);
        console.log(`     * totalHargaPengirimanNTD: ${totalHargaPengirimanNTD} NTD`);
        console.log(`     * exchangeRate: ${exchangeRate}`);
      } else {
        console.log(`  -> No 1120 line found in journal entry.`);
      }
    } else {
      console.log(`  -> No payment journal found for ${paymentJournalId}. Setting status to 'belum_dipakai'.`);
      totalHargaPengiriman = calculatedTotalHargaPengiriman;
      totalHargaPengirimanNTD = totalHargaPengiriman * exchangeRate;
      sudahDijurnal = false;
      status = 'belum_dipakai';
    }

    const updatePayload = {
      status,
      exchangeRate,
      totalHargaPengiriman,
      totalHargaPengirimanNTD,
      sudahDijurnal,
      journalId
    };

    console.log(`  -> Updating document ${fDoc.id} with:`, updatePayload);
    await updateDoc(doc(db, 'freightIn', fDoc.id), updatePayload);
  }

  console.log('--- Migration Finished Successfully ---');
}

runMigration()
  .then(async () => {
    await deleteApp(app);
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Error during migration:', err);
    await deleteApp(app);
    process.exit(1);
  });
