// GATE 2 - syarat sebelum sebuah koleksi boleh masuk BOUNDS di src/lib/query-bounds.ts
//
// Filter inequality Firestore DIAM-DIAM membuang dokumen yang field-nya tidak ada
// atau berbeda tipe. Kalau itu terjadi pada inventoryLedger/journalEntries, angka
// stok dan valuasi akan salah tanpa satu pun pesan error. Jadi sebuah field hanya
// boleh dibatasi kalau ketiga syarat ini bersih:
//   1. tidak ada dokumen yang field-nya hilang
//   2. semua nilainya bertipe Timestamp
//   3. count(field >= DATA_EPOCH) === jumlah seluruh dokumen
//
// Read-only. Jalankan: npx tsx scripts/verify-date-bounds.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { DATA_EPOCH } from '../src/lib/query-bounds';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const CANDIDATES: Array<[string, string]> = [
  ['inventoryLedger', 'timestamp'],
  ['journalEntries', 'date'],
  ['salesOrders', 'orderDate'],
  ['purchaseOrders', 'orderDate'],
];

const typeOf = (v: any): string => {
  if (v === undefined) return 'HILANG';
  if (v === null) return 'null';
  if (v instanceof Timestamp) return 'Timestamp';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'number';
  if (v && typeof v.seconds === 'number') return '{seconds}';
  return typeof v;
};

(async () => {
  console.log(`DATA_EPOCH = ${DATA_EPOCH.toISOString()}\n`);
  const verdicts: Array<[string, boolean, string]> = [];

  for (const [col, field] of CANDIDATES) {
    const snap = await db.collection(col).get();
    const total = snap.size;

    const byType = new Map<string, number>();
    let missing = 0;
    let beforeEpoch = 0;
    for (const d of snap.docs) {
      const v = d.get(field);
      const t = typeOf(v);
      byType.set(t, (byType.get(t) || 0) + 1);
      if (t === 'HILANG' || t === 'null') { missing++; continue; }
      const ms = v instanceof Timestamp ? v.toMillis()
        : (typeof v?.seconds === 'number' ? v.seconds * 1000 : Date.parse(String(v)));
      if (!isNaN(ms) && ms < DATA_EPOCH.getTime()) beforeEpoch++;
    }

    // Yang sesungguhnya akan dikembalikan Firestore kalau bound dipasang:
    let matched = -1;
    try {
      const c = await db.collection(col).where(field, '>=', DATA_EPOCH).count().get();
      matched = c.data().count;
    } catch (e: any) {
      matched = -1;
      byType.set('QUERY_ERROR: ' + String(e.message).slice(0, 60), 1);
    }

    const clean = missing === 0 && byType.size === 1 && byType.has('Timestamp') && matched === total;
    const dropped = matched >= 0 ? total - matched : total;

    console.log(`${col}.${field}`);
    console.log(`  total dokumen         : ${total}`);
    console.log(`  tipe nilainya         : ${[...byType.entries()].map(([t, n]) => `${t}=${n}`).join(', ')}`);
    console.log(`  field hilang/null     : ${missing}`);
    console.log(`  lebih tua dari epoch  : ${beforeEpoch}`);
    console.log(`  lolos filter >= epoch : ${matched < 0 ? 'QUERY GAGAL' : matched}`);
    console.log(`  AKAN TERBUANG DIAM²   : ${dropped}${dropped > 0 ? '  <-- BAHAYA' : ''}`);
    console.log(`  VERDIK                : ${clean ? 'BERSIH - boleh dibatasi' : 'TIDAK BERSIH - jangan dibatasi'}\n`);

    verdicts.push([`${col}.${field}`, clean, clean ? 'boleh' : `${dropped} dokumen akan hilang diam-diam`]);
  }

  console.log('RINGKASAN');
  verdicts.forEach(([n, ok, note]) => console.log(`  ${ok ? 'BOLEH ' : 'TOLAK '} ${n.padEnd(28)} ${note}`));

  const anyClean = verdicts.some(([, ok]) => ok);
  console.log(anyClean
    ? '\nMasukkan HANYA yang berverdik BOLEH ke BOUNDS di src/lib/query-bounds.ts.'
    : '\nTidak ada koleksi yang aman dibatasi. BOUNDS tetap kosong - itu keputusan yang benar.');
  process.exit(0);
})();
