// Two independent cleanups, both confirmed with the user:
// 1. Reverse (not delete) 5 phantom inventoryLedger 'purchase_received' entries caused by a
//    scan-barcode double-submit bug. Each affected PO declared qtyReceived=1 with exactly one
//    receipts[] record; the ledger has 2-4 entries for the same book at near-identical
//    timestamps. The entry whose timestamp matches receipts[0].receivedDate exactly is kept;
//    the rest are marked reversed:true (never deleted, preserves audit trail).
// 2. Delete journal JU2607310069 (refId ADJ-INV-2026-07): a manual reconciliation adjustment
//    posted by the user on 2026-07-31 to force-close a gap that has since been traced to real
//    root causes (fixed separately) and corrected. Keeping it would double-correct.
//
// Usage:
//   node fix_duplicate_ledger_and_stale_adjustment.cjs            (dry-run, no writes)
//   node fix_duplicate_ledger_and_stale_adjustment.cjs --apply     (actually writes)

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json');
const app = initializeApp({ credential: cert(serviceAccount), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');

function toDate(ts) {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date(ts);
}

async function main() {
  console.log(APPLY ? '*** MODE: APPLY ***' : '*** MODE: DRY-RUN ***');

  const [ledgerSnap, poSnap] = await Promise.all([
    db.collection('inventoryLedger').get(),
    db.collection('purchaseOrders').get(),
  ]);
  const ledger = ledgerSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  const pos = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const poByCode = new Map(pos.map(p => [p.purchaseCode, p]));

  const targetCodes = ['PO26072003', 'PO26071804', 'PO26072702'];
  const toReverse = [];

  for (const code of targetCodes) {
    const po = poByCode.get(code);
    const canonicalTs = toDate(po.receipts[0].receivedDate).getTime();
    const entries = ledger.filter(e => e.refId === po.id && e.type === 'purchase_received');
    const keep = entries.find(e => toDate(e.timestamp).getTime() === canonicalTs);
    if (!keep) {
      console.error('SAFETY ABORT: tidak ketemu entri ledger yang cocok dengan receipts[0].receivedDate untuk', code);
      process.exit(1);
    }
    const dupes = entries.filter(e => e.id !== keep.id);
    console.log(`\n${code}: ${entries.length} entri ledger, keep=${keep.id}, reverse=${dupes.length}`);
    dupes.forEach(d => {
      console.log(`  REVERSE ${d.id} | qty=${d.qtyDelta} unitCost=${d.unitCost} ts=${toDate(d.timestamp).toISOString()}`);
      toReverse.push(d);
    });
  }

  const totalValue = toReverse.reduce((a, e) => a + (e.qtyDelta || 0) * (e.unitCost || 0), 0) / 100;
  console.log(`\nTotal entri di-reverse: ${toReverse.length}, total nilai: ${totalValue.toFixed(2)} NTD`);
  if (toReverse.length !== 5) {
    console.error('SAFETY ABORT: jumlah entri yang di-reverse bukan 5, cek ulang.');
    process.exit(1);
  }

  console.log('\nJurnal yang akan dihapus: JU2607310069 (ADJ-INV-2026-07)');

  if (!APPLY) {
    console.log('\nDry-run selesai. Tidak ada perubahan ditulis. Jalankan ulang dengan --apply untuk benar-benar menulis.');
    return;
  }

  const batch = db.batch();
  toReverse.forEach(e => batch.update(e.ref, { reversed: true, reversedReason: 'Duplikat entri dari scan-barcode double-submit, dikoreksi via audit rekonsiliasi 2026-08', reversedAt: new Date() }));
  batch.delete(db.collection('journalEntries').doc('JU2607310069'));
  await batch.commit();
  console.log('Selesai.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
