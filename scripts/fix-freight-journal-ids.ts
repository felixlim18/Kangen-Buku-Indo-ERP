// Perbaiki nomor jurnal Freight-In yang formatnya salah.
//
// FreightInTab.tsx dulu punya generator nomor jurnal sendiri yang memakai
// padStart(2,'0'), menghasilkan ID pendek seperti JU26080701 alih-alih
// JU2608070001. Kodenya sudah diperbaiki (kini memakai getNextJournalId);
// skrip ini membereskan dokumen yang terlanjur dibuat dengan ID salah.
//
// ID dokumen ADALAH nomor jurnalnya, jadi "ganti nomor" berarti: tulis dokumen
// baru dengan ID benar, perbarui referensi yang menunjuk ke sana, lalu hapus
// dokumen lama - semuanya dalam satu batch supaya tidak ada keadaan setengah jadi.
//
// Nomor baru diambil dari penghitung counters/JURNAL_YYMMDD yang sama dengan
// yang dipakai aplikasi, sehingga tidak mungkin bertabrakan dengan jurnal
// yang sudah ada maupun yang akan dibuat aplikasi setelah ini.
//
// Isi jurnal (tanggal, baris, nilai) TIDAK diubah sama sekali - ini murni
// penomoran, jadi tidak menggeser angka rekonsiliasi mana pun.
//
// Jalankan:
//   npx tsx scripts/fix-freight-journal-ids.ts            (dry-run, tanpa menulis)
//   npx tsx scripts/fix-freight-journal-ids.ts --apply     (benar-benar menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');
const VALID_ID = /^JU\d{6}\d{4}$/;

/** Ambil nomor urut berikutnya dari penghitung harian, sama seperti getNextJournalId. */
async function nextJournalId(dateStr: string): Promise<string> {
  const counterRef = db.doc(`counters/JURNAL_${dateStr}`);
  let nextValue = 1;
  await db.runTransaction(async (t) => {
    const snap = await t.get(counterRef);
    if (snap.exists) nextValue = (snap.data()!.value || 0) + 1;
    t.set(counterRef, { value: nextValue }, { merge: true });
  });
  return `JU${dateStr}${String(nextValue).padStart(4, '0')}`;
}

/** Hitung nomor berikutnya TANPA menulis - untuk dry-run. */
async function peekNextJournalId(dateStr: string, offset: number): Promise<string> {
  const snap = await db.doc(`counters/JURNAL_${dateStr}`).get();
  const cur = snap.exists ? (snap.data()!.value || 0) : 0;
  return `JU${dateStr}${String(cur + offset).padStart(4, '0')}`;
}

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  const journalsSnap = await db.collection('journalEntries').get();
  const bad = journalsSnap.docs.filter((d) => !VALID_ID.test(d.id));

  console.log(`Total jurnal: ${journalsSnap.size}`);
  console.log(`Format salah: ${bad.length}\n`);
  if (bad.length === 0) {
    console.log('Tidak ada yang perlu diperbaiki.');
    return;
  }

  // Cari semua referensi ke ID lama, di seluruh koleksi selain journalEntries.
  const badIds = new Set(bad.map((d) => d.id));
  const refs: Array<{ path: string; field: string; oldId: string }> = [];
  for (const col of await db.listCollections()) {
    if (col.id === 'journalEntries') continue;
    const snap = await col.get();
    for (const d of snap.docs) {
      const data = d.data();
      for (const [field, val] of Object.entries(data)) {
        if (typeof val === 'string' && badIds.has(val)) {
          refs.push({ path: `${col.id}/${d.id}`, field, oldId: val });
        }
      }
    }
  }

  // Rencana penomoran ulang.
  const perDate = new Map<string, number>();
  const plan: Array<{ oldId: string; newId: string; desc: string; date: string }> = [];
  for (const d of bad) {
    // Nomor baru mengikuti TANGGAL JURNALNYA, bukan tanggal hari ini.
    const raw: any = d.data().date;
    const dt = raw?.toDate ? raw.toDate() : (typeof raw?.seconds === 'number' ? new Date(raw.seconds * 1000) : new Date(raw));
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const offset = (perDate.get(dateStr) || 0) + 1;
    perDate.set(dateStr, offset);
    const newId = APPLY ? await nextJournalId(dateStr) : await peekNextJournalId(dateStr, offset);
    plan.push({ oldId: d.id, newId, desc: String(d.data().description || '').slice(0, 46), date: dateStr });
  }

  console.log('RENCANA PENOMORAN ULANG');
  plan.forEach((p) => console.log(`  ${p.oldId.padEnd(13)} -> ${p.newId.padEnd(13)}  ${p.desc}`));

  console.log('\nREFERENSI YANG IKUT DIPERBARUI');
  if (refs.length === 0) console.log('  (tidak ada)');
  refs.forEach((r) => {
    const p = plan.find((x) => x.oldId === r.oldId)!;
    console.log(`  ${r.path.padEnd(28)} .${r.field} : ${r.oldId} -> ${p.newId}`);
  });

  if (!APPLY) {
    console.log('\nDry-run selesai. Tidak ada yang ditulis.');
    console.log('Jalankan ulang dengan --apply untuk menerapkan.');
    return;
  }

  const batch = db.batch();
  for (const p of plan) {
    const src = bad.find((d) => d.id === p.oldId)!;
    batch.set(db.doc(`journalEntries/${p.newId}`), src.data()); // isi identik
    batch.delete(db.doc(`journalEntries/${p.oldId}`));
  }
  for (const r of refs) {
    const p = plan.find((x) => x.oldId === r.oldId)!;
    batch.update(db.doc(r.path), new FieldPath(r.field), p.newId);
  }
  await batch.commit();

  // Verifikasi ulang dari database, bukan dari asumsi.
  const after = await db.collection('journalEntries').get();
  const stillBad = after.docs.filter((d) => !VALID_ID.test(d.id));
  let danglingRefs = 0;
  for (const col of await db.listCollections()) {
    if (col.id === 'journalEntries') continue;
    const snap = await col.get();
    for (const d of snap.docs) {
      for (const val of Object.values(d.data())) {
        if (typeof val === 'string' && badIds.has(val)) danglingRefs++;
      }
    }
  }

  console.log(`\nSelesai. ${plan.length} jurnal dinomori ulang, ${refs.length} referensi diperbarui.`);
  console.log(`Verifikasi: total jurnal ${after.size} (sebelumnya ${journalsSnap.size}), format salah tersisa ${stillBad.length}, referensi menggantung ${danglingRefs}.`);
  if (stillBad.length || danglingRefs || after.size !== journalsSnap.size) {
    console.log('PERINGATAN: hasil verifikasi tidak seperti yang diharapkan - periksa manual.');
    process.exit(1);
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
