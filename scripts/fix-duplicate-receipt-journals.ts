// Membereskan jurnal penerimaan barang ganda (1201 Inventory On Hand / 1203
// Inventory in Transit) akibat bug klik ganda di jalur scan -> "Terima" /
// "Terima Semua" (saveBulkScannedPoCore di PurchasesTab.tsx, sudah diperbaiki).
//
// Ledger inventoryLedger yang ganda sudah ditandai reversed pada 28/09/2026.
// Skrip ini menangani sisi jurnalnya, dengan daftar yang sudah disetujui owner:
//   - 6 jurnal kembar dihapus (jurnal pertama tiap PO dipertahankan)
//   - 2 jurnal backfill Agustus (dari fix-missing-receipt-journals.ts) nominalnya
//     dobel karena ikut menghitung ledger ganda -> dikoreksi ke setengahnya
//
// Sebelum menulis: setiap jurnal divalidasi (harus 2 baris, D 1201 / K 1203
// dengan nominal persis seperti di bawah). Satu saja tidak cocok -> berhenti,
// tidak ada yang ditulis. Isi asli semua jurnal disimpan ke file backup JSON.
//
// Jalankan:
//   npx tsx scripts/fix-duplicate-receipt-journals.ts            (dry-run)
//   npx tsx scripts/fix-duplicate-receipt-journals.ts --apply     (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');

// Jurnal kembar -> dihapus. Nilai = nominal (sen NTD) yang wajib cocok.
const DELETE: Record<string, { po: string; amount: number; keep: string }> = {
  JU2609180094: { po: 'PO26090510', amount: 21025, keep: 'JU2609180093' },
  JU2609180095: { po: 'PO26090510', amount: 21025, keep: 'JU2609180093' },
  JU2609180096: { po: 'PO26090510', amount: 21025, keep: 'JU2609180093' },
  JU2609180100: { po: 'PO26090505', amount: 9967, keep: 'JU2609180097' },
  JU2609180099: { po: 'PO26090502', amount: 49271, keep: 'JU2609180098' },
  JU2609180104: { po: 'PO26090805', amount: 13617, keep: 'JU2609180101' },
};

// Jurnal dengan nominal dobel -> dikoreksi.
const FIX: Record<string, { po: string; from: number; to: number }> = {
  JU2608070063: { po: 'PO26073106', from: 55546, to: 27773 },
  JU2608070073: { po: 'PO26072905', from: 10640, to: 5320 },
};

const fmt = (cents: number) => `NT$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const isReceiptPair = (j: any, amount: number) =>
  Array.isArray(j?.lines) && j.lines.length === 2 &&
  j.lines.some((l: any) => l.accountCode === '1201' && l.debit === amount && !l.credit) &&
  j.lines.some((l: any) => l.accountCode === '1203' && l.credit === amount && !l.debit);

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');

  // Periode tertutup: jurnal di periode itu tidak boleh diubah.
  const [pc, cp] = await Promise.all([db.collection('periodClosings').get(), db.collection('closedPeriods').get()]);
  const closed = new Set<string>([
    ...cp.docs.map((d) => d.id),
    ...pc.docs.map((d) => String(d.data().period || d.data().periodId || d.data().yearMonth || d.id)),
  ]);

  const backup: Record<string, any> = {};
  const errors: string[] = [];
  const periodOf = (j: any) => {
    const v = j.date;
    const d = v?.toDate ? v.toDate() : new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const toDelete: string[] = [];
  let deletedAlready = 0;
  for (const [id, x] of Object.entries(DELETE)) {
    const snap = await db.doc(`journalEntries/${id}`).get();
    const j = snap.data();
    const keep = await db.doc(`journalEntries/${x.keep}`).get();
    if (!keep.exists || !isReceiptPair(keep.data(), x.amount)) errors.push(`${id}: jurnal asli ${x.keep} tidak ada/tidak cocok`);
    if (!snap.exists) {
      // Sudah dihapus manual (mis. lewat tab Akun Jurnal) - tidak perlu apa-apa.
      deletedAlready += x.amount;
      console.log(`SUDAH TERHAPUS  ${id}  ${x.po}  ${fmt(x.amount)}  (asli: ${x.keep})`);
      continue;
    }
    if (!isReceiptPair(j, x.amount)) errors.push(`${id}: isi tidak cocok (harapan D1201/K1203 ${x.amount})`);
    if (closed.has(periodOf(j))) errors.push(`${id}: periode ${periodOf(j)} sudah ditutup`);
    backup[id] = j;
    toDelete.push(id);
    console.log(`HAPUS  ${id}  ${x.po}  ${fmt(x.amount)}  (dipertahankan: ${x.keep})`);
  }

  for (const [id, x] of Object.entries(FIX)) {
    const snap = await db.doc(`journalEntries/${id}`).get();
    const j = snap.data();
    if (!snap.exists) { errors.push(`${id}: tidak ditemukan`); continue; }
    if (!isReceiptPair(j, x.from)) errors.push(`${id}: nominal sekarang bukan ${x.from} (mungkin sudah dikoreksi)`);
    if (closed.has(periodOf(j))) errors.push(`${id}: periode ${periodOf(j)} sudah ditutup`);
    backup[id] = j;
    console.log(`KOREKSI ${id}  ${x.po}  ${fmt(x.from)} -> ${fmt(x.to)}`);
  }

  const totalDeleted = toDelete.reduce((a, id) => a + DELETE[id].amount, 0);
  const totalFixed = Object.values(FIX).reduce((a, x) => a + (x.from - x.to), 0);
  if (deletedAlready) console.log(`\nSudah beres sebelumnya (hapus manual): ${fmt(deletedAlready)}`);
  console.log(`Skrip ini: saldo 1201 turun / 1203 naik sebesar ${fmt(totalDeleted + totalFixed)}`);

  if (errors.length) {
    console.log('\nVALIDASI GAGAL - tidak ada yang ditulis:');
    errors.forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nValidasi OK. Jalankan ulang dengan --apply untuk menerapkan.');
    return;
  }

  const backupPath = `scripts/backup-duplicate-receipt-journals-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup isi asli: ${backupPath}`);

  const batch = db.batch();
  for (const id of toDelete) batch.delete(db.doc(`journalEntries/${id}`));
  for (const [id, x] of Object.entries(FIX)) {
    const lines = (backup[id].lines as any[]).map((l) =>
      l.accountCode === '1201' ? { ...l, debit: x.to } : { ...l, credit: x.to }
    );
    batch.update(db.doc(`journalEntries/${id}`), {
      lines,
      correctionNote: `Nominal dikoreksi ${x.from} -> ${x.to}: sebelumnya ikut menghitung ledger penerimaan ganda (scripts/fix-duplicate-receipt-journals.ts)`,
      correctedAt: Timestamp.now(),
    });
  }
  await batch.commit();
  console.log(`Selesai: ${toDelete.length} jurnal dihapus, ${Object.keys(FIX).length} jurnal dikoreksi.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
