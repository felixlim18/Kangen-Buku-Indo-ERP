// Audit baca-saja konsistensi data akuntansi. Tidak menulis apa pun.
//   npx tsx scripts/audit-ledger.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const n = (c: number) => `NT$${(Math.round(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const day = (t: any) => (t?.toDate ? t.toDate().toISOString().slice(0, 10) : String(t).slice(0, 10));

(async () => {
  const [jsS, soS, coaS, cfS, poS, invS] = await Promise.all(['journalEntries', 'salesOrders', 'coa', 'cashFlow', 'purchaseOrders', 'inventory'].map((c) => db.collection(c).get()));
  const js = jsS.docs.map((d) => ({ _id: d.id, ...(d.data() as any) }));
  const so = soS.docs.map((d) => ({ _id: d.id, ...(d.data() as any) }));
  const coa = new Map(coaS.docs.map((d) => [String(d.data().code), d.data().name]));
  const nameToCode = new Map(coaS.docs.map((d) => [String(d.data().name).trim().toLowerCase(), String(d.data().code)]));
  const codeOf = (l: any) => String(l.accountCode || nameToCode.get(String(l.account || '').trim().toLowerCase()) || '?');

  // 1. Jurnal tidak seimbang / tanpa kode akun / akun tidak ada di COA
  const unbalanced = js.filter((j) => {
    const d = (j.lines || []).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const c = (j.lines || []).reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    return Math.abs(d - c) > 1;
  });
  console.log(`\n[1] Jurnal tidak seimbang: ${unbalanced.length}`);
  unbalanced.slice(0, 15).forEach((j) => {
    const d = j.lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0), c = j.lines.reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    console.log(`   ${j._id} ${day(j.date)} ${j.refType || '-'} D${n(d)} K${n(c)} selisih ${n(d - c)} | ${String(j.description).slice(0, 70)}`);
  });
  const unknown: Record<string, number> = {};
  for (const j of js) for (const l of j.lines || []) { const c = codeOf(l); if (!coa.has(c)) unknown[`${c} "${l.account}"`] = (unknown[`${c} "${l.account}"`] || 0) + 1; }
  console.log(`[1b] Baris jurnal dengan akun tidak dikenal di COA:`, unknown);
  const nameMismatch: Record<string, number> = {};
  for (const j of js) for (const l of j.lines || []) if (l.accountCode && coa.has(String(l.accountCode)) && l.account && coa.get(String(l.accountCode)) !== l.account) { const k = `${l.accountCode}: COA "${coa.get(String(l.accountCode))}" vs jurnal "${l.account}"`; nameMismatch[k] = (nameMismatch[k] || 0) + 1; }
  console.log(`[1c] Nama akun di jurnal beda dengan COA:`, nameMismatch);

  // 2. Jurnal kembar: refId + refType + baris identik
  const sig = new Map<string, any[]>();
  for (const j of js) {
    if (!j.refId) continue;
    const k = `${j.refId}|${j.refType}|${(j.lines || []).map((l: any) => `${codeOf(l)}:${l.debit}:${l.credit}`).sort().join(',')}`;
    (sig.get(k) || sig.set(k, []).get(k)!).push(j);
  }
  const dups = [...sig.values()].filter((a) => a.length > 1);
  console.log(`\n[2] Kelompok jurnal kembar (refId+refType+baris sama): ${dups.length}`);
  const byType: Record<string, number> = {};
  for (const g of dups) byType[g[0].refType] = (byType[g[0].refType] || 0) + g.length - 1;
  console.log('   kelebihan per refType:', byType);
  dups.slice(0, 20).forEach((g) => console.log(`   ${g[0].refType} ref=${g[0].refId} x${g.length}: ${g.map((j: any) => `${j._id}@${day(j.date)}`).join(', ')} | ${String(g[0].description).slice(0, 60)}`));

  // 3. Sales order vs jurnal
  const byRef: Record<string, any[]> = {};
  for (const j of js) if (j.refId) (byRef[j.refId] ||= []).push(j);
  const issues: string[] = [];
  for (const o of so) {
    const jj = byRef[o._id] || [];
    const comp = jj.filter((j) => j.refType === 'sales_order_completed' && j.lines?.some((l: any) => codeOf(l) === '4100'));
    const ship = jj.filter((j) => j.refType === 'sales_order_shipped');
    if (o.status === 'completed' && comp.length === 0) issues.push(`${o.orderCode} selesai tanpa jurnal pendapatan`);
    if (['cancelled', 'draft'].includes(o.status) && jj.length) issues.push(`${o.orderCode} status ${o.status} masih punya ${jj.length} jurnal (${[...new Set(jj.map((j) => j.refType))].join(',')})`);
    if (['shipped', 'completed'].includes(o.status) && ship.length === 0 && (o.items || []).length) issues.push(`${o.orderCode} ${o.status} tanpa jurnal pengiriman (persediaan)`);
    const pay = jj.filter((j) => j.refType === 'sales_order_payment' || j.refType === 'sales_order_transfer_payment')
      .reduce((s, j) => s + (j.lines || []).filter((l: any) => ['1101', '1102'].includes(codeOf(l))).reduce((a: number, l: any) => a + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0), 0);
    if ((o.amountPaid || 0) !== pay && Math.abs((o.amountPaid || 0) - pay) > 5 && o.status !== 'cancelled') issues.push(`${o.orderCode} ${o.status} amountPaid ${n(o.amountPaid || 0)} != kas dari jurnal pelunasan ${n(pay)}`);
    if ((o.amountPaid || 0) > (o.totalPrice || 0) + 5) issues.push(`${o.orderCode} kelebihan bayar`);
    const calc = (o.subtotal || 0) - (o.discount || 0) - (o.platformFee || 0);
    if (o.subtotal !== undefined && Math.abs(calc - (o.totalPrice || 0)) > 5 && calc >= 0) issues.push(`${o.orderCode} total ${n(o.totalPrice)} != subtotal-diskon-fee ${n(calc)}`);
    const itemsSum = (o.items || []).reduce((s: number, it: any) => s + (it.lineTotal || 0), 0);
    if ((o.items || []).length && o.subtotal !== undefined && Math.abs(itemsSum - o.subtotal) > 5) issues.push(`${o.orderCode} subtotal ${n(o.subtotal)} != jumlah item ${n(itemsSum)}`);
  }
  const grp: Record<string, string[]> = {};
  for (const i of issues) { const k = i.replace(/^#\S+ /, '').replace(/NT\$[\d,.-]+/g, 'X').replace(/\d+ jurnal/, 'N jurnal').replace(/\(.*\)/, ''); (grp[k] ||= []).push(i); }
  console.log(`\n[3] Masalah Sales Order: ${issues.length}`);
  for (const [k, v] of Object.entries(grp)) { console.log(`   ${v.length}x ${k}`); v.slice(0, 6).forEach((x) => console.log(`      ${x}`)); }

  // 4. Saldo akun (neraca saldo)
  const bal: Record<string, number> = {};
  for (const j of js) for (const l of j.lines || []) { const c = codeOf(l); bal[c] = (bal[c] || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0); }
  console.log(`\n[4] Neraca saldo (debit - kredit):`);
  for (const c of Object.keys(bal).sort()) console.log(`   ${c.padEnd(5)} ${(coa.get(c) || '?').padEnd(34)} ${n(bal[c]).padStart(18)}`);
  console.log(`   TOTAL (harus 0): ${n(Object.values(bal).reduce((a, b) => a + b, 0))}`);

  // 5. Subledger vs GL
  const arSub = so.filter((o) => ['completed'].includes(o.status)).reduce((s, o) => s + Math.max(0, (o.totalPrice || 0) - (o.amountPaid || 0)), 0);
  const manual = await db.collection('manualReceivables').get().catch(() => null);
  const manualSub = manual ? manual.docs.reduce((s, d) => s + Math.max(0, (d.data().totalPrice || d.data().amount || 0) - (d.data().amountPaid || 0)), 0) : 0;
  console.log(`\n[5] Piutang: subledger SO selesai ${n(arSub)} + manual ${n(manualSub)} vs GL 1110 ${n(bal['1110'] || 0)} -> selisih ${n((bal['1110'] || 0) - arSub - manualSub)}`);
  const prepaid = so.filter((o) => !['completed', 'cancelled', 'returned'].includes(o.status)).reduce((s, o) => s + (o.amountPaid || 0), 0);
  console.log(`    Diterima di muka: SO belum selesai amountPaid ${n(prepaid)} vs GL 2110 ${n(-(bal['2110'] || 0))} -> selisih ${n(-(bal['2110'] || 0) - prepaid)}`);
  const inv = invS.docs.reduce((s, d) => s + (Number(d.data().totalInventoryValue) || 0), 0);
  const neg = invS.docs.filter((d) => (d.data().endingStock || 0) < 0);
  console.log(`    Persediaan: inventory.totalInventoryValue ${n(inv)} vs GL 1201 ${n(bal['1201'] || 0)}; stok negatif: ${neg.length} ${neg.slice(0, 5).map((d) => `${d.data().bookName || d.id}(${d.data().endingStock})`).join(', ')}`);
  const cf = cfS.docs.map((d) => d.data());
  const cfNtd = cf.filter((c) => c.ledger === 'NTD').reduce((s, c) => s + (c.direction === 'inflow' ? 1 : -1) * (c.amount || 0), 0);
  console.log(`    Kas NTD: cashFlow ${n(cfNtd)} vs GL 1101 ${n(bal['1101'] || 0)} -> selisih ${n((bal['1101'] || 0) - cfNtd)}`);

  // 6. Tanggal jurnal aneh
  const future = js.filter((j) => day(j.date) > '2026-10-23');
  const old = js.filter((j) => day(j.date) < '2025-01-01');
  console.log(`\n[6] Jurnal bertanggal masa depan: ${future.length} ${future.slice(0, 5).map((j) => `${j._id}@${day(j.date)}`).join(' ')}; sebelum 2025: ${old.length}`);
  const noDate = js.filter((j) => !j.date);
  console.log(`    Jurnal tanpa tanggal: ${noDate.length}`);

  // 7. Purchase order
  const poIssues: string[] = [];
  for (const p of poS.docs) {
    const v = p.data();
    const jj = byRef[p.id] || [];
    if (v.amountPaid !== undefined && v.totalAmount !== undefined && v.amountPaid > v.totalAmount + 5) poIssues.push(`${v.purchaseCode} dibayar ${n(v.amountPaid)} > total ${n(v.totalAmount)}`);
  }
  console.log(`\n[7] PO: ${poS.size} dokumen, masalah: ${poIssues.length}`); poIssues.slice(0, 8).forEach((x) => console.log('   ' + x));
  process.exit(0);
})();
