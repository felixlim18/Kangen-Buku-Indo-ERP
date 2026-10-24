// Tautkan ulang perlengkapanPurchases yang journalId/journalIds-nya masih ID lama (JU-PL-<id>-buy) ke jurnal
// pembeliannya yang sekarang bernomor JU+tanggal (25/10/2026). Hanya field rujukan di dokumen pembelian yang
// diubah; jurnal tidak disentuh. Dipetakan kalau tepat satu jurnal "Pembelian - …" ber-refId = id pembelian
// dengan debit 1130 = nilai pembelian. Selain itu dilaporkan, tidak diubah.
//
//   npx tsx scripts/fix-perlengkapan-journal-links.ts            (dry-run)
//   npx tsx scripts/fix-perlengkapan-journal-links.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const [pS, jS] = await Promise.all([db.collection('perlengkapanPurchases').get(), db.collection('journalEntries').get()]);
  const ids = new Set(jS.docs.map((d) => d.id));
  const plan: { ref: FirebaseFirestore.DocumentReference; id: string; from: any; to: string }[] = [];
  const manual: string[] = [];
  for (const d of pS.docs) {
    const p = d.data();
    const refs: string[] = [p.journalId, ...(p.journalIds || [])].filter(Boolean);
    if (refs.length && refs.every((r) => ids.has(r))) continue;
    const cands = jS.docs.filter((j) => j.data().refId === d.id && /^Pembelian - /.test(String(j.data().description)));
    const total = Math.round((p.totalNTD || (p.qty || 0) * (p.pricePerUnitNTD || 0)) * 100);
    const ok = cands.filter((j) => Math.abs((j.data().lines.find((l: any) => l.accountCode === '1130')?.debit || 0) - total) <= 1);
    if (ok.length === 1) plan.push({ ref: d.ref, id: `${p.docNo} ${p.itemName}`, from: { journalId: p.journalId || null, journalIds: p.journalIds || [] }, to: ok[0].id });
    else manual.push(`${p.docNo} ${p.itemName}: ${ok.length} kandidat (${cands.map((j) => j.id).join(',') || '-'})`);
  }
  plan.forEach((x) => console.log(`  ${x.id}: ${x.from.journalId} -> ${x.to}`));
  if (manual.length) console.log('Perlu dicek manual:\n' + manual.map((m) => '  - ' + m).join('\n'));
  console.log(`\n${plan.length} dokumen ditautkan ulang.`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }
  if (manual.length) { console.log('BERHENTI: ada dokumen yang tidak bisa dipetakan otomatis.'); process.exit(1); }
  const backupPath = `scripts/backup-perlengkapan-journal-links-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(plan.map((x) => ({ path: x.ref.path, ...x.from })), null, 2));
  const batch = db.batch();
  plan.forEach((x) => batch.update(x.ref, { journalId: x.to, journalIds: [x.to] }));
  await batch.commit();
  console.log(`Backup: ${backupPath}\nSelesai.`);
  process.exit(0);
})();
