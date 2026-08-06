const fs = require('fs');
const path = require('path');

const components = [
  'BankKasTab.tsx',
  'FreightInTab.tsx',
  'IklanTab.tsx',
  'OngkosKirimTab.tsx',
  'PerlengkapanTab.tsx',
  'PurchasesTab.tsx',
  'PiutangUtangTab.tsx'
];

components.forEach(comp => {
  const file = path.join(__dirname, 'src/components', comp);
  if (!fs.existsSync(file)) return;
  
  let code = fs.readFileSync(file, 'utf-8');
  let changed = false;

  // Add import if missing and if we are going to modify
  if (code.includes('`JU-') || code.includes("'JU-")) {
    if (!code.includes("import { getNextJournalId }")) {
      code = "import { getNextJournalId } from '../lib/journalUtils';\n" + code;
    }
  }

  // Find occurrences of `JU-TRF-${Date.now()}` and similar and replace them.
  // We'll replace them using generic approach, since Date.now() is usually used for unique IDs.
  // Actually, we can just replace the specific strings!

  // BankKasTab
  if (comp === 'BankKasTab.tsx') {
    code = code.replace(/const journalId = `JU-TRF-\$\{Date\.now\(\)\}`;/, "const journalId = await getNextJournalId(transferDate);");
    code = code.replace(/const journalId = `JU-REV-\$\{Date\.now\(\)\}`;/, "const journalId = await getNextJournalId(revDate);");
    code = code.replace(/reversalId = `JU-REV-REV-\$\{Date\.now\(\)\}`;/, "reversalId = await getNextJournalId(new Date().toISOString().split('T')[0]);");
    changed = true;
  }
  
  if (comp === 'IklanTab.tsx') {
    code = code.replace(/const journalId = `JU-AD-\$\{adId\}`;/, "const journalId = await getNextJournalId(formData.date);");
    changed = true;
  }
  
  if (comp === 'OngkosKirimTab.tsx') {
    code = code.replace(/const journalId = `JU-OK-\$\{selectedEntryForPay\.id\}`;/, "const tglForJrn = paymentDate || new Date().toISOString().split('T')[0];\n      const journalId = await getNextJournalId(tglForJrn);");
    changed = true;
  }
  
  if (comp === 'PerlengkapanTab.tsx') {
    code = code.replace(/const journalId = `JU-PL-\$\{purchaseId\}-buy`;/g, "const tglBuy = formData.date || new Date().toISOString().split('T')[0];\n      const journalId = await getNextJournalId(tglBuy);");
    code = code.replace(/const journalId = `JU-PL-\$\{closingPurchase\.id\}-close-\$\{Date\.now\(\)\}`;/g, "const journalId = await getNextJournalId(closeDate);");
    code = code.replace(/const buyJournalId = `JU-PL-\$\{purchase\.id\}-buy`;/g, "const buyJournalId = `JU-PL-${purchase.id}-buy`; // Keep this to find legacy if needed");
    // Write off / Adjustments
    code = code.replace(/const writeOffId = `JU-WO-PERLENGKAPAN-\$\{item\.id\}-\$\{Date\.now\(\)\}`;/, "const writeOffId = await getNextJournalId(new Date().toISOString().split('T')[0]);");
    code = code.replace(/const adjustId = `JU-ADJ-PL-\$\{adjustingItem\.id\}-\$\{Date\.now\(\)\}`;/g, "const adjustId = await getNextJournalId(new Date().toISOString().split('T')[0]);");
    code = code.replace(/const adjustId = `JU-ADJ-PL-BULK-\$\{item\.id\}-\$\{timestamp\}`;/, "const adjustId = await getNextJournalId(new Date().toISOString().split('T')[0]);");
    changed = true;
  }
  
  if (comp === 'PurchasesTab.tsx') {
    code = code.replace(/const corrJournalId = `JU-PO-\$\{poId\}-rec-correction-\$\{newItem\.bookId\}-\$\{Timestamp\.now\(\)\.toMillis\(\)\}`;/, "const corrJournalId = await getNextJournalId(new Date().toISOString().split('T')[0]);");
    // For closeJournalId, we need to handle it properly in PurchasesTab since we're using batch.set on closeJournalRef 
    code = code.replace(/const closeJournalId = `JU-PO-\$\{poId\}-close`;\n          const closeJournalRef = doc\(db, 'journalEntries', closeJournalId\);\n          const closeJournalSnap = await getDoc\(closeJournalRef\);/g, `const closeJournalQuery = query(collection(db, 'journalEntries'), where('refId', '==', poId), where('description', '==', 'Tutup Pesanan (Potongan/Selisih)'));
          const closeJournalSnapDocs = await getDocs(closeJournalQuery);
          let closeJournalSnap = { exists: () => false, data: () => null };
          let closeJournalRef = null;
          if (!closeJournalSnapDocs.empty) {
            closeJournalRef = closeJournalSnapDocs.docs[0].ref;
            closeJournalSnap = { exists: () => true, data: () => closeJournalSnapDocs.docs[0].data() };
          }`);
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(file, code);
    console.log(`Updated ${comp}`);
  }
});

