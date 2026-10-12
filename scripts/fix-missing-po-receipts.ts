// Mengisi entri `receipts` yang hilang di Purchase Order.
//
// handleSaveBulkScannedPO (jalur "terima barang" lewat scan) dulu menandai PO
// diterima tanpa menambah entri `receipts`, sehingga kartu PO tidak menampilkan
// "Diterima <tanggal>". Kodenya sudah diperbaiki; skrip ini membereskan PO yang
// terlanjur diterima lewat jalur itu.
//
// Tanggal diterima diambil dari baris inventoryLedger `purchase_received` milik PO
// tersebut (waktu barang benar-benar masuk stok). Baris yang waktunya berdekatan
// (<= 2 menit) dianggap satu kali penerimaan.
//
// Jalankan:
//   npx tsx scripts/fix-missing-po-receipts.ts            (dry-run)
//   npx tsx scripts/fix-missing-po-receipts.ts --apply     (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const KEY = '/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' });
const db = getFirestore(app, 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');

const APPLY = process.argv.includes('--apply');
const GROUP_WINDOW_MS = 2 * 60 * 1000;

const toDate = (v: any): Date =>
  v?.toDate ? v.toDate() : (typeof v?.seconds === 'number' ? new Date(v.seconds * 1000) : new Date(v));
const ymd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

async function main() {
  const poSnap = await db.collection('purchaseOrders').where('status', 'in', ['received', 'partial']).get();
  const missing = poSnap.docs.filter(d => !(d.data().receipts?.length > 0));
  console.log(`PO diterima/parsial: ${poSnap.size}, tanpa receipts: ${missing.length}\n`);

  let fixable = 0;
  const noLedger: string[] = [];
  const mismatched: string[] = [];

  for (const poDoc of missing) {
    const po = poDoc.data();
    const ledgerSnap = await db.collection('inventoryLedger')
      .where('refId', '==', poDoc.id)
      .where('type', '==', 'purchase_received')
      .get();
    const rows = ledgerSnap.docs.map(d => d.data())
      .filter(r => r.refCollection === 'purchaseOrders' && r.reversed !== true && (r.qtyDelta || 0) > 0)
      .sort((a, b) => toDate(a.timestamp).getTime() - toDate(b.timestamp).getTime());

    if (rows.length === 0) {
      noLedger.push(`${po.purchaseCode || poDoc.id}`);
      continue;
    }

    const groups: any[][] = [];
    for (const r of rows) {
      const last = groups[groups.length - 1];
      if (last && toDate(r.timestamp).getTime() - toDate(last[0].timestamp).getTime() <= GROUP_WINDOW_MS) last.push(r);
      else groups.push([r]);
    }

    const nameOf = (bookId: string) =>
      (po.items || []).find((it: any) => it.bookId === bookId)?.bookName || po.bookName || bookId;
    const makeReceipt = (date: any, items: Map<string, number>, userId: string) => {
      const qty = [...items.values()].reduce((s, q) => s + q, 0);
      return {
        receivedDate: Timestamp.fromDate(toDate(date)),
        receivedQty: qty,
        notes: po.kodeEkspedisi ? `[Nomor Freight-In: ${po.kodeEkspedisi}] Scan terima (dipulihkan dari ledger)` : 'Scan terima (dipulihkan dari ledger)',
        receivedBy: userId || 'anonymous',
        ...(po.kodeEkspedisi ? { kodeEkspedisi: po.kodeEkspedisi } : {}),
        items: [...items].map(([bookId, q]) => ({ bookId, bookName: nameOf(bookId), qtyReceived: q }))
      };
    };

    // `receipts` dipakai juga untuk pembagian Freight-In, jadi qty harus benar.
    // Baris ledger ganda dari bug terima-ganda sudah ditandai reversed (28/09/2026)
    // dan dilewati di atas. Kalau total tetap tidak sama dengan qty diterima di PO,
    // pakai qty PO dan ambil tanggalnya saja.
    const poItems: any[] = po.items?.length ? po.items : [po];
    const poReceived = poItems.reduce((s: number, it: any) => s + (it.qtyReceived || 0), 0);
    const ledgerQty = rows.reduce((s, r) => s + r.qtyDelta, 0);

    let receipts;
    if (ledgerQty !== poReceived) {
      mismatched.push(`${po.purchaseCode || poDoc.id} (ledger ${ledgerQty} vs PO ${poReceived})`);
      const items = new Map<string, number>();
      poItems.forEach((it: any) => { if ((it.qtyReceived || 0) > 0) items.set(it.bookId, (items.get(it.bookId) || 0) + it.qtyReceived); });
      receipts = [makeReceipt(rows[0].timestamp, items, rows[0].userId)];
    } else {
      receipts = groups.map(g => {
        const items = new Map<string, number>();
        g.forEach(r => items.set(r.bookId, (items.get(r.bookId) || 0) + r.qtyDelta));
        return makeReceipt(g[0].timestamp, items, g[0].userId);
      });
    }

    fixable++;
    console.log(`${po.purchaseCode || poDoc.id} (${po.status}) -> ${receipts.map(r => `${ymd(r.receivedDate.toDate())} x${r.receivedQty}`).join(', ')}`);

    if (APPLY) await poDoc.ref.update({ receipts });
  }

  console.log(`\nBisa diisi: ${fixable}`);
  if (mismatched.length) console.log(`Qty ledger != qty PO (pakai qty PO): ${mismatched.length} -> ${mismatched.join(', ')}`);
  if (noLedger.length) console.log(`Tanpa baris ledger (dilewati): ${noLedger.length} -> ${noLedger.join(', ')}`);
  console.log(APPLY ? '\nSelesai menulis.' : '\nDry-run. Jalankan dengan --apply untuk menulis.');
}

main().catch(e => { console.error(e); process.exit(1); });
