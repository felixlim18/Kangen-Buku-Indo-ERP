// Baca-saja: piutang (salesOrders) yang amountPaid > totalPrice, beserta jurnal sales_order_payment & cashFlow-nya.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const d = (t: any) => (t?.toDate ? t.toDate().toISOString().slice(0, 19) : t);

(async () => {
  const so = await db.collection('salesOrders').get();
  const over = so.docs.filter((x) => (x.data().amountPaid || 0) > (x.data().totalPrice || 0) + 5);
  console.log(`salesOrders: ${so.size}, overpaid: ${over.length}\n`);
  for (const o of over) {
    const v = o.data();
    console.log(`== ${v.orderCode} / ${v.orderNumber} (${o.id}) ${v.platformChannel} total=${v.totalPrice} paid=${v.amountPaid} status=${v.paymentStatus} updatedAt=${d(v.updatedAt)}`);
    const [j, cf] = await Promise.all([
      db.collection('journalEntries').where('refId', '==', o.id).get(),
      db.collection('cashFlow').where('refId', '==', o.id).get(),
    ]);
    for (const x of j.docs) {
      const e = x.data();
      console.log(`  J ${x.id} ${e.refType} date=${d(e.date)} created=${d(e.createdAt)} ${e.description}`);
      for (const l of e.lines || []) console.log(`      ${l.accountCode} ${l.account} D${l.debit} K${l.credit}`);
    }
    for (const x of cf.docs) {
      const c = x.data();
      console.log(`  CF ${x.id} date=${d(c.date)} ${c.ledger} ${c.direction} ${c.amount} acct=${c.accountCode} ${c.notes}`);
    }
  }
  process.exit(0);
})();
