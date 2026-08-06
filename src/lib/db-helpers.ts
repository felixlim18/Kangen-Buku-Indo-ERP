import { getNextJournalId } from './journalUtils';
import { FALLBACK_NTD_PER_IDR } from './exchangeRateConstants';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  runTransaction,
  writeBatch,
  query, 
  where, 
  orderBy, 
  limit, 
  Timestamp, 
  arrayUnion,
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { 
  Book, 
  Category, 
  Supplier, 
  SalesOrder, 
  PurchaseOrder, 
  InventoryRecord, 
  InventoryLedgerEntry, 
  CashFlowEntry, 
  JournalEntry, 
  BusinessPartner, 
  Payroll,
  CoaAccount
} from '../types';
import { AUTO_ACCOUNTS, findAccountBySystemKey, ensureAutoAccountExists } from './journalAuto';
import { Decimal } from 'decimal.js';
import { isPeriodClosed, getYearMonth } from './period-closing-utils';
import {
  calculateLineTotal,
  applyDiscount,
  calculateLandedCost,
  calculateMovingAverageCost,
  convertIdrToNtdCents,
  calculateProfitMargin,
  calculatePartnerShare
} from './decimal-utils';

/**
 * Atomic counter for order formatting #S26061301 or similar
 */
export async function generateSystemPoNumber(): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;
  const counterId = `SYS_PO_${dateStr}`;
  
  try {
    const counterRef = doc(db, 'counters', counterId);
    let nextValue = 1;
    
    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      if (counterSnap.exists()) {
        nextValue = counterSnap.data().value + 1;
      }
      transaction.set(counterRef, { value: nextValue });
    });
    
    const seqStr = String(nextValue).padStart(2, '0');
    return `PO${dateStr}${seqStr}`;
  } catch (error) {
    if (String(error).includes('Quota') || String(error).includes('quota')) {
      console.warn("Quota exceeded for system PO number generation. Using random fallback.");
    } else {
      console.error("Error generating system PO number", error);
    }
    const rand = Math.floor(10 + Math.random() * 90);
    return `PO${dateStr}${rand}`;
  }
}

/**
 * Recalculates and sanitizes all PO numbers on every load, converting legacy/invalid numbers dynamically.
 * Guaranteed stable and deterministic as it relies on timestamps/IDs.
 */
export function sanitizePurchaseOrders(rawList: any[]): any[] {
  const getPoDateStr = (po: any): string => {
    let dateObj: Date;
    if (po.purchaseDate && po.purchaseDate.seconds) {
      dateObj = new Date(po.purchaseDate.seconds * 1000);
    } else if (po.createdAt && po.createdAt.seconds) {
      dateObj = new Date(po.createdAt.seconds * 1000);
    } else {
      dateObj = new Date();
    }
    const yy = String(dateObj.getFullYear()).slice(-2);
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  };

  // Sort list oldest first to determine deterministic order of legacy entries
  const sortedRaw = [...rawList].sort((a, b) => {
    const timeA = a.purchaseDate?.seconds || a.createdAt?.seconds || 0;
    const timeB = b.purchaseDate?.seconds || b.createdAt?.seconds || 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  // Group by YYMMDD
  const dateGroups: Record<string, any[]> = {};
  sortedRaw.forEach(po => {
    const dateStr = getPoDateStr(po);
    if (!dateGroups[dateStr]) dateGroups[dateStr] = [];
    dateGroups[dateStr].push(po);
  });

  // For each group, assign or resolve PO numbers
  const finalMap: Record<string, string> = {};

  Object.entries(dateGroups).forEach(([dateStr, group]) => {
    // 1. Identify already valid system PO codes (POYYMMDDXX) and their sequences
    const reservedSequences = new Set<number>();
    const needsGeneration: any[] = [];

    group.forEach(po => {
      const code = po.purchaseCode;
      const match = code ? /^PO(\d{6})(\d{2,})$/.exec(code) : null;
      if (match && match[1] === dateStr) {
        const seq = parseInt(match[2], 10);
        reservedSequences.add(seq);
        finalMap[po.id] = code;
      } else {
        needsGeneration.push(po);
      }
    });

    // 2. Assign sequence numbers to entries that need generation
    let nextSeq = 1;
    needsGeneration.forEach(po => {
      while (reservedSequences.has(nextSeq)) {
        nextSeq++;
      }
      const seqStr = String(nextSeq).padStart(2, '0');
      const generatedCode = `PO${dateStr}${seqStr}`;
      finalMap[po.id] = generatedCode;
      reservedSequences.add(nextSeq);
    });
  });

  // Map back to original list preserving original order
  return rawList.map(po => ({
    ...po,
    purchaseCode: finalMap[po.id] || po.purchaseCode
  }));
}

export async function generateOrderCode(prefix: 'S' | 'P'): Promise<string> {

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;
  const counterId = `${prefix}_${dateStr}`;
  
  try {
    const counterRef = doc(db, 'counters', counterId);
    let nextValue = 1;
    
    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      if (counterSnap.exists()) {
        nextValue = counterSnap.data().value + 1;
      }
      transaction.set(counterRef, { value: nextValue });
    });
    
    const seqStr = String(nextValue).padStart(3, '0');
    return `#${prefix}${dateStr}${seqStr}`;
  } catch (error) {
    console.error("Error generating order code", error);
    // fallback random code
    const rand = Math.floor(100 + Math.random() * 900);
    return `#${prefix}${dateStr}${rand}`;
  }
}

// Helper to retrieve the Kode Freight-in value from a purchase order record
export function getKodeFreightIn(po: any): string {
  if (!po) return '';
  if (typeof po.kodeEkspedisi === 'string') {
    return po.kodeEkspedisi.toUpperCase();
  }
  if (!po.receipts || po.receipts.length === 0) return '';
  const withField = po.receipts.find((r: any) => r.kodeEkspedisi);
  if (withField && withField.kodeEkspedisi) {
    return withField.kodeEkspedisi;
  }
  for (const r of po.receipts) {
    if (r.notes) {
      const matchFreight = r.notes.match(/Freight-in:\s*([^\s\]\n]+)/i);
      if (matchFreight && matchFreight[1]) return matchFreight[1].toUpperCase();
      const matchResi = r.notes.match(/Resi:\s*([^\s\]\n]+)/i);
      if (matchResi && matchResi[1]) return matchResi[1].toUpperCase();
      const matchKode = r.notes.match(/\[Kode\s+Freight-in:\s*([^\]\n]+)\]/i);
      if (matchKode && matchKode[1]) return matchKode[1].toUpperCase();
      const matchKodeOld = r.notes.match(/\[Kode\s+Ekspedisi:\s*([^\]\n]+)\]/i);
      if (matchKodeOld && matchKodeOld[1]) return matchKodeOld[1].toUpperCase();
    }
  }
  return '';
}

export function getPoFreightCodes(po: any): string[] {
  if (!po) return [];
  const codesSet = new Set<string>();
  if (typeof po.kodeEkspedisi === 'string' && po.kodeEkspedisi.trim()) {
    codesSet.add(po.kodeEkspedisi.trim().toUpperCase());
  }
  if (po.receipts && Array.isArray(po.receipts)) {
    po.receipts.forEach((r: any) => {
      if (typeof r.kodeEkspedisi === 'string' && r.kodeEkspedisi.trim()) {
        codesSet.add(r.kodeEkspedisi.trim().toUpperCase());
      }
      if (r.notes) {
        const matchFreight = r.notes.match(/Freight-in:\s*([^\s\]\n]+)/i);
        if (matchFreight && matchFreight[1]) codesSet.add(matchFreight[1].trim().toUpperCase());
        const matchResi = r.notes.match(/Resi:\s*([^\s\]\n]+)/i);
        if (matchResi && matchResi[1]) codesSet.add(matchResi[1].trim().toUpperCase());
        const matchKode = r.notes.match(/\[Kode\s+Freight-in:\s*([^\]\n]+)\]/i);
        if (matchKode && matchKode[1]) codesSet.add(matchKode[1].trim().toUpperCase());
        const matchKodeOld = r.notes.match(/\[Kode\s+Ekspedisi:\s*([^\]\n]+)\]/i);
        if (matchKodeOld && matchKodeOld[1]) codesSet.add(matchKodeOld[1].trim().toUpperCase());
      }
    });
  }
  return Array.from(codesSet).filter(Boolean);
}

export function getBookQtyInReceipt(po: any, r: any, bookId: string): number {
  if (!r) return 0;
  if (r.items && Array.isArray(r.items)) {
    const matched = r.items.find((it: any) => it.bookId === bookId);
    return matched ? (matched.qtyReceived || 0) : 0;
  }
  const poItems = po.items || [];
  const hasBook = poItems.some((it: any) => it.bookId === bookId);
  if (!hasBook) return 0;

  if (poItems.length <= 1) {
    return r.receivedQty || 0;
  }

  const matchedItem = poItems.find((it: any) => it.bookId === bookId);
  if (!matchedItem) return 0;

  const totalPoQty = poItems.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
  const itemPoQty = matchedItem.qty || 0;
  return Math.round((itemPoQty / totalPoQty) * (r.receivedQty || 0));
}

/**
 * Resolves moving average landed cost based on chronologically sorted received POs and their capitalization journals
 */
export function getMovingAverageLandedCost(
  bookId: string, 
  allPos: any[], 
  allJournals: any[],
  allLedgers?: any[],
  allSalesOrders?: any[],
  allFreights?: any[],
  initialStock?: number,
  initialCost?: number
): number {
  const runningInitialStock = typeof initialStock === 'number' ? initialStock : 0;
  const runningInitialCost = typeof initialCost === 'number' ? initialCost : 0;

  let runningStock = runningInitialStock;
  let runningValueCents = runningInitialStock * runningInitialCost;
  let currentAverageCost = runningInitialCost;

  const getEventTime = (timestamp: any): number => {
    if (!timestamp) return 0;
    if (typeof timestamp === 'number') return timestamp;
    if (typeof timestamp.seconds === 'number') return timestamp.seconds;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime() / 1000;
    return new Date(timestamp).getTime() / 1000;
  };

  const poReceiptEvents: any[] = [];
  const bookPos = allPos.filter(p => 
    p.status !== 'cancelled' && 
    p.receipts && p.receipts.length > 0 &&
    (p.bookId === bookId || (p.items && p.items.some((it: any) => it.bookId === bookId)))
  );

  if (allLedgers && allLedgers.length > 0) {
    const receivedEntries = allLedgers.filter(e => e.bookId === bookId && e.type === 'purchase_received' && e.reversed !== true);
    receivedEntries.forEach(entry => {
      let cost = 0;
      if (entry.unitCost !== undefined && entry.unitCost !== null && entry.unitCost > 0) {
        cost = (entry.qtyDelta || 0) * entry.unitCost;
      } else {
        const po = allPos.find(p => p.id === entry.refId);
        if (po) {
          const item = (po.items || []).find((it: any) => it.bookId === bookId) || {
            bookId: po.bookId || bookId,
            bookName: po.bookName || '',
            qty: po.qty || 1,
            qtyReceived: po.qtyReceived || po.qty || 0,
            priceNTDTotal: po.purchasePriceNTD || 0,
            pricePerItem: po.pricePerUnitNTD || Math.round((po.purchasePriceNTD || 0) / (po.qty || 1))
          };
          const totalQtyOrdered = (po.items || []).reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
          const diskon_per_buku = (po.discount || 0) * ((item.qty || 0) / totalQtyOrdered);
          const netItemPriceNTDTotal = (item.priceNTDTotal || 0) - diskon_per_buku;
          const unitItemCostCents = item.qty > 0 ? (netItemPriceNTDTotal / item.qty) : (item.pricePerItem || 0);
          cost = (entry.qtyDelta || 0) * unitItemCostCents;
        } else {
          cost = (entry.qtyDelta || 0) * (entry.unitCost || 0);
        }
      }
      
      const timestamp = entry.timestamp?.seconds || entry.timestamp?.toDate?.()?.getTime() / 1000 || entry.timestamp || 0;
      poReceiptEvents.push({
        type: 'purchase_received',
        timestamp: timestamp,
        qtyDelta: entry.qtyDelta || 0,
        cost: cost,
        refId: entry.refId,
        id: entry.id
      });
    });
  } else {
    bookPos.forEach(po => {
      const item = (po.items || []).find((it: any) => it.bookId === bookId) || {
        bookId: po.bookId || bookId,
        bookName: po.bookName || '',
        qty: po.qty || 1,
        qtyReceived: po.qtyReceived || po.qty || 0,
        priceNTDTotal: po.purchasePriceNTD || 0,
        pricePerItem: po.pricePerUnitNTD || Math.round((po.purchasePriceNTD || 0) / (po.qty || 1))
      };

      const totalQtyOrdered = (po.items || []).reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
      const diskon_per_buku = (po.discount || 0) * ((item.qty || 0) / totalQtyOrdered);
      const netItemPriceNTDTotal = (item.priceNTDTotal || 0) - diskon_per_buku;

      po.receipts.forEach((r: any) => {
        const qtyReceived = getBookQtyInReceipt(po, r, bookId);
        if (qtyReceived <= 0) return;

        const timestamp = r.receivedDate?.seconds || r.receivedDate?.toDate?.()?.getTime() / 1000 || 0;
        const unitItemCostCents = item.qty > 0 ? (netItemPriceNTDTotal / item.qty) : (item.pricePerItem || 0);
        const receiptItemCost = qtyReceived * unitItemCostCents;

        poReceiptEvents.push({
          type: 'purchase_received',
          timestamp: timestamp,
          qtyDelta: qtyReceived,
          cost: receiptItemCost,
          refId: po.id,
          id: po.id + '-' + (r.id || timestamp)
        });
      });
    });
  }

  const isFreightCapitalized = (fRec: any) => {
    if (fRec.isCapitalized === true) return true;
    const fCode = fRec.freightCode?.toUpperCase().trim();
    if (!fCode) return false;
    return allJournals.some(j => 
      (j.freightCode?.toUpperCase() === fCode || j.refId?.toUpperCase() === fCode) &&
      (j.description || '').toUpperCase().includes('KAPITALISASI')
    );
  };

  const freightCapitalizationEvents: any[] = [];
  if (allFreights) {
    allFreights.forEach(fRec => {
      if (!fRec.freightCode) return;
      if (!isFreightCapitalized(fRec)) return;

      const fCode = fRec.freightCode.toUpperCase().trim();

      // Total received qty for all books under this freight code
      let totalQtyReceivedInFreight = 0;
      allPos.forEach(p => {
        if (p.receipts && p.receipts.length > 0) {
          p.receipts.forEach((rx: any) => {
            if (rx.kodeEkspedisi && rx.kodeEkspedisi.toUpperCase().trim() === fCode) {
              totalQtyReceivedInFreight += rx.receivedQty || 0;
            }
          });
        } else if (p.kodeEkspedisi && p.kodeEkspedisi.toUpperCase().trim() === fCode) {
          totalQtyReceivedInFreight += p.qtyReceived || p.qty || 0;
        }
      });

      if (totalQtyReceivedInFreight <= 0) return;

      const totalFreightNTDCents = fRec.totalHargaPengirimanNTD 
        ? Math.round(fRec.totalHargaPengirimanNTD * 100) 
        : Math.round((fRec.totalKg || 0) * (fRec.ratePerKg || 0) * (fRec.exchangeRate || FALLBACK_NTD_PER_IDR) * 100);

      // Now find each receipt batch of our book under this freight
      bookPos.forEach(po => {
        po.receipts.forEach((r: any) => {
          if (r.kodeEkspedisi && r.kodeEkspedisi.toUpperCase().trim() === fCode) {
            const qtyReceived = getBookQtyInReceipt(po, r, bookId);
            if (qtyReceived > 0) {
              const freightAllocatedCents = Math.round((qtyReceived / totalQtyReceivedInFreight) * totalFreightNTDCents);
              
              const capTimestamp = fRec.capitalizationJournalId
                ? (allJournals.find(x => x.id === fRec.capitalizationJournalId)?.date?.seconds || 
                   allJournals.find(x => x.id === fRec.capitalizationJournalId)?.date?.toDate?.()?.getTime() / 1000)
                : null;
              const timestamp = capTimestamp || fRec.createdAt?.seconds || fRec.createdAt?.toDate?.()?.getTime() / 1000 || 0;

              freightCapitalizationEvents.push({
                type: 'freight_capitalized',
                timestamp: timestamp,
                freightCode: fRec.freightCode,
                freightAllocatedCents: freightAllocatedCents,
                refId: fRec.freightCode
              });
            }
          }
        });
      });
    });
  }

  const outflowEvents: any[] = [];
  if (allLedgers) {
    allLedgers.forEach(e => {
      if (e.bookId !== bookId) return;
      if (e.reversed === true) return;
      
      const isSale = e.type === 'COMPLETED_SALE' || e.type === 'COMPLETED (SALE)' || e.type === 'sale_shipped';
      if (isSale) {
        const so = allSalesOrders?.find(s => s.id === e.refId);
        if (so && (so.status === 'completed' || so.status === 'Selesai')) {
          const timestamp = e.timestamp?.seconds || e.timestamp?.toDate?.()?.getTime() / 1000 || e.timestamp || 0;
          outflowEvents.push({
            type: 'outflow',
            timestamp: timestamp,
            qtyDelta: Math.abs(e.qtyDelta || 0),
            refId: e.refId,
            id: e.id
          });
        }
      } else if (e.type === 'damaged_stock') {
        const timestamp = e.timestamp?.seconds || e.timestamp?.toDate?.()?.getTime() / 1000 || e.timestamp || 0;
        outflowEvents.push({
          type: 'outflow',
          timestamp: timestamp,
          qtyDelta: Math.abs(e.qtyDelta || 0),
          refId: e.refId,
          id: e.id
        });
      }
    });
  }

  const allEvents = [...poReceiptEvents, ...freightCapitalizationEvents, ...outflowEvents];

  allEvents.sort((a, b) => {
    const timeA = getEventTime(a.timestamp);
    const timeB = getEventTime(b.timestamp);
    if (timeA !== timeB) return timeA - timeB;

    const getOrder = (type: string) => {
      if (type === 'purchase_received') return 1;
      if (type === 'freight_capitalized') return 2;
      return 3; // outflow
    };
    return getOrder(a.type) - getOrder(b.type);
  });

  for (const event of allEvents) {
    if (event.type === 'purchase_received') {
      runningStock += event.qtyDelta;
      runningValueCents += event.cost;
      if (runningStock > 0) {
        currentAverageCost = runningValueCents / runningStock;
      } else {
        currentAverageCost = 0;
      }
    } 
    else if (event.type === 'freight_capitalized') {
      runningValueCents += event.freightAllocatedCents;
      if (runningStock > 0) {
        currentAverageCost = runningValueCents / runningStock;
      } else {
        currentAverageCost = 0;
      }
    } 
    else if (event.type === 'outflow') {
      const hppCents = event.qtyDelta * currentAverageCost;
      runningStock = Math.max(0, runningStock - event.qtyDelta);
      runningValueCents = Math.max(0, runningValueCents - hppCents);
    }
  }

  return currentAverageCost;
}

/**
 * Deducts physical stock when an order is packed ('packed' status).
 * Does NOT post any journal entry.
 */
export async function packSalesOrderTransaction(orderId: string, currentUserId: string): Promise<void> {
  const path = `salesOrders/${orderId}`;
  try {
    const orderRef = doc(db, 'salesOrders', orderId);

    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new Error('Sales order not found');
      }

      const order = orderSnap.data() as SalesOrder;
      if (order.status && order.status !== 'draft') {
        throw new Error('Order is already packed or processed');
      }

      // 1. Fetch all required inventory snapshots first (reads)
      const invSnapsMap = new Map<string, { ref: any, snap: any }>();
      for (const item of order.items || []) {
        if (!invSnapsMap.has(item.bookId)) {
          const invRef = doc(db, 'inventory', item.bookId);
          const invSnap = await transaction.get(invRef);
          invSnapsMap.set(item.bookId, { ref: invRef, snap: invSnap });
        }
      }

      // 2. Perform calculations and write operations (no more reads)
      for (const item of order.items || []) {
        if (item.markedTertinggal || item.markedRefund) {
          continue; // Skip items marked as Tertinggal / Refund
        }
        const entry = invSnapsMap.get(item.bookId)!;
        const invRef = entry.ref;
        const invSnap = entry.snap;

        if (!invSnap.exists()) {
          throw new Error(`Inventory record missing for book: ${item.bookName}`);
        }

        const inv = invSnap.data() as InventoryRecord;
        const endingStock = inv.endingStock || 0;
        const totalDispatched = inv.totalDispatched || 0;
        const readyStock = inv.readyStock || 0;

        if (endingStock < item.qty) {
          throw new Error(`Stock level is insufficient for book: ${item.bookName}. Available: ${endingStock}, Required: ${item.qty}`);
        }

        const nextEndingStock = endingStock - item.qty;
        const nextReadyStock = Math.max(0, readyStock - item.qty);
        const nextDispatched = totalDispatched + item.qty;
        const movingCost = inv.movingAverageCost || 0;
        const nextValue = new Decimal(nextEndingStock).mul(movingCost).toNumber();

        // Update Inventory Record inside transaction
        transaction.update(invRef, {
          endingStock: nextEndingStock,
          readyStock: nextReadyStock,
          totalDispatched: nextDispatched,
          movingAverageCost: Math.round(movingCost),
          totalInventoryValue: Math.round(nextValue),
          stockStatus: nextEndingStock > 0 ? 'in_stock' : 'sold_out',
          lastUpdated: Timestamp.now()
        });

        // Add to Inventory Ledger Entry (Immutable)
        const ledgerId = doc(collection(db, 'inventoryLedger')).id;
        const ledgerRef = doc(db, 'inventoryLedger', ledgerId);
        transaction.set(ledgerRef, {
          id: ledgerId,
          bookId: item.bookId,
          type: 'PACKED',
          qtyDelta: -item.qty,
          unitCost: movingCost,
          refCollection: 'salesOrders',
          refId: orderId,
          balanceAfter: nextEndingStock,
          movingAvgAfter: movingCost,
          timestamp: Timestamp.now(),
          userId: currentUserId
        } as InventoryLedgerEntry);
      }

      // Update status to 'packed'
      transaction.update(orderRef, {
        status: 'packed',
        packedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * 1. Triggers Atomic Sales Order Confirmation (Shipping)
 * Matches Section 5.2 Business Logic
 */
export async function confirmSalesOrderTransaction(orderId: string, currentUserId: string): Promise<void> {
  const path = `salesOrders/${orderId}`;
  try {
    // Phase 0: Load POs and Journals first outside the transaction (transaction queries are disallowed in Firestore)
    const orderRef = doc(db, 'salesOrders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      throw new Error(`Cannot create journal: SO ${orderId} does not exist`);
    }
    const order = orderSnap.data() as SalesOrder;
    if (order.status && order.status !== 'draft' && order.status !== 'packed') {
      throw new Error('Order is already confirmed or processed');
    }

    const poSnaps = await getDocs(
      query(collection(db, 'purchaseOrders'), where('status', '==', 'received'))
    );
    const allPos = poSnaps.docs.map(doc => doc.data());

    const journalSnaps = await getDocs(
      collection(db, 'journalEntries')
    );
    const allJournals = journalSnaps.docs.map(doc => doc.data());

    const ledgerSnaps = await getDocs(
      collection(db, 'inventoryLedger')
    );
    const allLedgers = ledgerSnaps.docs.map(doc => doc.data());

    const salesOrderSnaps = await getDocs(
      collection(db, 'salesOrders')
    );
    const allSalesOrders = salesOrderSnaps.docs.map(doc => doc.data());

    const freightSnaps = await getDocs(
      collection(db, 'freightIn')
    );
    const allFreights = freightSnaps.docs.map(doc => doc.data());

    // Add idempotency guard to prevent duplicate journal entries

    const existingDikirim = allJournals.find(j => 
      (j.refId === orderId && j.refType === 'sales_order_shipped') ||
      (j.soId === orderId && j.type === 'BARANG_DIKIRIM')
    );
    if (existingDikirim) {
      throw new Error(`Dikirim journal already exists for SO ${orderId}`);
    }

    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const liveOrderSnap = await transaction.get(orderRef);
      if (!liveOrderSnap.exists()) {
        throw new Error('Sales order not found inside transaction');
      }
      
      const liveOrder = liveOrderSnap.data() as SalesOrder;
      if (liveOrder.status && liveOrder.status !== 'draft' && liveOrder.status !== 'packed') {
        throw new Error('Order is already confirmed or processed');
      }

      const wasAlreadyPacked = liveOrder.status === 'packed';

      // 1. Fetch all required inventory snapshots first (reads)
      const invSnapsMap = new Map<string, { ref: any, snap: any }>();
      for (const item of liveOrder.items) {
        if (!invSnapsMap.has(item.bookId)) {
          const invRef = doc(db, 'inventory', item.bookId);
          const invSnap = await transaction.get(invRef);
          invSnapsMap.set(item.bookId, { ref: invRef, snap: invSnap });
        }
      }

      // 2. Perform calculations and write operations (no more reads)
      const itemCogsSnapshots: number[] = [];

      for (const item of liveOrder.items) {
        if (item.markedTertinggal || item.markedRefund) {
          itemCogsSnapshots.push(0);
          continue; // Skip items marked as Tertinggal / Refund
        }
        const entry = invSnapsMap.get(item.bookId)!;
        const invRef = entry.ref;
        const invSnap = entry.snap;
        
        let endingStock = 0;
        let movingCost = 0;
        let totalPurchased = 0;
        let totalDispatched = 0;
        let readyStock = 0;
        let ordersShipped = 0;
        let shippedStock = 0;
        
        if (invSnap.exists()) {
          const inv = invSnap.data() as InventoryRecord;
          endingStock = inv.endingStock || 0;
          totalPurchased = inv.totalPurchased || 0;
          totalDispatched = inv.totalDispatched || 0;
          readyStock = inv.readyStock || 0;
          ordersShipped = inv.ordersShipped || 0;
          shippedStock = inv.shippedStock || 0;
        } else {
          throw new Error(`Inventory record missing for book: ${item.bookName}. Please receive purchase PO first.`);
        }

        if (!wasAlreadyPacked && endingStock < item.qty) {
          throw new Error(`Stock level is insufficient for book: ${item.bookName}. Available: ${endingStock}, Required: ${item.qty}`);
        }

        // Use dynamically calculated true moving average landed cost
        const calculatedLandedCost = getMovingAverageLandedCost(
          item.bookId, 
          allPos, 
          allJournals, 
          allLedgers, 
          allSalesOrders, 
          allFreights,
          invSnap.data()?.initialStock || 0,
          invSnap.data()?.movingAverageCost || 0
        );
        movingCost = calculatedLandedCost > 0 ? calculatedLandedCost : (invSnap.data()?.movingAverageCost || 0);

        // Lock Unit test/Assertion check
        const itemCOGS = new Decimal(movingCost).mul(item.qty).toNumber();
        const expectedCOGS = new Decimal(calculatedLandedCost > 0 ? calculatedLandedCost : (invSnap.data()?.movingAverageCost || 0)).mul(item.qty).toNumber();
        if (Math.abs(itemCOGS - expectedCOGS) > 0.0001) {
          throw new Error(`Assertion failed: Barang Dikirim journal amount mismatch for book ${item.bookId}. Stored: ${itemCOGS}, Expected: ${expectedCOGS}`);
        }

        const nextEndingStock = wasAlreadyPacked ? endingStock : endingStock - item.qty;
        const nextReadyStock = wasAlreadyPacked ? readyStock : Math.max(0, readyStock - item.qty);
        const nextShippedStock = shippedStock + item.qty;
        const nextDispatched = wasAlreadyPacked ? totalDispatched : totalDispatched + item.qty;
        const nextValue = new Decimal(nextEndingStock).mul(movingCost).toNumber();

        // Update Inventory Record inside transaction
        transaction.update(invRef, {
          endingStock: nextEndingStock,
          readyStock: nextReadyStock,
          shippedStock: nextShippedStock,
          totalDispatched: nextDispatched,
          ordersShipped: ordersShipped + 1,
          movingAverageCost: Math.round(movingCost),
          totalInventoryValue: Math.round(nextValue),
          stockStatus: nextEndingStock > 0 ? 'in_stock' : 'sold_out',
          lastUpdated: Timestamp.now()
        });

        // Add to Inventory Ledger Entry (Immutable)
        const ledgerId = doc(collection(db, 'inventoryLedger')).id;
        const ledgerRef = doc(db, 'inventoryLedger', ledgerId);
        transaction.set(ledgerRef, {
          id: ledgerId,
          bookId: item.bookId,
          type: 'DISPATCHED',
          qtyDelta: -item.qty,
          unitCost: movingCost,
          refCollection: 'salesOrders',
          refId: orderId,
          balanceAfter: nextEndingStock,
          movingAvgAfter: movingCost,
          timestamp: Timestamp.now(),
          userId: currentUserId
        } as InventoryLedgerEntry);

        // Store the moving average cost used at transaction time for later COGS calculation
        itemCogsSnapshots.push(movingCost);
      }

      // Update item cogsSnapshot in order document
      const updatedItems = liveOrder.items.map((it, idx) => ({
        ...it,
        cogsSnapshot: itemCogsSnapshots[idx]
      }));

      // Calculate aggregated COGS
      const totalCOGS = updatedItems.reduce((acc, it) => {
        if (it.markedTertinggal || it.markedRefund) return acc;
        return new Decimal(acc).plus(new Decimal(it.cogsSnapshot || 0).mul(it.qty)).toNumber();
      }, 0);

      // Update status to 'confirmed'
      transaction.update(orderRef, {
        status: 'confirmed',
        items: updatedItems,
        updatedAt: Timestamp.now()
      });

      // Double-entry Journal: Dr Inventory in Delivery (1202) | Cr Inventory On Hand (1201)
      // journalId pre-generated outside transaction
    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
      const journalRef = doc(db, 'journalEntries', journalId);
      
      transaction.set(journalRef, {
        id: journalId,
        date: Timestamp.now(),
        description: `Sales Order ${liveOrder.orderCode} - Barang Dikirim`,
        lines: [
          { account: 'Inventory in Delivery', accountCode: '1202', debit: Math.round(totalCOGS), credit: 0 },
          { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: Math.round(totalCOGS) }
        ],
        refType: 'sales_order_shipped',
        refId: orderId,
        isAuto: true,
        createdAt: Timestamp.now()
      } as JournalEntry);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Marks sales order as completed, recognizes Revenue and COGS
 */
export async function completeSalesOrderTransaction(orderId: string, currentUserId: string): Promise<void> {
  const path = `salesOrders/${orderId}`;
  try {
    // 1. Read shipped journal from Firestore first (outside transaction)
    const shippedJournalSnap = await getDocs(
      query(
        collection(db, 'journalEntries'),
        where('refId', '==', orderId),
        where('refType', '==', 'sales_order_shipped')
      )
    );
    const shippedJournalRefs = shippedJournalSnap.docs.map(doc => doc.ref);

    // Ensure standard Revenue (4100) and Beban Hadiah Pelanggan (5310) exists
    await ensureAutoAccountExists(AUTO_ACCOUNTS.REVENUE);
    await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_HADIAH_PELANGGAN);
    await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_PLATFORM);
    await ensureAutoAccountExists({ code: '1110', name: 'Piutang Usaha', type: 'Assets', subType: 'Aset Lancar' });
    await ensureAutoAccountExists({ code: '2110', name: 'Pendapatan Diterima di Muka', type: 'Liabilities', subType: 'Kewajiban Lancar' });

    // Fetch all CoA accounts to resolve the systemKey dynamic account lookup
    const coaSnap = await getDocs(collection(db, 'coa'));
    const coaAccounts = coaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoaAccount));

    const journalAId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    const journalBId = await getNextJournalId(new Date().toISOString().split('T')[0]);

    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db, 'salesOrders', orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new Error('Sales order not found');
      }
      
      const order = orderSnap.data() as SalesOrder;
      if (order.status !== 'shipped' && order.status !== 'confirmed') {
        throw new Error('Order is not in shipped or confirmed status');
      }

      // isUnpaid diturunkan otomatis dari paymentMethod, bukan pilihan manual:
      // COD -> masuk Piutang Usaha (belum dibayar saat barang dikirim).
      // Transfer -> harus sudah lunas via tab "Penerimaan Transfer (Income)" sebelum
      // order bisa diselesaikan, karena pembayarannya diterima di muka.
      const isUnpaid = order.paymentMethod !== 'Transfer';

      if (!isUnpaid) {
        const isPaidEnough = order.paymentStatus === 'paid' || (order.amountPaid || 0) >= (order.totalPrice || 0) - 5;
        if (!isPaidEnough) {
          throw new Error(`Order ${order.orderCode} metode Transfer belum tercatat lunas (status: ${order.paymentStatus || 'unpaid'}, dibayar ${((order.amountPaid || 0) / 100).toFixed(2)}/${((order.totalPrice || 0) / 100).toFixed(2)}). Catat penerimaan transfer dulu lewat tab "Penerimaan Transfer (Income)" sebelum menyelesaikan order ini.`);
        }
      }

      // Read inventory documents
      const invSnapsMap = new Map<string, { ref: any, snap: any }>();
      for (const item of order.items || []) {
        if (!invSnapsMap.has(item.bookId)) {
          const invRef = doc(db, 'inventory', item.bookId);
          const invSnap = await transaction.get(invRef);
          invSnapsMap.set(item.bookId, { ref: invRef, snap: invSnap });
        }
      }

      // 2. Read the shipped journal inside the transaction (mandatory per read-before-write transaction rule)
      let lockedCogsAmount = 0;
      if (shippedJournalRefs.length > 0) {
        const sjSnap = await transaction.get(shippedJournalRefs[0]);
        if (sjSnap.exists()) {
          const sjData = sjSnap.data();
          const lines = sjData.lines || [];
          // Find the debit amount for 'Inventory in Delivery' (code 1202)
          const line1202 = lines.find((l: any) => l.accountCode === '1202');
          if (line1202) {
            lockedCogsAmount = line1202.debit || 0;
          }
        }
      }

      // Fallback to order items' cogsSnapshot if the journal is not found or has 0
      if (lockedCogsAmount === 0) {
        lockedCogsAmount = (order.items || []).reduce((acc, it) => 
          new Decimal(acc).plus(new Decimal(it.cogsSnapshot || 0).mul(it.qty)).toNumber(), 0);
      }

      // Calculate split of cogs between paid and free items
      const items = order.items || [];
      const totalRawCogs = items.reduce((acc, it) => acc + (it.cogsSnapshot || 0) * it.qty, 0);
      
      let paidCogs = 0;
      let freeCogs = 0;
      
      if (totalRawCogs > 0) {
        let remainingCogs = lockedCogsAmount;
        const itemActualCogsList: number[] = [];
        
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (i === items.length - 1) {
            itemActualCogsList.push(remainingCogs);
          } else {
            const rawVal = (it.cogsSnapshot || 0) * it.qty;
            const portion = Math.round((rawVal / totalRawCogs) * lockedCogsAmount);
            itemActualCogsList.push(portion);
            remainingCogs -= portion;
          }
        }
        
        items.forEach((it, idx) => {
          if (it.isFree) {
            freeCogs += itemActualCogsList[idx];
          } else {
            paidCogs += itemActualCogsList[idx];
          }
        });
      } else {
        paidCogs = lockedCogsAmount;
      }

      // Umur piutang (30/60/90 hari, default 30) hanya relevan untuk order yang masuk
      // Piutang Usaha (COD/isUnpaid) - dihitung dari saat order benar-benar completed.
      let dueDateStr: string | null = null;
      if (isUnpaid) {
        const termsDays = order.paymentTermsDays || 30;
        const dueDateObj = new Date();
        dueDateObj.setDate(dueDateObj.getDate() + termsDays);
        dueDateStr = dueDateObj.toISOString().split('T')[0];
      }

      // Update status to 'completed'
      transaction.update(orderRef, {
        status: 'completed',
        paymentStatus: isUnpaid ? 'unpaid' : 'paid',
        isUnpaid: isUnpaid,
        amountPaid: isUnpaid ? 0 : order.totalPrice,
        dueDate: dueDateStr,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      // Journal A: Payment / Revenue Recognition based on selected option
      // journalAId pre-generated
      const journalARef = doc(db, 'journalEntries', journalAId);
      
      let journalALines: any[] = [];
      let journalADesc = '';
      
      const platformFee = order.platformFee || 0;
      const netToReceivable = order.totalPrice - platformFee;

      if (isUnpaid) {
        // Option 1: Masuk Piutang
        if (platformFee > 0) {
          journalALines = [
            { account: 'Piutang Usaha', accountCode: '1110', debit: netToReceivable, credit: 0 },
            { account: 'Biaya Platform', accountCode: '5320', debit: platformFee, credit: 0 },
            { account: 'Revenue', accountCode: '4100', debit: 0, credit: order.totalPrice }
          ];
        } else {
          journalALines = [
            { account: 'Piutang Usaha', accountCode: '1110', debit: order.totalPrice, credit: 0 },
            { account: 'Revenue', accountCode: '4100', debit: 0, credit: order.totalPrice }
          ];
        }
        journalADesc = `Sales Order [${order.orderCode} - Barang Selesai (Piutang)]`;
      } else {
        // Option 2: Sudah Dibayar
        if (platformFee > 0) {
          journalALines = [
            { account: 'Pendapatan Diterima di Muka', accountCode: '2110', debit: netToReceivable, credit: 0 },
            { account: 'Biaya Platform', accountCode: '5320', debit: platformFee, credit: 0 },
            { account: 'Revenue', accountCode: '4100', debit: 0, credit: order.totalPrice }
          ];
        } else {
          journalALines = [
            { account: 'Pendapatan Diterima di Muka', accountCode: '2110', debit: order.totalPrice, credit: 0 },
            { account: 'Revenue', accountCode: '4100', debit: 0, credit: order.totalPrice }
          ];
        }
        journalADesc = `Sales Order [${order.orderCode} - Barang Selesai (Lunas)]`;
      }

      transaction.set(journalARef, {
        id: journalAId,
        date: Timestamp.now(),
        description: journalADesc,
        lines: journalALines,
        refType: 'sales_order_completed',
        refId: orderId,
        isAuto: true,
        createdAt: Timestamp.now()
      } as JournalEntry);

      // Journal B: COGS / HPP recognition (Dr COGS 5100, Dr Beban Hadiah Pelanggan 5310 if free items exist | Cr Inventory in Delivery 1202)
      // journalBId pre-generated
      const journalBRef = doc(db, 'journalEntries', journalBId);

      const journalLines = [
        { account: AUTO_ACCOUNTS.COGS.name, accountCode: AUTO_ACCOUNTS.COGS.code, debit: paidCogs, credit: 0 },
        ...(freeCogs > 0 ? [{ account: AUTO_ACCOUNTS.BEBAN_HADIAH_PELANGGAN.name, accountCode: AUTO_ACCOUNTS.BEBAN_HADIAH_PELANGGAN.code, debit: freeCogs, credit: 0 }] : []),
        { account: 'Inventory in Delivery', accountCode: '1202', debit: 0, credit: lockedCogsAmount }
      ];

      transaction.set(journalBRef, {
        id: journalBId,
        date: Timestamp.now(),
        description: `Sales Order ${order.orderCode} - Barang Selesai`,
        lines: journalLines,
        refType: 'sales_order_completed',
        refId: orderId,
        isAuto: true,
        createdAt: Timestamp.now()
      } as JournalEntry);

      // Partner Profit Share if Business Partner
      if (order.orderType === 'Business Partner' && order.partnerProfitShare && order.partnerProfitShare > 0) {
        const partnerJournalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
        const partnerJournalRef = doc(db, 'journalEntries', partnerJournalId);
        transaction.set(partnerJournalRef, {
          id: partnerJournalId,
          date: Timestamp.now(),
          description: `Partner Profit Share - Sales Order ${order.orderCode}`,
          lines: [
            { account: AUTO_ACCOUNTS.PARTNER_PROFIT_SHARE.name, accountCode: AUTO_ACCOUNTS.PARTNER_PROFIT_SHARE.code, debit: order.partnerProfitShare, credit: 0 },
            { account: AUTO_ACCOUNTS.AP_PARTNERS.name, accountCode: AUTO_ACCOUNTS.AP_PARTNERS.code, debit: 0, credit: order.partnerProfitShare }
          ],
          refType: 'sales_order_completed',
          refId: orderId,
          isAuto: true,
          createdAt: Timestamp.now()
        } as JournalEntry);
      }

      // Add to Inventory Ledger Entry (Immutable) for each item as COMPLETED_SALE
      const shippedItems = (order.items || []).filter(it => !it.markedTertinggal && !it.markedRefund);
      const totalQtyDispatched = shippedItems.reduce((acc, it) => acc + (it.qty || 0), 0);
      for (const item of shippedItems) {
        const unitLandedVal = totalQtyDispatched > 0 ? Math.round(lockedCogsAmount / totalQtyDispatched) : (item.cogsSnapshot || 0);
        const complLedgerId = doc(collection(db, 'inventoryLedger')).id;
        const complLedgerRef = doc(db, 'inventoryLedger', complLedgerId);
        transaction.set(complLedgerRef, {
          id: complLedgerId,
          bookId: item.bookId,
          type: 'COMPLETED_SALE',
          qtyDelta: -item.qty,
          unitCost: unitLandedVal,
          unitLanded: unitLandedVal,
          refCollection: 'salesOrders',
          refId: orderId,
          balanceAfter: 0,
          movingAvgAfter: item.cogsSnapshot || 0,
          timestamp: Timestamp.now(),
          userId: currentUserId
        } as any);
      }

      // Decrement shippedStock in inventory
      for (const item of order.items || []) {
        const entry = invSnapsMap.get(item.bookId);
        if (entry && entry.snap.exists()) {
          const invData = entry.snap.data() as InventoryRecord;
          const currentShipped = invData.shippedStock || 0;
          const nextShippedStock = Math.max(0, currentShipped - item.qty);
          transaction.update(entry.ref, {
            shippedStock: nextShippedStock,
            lastUpdated: Timestamp.now()
          });
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Handles Reversal of Sales Order (Return / Cancel) with physical inventory options
 */
/**
 * Handles Reversal of Sales Order (Return / Cancel) with physical inventory options
 */
export async function reverseSalesOrderTransaction(
  orderId: string, 
  currentUserId: string, 
  targetStatus: 'returned' | 'cancelled' | 'draft' | 'packed', 
  returnMode: 'stock' | 'damaged'
): Promise<void> {
  const path = `salesOrders/${orderId}`;
  try {
    // Phase 0: Read associated journal and ledger entries from Firestore first
    const journalSnap = await getDocs(
      query(collection(db, 'journalEntries'), where('refId', '==', orderId))
    );
    const journalRefs = journalSnap.docs.map(doc => doc.ref);

    const ledgerSnap = await getDocs(
      query(collection(db, 'inventoryLedger'), where('refId', '==', orderId))
    );
    const ledgerRefs = ledgerSnap.docs.map(doc => doc.ref);

    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db, 'salesOrders', orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new Error('Sales order not found');
      }
      
      const order = orderSnap.data() as SalesOrder;
      const originalStatus = order.status;

      if (originalStatus === 'cancelled') {
        throw new Error('Sales order is already cancelled');
      }

      // ── PHASE 1: ALL READS FIRST ──────────────────────────
      const journalSnaps = [];
      for (const jRef of journalRefs) {
        const jSnap = await transaction.get(jRef);
        journalSnaps.push(jSnap);
      }

      const ledgerSnaps = [];
      for (const lRef of ledgerRefs) {
        const lSnap = await transaction.get(lRef);
        ledgerSnaps.push(lSnap);
      }

      // Fetch all related inventory snapshots if returnMode === 'stock'
      const invSnapsMap = new Map<string, any>();
      const isProcessed = originalStatus === 'shipped' || originalStatus === 'completed' || originalStatus === 'returned' || originalStatus === 'packed';
      
      if (isProcessed && returnMode === 'stock') {
        for (const item of order.items || []) {
          if (item.markedTertinggal || item.markedRefund) continue;
          if (!invSnapsMap.has(item.bookId)) {
            const invRef = doc(db, 'inventory', item.bookId);
            const invSnap = await transaction.get(invRef);
            invSnapsMap.set(item.bookId, invSnap);
          }
        }
      }

      // ── PHASE 2: VALIDATE & CALCULATE (no Firestore writes/deletes here) ──
      const updateData: any = {
        status: targetStatus,
        updatedAt: Timestamp.now(),
        ...(targetStatus === 'cancelled' ? { cancelledAt: Timestamp.now() } : {}),
        ...(targetStatus === 'returned' ? { returnedAt: Timestamp.now() } : {})
      };
      if (targetStatus === 'draft' || targetStatus === 'packed') {
        updateData.shipment = null;
      }

      // ── PHASE 3: ALL WRITES / DELETES LAST ───────────────────────────
      if (!isProcessed) {
        transaction.update(orderRef, updateData);
        return;
      }

      // SILENTLY DELETE all associated auto-journal entries for this Sales Order
      for (const jSnap of journalSnaps) {
        if (jSnap.exists()) {
          transaction.delete(jSnap.ref);
        }
      }

      // Handle audit trail entries based on original status
      for (const lSnap of ledgerSnaps) {
        if (lSnap.exists()) {
          const lData = lSnap.data();
          if (lData.type === 'PACKED' || lData.type === 'DISPATCHED' || lData.type === 'sale_shipped' || lData.type === 'COMPLETED_SALE' || lData.type === 'COMPLETED (SALE)') {
            transaction.delete(lSnap.ref);
          }
        }
      }

      // Update the sales order document status
      transaction.update(orderRef, updateData);

      // Adjust physical inventory document
      if (returnMode === 'stock' || returnMode === 'damaged') {
        for (const item of order.items || []) {
          if (item.markedTertinggal || item.markedRefund) continue;
          const invSnap = invSnapsMap.get(item.bookId);
          if (invSnap && invSnap.exists()) {
            const invRef = doc(db, 'inventory', item.bookId);
            const inv = invSnap.data();
            const currentStock = inv.endingStock || 0;
            const currentReady = inv.readyStock || 0;
            const currentDispatched = inv.totalDispatched || 0;
            const currentShipped = inv.shippedStock || 0;

            let nextEndingStock = currentStock;
            let nextReadyStock = currentReady;
            let nextDispatched = currentDispatched;
            let nextShippedStock = currentShipped;

            if (returnMode === 'stock') {
              if (originalStatus === 'shipped' && targetStatus === 'packed') {
                // Reverting from shipped to packed: keep stock deducted from warehouse, only decrement shippedStock
                nextShippedStock = Math.max(0, currentShipped - item.qty);
              } else {
                // Reverting from packed/shipped/completed to draft/cancelled: add stock back to warehouse
                nextEndingStock = currentStock + item.qty;
                nextReadyStock = currentReady + item.qty;
                nextDispatched = Math.max(0, currentDispatched - item.qty);
                if (originalStatus === 'shipped' || originalStatus === 'returned' || originalStatus === 'completed') {
                  nextShippedStock = Math.max(0, currentShipped - item.qty);
                }
              }
            } else if (returnMode === 'damaged') {
              if (originalStatus === 'shipped' || originalStatus === 'returned' || originalStatus === 'completed') {
                nextShippedStock = Math.max(0, currentShipped - item.qty);
              }
            }

            const nextValue = new Decimal(nextEndingStock).mul(inv.movingAverageCost || 0).toNumber();

            transaction.update(invRef, {
              endingStock: nextEndingStock,
              readyStock: nextReadyStock,
              shippedStock: nextShippedStock,
              totalDispatched: nextDispatched,
              totalInventoryValue: nextValue,
              stockStatus: nextEndingStock > 0 ? 'in_stock' : 'out_of_stock',
              lastUpdated: Timestamp.now()
            });
          }
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * 2. Triggers Goods Receipt & Recalculate Moving Average Cost
 * Matches Section 5.3 Business Logic
 */
export async function receiveGoodsTransaction(
  poId: string, 
  receivedQty: number, 
  status: 'kurang' | 'pas' | 'kelebihan', 
  notes: string, 


  currentUserId: string
): Promise<void> {
  const path = `purchaseOrders/${poId}`;
  try {
    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const poRef = doc(db, 'purchaseOrders', poId);
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists()) {
        throw new Error('Purchase order not found');
      }
      const po = poSnap.data() as PurchaseOrder;

      // Get current book details in inventory
      const invRef = doc(db, 'inventory', po.bookId);
      const invSnap = await transaction.get(invRef);

      // Get supplier details (MUST be read BEFORE doing any write operations)
      const supplierRef = doc(db, 'suppliers', po.supplierId);
      const supplierSnap = await transaction.get(supplierRef);
      
      let initialStock = 0;
      let totalPurchased = 0;
      let totalDispatched = 0;
      let endingStock = 0;
      let readyStock = 0;
      let movingAverageCost = 0;
      let inTransitStock = 0;
      
      if (invSnap.exists()) {
        const data = invSnap.data() as InventoryRecord;
        initialStock = data.initialStock || 0;
        totalPurchased = data.totalPurchased || 0;
        totalDispatched = data.totalDispatched || 0;
        endingStock = data.endingStock || 0;
        readyStock = data.readyStock || 0;
        movingAverageCost = data.movingAverageCost || 0;
        inTransitStock = data.inTransitStock || 0;
      }

      // Recalculate landed cost per unit
      // Landed cost per unit = (PurchasePriceNTD + ProratedForwarderFee) / totalQty
      const forwarderFee = po.forwarderFeeNTD || 0;
      const totalLandedCostCents = new Decimal(po.purchasePriceNTD).plus(forwarderFee).toNumber();
      
      const landedUnitCost = calculateLandedCost(po.purchasePriceNTD, forwarderFee, po.qty);

      // Moving Average: ((currentStock * currentAvg) + (receivedQty * landedUnitCost)) / (currentStock + receivedQty)
      const nextEndingStock = endingStock + receivedQty;
      const nextReadyStock = readyStock + receivedQty;
      const nextMovingAvg = calculateMovingAverageCost(endingStock, movingAverageCost, receivedQty, landedUnitCost);
      const nextValue = new Decimal(nextEndingStock).mul(nextMovingAvg).toNumber();

      const nextTransit = Math.max(0, inTransitStock - receivedQty);

      // Set/Update Inventory Record
      transaction.set(invRef, {
        bookId: po.bookId,
        initialStock,
        totalPurchased: totalPurchased + receivedQty,
        totalDispatched,
        endingStock: nextEndingStock,
        readyStock: nextReadyStock,
        inTransitStock: nextTransit,
        ordersPlaced: (invSnap.exists ? invSnap.data()?.ordersPlaced : 0) || 0,
        ordersShipped: (invSnap.exists ? invSnap.data()?.ordersShipped : 0) || 0,
        movingAverageCost: nextMovingAvg,
        totalInventoryValue: nextValue,
        stockStatus: nextEndingStock > 0 ? 'in_stock' : 'sold_out',
        lastUpdated: Timestamp.now()
      } as InventoryRecord);

      // Append immutable ledger entry
      const ledgerId = doc(collection(db, 'inventoryLedger')).id;
      const ledgerRef = doc(db, 'inventoryLedger', ledgerId);
      transaction.set(ledgerRef, {
        id: ledgerId,
        bookId: po.bookId,
        type: 'purchase_received',
        qtyDelta: receivedQty,
        unitCost: landedUnitCost,
        refCollection: 'purchaseOrders',
        refId: poId,
        balanceAfter: nextEndingStock,
        movingAvgAfter: nextMovingAvg,
        timestamp: Timestamp.now(),
        userId: currentUserId
      } as InventoryLedgerEntry);

      // Update PO status & Receipts list
      const nextReceipts = [...(po.receipts || [])];
      nextReceipts.push({
        receivedDate: Timestamp.now(),
        receivedQty,
        status,
        notes,
        receivedBy: currentUserId
      });

      transaction.update(poRef, {
        status: status === 'pas' ? 'received' : 'partial',
        receipts: nextReceipts,
        updatedAt: Timestamp.now()
      });

      const supplierCurrency = supplierSnap.exists() ? (supplierSnap.data() as Supplier).currency : 'IDR';

      // Cash flow record
      const cashFlowId = doc(collection(db, 'cashFlow')).id;
      const cashFlowRef = doc(db, 'cashFlow', cashFlowId);
      
      const cfAmount = (supplierCurrency === 'IDR') ? po.purchasePriceIDR : po.purchasePriceNTD;
      
      transaction.set(cashFlowRef, {
        id: cashFlowId,
        date: Timestamp.now(),
        ledger: supplierCurrency,
        direction: 'outflow',
        category: 'wholesale_purchase',
        amount: cfAmount,
        amountNTD: po.purchasePriceNTD,
        fxRateUsed: po.exchangeRate,
        refType: 'purchase_order',
        refId: poId,
        description: `Purchase ${po.purchaseCode} - Received ${po.qty} units of ${po.bookName}`,
        createdAt: Timestamp.now()
      } as CashFlowEntry);

      // Double-entry Journal: Dr Inventory | Cr Cash
      // journalId pre-generated outside transaction
    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
      const journalRef = doc(db, 'journalEntries', journalId);
      
      const cashAcc = supplierCurrency === 'IDR' ? AUTO_ACCOUNTS.CASH_RUPIAH : AUTO_ACCOUNTS.CASH_NTD;

      transaction.set(journalRef, {
        id: journalId,
        date: Timestamp.now(),
        description: `Goods Receipt ${po.purchaseCode} - ${po.bookName}`,
        lines: [
          { account: AUTO_ACCOUNTS.INVENTORY.name, debit: po.purchasePriceNTD + forwarderFee, credit: 0 },
          { account: cashAcc.name, debit: 0, credit: po.purchasePriceNTD + forwarderFee }
        ],
        refType: 'purchase_order',
        refId: poId,
        createdAt: Timestamp.now()
      } as JournalEntry);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Reverts a Sales Order status from 'completed' back to 'shipped'
 * Deletes completed journals and completed ledger entries in a single transaction
 */
export async function revertCompletedSalesOrderToShipped(
  orderId: string,
  currentUserId: string
): Promise<void> {
  const path = `salesOrders/${orderId}`;
  try {
    // 1. Fetch closed periods first
    const closingsSnap = await getDocs(collection(db, 'periodClosings'));
    const closedPeriods = closingsSnap.docs
      .filter(doc => doc.data().status === 'Ditutup')
      .map(doc => doc.id);

    const journalSnap = await getDocs(
      query(
        collection(db, 'journalEntries'),
        where('refId', '==', orderId),
        where('refType', '==', 'sales_order_completed')
      )
    );
    const journalDocs = journalSnap.docs;
    const journalRefs = journalDocs.map(doc => doc.ref);

    // 2. Validate against closed periods before proceeding
    for (const jDoc of journalDocs) {
      const jData = jDoc.data();
      if (jData.date && isPeriodClosed(jData.date, closedPeriods)) {
        const periodId = getYearMonth(jData.date);
        throw new Error(`Transaksi diblokir. Periode ${periodId} telah berstatus DITUTUP.`);
      }
    }

    const ledgerSnap = await getDocs(
      query(
        collection(db, 'inventoryLedger'),
        where('refId', '==', orderId)
      )
    );
    const ledgerRefs = ledgerSnap.docs
      .filter(doc => doc.data().type === 'COMPLETED_SALE' || doc.data().type === 'COMPLETED (SALE)')
      .map(doc => doc.ref);

    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db, 'salesOrders', orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new Error('Sales order not found');
      }

      const order = orderSnap.data() as SalesOrder;
      if (order.status !== 'completed') {
        throw new Error('Sales order is not in completed status');
      }

      // Check order's completedAt date against closed periods as well
      if (order.completedAt && isPeriodClosed(order.completedAt, closedPeriods)) {
        const periodId = getYearMonth(order.completedAt);
        throw new Error(`Transaksi diblokir. Periode ${periodId} telah berstatus DITUTUP.`);
      }

      const invSnapsMap = new Map<string, any>();
      for (const item of order.items || []) {
        if (!invSnapsMap.has(item.bookId)) {
          const invRef = doc(db, 'inventory', item.bookId);
          const invSnap = await transaction.get(invRef);
          invSnapsMap.set(item.bookId, invSnap);
        }
      }

      const journalSnaps = [];
      for (const jRef of journalRefs) {
        const jSnap = await transaction.get(jRef);
        journalSnaps.push(jSnap);
      }

      const ledgerSnaps = [];
      for (const lRef of ledgerRefs) {
        const lSnap = await transaction.get(lRef);
        ledgerSnaps.push(lSnap);
      }

      const updateData = {
        status: 'shipped',
        paymentStatus: 'unpaid',
        isUnpaid: false,
        amountPaid: 0,
        completedAt: null,
        updatedAt: Timestamp.now()
      };

      for (const jSnap of journalSnaps) {
        if (jSnap.exists()) {
          transaction.delete(jSnap.ref);
        }
      }

      for (const lSnap of ledgerSnaps) {
        if (lSnap.exists()) {
          transaction.delete(lSnap.ref);
        }
      }

      transaction.update(orderRef, updateData);

      // Increment shippedStock in inventory
      for (const item of order.items || []) {
        const invSnap = invSnapsMap.get(item.bookId);
        if (invSnap && invSnap.exists()) {
          const invRef = doc(db, 'inventory', item.bookId);
          const inv = invSnap.data();
          const currentShipped = inv.shippedStock || 0;
          const nextShippedStock = currentShipped + item.qty;
          transaction.update(invRef, {
            shippedStock: nextShippedStock,
            lastUpdated: Timestamp.now()
          });
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function propagateBookNameChange(bookId: string, newBookName: string): Promise<void> {
  if (!bookId || !newBookName) return;

  try {
    // 1. Update inventory document if it exists
    const invRef = doc(db, 'inventory', bookId);
    const invSnap = await getDoc(invRef);
    if (invSnap.exists()) {
      await updateDoc(invRef, { bookName: newBookName });
    }

    // 2. Update inventoryLedger
    const ledgerSnaps = await getDocs(query(collection(db, 'inventoryLedger'), where('bookId', '==', bookId)));
    for (const d of ledgerSnaps.docs) {
      await updateDoc(doc(db, 'inventoryLedger', d.id), { bookName: newBookName });
    }

    // 3. Update damagedStock
    const damagedSnaps = await getDocs(query(collection(db, 'damagedStock'), where('bookId', '==', bookId)));
    for (const d of damagedSnaps.docs) {
      await updateDoc(doc(db, 'damagedStock', d.id), { bookName: newBookName });
    }

    // 4. Update salesOrders
    const salesSnaps = await getDocs(collection(db, 'salesOrders'));
    for (const d of salesSnaps.docs) {
      const data = d.data();
      if (Array.isArray(data.items) && data.items.some((item: any) => item.bookId === bookId)) {
        const updatedItems = data.items.map((item: any) => {
          if (item.bookId === bookId) {
            return { ...item, bookName: newBookName };
          }
          return item;
        });
        await updateDoc(doc(db, 'salesOrders', d.id), { items: updatedItems });
      }
    }

    // 5. Update purchaseOrders
    const poSnaps = await getDocs(collection(db, 'purchaseOrders'));
    for (const d of poSnaps.docs) {
      const data = d.data();
      if (Array.isArray(data.items) && data.items.some((item: any) => item.bookId === bookId)) {
        const updatedItems = data.items.map((item: any) => {
          if (item.bookId === bookId) {
            return { ...item, bookName: newBookName };
          }
          return item;
        });
        await updateDoc(doc(db, 'purchaseOrders', d.id), { items: updatedItems });
      }
    }
  } catch (error) {
    console.error('Failed to propagate book name change:', error);
  }
}

/**
 * Splits a Sales Order into a Parent SO (ready items kept) and a Child SO (unfulfilled items moved to new draft SO).
 */
export async function splitSalesOrderTransaction(
  parentOrderId: string,
  splitBookIds: string[],
  currentUserId: string
): Promise<{ childOrderId: string; childOrderCode: string }> {
  const path = `salesOrders/${parentOrderId}`;
  try {
    const parentRef = doc(db, 'salesOrders', parentOrderId);
    const parentSnap = await getDoc(parentRef);
    if (!parentSnap.exists()) {
      throw new Error('Sales order not found');
    }

    const parentOrder = parentSnap.data() as SalesOrder;
    if (parentOrder.status !== 'draft' && parentOrder.status !== 'confirmed') {
      throw new Error('Hanya orderan berstatus Draft atau Confirmed yang dapat dikirim sebagian');
    }

    const keptItems = (parentOrder.items || []).filter(item => !splitBookIds.includes(item.bookId));
    const splitItems = (parentOrder.items || []).filter(item => splitBookIds.includes(item.bookId));

    if (keptItems.length === 0) {
      throw new Error('Semua barang terpilih dipindah. Harus ada minimal 1 barang yang tetap dikirim di SO awal');
    }
    if (splitItems.length === 0) {
      throw new Error('Tidak ada barang yang dipindahkan ke SO baru');
    }

    // Calculate subtotal for kept and split items
    const originalSubtotal = parentOrder.subtotal || keptItems.concat(splitItems).reduce((sum, i) => sum + i.lineTotal, 0);
    const keptSubtotal = keptItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const splitSubtotal = splitItems.reduce((sum, item) => sum + item.lineTotal, 0);

    // Pro-rate discount based on subtotal ratio
    const originalDiscount = parentOrder.discount || 0;
    let splitDiscount = 0;
    let keptDiscount = originalDiscount;
    if (originalSubtotal > 0 && originalDiscount > 0) {
      splitDiscount = Math.round(originalDiscount * (splitSubtotal / originalSubtotal));
      keptDiscount = Math.max(0, originalDiscount - splitDiscount);
    }

    const keptTotalPrice = Math.max(0, keptSubtotal - keptDiscount);
    const splitTotalPrice = Math.max(0, splitSubtotal - splitDiscount);

    const updatedParentItems = (parentOrder.items || []).map(item => {
      if (splitBookIds.includes(item.bookId)) {
        return {
          ...item,
          markedTertinggal: true,
          markedRefund: true,
        };
      }
      return item;
    });

    const cleanedSplitItems = splitItems.map(item => {
      const copy = { ...item };
      delete copy.markedTertinggal;
      delete copy.markedRefund;
      return copy;
    });

    // Generate new order code for Child SO
    const childOrderCode = await generateOrderCode('S');
    const childOrderRef = doc(collection(db, 'salesOrders'));
    const childOrderId = childOrderRef.id;

    // Create Child SO object
    const childOrder: SalesOrder = {
      id: childOrderId,
      orderCode: childOrderCode,
      orderDate: parentOrder.orderDate || Timestamp.now(),
      customerName: parentOrder.customerName || '',
      customerPlatformName: parentOrder.customerPlatformName || '',
      platformChannel: parentOrder.platformChannel || '',
      orderType: parentOrder.orderType || '',
      platformOrder: parentOrder.platformOrder || '',
      paymentMethod: parentOrder.paymentMethod || 'Transfer',
      phoneNumber: parentOrder.phoneNumber || '',
      pickupLogistics: parentOrder.pickupLogistics || '',
      pickupDetails: parentOrder.pickupDetails || '',
      items: cleanedSplitItems,
      subtotal: splitSubtotal,
      discount: splitDiscount,
      totalPrice: splitTotalPrice,
      status: 'draft',
      isDraft: true,
      orderNumber: '', // Dikosongkan sesuai instruksi
      buyerType: parentOrder.buyerType,
      partnerId: parentOrder.partnerId,
      partnerName: parentOrder.partnerName,
      komisiMode: parentOrder.komisiMode,
      komisiValue: parentOrder.komisiValue,
      customerNote: parentOrder.customerNote ? `[Order Tertinggal] ${parentOrder.customerNote}` : '[Order Tertinggal]',
      parentOrderId: parentOrderId,
      parentOrderCode: parentOrder.orderCode,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: currentUserId,
    };

    // Remove undefined fields to prevent Firestore WriteBatch errors
    const cleanedChildOrder: Record<string, any> = {};
    for (const [key, val] of Object.entries(childOrder)) {
      if (val !== undefined) {
        cleanedChildOrder[key] = val;
      }
    }

    // Use Firestore batch to set child SO and update parent SO
    const batch = writeBatch(db);
    batch.set(childOrderRef, cleanedChildOrder);

    const updatedChildIds = [...(parentOrder.childOrderIds || []), childOrderId];
    const updatedChildCodes = [...(parentOrder.childOrderCodes || []), childOrderCode];

    batch.update(parentRef, {
      items: updatedParentItems,
      childOrderIds: updatedChildIds,
      childOrderCodes: updatedChildCodes,
      updatedAt: Timestamp.now(),
    });

    await batch.commit();

    return { childOrderId, childOrderCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Processes a Marketplace Refund for missing items in a Sales Order.
 * Debits 5500 Beban Lain-lain (Expense) and Credits 1110 Piutang Usaha (AR).
 */
export async function processMarketplaceRefundTransaction(
  orderId: string,
  currentUserId: string,
  refundNotes?: string
): Promise<void> {
  const path = `salesOrders/${orderId}`;
  try {
    const orderRef = doc(db, 'salesOrders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      throw new Error('Sales order not found');
    }

    const order = orderSnap.data() as SalesOrder;
    if (order.isMarketplaceRefunded) {
      throw new Error('Order ini sudah diproses refund marketplace sebelumnya');
    }

    // Check period closing
    const orderDateObj = order.orderDate?.seconds ? new Date(order.orderDate.seconds * 1000) : new Date();
    const periodYm = getYearMonth(orderDateObj);
    const closedPeriodsSnap = await getDocs(query(collection(db, 'periodClosings'), where('status', '==', 'Ditutup')));
    const closedPeriods = closedPeriodsSnap.docs.map(d => d.id);
    if (isPeriodClosed(periodYm, closedPeriods)) {
      throw new Error(`Periode ${periodYm} telah ditutup. Tidak dapat memproses refund.`);
    }

    // Ensure 5500 Beban Lain-lain and 1110 Piutang Usaha exist
    await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_LAIN_LAIN);
    await ensureAutoAccountExists(AUTO_ACCOUNTS.PIUTANG_USAHA);

    const refundAmount = order.totalPrice || 0;

    if (refundAmount <= 0) {
      throw new Error('Nilai transaksi order adalah 0, tidak ada jurnal refund yang diposting.');
    }

    // Generate Journal Entry

    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    const journalRef = doc(db, 'journalEntries', journalId);

    const journalData: JournalEntry = {
      id: journalId,
      date: Timestamp.now(),
      description: refundNotes || `Refund Marketplace / Barang Kurang SO ${order.orderCode} (${order.customerName || 'Pelanggan'})`,
      refType: 'sales_order_refund',
      refId: orderId,
      lines: [
        {
          account: AUTO_ACCOUNTS.BEBAN_LAIN_LAIN.name,
          accountCode: AUTO_ACCOUNTS.BEBAN_LAIN_LAIN.code,
          debit: refundAmount,
          credit: 0
        },
        {
          account: AUTO_ACCOUNTS.PIUTANG_USAHA.name,
          accountCode: AUTO_ACCOUNTS.PIUTANG_USAHA.code,
          debit: 0,
          credit: refundAmount
        }
      ],
      createdAt: Timestamp.now()
    };

    const batch = writeBatch(db);
    batch.set(journalRef, journalData);

    batch.update(orderRef, {
      status: 'cancelled',
      isMarketplaceRefunded: true,
      refundJournalId: journalId,
      updatedAt: Timestamp.now()
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}



export async function revertDiambilToReturned(orderId: string, currentUserId: string): Promise<void> {
  const path = `salesOrders/${orderId}`;
  try {
    const orderRef = doc(db, 'salesOrders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) throw new Error('Sales order not found');
    const order = orderSnap.data() as SalesOrder;

    if (order.status !== 'cancelled' || !order.diambilAt) {
      throw new Error('Order is not in Diambil (cancelled) state');
    }

    // Find damagedStock
    const damagedSnap = await getDocs(collection(db, 'damagedStock'));
    const damagedDocs = damagedSnap.docs.filter(d => {
      const data = d.data();
      const n = (data.notes || data.note || '');
      return n.includes(`(SO ${order.orderCode || orderId})`);
    });
    const damagedIds = damagedDocs.map(d => d.id);
    const isDamaged = damagedIds.length > 0;

    const journalSnap = await getDocs(collection(db, 'journalEntries'));
    const allJournals = journalSnap.docs;
    
    const ledgerSnap = await getDocs(collection(db, 'inventoryLedger'));
    const allLedgers = ledgerSnap.docs;

    const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    await runTransaction(db, async (transaction) => {
      // 1. Reads
      const invSnapsMap = new Map<string, any>();
      for (const item of order.items || []) {
        if (item.markedTertinggal || item.markedRefund) continue;
        const invRef = doc(db, 'inventory', item.bookId);
        const invSnap = await transaction.get(invRef);
        invSnapsMap.set(item.bookId, invSnap);
      }

      // 2. Delete damaged records if any
      if (isDamaged) {
        for (const dDoc of damagedDocs) {
          transaction.delete(dDoc.ref);
          
          // Delete associated ledger
          const ledger = allLedgers.find(l => l.data().refId === dDoc.id && l.data().refCollection === 'damagedStock');
          if (ledger) transaction.delete(ledger.ref);

          // Delete associated journal
          const journal = allJournals.find(j => j.data().refId === dDoc.id && j.data().refCollection === 'damagedStock');
          if (journal) transaction.delete(journal.ref);
        }
      }

      let totalCOGS = 0;

      // 3. Adjust physical inventory (only if it was 'stock', which means NOT 'damaged')
      // and recreate shipped ledger
      for (const item of order.items || []) {
        if (item.markedTertinggal || item.markedRefund) continue;

        const invSnap = invSnapsMap.get(item.bookId);
        if (invSnap && invSnap.exists()) {
          const invRef = doc(db, 'inventory', item.bookId);
          const inv = invSnap.data() as any;
          const movingCost = inv.movingAverageCost || 0;
          const itemCOGS = new Decimal(movingCost).mul(item.qty).toNumber();
          totalCOGS += itemCOGS;

          let nextEndingStock = inv.endingStock || 0;
          let nextReadyStock = inv.readyStock || 0;
          let nextShippedStock = inv.shippedStock || 0;
          let nextDispatched = inv.totalDispatched || 0;

          if (!isDamaged) {
            // It was returned to stock. `reverseSalesOrderTransaction` added it back.
            // We must deduct it again!
            nextEndingStock -= item.qty;
            nextReadyStock = Math.max(0, nextReadyStock - item.qty);
            nextDispatched += item.qty;
          }
          // In both cases, we must add to shippedStock because it's going back to shipped/returned state
          nextShippedStock += item.qty;

          const nextValue = new Decimal(nextEndingStock).mul(movingCost).toNumber();

          transaction.update(invRef, {
            endingStock: nextEndingStock,
            readyStock: nextReadyStock,
            shippedStock: nextShippedStock,
            totalDispatched: nextDispatched,
            totalInventoryValue: nextValue,
            lastUpdated: Timestamp.now()
          });

          // Create sale_shipped ledger
          const ledgerId = doc(collection(db, 'inventoryLedger')).id;
          transaction.set(doc(db, 'inventoryLedger', ledgerId), {
            id: ledgerId,
            bookId: item.bookId,
            bookName: item.bookName || '',
            date: order.orderDate || Timestamp.now(),
            type: 'DISPATCHED',
            qtyDelta: -item.qty,
            costPerUnitCents: Math.round(movingCost * 100),
            refCollection: 'salesOrders',
            refId: orderId,
            userId: currentUserId
          });
        }
      }

      // 3. Create shipped journal (Dr 1202, Cr 1201)
      if (totalCOGS > 0) {
    
        transaction.set(doc(db, 'journalEntries', journalId), {
          id: journalId,
          date: order.orderDate || Timestamp.now(),
          description: `Barang Dikirim - SO [${order.orderCode || orderId}]`,
          lines: [
            { account: 'Inventory In Delivery', accountCode: '1202', debit: totalCOGS, credit: 0 },
            { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: totalCOGS }
          ],
          refCollection: 'salesOrders',
          refType: 'sales_order_shipped',
          refId: orderId,
          soId: orderId,
          type: 'BARANG_DIKIRIM',
          amount: totalCOGS
        });
      }

      // 4. Update order status
      transaction.update(orderRef, {
        status: 'returned',
        diambilAt: null,
        cancelledAt: null,
        returnedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}
