// Jurnal penerimaan yang hilang untuk 12 PO akhir Juli yang diterima massal 03/08/2026 ~18:35 (24/10/2026).
//
// Ledger persediaan mencatat purchase_received, tetapi jurnal D 1201 Inventory On Hand / K 1203 Inventory in
// Transit tidak pernah dibuat: NT$2.314,44 tertahan di 1203. Jurnal "penyesuaian selisih pembulatan" Agustus
// JU2608310173 (dulu ADJ-INV-2026-08, D 1201 / K 4210 NT$1.925,65) menambal sebagian kekurangan 1201 itu.
//
//   - Buat 1 jurnal penerimaan per PO, tanggal penerimaan, D 1201 / K 1203 sebesar nilai PO, sourceId = PO
//   - Hapus JU2608310173 (tambalan; 4210 turun NT$1.925,65)
//   - PO26101301: penerimaan sebagian 21/10 menilai 2 buku dengan diskon PO dibagi rata per buku, padahal
//     marketplace membagi diskon sesuai harga (refund buku yang batal Rp185.292 sudah sesuai harga). Buku yang
//     diterima jadi NT$8,75 terlalu murah dan tertinggal di 1203: jurnal D 1201 / K 1203 NT$8,75 dan unitCost
//     ledger purchase_received kedua buku disesuaikan (nilai diterima = nilai PO - refund, dibagi sesuai harga).
// Validasi: tiap PO berstatus received, tepat 1 jurnal pemesanan sebesar nilai PO, tanpa jurnal lain yang
// mengkredit 1203, dan ledger purchase_received ada. Berhenti tanpa menulis kalau tidak sesuai. Backup JSON.
//
//   npx tsx scripts/fix-missing-receipts-2026-08-03.ts            (dry-run)
//   npx tsx scripts/fix-missing-receipts-2026-08-03.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const CODES = ['PO26072701', 'PO26072703', 'PO26072704', 'PO26072705', 'PO26072708', 'PO26072803', 'PO26072805', 'PO26072807', 'PO26072810', 'PO26072904', 'PO26072910', 'PO26072913'];
const ADJ = 'JU2608310173';
const n = (c: number) => `NT$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const [posS, jsS, ledS] = await Promise.all(['purchaseOrders', 'journalEntries', 'inventoryLedger'].map((c) => db.collection(c).get()));
  const js = jsS.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const problems: string[] = [];
  const plan: any[] = [];
  for (const code of CODES) {
    const docs = posS.docs.filter((d) => d.data().purchaseCode === code);
    if (docs.length !== 1) { problems.push(`${code}: ${docs.length} dokumen`); continue; }
    const p = { id: docs[0].id, ...(docs[0].data() as any) };
    const mine = js.filter((j) => j.sourceId === p.id || j.refId === p.id || j.refId === code || String(j.description).replace(/\s+/g, ' ').includes(`#${code} `));
    const orders = mine.filter((j) => j.description === 'Pemesanan Barang');
    const credits1203 = mine.filter((j) => j.lines.some((l: any) => l.accountCode === '1203' && l.credit > 0));
    const led = ledS.docs.filter((d) => d.data().refId === p.id && d.data().type === 'purchase_received' && !d.data().reversed);
    const ledQty = led.reduce((a, d) => a + (d.data().qtyDelta || 0), 0);
    if (p.status !== 'received') problems.push(`${code}: status ${p.status}`);
    if (orders.length !== 1 || Math.abs(orders[0].lines.find((l: any) => l.accountCode === '1203').debit - p.purchasePriceNTD) > 1) problems.push(`${code}: jurnal pemesanan tidak sesuai`);
    if (credits1203.length) problems.push(`${code}: sudah ada jurnal yang mengkredit 1203 (${credits1203.map((j) => j.id).join(',')})`);
    if (!led.length || ledQty !== (p.receipts || []).reduce((a: number, r: any) => a + (r.receivedQty || 0), 0)) problems.push(`${code}: ledger penerimaan tidak sesuai`);
    const rDate = p.receipts?.[0]?.receivedDate;
    plan.push({ p, code, rDate, amount: Math.round(p.purchasePriceNTD) });
  }
  const adj = js.find((j) => j.id === ADJ);
  if (!adj || adj.refType !== 'inventory_adjustment' || adj.lines.length !== 2 || adj.lines.find((l: any) => l.accountCode === '1201')?.debit !== 192565) problems.push(`${ADJ} tidak sesuai harapan`);
  // PO26101301
  const p13d = posS.docs.find((d) => d.data().purchaseCode === 'PO26101301');
  const p13 = p13d ? { id: p13d.id, ...(p13d.data() as any) } : null;
  const p13j = js.filter((j) => j.refId === p13?.id || j.sourceId === p13?.id || j.refId === 'PO26101301' || String(j.description).includes('PO26101301'));
  const p13bal = p13j.reduce((a, j) => a + j.lines.filter((l: any) => l.accountCode === '1203').reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0), 0);
  const p13led = ledS.docs.filter((d) => d.data().refId === p13?.id && d.data().type === 'purchase_received' && !d.data().reversed);
  if (!p13 || Math.round(p13bal) !== 875 || p13led.length !== 2) problems.push(`PO26101301: saldo 1203 ${p13bal}, ledger ${p13led.length} (harus 875 / 2)`);
  const received = (p13?.items || []).filter((i: any) => !i.isCancelled);
  const recvGross = received.reduce((a: number, i: any) => a + i.priceNTDTotal, 0);
  const recvTarget = p13led.reduce((a, d) => a + d.data().qtyDelta * d.data().unitCost, 0) + 875;
  const ledPlan = p13led.map((d, i) => {
    const it = received.find((x: any) => x.bookId === d.data().bookId);
    return { d, it };
  });
  let rest = Math.round(recvTarget);
  const newUnits = ledPlan.map((x, i) => {
    const v = i === ledPlan.length - 1 ? rest : Math.round(recvTarget * (x.it?.priceNTDTotal || 0) / recvGross);
    rest -= v;
    return { ...x, unit: v / (x.d.data().qtyDelta || 1) };
  });
  if (newUnits.some((x) => !x.it)) problems.push('PO26101301: ledger tidak cocok dengan item');

  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  plan.forEach((x) => console.log(`  ${x.code} ${x.rDate.toDate().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16)} D 1201 / K 1203 ${n(x.amount)}  "${String(x.p.bookName).slice(0, 34)}"`));
  const total = plan.reduce((a, x) => a + x.amount, 0);
  console.log(`\nTotal jurnal penerimaan: ${n(total)} (1201 +, 1203 -)`);
  console.log(`Hapus ${ADJ} "${adj.description}" D 1201 / K 4210 ${n(192565)}`);
  console.log(`Bersih: 1201 +${n(total - 192565)}, 1203 -${n(total)}, 4210 (pendapatan) -${n(192565)}`);
  console.log(`\nPO26101301: D 1201 / K 1203 ${n(875)}; unitCost ledger: ${newUnits.map((x) => `${String(x.it.bookName).slice(0, 26)} ${(x.d.data().unitCost / 100).toFixed(2)} -> ${(x.unit / 100).toFixed(2)}`).join('; ')}`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-missing-receipts-2026-08-03-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ deletedAdjustment: adj, po26101301Ledger: newUnits.map((x) => ({ path: x.d.ref.path, unitCost: x.d.data().unitCost })) }, null, 2));
  const counter = db.collection('counters').doc('JURNAL_260803');
  const start = await db.runTransaction(async (t) => { const s = await t.get(counter); const v = s.exists ? s.data()!.value : 0; t.set(counter, { value: v + plan.length }, { merge: true }); return v + 1; });
  const batch = db.batch();
  const ids: string[] = [];
  plan.forEach((x, i) => {
    const id = `JU260803${String(start + i).padStart(4, '0')}`;
    ids.push(`${id} ${x.code}`);
    batch.set(db.collection('journalEntries').doc(id), {
      id, date: x.rDate, description: `PO #${x.code} Penerimaan Barang`, refType: 'purchase_receipt', refId: x.p.id, sourceId: x.p.id,
      createdAt: Timestamp.now(), note: 'Dibuat ulang 24/10/2026: jurnal penerimaan massal 03/08/2026 tidak tercatat',
      lines: [
        { account: 'Inventory On Hand', accountCode: '1201', debit: x.amount, credit: 0 },
        { account: 'Inventory in Transit', accountCode: '1203', debit: 0, credit: x.amount },
      ],
    });
  });
  batch.delete(db.collection('journalEntries').doc(ADJ));
  const c13 = db.collection('counters').doc('JURNAL_261021');
  const s13 = await db.runTransaction(async (t) => { const s = await t.get(c13); const v = (s.exists ? s.data()!.value : 0) + 1; t.set(c13, { value: v }, { merge: true }); return v; });
  const id13 = `JU261021${String(s13).padStart(4, '0')}`;
  ids.push(`${id13} PO26101301 (8,75)`);
  batch.set(db.collection('journalEntries').doc(id13), {
    id: id13, date: Timestamp.fromDate(new Date('2026-10-21T21:09:00+08:00')), description: 'PO #PO26101301 Koreksi Nilai Penerimaan (diskon dibagi sesuai harga)',
    refType: 'purchase_receipt', refId: p13!.id, sourceId: p13!.id, createdAt: Timestamp.now(),
    lines: [
      { account: 'Inventory On Hand', accountCode: '1201', debit: 875, credit: 0 },
      { account: 'Inventory in Transit', accountCode: '1203', debit: 0, credit: 875 },
    ],
  });
  newUnits.forEach((x) => batch.update(x.d.ref, { unitCost: x.unit }));
  await batch.commit();
  console.log(`Backup: ${backupPath}\nSelesai: ${ids.join(', ')}; ${ADJ} dihapus.`);
  process.exit(0);
})();
