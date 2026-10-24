import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { 
  initializeFirestore, 
  setLogLevel, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);

// Mode uji: hanya di `npm run dev` (localhost), aktif lewat ?emulator=1 dan mati lewat ?emulator=0. Semua baca/tulis
// masuk ke Firebase Emulator lokal (salinan data), bukan database produksi. Build produksi tidak pernah masuk ke sini.
export const USE_EMULATOR = (() => {
  if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV || typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('emulator');
    if (q === '1') localStorage.setItem('kbi-emulator', '1');
    if (q === '0') localStorage.removeItem('kbi-emulator');
    return localStorage.getItem('kbi-emulator') === '1';
  } catch { return false; }
})();

// Initialize Firestore with persistent cache and multi-tab manager natively
export const db = initializeFirestore(app, {
  // Emulator membatasi antrean long-polling (10.000 pesan); koleksi besar ERP melewatinya, jadi pakai streaming.
  experimentalForceLongPolling: !USE_EMULATOR,
  ...(USE_EMULATOR ? { experimentalAutoDetectLongPolling: false } : {}),
  // Cache emulator di memori saja supaya tidak tercampur dengan cache IndexedDB data produksi.
  localCache: USE_EMULATOR ? memoryLocalCache() : persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);
if (USE_EMULATOR) connectFirestoreEmulator(db, '127.0.0.1', 8080);

export const storage = getStorage(app);
if (USE_EMULATOR) connectStorageEmulator(storage, '127.0.0.1', 9199);

// Silence verbose internal Firestore log messages (warnings/ambient errors)
try {
  setLogLevel('error');
} catch (e) {
  console.warn("Could not set Firestore log level:", e);
}

export const auth = getAuth();
if (USE_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const bar = document.createElement('div');
  bar.textContent = 'MODE EMULATOR — data uji lokal, bukan produksi (buka ?emulator=0 untuk kembali)';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#dc2626;color:#fff;font:600 12px system-ui;text-align:center;padding:2px;pointer-events:none';
  document.body.appendChild(bar);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || '';
  
  const isOffline = errMsg.includes('offline') || 
    errMsg.includes('unavailable') || 
    errMsg.toLowerCase().includes('could not reach') ||
    errCode === 'unavailable';

  const isQuotaExceeded = errCode === 'resource-exhausted' || 
    errMsg.toLowerCase().includes('quota') ||
    errMsg.toLowerCase().includes('resource-exhausted');
    
  const isBusinessValidation = errMsg.toLowerCase().includes('insufficient') ||
    errMsg.toLowerCase().includes('stock level') ||
    errMsg.toLowerCase().includes('closed period') ||
    errMsg.toLowerCase().includes('already exists') ||
    errMsg.toLowerCase().includes('missing') ||
    errMsg.toLowerCase().includes('assertion failed') ||
    !errCode;

  if (isOffline) {
    console.warn(`Firestore is operating offline or is transiently unavailable for path "${path}" during "${operationType}" operation:`, errMsg);
    return;
  }

  if (isQuotaExceeded) {
    console.warn(`Firestore daily quota limit exceeded for path "${path}" during "${operationType}" operation. Using cached local data:`, errMsg);
    return;
  }

  if (isBusinessValidation) {
    console.warn(`Business validation notice for path "${path}" during "${operationType}" operation:`, errMsg);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

