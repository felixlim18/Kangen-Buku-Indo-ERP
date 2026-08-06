// Corrective follow-up to fix_migration_journal_dates.cjs.
// 16 of the 249 "migration" POs were incorrectly moved to 2026/01/01 (order) and
// 2026/01/02 (receive) by that script. They actually have:
//   - a real purchaseDate in July 2026 (order was genuinely placed then)
//   - a real physical receipt logged via the live app on 2026-07-22 (receipts[].receivedDate)
// User's decision:
//   - Order journal ("Pemesanan Barang (Migrasi)") -> uniform date 2026/07/01
//   - Receive journal ("Penerimaan Barang") -> each PO's actual receipts[].receivedDate
//
// Usage:
//   node fix_16_misdated_journals.cjs            (dry-run, no writes)
//   node fix_16_misdated_journals.cjs --apply     (actually writes)

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json');
const app = initializeApp({ credential: cert(serviceAccount), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');
const TARGET_ORDER_DATE = new Date(2026, 6, 1); // 2026/07/01

function toDate(ts) {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date(ts);
}

async function main() {
  console.log(APPLY ? '*** MODE: APPLY ***' : '*** MODE: DRY-RUN ***');

  const [ledgerSnap, poSnap, journalSnap] = await Promise.all([
    db.collection('inventoryLedger').get(),
    db.collection('purchaseOrders').get(),
    db.collection('journalEntries').get(),
  ]);
  const ledger = ledgerSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const pos = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const journals = journalSnap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }));
  const poById = new Map(pos.map(p => [p.id, p]));

  const excludedCodes = new Set(['PO26071602','PO26071801','PO26072003','PO26072006','PO26072001','PO26071807','PO26072004','PO26010198','PO26072005','PO26072002','PO26071804','PO26071404','PO26071806']);
  const migPOs249 = pos.filter(p => p.migrationSessionId && !excludedCodes.has(p.purchaseCode));
  const migPoIds249 = new Set(migPOs249.map(p => p.id));
  const receipts249 = ledger.filter(e => e.type === 'purchase_received' && e.reversed !== true && migPoIds249.has(e.refId));
  const afterJulyPoIds = [...new Set(receipts249.filter(e => toDate(e.timestamp) >= new Date(2026, 6, 1)).map(e => e.refId))];

  console.log(`\nPO yang dikoreksi: ${afterJulyPoIds.length}`);
  if (afterJulyPoIds.length !== 16) {
    console.error('SAFETY ABORT: jumlah PO yang ditemukan bukan 16, cek ulang sebelum lanjut.');
    process.exit(1);
  }

  const updates = [];
  for (const poId of afterJulyPoIds) {
    const po = poById.get(poId);
    const orderJ = journals.find(j => j.refId === po.purchaseCode && (j.description || '').includes('Pemesanan Barang (Migrasi)'));
    const recvJ = journals.find(j => j.sourceId === poId && (j.description || '').includes('Penerimaan Barang') && j.createdBy === 'system_recovery');
    const receivedDate = po.receipts && po.receipts[0] ? toDate(po.receipts[0].receivedDate) : null;

    if (!orderJ || !recvJ || !receivedDate) {
      console.error('SAFETY ABORT: data tidak lengkap untuk PO', po.purchaseCode, { hasOrderJ: !!orderJ, hasRecvJ: !!recvJ, hasReceivedDate: !!receivedDate });
      process.exit(1);
    }

    console.log(`  ${po.purchaseCode}: order ${orderJ.id} -> 2026-07-01 | receive ${recvJ.id} -> ${receivedDate.toISOString()}`);
    updates.push({ ref: orderJ.ref, date: TARGET_ORDER_DATE });
    updates.push({ ref: recvJ.ref, date: receivedDate });
  }

  console.log(`\nTotal dokumen yang akan di-update: ${updates.length} (${afterJulyPoIds.length} order + ${afterJulyPoIds.length} receive)`);

  if (!APPLY) {
    console.log('\nDry-run selesai. Tidak ada perubahan ditulis. Jalankan ulang dengan --apply untuk benar-benar menulis.');
    return;
  }

  const batch = db.batch();
  updates.forEach(u => batch.update(u.ref, { date: Timestamp.fromDate(u.date) }));
  await batch.commit();
  console.log('Selesai. 16 PO sudah dikoreksi.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
