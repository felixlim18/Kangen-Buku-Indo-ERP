// Lanjutan fix-po-order-journals-renumbered.ts: 40 jurnal "Pemesanan Barang" yang refId-nya kode PO lama dan
// tidak terpetakan lewat log aktivitas (24/10/2026).
//
// Dipetakan lewat createdAt (jurnal pemesanan dibuat pada detik yang sama dengan dokumen PO-nya, toleransi 5 dtk;
// kalau ada beberapa kandidat, yang nominalnya paling dekat):
//   - PO masih ada & sudah punya jurnal pemesanan lain  -> jurnal ganda, dihapus
//   - PO masih ada & tidak punya jurnal lain            -> dipertahankan, refId/sourceId ditautkan ke PO
//   - Tidak ada PO (dokumen sudah dihapus; log aktivitas mencatat "PO X dibuat" untuk dokumen yang kini tidak
//     ada) -> sisa PO terhapus, dihapus
// Berhenti tanpa menulis kalau jumlahnya tidak 31 / 1 / 8. Backup JSON.
//
//   npx tsx scripts/fix-po-order-journals-orphans.ts            (dry-run)
//   npx tsx scripts/fix-po-order-journals-orphans.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const EXPECTED = { duplicate: 31, relink: 1, deletedPo: 8 };
const n = (c: number) => `NT$${(Math.round(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const ms = (t: any) => (t?.toMillis ? t.toMillis() : 0);

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const [jsS, posS, uaS] = await Promise.all(['journalEntries', 'purchaseOrders', 'userActivities'].map((c) => db.collection(c).get()));
  const pos = posS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const byId = new Map(pos.map((p) => [p.id, p]));
  const codeToDoc = new Map<string, string>();
  for (const p of pos) codeToDoc.set(String(p.purchaseCode), p.id);
  const createdDocByCode = new Map<string, string>(); // kode -> entityId dari log "dibuat" (termasuk dokumen yang dihapus)
  for (const d of uaS.docs) {
    const a = d.data();
    if (a.entityType !== 'PURCHASE_ORDER') continue;
    const m = String(a.details).match(/PO (\S+) (dibuat|diperbarui)/);
    if (!m) continue;
    if (byId.has(a.entityId) && !codeToDoc.has(m[1])) codeToDoc.set(m[1], a.entityId);
    if (m[2] === 'dibuat') createdDocByCode.set(m[1], a.entityId);
  }
  const order = jsS.docs.filter((d) => d.data().description === 'Pemesanan Barang');
  const linkOf = (v: any) => (v.sourceId && byId.has(v.sourceId) && v.sourceId) || (byId.has(v.refId) && v.refId) || codeToDoc.get(String(v.refId));
  const linkedCount = new Map<string, number>();
  const orphans: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const j of order) { const d = linkOf(j.data()); if (d) linkedCount.set(d, (linkedCount.get(d) || 0) + 1); else orphans.push(j); }
  const amt = (j: any) => j.data().lines.find((l: any) => l.accountCode === '1203')?.debit || 0;

  const dup: any[] = [], relink: any[] = [], deletedPo: any[] = [], unknown: any[] = [];
  for (const o of orphans) {
    const v = o.data();
    const cands = pos.filter((p) => Math.abs(ms(p.createdAt) - ms(v.createdAt)) < 5000)
      .sort((a, b) => Math.abs((a.purchasePriceNTD || 0) - amt(o)) - Math.abs((b.purchasePriceNTD || 0) - amt(o)));
    const po = cands[0];
    if (po) (linkedCount.get(po.id) ? dup : relink).push({ o, po });
    else {
      const entity = createdDocByCode.get(String(v.refId));
      if (entity && !byId.has(entity)) deletedPo.push({ o, entity });
      else unknown.push({ o });
    }
  }
  const problems: string[] = [];
  if (unknown.length) problems.push(`Tidak terpetakan: ${unknown.map((u) => u.o.id).join(', ')}`);
  if (dup.length !== EXPECTED.duplicate || relink.length !== EXPECTED.relink || deletedPo.length !== EXPECTED.deletedPo) {
    problems.push(`Jumlah ganda/tautkan/PO-terhapus = ${dup.length}/${relink.length}/${deletedPo.length}, diharapkan ${EXPECTED.duplicate}/${EXPECTED.relink}/${EXPECTED.deletedPo}`);
  }
  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  const sum = (a: any[]) => a.reduce((s, x) => s + amt(x.o), 0);
  console.log(`Ganda (PO sudah punya jurnal):  ${dup.length} jurnal, ${n(sum(dup))} -> dihapus`);
  console.log(`Sisa PO yang sudah dihapus:     ${deletedPo.length} jurnal, ${n(sum(deletedPo))} -> dihapus (${deletedPo.map((x) => x.o.data().refId).join(', ')})`);
  relink.forEach((x) => console.log(`Satu-satunya jurnal PO:          ${x.o.id} [${x.o.data().refId}] ${n(amt(x.o))} -> ditautkan ke ${x.po.purchaseCode} (nilai PO ${n(x.po.purchasePriceNTD)})`));
  const drop = [...dup, ...deletedPo];
  console.log(`\nKoreksi: 1203 Inventory in Transit -${n(sum(drop))}, 1102 Cash Rupiah +${n(sum(drop))}`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-po-order-journals-orphans-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ deleted: drop.map((x) => ({ id: x.o.id, ...x.o.data() })), relinked: relink.map((x) => ({ id: x.o.id, refId: x.o.data().refId })) }, null, 2));
  const batch = db.batch();
  drop.forEach((x) => batch.delete(x.o.ref));
  relink.forEach((x) => batch.update(x.o.ref, { refId: x.po.purchaseCode, sourceId: x.po.id }));
  await batch.commit();
  console.log(`Backup: ${backupPath}\nSelesai: ${drop.length} jurnal dihapus, ${relink.length} ditautkan.`);
  process.exit(0);
})();
