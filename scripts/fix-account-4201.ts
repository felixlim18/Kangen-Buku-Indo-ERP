// Akun 4201 tidak ada di COA (selisih kurs = 4210 "Laba/Rugi Selisih Kurs"). Satu-satunya jurnal yang
// memakainya: ADJ-INV-2026-08 (penyesuaian persediaan Agustus, K 4201 NT$1.925,65). Baris itu dipindah ke
// 4210, nominal tidak berubah (24/10/2026). Berhenti kalau ada jurnal lain yang memakai 4201.
//
//   npx tsx scripts/fix-account-4201.ts            (dry-run)
//   npx tsx scripts/fix-account-4201.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const js = (await db.collection('journalEntries').get()).docs.filter((d) => (d.data().lines || []).some((l: any) => l.accountCode === '4201'));
  if (js.length !== 1 || js[0].id !== 'ADJ-INV-2026-08') {
    console.log(`BERHENTI: jurnal dengan 4201 = ${js.map((d) => d.id).join(', ') || '-'}`);
    process.exit(1);
  }
  const j = js[0].data();
  const after = j.lines.map((l: any) => (l.accountCode === '4201' ? { ...l, accountCode: '4210', account: 'Laba/Rugi Selisih Kurs' } : l));
  console.log(`${js[0].id}: ` + after.map((l: any) => `${l.accountCode} ${l.account} D${l.debit / 100} K${l.credit / 100}`).join(' | '));
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }
  const backupPath = `scripts/backup-account-4201-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ id: js[0].id, lines: j.lines }, null, 2));
  await js[0].ref.update({ lines: after });
  console.log(`Backup: ${backupPath}\nSelesai.`);
  process.exit(0);
})();
