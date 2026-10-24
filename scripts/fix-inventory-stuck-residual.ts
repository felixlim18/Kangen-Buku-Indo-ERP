// Bebankan sisa nilai persediaan buku yang stoknya sudah 0 ke HPP (25/10/2026).
//
// Biaya freight dulu selalu masuk 1201 saat dijurnalkan, termasuk bagian untuk buku yang sudah terjual. Buku yang
// habis jadi tetap "bernilai" di 1201 (laporan stok & GL sama-sama), sehingga HPP kurang dan persediaan lebih.
// Mulai 25/10/2026 kapitalisasi freight memisahkan bagian buku yang sudah keluar langsung ke HPP; skrip ini
// membereskan sisa lamanya: satu jurnal inventory_value_adjustment D 5100 / K 1201 (atau sebaliknya untuk sisa
// negatif) dengan rincian per buku (bookValueAdjustments) yang dibaca laporan persediaan, jadi laporan tetap = GL.
//
//   npx tsx scripts/fix-inventory-stuck-residual.ts            (dry-run)
//   npx tsx scripts/fix-inventory-stuck-residual.ts --apply    (menulis)
// Dengan FIRESTORE_EMULATOR_HOST terisi, skrip memakai emulator.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { buildPerpetualIndex, buildReportRows } from '../src/lib/perpetual-inventory';

const EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
const app = EMU
  ? initializeApp({ projectId: 'gen-lang-client-0501656267' })
  : initializeApp({ credential: cert(JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'))), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const DATE = '2026-10-25';
const n = (c: number) => `NT$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const grab = async (c: string, withId = true) => (await db.collection(c).get()).docs.map((d) => (withId ? { id: d.id, ...d.data() } : d.data())) as any[];

(async () => {
  console.log(`${EMU ? '[EMULATOR] ' : ''}${APPLY ? '*** MODE: APPLY ***' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***'}\n`);
  const [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn, damagedRecords, closings] = await Promise.all([
    grab('catalog'), grab('inventory', false), grab('inventoryLedger', false), grab('purchaseOrders'), grab('salesOrders'),
    grab('journalEntries'), grab('freightIn'), grab('damagedStock', false), grab('periodClosings')]);
  if (closings.some((c) => c.id === DATE.slice(0, 7) && c.status === 'Ditutup')) { console.log(`BERHENTI: periode ${DATE.slice(0, 7)} sudah ditutup.`); process.exit(1); }
  if (journals.some((j) => j.refType === 'inventory_value_adjustment' && j.refId === 'RESIDUAL-2026-10')) { console.log('BERHENTI: koreksi ini sudah pernah diposting.'); process.exit(1); }

  const index = buildPerpetualIndex({ books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn, damagedRecords } as any);
  const rows = buildReportRows(index, books, DATE.slice(0, 7));
  const stuck = rows.filter((r) => r.stokAkhir === 0 && Math.round(r.totalNilaiStok) !== 0)
    .map((r) => ({ bookId: r.book.id, title: String(r.book.bookName || r.book.title || r.book.id), valueCents: -Math.round(r.totalNilaiStok) }))
    .sort((a, b) => a.valueCents - b.valueCents);
  const net = stuck.reduce((a, x) => a + x.valueCents, 0); // negatif = 1201 berkurang
  stuck.slice(0, 15).forEach((x) => console.log(`  ${n(-x.valueCents).padStart(11)}  ${x.title.slice(0, 60)}`));
  if (stuck.length > 15) console.log(`  ... ${stuck.length - 15} buku lainnya`);
  console.log(`\n${stuck.length} buku berstok 0 masih bernilai; total ${n(-net)} -> ${net < 0 ? 'D 5100 HPP / K 1201' : 'D 1201 / K 5100 HPP'} ${n(Math.abs(net))}, tanggal ${DATE}`);
  if (!stuck.length) process.exit(0);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const counter = db.collection('counters').doc(`JURNAL_${DATE.replace(/-/g, '').slice(2)}`);
  const seq = await db.runTransaction(async (t) => { const s = await t.get(counter); const v = (s.exists ? s.data()!.value || 0 : 0) + 1; t.set(counter, { value: v }, { merge: true }); return v; });
  const id = `JU${DATE.replace(/-/g, '').slice(2)}${String(seq).padStart(4, '0')}`;
  const amt = Math.abs(net);
  const doc = {
    id, date: Timestamp.fromDate(new Date(`${DATE}T23:59:00+08:00`)), createdAt: Timestamp.now(),
    description: 'Koreksi sisa nilai persediaan buku yang stoknya habis (biaya freight lama) ke HPP',
    refType: 'inventory_value_adjustment', refId: 'RESIDUAL-2026-10',
    bookValueAdjustments: stuck.map(({ bookId, valueCents }) => ({ bookId, valueCents })),
    lines: net < 0
      ? [{ account: 'Harga Pokok Penjualan', accountCode: '5100', debit: amt, credit: 0 }, { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: amt }]
      : [{ account: 'Inventory On Hand', accountCode: '1201', debit: amt, credit: 0 }, { account: 'Harga Pokok Penjualan', accountCode: '5100', debit: 0, credit: amt }],
  };
  if (!EMU) writeFileSync(`scripts/backup-inventory-stuck-residual-${Date.now()}.json`, JSON.stringify({ created: id }, null, 2));
  await db.collection('journalEntries').doc(id).set(doc);
  console.log(`Selesai: ${id}`);
  process.exit(0);
})();
