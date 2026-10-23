// Koreksi Biaya Platform iOPEN Mall (NT$38 per order) - disetujui owner 23/10/2026.
//
// Aturan: totalPrice = yang masuk rekening/piutang (neto). Saat SO selesai:
//   D Piutang 1110 (atau 2110) = totalPrice, D Biaya Platform 5320 = fee, K Revenue 4100 = totalPrice + fee.
// Batal / retur tidak kena fee.
//
// Kelompok:
//   A  SO selesai dengan fee, jurnal penyelesaian lama terkena bug (Piutang = total - fee, Revenue = total)
//      -> jurnal koreksi D <akun piutang> fee / K 4100 fee
//   B  Fee salah isi di SO non-iOPEN (owner: hapus fee)
//      - belum selesai: platformFee 0, totalPrice + fee
//      - #S260804004 (selesai & lunas 2.662): lihat MODE_B_COMPLETED
//   C  SO iOPEN tanpa fee (lupa diisi), status draft/packed/shipped -> platformFee 38, totalPrice - 38
//   D  SO iOPEN tanpa fee, selesai & belum dibayar -> fee + totalPrice - 38, jurnal D 5320 38 / K <akun piutang> 38
//   E  SO iOPEN tanpa fee, selesai & lunas (owner: yang masuk rekening 432) -> seperti D, ditambah koreksi
//      pelunasan D <akun piutang> 38 / K 1101 Kas NTD 38 + cashFlow keluar 38, amountPaid - 38
//   SO batal / retur tidak diubah.
//
// Jurnal koreksi: tanggal hari ini, refId = SO (ikut terhapus kalau SO dibatalkan/diretur),
// refType sales_order_completed (sisi penyelesaian) / sama dengan jurnal pelunasan (sisi pelunasan).
// Setiap order divalidasi dulu; satu saja tidak sesuai pola -> berhenti tanpa menulis. Backup JSON sebelum menulis.
//
// Jalankan:
//   npx tsx scripts/fix-platform-fee.ts            (dry-run)
//   npx tsx scripts/fix-platform-fee.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');
const FEE = 3800;
const TODAY = '2026-10-23';
// #S260804004: fee 38 salah isi, pembeli (COD FamilyMart) tercatat bayar 2.662.
//  'discount'    -> 38 dianggap diskon tambahan: discount 248, total tetap 2.662 (lunas)
//  'outstanding' -> total jadi 2.700, sisa piutang 38
const MODE_B_COMPLETED: 'discount' | 'outstanding' = (process.argv.find((a) => a.startsWith('--b='))?.slice(4) as any) || 'discount';

const n = (c: number) => `NT$${((c || 0) / 100).toLocaleString('en-US')}`;
const ACC: Record<string, string> = {
  '1101': 'Cash: NTD', '1110': 'Piutang Usaha', '2110': 'Pendapatan Diterima di Muka', '4100': 'Revenue', '5320': 'Biaya Platform',
};
const line = (code: string, debit: number, credit: number) => ({ account: ACC[code], accountCode: code, debit, credit });

type Op =
  | { kind: 'update'; ref: FirebaseFirestore.DocumentReference; data: Record<string, any>; before: Record<string, any> }
  | { kind: 'journal'; refId: string; refType: string; description: string; lines: any[] }
  | { kind: 'cashflow'; refId: string; amount: number; notes: string };

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  const [pc, cp] = await Promise.all([db.collection('periodClosings').get(), db.collection('closedPeriods').get()]);
  if (pc.docs.some((d) => d.data().status === 'Ditutup' && String(d.id).includes('2026-10')) || cp.docs.some((d) => d.id.includes('2026-10'))) {
    console.log('BERHENTI: periode Oktober 2026 sudah ditutup.');
    process.exit(1);
  }

  const orders = (await db.collection('salesOrders').get()).docs;
  const journals = (await db.collection('journalEntries').where('refType', 'in', ['sales_order_completed', 'sales_order_payment', 'income_transfer', 'sales_order_income']).get()).docs;
  const jByRef: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {};
  for (const j of journals) (jByRef[j.data().refId] ||= []).push(j);

  const ops: Op[] = [];
  const problems: string[] = [];
  const summary: Record<string, string[]> = { A: [], B: [], C: [], D: [], E: [] };
  const skipped: string[] = [];

  const completionJournal = (id: string) =>
    (jByRef[id] || []).filter((j) => j.data().refType === 'sales_order_completed' && j.data().lines?.some((l: any) => l.accountCode === '4100'));
  const recvAcc = (j: any) => j.lines.find((l: any) => (l.accountCode === '1110' || l.accountCode === '2110') && l.debit > 0);

  for (const d of orders) {
    const o = d.data();
    const fee = o.platformFee || 0;
    const isIopen = o.platformOrder === 'IopenMall';
    const st = o.status;
    const label = `${o.orderCode}`;
    if (st === 'cancelled' || st === 'returned') continue;

    // ---- A: selesai, ada fee, jurnal bug
    if (fee > 0 && isIopen && st === 'completed') {
      const cj = completionJournal(d.id);
      if (cj.length !== 1) { problems.push(`${label} (A): ${cj.length} jurnal penyelesaian`); continue; }
      const j = cj[0].data();
      const rec = recvAcc(j);
      const rev = j.lines.find((l: any) => l.accountCode === '4100')?.credit;
      const feeLine = j.lines.find((l: any) => l.accountCode === '5320')?.debit;
      if (!rec || rec.debit !== o.totalPrice - fee || rev !== o.totalPrice || feeLine !== fee) {
        problems.push(`${label} (A): jurnal ${cj[0].id} tidak sesuai pola bug`); continue;
      }
      ops.push({ kind: 'journal', refId: d.id, refType: 'sales_order_completed', description: `Koreksi Biaya Platform ${label} - Revenue = dibayar pembeli (${cj[0].id})`, lines: [line(rec.accountCode, fee, 0), line('4100', 0, fee)] });
      summary.A.push(`${label}: D ${rec.accountCode} ${n(fee)} / K 4100 ${n(fee)} (koreksi ${cj[0].id})`);
      continue;
    }

    // ---- B: fee salah isi di non-iOPEN
    if (fee > 0 && !isIopen) {
      if (st !== 'completed') {
        if ((o.amountPaid || 0) > 0) { problems.push(`${label} (B): sudah ada pembayaran ${o.amountPaid}`); continue; }
        ops.push({ kind: 'update', ref: d.ref, before: { platformFee: fee, totalPrice: o.totalPrice }, data: { platformFee: 0, totalPrice: o.totalPrice + fee } });
        summary.B.push(`${label} (${st}): fee dihapus, total ${n(o.totalPrice)} -> ${n(o.totalPrice + fee)}`);
        continue;
      }
      const cj = completionJournal(d.id);
      if (cj.length !== 1) { problems.push(`${label} (B): ${cj.length} jurnal penyelesaian`); continue; }
      const j = cj[0].data();
      const rec = recvAcc(j);
      if (!rec || rec.debit !== o.totalPrice - fee || j.lines.find((l: any) => l.accountCode === '4100')?.credit !== o.totalPrice) {
        problems.push(`${label} (B): jurnal ${cj[0].id} tidak sesuai pola bug`); continue;
      }
      if (MODE_B_COMPLETED === 'discount') {
        // Target: D piutang total / K revenue total (tanpa fee). Bug: D piutang total-fee, D 5320 fee, K revenue total.
        ops.push({ kind: 'update', ref: d.ref, before: { platformFee: fee, discount: o.discount }, data: { platformFee: 0, discount: (o.discount || 0) + fee } });
        ops.push({ kind: 'journal', refId: d.id, refType: 'sales_order_completed', description: `Koreksi ${label} - biaya platform salah isi, jadi diskon (${cj[0].id})`, lines: [line(rec.accountCode, fee, 0), line('5320', 0, fee)] });
        summary.B.push(`${label} (selesai): fee -> diskon ${n(o.discount)} -> ${n((o.discount || 0) + fee)}, total tetap ${n(o.totalPrice)}; jurnal D ${rec.accountCode} ${n(fee)} / K 5320 ${n(fee)}`);
      } else {
        ops.push({ kind: 'update', ref: d.ref, before: { platformFee: fee, totalPrice: o.totalPrice, paymentStatus: o.paymentStatus }, data: { platformFee: 0, totalPrice: o.totalPrice + fee, paymentStatus: 'partial', isUnpaid: true } });
        ops.push({ kind: 'journal', refId: d.id, refType: 'sales_order_completed', description: `Koreksi ${label} - biaya platform salah isi (${cj[0].id})`, lines: [line(rec.accountCode, 2 * fee, 0), line('5320', 0, fee), line('4100', 0, fee)] });
        summary.B.push(`${label} (selesai): fee dihapus, total ${n(o.totalPrice)} -> ${n(o.totalPrice + fee)}, sisa piutang ${n(fee)}`);
      }
      continue;
    }

    if (!isIopen || fee > 0) continue;
    // Dibayar pembeli langsung lewat transfer (bukan COD lewat iOPEN) atau total 0: tidak dikoreksi otomatis
    if (o.paymentMethod === 'Transfer' || o.totalPrice < FEE) {
      skipped.push(`${label} (${st}, ${o.paymentMethod}, total ${n(o.totalPrice)})`);
      continue;
    }

    // ---- C: iOPEN tanpa fee, belum selesai
    if (st !== 'completed') {
      if ((o.amountPaid || 0) > o.totalPrice - FEE) { problems.push(`${label} (C): amountPaid ${o.amountPaid} > total baru`); continue; }
      ops.push({ kind: 'update', ref: d.ref, before: { platformFee: 0, totalPrice: o.totalPrice }, data: { platformFee: FEE, totalPrice: o.totalPrice - FEE } });
      summary.C.push(`${label} (${st}): total ${n(o.totalPrice)} -> ${n(o.totalPrice - FEE)}`);
      continue;
    }

    // ---- D / E: iOPEN tanpa fee, selesai
    const cj = completionJournal(d.id);
    if (cj.length !== 1) { problems.push(`${label} (D/E): ${cj.length} jurnal penyelesaian`); continue; }
    const j = cj[0].data();
    const rec = recvAcc(j);
    if (!rec || rec.debit !== o.totalPrice || j.lines.find((l: any) => l.accountCode === '4100')?.credit !== o.totalPrice || j.lines.length !== 2) {
      problems.push(`${label} (D/E): jurnal ${cj[0].id} tidak sesuai pola (D piutang total / K revenue total)`); continue;
    }
    const paid = o.amountPaid || 0;
    const completionFix: Op = { kind: 'journal', refId: d.id, refType: 'sales_order_completed', description: `Koreksi Biaya Platform iOPEN ${label} (${cj[0].id})`, lines: [line('5320', FEE, 0), line(rec.accountCode, 0, FEE)] };

    if (paid === 0) {
      ops.push({ kind: 'update', ref: d.ref, before: { platformFee: 0, totalPrice: o.totalPrice }, data: { platformFee: FEE, totalPrice: o.totalPrice - FEE } });
      ops.push(completionFix);
      summary.D.push(`${label}: total ${n(o.totalPrice)} -> ${n(o.totalPrice - FEE)}; D 5320 / K ${rec.accountCode} ${n(FEE)}`);
      continue;
    }
    if (paid !== o.totalPrice) { problems.push(`${label} (E): dibayar sebagian ${paid}/${o.totalPrice}`); continue; }
    // Jurnal pelunasan yang mendebit Kas 1101 sebesar total -> akun pelunasan yang sama dipakai untuk koreksi
    const payJ = (jByRef[d.id] || []).filter((x) => x.data().refType !== 'sales_order_completed' && x.data().lines?.some((l: any) => l.accountCode === '1101' && l.debit > 0));
    const payTotal = payJ.reduce((s, x) => s + x.data().lines.find((l: any) => l.accountCode === '1101').debit, 0);
    if (payTotal !== o.totalPrice) { problems.push(`${label} (E): jurnal kas ${payTotal} != total ${o.totalPrice}`); continue; }
    const payRefType = payJ[0].data().refType;
    const payCredit = payJ[0].data().lines.find((l: any) => l.credit > 0).accountCode;
    ops.push({ kind: 'update', ref: d.ref, before: { platformFee: 0, totalPrice: o.totalPrice, amountPaid: paid }, data: { platformFee: FEE, totalPrice: o.totalPrice - FEE, amountPaid: paid - FEE } });
    ops.push(completionFix);
    ops.push({ kind: 'journal', refId: d.id, refType: payRefType, description: `Koreksi Terima Piutang ${label} - dipotong Biaya Platform iOPEN`, lines: [line(payCredit, FEE, 0), line('1101', 0, FEE)] });
    ops.push({ kind: 'cashflow', refId: d.id, amount: FEE, notes: `Koreksi Terima Piutang ${label} - dipotong Biaya Platform iOPEN` });
    summary.E.push(`${label}: total ${n(o.totalPrice)} -> ${n(o.totalPrice - FEE)}, dibayar ${n(paid)} -> ${n(paid - FEE)}; D 5320 / K ${rec.accountCode} ${n(FEE)}; D ${payCredit} / K 1101 ${n(FEE)} (${payRefType})`);
  }

  if (problems.length) {
    console.log('BERHENTI, data tidak sesuai harapan:\n' + problems.map((p) => '  - ' + p).join('\n'));
    process.exit(1);
  }

  const titles: Record<string, string> = {
    A: 'A. Jurnal bug (SO selesai dengan fee)', B: 'B. Fee salah isi non-iOPEN (dihapus)', C: 'C. iOPEN belum selesai, isi fee',
    D: 'D. iOPEN selesai belum dibayar, isi fee', E: 'E. iOPEN selesai lunas (masuk 432), isi fee + koreksi kas',
  };
  for (const k of Object.keys(summary)) {
    console.log(`\n${titles[k]}: ${summary[k].length}`);
    summary[k].forEach((s) => console.log('  ' + s));
  }
  const sum = (code: string, side: 'debit' | 'credit') =>
    ops.filter((o): o is Extract<Op, { kind: 'journal' }> => o.kind === 'journal').reduce((s, o) => s + o.lines.filter((l) => l.accountCode === code).reduce((a, l) => a + l[side], 0), 0);
  console.log(`\nDilewati (iOPEN tanpa fee, metode Transfer / total < fee): ${skipped.length}`);
  skipped.forEach((s) => console.log('  ' + s));
  console.log('\nTotal jurnal koreksi (debit - kredit):');
  for (const c of ['1101', '1110', '2110', '4100', '5320']) console.log(`  ${c} ${ACC[c]}: ${n(sum(c, 'debit') - sum(c, 'credit'))}`);
  console.log(`Jurnal baru: ${ops.filter((o) => o.kind === 'journal').length}, update SO: ${ops.filter((o) => o.kind === 'update').length}, cashFlow: ${ops.filter((o) => o.kind === 'cashflow').length}`);

  if (!APPLY) {
    console.log(`\nDry-run selesai (#S260804004 mode: ${MODE_B_COMPLETED}). Jalankan dengan --apply untuk menulis.`);
    process.exit(0);
  }

  // Nomor jurnal dari counter yang sama dengan aplikasi (JURNAL_yymmdd)
  const dateStr = TODAY.slice(2).replace(/-/g, '');
  const nJ = ops.filter((o) => o.kind === 'journal').length;
  const counterRef = db.collection('counters').doc(`JURNAL_${dateStr}`);
  const start = await db.runTransaction(async (t) => {
    const s = await t.get(counterRef);
    const cur = s.exists ? s.data()!.value : 0;
    t.set(counterRef, { value: cur + nJ }, { merge: true });
    return cur + 1;
  });

  const backupPath = `scripts/backup-platform-fee-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(ops.map((o) => (o.kind === 'update' ? { kind: o.kind, path: o.ref.path, before: o.before, after: o.data } : o)), null, 2));
  console.log(`\nBackup: ${backupPath}`);

  const date = Timestamp.fromDate(new Date(TODAY));
  const written: string[] = [];
  let seq = start;
  let batch = db.batch();
  let count = 0;
  for (const o of ops) {
    if (o.kind === 'update') batch.update(o.ref, { ...o.data, updatedAt: Timestamp.now() });
    else if (o.kind === 'journal') {
      const id = `JU${dateStr}${String(seq++).padStart(4, '0')}`;
      written.push(id);
      batch.set(db.collection('journalEntries').doc(id), { id, date, description: o.description, refType: o.refType, refId: o.refId, isAuto: true, createdAt: Timestamp.now(), lines: o.lines });
    } else {
      const ref = db.collection('cashFlow').doc();
      batch.set(ref, { id: ref.id, date, ledger: 'NTD', direction: 'outflow', amount: o.amount, notes: o.notes, category: 'operating', accountCode: '1101', refId: o.refId });
    }
    if (++count % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Selesai. Jurnal ${written[0]} .. ${written[written.length - 1]} (${written.length}).`);
  process.exit(0);
})();
