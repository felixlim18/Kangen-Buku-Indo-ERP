import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, collectionGroup } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const collectionsToScan = [
  'salesOrders', 'purchaseOrders', 'journalEntries', 'inventory', 'cashFlow',
  'fixedAssets', 'damagedStock', 'payroll', 'prive', 'setoranModal',
  'incomeEntries', 'adsPurchases', 'users', 'freightIn', 'periodClosings',
  'categories', 'orderTypes', 'channels', 'platforms', 'suppliers', 'globalSettings',
  'inventoryLedger'
];

const subcollectionsToScan = [
  'receiptEvents'
];

function checkValue(val: any, path: string): { found: boolean; reason?: string } {
  if (val === null || val === undefined) return { found: false };

  if (typeof val === 'number') {
    if (val === 1394122982400 || val === 1394122982) {
      return { found: true, reason: `Exact match for number: ${val}` };
    }
  }

  if (typeof val === 'object') {
    // Check if it's a Firestore Timestamp or representation
    if (val.seconds !== undefined) {
      if (val.seconds === 1394122982400 || val.seconds === 1394122982) {
        return { found: true, reason: `Match in timestamp seconds: ${val.seconds}` };
      }
      if (val.seconds > 100000000000) {
        return { found: true, reason: `Timestamp seconds out of range: ${val.seconds}` };
      }
    }
    // Recursive check for nested fields/arrays
    for (const key of Object.keys(val)) {
      const res = checkValue(val[key], `${path}.${key}`);
      if (res.found) {
        return { found: true, reason: `${key} -> ${res.reason}` };
      }
    }
  }

  return { found: false };
}

async function scan() {
  console.log('Starting full database scan for corrupted/invalid timestamps...');
  for (const collName of collectionsToScan) {
    try {
      const snap = await getDocs(collection(db, collName));
      console.log(`Scanning collection "${collName}" with ${snap.size} documents...`);
      snap.forEach(doc => {
        const data = doc.data();
        const check = checkValue(data, '');
        if (check.found) {
          console.log(`!!! FOUND CORRUPTED DATA !!!`);
          console.log(`Collection: ${collName}`);
          console.log(`Document ID: ${doc.id}`);
          console.log(`Details: ${check.reason}`);
          console.log(`Document Data:`, JSON.stringify(data, null, 2));
        }
      });
    } catch (err: any) {
      console.error(`Error scanning collection "${collName}":`, err.message);
    }
  }

  for (const subCollName of subcollectionsToScan) {
    try {
      const snap = await getDocs(collectionGroup(db, subCollName));
      console.log(`Scanning collection group "${subCollName}" with ${snap.size} documents...`);
      snap.forEach(doc => {
        const data = doc.data();
        const check = checkValue(data, '');
        if (check.found) {
          console.log(`!!! FOUND CORRUPTED DATA !!!`);
          console.log(`Subcollection Group: ${subCollName}`);
          console.log(`Document ID: ${doc.id}`);
          console.log(`Parent path: ${doc.ref.path}`);
          console.log(`Details: ${check.reason}`);
          console.log(`Document Data:`, JSON.stringify(data, null, 2));
        }
      });
    } catch (err: any) {
      console.error(`Error scanning collection group "${subCollName}":`, err.message);
    }
  }

  console.log('Scan completed.');
}

scan()
  .then(async () => {
    await deleteApp(app);
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Scan failed:', err);
    await deleteApp(app);
    process.exit(1);
  });
