// Salin seluruh Firestore produksi ke file lokal (HANYA MEMBACA produksi) untuk diisi ke emulator.
//   npx tsx scripts/emulator/dump-prod.ts  -> .emulator/prod-dump.json
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, DocumentReference, GeoPoint } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const enc = (v: any): any => {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (v instanceof DocumentReference) return { __ref: v.path };
  if (v instanceof GeoPoint) return { __geo: [v.latitude, v.longitude] };
  if (Buffer.isBuffer(v)) return { __buf: v.toString('base64') };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]));
  return v;
};

const out: Record<string, any> = {};
async function walk(cols: FirebaseFirestore.CollectionReference[]) {
  for (const c of cols) {
    const snap = await c.get();
    for (const d of snap.docs) {
      out[d.ref.path] = enc(d.data());
      const subs: FirebaseFirestore.CollectionReference[] = [];
      if (subs.length) await walk(subs);
    }
    console.log(`${c.path}: ${snap.size}`);
  }
}
(async () => {
  await walk(await db.listCollections());
  mkdirSync('.emulator', { recursive: true });
  writeFileSync(process.env.KBI_DUMP || '.emulator/prod-dump.json', JSON.stringify(out));
  console.log(`Total dokumen: ${Object.keys(out).length}`);
  process.exit(0);
})();
