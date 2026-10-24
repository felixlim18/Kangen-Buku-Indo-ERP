// Sambungkan ulang dokumen Iklan (adsPurchases), Prive, dan Setoran Modal ke jurnal aslinya.
//
// Sebagian dokumen menyimpan journalId format lama (JU-AD-<adId> / JU-PRIVE-<id>) yang
// dokumennya sudah tidak ada - jurnal aslinya hidup dengan nomor JU... dan refId = id dokumen.
// Akibatnya hapus/edit dari aplikasi tidak menemukan jurnalnya (hapus -> beban/prive tetap
// di GL; edit iklan -> gagal; edit prive -> jurnal kedua). Kode aplikasi sekarang mencari via
// refId, tapi skrip ini merapikan datanya juga.
//
// Yang diubah HANYA field journalId di dokumen sumber. Jurnal tidak disentuh, jadi saldo GL
// tidak bergeser. Dokumen hanya diperbaiki kalau tepat SATU jurnal punya refId = id dokumen
// dan nilainya sama dengan amountNTD dokumen; selain itu dilaporkan untuk dicek manual.
//
// Jalankan:
//   npx tsx scripts/fix-stale-journal-links.ts            (dry-run, tanpa menulis)
//   npx tsx scripts/fix-stale-journal-links.ts --apply     (benar-benar menulis + backup)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');
const COLLECTIONS = ['adsPurchases', 'prive', 'setoranModal'];

const fmt = (cents: number) => `NT$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const journalDebit = (j: any) => (j.lines || []).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  const journals = await db.collection('journalEntries').get();
  const journalIds = new Set(journals.docs.map((d) => d.id));
  const byRef = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const j of journals.docs) {
    const v = j.data();
    for (const key of [v.refId, v.sourceId]) {
      if (!key) continue;
      const list = byRef.get(key) || [];
      if (!list.includes(j)) list.push(j);
      byRef.set(key, list);
    }
  }

  const fixes: { col: string; id: string; label: string; from: string; to: string; amount: number }[] = [];
  const manual: string[] = [];
  let okCount = 0;

  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    for (const d of snap.docs) {
      const x = d.data();
      const label = x.docNo || x.description || d.id;
      if (x.journalId && journalIds.has(x.journalId)) { okCount++; continue; }

      const candidates = byRef.get(d.id) || [];
      if (candidates.length !== 1) {
        manual.push(`${col}/${d.id} (${label}) journalId=${x.journalId} -> ${candidates.length} jurnal dengan refId ini`);
        continue;
      }
      const j = candidates[0];
      const amt = journalDebit(j.data());
      if (Math.round(amt) !== Math.round(Number(x.amountNTD) || 0)) {
        manual.push(`${col}/${d.id} (${label}) jurnal ${j.id} ${fmt(amt)} != dokumen ${fmt(Number(x.amountNTD) || 0)}`);
        continue;
      }
      fixes.push({ col, id: d.id, label, from: x.journalId, to: j.id, amount: amt });
    }
  }

  console.log(`Dokumen dengan journalId valid: ${okCount}`);
  console.log(`Akan disambungkan ulang: ${fixes.length}`);
  for (const f of fixes) {
    console.log(`  ${f.col}/${f.id}  ${f.label}  ${f.from} -> ${f.to}  (${fmt(f.amount)})`);
  }
  if (manual.length) {
    console.log(`\nPerlu dicek manual (TIDAK diubah): ${manual.length}`);
    manual.forEach((m) => console.log('  ' + m));
  }

  if (!APPLY) {
    console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.');
    return;
  }
  if (!fixes.length) { console.log('\nTidak ada yang perlu ditulis.'); return; }

  const backupPath = `scripts/backup-stale-journal-links-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(fixes, null, 2));
  const batch = db.batch();
  for (const f of fixes) batch.update(db.collection(f.col).doc(f.id), { journalId: f.to });
  await batch.commit();
  console.log(`\nSelesai: ${fixes.length} dokumen diperbarui. Backup: ${backupPath}`);
})();
