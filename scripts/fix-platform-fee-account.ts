// Reklasifikasi Biaya Platform dari 5320 ke 5330 (24/10/2026).
//
// Di COA, 5320 = "Beban Komisi Penjualan" (komisi partner) dan 5330 = "Beban Biaya Platform". Kode SO
// mencatat fee platform ke 5320, dan ensureAutoAccountExists menempelkan systemKey 'beban_platform' ke 5320.
// Semua baris 5320 di jurnal sales_order_completed adalah fee platform (belum ada komisi partner).
//
//   - Baris 5320 di jurnal sales_order_completed -> accountCode 5330, account "Beban Biaya Platform"
//     (nominal tidak berubah; diubah di jurnal aslinya supaya revert/batal SO tetap menghapus semuanya)
//   - systemKey 'beban_platform' dipindah dari COA 5320 ke COA 5330
// Berhenti tanpa menulis kalau ada baris 5320 di luar sales_order_completed atau periode tertutup.
//
//   npx tsx scripts/fix-platform-fee-account.ts            (dry-run)
//   npx tsx scripts/fix-platform-fee-account.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const n = (c: number) => `NT$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const problems: string[] = [];
  const [pc, coa, js] = await Promise.all([db.collection('periodClosings').get(), db.collection('coa').get(), db.collection('journalEntries').get()]);
  const closed = new Set(pc.docs.filter((d) => d.data().status === 'Ditutup').map((d) => d.id));

  const c5320 = coa.docs.filter((d) => d.data().code === '5320');
  const c5330 = coa.docs.filter((d) => d.data().code === '5330');
  if (c5320.length !== 1 || c5330.length !== 1) problems.push(`COA 5320: ${c5320.length}, 5330: ${c5330.length} (harus 1 & 1)`);
  if (c5330[0]?.data().name !== 'Beban Biaya Platform') problems.push(`COA 5330 bernama "${c5330[0]?.data().name}"`);

  const targets: { ref: FirebaseFirestore.DocumentReference; id: string; before: any[]; after: any[] }[] = [];
  let lines = 0, sum = 0;
  for (const d of js.docs) {
    const j = d.data();
    if (!(j.lines || []).some((l: any) => l.accountCode === '5320')) continue;
    if (j.refType !== 'sales_order_completed') { problems.push(`${d.id}: baris 5320 di refType ${j.refType}`); continue; }
    const ym = j.date?.toDate?.().toISOString().slice(0, 7);
    if (ym && closed.has(ym)) problems.push(`${d.id}: periode ${ym} ditutup`);
    const after = j.lines.map((l: any) => {
      if (l.accountCode !== '5320') return l;
      lines++; sum += (l.debit || 0) - (l.credit || 0);
      return { ...l, accountCode: '5330', account: 'Beban Biaya Platform' };
    });
    targets.push({ ref: d.ref, id: d.id, before: j.lines, after });
  }
  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  console.log(`Jurnal diubah: ${targets.length}, baris 5320 -> 5330: ${lines}, saldo dipindah: ${n(sum)}`);
  console.log(`COA: systemKey beban_platform ${c5320[0].data().systemKey ? 'dipindah dari 5320' : '(5320 tanpa systemKey)'} ke 5330`);
  console.log('Contoh:', targets.slice(0, 3).map((t) => t.id).join(', '));
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-platform-fee-account-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ coa5320: c5320[0].data(), coa5330: c5330[0].data(), journals: targets.map((t) => ({ id: t.id, lines: t.before })) }, null, 2));
  console.log(`\nBackup: ${backupPath}`);
  const batch = db.batch();
  targets.forEach((t) => batch.update(t.ref, { lines: t.after }));
  batch.update(c5320[0].ref, { systemKey: FieldValue.delete() });
  batch.update(c5330[0].ref, { systemKey: 'beban_platform' });
  await batch.commit();
  console.log(`Selesai: ${lines} baris dipindah ke 5330, systemKey dipindah.`);
  process.exit(0);
})();
