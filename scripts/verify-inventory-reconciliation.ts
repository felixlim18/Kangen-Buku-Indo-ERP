// INVARIAN REKONSILIASI PERSEDIAAN - gate wajib sebelum deploy.
//
// Selama ada DUA mesin penilaian yang tidak pernah didamaikan (laporan
// menghitung ulang rata-rata bergerak sendiri, buku besar memakai HPP yang
// dikunci di jurnal), selisih rekonsiliasi akan selalu muncul kembali.
//
// Skrip ini menegakkan invarian yang benar: untuk SETIAP bulan,
//
//     total nilai fisik Laporan Bulanan  ==  saldo GL akun 1201 + 1202
//
// Ia memakai jalur kode yang sama persis dengan aplikasi (buildPerpetualIndex +
// buildReportRows), jadi kalau skrip ini lolos, banner di UI juga hijau.
//
// Sekalian menegakkan format nomor jurnal JU+YYMMDD+NNNN, karena jalur yang
// membuat nomor sendiri (dulu FreightInTab) juga jalur yang paling rawan
// menghasilkan jurnal yang tidak terhubung ke mana-mana.
//
// Read-only. Jalankan: npx tsx scripts/verify-inventory-reconciliation.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { buildPerpetualIndex, buildReportRows, type PerpetualData } from '../src/lib/perpetual-inventory';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

/** Toleransi 2 sen - pembulatan per-baris vs per-jurnal memang menyisakan recehan. */
const TOLERANCE_CENTS = 2;
const VALID_JOURNAL_ID = /^JU\d{6}\d{4}$/;

const MONTHS = [
  '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
  '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
];

const grab = async (n: string, withId = true) =>
  (await db.collection(n).get()).docs.map((d) => (withId ? { id: d.id, ...d.data() } : d.data())) as any[];

const toMs = (v: any): number =>
  v?.toDate ? v.toDate().getTime() : (typeof v?.seconds === 'number' ? v.seconds * 1000 : Date.parse(v));

const isInventoryLine = (l: any) => {
  const code = (l.accountCode || '').trim();
  const name = (l.account || '').trim().toLowerCase();
  return code === '1201' || code === '1202' || name === 'inventory on hand' || name === 'inventory in delivery';
};

(async () => {
  const [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn, damagedRecords] =
    await Promise.all([
      grab('catalog'), grab('inventory', false), grab('inventoryLedger', false),
      grab('purchaseOrders'), grab('salesOrders'), grab('journalEntries'),
      grab('freightIn'), grab('damagedStock', false),
    ]);

  const data: PerpetualData = {
    books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn, damagedRecords,
  };
  console.log(`${books.length} buku | ${ledgerEntries.length} ledger | ${journals.length} jurnal | ${salesOrders.length} SO | ${purchaseOrders.length} PO\n`);

  let failures = 0;

  // --- 1. Invarian utama: laporan == GL, per bulan -------------------------
  const index = buildPerpetualIndex(data);

  console.log('INVARIAN: nilai fisik laporan == saldo GL 1201+1202');
  console.log('  bulan      fisik          GL       selisih');
  for (const month of MONTHS) {
    const [y, m] = month.split('-').map(Number);
    const cutoff = new Date(y, m, 1).getTime();

    const fisik = buildReportRows(index, books, month).reduce((a, r) => a + r.totalNilaiStok, 0);

    let debit = 0, credit = 0;
    for (const j of journals) {
      const t = toMs(j.date);
      if (isNaN(t) || t >= cutoff) continue;
      for (const l of (j.lines || [])) if (isInventoryLine(l)) { debit += l.debit || 0; credit += l.credit || 0; }
    }
    const gl = debit - credit;
    const diff = gl - fisik;
    const ok = Math.abs(diff) <= TOLERANCE_CENTS;
    if (!ok) failures++;

    console.log(`  ${month}  ${(fisik / 100).toFixed(2).padStart(11)} ${(gl / 100).toFixed(2).padStart(11)} ` +
      `${(diff / 100).toFixed(2).padStart(11)}  ${ok ? 'ok' : '<-- GAGAL'}`);
  }

  // --- 2. Tidak boleh ada buku yatim --------------------------------------
  const inCatalog = new Set(books.map((b) => b.id));
  const orphans = new Set<string>();
  for (const e of ledgerEntries) if (e.bookId && !inCatalog.has(e.bookId)) orphans.add(e.bookId);
  console.log(`\nBuku dengan mutasi persediaan tapi tidak ada di katalog: ${orphans.size}`);
  if (orphans.size > 0) {
    failures++;
    [...orphans].slice(0, 10).forEach((id) => console.log(`  ${id}  <-- nilainya tak terlihat di laporan`));
    console.log('  Jalankan scripts/fix-restore-orphan-book.ts');
  }

  // --- 3. Freight yang dijurnal harus habis dialokasikan ------------------
  let capitalizedInJournal = 0;
  for (const j of journals) {
    if (!String(j.description || '').toUpperCase().includes('KAPITALISASI')) continue;
    for (const l of (j.lines || [])) {
      const c = (l.accountCode || '').trim();
      if (c === '1201' || c === '1202') capitalizedInJournal += l.debit || 0;
    }
  }
  let allocated = 0;
  for (const evs of (index as any).eventsByBook.values()) {
    for (const e of evs) if (e.type === 'freight_capitalized') allocated += e.freightAllocatedCents;
  }
  const freightGap = capitalizedInJournal - allocated;
  const freightOk = Math.abs(freightGap) <= TOLERANCE_CENTS;
  if (!freightOk) failures++;
  console.log(`\nFreight dikapitalisasi di jurnal: NT$ ${(capitalizedInJournal / 100).toFixed(2)}`);
  console.log(`Freight dialokasikan ke buku    : NT$ ${(allocated / 100).toFixed(2)}`);
  console.log(`Selisih                         : NT$ ${(freightGap / 100).toFixed(2)}  ${freightOk ? 'ok' : '<-- GAGAL, ada freight yang tidak terhubung ke buku mana pun'}`);

  // --- 3b. Buku bernilai negatif ------------------------------------------
  // Bukan kegagalan invarian (totalnya tetap cocok dengan GL), tapi sinyal bahwa
  // buku besar membebankan HPP lebih besar dari nilai masuk yang tercatat untuk
  // buku itu. Dulu tersembunyi di balik klem Math.max(0,...).
  const lastMonth = MONTHS[MONTHS.length - 1];
  const negatives = buildReportRows(index, books, lastMonth)
    .filter((r) => r.totalNilaiStok < -1)
    .sort((a, b) => a.totalNilaiStok - b.totalNilaiStok);
  console.log(`\nBuku dengan nilai persediaan negatif: ${negatives.length}`);
  if (negatives.length > 0) {
    negatives.slice(0, 10).forEach((r) =>
      console.log(`  NT$ ${(r.totalNilaiStok / 100).toFixed(2).padStart(9)}  stok ${String(r.stokAkhir).padStart(3)}  ${String(r.book.bookName || r.book.id).slice(0, 46)}`));
    console.log('  -> HPP yang dijurnal melebihi nilai masuk yang tercatat untuk buku ini.');
    console.log('     Periksa harga penerimaan barangnya; totalnya tetap sinkron dengan GL.');
  }

  // --- 4. Format nomor jurnal ---------------------------------------------
  const badIds = journals.filter((j) => !VALID_JOURNAL_ID.test(j.id));
  const badIdField = journals.filter((j) => j.id && (j as any).id !== undefined && !VALID_JOURNAL_ID.test((j as any).id));
  console.log(`\nFormat nomor jurnal JU+YYMMDD+NNNN: ${journals.length - badIds.length}/${journals.length} benar`);
  if (badIds.length > 0 || badIdField.length > 0) {
    failures++;
    badIds.slice(0, 10).forEach((j) => console.log(`  ${j.id}  <-- format salah`));
    console.log('  Jalankan scripts/fix-freight-journal-ids.ts');
  }

  console.log(failures === 0
    ? '\n>>> LOLOS: laporan dan buku besar sinkron di seluruh bulan.'
    : `\n>>> GAGAL: ${failures} invarian dilanggar.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
