import { collection, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { getNextJournalId } from './journalUtils';
import { ensureAutoAccountExists } from './journalAuto';
import { DamagedStock, InventoryLedgerEntry, JournalEntry } from '../types';

export type AdjustmentType = NonNullable<DamagedStock['adjustmentType']>;

/** Semua jenis selain 'Barang Lebih' mengurangi stok (Barang Rusak, Barang Kurang). */
export const isStockReduction = (type?: string) => type !== 'Barang Lebih';

export const buildAdjustmentJournalDescription = (
  type: AdjustmentType,
  bookName: string,
  qty: number,
  notes?: string
): string => {
  const baseDesc = isStockReduction(type)
    ? `${type} - ${bookName} ${qty} pcs`
    : `Pendapatan Lain-lain - ${type} - ${bookName} ${qty} pcs`;
  return `${baseDesc}${notes ? ' - ' + notes : ''}`;
};

export const buildAdjustmentJournalLines = (type: AdjustmentType, totalAmount: number) =>
  isStockReduction(type)
    ? [
        { account: 'Beban Lain-lain', accountCode: '5500', debit: totalAmount, credit: 0 },
        { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: totalAmount }
      ]
    : [
        { account: 'Inventory On Hand', accountCode: '1201', debit: totalAmount, credit: 0 },
        { account: 'Beban Lain-lain', accountCode: '5500', debit: 0, credit: totalAmount }
      ];

export interface PostStockAdjustmentParams {
  bookId: string;
  bookName: string;
  bookInventory: any | null;
  movingAverageCost: number;  // NTD cents
  currentReady: number;       // Kontrol Stok saat ini
  adjustmentType: AdjustmentType;
  qty: number;                // selalu positif; arah ditentukan adjustmentType
  date: string;               // YYYY-MM-DD
  notes: string;
  userEmail: string;
  source?: 'opname';
}

/**
 * Posting satu penyesuaian stok dalam satu batch: inventory, inventoryLedger,
 * damagedStock (muncul di sub-tab Penyesuaian) dan jurnal 1201 <-> 5500.
 */
export async function postStockAdjustment(p: PostStockAdjustmentParams): Promise<{ id: string; journalId: string }> {
  await ensureAutoAccountExists({
    code: '5500',
    name: 'Beban Lain-lain',
    type: 'Expenses',
    subType: 'Biaya Umum dan Administrasi'
  });
  await ensureAutoAccountExists({
    code: '1201',
    name: 'Inventory On Hand',
    type: 'Assets',
    subType: 'Aset Persediaan'
  });

  const batch = writeBatch(db);
  const isReduction = isStockReduction(p.adjustmentType);
  const inv = p.bookInventory;

  const damagedId = doc(collection(db, 'damagedStock')).id;
  const journalId = await getNextJournalId(p.date);
  const ledgerId = `LEDGER-${damagedId}`;

  const dateClean = p.date.replace(/-/g, '').slice(2);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const docNo = `PS${dateClean}${randomSuffix}`;

  const currentEnding = inv ? inv.endingStock : 0;
  const qtyChange = isReduction ? -p.qty : p.qty;
  const nextEndingStock = currentEnding + qtyChange;
  const nextKontrolStok = p.currentReady + qtyChange;
  const nextValue = Math.max(0, nextEndingStock * p.movingAverageCost);

  batch.set(doc(db, 'inventory', p.bookId), {
    bookId: p.bookId,
    initialStock: inv ? inv.initialStock : 0,
    totalPurchased: inv ? inv.totalPurchased : 0,
    totalDispatched: inv ? inv.totalDispatched : 0,
    endingStock: nextEndingStock,
    readyStock: nextKontrolStok,
    inTransitStock: inv ? inv.inTransitStock : 0,
    ordersPlaced: inv ? inv.ordersPlaced : 0,
    ordersShipped: inv ? inv.ordersShipped : 0,
    movingAverageCost: p.movingAverageCost,
    totalInventoryValue: nextValue,
    stockStatus: nextEndingStock > 0 ? 'in_stock' : 'sold_out',
    lastUpdated: Timestamp.now()
  }, { merge: true });

  batch.set(doc(db, 'inventoryLedger', ledgerId), {
    id: ledgerId,
    bookId: p.bookId,
    type: isReduction ? 'damaged_stock' : 'stock_surplus',
    qtyDelta: qtyChange,
    unitCost: p.movingAverageCost,
    refCollection: 'damagedStock',
    refId: damagedId,
    balanceAfter: nextEndingStock,
    movingAvgAfter: p.movingAverageCost,
    timestamp: Timestamp.fromDate(new Date(p.date)),
    userId: p.userEmail || 'system'
  } as InventoryLedgerEntry);

  const totalAmount = p.qty * p.movingAverageCost;
  batch.set(doc(db, 'damagedStock', damagedId), {
    id: damagedId,
    docNo,
    adjustmentType: p.adjustmentType,
    bookId: p.bookId,
    bookName: p.bookName,
    qty: p.qty,
    date: p.date,
    notes: p.notes,
    unitCost: p.movingAverageCost,
    totalCost: totalAmount,
    journalId,
    ...(p.source ? { source: p.source } : {}),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  batch.set(doc(db, 'journalEntries', journalId), {
    id: journalId,
    date: Timestamp.fromDate(new Date(p.date)),
    description: buildAdjustmentJournalDescription(p.adjustmentType, p.bookName, p.qty, p.notes),
    lines: buildAdjustmentJournalLines(p.adjustmentType, totalAmount),
    refType: 'System',
    refId: damagedId,
    createdAt: Timestamp.now()
  } as JournalEntry);

  await batch.commit();
  return { id: damagedId, journalId };
}
