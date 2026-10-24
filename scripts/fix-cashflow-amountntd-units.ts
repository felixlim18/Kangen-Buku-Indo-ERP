// Seragamkan cashFlow.amountNTD ke sen (25/10/2026). Tab Utang/Pinjaman dulu menyimpannya dalam NT$ utuh,
// semua tempat lain dalam sen. Field ini tidak dibaca laporan mana pun (Arus Kas dihitung dari jurnal), tapi
// disamakan supaya tidak menjebak. Dokumen dianggap "NT$ utuh" kalau amount / amountNTD > 50 (NTD: ~100,
// IDR: ~560); dokumen sen rasionya ~1 (NTD) atau ~5,6 (IDR). Hanya field amountNTD yang diubah.
//
//   npx tsx scripts/fix-cashflow-amountntd-units.ts            (dry-run)
//   npx tsx scripts/fix-cashflow-amountntd-units.ts --apply    (menulis)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const cf = await db.collection('cashFlow').get();
  const plan = cf.docs.filter((d) => {
    const c = d.data();
    return typeof c.amountNTD === 'number' && c.amountNTD > 0 && (c.amount || 0) / c.amountNTD > 50;
  }).map((d) => {
    const c = d.data();
    return { ref: d.ref, id: d.id, before: c.amountNTD, after: c.ledger === 'NTD' ? c.amount : Math.round(c.amountNTD * 100), label: `${c.ledger} ${c.direction} ${c.category} amount=${c.amount} "${String(c.description || c.notes || '').slice(0, 50)}"` };
  });
  const cats: Record<string, number> = {};
  plan.forEach((p) => { const k = p.label.split(' ')[2]; cats[k] = (cats[k] || 0) + 1; });
  plan.slice(0, 10).forEach((p) => console.log(`  ${p.id} ${p.before} -> ${p.after} | ${p.label}`));
  console.log(`\n${plan.length} dokumen dari ${cf.size}; per kategori:`, cats);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }
  const backupPath = `scripts/backup-cashflow-amountntd-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(plan.map((p) => ({ id: p.id, amountNTD: p.before })), null, 2));
  for (let i = 0; i < plan.length; i += 400) { const b = db.batch(); plan.slice(i, i + 400).forEach((p) => b.update(p.ref, { amountNTD: p.after })); await b.commit(); }
  console.log(`Backup: ${backupPath}\nSelesai.`);
  process.exit(0);
})();
