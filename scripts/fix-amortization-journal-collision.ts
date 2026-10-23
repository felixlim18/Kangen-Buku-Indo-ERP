// Memulihkan jurnal amortisasi yang saling menimpa (disetujui owner 24/10/2026).
//
// Bug di AmortisasiTab: nomor jurnal dibuat dari `formTanggal + '-28'` (tanggal tidak valid), sehingga
// getNextJournalId jatuh ke ID cadangan tetap JU2606210001. Jurnal perolehan AM26100001 ("Claude",
// D 1400 / K 1101 NT$6.990) tersimpan di ID itu, lalu tertimpa jurnal amortisasi Oktober (D 5240 / K 1400
// NT$582,50) yang mendapat ID yang sama. Akibatnya Kas NTD kelebihan NT$6.990 dan 1400 bersaldo negatif.
//
// Perbaikan:
//   1. Buat ulang jurnal perolehan dengan nomor JU baru bertanggal perolehan (18/10/2026)
//   2. Pindahkan jurnal amortisasi Oktober dari JU2606210001 ke nomor JU bertanggal 28/10/2026
//   3. Perbarui acquisitionJournalId & postings[].journalId di dokumen amortisasi
// Divalidasi dulu; kalau keadaan data tidak persis seperti di atas -> berhenti tanpa menulis.
//
//   npx tsx scripts/fix-amortization-journal-collision.ts            (dry-run)
//   npx tsx scripts/fix-amortization-journal-collision.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const BAD_ID = 'JU2606210001';

const nextIds = async (yymmdd: string, count: number) => {
  const ref = db.collection('counters').doc(`JURNAL_${yymmdd}`);
  const start = await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    const cur = s.exists ? s.data()!.value : 0;
    t.set(ref, { value: cur + count }, { merge: true });
    return cur + 1;
  });
  return Array.from({ length: count }, (_, i) => `JU${yymmdd}${String(start + i).padStart(4, '0')}`);
};

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  const items = (await db.collection('amortizations').get()).docs;
  const victims = items.filter((d) => d.data().acquisitionJournalId === BAD_ID || (d.data().postings || []).some((p: any) => p.journalId === BAD_ID));
  const badJ = await db.collection('journalEntries').doc(BAD_ID).get();
  const problems: string[] = [];
  if (victims.length !== 1) problems.push(`Item amortisasi yang memakai ${BAD_ID}: ${victims.length} (harus 1)`);
  const item = victims[0];
  const v = item?.data();
  if (v && (v.docCode !== 'AM26100001' || v.nilaiPerolehanNTD !== 699000 || v.paidViaAccountCode !== '1101' || v.prepaidAccountCode !== '1400')) problems.push('Item AM26100001 tidak sesuai harapan');
  if (v && ((v.postings || []).length !== 1 || v.postings[0].period !== '2026-10' || v.postings[0].journalId !== BAD_ID)) problems.push('Posting item bukan hanya Oktober di ' + BAD_ID);
  const bj = badJ.data();
  if (!bj || bj.refType !== 'amortization_monthly' || bj.refId !== 'AM26100001_2026-10' || bj.lines?.length !== 2) problems.push(`${BAD_ID} bukan jurnal amortisasi Oktober AM26100001`);
  const acqExists = (await db.collection('journalEntries').where('refId', '==', 'AM26100001').get()).docs.filter((d) => d.data().refType === 'amortization_acquisition');
  if (acqExists.length) problems.push(`Jurnal perolehan AM26100001 sudah ada: ${acqExists.map((d) => d.id).join(',')}`);
  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  const acq = {
    date: Timestamp.fromDate(new Date(`${v.acquisitionDate}T12:00:00+08:00`)),
    description: `${v.docCode}\nBiaya Dibayar Dimuka - ${v.name}`,
    refType: 'amortization_acquisition',
    refId: v.docCode,
    lines: [
      { account: 'Biaya Dibayar Dimuka', accountCode: '1400', debit: v.nilaiPerolehanNTD, credit: 0 },
      { account: 'Cash: NTD', accountCode: '1101', debit: 0, credit: v.nilaiPerolehanNTD },
    ],
    createdAt: v.createdAt,
  };
  console.log(`Item ${v.docCode} "${v.name}" NT$${v.nilaiPerolehanNTD / 100}, ${v.usefulLifeMonths} bulan, perolehan ${v.acquisitionDate}`);
  console.log(`1. Buat jurnal perolehan (JU${v.acquisitionDate.slice(2).replace(/-/g, '')}xxxx): D 1400 NT$${v.nilaiPerolehanNTD / 100} / K 1101 NT$${v.nilaiPerolehanNTD / 100}`);
  console.log(`2. Pindahkan ${BAD_ID} (amortisasi Okt, ${bj!.lines.map((l: any) => `${l.accountCode} D${l.debit / 100} K${l.credit / 100}`).join(' | ')}) ke JU261028xxxx`);
  console.log(`3. Perbarui acquisitionJournalId & postings[0].journalId di amortizations/${item.id}`);

  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-amortization-collision-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ item: { id: item.id, ...v }, journal: { id: BAD_ID, ...bj } }, null, 2));
  console.log(`\nBackup: ${backupPath}`);

  const [acqId] = await nextIds(v.acquisitionDate.slice(2).replace(/-/g, ''), 1);
  const [monId] = await nextIds('261028', 1);
  const batch = db.batch();
  batch.set(db.collection('journalEntries').doc(acqId), { id: acqId, ...acq });
  batch.set(db.collection('journalEntries').doc(monId), { ...bj, id: monId });
  batch.delete(db.collection('journalEntries').doc(BAD_ID));
  batch.update(item.ref, { acquisitionJournalId: acqId, postings: v.postings.map((p: any) => (p.journalId === BAD_ID ? { ...p, journalId: monId } : p)) });
  await batch.commit();
  console.log(`Selesai: jurnal perolehan ${acqId}, amortisasi Oktober ${monId}, ${BAD_ID} dihapus.`);
  process.exit(0);
})();
