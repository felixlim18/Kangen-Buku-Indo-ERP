// Merapikan jurnal kecil sisa audit (24/10/2026):
//   1. JU2608180010 (PO #PO26081002 Penerimaan Barang) hanya punya satu baris D 1201 -0,39 -> tidak
//      seimbang. Diganti menjadi D 4210 0,39 / K 1201 0,39 (efek ke persediaan sama, neraca saldo seimbang).
//   2. Jurnal dengan ID di luar format JU+YYMMDD+NNNN diberi nomor JU baru sesuai tanggalnya:
//      - 3 jurnal Beban Lain-lain (ID acak Firestore, tanggal tersimpan sebagai string) -> tanggal jadi
//        Timestamp, bebanLainnya.journalId ikut diperbarui
//      - ADJ-INV-2026-08 (refId tetap ADJ-INV-2026-08)
// Berhenti tanpa menulis kalau keadaan data tidak seperti di atas.
//
//   npx tsx scripts/fix-minor-journals.ts            (dry-run)
//   npx tsx scripts/fix-minor-journals.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const UNBALANCED = 'JU2608180010';
const EXPECTED_RENAMES = 4;
const toDate = (v: any): Date => (v?.toDate ? v.toDate() : new Date(v));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const problems: string[] = [];

  const ub = await db.collection('journalEntries').doc(UNBALANCED).get();
  const ubl = ub.data()?.lines || [];
  if (ubl.length !== 1 || ubl[0].accountCode !== '1201' || ubl[0].debit !== -39 || ubl[0].credit) problems.push(`${UNBALANCED} tidak sesuai harapan`);
  const fixedLines = [
    { account: 'Laba/Rugi Selisih Kurs', accountCode: '4210', debit: 39, credit: 0 },
    { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: 39 },
  ];

  const js = (await db.collection('journalEntries').get()).docs.filter((d) => !/^JU\d{10}$/.test(d.id));
  const beban = (await db.collection('bebanLainnya').get()).docs;
  const renames = js.map((d) => {
    const j = d.data();
    const date = toDate(j.date);
    if (isNaN(date.getTime())) problems.push(`${d.id}: tanggal tidak valid`);
    const refs = beban.filter((b) => b.data().journalId === d.id);
    if (j.refType === 'beban_lainnya' && refs.length !== 1) problems.push(`${d.id}: dirujuk ${refs.length} catatan bebanLainnya`);
    return { doc: d, data: j, date, refs };
  });
  if (renames.length !== EXPECTED_RENAMES) problems.push(`Jurnal format salah: ${renames.length}, diharapkan ${EXPECTED_RENAMES}`);
  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  console.log(`1. ${UNBALANCED}: D 1201 -0,39 -> D 4210 0,39 / K 1201 0,39`);
  console.log('2. Ganti nomor:');
  renames.forEach((r) => console.log(`   ${r.doc.id} (${ymd(r.date)}, ${r.data.refType}${typeof r.data.date === 'string' ? ', tanggal string -> Timestamp' : ''}${r.refs.length ? `, bebanLainnya/${r.refs[0].id}` : ''}) -> JU${ymd(r.date).slice(2).replace(/-/g, '')}xxxx`));
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-minor-journals-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ unbalanced: { id: UNBALANCED, lines: ubl }, renamed: renames.map((r) => ({ id: r.doc.id, ...r.data })) }, null, 2));

  const batch = db.batch();
  batch.update(ub.ref, { lines: fixedLines });
  for (const r of renames) {
    const yymmdd = ymd(r.date).slice(2).replace(/-/g, '');
    const counter = db.collection('counters').doc(`JURNAL_${yymmdd}`);
    const seq = await db.runTransaction(async (t) => {
      const s = await t.get(counter);
      const v = (s.exists ? s.data()!.value : 0) + 1;
      t.set(counter, { value: v }, { merge: true });
      return v;
    });
    const newId = `JU${yymmdd}${String(seq).padStart(4, '0')}`;
    const date = typeof r.data.date === 'string' ? Timestamp.fromDate(new Date(r.data.date)) : r.data.date;
    batch.set(db.collection('journalEntries').doc(newId), { ...r.data, id: newId, date });
    batch.delete(r.doc.ref);
    r.refs.forEach((b) => batch.update(b.ref, { journalId: newId }));
    console.log(`   ${r.doc.id} -> ${newId}`);
  }
  await batch.commit();
  console.log(`Backup: ${backupPath}\nSelesai.`);
  process.exit(0);
})();
