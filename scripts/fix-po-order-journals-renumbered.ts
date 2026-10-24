// Menghapus jurnal "Pemesanan Barang" ganda akibat kode PO yang diberi nomor ulang (24/10/2026, disetujui owner).
//
// Kode PO dulu dibuat dari tanggal input; sanitizePurchaseOrders memberi nomor ulang sesuai tanggal pembelian dan
// nomor itu tersimpan saat PO diedit. Edit mencari jurnal lama dengan nomor baru -> jurnal asli (kode lama)
// tertinggal dan jurnal baru ditambahkan. 152 PO punya 2 jurnal pemesanan (D 1203 / K kas).
//
// Pemetaan jurnal -> dokumen PO: refId = kode PO sekarang / ID dokumen, sourceId, atau kode lama yang tercatat di
// userActivities ("PO X dibuat/diperbarui" + entityId). Per PO dengan >1 jurnal: dipertahankan jurnal yang refId-nya
// = kode PO sekarang (harus tepat satu, nominal = nilai PO +-NT$1), sisanya dihapus; jurnal yang dipertahankan diberi
// sourceId = ID dokumen PO. Berhenti tanpa menulis kalau pola tidak terpenuhi atau jumlahnya bukan 152. Backup JSON.
//
//   npx tsx scripts/fix-po-order-journals-renumbered.ts            (dry-run)
//   npx tsx scripts/fix-po-order-journals-renumbered.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const EXPECTED = 152;
const n = (c: number) => `NT$${(Math.round(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const [jsS, posS, uaS, pcS] = await Promise.all(['journalEntries', 'purchaseOrders', 'userActivities', 'periodClosings'].map((c) => db.collection(c).get()));
  const closed = new Set(pcS.docs.filter((d) => d.data().status === 'Ditutup').map((d) => d.id));
  const pos = posS.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));
  const byId = new Map(pos.map((p) => [p.id, p]));
  const codeToDoc = new Map<string, string>();
  for (const p of pos) codeToDoc.set(String(p.purchaseCode), p.id);
  for (const d of uaS.docs) {
    const a = d.data();
    if (a.entityType !== 'PURCHASE_ORDER' || !byId.has(a.entityId)) continue;
    const m = String(a.details).match(/PO (\S+) (dibuat|diperbarui)/);
    if (m && !codeToDoc.has(m[1])) codeToDoc.set(m[1], a.entityId);
  }

  const order = jsS.docs.filter((d) => d.data().description === 'Pemesanan Barang');
  const perDoc = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const j of order) {
    const v = j.data();
    const docId = (v.sourceId && byId.has(v.sourceId) && v.sourceId) || (byId.has(v.refId) && v.refId) || codeToDoc.get(String(v.refId));
    if (docId) (perDoc.get(docId) || perDoc.set(docId, []).get(docId)!).push(j);
  }
  const amt = (j: any) => j.data().lines.find((l: any) => l.accountCode === '1203')?.debit || 0;

  const problems: string[] = [];
  const drops: { j: FirebaseFirestore.QueryDocumentSnapshot; po: string }[] = [];
  const keeps: { j: FirebaseFirestore.QueryDocumentSnapshot; poId: string }[] = [];
  const byCredit: Record<string, number> = {};
  for (const [docId, list] of perDoc) {
    if (list.length < 2) continue;
    const po = byId.get(docId)!;
    const keep = list.filter((j) => String(j.data().refId) === String(po.purchaseCode));
    if (keep.length !== 1) { problems.push(`${po.purchaseCode}: ${keep.length} jurnal dengan kode sekarang`); continue; }
    if (Math.abs(amt(keep[0]) - (po.purchasePriceNTD || 0)) > 100) problems.push(`${po.purchaseCode}: jurnal ${keep[0].id} ${n(amt(keep[0]))} != nilai PO ${n(po.purchasePriceNTD)}`);
    keeps.push({ j: keep[0], poId: docId });
    for (const j of list) if (j.id !== keep[0].id) {
      const ym = j.data().date?.toDate?.().toISOString().slice(0, 7);
      if (closed.has(ym)) problems.push(`${j.id}: periode ${ym} ditutup`);
      drops.push({ j, po: po.purchaseCode });
      const cr = j.data().lines.find((l: any) => l.credit > 0)?.accountCode;
      byCredit[cr] = (byCredit[cr] || 0) + amt(j);
    }
  }
  if (drops.length !== EXPECTED) problems.push(`Jurnal ganda ${drops.length}, diharapkan ${EXPECTED}`);
  if (problems.length) { console.log('BERHENTI:\n' + problems.slice(0, 20).map((p) => '  - ' + p).join('\n')); process.exit(1); }

  drops.slice(0, 8).forEach((d) => console.log(`  hapus ${d.j.id} [${d.j.data().refId}] ${n(amt(d.j))} -> PO ${d.po}`));
  console.log(`  ... total ${drops.length} jurnal, ${n(drops.reduce((a, d) => a + amt(d.j), 0))}`);
  console.log(`Koreksi: 1203 Inventory in Transit -${n(drops.reduce((a, d) => a + amt(d.j), 0))}; kas: ${Object.entries(byCredit).map(([k, v]) => `${k} +${n(v)}`).join(', ')}`);
  console.log(`Jurnal dipertahankan diberi sourceId: ${keeps.length}`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-po-order-journals-renumbered-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(drops.map((d) => ({ id: d.j.id, po: d.po, ...d.j.data() })), null, 2));
  const ops = [...drops.map((d) => (b: FirebaseFirestore.WriteBatch) => b.delete(d.j.ref)), ...keeps.map((k) => (b: FirebaseFirestore.WriteBatch) => b.update(k.j.ref, { sourceId: k.poId }))];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  console.log(`Backup: ${backupPath}\nSelesai: ${drops.length} jurnal dihapus, ${keeps.length} jurnal ditautkan.`);
  process.exit(0);
})();
