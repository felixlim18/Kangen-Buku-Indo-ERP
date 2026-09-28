// Akses Firestore & Auth untuk server Express, lewat firebase-admin.
//
// Dulu server memakai SDK klien (firebase/firestore) TANPA login, jadi hanya bisa
// jalan selama aturan Firestore terbuka untuk publik. Sekarang server memakai
// kredensial service account (Application Default Credentials):
//   - lokal: set GOOGLE_APPLICATION_CREDENTIALS=/path/ke/serviceAccount.json di .env
//   - Cloud Run / Cloud Functions: otomatis dari service account runtime
//
// Modul ini meniru bentuk API modular SDK klien (collection, doc, getDocs, ...)
// yang dipakai importPo.ts dan line.ts, supaya kode itu tidak perlu ditulis ulang.

import { initializeApp, getApps, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Timestamp, Firestore, DocumentReference, CollectionReference, Query, WhereFilterOp, SetOptions } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const appletConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

let app: App | null = null;
let firestore: Firestore | null = null;

const getApp = (): App => {
  if (!app) {
    app = getApps()[0] || initializeApp({
      credential: applicationDefault(),
      projectId: appletConfig.projectId,
    });
  }
  return app;
};

export const isAdminConfigured = () =>
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.FUNCTION_TARGET);

export const getDb = (): Firestore => {
  if (!firestore) firestore = getFirestore(getApp(), appletConfig.firestoreDatabaseId);
  return firestore;
};

export const adminAuth = () => getAuth(getApp());

export { Timestamp };

// ---- Shim bergaya SDK klien --------------------------------------------------

const segmentsRef = (segments: string[]) => {
  let ref: any = getDb();
  segments.forEach((seg, i) => { ref = i % 2 === 0 ? ref.collection(seg) : ref.doc(seg); });
  return ref;
};

// collection(db, 'purchaseOrders') / collection(db, 'purchaseOrders', id, 'receiptEvents')
export function collection(_db: Firestore, ...segments: string[]): CollectionReference {
  return segmentsRef(segments);
}

// doc(db, 'coll', id, ...) atau doc(collectionRef) untuk ID otomatis
export function doc(parent: Firestore | CollectionReference, ...segments: string[]): DocumentReference {
  if (parent instanceof CollectionReference) {
    return segments.length ? parent.doc(segments.join('/')) : parent.doc();
  }
  return segmentsRef(segments);
}

export const where = (field: string, op: WhereFilterOp, value: any) =>
  (q: Query) => q.where(field, op, value);

export const query = (ref: Query, ...constraints: Array<(q: Query) => Query>) =>
  constraints.reduce((q, c) => c(q), ref);

export const getDocs = (q: Query) => q.get();

// SDK klien: snap.exists() adalah fungsi; di admin: properti. Samakan.
export async function getDoc(ref: DocumentReference) {
  const snap = await ref.get();
  return { id: snap.id, ref: snap.ref, exists: () => snap.exists, data: () => snap.data() };
}

export const setDoc = (ref: DocumentReference, data: any, options?: SetOptions) =>
  options ? ref.set(data, options) : ref.set(data);

export const writeBatch = (_db?: Firestore) => getDb().batch();

// Sama dengan src/lib/journalUtils.ts, tapi lewat admin SDK.
export async function getNextJournalId(selectedDateIso: string): Promise<string> {
  const d = new Date(selectedDateIso);
  if (isNaN(d.getTime())) throw new Error(`Tanggal jurnal tidak valid: ${selectedDateIso}`);
  const dateStr = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const counterRef = getDb().doc(`counters/JURNAL_${dateStr}`);
  const next = await getDb().runTransaction(async (t) => {
    const snap = await t.get(counterRef);
    const value = (snap.exists ? snap.data()!.value || 0 : 0) + 1;
    t.set(counterRef, { value }, { merge: true });
    return value;
  });
  return `JU${dateStr}${String(next).padStart(4, '0')}`;
}
