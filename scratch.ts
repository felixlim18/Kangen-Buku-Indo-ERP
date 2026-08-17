import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

// We need a service account. Let's see if we can use normal firebase or if we need default creds.
// Since it's a client db, maybe we can just read it. Wait, no service account json is handy?
