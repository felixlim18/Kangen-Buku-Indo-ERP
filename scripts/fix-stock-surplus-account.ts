// Reklasifikasi jurnal "Barang Lebih" (stock opname) dari 5500 Beban Lain-lain ke 4104 Pendapatan Lain-lain
// (24/10/2026). Jurnal barang lebih mendebit 1201 dan dulu mengkredit 5500, sehingga beban bersaldo negatif,
// padahal deskripsinya "Pendapatan Lain-lain - Barang Lebih". Nominal tidak berubah.
//
// Target: jurnal yang refId-nya catatan damagedStock "Barang Lebih" (ledger stock_surplus), baris K 5500.
// Berhenti tanpa menulis kalau pola jurnal tidak sesuai atau periodenya ditutup.
//
//   npx tsx scripts/fix-stock-surplus-account.ts            (dry-run)
//   npx tsx scripts/fix-stock-surplus-account.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const n = (c: number) => `NT$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const [led, js, pc] = await Promise.all([db.collection('inventoryLedger').get(), db.collection('journalEntries').get(), db.collection('periodClosings').get()]);
  const closed = new Set(pc.docs.filter((d) => d.data().status === 'Ditutup').map((d) => d.id));
  const surplusRefs = new Set(led.docs.filter((d) => d.data().type === 'stock_surplus' && d.data().reversed !== true).map((d) => d.data().refId));

  const problems: string[] = [];
  const targets: { ref: FirebaseFirestore.DocumentReference; id: string; before: any[]; after: any[]; amount: number; desc: string }[] = [];
  for (const d of js.docs) {
    const j = d.data();
    if (!surplusRefs.has(j.refId)) continue;
    const lines = j.lines || [];
    const inv = lines.find((l: any) => l.accountCode === '1201');
    const exp = lines.find((l: any) => l.accountCode === '5500');
    if (lines.length !== 2 || !inv || !exp || inv.credit || exp.debit || Math.abs((inv.debit || 0) - (exp.credit || 0)) > 0.001) {
      problems.push(`${d.id}: pola bukan D 1201 / K 5500`); continue;
    }
    const ym = j.date?.toDate?.().toISOString().slice(0, 7);
    if (ym && closed.has(ym)) problems.push(`${d.id}: periode ${ym} ditutup`);
    targets.push({
      ref: d.ref, id: d.id, before: lines, amount: exp.credit || 0, desc: String(j.description).replace(/\s+/g, ' ').slice(0, 70),
      after: lines.map((l: any) => (l.accountCode === '5500' ? { ...l, accountCode: '4104', account: 'Pendapatan Lain-lain' } : l)),
    });
  }
  if (surplusRefs.size !== targets.length + problems.length) problems.push(`Catatan barang lebih ${surplusRefs.size}, jurnal ditemukan ${targets.length}`);
  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  targets.sort((a, b) => a.id.localeCompare(b.id)).forEach((t) => console.log(`  ${t.id} ${n(t.amount).padStart(12)}  ${t.desc}`));
  const total = targets.reduce((a, t) => a + t.amount, 0);
  console.log(`\n${targets.length} jurnal, K 5500 -> K 4104: ${n(total)}`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-stock-surplus-account-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(targets.map((t) => ({ id: t.id, lines: t.before })), null, 2));
  const batch = db.batch();
  targets.forEach((t) => batch.update(t.ref, { lines: t.after }));
  await batch.commit();
  console.log(`Backup: ${backupPath}\nSelesai: ${targets.length} jurnal dipindah ke 4104.`);
  process.exit(0);
})();
