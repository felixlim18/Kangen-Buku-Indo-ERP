export const getPhysicalOnHandStockForBook = (
  bookId: string,
  inventoryList: any[],
  ledgerEntries: any[],
  purchaseOrders: any[],
  salesOrders: any[],
  damagedRecords: any[] = []
): number => {
  const bookInventory = inventoryList.find((i) => i.bookId === bookId);
  const initialStock = bookInventory ? (bookInventory.initialStock || 0) : 0;

  const validPoIds = new Set(purchaseOrders.map((p) => p.id));

  // 1. Total PO received
  let totalReceived = 0;
  for (let i = 0; i < ledgerEntries.length; i++) {
    const e = ledgerEntries[i];
    if (e.bookId === bookId && e.type === 'purchase_received' && validPoIds.has(e.refId) && e.reversed !== true) {
      totalReceived += e.qtyDelta || 0;
    }
  }

  // 2. Total packed, shipped or completed SOs (and returned SOs where item is not yet taken back)
  let totalShipped = 0;
  for (let i = 0; i < salesOrders.length; i++) {
    const so = salesOrders[i];
    if (so.status === 'packed' || so.status === 'shipped' || so.status === 'confirmed' || so.status === 'completed' || (so.status === 'returned' && !so.diambilAt)) {
      if (Array.isArray(so.items)) {
        for (let j = 0; j < so.items.length; j++) {
          const item = so.items[j];
          if (item.bookId === bookId && !item.markedTertinggal && !item.markedRefund) {
            totalShipped += item.qty || 0;
          }
        }
      }
    }
  }

  // 3. Damaged records & stock adjustments
  let totalDamaged = 0;
  for (let i = 0; i < damagedRecords.length; i++) {
    const rec = damagedRecords[i];
    if (rec.bookId === bookId) {
      if (rec.adjustmentType === 'Barang Lebih' || rec.type === 'surplus') {
        totalDamaged -= rec.qty || 0;
      } else {
        totalDamaged += rec.qty || 0;
      }
    }
  }

  return initialStock + totalReceived - totalShipped - totalDamaged;
};

const extractMonth = (ts: any): string => {
  if (!ts) return '';
  if (ts.toDate) {
    const d = ts.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof ts === 'string') return ts.substring(0, 7);
  if (typeof ts === 'object' && ts.seconds) {
    const d = new Date(ts.seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (ts instanceof Date) {
    return `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
};

export const getCurrentKontrolStokForBook = (
  bookId: string,
  inventoryList: any[],
  ledgerEntries: any[],
  purchaseOrders: any[],
  salesOrders: any[],
  damagedRecords: any[] = []
) => {
  const today = new Date();
  const currentMonthString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const bookInventory = inventoryList.find((i) => i.bookId === bookId);
  const initialStock = bookInventory ? (bookInventory.initialStock || 0) : 0;

  const validPoIds = new Set(purchaseOrders.map((p) => p.id));

  // STOK MASUK
  let stokMasuk = 0;
  for (let i = 0; i < ledgerEntries.length; i++) {
    const e = ledgerEntries[i];
    if (e.bookId === bookId && e.type === 'purchase_received' && validPoIds.has(e.refId) && e.reversed !== true) {
      const m = extractMonth(e.timestamp);
      if (!m || m <= currentMonthString) {
        stokMasuk += e.qtyDelta || 0;
      }
    }
  }

  // STOK KELUAR
  let stokKeluar = 0;
  for (let i = 0; i < salesOrders.length; i++) {
    const so = salesOrders[i];
    if (so.status === 'cancelled' || so.status === 'returned' || so.isDraft) continue;
    const m = extractMonth(so.orderDate || so.createdAt);
    if (!m || m <= currentMonthString) {
      if (Array.isArray(so.items)) {
        for (let j = 0; j < so.items.length; j++) {
          const item = so.items[j];
          if (item.bookId === bookId && !item.markedTertinggal && !item.markedRefund) {
            stokKeluar += item.qty || 0;
          }
        }
      }
    }
  }

  // RUSAK & PENYESUAIAN
  let rusak = 0;
  for (let i = 0; i < damagedRecords.length; i++) {
    const rec = damagedRecords[i];
    if (rec.bookId === bookId) {
      const recDate = rec.date ? rec.date.substring(0, 7) : '';
      if (!recDate || recDate <= currentMonthString) {
        if (rec.adjustmentType === 'Barang Lebih' || rec.type === 'surplus') {
          rusak -= rec.qty || 0;
        } else {
          rusak += rec.qty || 0;
        }
      }
    }
  }

  const stokAkhir = initialStock + stokMasuk - stokKeluar - rusak;

  // Pending PO Qty
  let pendingPoQty = 0;
  if (purchaseOrders && Array.isArray(purchaseOrders)) {
    for (let i = 0; i < purchaseOrders.length; i++) {
      const po = purchaseOrders[i];
      if (po.status === 'pending' || po.status === 'partial') {
        if (Array.isArray(po.items)) {
          for (let j = 0; j < po.items.length; j++) {
            const item = po.items[j];
            if (item.bookId === bookId && !item.isCancelled) {
              const qty = item.qty || 0;
              const qtyReceived = item.qtyReceived || 0;
              pendingPoQty += Math.max(0, qty - qtyReceived);
            }
          }
        } else if (po.bookId === bookId) {
          const qty = po.qty || 0;
          const qtyReceived = po.qtyReceived || 0;
          pendingPoQty += Math.max(0, qty - qtyReceived);
        }
      }
    }
  }

  return stokAkhir + pendingPoQty;
};

export const getAllBooksStockData = (
  books: any[],
  inventoryList: any[],
  ledgerEntries: any[],
  purchaseOrders: any[],
  salesOrders: any[],
  damagedRecords: any[] = []
) => {
  const today = new Date();
  const currentMonthString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const validPoIds = new Set((purchaseOrders || []).map((p) => p.id));

  const initialStockMap: Record<string, number> = {};
  for (const inv of inventoryList || []) {
    if (inv.bookId) {
      initialStockMap[inv.bookId] = inv.initialStock || 0;
    }
  }

  const totalReceivedMap: Record<string, number> = {};
  const stokMasukMonthMap: Record<string, number> = {};

  for (const e of ledgerEntries || []) {
    if (e.bookId && e.type === 'purchase_received' && validPoIds.has(e.refId) && e.reversed !== true) {
      const qty = e.qtyDelta || 0;
      totalReceivedMap[e.bookId] = (totalReceivedMap[e.bookId] || 0) + qty;

      const m = extractMonth(e.timestamp);
      if (!m || m <= currentMonthString) {
        stokMasukMonthMap[e.bookId] = (stokMasukMonthMap[e.bookId] || 0) + qty;
      }
    }
  }

  const totalShippedMap: Record<string, number> = {};
  const stokKeluarMonthMap: Record<string, number> = {};
  const stokDiorderMap: Record<string, number> = {};
  const stokDikemasMap: Record<string, number> = {};
  const stokDikirimMap: Record<string, number> = {};

  for (const so of salesOrders || []) {
    if (!Array.isArray(so.items)) continue;

    // Draft orders (stok diorder / pending)
    if (so.status === 'draft' || !so.status) {
      for (const item of so.items) {
        if (item.bookId && !item.markedTertinggal && !item.markedRefund) {
          stokDiorderMap[item.bookId] = (stokDiorderMap[item.bookId] || 0) + (item.qty || 0);
        }
      }
    }

    // Packed orders (stok dikemas)
    if (so.status === 'packed') {
      for (const item of so.items) {
        if (item.bookId && !item.markedTertinggal && !item.markedRefund) {
          stokDikemasMap[item.bookId] = (stokDikemasMap[item.bookId] || 0) + (item.qty || 0);
        }
      }
    }

    // Shipped or confirmed orders (stok dikirim)
    if (so.status === 'shipped' || so.status === 'confirmed') {
      for (const item of so.items) {
        if (item.bookId && !item.markedTertinggal && !item.markedRefund) {
          stokDikirimMap[item.bookId] = (stokDikirimMap[item.bookId] || 0) + (item.qty || 0);
        }
      }
    }

    // Physical stock deducted from warehouse (packed, shipped, confirmed, completed, or returned not yet taken back)
    if (so.status === 'packed' || so.status === 'shipped' || so.status === 'confirmed' || so.status === 'completed' || (so.status === 'returned' && !so.diambilAt)) {
      for (const item of so.items) {
        if (item.bookId && !item.markedTertinggal && !item.markedRefund) {
          totalShippedMap[item.bookId] = (totalShippedMap[item.bookId] || 0) + (item.qty || 0);
        }
      }
    }

    // Active orders for control stock
    if (so.status !== 'cancelled' && so.status !== 'returned' && !so.isDraft) {
      const m = extractMonth(so.orderDate || so.createdAt);
      if (!m || m <= currentMonthString) {
        for (const item of so.items) {
          if (item.bookId && !item.markedTertinggal && !item.markedRefund) {
            stokKeluarMonthMap[item.bookId] = (stokKeluarMonthMap[item.bookId] || 0) + (item.qty || 0);
          }
        }
      }
    }
  }

  const totalDamagedMap: Record<string, number> = {};
  const rusakMonthMap: Record<string, number> = {};

  for (const rec of damagedRecords || []) {
    if (rec.bookId) {
      const isSurplus = rec.adjustmentType === 'Barang Lebih' || rec.type === 'surplus';
      const qty = isSurplus ? -(rec.qty || 0) : (rec.qty || 0);
      totalDamagedMap[rec.bookId] = (totalDamagedMap[rec.bookId] || 0) + qty;

      const recDate = rec.date ? rec.date.substring(0, 7) : '';
      if (!recDate || recDate <= currentMonthString) {
        rusakMonthMap[rec.bookId] = (rusakMonthMap[rec.bookId] || 0) + qty;
      }
    }
  }

  const pendingPoQtyMap: Record<string, number> = {};
  for (const po of purchaseOrders || []) {
    if (po.status === 'pending' || po.status === 'partial') {
      if (Array.isArray(po.items)) {
        for (const item of po.items) {
          if (item.bookId && !item.isCancelled) {
            const qty = item.qty || 0;
            const qtyReceived = item.qtyReceived || 0;
            const rem = Math.max(0, qty - qtyReceived);
            pendingPoQtyMap[item.bookId] = (pendingPoQtyMap[item.bookId] || 0) + rem;
          }
        }
      } else if (po.bookId) {
        const qty = po.qty || 0;
        const qtyReceived = po.qtyReceived || 0;
        const rem = Math.max(0, qty - qtyReceived);
        pendingPoQtyMap[po.bookId] = (pendingPoQtyMap[po.bookId] || 0) + rem;
      }
    }
  }

  return (books || []).map((book) => {
    const bId = book.id;
    const initial = initialStockMap[bId] || 0;

    const stokDigudang = initial + (totalReceivedMap[bId] || 0) - (totalShippedMap[bId] || 0) - (totalDamagedMap[bId] || 0);
    const stokAkhir = initial + (stokMasukMonthMap[bId] || 0) - (stokKeluarMonthMap[bId] || 0) - (rusakMonthMap[bId] || 0);
    const stok = stokAkhir + (pendingPoQtyMap[bId] || 0);

    const stokDikirim = stokDikirimMap[bId] || 0;
    const stokDiorder = stokDiorderMap[bId] || 0;
    const minStok = book.minOrder || 0;

    let status = 'aman';
    if (stok < 0) status = 'minus';
    else if (stok === 0) status = 'habis';
    else if (stok <= minStok) status = 'menipis';

    return { ...book, stok, stokDigudang, stokDalamPerjalanan: pendingPoQtyMap[bId] || 0, stokDikirim, stokDikemas: stokDikemasMap[bId] || 0, stokDiorder, minStok, status };
  });
};
