// Samakan nama akun di baris jurnal dengan nama di COA berdasarkan kode akunnya (25/10/2026), mis. "Cash:NTD"
// -> "Cash: NTD", "Cash Rupiah" -> "Cash: Rupiah", "COGS" -> "Harga Pokok Penjualan". Hanya field `account`
// yang berubah; kode akun & nominal tidak disentuh. Baris tanpa kode akun / kode di luar COA dilewati.
//
//   npx tsx scripts/fix-journal-account-names.ts            (dry-run)
//   npx tsx scripts/fix-journal-account-names.ts --apply    (menulis)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const coa = new Map((await db.collection('coa').get()).docs.map((d) => [String(d.data().code), String(d.data().name)]));
  const js = await db.collection('journalEntries').get();
  const plan: { ref: FirebaseFirestore.DocumentReference; id: string; before: any[]; after: any[] }[] = [];
  const counts: Record<string, number> = {};
  for (const d of js.docs) {
    const lines = d.data().lines || [];
    let changed = false;
    const after = lines.map((l: any) => {
      const name = coa.get(String(l.accountCode || ''));
      if (!name || l.account === name) return l;
      changed = true;
      const k = `${l.accountCode}: "${l.account}" -> "${name}"`;
      counts[k] = (counts[k] || 0) + 1;
      return { ...l, account: name };
    });
    if (changed) plan.push({ ref: d.ref, id: d.id, before: lines, after });
  }
  console.log(counts);
  console.log(`\n${plan.length} jurnal diperbarui (hanya nama akun).`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }
  const backupPath = `scripts/backup-journal-account-names-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(plan.map((p) => ({ id: p.id, lines: p.before })), null, 2));
  for (let i = 0; i < plan.length; i += 400) { const b = db.batch(); plan.slice(i, i + 400).forEach((p) => b.update(p.ref, { lines: p.after })); await b.commit(); }
  console.log(`Backup: ${backupPath}\nSelesai.`);
  process.exit(0);
})();
