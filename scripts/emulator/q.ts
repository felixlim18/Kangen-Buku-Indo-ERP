// Kueri baca-saja ke EMULATOR untuk pengujian. Menolak berjalan tanpa FIRESTORE_EMULATOR_HOST.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BERHENTI: bukan emulator'); process.exit(1); }
export const db = getFirestore(initializeApp({ projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
