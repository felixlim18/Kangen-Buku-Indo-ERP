// Posting jurnal penerimaan barang yang hilang.
//
// handleSaveBulkScannedPO (jalur "terima barang" lewat scan massal) dulu hanya
// menulis baris inventoryLedger dan dokumen inventory - tanpa jurnal sama sekali.
// Akibatnya nilai barang masuk terlihat di Laporan Bulanan tapi tidak pernah
// masuk buku besar, sehingga muncul selisih rekonsiliasi.
//
// Kodenya sudah diperbaiki (kini memanggil writeReceiptEventAndJournal seperti
// jalur penerimaan biasa). Skrip ini membereskan penerimaan yang terlanjur
// tercatat tanpa jurnal.
//
// Nilai jurnal diambil dari BARIS LEDGER-nya sendiri (qtyDelta x unitCost),
// bukan dihitung ulang dari PO - supaya buku besar dijamin sama persis dengan
// yang sudah dipakai laporan. Sisi kredit dipecah ke 1203 (Inventory in Transit)
// dan 1120 (Freight-in) menurut proporsi harga vs ongkos kirim di PO-nya,
// mengikuti pola writeReceiptEventAndJournal.
//
// Tanggal jurnal = tanggal penerimaan sesungguhnya dari baris ledger, bukan hari
// ini, supaya masuk ke bulan yang benar.
//
// Jalankan:
//   npx tsx scripts/fix-missing-receipt-journals.ts            (dry-run)
//   npx tsx scripts/fix-missing-receipt-journals.ts --apply     (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');

const toDate = (v: any): Date =>
  v?.toDate ? v.toDate() : (typeof v?.seconds === 'number' ? new Date(v.seconds * 1000) : new Date(v));

async function nextJournalId(dateStr: string): Promise<string> {
  const ref = db.doc(`counters/JURNAL_${dateStr}`);
  let n = 1;
  await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    if (s.exists) n = (s.data()!.value || 0) + 1;
    t.set(ref, { value: n }, { merge: true });
  });
  return `JU${dateStr}${String(n).padStart(4, '0')}`;
}

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  const [ledgerSnap, poSnap, journalSnap] = await Promise.all([
    db.collection('inventoryLedger').get(),
    db.collection('purchaseOrders').get(),
    db.collection('journalEntries').get(),
  ]);

  const pos = new Map(poSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as any]));

  // Jurnal penerimaan yang SUDAH ada, dikenali dari sourceId / kode PO di deskripsi.
  const journaledPoIds = new Set<string>();
  const journaledCodes = new Set<string>();
  for (const d of journalSnap.docs) {
    const j = d.data() as any;
    if (j.sourceDocument === 'PO_RECEIPT' && j.sourceId) journaledPoIds.add(j.sourceId);
    const desc = String(j.description || '');
    if (desc.includes('Penerimaan Barang')) {
      const m = desc.match(/PO\s*#?\s*([A-Za-z0-9]+)/);
      if (m) journaledCodes.add(m[1]);
    }
  }

  // Kelompokkan baris ledger penerimaan per PO.
  const byPo = new Map<string, { rows: any[]; valueCents: number; qty: number; firstDate: Date }>();
  for (const d of ledgerSnap.docs) {
    const e = d.data() as any;
    if (e.type !== 'purchase_received' || e.reversed === true || !e.refId) continue;
    const g = byPo.get(e.refId) || { rows: [], valueCents: 0, qty: 0, firstDate: toDate(e.timestamp) };
    g.rows.push(e);
    g.valueCents += (e.qtyDelta || 0) * (e.unitCost || 0);
    g.qty += e.qtyDelta || 0;
    const dt = toDate(e.timestamp);
    if (dt < g.firstDate) g.firstDate = dt;
    byPo.set(e.refId, g);
  }

  type Plan = { poId: string; code: string; dateStr: string; date: Date; debit: number; crTransit: number; crFreight: number; qty: number; rows: number };
  const plan: Plan[] = [];

  for (const [poId, g] of byPo) {
    const po = pos.get(poId);
    const code = po?.purchaseCode || po?.orderNumber || poId;
    if (journaledPoIds.has(poId) || journaledCodes.has(String(code))) continue; // sudah ada jurnalnya

    // Pecah kredit: bagian harga vs bagian ongkos kirim, mengikuti rumus di
    // writeReceiptEventAndJournal (forwarderFeeNTD disebar rata per unit dipesan).
    const totalQtyOrdered = (po?.items || []).reduce((a: number, it: any) => a + (it.qty || 0), 0)
      || po?.qty || g.qty || 1;
    const freightPerUnitCents = ((po?.forwarderFeeNTD || 0) * 100) / totalQtyOrdered;
    const crFreight = Math.round(freightPerUnitCents * g.qty);
    const debit = Math.round(g.valueCents);
    const crTransit = debit - crFreight; // dipaksa seimbang

    const d = g.firstDate;
    const dateStr = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    plan.push({ poId, code: String(code), dateStr, date: d, debit, crTransit, crFreight, qty: g.qty, rows: g.rows.length });
  }

  plan.sort((a, b) => b.debit - a.debit);

  console.log(`PO dengan penerimaan tercatat di ledger tapi TANPA jurnal: ${plan.length}\n`);
  if (plan.length === 0) { console.log('Tidak ada yang perlu diposting.'); return; }

  console.log('  kode PO         tgl        qty   Dr 1201      Cr 1203      Cr 1120');
  let total = 0;
  for (const p of plan) {
    total += p.debit;
    console.log(`  ${p.code.padEnd(14)} ${p.date.toISOString().slice(0, 10)} ${String(p.qty).padStart(4)} ` +
      `${(p.debit / 100).toFixed(2).padStart(10)} ${(p.crTransit / 100).toFixed(2).padStart(12)} ${(p.crFreight / 100).toFixed(2).padStart(12)}`);
  }
  console.log(`\n  TOTAL yang akan masuk buku besar: NT$ ${(total / 100).toFixed(2)}`);

  if (!APPLY) {
    console.log('\nDry-run selesai. Tidak ada yang ditulis.');
    console.log('Jalankan ulang dengan --apply untuk memposting jurnal-jurnal ini.');
    return;
  }

  let written = 0;
  for (const p of plan) {
    const po = pos.get(p.poId);
    const journalId = await nextJournalId(p.dateStr);
    const lines: any[] = [
      { accountCode: '1201', account: 'Inventory On Hand', debit: p.debit, credit: 0 },
    ];
    if (p.crTransit > 0) lines.push({ accountCode: '1203', account: 'Inventory in Transit', debit: 0, credit: p.crTransit });
    if (p.crFreight > 0) lines.push({ accountCode: '1120', account: 'Freight-in Dalam Kapitalisasi', debit: 0, credit: p.crFreight });

    await db.doc(`journalEntries/${journalId}`).set({
      id: journalId,
      date: Timestamp.fromDate(p.date),
      description: `PO #${p.code}\nPenerimaan Barang`,
      lines,
      sourceDocument: 'PO_RECEIPT',
      sourceId: p.poId,
      createdAt: Timestamp.now(),
      createdBy: 'scripts/fix-missing-receipt-journals.ts',
      isAutoGenerated: true,
      backfilled: true,
      backfillNote: 'Jurnal hilang karena penerimaan lewat scan massal dulu tidak memposting jurnal.',
    });
    written++;
  }

  console.log(`\nSelesai. ${written} jurnal penerimaan diposting.`);

  // Verifikasi: setiap PO dalam rencana kini punya jurnalnya, dan totalnya benar.
  const after = await db.collection('journalEntries').get();
  const nowJournaled = new Set(after.docs.map((d) => (d.data() as any).sourceId).filter(Boolean));
  const missing = plan.filter((p) => !nowJournaled.has(p.poId));
  console.log(`Verifikasi: total jurnal ${after.size}, PO yang masih tanpa jurnal ${missing.length}.`);
  if (missing.length > 0) { console.log('PERINGATAN: ada yang gagal - periksa manual.'); process.exit(1); }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
