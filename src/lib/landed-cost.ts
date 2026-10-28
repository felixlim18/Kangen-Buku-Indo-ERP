// Rumus HPP moving average (landed cost) tanpa akses Firestore, supaya bisa dipakai
// browser (db-helpers.ts) dan Cloud Function (src/server/shipAgent.ts) dengan hasil yang sama.
import { FALLBACK_NTD_PER_IDR } from './exchangeRateConstants';

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

      const capTimestamp = fRec.capitalizationJournalId
        ? (allJournals.find(x => x.id === fRec.capitalizationJournalId)?.date?.seconds ||
           allJournals.find(x => x.id === fRec.capitalizationJournalId)?.date?.toDate?.()?.getTime() / 1000)
        : null;
      const timestamp = capTimestamp || fRec.createdAt?.seconds || fRec.createdAt?.toDate?.()?.getTime() / 1000 || 0;

      // Jurnal kapitalisasi baru menyimpan pembagian per buku; hanya bagian yang masuk persediaan (1201) yang ikut
      // rata-rata. Sama dengan buildPerpetualIndex.
      const capJournal = fRec.capitalizationJournalId ? allJournals.find(x => x.id === fRec.capitalizationJournalId) : null;
      if (capJournal && Array.isArray(capJournal.freightAllocations)) {
        const a = capJournal.freightAllocations.find((x: any) => x.bookId === bookId);
        if (a?.inventoryCents) {
          freightCapitalizationEvents.push({ type: 'freight_capitalized', timestamp, freightCode: fRec.freightCode, freightAllocatedCents: a.inventoryCents, refId: fRec.freightCode });
        }
        return;
      }

      const pushFreight = (qtyReceived: number) => {
        if (qtyReceived <= 0) return;
        freightCapitalizationEvents.push({
          type: 'freight_capitalized',
          timestamp,
          freightCode: fRec.freightCode,
          freightAllocatedCents: Math.round((qtyReceived / totalQtyReceivedInFreight) * totalFreightNTDCents),
          refId: fRec.freightCode
        });
      };

      // Now find each receipt batch of our book under this freight
      bookPos.forEach(po => {
        po.receipts.forEach((r: any) => {
          if (r.kodeEkspedisi && r.kodeEkspedisi.toUpperCase().trim() === fCode) {
            pushFreight(getBookQtyInReceipt(po, r, bookId));
          }
        });
      });

      // Bentuk legacy: kode ekspedisi di LEVEL PO tanpa array `receipts`. Penyebut
      // di atas sudah menghitung bentuk ini, jadi pembilangnya harus ikut - kalau
      // tidak, freight-nya masuk buku besar tapi tidak pernah membebani buku mana
      // pun. Sama seperti perbaikan di src/lib/perpetual-inventory.ts.
      allPos.forEach(po => {
        if (po.status === 'cancelled') return;
        if (po.receipts && po.receipts.length > 0) return;
        if (!po.kodeEkspedisi || po.kodeEkspedisi.toUpperCase().trim() !== fCode) return;
        if (po.items && po.items.length > 0) {
          po.items.forEach((it: any) => {
            if (it.bookId === bookId) pushFreight(it.qtyReceived || it.qty || 0);
          });
        } else if (po.bookId === bookId) {
          pushFreight(po.qtyReceived || po.qty || 0);
        }
      });
    });
  }

  // Barang keluar dari rata-rata SAAT DIKIRIM, sebesar HPP yang dikunci di ledger DISPATCHED (= cogsSnapshot =
  // nominal jurnal pengiriman). Dulu baru keluar saat SO selesai dan dinilai ulang dengan rata-rata berjalan,
  // sehingga buku yang sudah dikirim tapi SO-nya belum selesai ikut dirata-rata untuk pengiriman berikutnya
  // (Seni Merayu Tuhan #S260813002: HPP 119,15 padahal harga belinya 107,60).
  const outflowEvents: any[] = [];
  if (allLedgers) {
    const tsOf = (e: any) => e.timestamp?.seconds || e.timestamp?.toDate?.()?.getTime() / 1000 || e.timestamp || 0;
    const dispatchedSoIds = new Set(
      allLedgers.filter(e => e.bookId === bookId && e.reversed !== true && e.type === 'DISPATCHED').map(e => e.refId)
    );
    allLedgers.forEach(e => {
      if (e.bookId !== bookId) return;
      if (e.reversed === true) return;

      if (e.type === 'DISPATCHED') {
        const qty = Math.abs(e.qtyDelta || 0);
        outflowEvents.push({
          type: 'outflow',
          timestamp: tsOf(e),
          qtyDelta: qty,
          costCents: e.unitCost !== undefined && e.unitCost !== null ? qty * e.unitCost : null,
          refId: e.refId,
          id: e.id
        });
        return;
      }

      // Data lama tanpa ledger DISPATCHED: keluar saat selesai, dinilai dengan rata-rata berjalan
      const isSale = e.type === 'COMPLETED_SALE' || e.type === 'COMPLETED (SALE)' || e.type === 'sale_shipped';
      if (isSale && !dispatchedSoIds.has(e.refId)) {
        const so = allSalesOrders?.find(s => s.id === e.refId);
        if (so && (so.status === 'completed' || so.status === 'Selesai')) {
          outflowEvents.push({
            type: 'outflow',
            timestamp: tsOf(e),
            qtyDelta: Math.abs(e.qtyDelta || 0),
            costCents: null,
            refId: e.refId,
            id: e.id
          });
        }
      } else if (e.type === 'damaged_stock') {
        outflowEvents.push({
          type: 'outflow',
          timestamp: tsOf(e),
          qtyDelta: Math.abs(e.qtyDelta || 0),
          costCents: null,
          refId: e.refId,
          id: e.id
        });
      }
    });
  }

  // Koreksi nilai tanpa qty (jurnal inventory_value_adjustment) - sama dengan buildPerpetualIndex
  const valueAdjustmentEvents: any[] = [];
  allJournals.forEach(j => {
    if (j.refType !== 'inventory_value_adjustment' || !Array.isArray(j.bookValueAdjustments)) return;
    const a = j.bookValueAdjustments.find((x: any) => x.bookId === bookId);
    if (a?.valueCents) valueAdjustmentEvents.push({ type: 'value_adjustment', timestamp: j.date, valueCents: a.valueCents });
  });

  const allEvents = [...poReceiptEvents, ...freightCapitalizationEvents, ...outflowEvents, ...valueAdjustmentEvents];

  allEvents.sort((a, b) => {
    const timeA = getEventTime(a.timestamp);
    const timeB = getEventTime(b.timestamp);
    if (timeA !== timeB) return timeA - timeB;

    const getOrder = (type: string) => {
      if (type === 'purchase_received') return 1;
      if (type === 'freight_capitalized') return 2;
      if (type === 'value_adjustment') return 4;
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
    else if (event.type === 'value_adjustment') {
      runningValueCents += event.valueCents;
      currentAverageCost = runningStock > 0 ? runningValueCents / runningStock : 0;
    }
    else if (event.type === 'outflow') {
      const hppCents = event.costCents ?? event.qtyDelta * currentAverageCost;
      runningStock = Math.max(0, runningStock - event.qtyDelta);
      runningValueCents = Math.max(0, runningValueCents - hppCents);
    }
  }

  return currentAverageCost;
}
