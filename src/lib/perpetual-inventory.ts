// Mesin perhitungan persediaan perpetual, diekstrak dari InventoryTab.tsx.
//
// Modul ini SENGAJA nol import dari 'firebase/firestore' supaya bisa di-require
// dari skrip Node (firebase-admin) di scripts/verify-perpetual-parity.cjs. Itulah
// yang memungkinkan gate parity membandingkan kode LAMA vs kode BARU secara
// langsung, bukan membandingkan angka baru dengan angka lama yang diingat-ingat.
//
// Fungsi berawalan `legacy` adalah salinan apa adanya dari implementasi yang
// sudah berjalan di produksi. JANGAN "dirapikan" - satu-satunya gunanya adalah
// jadi acuan kebenaran. Termasuk perilaku yang secara teknis keliru: mis. ledger
// bertipe 'stock_surplus' (ditulis oleh penyesuaian "Barang Lebih") tidak
// diperlakukan sebagai inflow di sini, sehingga penyesuaian surplus menggerakkan
// Kontrol Stok tapi tidak Laporan Bulanan. Itu bug nyata, tapi memperbaikinya
// adalah perubahan terpisah yang butuh verifikasi sendiri - parity berarti
// "identik dengan hari ini", bukan "benar".

import { FALLBACK_NTD_PER_IDR } from './exchangeRateConstants';

/** Semua koleksi yang dibutuhkan mesin ini, dalam bentuk polos (tanpa tipe SDK). */
export interface PerpetualData {
  inventoryList: any[];
  ledgerEntries: any[];
  purchaseOrders: any[];
  salesOrders: any[];
  journals: any[];
  freightIn: any[];
  damagedRecords: any[];
  books?: any[];
}

export interface PerpetualState {
  runningStock: number;
  runningValueCents: number;
  currentAverageCost: number;
}

export interface ReportRow {
  book: any;
  hargaRataRata: number;
  stokAwal: number;
  stokMasuk: number;
  stokKeluar: number;
  rusak: number;
  stokAkhir: number;
  totalNilaiStok: number;
  minStock: number;
}

// ---------------------------------------------------------------------------
// Helper tanggal - menangani Timestamp Firestore, {seconds}, dan nilai mentah.
// Penanganan defensif ini ada karena field tanggal di koleksi-koleksi ini
// tipenya memang campur (lihat catatan di src/lib/query-bounds.ts).
// ---------------------------------------------------------------------------

export const parseEventDate = (timestamp: any): Date => {
  if (!timestamp) return new Date(0);
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
};

export const isTimestampInMonth = (timestamp: any, monthStr: string): boolean => {
  if (!timestamp) return false;
  let date: Date;
  if (timestamp && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp && typeof timestamp.seconds === 'number') {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return false;

  const [year, month] = monthStr.split('-').map(Number);
  return date.getFullYear() === year && (date.getMonth() + 1) === month;
};

export const getBookQtyInReceipt = (po: any, r: any, bookId: string): number => {
  if (!r.receivedQtyDetails) {
    const poBookId = po.bookId || '';
    if (poBookId === bookId) {
      return r.receivedQty || 0;
    }
    return 0;
  }
  const detail = r.receivedQtyDetails.find((d: any) => d.bookId === bookId);
  return detail ? detail.qty || 0 : 0;
};

/**
 * `nowMs` disuntikkan (bukan Timestamp.now()) supaya modul ini bebas dari SDK
 * Firestore dan supaya skrip parity bisa menyamakan "sekarang" di kedua sisi.
 */
export const getCapitalizationTimestamp = (fRec: any, journalsList: any[], nowMs: number) => {
  if (fRec.capitalizationJournalId) {
    const j = journalsList.find((x) => x.id === fRec.capitalizationJournalId);
    if (j && j.date) return j.date;
  }
  return fRec.createdAt || { seconds: Math.floor(nowMs / 1000) };
};

// ---------------------------------------------------------------------------
// Implementasi LAMA - acuan kebenaran untuk gate parity. Jangan diubah.
// ---------------------------------------------------------------------------

export function legacyCalculatePerpetualInventoryState(
  bookId: string,
  data: PerpetualData,
  upToMonthStr?: string,
  nowMs: number = Date.now(),
): PerpetualState {
  const { inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn } = data;

  const bookInventory = inventoryList.find((i) => i.bookId === bookId);
  const initialStock = bookInventory ? (bookInventory.initialStock || 0) : 0;
  const initialCost = 0; // MUST be calculated from actual journals, not cache

  let runningStock = initialStock;
  let runningValueCents = initialStock * initialCost;
  let currentAverageCost = initialCost;

  let endOfMonth: Date | null = null;
  if (upToMonthStr) {
    const [year, month] = upToMonthStr.split('-').map(Number);
    endOfMonth = new Date(year, month, 1); // Next month start, exclusive
  }

  // 1. PO Receipts (Barang Masuk) - from actual inventory ledger, not cached PO receipts
  const poReceiptEvents = ledgerEntries
    .filter((e) => e.bookId === bookId && e.type === 'purchase_received' && e.reversed !== true)
    .map((entry) => {
      let cost = 0;
      if (entry.unitCost !== undefined && entry.unitCost !== null && entry.unitCost > 0) {
        cost = (entry.qtyDelta || 0) * entry.unitCost;
      } else {
        const po = purchaseOrders.find((p) => p.id === entry.refId);
        if (po) {
          if (po.items && po.items.length > 0) {
            const poItem = po.items.find((it: any) => it.bookId === bookId);
            if (poItem) {
              const discount = po.discount || 0;
              const totalQtyOrdered = po.items.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
              const diskon_per_buku = discount * ((poItem.qty || 0) / totalQtyOrdered);
              const netItemPriceNTDTotal = (poItem.priceNTDTotal || 0) - diskon_per_buku;
              const netUnitCost = poItem.qty > 0 ? (netItemPriceNTDTotal / poItem.qty) : (poItem.pricePerItem || 0);
              cost = (entry.qtyDelta || 0) * netUnitCost;
            } else {
              cost = (entry.qtyDelta || 0) * (entry.unitCost || 0);
            }
          } else {
            // Legacy PO: po.purchasePriceNTD is already net!
            const netUnitCost = po.qty > 0 ? (po.purchasePriceNTD / po.qty) : (po.pricePerUnitNTD || 0);
            cost = (entry.qtyDelta || 0) * netUnitCost;
          }
        } else {
          cost = (entry.qtyDelta || 0) * (entry.unitCost || 0);
        }
      }
      return {
        type: 'purchase_received',
        timestamp: entry.timestamp,
        qtyDelta: entry.qtyDelta || 0,
        cost: cost,
        refId: entry.refId,
        id: entry.id,
      };
    });

  // 2. Freight Capitalization (Freight Dikapitalisasi)
  const bookPos = purchaseOrders.filter((p) =>
    p.status !== 'cancelled' &&
    p.receipts && p.receipts.length > 0 &&
    (p.bookId === bookId || (p.items && p.items.some((it: any) => it.bookId === bookId)))
  );

  const isFreightCodeCapitalized = (fCode: string): boolean => {
    const cleanFCode = fCode.toUpperCase().trim();
    const fRecord = freightIn.find((f) => f.freightCode?.toUpperCase().trim() === cleanFCode);
    if (fRecord && fRecord.isCapitalized) return true;
    return journals.some((j) =>
      (j.freightCode?.toUpperCase() === cleanFCode || j.refId?.toUpperCase() === cleanFCode) &&
      (j.description || '').toUpperCase().includes('KAPITALISASI')
    );
  };

  const freightCapitalizationEvents: any[] = [];
  freightIn.forEach((fRec) => {
    if (!fRec.freightCode) return;
    if (!isFreightCodeCapitalized(fRec.freightCode)) return;

    const fCode = fRec.freightCode.toUpperCase().trim();

    // Total received qty for all books under this freight code
    let totalQtyReceivedInFreight = 0;
    purchaseOrders.forEach((p) => {
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
    bookPos.forEach((po) => {
      po.receipts.forEach((r: any) => {
        if (r.kodeEkspedisi && r.kodeEkspedisi.toUpperCase().trim() === fCode) {
          const qtyReceived = getBookQtyInReceipt(po, r, bookId);
          if (qtyReceived > 0) {
            const freightAllocatedCents = Math.round((qtyReceived / totalQtyReceivedInFreight) * totalFreightNTDCents);
            const timestamp = getCapitalizationTimestamp(fRec, journals, nowMs);

            freightCapitalizationEvents.push({
              type: 'freight_capitalized',
              timestamp: timestamp,
              freightCode: fRec.freightCode,
              freightAllocatedCents: freightAllocatedCents,
            });
          }
        }
      });
    });
  });

  // 3. Outflows (Sales and Damaged Stock)
  const activeSalesOrders = salesOrders.filter((so) => {
    if (so.status !== 'completed') return false;
    return so.items && so.items.some((it: any) => it.bookId === bookId);
  });

  // Value only actually leaves the 1201+1202 pool when the sale is confirmed 'completed' (Dr HPP
  // / Cr 1202) - dispatch (Dr 1202 / Cr 1201) is just an internal transfer that keeps the combined
  // balance unchanged. Use that completed-journal date as the outflow timestamp so the value
  // reduction lands in the same month the journal actually posted it. Falls back to the dispatch
  // ledger timestamp, then orderDate/createdAt, if no completed COGS journal exists yet (legacy data).
  const dispatchedLedgerEntries = ledgerEntries.filter((e) => e.bookId === bookId && e.type === 'DISPATCHED' && e.reversed !== true);
  const completedCogsJournals = journals.filter((j) => j.refType === 'sales_order_completed' && (j.lines || []).some((l: any) => (l.accountCode || '').trim() === '1202'));

  const salesOutflows = activeSalesOrders.map((so) => {
    const item = so.items.find((it: any) => it.bookId === bookId);
    const qty = item?.qty || 0;
    const completedJournal = completedCogsJournals.find((j) => j.refId === so.id);
    const dispatchEntry = dispatchedLedgerEntries.find((e) => e.refId === so.id);
    return {
      type: 'outflow',
      timestamp: completedJournal ? completedJournal.date : (dispatchEntry ? dispatchEntry.timestamp : (so.orderDate || so.createdAt)),
      qtyDelta: qty,
      refId: so.id,
      id: so.id,
    };
  });

  const damagedOutflows = ledgerEntries
    .filter((e) => e.bookId === bookId && e.reversed !== true && e.type === 'damaged_stock')
    .map((entry) => ({
      type: 'outflow',
      timestamp: entry.timestamp,
      qtyDelta: Math.abs(entry.qtyDelta || 0),
      refId: entry.refId,
      id: entry.id,
    }));

  const outflowEvents = [...salesOutflows, ...damagedOutflows];

  // Combine and sort chronologically
  const allEvents = [...poReceiptEvents, ...freightCapitalizationEvents, ...outflowEvents];

  allEvents.sort((a, b) => {
    const dateA = parseEventDate(a.timestamp).getTime();
    const dateB = parseEventDate(b.timestamp).getTime();
    if (dateA !== dateB) return dateA - dateB;

    const getOrder = (type: string) => {
      if (type === 'purchase_received') return 1;
      if (type === 'freight_capitalized') return 2;
      return 3; // outflow
    };
    return getOrder(a.type) - getOrder(b.type);
  });

  // Process one by one
  for (const event of allEvents) {
    if (endOfMonth && parseEventDate(event.timestamp) >= endOfMonth) {
      break;
    }

    if (event.type === 'purchase_received') {
      runningStock += (event as any).qtyDelta;
      runningValueCents += (event as any).cost;
      if (runningStock > 0) {
        currentAverageCost = runningValueCents / runningStock;
      } else {
        currentAverageCost = 0;
      }
    } else if (event.type === 'freight_capitalized') {
      runningValueCents += (event as any).freightAllocatedCents;
      if (runningStock > 0) {
        currentAverageCost = runningValueCents / runningStock;
      } else {
        currentAverageCost = 0;
      }
    } else if (event.type === 'outflow') {
      const hppCents = (event as any).qtyDelta * currentAverageCost;
      runningStock = Math.max(0, runningStock - (event as any).qtyDelta);
      runningValueCents = Math.max(0, runningValueCents - hppCents);
    }
  }

  return {
    runningStock,
    runningValueCents,
    currentAverageCost,
  };
}

export function legacyBuildReportRows(
  data: PerpetualData,
  selectedMonth: string,
  nowMs: number = Date.now(),
): ReportRow[] {
  const { books = [], ledgerEntries, purchaseOrders, salesOrders, journals, damagedRecords } = data;

  return books.map((book) => {
    // Get previous month string
    const [y, m] = selectedMonth.split('-').map(Number);
    let prevMonthStr = '';
    if (m === 1) {
      prevMonthStr = `${y - 1}-12`;
    } else {
      prevMonthStr = `${y}-${String(m - 1).padStart(2, '0')}`;
    }

    const stateAtPrevMonth = legacyCalculatePerpetualInventoryState(book.id, data, prevMonthStr, nowMs);
    const stateAtSelectedMonth = legacyCalculatePerpetualInventoryState(book.id, data, selectedMonth, nowMs);

    const stokAwal = stateAtPrevMonth.runningStock;
    const stokAkhir = stateAtSelectedMonth.runningStock;
    const totalNilaiStok = stateAtSelectedMonth.runningValueCents;
    const hargaRataRata = stateAtSelectedMonth.currentAverageCost;

    // Monthly activities
    const currentMonthEntries = ledgerEntries.filter((e) => e.bookId === book.id && isTimestampInMonth(e.timestamp, selectedMonth));
    const stokMasuk = currentMonthEntries
      .filter((e) => e.type === 'purchase_received' && purchaseOrders.some((p) => p.id === e.refId))
      .reduce((acc, cur) => acc + (cur.qtyDelta || 0), 0);

    const dispatchedThisMonth = currentMonthEntries.filter((e) => e.type === 'DISPATCHED');
    const stokKeluar = salesOrders
      .filter((so) => {
        if (so.status !== 'completed') return false;
        const completedJournal = journals.find((j) => j.refType === 'sales_order_completed' && j.refId === so.id && (j.lines || []).some((l: any) => (l.accountCode || '').trim() === '1202'));
        if (completedJournal) return isTimestampInMonth(completedJournal.date, selectedMonth);
        const dispatchEntry = dispatchedThisMonth.find((e) => e.refId === so.id);
        if (dispatchEntry) return true;
        const hasAnyDispatchEntry = ledgerEntries.some((e) => e.bookId === book.id && e.type === 'DISPATCHED' && e.refId === so.id);
        if (hasAnyDispatchEntry) return false; // dispatched, but in a different month
        const ts = so.orderDate || so.createdAt; // legacy fallback: no dispatch ledger entry at all
        return ts && isTimestampInMonth(ts, selectedMonth);
      })
      .reduce((acc, so) => {
        const item = so.items?.find((i: any) => i.bookId === book.id);
        return acc + (item?.qty || 0);
      }, 0);

    const rusak = damagedRecords
      .filter((rec) => rec.bookId === book.id && rec.date && rec.date.startsWith(selectedMonth))
      .reduce((acc, cur) => acc + (cur.qty || 0), 0);

    return {
      book,
      hargaRataRata,
      stokAwal,
      stokMasuk,
      stokKeluar,
      rusak,
      stokAkhir,
      totalNilaiStok,
      minStock: book.minOrder || 0,
    };
  });
}
