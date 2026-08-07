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

// ---------------------------------------------------------------------------
// Implementasi CEPAT - hasilnya wajib identik dengan yang legacy di atas.
// Dijaga oleh scripts/verify-perpetual-parity.cjs (semua buku x semua bulan).
//
// Idenya: versi legacy memindai ulang seluruh koleksi untuk SETIAP buku. Di sini
// semua pemindaian itu dilakukan SEKALI di buildPerpetualIndex, hasilnya disimpan
// di Map, lalu tiap buku cuma melakukan fold atas event miliknya sendiri.
// ---------------------------------------------------------------------------

type PEvent =
  | { type: 'purchase_received'; timeMs: number; qtyDelta: number; cost: number }
  | { type: 'freight_capitalized'; timeMs: number; freightAllocatedCents: number }
  | { type: 'outflow'; timeMs: number; qtyDelta: number };

const ORDER: Record<PEvent['type'], number> = {
  purchase_received: 1,
  freight_capitalized: 2,
  outflow: 3,
};

export interface PerpetualIndex {
  initialStockByBook: Map<string, number>;
  /** Sudah terurut (waktu asc, lalu tipe) - fold tinggal jalan. */
  eventsByBook: Map<string, PEvent[]>;
  /** Agregat bulanan untuk buildReportRows, kunci `bookId|YYYY-MM`. */
  stokMasukByBookMonth: Map<string, number>;
  stokKeluarByBookMonth: Map<string, number>;
  rusakByBookMonth: Map<string, number>;
}

const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
  const a = m.get(k);
  if (a) a.push(v); else m.set(k, [v]);
};
const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);

/** `YYYY-MM` dari nilai tanggal apa pun, atau null kalau tidak bisa diparse. */
function monthKeyOf(ts: any): string | null {
  if (!ts) return null;
  const d = parseEventDate(ts);
  const t = d.getTime();
  if (isNaN(t)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildPerpetualIndex(data: PerpetualData, nowMs: number = Date.now()): PerpetualIndex {
  const { inventoryList, ledgerEntries, purchaseOrders, salesOrders, journals, freightIn, damagedRecords } = data;

  // -- saldo awal ---------------------------------------------------------
  // legacy memakai .find (kecocokan PERTAMA), jadi jangan menimpa kalau sudah ada.
  const initialStockByBook = new Map<string, number>();
  for (const inv of inventoryList) {
    if (inv.bookId !== undefined && !initialStockByBook.has(inv.bookId)) {
      initialStockByBook.set(inv.bookId, inv.initialStock || 0);
    }
  }

  // -- indeks PO ----------------------------------------------------------
  const poById = new Map<string, any>();
  for (const p of purchaseOrders) if (!poById.has(p.id)) poById.set(p.id, p);
  const validPoIds = new Set(purchaseOrders.map((p) => p.id));

  // Biaya per unit hasil alokasi diskon, dihitung sekali per (po, buku).
  const netUnitCostCache = new Map<string, number | null>();
  function netUnitCostFor(po: any, bookId: string): number | null {
    const k = `${po.id}|${bookId}`;
    const hit = netUnitCostCache.get(k);
    if (hit !== undefined) return hit;
    let val: number | null;
    if (po.items && po.items.length > 0) {
      const poItem = po.items.find((it: any) => it.bookId === bookId);
      if (poItem) {
        const discount = po.discount || 0;
        const totalQtyOrdered = po.items.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
        const diskon_per_buku = discount * ((poItem.qty || 0) / totalQtyOrdered);
        const netItemPriceNTDTotal = (poItem.priceNTDTotal || 0) - diskon_per_buku;
        val = poItem.qty > 0 ? (netItemPriceNTDTotal / poItem.qty) : (poItem.pricePerItem || 0);
      } else {
        val = null; // legacy jatuh ke entry.unitCost
      }
    } else {
      val = po.qty > 0 ? (po.purchasePriceNTD / po.qty) : (po.pricePerUnitNTD || 0);
    }
    netUnitCostCache.set(k, val);
    return val;
  }

  // -- freight: kode mana yang sudah dikapitalisasi -----------------------
  // legacy memanggil journals.some() per (buku x freight); di sini satu lintasan.
  const capitalizedCodes = new Set<string>();
  for (const f of freightIn) {
    const c = f.freightCode?.toUpperCase().trim();
    if (c && f.isCapitalized) capitalizedCodes.add(c);
  }
  for (const j of journals) {
    if (!(j.description || '').toUpperCase().includes('KAPITALISASI')) continue;
    const a = j.freightCode?.toUpperCase();
    const b = j.refId?.toUpperCase();
    if (a) capitalizedCodes.add(a.trim());
    if (b) capitalizedCodes.add(b.trim());
  }
  // legacy membandingkan j.freightCode?.toUpperCase() === cleanFCode TANPA trim di
  // sisi jurnal, jadi simpan juga varian tanpa-trim supaya cocok persis.
  for (const j of journals) {
    if (!(j.description || '').toUpperCase().includes('KAPITALISASI')) continue;
    if (j.freightCode?.toUpperCase()) capitalizedCodes.add(j.freightCode.toUpperCase());
    if (j.refId?.toUpperCase()) capitalizedCodes.add(j.refId.toUpperCase());
  }

  const journalById = new Map<string, any>();
  for (const j of journals) if (!journalById.has(j.id)) journalById.set(j.id, j);

  // total qty seluruh buku per kode freight - legacy menghitung ulang ini di dalam
  // loop per-buku, padahal nilainya global.
  const freightTotalQtyByCode = new Map<string, number>();
  for (const p of purchaseOrders) {
    if (p.receipts && p.receipts.length > 0) {
      for (const rx of p.receipts) {
        const c = rx.kodeEkspedisi?.toUpperCase().trim();
        if (c) bump(freightTotalQtyByCode, c, rx.receivedQty || 0);
      }
    } else if (p.kodeEkspedisi) {
      const c = p.kodeEkspedisi.toUpperCase().trim();
      bump(freightTotalQtyByCode, c, p.qtyReceived || p.qty || 0);
    }
  }

  const eventsByBook = new Map<string, PEvent[]>();

  // -- 1. penerimaan PO dari ledger ---------------------------------------
  for (const e of ledgerEntries) {
    if (e.type !== 'purchase_received' || e.reversed === true || !e.bookId) continue;
    let cost = 0;
    if (e.unitCost !== undefined && e.unitCost !== null && e.unitCost > 0) {
      cost = (e.qtyDelta || 0) * e.unitCost;
    } else {
      const po = poById.get(e.refId);
      if (po) {
        const nuc = netUnitCostFor(po, e.bookId);
        cost = (e.qtyDelta || 0) * (nuc === null ? (e.unitCost || 0) : nuc);
      } else {
        cost = (e.qtyDelta || 0) * (e.unitCost || 0);
      }
    }
    push(eventsByBook, e.bookId, {
      type: 'purchase_received', timeMs: parseEventDate(e.timestamp).getTime(),
      qtyDelta: e.qtyDelta || 0, cost,
    });
  }

  // -- 2. kapitalisasi freight --------------------------------------------
  // legacy: freightIn -> (bookPos milik buku) -> receipts. Dibalik jadi satu
  // lintasan PO -> receipts -> receivedQtyDetails yang memancarkan (buku, kode, qty).
  for (const fRec of freightIn) {
    if (!fRec.freightCode) continue;
    const fCode = fRec.freightCode.toUpperCase().trim();
    if (!capitalizedCodes.has(fCode)) continue;

    const totalQty = freightTotalQtyByCode.get(fCode) || 0;
    if (totalQty <= 0) continue;

    const totalFreightNTDCents = fRec.totalHargaPengirimanNTD
      ? Math.round(fRec.totalHargaPengirimanNTD * 100)
      : Math.round((fRec.totalKg || 0) * (fRec.ratePerKg || 0) * (fRec.exchangeRate || FALLBACK_NTD_PER_IDR) * 100);

    const timeMs = parseEventDate(getCapitalizationTimestamp(fRec, journals, nowMs)).getTime();

    for (const po of purchaseOrders) {
      if (po.status === 'cancelled') continue;
      if (!po.receipts || po.receipts.length === 0) continue;
      for (const r of po.receipts) {
        if (!r.kodeEkspedisi || r.kodeEkspedisi.toUpperCase().trim() !== fCode) continue;
        if (r.receivedQtyDetails) {
          for (const d of r.receivedQtyDetails) {
            const qty = d.qty || 0;
            if (qty <= 0 || !d.bookId) continue;
            // legacy hanya memproses PO yang lolos filter bookPos untuk buku ini
            const inPo = po.bookId === d.bookId || (po.items && po.items.some((it: any) => it.bookId === d.bookId));
            if (!inPo) continue;
            push(eventsByBook, d.bookId, {
              type: 'freight_capitalized', timeMs,
              freightAllocatedCents: Math.round((qty / totalQty) * totalFreightNTDCents),
            });
          }
        } else if (po.bookId) {
          const qty = r.receivedQty || 0;
          if (qty <= 0) continue;
          push(eventsByBook, po.bookId, {
            type: 'freight_capitalized', timeMs,
            freightAllocatedCents: Math.round((qty / totalQty) * totalFreightNTDCents),
          });
        }
      }
    }
  }

  // -- 3. keluar: penjualan completed + barang rusak ----------------------
  // legacy: journals.filter(...) per buku, lalu .find per SO. Di sini satu Map.
  const completedCogsJournalBySo = new Map<string, any>();
  for (const j of journals) {
    if (j.refType !== 'sales_order_completed') continue;
    if (!(j.lines || []).some((l: any) => (l.accountCode || '').trim() === '1202')) continue;
    if (!completedCogsJournalBySo.has(j.refId)) completedCogsJournalBySo.set(j.refId, j);
  }
  // dispatch per (buku, SO) - legacy mem-filter ledger per buku lalu .find per SO
  const dispatchByBookSo = new Map<string, any>();
  const dispatchMonthByBookSo = new Map<string, string | null>();
  for (const e of ledgerEntries) {
    if (e.type !== 'DISPATCHED' || e.reversed === true || !e.bookId) continue;
    const k = `${e.bookId}|${e.refId}`;
    if (!dispatchByBookSo.has(k)) {
      dispatchByBookSo.set(k, e);
      dispatchMonthByBookSo.set(k, monthKeyOf(e.timestamp));
    }
  }

  const stokKeluarByBookMonth = new Map<string, number>();

  for (const so of salesOrders) {
    if (so.status !== 'completed' || !Array.isArray(so.items)) continue;
    const completedJournal = completedCogsJournalBySo.get(so.id);

    // legacy memakai items.find(...) - buku yang sama muncul dua kali di satu SO
    // hanya dihitung sekali, jadi de-duplikasi di sini juga.
    const seen = new Set<string>();
    for (const it of so.items) {
      if (!it.bookId || seen.has(it.bookId)) continue;
      seen.add(it.bookId);
      const first = so.items.find((x: any) => x.bookId === it.bookId);
      const qty = first?.qty || 0;

      const k = `${it.bookId}|${so.id}`;
      const dispatchEntry = dispatchByBookSo.get(k);
      const ts = completedJournal ? completedJournal.date
        : (dispatchEntry ? dispatchEntry.timestamp : (so.orderDate || so.createdAt));

      push(eventsByBook, it.bookId, {
        type: 'outflow', timeMs: parseEventDate(ts).getTime(), qtyDelta: qty,
      });

      // agregat bulanan stokKeluar - urutan resolusinya harus sama persis dengan legacy
      let month: string | null;
      if (completedJournal) {
        month = monthKeyOf(completedJournal.date);
      } else if (dispatchEntry) {
        month = dispatchMonthByBookSo.get(k) ?? null;
      } else {
        month = monthKeyOf(so.orderDate || so.createdAt);
      }
      if (month) bump(stokKeluarByBookMonth, `${it.bookId}|${month}`, qty);
    }
  }

  for (const e of ledgerEntries) {
    if (e.type !== 'damaged_stock' || e.reversed === true || !e.bookId) continue;
    push(eventsByBook, e.bookId, {
      type: 'outflow', timeMs: parseEventDate(e.timestamp).getTime(),
      qtyDelta: Math.abs(e.qtyDelta || 0),
    });
  }

  // -- urutkan sekali per buku --------------------------------------------
  for (const evs of eventsByBook.values()) {
    evs.sort((a, b) => (a.timeMs !== b.timeMs ? a.timeMs - b.timeMs : ORDER[a.type] - ORDER[b.type]));
  }

  // -- agregat bulanan sisanya --------------------------------------------
  const stokMasukByBookMonth = new Map<string, number>();
  for (const e of ledgerEntries) {
    if (e.type !== 'purchase_received' || !e.bookId || !validPoIds.has(e.refId)) continue;
    const m = monthKeyOf(e.timestamp);
    if (m) bump(stokMasukByBookMonth, `${e.bookId}|${m}`, e.qtyDelta || 0);
  }

  const rusakByBookMonth = new Map<string, number>();
  for (const rec of damagedRecords) {
    if (!rec.bookId || !rec.date) continue;
    bump(rusakByBookMonth, `${rec.bookId}|${String(rec.date).slice(0, 7)}`, rec.qty || 0);
  }

  return { initialStockByBook, eventsByBook, stokMasukByBookMonth, stokKeluarByBookMonth, rusakByBookMonth };
}

/** Fold sekali jalan, mengambil snapshot di dua cutoff sekaligus. */
export function computePerpetualStates(
  index: PerpetualIndex,
  bookId: string,
  prevMonthStr: string,
  currMonthStr: string,
): { prev: PerpetualState; curr: PerpetualState } {
  const cut = (mStr: string) => {
    const [y, m] = mStr.split('-').map(Number);
    return new Date(y, m, 1).getTime(); // awal bulan berikutnya, eksklusif
  };
  const prevCut = cut(prevMonthStr);
  const currCut = cut(currMonthStr);

  const initialStock = index.initialStockByBook.get(bookId) || 0;
  let runningStock = initialStock;
  let runningValueCents = 0; // legacy: initialCost selalu 0
  let currentAverageCost = 0;

  let prev: PerpetualState | null = null;
  const events = index.eventsByBook.get(bookId);

  if (events) {
    for (const ev of events) {
      // legacy melakukan replay terpisah per cutoff dan BREAK di event pertama yang
      // >= cutoff. Karena event sudah urut, ambil snapshot saat melewati batas.
      if (prev === null && ev.timeMs >= prevCut) {
        prev = { runningStock, runningValueCents, currentAverageCost };
      }
      if (ev.timeMs >= currCut) break;

      if (ev.type === 'purchase_received') {
        runningStock += ev.qtyDelta;
        runningValueCents += ev.cost;
        currentAverageCost = runningStock > 0 ? runningValueCents / runningStock : 0;
      } else if (ev.type === 'freight_capitalized') {
        runningValueCents += ev.freightAllocatedCents;
        currentAverageCost = runningStock > 0 ? runningValueCents / runningStock : 0;
      } else {
        const hppCents = ev.qtyDelta * currentAverageCost;
        runningStock = Math.max(0, runningStock - ev.qtyDelta);
        runningValueCents = Math.max(0, runningValueCents - hppCents);
      }
    }
  }

  if (prev === null) prev = { runningStock, runningValueCents, currentAverageCost };
  return { prev, curr: { runningStock, runningValueCents, currentAverageCost } };
}

export function buildReportRows(
  index: PerpetualIndex,
  books: any[],
  selectedMonth: string,
): ReportRow[] {
  const [y, m] = selectedMonth.split('-').map(Number);
  const prevMonthStr = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;

  return books.map((book) => {
    const { prev, curr } = computePerpetualStates(index, book.id, prevMonthStr, selectedMonth);
    const k = `${book.id}|${selectedMonth}`;
    return {
      book,
      hargaRataRata: curr.currentAverageCost,
      stokAwal: prev.runningStock,
      stokMasuk: index.stokMasukByBookMonth.get(k) || 0,
      stokKeluar: index.stokKeluarByBookMonth.get(k) || 0,
      rusak: index.rusakByBookMonth.get(k) || 0,
      stokAkhir: curr.runningStock,
      totalNilaiStok: curr.runningValueCents,
      minStock: book.minOrder || 0,
    };
  });
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
