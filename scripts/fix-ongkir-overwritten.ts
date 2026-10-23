// Memulihkan catatan Ongkos Kirim otomatis yang tertimpa (24/10/2026).
//
// Sinkron otomatis di OngkosKirimTab mengecek "sudah ada" dari state `entries`; kalau data SO tiba sebelum
// daftar ongkir dimuat, setDoc menimpa catatan menjadi nominal 0 / Belum Dibayar / tanpa journalId. Pada
// 23/10/2026 semua catatan otomatis tertimpa, termasuk yang sudah dibayar (jurnalnya tetap ada).
// #S260728014 sudah pernah tertimpa sebelumnya, lalu dibayar lagi -> 2 jurnal (owner: dibayar sekali).
//
//   - Catatan ongkosKirim berstatus Belum Dibayar & nominal 0 yang punya jurnal ongkir (refId = id catatan):
//     dipulihkan dari jurnalnya (status Dibayar, nominal, tanggal/tanggalBayar, akun, journalId, docNo).
//   - ok_auto_GHk2I3aE4LpFPwvn16Cf (#S260728014): jurnal kedua JU2608100083 dihapus, dipulihkan dari JU2607280147.
// Berhenti tanpa menulis kalau ada catatan dengan >1 jurnal selain #S260728014 atau pola jurnal tidak sesuai.
//
//   npx tsx scripts/fix-ongkir-overwritten.ts            (dry-run)
//   npx tsx scripts/fix-ongkir-overwritten.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const DUP_ENTRY = 'ok_auto_GHk2I3aE4LpFPwvn16Cf';
const DUP_DROP = 'JU2608100083';
const EXPECTED = 11;
const ACCOUNT_LABEL: Record<string, string> = { '1101': '1101 - Cash: NTD', '1102': '1102 - Cash: Rupiah' };

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const ok = (await db.collection('ongkosKirim').get()).docs;
  const js = (await db.collection('journalEntries').where('refType', '==', 'Expenses').get()).docs
    .filter((d) => String(d.data().description).includes('Ongkos Kirim'));

  const problems: string[] = [];
  const plan: { ref: FirebaseFirestore.DocumentReference; id: string; before: any; data: any; label: string }[] = [];
  let drop: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  for (const e of ok) {
    const v = e.data();
    if (!(v.status === 'Belum Dibayar' && !(v.nominalNTDCents > 0) && !v.journalId)) continue;
    let jj = js.filter((j) => j.data().refId === e.id);
    if (!jj.length) continue;
    if (e.id === DUP_ENTRY) {
      drop = jj.find((j) => j.id === DUP_DROP) || null;
      if (jj.length !== 2 || !drop) { problems.push(`${e.id}: jurnal tidak seperti yang diharapkan`); continue; }
      jj = jj.filter((j) => j.id !== DUP_DROP);
    }
    if (jj.length !== 1) { problems.push(`${e.id}: ${jj.length} jurnal`); continue; }
    const j = jj[0].data();
    const deb = j.lines.find((l: any) => l.debit > 0);
    const cre = j.lines.find((l: any) => l.credit > 0);
    if (j.lines.length !== 2 || deb.accountCode !== '5230' || deb.debit !== cre.credit || !ACCOUNT_LABEL[cre.accountCode]) {
      problems.push(`${e.id}: pola jurnal ${jj[0].id} bukan D 5230 / K kas`); continue;
    }
    const tgl = j.date.toDate().toISOString().slice(0, 10);
    const docNo = String(j.description).match(/^(OK\w+)/)?.[1] || v.docNo;
    plan.push({
      ref: e.ref, id: e.id, before: v,
      label: `${v.ket} | ${jj[0].id} ${tgl} NT$${deb.debit / 100} ${docNo}`,
      data: {
        status: 'Dibayar', tanggal: tgl, tanggalBayar: tgl, akun: ACCOUNT_LABEL[cre.accountCode], accountCode: cre.accountCode,
        nominal: deb.debit / 100, nominalNTDCents: deb.debit, journalId: jj[0].id, docNo, isUserEdited: true,
      },
    });
  }
  if (plan.length !== EXPECTED) problems.push(`Catatan dipulihkan ${plan.length}, diharapkan ${EXPECTED}`);
  if (!drop) problems.push(`Jurnal kembar ${DUP_DROP} tidak ditemukan`);
  if (problems.length) { console.log('BERHENTI:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }

  plan.forEach((p) => console.log(`  ${p.id}: ${p.label}`));
  const total = plan.reduce((a, p) => a + p.data.nominalNTDCents, 0);
  console.log(`\n${plan.length} catatan dipulihkan (NT$${total / 100}); jurnal kembar ${DUP_DROP} (NT$${drop!.data().lines[0].debit / 100}) dihapus.`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  const backupPath = `scripts/backup-ongkir-overwritten-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ entries: plan.map((p) => ({ id: p.id, before: p.before })), droppedJournal: { id: drop!.id, ...drop!.data() } }, null, 2));
  const batch = db.batch();
  plan.forEach((p) => batch.update(p.ref, { ...p.data, updatedAt: Timestamp.now() }));
  batch.delete(drop!.ref);
  await batch.commit();
  console.log(`Backup: ${backupPath}\nSelesai.`);
  process.exit(0);
})();
