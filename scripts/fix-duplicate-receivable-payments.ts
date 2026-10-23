// Membereskan pelunasan piutang ganda dari "Terima Semua Piutang" yang terjalankan dua kali pada 18/10/2026
// sekitar 07:15 (batch JU2610180060-082 lalu batch kembar JU2610180090-104). 15 Sales Order Shopee terdampak:
// amountPaid = 2x totalPrice, 2 jurnal sales_order_payment (D 1101 / K 1110) dan 2 cashFlow "Terima Piutang".
//
// Per order (daftar dicari ulang dari data, bukan di-hardcode):
//   - jurnal sales_order_payment yang dibuat BELAKANGAN dihapus (yang pertama dipertahankan)
//   - satu cashFlow kembar dihapus
//   - amountPaid dikembalikan ke totalPrice (status tetap paid)
//
// Sebelum menulis, setiap order divalidasi: tepat 2 jurnal pembayaran (D 1101 / K 1110, nominal = totalPrice),
// tepat 2 cashFlow inflow 1101 bernominal totalPrice, amountPaid = 2x totalPrice, dan periode jurnal tidak ditutup.
// Satu saja tidak cocok -> berhenti, tidak ada yang ditulis. Isi asli disimpan ke file backup JSON.
//
// Jalankan:
//   npx tsx scripts/fix-duplicate-receivable-payments.ts            (dry-run)
//   npx tsx scripts/fix-duplicate-receivable-payments.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');
const EXPECTED_ORDERS = 15;

const fmt = (cents: number) => `NT$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const isPaymentPair = (j: any, amount: number) =>
  Array.isArray(j?.lines) && j.lines.length === 2 &&
  j.lines.some((l: any) => l.accountCode === '1101' && l.debit === amount && !l.credit) &&
  j.lines.some((l: any) => l.accountCode === '1110' && l.credit === amount && !l.debit);

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  const [pc, cp] = await Promise.all([db.collection('periodClosings').get(), db.collection('closedPeriods').get()]);
  const closed = new Set<string>([
    ...cp.docs.map((d) => d.id),
    ...pc.docs.map((d) => String(d.data().period || d.data().periodId || d.data().yearMonth || d.id)),
  ]);

  const so = await db.collection('salesOrders').get();
  const overpaid = so.docs.filter((d) => (d.data().amountPaid || 0) > (d.data().totalPrice || 0) + 5);

  const plan: { orderRef: FirebaseFirestore.DocumentReference; order: any; keep: any; drop: any; dropCf: any }[] = [];
  const problems: string[] = [];

  for (const o of overpaid) {
    const v = o.data();
    const total = v.totalPrice;
    const label = `${v.orderCode} (${o.id})`;
    const journals = (await db.collection('journalEntries').where('refId', '==', o.id).where('refType', '==', 'sales_order_payment').get()).docs;
    const cfs = (await db.collection('cashFlow').where('refId', '==', o.id).get()).docs
      .filter((d) => String(d.data().notes || '').includes('Terima Piutang'));

    if (v.amountPaid !== 2 * total) problems.push(`${label}: amountPaid ${v.amountPaid} != 2x ${total}`);
    if (journals.length !== 2) problems.push(`${label}: ${journals.length} jurnal pembayaran (harus 2)`);
    if (!journals.every((j) => isPaymentPair(j.data(), total))) problems.push(`${label}: jurnal bukan D1101/K1110 ${total}`);
    if (cfs.length !== 2 || !cfs.every((c) => c.data().amount === total && c.data().accountCode === '1101' && c.data().direction === 'inflow')) {
      problems.push(`${label}: cashFlow tidak sesuai (${cfs.length})`);
    }
    for (const j of journals) {
      const ym = j.data().date.toDate().toISOString().slice(0, 7);
      if (closed.has(ym) || closed.has(ym.replace('-', ''))) problems.push(`${label}: periode ${ym} sudah ditutup`);
    }
    if (journals.length !== 2 || cfs.length !== 2) continue;

    const [keep, drop] = [...journals].sort((a, b) => a.data().createdAt.toMillis() - b.data().createdAt.toMillis());
    plan.push({ orderRef: o.ref, order: { id: o.id, ...v }, keep, drop, dropCf: cfs[1] });
  }

  if (overpaid.length !== EXPECTED_ORDERS) problems.push(`Jumlah order kelebihan bayar ${overpaid.length}, diharapkan ${EXPECTED_ORDERS}`);
  if (problems.length) {
    console.log('BERHENTI, data tidak sesuai harapan:\n' + problems.map((p) => '  - ' + p).join('\n'));
    process.exit(1);
  }

  let total = 0;
  for (const p of plan) {
    total += p.order.totalPrice;
    console.log(`${p.order.orderCode} ${p.order.orderNumber}: amountPaid ${fmt(p.order.amountPaid)} -> ${fmt(p.order.totalPrice)} | pertahankan ${p.keep.id}, hapus ${p.drop.id} + cashFlow ${p.dropCf.id}`);
  }
  console.log(`\n${plan.length} order, koreksi Kas NTD 1101 / Piutang Usaha 1110: ${fmt(total)}`);

  if (!APPLY) {
    console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.');
    process.exit(0);
  }

  const backupPath = `scripts/backup-duplicate-receivable-payments-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(plan.map((p) => ({
    order: { id: p.order.id, orderCode: p.order.orderCode, amountPaid: p.order.amountPaid, totalPrice: p.order.totalPrice },
    deletedJournal: { id: p.drop.id, ...p.drop.data() },
    keptJournal: p.keep.id,
    deletedCashFlow: { id: p.dropCf.id, ...p.dropCf.data() },
  })), null, 2));
  console.log(`\nBackup: ${backupPath}`);

  const batch = db.batch();
  for (const p of plan) {
    batch.delete(p.drop.ref);
    batch.delete(p.dropCf.ref);
    batch.update(p.orderRef, { amountPaid: p.order.totalPrice, paymentStatus: 'paid', isUnpaid: false, updatedAt: Timestamp.now() });
  }
  await batch.commit();
  console.log(`Selesai: ${plan.length} jurnal + ${plan.length} cashFlow dihapus, amountPaid dikoreksi.`);
  process.exit(0);
})();
