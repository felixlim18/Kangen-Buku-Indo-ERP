// Pulihkan buku yang punya mutasi persediaan tapi dokumen katalognya hilang.
//
// Laporan Bulanan menelusuri koleksi `catalog`. Kalau sebuah buku dihapus dari
// katalog padahal baris inventoryLedger dan debit GL-nya masih ada, nilainya
// jadi TIDAK TERLIHAT di laporan sementara GL tetap memperhitungkannya - persis
// selisih rekonsiliasi NT$142,00 di Juni.
//
// Skrip ini generik: ia mencari SEMUA bookId yatim, bukan satu ID hardcode.
// Dokumen katalog direkonstruksi dari PO yang merujuk buku itu, dan dokumen
// inventory dihitung dari fold ledger-nya sendiri (bukan dari nilai tersimpan
// yang mungkin sudah melenceng).
//
// Buku dipulihkan dengan isActive:false supaya tidak muncul di pencarian
// penjualan, tapi tetap ikut terhitung di Kontrol Stok dan Laporan Bulanan.
//
// Jalankan:
//   npx tsx scripts/fix-restore-orphan-book.ts            (dry-run)
//   npx tsx scripts/fix-restore-orphan-book.ts --apply     (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  const [catalogSnap, invSnap, ledgerSnap, poSnap] = await Promise.all([
    db.collection('catalog').get(),
    db.collection('inventory').get(),
    db.collection('inventoryLedger').get(),
    db.collection('purchaseOrders').get(),
  ]);

  const inCatalog = new Set(catalogSnap.docs.map((d) => d.id));
  const inInventory = new Set(invSnap.docs.map((d) => d.id));
  const ledger = ledgerSnap.docs.map((d) => d.data() as any);
  const pos = poSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // bookId yang punya jejak persediaan tapi tidak ada di katalog
  const orphanIds = new Set<string>();
  for (const e of ledger) if (e.bookId && !inCatalog.has(e.bookId)) orphanIds.add(e.bookId);

  console.log(`Katalog: ${catalogSnap.size} buku | ledger: ${ledgerSnap.size} baris`);
  console.log(`Buku yatim ditemukan: ${orphanIds.size}\n`);
  if (orphanIds.size === 0) {
    console.log('Tidak ada yang perlu dipulihkan.');
    return;
  }

  const plan: Array<{ id: string; catalog: any; inventory: any; qty: number; value: number; from: string }> = [];

  for (const bookId of orphanIds) {
    const rows = ledger.filter((e) => e.bookId === bookId);

    // Fold ledger untuk mendapat stok & nilai - sumber kebenaran, bukan nilai tersimpan.
    let stock = 0;
    let valueCents = 0;
    for (const r of rows) {
      if (r.reversed === true) continue;
      const qd = r.qtyDelta || 0;
      stock += qd;
      valueCents += qd * (r.unitCost || 0);
    }
    const avgCost = stock > 0 ? Math.round(valueCents / stock) : 0;

    // Metadata dari PO yang merujuk buku ini
    const po = pos.find((p) => p.bookId === bookId || (p.items || []).some((it: any) => it.bookId === bookId));
    const item = po ? (po.items || []).find((it: any) => it.bookId === bookId) : null;
    const bookName = item?.bookName || po?.bookName || `(nama tidak diketahui) ${bookId}`;

    const catalogDoc = {
      id: bookId,
      bookName,
      bookNameLower: String(bookName).toLowerCase(),
      author: item?.author || po?.author || '',
      category: [],
      cover: '',
      description: 'Dipulihkan otomatis: buku ini terhapus dari katalog padahal masih punya mutasi persediaan dan nilai di buku besar. Nonaktif secara default - aktifkan kalau memang masih dijual.',
      generalPrice: item?.sellPrice || 0,
      shopeePrice: 0,
      minOrder: 0,
      productId: item?.productId || '',
      isActive: false,
      restoredBy: 'scripts/fix-restore-orphan-book.ts',
      restoredAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const inventoryDoc = {
      bookId,
      initialStock: 0,
      totalPurchased: Math.max(0, stock),
      totalDispatched: 0,
      endingStock: stock,
      readyStock: stock,
      shippedStock: 0,
      inTransitStock: 0,
      ordersPlaced: 0,
      ordersShipped: 0,
      movingAverageCost: avgCost,
      totalInventoryValue: valueCents,
      stockStatus: stock > 0 ? 'in_stock' : 'sold_out',
      lastUpdated: Timestamp.now(),
    };

    plan.push({ id: bookId, catalog: catalogDoc, inventory: inventoryDoc, qty: stock, value: valueCents, from: po ? (po.orderNumber || po.id) : '(tidak ada PO)' });
  }

  console.log('RENCANA PEMULIHAN');
  for (const p of plan) {
    console.log(`  ${p.id}`);
    console.log(`     nama       : ${p.catalog.bookName}`);
    console.log(`     stok       : ${p.qty} unit`);
    console.log(`     nilai      : NT$ ${(p.value / 100).toFixed(2)}  (rata-rata NT$ ${(p.inventory.movingAverageCost / 100).toFixed(2)}/unit)`);
    console.log(`     sumber PO  : ${p.from}`);
    console.log(`     dokumen    : catalog ${inCatalog.has(p.id) ? 'sudah ada' : 'DIBUAT'} | inventory ${inInventory.has(p.id) ? 'sudah ada' : 'DIBUAT'}`);
    console.log(`     isActive   : false (tidak muncul di pencarian penjualan)`);
  }
  const totalValue = plan.reduce((a, p) => a + p.value, 0);
  console.log(`\n  Total nilai yang akan kembali terlihat di laporan: NT$ ${(totalValue / 100).toFixed(2)}`);

  if (!APPLY) {
    console.log('\nDry-run selesai. Tidak ada yang ditulis.');
    console.log('Jalankan ulang dengan --apply untuk menerapkan.');
    return;
  }

  const batch = db.batch();
  for (const p of plan) {
    batch.set(db.doc(`catalog/${p.id}`), p.catalog, { merge: true });
    batch.set(db.doc(`inventory/${p.id}`), p.inventory, { merge: true });
  }
  await batch.commit();

  // Verifikasi dari database
  const after = await db.collection('catalog').get();
  const stillOrphan = new Set<string>();
  const nowInCatalog = new Set(after.docs.map((d) => d.id));
  for (const e of ledger) if (e.bookId && !nowInCatalog.has(e.bookId)) stillOrphan.add(e.bookId);

  console.log(`\nSelesai. ${plan.length} buku dipulihkan.`);
  console.log(`Verifikasi: katalog kini ${after.size} buku, buku yatim tersisa ${stillOrphan.size}.`);
  if (stillOrphan.size > 0) {
    console.log('PERINGATAN: masih ada buku yatim - periksa manual.');
    process.exit(1);
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
