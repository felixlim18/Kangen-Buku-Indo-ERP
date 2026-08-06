// Konsolidasi akun anak "2100-XXX" (dibuat oleh bug lama: setiap kreditur baru di fitur
// Pinjaman membuat akun COA baru) kembali ke akun induk generik "2100 Utang Usaha".
// Kode yang membuat akun anak baru sudah dihapus dari PiutangUtangTab.tsx - script ini
// hanya membereskan data historis yang sudah terlanjur ada.
//
// Langkah: scan semua journalEntries yang line-nya refer ke salah satu akun anak,
// pindahkan ke accountCode='2100'/account='Utang Usaha', lalu (setelah verifikasi tidak
// ada sisa referensi) hapus dokumen akun anak dari collection coa.
//
// Usage:
//   node fix_migrate_2100_children.cjs            (dry-run, no writes)
//   node fix_migrate_2100_children.cjs --apply     (actually writes)

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json');
const app = initializeApp({ credential: cert(serviceAccount), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');
const TARGET_CODE = '2100';
const TARGET_NAME = 'Utang Usaha';

async function main() {
  console.log(APPLY ? '*** MODE: APPLY ***' : '*** MODE: DRY-RUN ***');

  const [coaSnap, journalSnap] = await Promise.all([
    db.collection('coa').get(),
    db.collection('journalEntries').get(),
  ]);

  const childAccounts = coaSnap.docs.filter(d => d.id.startsWith('2100-'));
  console.log(`\nAkun anak 2100-* ditemukan: ${childAccounts.length}`);
  childAccounts.forEach(d => console.log(`  ${d.id} -> "${d.data().name}"`));

  if (childAccounts.length === 0) {
    console.log('Tidak ada akun anak ditemukan, tidak ada yang perlu dimigrasi.');
    return;
  }

  const childCodes = new Set(childAccounts.map(d => d.id));
  const childNames = new Set(childAccounts.map(d => d.data().name));

  const journalUpdates = [];
  journalSnap.docs.forEach(jDoc => {
    const data = jDoc.data();
    const lines = data.lines || [];
    let touched = false;
    const newLines = lines.map(l => {
      const codeMatch = childCodes.has((l.accountCode || '').trim());
      const nameMatch = childNames.has(l.account);
      if (codeMatch || nameMatch) {
        touched = true;
        return { ...l, accountCode: TARGET_CODE, account: TARGET_NAME };
      }
      return l;
    });
    if (touched) {
      journalUpdates.push({ ref: jDoc.ref, id: jDoc.id, newLines, oldDesc: data.description });
    }
  });

  console.log(`\nJurnal yang akan diupdate: ${journalUpdates.length}`);
  journalUpdates.forEach(u => console.log(`  ${u.id} (${u.oldDesc || ''})`));

  if (!APPLY) {
    console.log('\nDry-run selesai. Tidak ada perubahan ditulis. Jalankan ulang dengan --apply untuk benar-benar menulis.');
    return;
  }

  const CHUNK = 400;
  for (let i = 0; i < journalUpdates.length; i += CHUNK) {
    const chunk = journalUpdates.slice(i, i + CHUNK);
    const batch = db.batch();
    chunk.forEach(u => batch.update(u.ref, { lines: u.newLines }));
    await batch.commit();
    console.log(`  ...${Math.min(i + CHUNK, journalUpdates.length)}/${journalUpdates.length} jurnal terupdate`);
  }

  // Verifikasi ulang tidak ada sisa referensi sebelum hapus akun anak
  const verifySnap = await db.collection('journalEntries').get();
  let remaining = 0;
  verifySnap.docs.forEach(d => {
    (d.data().lines || []).forEach(l => {
      if (childCodes.has((l.accountCode || '').trim())) remaining++;
    });
  });
  if (remaining > 0) {
    console.error(`SAFETY ABORT: masih ada ${remaining} baris jurnal yang refer akun anak. Akun TIDAK dihapus, cek manual dulu.`);
    return;
  }

  const deleteBatch = db.batch();
  childAccounts.forEach(d => deleteBatch.delete(d.ref));
  await deleteBatch.commit();
  console.log(`\nSelesai. ${journalUpdates.length} jurnal dikonsolidasi ke akun 2100, ${childAccounts.length} akun anak dihapus.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
