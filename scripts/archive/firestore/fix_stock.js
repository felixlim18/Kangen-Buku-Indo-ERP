import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
process.env.FIRESTORE_EMULATOR_HOST="localhost:8080" // Not using emulator, but wait I don't have creds
