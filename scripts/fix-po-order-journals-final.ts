// Penyelesaian jurnal "Pemesanan Barang" setelah fix-po-order-journals-renumbered / -orphans (24/10/2026).
//
// Pemetaan jurnal -> dokumen PO tanpa bergantung pada kode PO (13 kode dipakai dua dokumen):
//   sourceId, lalu createdAt (jurnal pemesanan dibuat pada detik yang sama dengan PO-nya, +-3 dtk, nominal
//   terdekat), lalu kode PO yang unik (kode sekarang atau kode lama dari log aktivitas).
//
//   A. Dokumen PO dengan >1 jurnal pemesanan: dipertahankan yang nominalnya paling dekat nilai PO (seri: yang
//      refId-nya kode sekarang), sisanya dihapus.
//   B. PO bukan draft/batal, nilai > 0, tanpa jurnal pembelian apa pun (Pemesanan Barang / Migrasi): dibuat
//      jurnal D 1203 / K kas (platform IDR -> 1102 + nilai Rp; NTD -> 1101; PO belum lunas -> 2100) bertanggal
//      tanggal pembelian, sourceId = dokumen PO.
//   C. Kode PO yang dipakai dua dokumen: dokumen yang tanggal pembeliannya tidak sama dengan tanggal di kode
//      dikembalikan ke kode aslinya, yaitu kode di jurnal penerimaan barangnya sendiri (nominal = nilai PO,
//      tanggal di kode = tanggal beli). Kalau tidak ada, kode baru POYYMMDDNN sesuai tanggal pembelian.
//   Semua jurnal pemesanan yang terpetakan diberi sourceId = dokumen PO, refId = kode PO (setelah C).
// Berhenti tanpa menulis kalau ada jurnal tak terpetakan atau jumlah A/B/C tidak sesuai harapan. Backup JSON.
//
//   npx tsx scripts/fix-po-order-journals-final.ts            (dry-run)
//   npx tsx scripts/fix-po-order-journals-final.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const EXPECTED = { A: 4, B: 15, C: 13 };
const n = (c: number) => `NT$${(Math.round(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const ms = (t: any) => (t?.toMillis ? t.toMillis() : 0);
const ymdTaipei = (t: any) => (t?.toDate ? t.toDate() : new Date(t)).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10);

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const [jsS, posS, uaS, plS, pcS] = await Promise.all(['journalEntries', 'purchaseOrders', 'userActivities', 'platforms', 'periodClosings'].map((c) => db.collection(c).get()));
  const closed = new Set(pcS.docs.filter((d) => d.data().status === 'Ditutup').map((d) => d.id));
  const currency = new Map(plS.docs.map((d) => [d.id, d.data().currency || 'NTD']));
  const pos = posS.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));
  const byId = new Map(pos.map((p) => [p.id, p]));
  const codeCount: Record<string, number> = {};
  pos.forEach((p) => (codeCount[p.purchaseCode] = (codeCount[p.purchaseCode] || 0) + 1));
  const uniqueCodeToDoc = new Map<string, string>();
  for (const p of pos) if (codeCount[p.purchaseCode] === 1) uniqueCodeToDoc.set(String(p.purchaseCode), p.id);
  for (const d of uaS.docs) {
    const a = d.data();
    if (a.entityType !== 'PURCHASE_ORDER' || !byId.has(a.entityId)) continue;
    const m = String(a.details).match(/PO (\S+) (dibuat|diperbarui)/);
    if (m && !codeCount[m[1]] && !uniqueCodeToDoc.has(m[1])) uniqueCodeToDoc.set(m[1], a.entityId);
  }

  const amt = (j: any) => j.data().lines.find((l: any) => l.accountCode === '1203')?.debit || 0;
  const order = jsS.docs.filter((d) => d.data().description === 'Pemesanan Barang');
  const perDoc = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  const unmapped: string[] = [];
  for (const j of order) {
    const v = j.data();
    let docId: string | undefined = v.sourceId && byId.has(v.sourceId) ? v.sourceId : undefined;
    if (!docId) {
      const c = pos.filter((p) => Math.abs(ms(p.createdAt) - ms(v.createdAt)) < 3000).sort((a, b) => Math.abs((a.purchasePriceNTD || 0) - amt(j)) - Math.abs((b.purchasePriceNTD || 0) - amt(j)));
      docId = c[0]?.id;
    }
    if (!docId) docId = (byId.has(v.refId) && v.refId) || uniqueCodeToDoc.get(String(v.refId));
    if (docId) (perDoc.get(docId) || perDoc.set(docId, []).get(docId)!).push(j);
    else unmapped.push(`${j.id}[${v.refId}]`);
  }
  const migrated = new Set(jsS.docs.filter((d) => d.data().description === 'Pemesanan Barang (Migrasi)').flatMap((d) => [d.data().refId, d.data().sourceId]).filter(Boolean));

  // C: kode baru untuk dokumen yang tanggal pembeliannya tidak cocok dengan tanggal di kodenya
  const problems: string[] = [];
  const usedCodes = new Set(pos.map((p) => String(p.purchaseCode)));
  const newCode = new Map<string, string>();
  for (const [code, c] of Object.entries(codeCount)) {
    if (c < 2) continue;
    const docs = pos.filter((p) => p.purchaseCode === code);
    const codeDate = code.slice(2, 8);
    const mismatched = docs.filter((p) => ymdTaipei(p.purchaseDate).slice(2).replace(/-/g, '') !== codeDate);
    if (mismatched.length !== 1) { problems.push(`${code}: ${mismatched.length} dokumen tanggalnya tidak cocok dengan kode`); continue; }
    const p = mismatched[0];
    const ymd = ymdTaipei(p.purchaseDate).slice(2).replace(/-/g, '');
    // Kode asli PO ini tercatat di jurnal penerimaan barangnya sendiri ("PO #<kode> Penerimaan Barang",
    // nominal = nilai PO, tanggal di kode = tanggal beli). Pakai kode itu kalau belum dipakai dokumen lain.
    const receiptCodes = [...new Set(jsS.docs
      .map((d) => d.data())
      .filter((j) => /Penerimaan Barang/.test(String(j.description)) &&
        Math.abs((j.lines || []).find((l: any) => l.accountCode === '1203' && l.credit > 0)?.credit - (p.purchasePriceNTD || 0)) <= 2)
      .map((j) => (String(j.description).replace(/\s+/g, ' ').match(/PO #(PO\d{8})/) || [])[1])
      .filter((c) => c && c.slice(2, 8) === ymd && !usedCodes.has(c)))];
    let nc: string;
    if (receiptCodes.length === 1) nc = receiptCodes[0];
    else if (receiptCodes.length > 1) { problems.push(`${code} (${p.id}): beberapa kandidat kode ${receiptCodes.join(',')}`); continue; }
    else {
      let seq = 1;
      while (usedCodes.has(`PO${ymd}${String(seq).padStart(2, '0')}`)) seq++;
      nc = `PO${ymd}${String(seq).padStart(2, '0')}`;
    }
    usedCodes.add(nc);
    newCode.set(p.id, nc);
  }
  const codeOf = (p: any) => newCode.get(p.id) || p.purchaseCode;

  // A & B
  const dropA: { j: FirebaseFirestore.QueryDocumentSnapshot; po: any }[] = [];
  const createB: any[] = [];
  const link: { j: FirebaseFirestore.QueryDocumentSnapshot; po: any }[] = [];
  for (const p of pos) {
    const list = perDoc.get(p.id) || [];
    if (list.length > 1) {
      const keep = [...list].sort((a, b) => Math.abs(amt(a) - (p.purchasePriceNTD || 0)) - Math.abs(amt(b) - (p.purchasePriceNTD || 0)) || Number(String(b.data().refId) === String(p.purchaseCode)) - Number(String(a.data().refId) === String(p.purchaseCode)))[0];
      list.filter((j) => j.id !== keep.id).forEach((j) => dropA.push({ j, po: p }));
      link.push({ j: keep, po: p });
    } else if (list.length === 1) link.push({ j: list[0], po: p });
    else if (!['draft', 'cancelled'].includes(p.status) && (p.purchasePriceNTD || 0) > 0 && !migrated.has(p.id) && !migrated.has(p.purchaseCode)) createB.push(p);
  }
  if (unmapped.length) problems.push(`Jurnal tak terpetakan: ${unmapped.join(', ')}`);
  if (dropA.length !== EXPECTED.A || createB.length !== EXPECTED.B || newCode.size !== EXPECTED.C) problems.push(`A/B/C = ${dropA.length}/${createB.length}/${newCode.size}, diharapkan ${EXPECTED.A}/${EXPECTED.B}/${EXPECTED.C}`);
  for (const p of createB) if (closed.has(ymdTaipei(p.purchaseDate).slice(0, 7))) problems.push(`${p.purchaseCode}: periode ditutup`);

  console.log(`A. Jurnal ganda dihapus: ${dropA.length}, ${n(dropA.reduce((a, x) => a + amt(x.j), 0))}`);
  dropA.forEach((x) => console.log(`   ${x.j.id} [${x.j.data().refId}] ${n(amt(x.j))} -> PO ${x.po.purchaseCode} (${n(x.po.purchasePriceNTD)})`));
  const cashB: Record<string, number> = {};
  console.log(`B. Jurnal pemesanan dibuat: ${createB.length}, ${n(createB.reduce((a, p) => a + p.purchasePriceNTD, 0))}`);
  createB.forEach((p) => {
    const cur = currency.get(p.supplierId) || 'NTD';
    const acc = p.paymentStatus === 'unpaid' ? '2100' : cur === 'IDR' ? '1102' : '1101';
    cashB[acc] = (cashB[acc] || 0) + p.purchasePriceNTD;
    console.log(`   ${codeOf(p)} ${ymdTaipei(p.purchaseDate)} ${n(p.purchasePriceNTD)}${cur === 'IDR' ? ` (Rp${(p.purchasePriceIDR || 0).toLocaleString('id-ID')})` : ''} ${p.supplierName} -> K ${acc} "${String(p.bookName).slice(0, 30)}"`);
  });
  console.log(`C. Kode baru: ${newCode.size}`);
  newCode.forEach((c, id) => console.log(`   ${byId.get(id).purchaseCode} -> ${c} (beli ${ymdTaipei(byId.get(id).purchaseDate)}, ${n(byId.get(id).purchasePriceNTD)})`));
  console.log(`Tautan sourceId/refId diperbarui: ${link.filter((x) => x.j.data().sourceId !== x.po.id || String(x.j.data().refId) !== String(codeOf(x.po))).length} jurnal`);
  const dropSum = dropA.reduce((a, x) => a + amt(x.j), 0);
  console.log(`\nDampak: 1203 ${n(createB.reduce((a, p) => a + p.purchasePriceNTD, 0) - dropSum)}; kas: ${Object.entries(cashB).map(([k, v]) => `${k} -${n(v)}`).join(', ')}; 1102 +${n(dropSum)} (A)`);
  if (problems.length) { console.log('\nBERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-po-order-journals-final-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({
    deleted: dropA.map((x) => ({ id: x.j.id, ...x.j.data() })),
    relinked: link.map((x) => ({ id: x.j.id, refId: x.j.data().refId, sourceId: x.j.data().sourceId || null })),
    recoded: [...newCode].map(([id, c]) => ({ id, from: byId.get(id).purchaseCode, to: c })),
  }, null, 2));

  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  dropA.forEach((x) => ops.push((b) => b.delete(x.j.ref)));
  newCode.forEach((c, id) => ops.push((b) => b.update(byId.get(id).ref, { purchaseCode: c, updatedAt: Timestamp.now() })));
  link.forEach((x) => {
    if (x.j.data().sourceId !== x.po.id || String(x.j.data().refId) !== String(codeOf(x.po))) ops.push((b) => b.update(x.j.ref, { sourceId: x.po.id, refId: codeOf(x.po) }));
  });
  const created: string[] = [];
  for (const p of createB) {
    const ymd = ymdTaipei(p.purchaseDate);
    const yymmdd = ymd.slice(2).replace(/-/g, '');
    const counter = db.collection('counters').doc(`JURNAL_${yymmdd}`);
    const seq = await db.runTransaction(async (t) => { const s = await t.get(counter); const v = (s.exists ? s.data()!.value : 0) + 1; t.set(counter, { value: v }, { merge: true }); return v; });
    const id = `JU${yymmdd}${String(seq).padStart(4, '0')}`;
    created.push(`${id} ${codeOf(p)}`);
    const cur = currency.get(p.supplierId) || 'NTD';
    const isIdr = cur === 'IDR';
    const acc = p.paymentStatus === 'unpaid' ? { code: '2100', name: 'Utang Usaha' } : isIdr ? { code: '1102', name: 'Cash: Rupiah' } : { code: '1101', name: 'Cash: NTD' };
    const idr = isIdr ? Math.round(p.purchasePriceIDR || 0) : 0;
    ops.push((b) => b.set(db.collection('journalEntries').doc(id), {
      id, date: p.purchaseDate, description: 'Pemesanan Barang', refType: 'System', refId: codeOf(p), sourceId: p.id,
      createdAt: Timestamp.now(), note: 'Dibuat ulang 24/10/2026: jurnal pemesanan hilang (kode PO kembar)',
      lines: [
        { account: 'Inventory in Transit', accountCode: '1203', debit: p.purchasePriceNTD, credit: 0, ...(isIdr ? { originalCurrency: 'IDR', originalDebitIDR: idr, originalCreditIDR: 0 } : {}) },
        { account: acc.name, accountCode: acc.code, debit: 0, credit: p.purchasePriceNTD, ...(isIdr ? { originalCurrency: 'IDR', originalDebitIDR: 0, originalCreditIDR: idr } : {}) },
      ],
    }));
  }
  for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((op) => op(b)); await b.commit(); }
  console.log(`Backup: ${backupPath}\nSelesai. Jurnal baru: ${created.join(', ')}`);
  process.exit(0);
})();
