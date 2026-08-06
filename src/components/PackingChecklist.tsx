import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Copy, Check } from 'lucide-react';
import { SalesOrder, Book } from '../types';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc } from '../lib/use-modal-esc';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface PackingItem {
  id: string;
  name: string;
  qty: number;
  img: string;
}

interface PackingOrder {
  id: string;
  orderNo: string;
  orderDate: string;
  createdAtMs: number;
  sumberOrderan: string;
  resi: string;
  resiPattern: string;
  socialAccount: string;
  platformOrder: string;
  items: PackingItem[];
}

interface PackingGroup {
  date: string;
  orders: PackingOrder[];
}

// Helper to categorize resi into batch keys for exact sorting:
// 1. TW Prefix -> Rank 1 (TW), sorted by creation time (createdAtMs)
// 2. SPX 7-11 -> Rank 2 with batch date (e.g. E_0606)
// 3. FamilyMart (murni angka) -> Rank 2 with batch subkey (E_0606_NUMERIC)
// 4. Hi-Life (6MSC...) -> Rank 2 with batch subkey (E_0606_Z6MSC)
// 5. SPX 7-11 Next Batch -> Rank 2 with batch date (e.g. E_0607)
const getResiSortCategory = (resiStr: string, platformOrderStr?: string) => {
  if (!resiStr || resiStr === '-' || resiStr.trim() === '' || resiStr.trim() === '-') {
    return { rank: 0, batchKey: '000_EMPTY', groupName: 'Tanpa Resi' };
  }

  const cleanResi = resiStr.trim().toUpperCase();
  const cleanPlatform = (platformOrderStr || '').trim().toUpperCase();

  // 1. Shopee TW Prefix -> Rank 1
  if (cleanResi.startsWith('TW')) {
    return { rank: 1, batchKey: 'TW', groupName: 'Shopee' };
  }

  // 2. Explicit FamilyMart platform -> Rank 4
  if (cleanPlatform.includes('FAMILY') || cleanResi.includes('FAMILY')) {
    return { rank: 4, batchKey: 'FAMILY', groupName: 'FamilyMart' };
  }

  // 3. SPX 7-Eleven with Date Batch (e.g. E0606..., E0607...) -> Rank 2
  const spxMatch = cleanResi.match(/^E(\d{4})/);
  if (spxMatch) {
    const batchDate = spxMatch[1]; // e.g. "0606", "0607"
    return { rank: 2, batchKey: `E_${batchDate}`, groupName: '7-Eleven' };
  }

  // 4. Numeric resi (FamilyMart) -> Rank 2, batchKey E_0606_NUMERIC
  if (/^\d+$/.test(cleanResi)) {
    return { rank: 2, batchKey: 'E_0606_NUMERIC', groupName: 'FamilyMart' };
  }

  // 5. Hi-Life (6MSC...) -> Rank 2, batchKey E_0606_Z6MSC
  if (cleanResi.startsWith('6MSC') || (/^\d/.test(cleanResi) && /[A-Z]/.test(cleanResi))) {
    return { rank: 2, batchKey: 'E_0606_Z6MSC', groupName: 'Hi-Life' };
  }

  return { rank: 2, batchKey: `E_ZZZ_${cleanResi.slice(0, 4)}`, groupName: 'Lainnya' };
};

export const PackingChecklist: React.FC<{ onClose: () => void, salesOrders: SalesOrder[], books?: Book[] }> = ({ onClose, salesOrders, books: propBooks }) => {
  const { sidebarHidden } = useSidebar();
  useModalEsc(true, onClose);

  const [catalogBooks, setCatalogBooks] = useState<Book[]>(propBooks || []);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (propBooks && propBooks.length > 0) {
      setCatalogBooks(propBooks);
    }
    const unsub = onSnapshot(collection(db, 'catalog'), (snap) => {
      const list: Book[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Book);
      });
      if (list.length > 0) {
        setCatalogBooks(list);
      }
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    return () => unsub();
  }, [propBooks]);

  const bookMap = useMemo(() => {
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    const byCleanName = new Map<string, string>();

    catalogBooks.forEach(b => {
      const coverUrl = b.cover || (b as any).coverUrl || (b as any).imageUrl || (b as any).photoUrl || (b as any).bookCover || '';
      if (coverUrl) {
        if (b.id) byId.set(b.id, coverUrl);
        if (b.bookName) {
          const raw = b.bookName.trim().toLowerCase();
          byName.set(raw, coverUrl);
          const clean = raw.replace(/[^a-z0-9]/g, '');
          if (clean) byCleanName.set(clean, coverUrl);
        }
      }
    });
    return { byId, byName, byCleanName };
  }, [catalogBooks]);

  const findCoverUrl = (it: { bookId?: string; bookName?: string; bookCover?: string }) => {
    // 1. Check direct ID match if available
    if (it.bookId && bookMap.byId.has(it.bookId)) {
      return bookMap.byId.get(it.bookId)!;
    }

    // 2. Check name matches if bookName present
    if (it.bookName) {
      const rawName = it.bookName.trim().toLowerCase();
      // 2a. Exact trim + lower match
      if (bookMap.byName.has(rawName)) {
        return bookMap.byName.get(rawName)!;
      }

      // 2b. Clean alphanumeric match (stripping spaces, quotes, punctuation)
      const cleanName = rawName.replace(/[^a-z0-9]/g, '');
      if (cleanName && bookMap.byCleanName.has(cleanName)) {
        return bookMap.byCleanName.get(cleanName)!;
      }

      // 2c. Substring match against catalog books
      for (const b of catalogBooks) {
        const coverUrl = b.cover || (b as any).coverUrl || (b as any).imageUrl || (b as any).photoUrl || (b as any).bookCover || '';
        if (!coverUrl) continue;
        const bRaw = (b.bookName || '').trim().toLowerCase();
        const bClean = bRaw.replace(/[^a-z0-9]/g, '');

        if (bClean && cleanName && (cleanName.includes(bClean) || bClean.includes(cleanName))) {
          return coverUrl;
        }
      }
    }

    // 3. Fallback to direct bookCover on the item itself
    if (it.bookCover && it.bookCover.trim() !== '') {
      return it.bookCover.trim();
    }

    return '';
  };

  const data = useMemo(() => {
    // Filter orders with status 'shipped' only
    const toPack = salesOrders.filter(o => o.status === 'shipped');
    
    const grouped = new Map<string, PackingOrder[]>();

    toPack.forEach(order => {
      const shipDateMs = order.shipment?.shippingDate?.seconds 
        ? order.shipment.shippingDate.seconds * 1000 
        : (order.shippedAt?.seconds ? order.shippedAt.seconds * 1000 : (order.packedAt?.seconds ? order.packedAt.seconds * 1000 : 0));
      
      let dateStr = 'Tanpa Tanggal';
      if (shipDateMs) {
        const d = new Date(shipDateMs);
        dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      } else if (order.orderDate?.seconds) {
        const d = new Date(order.orderDate.seconds * 1000);
        dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      }
      
      const orderDateMs = order.orderDate?.seconds ? order.orderDate.seconds * 1000 : 0;
      let orderDateStr = '-';
      if (orderDateMs) {
        const d = new Date(orderDateMs);
        orderDateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      }
      
      // Calculate exact order creation time in ms
      let createdAtMs = 0;
      if (order.createdAt?.seconds) {
        createdAtMs = order.createdAt.seconds * 1000 + Math.floor((order.createdAt.nanoseconds || 0) / 1000000);
      } else if (order.createdAt instanceof Date) {
        createdAtMs = order.createdAt.getTime();
      } else if (typeof order.createdAt === 'string') {
        const parsed = new Date(order.createdAt).getTime();
        if (!isNaN(parsed)) createdAtMs = parsed;
      } else {
        createdAtMs = orderDateMs;
      }

      const resiValue = order.shipment?.shippingNumber || '-';
      const platformOrderVal = order.platformOrder || order.pickupLogistics || '-';
      const category = getResiSortCategory(resiValue, platformOrderVal);

      const pOrder: PackingOrder = {
        id: order.id,
        orderNo: order.orderNumber || order.orderCode,
        orderDate: orderDateStr,
        createdAtMs,
        sumberOrderan: order.platformChannel || '-',
        resi: resiValue,
        resiPattern: category.groupName,
        socialAccount: order.customerPlatformName || order.customerName || '-',
        platformOrder: platformOrderVal,
        items: (order.items || []).map((it, idx) => {
          const liveCover = findCoverUrl(it);

          return {
            id: `${order.id}-${idx}`,
            name: it.bookName,
            qty: it.qty,
            img: liveCover
          };
        })
      };
      
      if (!grouped.has(dateStr)) {
        grouped.set(dateStr, []);
      }
      grouped.get(dateStr)!.push(pOrder);
    });
    
    const result: PackingGroup[] = Array.from(grouped.entries()).map(([date, orders]) => {
      // Sort orders according to user's exact batch logic:
      // 1. TW Prefix -> Rank 1, sorted by order creation timestamp (createdAtMs)
      // 2. Regular SPX Batch (e.g. E0606...), FamilyMart (numeric), Hi-Life (6MSC...), SPX Next Batch (E0607...) -> sorted by batchKey
      orders.sort((a, b) => {
        const catA = getResiSortCategory(a.resi, a.platformOrder);
        const catB = getResiSortCategory(b.resi, b.platformOrder);

        // Primary Rank: "-" (0) < TW (1) < Batch SPX / Numeric / 6MSC (2) < Explicit Family (4)
        if (catA.rank !== catB.rank) {
          return catA.rank - catB.rank;
        }

        // For TW (Rank 1): sort by creation time (createdAtMs) ascending
        if (catA.rank === 1) {
          if (a.createdAtMs !== b.createdAtMs) {
            return a.createdAtMs - b.createdAtMs;
          }
          return a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true });
        }

        // For Batch (Rank 2): compare batch keys (e.g. E_0606 < E_0606_NUMERIC < E_0606_Z6MSC < E_0607)
        if (catA.batchKey !== catB.batchKey) {
          return catA.batchKey.localeCompare(catB.batchKey, undefined, { numeric: true, sensitivity: 'base' });
        }

        // Within same batch: sort resi alphanumeric ascending
        const resiCompare = a.resi.localeCompare(b.resi, undefined, { numeric: true, sensitivity: 'base' });
        if (resiCompare !== 0) return resiCompare;

        if (a.createdAtMs !== b.createdAtMs) {
          return a.createdAtMs - b.createdAtMs;
        }

        return a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true });
      });
      return { date, orders };
    });
    
    // Sort dates ascending so '<' goes to older dates and '>' goes to newer dates
    result.sort((a, b) => a.date.localeCompare(b.date));
    
    return result;
  }, [salesOrders]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const defaultIndex = useMemo(() => {
    if (data.length === 0) return 0;
    const idx = data.findIndex(g => g.date === todayStr);
    if (idx >= 0) return idx;
    // Default to newest available date
    return data.length - 1;
  }, [data, todayStr]);

  const [currentIndex, setCurrentIndex] = useState(defaultIndex);
  const [packedItems, setPackedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCurrentIndex(defaultIndex);
  }, [defaultIndex]);

  const currentGroup = data[currentIndex];

  const totalOrders = currentGroup ? currentGroup.orders.length : 0;
  const totalItems = currentGroup ? currentGroup.orders.reduce((acc, o) => acc + o.items.length, 0) : 0;
  const packedItemsCount = currentGroup ? currentGroup.orders.reduce((acc, o) => acc + o.items.filter(i => packedItems.has(i.id)).length, 0) : 0;

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < data.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const toggleItem = (itemId: string, checked: boolean) => {
    const newSet = new Set(packedItems);
    if (checked) newSet.add(itemId);
    else newSet.delete(itemId);
    setPackedItems(newSet);
  };

  const toggleOrder = (order: PackingOrder, checked: boolean) => {
    const newSet = new Set(packedItems);
    order.items.forEach(i => {
      if (checked) newSet.add(i.id);
      else newSet.delete(i.id);
    });
    setPackedItems(newSet);
  };

  const BookIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]">
      <path d="M4 4.5C4 3.67 4.67 3 5.5 3H12V21H5.5C4.67 21 4 20.33 4 19.5V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M20 4.5C20 3.67 19.33 3 18.5 3H12V21H18.5C19.33 21 20 20.33 20 19.5V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    /* kbi-fullpage, not kbi-modal-backdrop: this is a full-screen page with its
       own background, not a card on a scrim. It only needs the sidebar gutter
       dropped and the safe areas honoured on a phone. */
    <div className={`kbi-fullpage fixed top-0 bottom-0 right-0 ${
      sidebarHidden ? 'left-16' : 'left-16 sm:left-56'
    } transition-all duration-300 ease-in-out z-40 bg-[#f4f8fd] dark:bg-neutral-950 overflow-y-auto font-text flex flex-col text-[#1f2937] dark:text-neutral-100 p-3 sm:p-5 lg:p-6`}>
      <div className="max-w-[1550px] w-full mx-auto p-3 sm:p-5 flex-1 flex flex-col">
        
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button onClick={onClose} className="kbi-fullpage__close p-2 -ml-2 rounded-lg hover:bg-neutral-200/50 text-[#1d3f70] transition cursor-pointer" aria-label="Tutup">
                <X className="w-5 h-5" />
              </button>
              <h1 className="font-text text-[26px] font-bold text-[#1d3f70] m-0">Checklist Packing</h1>
            </div>
            <p className="m-0 text-[#67707d] text-sm font-text ml-10">KangenBukuIndo — daftar pesanan yang perlu dikemas</p>
          </div>
          
          <div className="flex gap-2.5">
            <div className="bg-white border border-[#dde6f4] rounded-full px-4 py-2 text-[13px] text-[#1d3f70] font-semibold font-text whitespace-nowrap shadow-xs">
              {totalOrders} <span className="text-[#67707d] font-normal font-text ml-1">pesanan</span>
            </div>
            <div className="bg-white border border-[#dde6f4] rounded-full px-4 py-2 text-[13px] text-[#1d3f70] font-semibold font-text whitespace-nowrap shadow-xs">
              {totalItems} <span className="text-[#67707d] font-normal font-text ml-1">item</span>
            </div>
          </div>
        </header>

        {/* Card */}
        <div className="bg-white rounded-[12px] border border-[#dde6f4] overflow-hidden shadow-xs flex flex-col flex-1">
          
          {/* Date Navigator */}
          <div className="bg-[#2b5a9e] text-white p-3.5 flex items-center justify-between gap-2.5">
            <button 
              onClick={handlePrev} 
              disabled={currentIndex <= 0}
              title="Tanggal Mundur (<)"
              className="w-[38px] h-[38px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center gap-[3px]">
              <span className="font-text font-semibold text-[17px] tracking-wide">{currentGroup ? currentGroup.date : '—'}</span>
              <span className="text-[11.5px] font-medium bg-white/15 px-2.5 py-[3px] rounded-full font-text tracking-wide">
                ({packedItemsCount}/{totalItems} Dikirim)
              </span>
            </div>
            <button 
              onClick={handleNext} 
              disabled={currentIndex >= data.length - 1}
              title="Tanggal Maju (>)"
              className="w-[38px] h-[38px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto flex-1">
            {!currentGroup || currentGroup.orders.length === 0 ? (
              <div className="p-10 text-center text-[#67707d] text-sm">Tidak ada pesanan berstatus Dikirim untuk tanggal ini.</div>
            ) : (
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Tanggal Order</th>
                    <th className="text-left font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Sumber Orderan *</th>
                    <th className="text-left font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Nama Platform *</th>
                    <th className="text-left font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Nomor Order</th>
                    <th className="text-left font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Nomor Resi</th>
                    <th className="text-left font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Platform Order</th>
                    <th className="text-left font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Nama Barang</th>
                    <th className="text-center font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">QTY</th>
                    <th className="text-center font-text text-[11px] tracking-[0.6px] uppercase text-[#1d3f70] bg-[#eaf1fb] px-3.5 py-2.5 border-b border-[#dde6f4] whitespace-nowrap">Checklist Box</th>
                  </tr>
                </thead>
                <tbody>
                  {currentGroup.orders.map((order) => {
                    const rowSpan = order.items.length;
                    const consolidate = rowSpan > 1;
                    const allPacked = order.items.every(i => packedItems.has(i.id));

                    return order.items.map((item, itemIdx) => {
                      const isPacked = packedItems.has(item.id);
                      const trClass = isPacked ? "bg-[#f7f8fa] italic text-[#a3aebb] line-through" : "";
                      
                      return (
                        <tr key={`${order.id}-${item.id}`} className={`border-b border-[#dde6f4] last:border-b-0 ${trClass}`}>
                          {itemIdx === 0 && (
                            <>
                              <td rowSpan={rowSpan} className={`px-3.5 py-3 text-[13.5px] font-medium whitespace-nowrap font-numeric border-l-[3px] border-r border-r-[#dde6f4] ${allPacked ? 'border-l-[#a3aebb]' : 'border-l-[#2b5a9e] text-[#67707d]'}`}>
                                {order.orderDate}
                              </td>
                              <td rowSpan={rowSpan} className={`px-3.5 py-3 text-[13.5px] font-semibold whitespace-nowrap border-r border-[#dde6f4] ${allPacked ? 'text-[#a3aebb]' : 'text-[#2b5a9e]'}`}>
                                {order.sumberOrderan}
                              </td>
                              <td rowSpan={rowSpan} className={`px-3.5 py-3 text-[13.5px] font-medium whitespace-nowrap border-r border-[#dde6f4] ${allPacked ? 'text-[#a3aebb]' : 'text-[#1d3f70]'}`}>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(order.socialAccount, `platform-${order.id}`)}
                                    className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-700 transition cursor-pointer shrink-0"
                                    title="Salin Nama Platform"
                                  >
                                    {copiedId === `platform-${order.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                  <span>{order.socialAccount}</span>
                                </div>
                              </td>
                              <td rowSpan={rowSpan} className="px-3.5 py-3 text-[13.5px] font-semibold whitespace-nowrap font-numeric text-[#1d3f70] border-r border-[#dde6f4]">
                                {order.orderNo}
                              </td>
                              <td rowSpan={rowSpan} className="px-3.5 py-3 text-[13.5px] font-medium whitespace-nowrap font-numeric text-[#67707d] border-r border-[#dde6f4]">
                                {order.resi}
                              </td>
                              <td rowSpan={rowSpan} className={`px-3.5 py-3 text-[13.5px] font-medium whitespace-nowrap border-r border-[#dde6f4] ${allPacked ? 'text-[#a3aebb]' : 'text-[#1f2937]'}`}>
                                {order.platformOrder}
                              </td>
                            </>
                          )}
                          
                          <td className="px-3.5 py-3 min-w-[260px] border-r border-[#dde6f4]">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-[38px] h-[38px] shrink-0 rounded-[7px] bg-[#eaf1fb] flex items-center justify-center text-[#2b5a9e] overflow-hidden transition-opacity ${isPacked ? 'opacity-35' : ''}`}>
                                {item.img && !imgErrors[item.id] ? (
                                  <img 
                                    src={item.img} 
                                    alt="" 
                                    className="w-full h-full object-cover" 
                                    referrerPolicy="no-referrer"
                                    onError={() => setImgErrors(prev => ({ ...prev, [item.id]: true }))}
                                  />
                                ) : (
                                  <BookIcon />
                                )}
                              </div>
                              <div className={`text-[13.5px] leading-snug ${isPacked ? 'text-[#a3aebb]' : 'text-[#1f2937]'}`}>
                                {item.name}
                              </div>
                            </div>
                          </td>
                          
                          <td className={`px-3.5 py-3 text-center font-semibold font-numeric whitespace-nowrap border-r border-[#dde6f4] ${isPacked ? 'text-[#a3aebb]' : 'text-[#1f2937]'}`}>
                            {item.qty} pcs
                          </td>

                          {/* Checkbox */}
                          {!consolidate && (
                            <td className="px-3.5 py-3 text-center w-[110px]">
                              <input 
                                type="checkbox" 
                                checked={isPacked}
                                onChange={(e) => toggleItem(item.id, e.target.checked)}
                                className="appearance-none w-5 h-5 border-2 border-[#2b5a9e] rounded-[6px] cursor-pointer checked:bg-[#2b5a9e] checked:border-[#2b5a9e] relative align-middle transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d3f70]
                                after:content-[''] after:absolute after:hidden checked:after:block after:left-[5px] after:top-[1px] after:w-[5px] after:h-[2.5px] after:border-solid after:border-white after:border-r-2 after:border-b-2 after:rotate-45 after:pb-[8px] after:pr-[2px]"
                              />
                            </td>
                          )}

                          {consolidate && itemIdx === 0 && (
                            <td rowSpan={rowSpan} className="px-3.5 py-3 text-center w-[110px]">
                              <input 
                                type="checkbox" 
                                checked={allPacked}
                                onChange={(e) => toggleOrder(order, e.target.checked)}
                                className="appearance-none w-5 h-5 border-2 border-[#2b5a9e] rounded-[6px] cursor-pointer checked:bg-[#2b5a9e] checked:border-[#2b5a9e] relative align-middle transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d3f70]
                                after:content-[''] after:absolute after:hidden checked:after:block after:left-[5px] after:top-[1px] after:w-[5px] after:h-[2.5px] after:border-solid after:border-white after:border-r-2 after:border-b-2 after:rotate-45 after:pb-[8px] after:pr-[2px]"
                              />
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
