// Penomoran ulang No. Doc Freight-In yang dobel - disetujui owner 24/10/2026.
//
// Penyebab: daftar Freight In dulu tidak realtime, jadi nomor urut harian dihitung dari daftar basi dan
// setiap input tanpa refresh mendapat 01 lagi (diperbaiki di e92a248).
// Aturan: untuk setiap tanggal freight (createdAt) yang punya No. Doc dobel, semua freight tanggal itu
// dinomori ulang FIYYMMDD01..NN sesuai urutan input (createdAt jurnal pembayaran; cadangan: kode freight).
// Yang diubah: freightIn.docNo dan deskripsi jurnal pembayaran (No. Doc lama -> baru). Nominal tidak berubah.
// Backup JSON sebelum menulis.
//
//   npx tsx scripts/fix-freight-docno.ts          (dry-run)
//   npx tsx scripts/fix-freight-docno.ts --apply  (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');

// Tanggal di zona Taiwan (createdAt = jam 12:00 tanggal yang dipilih)
const yymmdd = (ts: any) => {
  const d = new Date(ts.toDate().getTime() + 8 * 3600 * 1000);
  return `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

(async () => {
  console.log(APPLY ? '*** APPLY ***\n' : '*** DRY-RUN (tidak menulis) ***\n');
  const freights = (await db.collection('freightIn').get()).docs;
  const journalIds = freights.map((d) => d.data().journalId).filter(Boolean);
  const journals: Record<string, FirebaseFirestore.DocumentSnapshot> = {};
  for (let i = 0; i < journalIds.length; i += 100) {
    const snaps = await db.getAll(...journalIds.slice(i, i + 100).map((id) => db.collection('journalEntries').doc(id)));
    snaps.forEach((s) => (journals[s.id] = s));
  }

  const byNo: Record<string, number> = {};
  freights.forEach((d) => (byNo[d.data().docNo] = (byNo[d.data().docNo] || 0) + 1));
  const badDates = new Set(freights.filter((d) => byNo[d.data().docNo] > 1).map((d) => yymmdd(d.data().createdAt)));

  const changes: any[] = [];
  const problems: string[] = [];
  for (const date of [...badDates].sort()) {
    const group = freights
      .filter((d) => yymmdd(d.data().createdAt) === date)
      .map((d) => {
        const j = journals[d.data().journalId];
        return { d, j, inputMs: j?.exists ? j.data()!.createdAt?.toMillis?.() ?? 0 : 0 };
      })
      .sort((a, b) => a.inputMs - b.inputMs || a.d.id.localeCompare(b.d.id));
    group.forEach(({ d, j }, i) => {
      const oldNo = d.data().docNo;
      const newNo = `FI${date}${String(i + 1).padStart(2, '0')}`;
      const desc: string | undefined = j?.exists ? j.data()!.description : undefined;
      if (!j?.exists) problems.push(`${d.id}: jurnal pembayaran ${d.data().journalId || '-'} tidak ada (hanya docNo freight yang diubah)`);
      else if (!desc?.startsWith(`${oldNo} `)) problems.push(`${d.id}: deskripsi jurnal ${j.id} tidak diawali ${oldNo}: "${desc}" (tidak diubah)`);
      const newDesc = desc?.startsWith(`${oldNo} `) ? newNo + desc.slice(oldNo.length) : undefined;
      changes.push({ freight: d.id, journalId: j?.exists ? j.id : null, oldNo, newNo, oldDesc: desc, newDesc, changed: oldNo !== newNo });
    });
  }

  for (const c of changes) console.log(`${c.changed ? '*' : ' '} ${c.freight.padEnd(12)} ${c.oldNo} -> ${c.newNo}  ${c.journalId || ''}${c.newDesc && c.changed ? `  "${c.newDesc}"` : ''}`);
  console.log(`\n${changes.filter((c) => c.changed).length} freight berubah No. Doc, ${badDates.size} tanggal.`);
  if (problems.length) console.log('\nCatatan:\n' + problems.map((p) => '- ' + p).join('\n'));

  // Hasil akhir tidak boleh dobel
  const after: Record<string, number> = {};
  freights.forEach((d) => {
    const c = changes.find((x) => x.freight === d.id);
    const no = c ? c.newNo : d.data().docNo;
    after[no] = (after[no] || 0) + 1;
  });
  const stillDup = Object.entries(after).filter(([, n]) => n > 1);
  if (stillDup.length) {
    console.log('BERHENTI: masih dobel setelah penomoran ulang:', stillDup);
    process.exit(1);
  }
  if (!APPLY) return;

  const backup = `scripts/backup-freight-docno-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(changes, null, 2));
  console.log('\nBackup:', backup);
  const batch = db.batch();
  for (const c of changes.filter((x) => x.changed)) {
    batch.update(db.collection('freightIn').doc(c.freight), { docNo: c.newNo });
    if (c.journalId && c.newDesc) batch.update(db.collection('journalEntries').doc(c.journalId), { description: c.newDesc });
  }
  await batch.commit();
  console.log('Selesai ditulis.');
})();
