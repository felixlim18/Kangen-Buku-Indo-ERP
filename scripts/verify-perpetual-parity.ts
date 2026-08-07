// GATE PARITY - syarat mutlak sebelum implementasi cepat boleh dipakai.
//
// Membandingkan legacyBuildReportRows (salinan apa adanya dari kode yang sudah
// jalan di produksi) dengan buildReportRows berbasis Map, untuk SEMUA buku x
// SEMUA bulan yang punya data. Nol selisih = syarat lolos.
//
// Read-only, tidak menulis apa pun ke Firestore.
// Jalankan: npx tsx scripts/verify-perpetual-parity.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import {
  legacyBuildReportRows,
  buildPerpetualIndex,
  buildReportRows,
  type PerpetualData,
} from '../src/lib/perpetual-inventory';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

// "Sekarang" dipatok supaya getCapitalizationTimestamp memberi nilai yang sama
// di kedua sisi (fallback-nya memakai waktu berjalan).
const NOW = Date.parse('2026-08-07T00:00:00Z');

// Bulan yang diuji: seluruh rentang data + satu bulan penyangga di tiap ujung.
const MONTHS = [
  '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
  '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
];

const grab = async (name: string, withId = true) => {
  const s = await db.collection(name).get();
  return s.docs.map((d) => (withId ? { id: d.id, ...d.data() } : d.data()));
};

(async () => {
  console.log('Mengambil data produksi (read-only)...');
  const [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn, damagedRecords] =
    await Promise.all([
      grab('catalog'), grab('inventory', false), grab('inventoryLedger', false),
      grab('purchaseOrders'), grab('salesOrders'), grab('journalEntries'),
      grab('freightIn'), grab('damagedStock', false),
    ]);

  const data: PerpetualData = {
    books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn, damagedRecords,
  };
  console.log(`  ${books.length} buku | ${ledgerEntries.length} ledger | ${journals.length} jurnal | ` +
    `${salesOrders.length} SO | ${purchaseOrders.length} PO | ${freightIn.length} freight | ${damagedRecords.length} rusak\n`);

  const tIdx = Date.now();
  const index = buildPerpetualIndex(data, NOW);
  const idxMs = Date.now() - tIdx;
  console.log(`Index dibangun sekali: ${idxMs} ms\n`);

  const FIELDS = ['stokAwal', 'stokMasuk', 'stokKeluar', 'rusak', 'stokAkhir'] as const;
  let totalMismatch = 0;
  let shown = 0;
  let legacyTotalMs = 0;
  let fastTotalMs = 0;

  for (const month of MONTHS) {
    const t1 = Date.now();
    const oldRows = legacyBuildReportRows(data, month, NOW);
    const legacyMs = Date.now() - t1;

    const t2 = Date.now();
    const newRows = buildReportRows(index, books, month);
    const fastMs = Date.now() - t2;

    legacyTotalMs += legacyMs;
    fastTotalMs += fastMs;

    let bad = 0;
    for (let i = 0; i < oldRows.length; i++) {
      const o: any = oldRows[i];
      const n: any = newRows[i];
      const diffs: string[] = [];

      if (o.book.id !== n.book.id) diffs.push(`urutan buku beda: ${o.book.id} vs ${n.book.id}`);
      for (const f of FIELDS) {
        if (o[f] !== n[f]) diffs.push(`${f}: ${o[f]} != ${n[f]}`);
      }
      if (Math.abs(o.totalNilaiStok - n.totalNilaiStok) > 1) {
        diffs.push(`totalNilaiStok: ${o.totalNilaiStok} != ${n.totalNilaiStok}`);
      }
      const denom = Math.max(1e-9, Math.abs(o.hargaRataRata));
      if (Math.abs(o.hargaRataRata - n.hargaRataRata) / denom > 1e-9) {
        diffs.push(`hargaRataRata: ${o.hargaRataRata} != ${n.hargaRataRata}`);
      }

      if (diffs.length) {
        bad++;
        totalMismatch++;
        if (shown < 25) {
          shown++;
          console.log(`  SELISIH ${month} "${(o.book.bookName || o.book.id).slice(0, 44)}"`);
          diffs.forEach((d) => console.log(`      ${d}`));
        }
      }
    }

    const oldSum = oldRows.reduce((a, r) => a + r.totalNilaiStok, 0);
    const newSum = newRows.reduce((a, r) => a + r.totalNilaiStok, 0);
    const sumOk = Math.abs(oldSum - newSum) <= 1;

    console.log(
      `${month}  ${bad === 0 ? 'cocok' : `${bad} SELISIH`}`.padEnd(22) +
      `lama ${String(legacyMs).padStart(6)} ms -> baru ${String(fastMs).padStart(4)} ms` +
      `   valuasi ${sumOk ? 'sama' : `BEDA (${(oldSum / 100).toFixed(2)} vs ${(newSum / 100).toFixed(2)})`}`
    );
    if (!sumOk) totalMismatch++;
  }

  const speedup = fastTotalMs > 0 ? (legacyTotalMs / fastTotalMs).toFixed(0) : 'inf';
  console.log(`\nTotal ${MONTHS.length} bulan: lama ${(legacyTotalMs / 1000).toFixed(1)} s -> baru ${fastTotalMs} ms (${speedup}x lebih cepat, di luar ${idxMs} ms bangun index)`);

  if (totalMismatch === 0) {
    console.log('\n>>> GATE LOLOS: nol selisih di seluruh buku x seluruh bulan.');
    process.exit(0);
  } else {
    console.log(`\n>>> GATE GAGAL: ${totalMismatch} selisih. Implementasi cepat TIDAK boleh dipakai.`);
    process.exit(1);
  }
})();
