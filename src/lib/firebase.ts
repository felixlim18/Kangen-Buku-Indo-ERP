import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  setLogLevel, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent cache and multi-tab manager natively
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

export const storage = getStorage(app);

// Silence verbose internal Firestore log messages (warnings/ambient errors)
try {
  setLogLevel('error');
} catch (e) {
  console.warn("Could not set Firestore log level:", e);
}

export const auth = getAuth();

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

