// Isi Firestore EMULATOR dengan .emulator/prod-dump.json. Menolak berjalan tanpa FIRESTORE_EMULATOR_HOST
// supaya tidak pernah menulis ke produksi. Juga membuat akun login uji di Auth emulator.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/emulator/load-emulator.ts
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('BERHENTI: bukan emulator'); process.exit(1); }
const app = initializeApp({ projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const dump: Record<string, any> = JSON.parse(readFileSync(process.env.KBI_DUMP || '.emulator/prod-dump.json', 'utf8'));

const dec = (v: any): any => {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') {
    if (v.__ts) return new Timestamp(v.__ts[0], v.__ts[1]);
    if (v.__ref) return db.doc(v.__ref);
    if (v.__geo) return new GeoPoint(v.__geo[0], v.__geo[1]);
    if (v.__buf) return Buffer.from(v.__buf, 'base64');
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)]));
  }
  return v;
};

(async () => {
  // Log aktivitas tidak memengaruhi angka; dibuang supaya muatan awal ke browser tidak melewati batas emulator.
  // Katalog/inventory hanya buku yang punya stok atau pernah muncul di transaksi (≈500 dari ≈3.300).
  const all = Object.keys(dump);
  const txBlob = JSON.stringify(all.filter((p) => /^(salesOrders|purchaseOrders|inventoryLedger|damagedStock|freightIn)\//.test(p)).map((p) => dump[p]));
  const used = (id: string) => {
    const inv = dump[`inventory/${id}`] || {};
    return ['endingStock', 'readyStock', 'shippedStock', 'inTransitStock'].some((k) => (inv[k] || 0) !== 0) || txBlob.includes(id);
  };
  const paths = all
    .filter((p) => !/^(userActivities|auditLog)\//.test(p))
    .filter((p) => !/^(catalog|inventory)\//.test(p) || used(p.split('/')[1]));
  for (let i = 0; i < paths.length; i += 400) {
    const b = db.batch();
    paths.slice(i, i + 400).forEach((p) => b.set(db.doc(p), dec(dump[p])));
    await b.commit();
  }
  console.log(`${paths.length} dokumen dimuat ke emulator`);
  const owner = Object.entries(dump).find(([p, d]) => p.startsWith('authorizedUsers/') && d.role === 'owner');
  const email = owner![0].split('/')[1];
  const auth = getAuth(app);
  try { await auth.getUserByEmail(email); } catch { await auth.createUser({ email, emailVerified: true, password: 'emulator-test-only', displayName: 'Owner (emulator)' }); }
  console.log(`Akun uji owner di emulator: ${email}`);
  process.exit(0);
})();
