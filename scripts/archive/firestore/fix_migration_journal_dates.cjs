// One-time correction: re-date migration journals to a uniform, correct date.
// - "Pemesanan Barang (Migrasi)" journals -> 2026/01/01
// - "Penerimaan Barang" journals belonging to migrated POs (createdBy: system_recovery) -> 2026/01/02
// Non-migration journals are NEVER touched (selection criteria verified against live data,
// see /Users/Felixsalim/.claude/plans/saya-ingin-kamu-cek-delegated-kitten.md, Fase 3b).
//
// Usage:
//   node fix_migration_journal_dates.cjs            (dry-run, no writes)
//   node fix_migration_journal_dates.cjs --apply     (actually writes)

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json');
const app = initializeApp({ credential: cert(serviceAccount), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');

const TARGET_DATE_PEMESANAN = new Date(2026, 0, 1); // 2026/01/01
const TARGET_DATE_PENERIMAAN = new Date(2026, 0, 2); // 2026/01/02

function toDate(ts) {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date(ts);
}

async function main() {
  console.log(APPLY ? '*** MODE: APPLY (akan menulis ke Firestore) ***' : '*** MODE: DRY-RUN (tidak menulis apapun) ***');

  const [journalSnap, poSnap] = await Promise.all([
    db.collection('journalEntries').get(),
    db.collection('purchaseOrders').get(),
  ]);
  const journals = journalSnap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }));
  const pos = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const migPoIds = new Set(pos.filter(p => p.migrationSessionId).map(p => p.id));

  // --- Selection 1: "Pemesanan Barang (Migrasi)" -> 2026/01/01
  const pemesananMig = journals.filter(j =>
    (j.description || '').includes('Pemesanan Barang (Migrasi)') && !!j.migrationSessionId
  );

  // 13 POs are flagged migrationSessionId but were confirmed by the user to be manually
  // entered real transactions (not part of the historical backdated batch) - their order
  // journal uses plain "Pemesanan Barang" (no "(Migrasi)" suffix, no migrationSessionId on
  // the journal) with an accurate, non-clustered date. These must be excluded from BOTH
  // selections, otherwise their receive journal would move to 2026/01/02 while their order
  // journal stays on its real (later) date - i.e. "received before ordered".
  const pemesananPoCodes = new Set(pemesananMig.map(j => j.refId));
  const excludedPoIds = new Set(
    pos.filter(p => p.migrationSessionId && !pemesananPoCodes.has(p.purchaseCode)).map(p => p.id)
  );
  console.log(`\nPO dikecualikan dari kedua seleksi (input manual, bukan migrasi historis): ${excludedPoIds.size}`);

  // --- Selection 2: "Penerimaan Barang" for migrated POs -> 2026/01/02
  const penerimaanMig = journals.filter(j =>
    (j.description || '').includes('Penerimaan Barang') &&
    j.createdBy === 'system_recovery' &&
    migPoIds.has(j.sourceId) &&
    !excludedPoIds.has(j.sourceId)
  );

  // Safety assertions before touching anything
  const overlap = pemesananMig.filter(j => penerimaanMig.some(p => p.id === j.id));
  if (overlap.length > 0) {
    console.error('SAFETY ABORT: ada jurnal yang masuk ke DUA seleksi sekaligus:', overlap.map(j => j.id));
    process.exit(1);
  }

  const nonMigTouchCheck1 = journals.filter(j =>
    (j.description || '').includes('Pemesanan Barang') && !j.migrationSessionId &&
    pemesananMig.some(p => p.id === j.id)
  );
  const nonMigTouchCheck2 = journals.filter(j =>
    (j.description || '').includes('Penerimaan Barang') && !migPoIds.has(j.sourceId) &&
    penerimaanMig.some(p => p.id === j.id)
  );
  if (nonMigTouchCheck1.length > 0 || nonMigTouchCheck2.length > 0) {
    console.error('SAFETY ABORT: seleksi tidak sengaja menyentuh jurnal non-migrasi.');
    process.exit(1);
  }

  console.log(`\nSeleksi 1 - "Pemesanan Barang (Migrasi)" -> 2026/01/01: ${pemesananMig.length} dokumen`);
  console.log(`Seleksi 2 - "Penerimaan Barang" (migrasi, system_recovery) -> 2026/01/02: ${penerimaanMig.length} dokumen`);

  console.log('\nContoh 5 dokumen Seleksi 1 (sebelum -> sesudah):');
  pemesananMig.slice(0, 5).forEach(j => {
    console.log(`  ${j.id}: ${toDate(j.date).toISOString().split('T')[0]} -> 2026-01-01`);
  });

  console.log('\nContoh 5 dokumen Seleksi 2 (sebelum -> sesudah):');
  penerimaanMig.slice(0, 5).forEach(j => {
    console.log(`  ${j.id}: ${toDate(j.date).toISOString().split('T')[0]} -> 2026-01-02`);
  });

  const totalToUpdate = pemesananMig.length + penerimaanMig.length;
  console.log(`\nTotal dokumen yang akan di-update: ${totalToUpdate}`);
  console.log('Field yang diubah: HANYA field "date". Semua field lain (lines, amounts, description, ids, dst) tidak disentuh.');

  if (!APPLY) {
    console.log('\nDry-run selesai. Tidak ada perubahan ditulis. Jalankan ulang dengan --apply untuk benar-benar menulis.');
    return;
  }

  console.log('\nMenulis perubahan...');
  const allUpdates = [
    ...pemesananMig.map(j => ({ ref: j.ref, date: TARGET_DATE_PEMESANAN })),
    ...penerimaanMig.map(j => ({ ref: j.ref, date: TARGET_DATE_PENERIMAAN })),
  ];

  const CHUNK = 450;
  let written = 0;
  for (let i = 0; i < allUpdates.length; i += CHUNK) {
    const chunk = allUpdates.slice(i, i + CHUNK);
    const batch = db.batch();
    chunk.forEach(u => batch.update(u.ref, { date: Timestamp.fromDate(u.date) }));
    await batch.commit();
    written += chunk.length;
    console.log(`  ...${written}/${allUpdates.length} tertulis`);
  }
  console.log('Selesai. Semua tanggal jurnal migrasi sudah diperbarui.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
