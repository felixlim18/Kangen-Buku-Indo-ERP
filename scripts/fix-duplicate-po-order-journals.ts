// Membereskan jurnal "Pemesanan Barang" PO yang tercatat 2-3x (Agustus 2026, simpan PO terkirim dua kali).
// 7 PO, 8 jurnal ekstra (D 1203 Inventory in Transit / K 1102 Cash: Rupiah), total NT$1.565,83.
// Penerimaan barang tiap PO tercatat sekali, jadi kelebihan 1203 tertinggal sebagai "barang dalam perjalanan".
//
// Per kode PO (dicari ulang dari data): jurnal Pemesanan Barang dengan nomor terkecil dipertahankan, sisanya
// dihapus. Validasi: tepat 1 dokumen PO, semua jurnal kembar identik (baris & createdAt), tepat 1 jurnal
// penerimaan sebesar nominal yang sama. Satu saja tidak cocok -> berhenti tanpa menulis. Backup JSON.
//
//   npx tsx scripts/fix-duplicate-po-order-journals.ts            (dry-run)
//   npx tsx scripts/fix-duplicate-po-order-journals.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const EXPECTED_EXTRA = 8;
const n = (c: number) => `NT$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const sig = (j: any) => JSON.stringify((j.lines || []).map((l: any) => [l.accountCode, l.debit, l.credit, l.originalCreditIDR || 0, l.originalDebitIDR || 0]));

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const js = (await db.collection('journalEntries').get()).docs;
  const pos = (await db.collection('purchaseOrders').get()).docs;
  const cfs = (await db.collection('cashFlow').get()).docs;

  const byCode: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {};
  for (const d of js) if (d.data().description === 'Pemesanan Barang' && d.data().refId) (byCode[d.data().refId] ||= []).push(d);
  const groups = Object.entries(byCode).filter(([, a]) => a.length > 1);

  const problems: string[] = [];
  const drops: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let total = 0, totalIdr = 0;
  for (const [code, arr] of groups) {
    const docs = pos.filter((p) => p.data().purchaseCode === code);
    if (docs.length !== 1) { problems.push(`${code}: ${docs.length} dokumen PO`); continue; }
    if (new Set(arr.map(sig)).size !== 1) problems.push(`${code}: jurnal Pemesanan Barang tidak identik`);
    if (new Set(arr.map((d) => d.data().createdAt?.toMillis?.())).size !== 1) problems.push(`${code}: createdAt berbeda`);
    const amount = arr[0].data().lines.find((l: any) => l.accountCode === '1203')?.debit;
    const receipts = js.filter((d) => String(d.data().description || '').replace(/\s+/g, ' ').startsWith(`PO #${code} Penerimaan Barang`));
    if (receipts.length !== 1 || Math.abs((receipts[0].data().lines.find((l: any) => l.accountCode === '1201')?.debit ?? -1) - amount) > 1) problems.push(`${code}: penerimaan ${receipts.length}x / nominal beda`);
    const poCf = cfs.filter((c) => c.data().refId === docs[0].id || c.data().refId === code);
    const sorted = [...arr].sort((a, b) => a.id.localeCompare(b.id));
    const idr = sorted[0].data().lines.find((l: any) => l.accountCode === '1102')?.originalCreditIDR || 0;
    console.log(`${code} "${String(docs[0].data().bookName).slice(0, 30)}" ${n(amount)} (Rp${idr.toLocaleString('id-ID')}) x${arr.length}: pertahankan ${sorted[0].id}, hapus ${sorted.slice(1).map((d) => d.id).join(', ')} | cashFlow PO: ${poCf.length}`);
    drops.push(...sorted.slice(1));
    total += amount * (arr.length - 1);
    totalIdr += idr * (arr.length - 1);
  }
  if (drops.length !== EXPECTED_EXTRA) problems.push(`Jurnal ekstra ${drops.length}, diharapkan ${EXPECTED_EXTRA}`);
  if (problems.length) { console.log('\nBERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  console.log(`\n${drops.length} jurnal dihapus. Koreksi: 1203 Inventory in Transit -${n(total)}, 1102 Cash: Rupiah +${n(total)} (Rp${totalIdr.toLocaleString('id-ID')})`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-duplicate-po-order-journals-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(drops.map((d) => ({ id: d.id, ...d.data() })), null, 2));
  console.log(`Backup: ${backupPath}`);
  const batch = db.batch();
  drops.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`Selesai: ${drops.length} jurnal kembar dihapus.`);
  process.exit(0);
})();
