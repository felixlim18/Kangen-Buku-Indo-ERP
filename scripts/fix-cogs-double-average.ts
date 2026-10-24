// Koreksi HPP dua SO yang membuat laporan persediaan negatif (24/10/2026).
//
// #S260813002 "Seni Merayu Tuhan": HPP dikunci 119,15 karena rata-rata saat kirim masih menghitung buku
// #S260808020 yang sudah dikirim (SO-nya belum selesai). Harga beli buku ini 107,60 -> HPP kelebihan 11,55.
// Bug di getMovingAverageLandedCost (barang baru keluar dari rata-rata saat SO selesai) sudah diperbaiki.
//
// #S260925009 "Alkitab Kristen Terjemahan Baru Edisi 2": sisa pembulatan setengah sen dari harga beli
// berpecahan (mis. 142,155) -> HPP 295,23, nilai tersisa 295,22. Dikoreksi 1 sen.
//
// Per SO: jurnal sales_order_shipped (D 1202 / K 1201), jurnal sales_order_completed HPP (D 5100 / K 1202),
// ledger DISPATCHED & COMPLETED_SALE (unitCost) dan items[].cogsSnapshot diubah ke HPP yang benar.
// Efek buku besar: Persediaan 1201 naik, HPP 5100 turun sebesar selisihnya.
//
//   npx tsx scripts/fix-cogs-double-average.ts            (dry-run)
//   npx tsx scripts/fix-cogs-double-average.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');

const FIXES = [
  { order: '#S260813002', from: 11915, to: 10760 },
  { order: '#S260925009', from: 29523, to: 29522 },
];

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const problems: string[] = [];
  const writes: { ref: FirebaseFirestore.DocumentReference; before: any; after: any; label: string }[] = [];

  for (const f of FIXES) {
    const so = (await db.collection('salesOrders').where('orderCode', '==', f.order).get()).docs;
    if (so.length !== 1 || so[0].data().items?.length !== 1 || so[0].data().items[0].cogsSnapshot !== f.from || so[0].data().items[0].qty !== 1) {
      problems.push(`${f.order}: SO tidak sesuai (harus 1 item qty 1, cogsSnapshot ${f.from})`); continue;
    }
    const o = so[0];
    const js = (await db.collection('journalEntries').where('refId', '==', o.id).get()).docs;
    const shipped = js.filter((d) => d.data().refType === 'sales_order_shipped');
    const cogsJ = js.filter((d) => d.data().refType === 'sales_order_completed' && d.data().lines.some((l: any) => l.accountCode === '1202'));
    const check = (d: any, dr: string, cr: string) => d.data().lines.length === 2 &&
      d.data().lines.some((l: any) => l.accountCode === dr && l.debit === f.from) && d.data().lines.some((l: any) => l.accountCode === cr && l.credit === f.from);
    if (shipped.length !== 1 || !check(shipped[0], '1202', '1201')) problems.push(`${f.order}: jurnal kirim tidak sesuai`);
    if (cogsJ.length !== 1 || !check(cogsJ[0], '5100', '1202')) problems.push(`${f.order}: jurnal HPP tidak sesuai`);
    const led = (await db.collection('inventoryLedger').where('refId', '==', o.id).get()).docs.filter((d) => ['DISPATCHED', 'COMPLETED_SALE'].includes(d.data().type));
    if (led.length !== 2 || led.some((d) => d.data().unitCost !== f.from)) problems.push(`${f.order}: ledger tidak sesuai`);
    if (problems.length) continue;

    const swap = (lines: any[]) => lines.map((l: any) => ({ ...l, debit: l.debit === f.from ? f.to : l.debit, credit: l.credit === f.from ? f.to : l.credit }));
    for (const d of [shipped[0], cogsJ[0]]) writes.push({ ref: d.ref, before: { lines: d.data().lines }, after: { lines: swap(d.data().lines) }, label: `${f.order} ${d.id} ${d.data().refType}` });
    for (const d of led) writes.push({ ref: d.ref, before: { unitCost: f.from }, after: { unitCost: f.to }, label: `${f.order} ledger ${d.data().type}` });
    writes.push({ ref: o.ref, before: { items: o.data().items }, after: { items: o.data().items.map((it: any) => ({ ...it, cogsSnapshot: f.to })) }, label: `${f.order} cogsSnapshot` });
    console.log(`${f.order} (${o.data().items[0].bookName}): HPP NT$${f.from / 100} -> NT$${f.to / 100} (Persediaan +${(f.from - f.to) / 100}, HPP -${(f.from - f.to) / 100})`);
  }
  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  writes.forEach((w) => console.log('   ' + w.label));
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-cogs-double-average-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(writes.map((w) => ({ path: w.ref.path, before: w.before })), null, 2));
  const batch = db.batch();
  writes.forEach((w) => batch.update(w.ref, w.after));
  await batch.commit();
  console.log(`Backup: ${backupPath}\nSelesai.`);
  process.exit(0);
})();
