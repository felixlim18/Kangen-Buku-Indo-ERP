import React, { useState } from 'react';
import { Drawer } from 'vaul';
import {
  X,
  Copy,
  Check,
  PackageCheck,
  Package,
  Calendar,
  Truck,
  CreditCard,
  Pencil,
  RotateCcw,
  Ban,
  Clock,
  BookOpen,
  FileText,
  AlertCircle,
  Layers
} from 'lucide-react';
import { formatNTD, formatIDR, formatNumber } from '../../lib/decimal-utils';

export interface PurchaseDetailDrawerProps {
  po: any | null;
  isOpen: boolean;
  onClose: () => void;
  books?: any[];
  platform?: { id: string; name: string; currency?: string };
  isStaffValue: boolean;
  canViewAmount: boolean;
  onEditPO?: (po: any) => void;
  onReceivePO?: (po: any) => void;
  onRevertStatus?: (po: any) => void;
  onClosePO?: (po: any) => void;
}

export const PurchaseDetailDrawer: React.FC<PurchaseDetailDrawerProps> = React.memo(({
  po,
  isOpen,
  onClose,
  books = [],
  platform,
  isStaffValue,
  canViewAmount,
  onEditPO,
  onReceivePO,
  onRevertStatus,
  onClosePO,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  if (!isOpen || !po) return null;

  const platformName = platform?.name || po.supplierName || 'Platform Belanja';
  const currency = platform?.currency || (po.purchasePriceIDR > 0 ? 'IDR' : (po.purchasePriceUSD > 0 ? 'USD' : 'NTD'));

  const itemsToRender = po.items && po.items.length > 0 ? po.items : [{
    bookId: po.bookId,
    bookName: po.bookName,
    qty: po.qty,
    pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
    priceNTDTotal: po.purchasePriceNTD,
    pricePerItem: po.pricePerUnitNTD,
  }];

  const orderQty = itemsToRender.reduce((acc: number, it: any) => acc + (it.qty || 1), 0);
  
  let totalReceivedQty = 0;
  itemsToRender.forEach((it: any) => {
    if (it.isCancelled) return;
    if (po.status === 'received') {
      totalReceivedQty += (it.qtyReceived !== undefined ? it.qtyReceived : (it.qty || 1));
    } else {
      totalReceivedQty += (it.qtyReceived || 0);
    }
  });

  const progressPercent = Math.min(100, Math.max(0, (totalReceivedQty / (orderQty || 1)) * 100));

  const formatDetailDate = (dt: any) => {
    if (!dt) return '—';
    let dateObj: Date | null = null;
    if (dt && typeof dt.toDate === 'function') {
      dateObj = dt.toDate();
    } else if (dt && dt.seconds !== undefined) {
      dateObj = new Date(dt.seconds * 1000);
    } else if (dt instanceof Date) {
      dateObj = dt;
    } else if (typeof dt === 'string' || typeof dt === 'number') {
      dateObj = new Date(dt);
    }
    if (!dateObj || isNaN(dateObj.getTime())) return '—';
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
  };

  const handleCopy = async (text: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch (err) {
      console.error('Gagal menyalin text:', err);
    }
  };

  const poDisplayCode = po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '') || po.id;

  const totalIDR = itemsToRender.reduce((sum: number, item: any) => sum + (item.pricePlatformTotal || 0), 0);
  const totalNTD = itemsToRender.reduce((sum: number, item: any) => sum + (item.priceNTDTotal || 0), 0);
  const totalUSD = itemsToRender.reduce((sum: number, item: any) => sum + (item.pricePlatformTotal || 0), 0);

  const discountAmount = po.discount || 0;
  const grandTotalIDR = Math.max(0, totalIDR - discountAmount);
  const grandTotalNTD = Math.max(0, totalNTD - discountAmount);
  const grandTotalUSD = Math.max(0, totalUSD - discountAmount);

  // Status badge config
  let pillBg = 'bg-[#F8EFD9] text-[#A6791E] border-[#A6791E]/20 dark:bg-amber-955/30 dark:text-amber-300';
  let pillLabel = 'Menunggu';

  if (po.status === 'received') {
    pillBg = 'bg-[#E9F0E9] text-[#4C6B4F] border-[#4C6B4F]/20 dark:bg-emerald-955/30 dark:text-emerald-300';
    pillLabel = 'Diterima';
  } else if (po.status === 'partial') {
    pillBg = 'bg-[#E8EDF3] text-[#48607F] border-[#48607F]/20 dark:bg-slate-955/30 dark:text-slate-300';
    pillLabel = 'Sebagian';
  } else if (po.status === 'cancelled') {
    pillBg = 'bg-[#F5E5DF] text-[#A34A32] border-[#A34A32]/20 dark:bg-rose-955/30 dark:text-rose-300';
    pillLabel = 'Cancel';
  }

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay 
          className="fixed inset-0 bg-black/60 z-[9999] backdrop-blur-[2px]" 
          onClick={(e) => e.stopPropagation()}
        />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[10000] bg-white dark:bg-neutral-900 rounded-t-[24px] max-h-[94dvh] flex flex-col border-t border-[#E7E1D2] dark:border-neutral-800 outline-none font-['Lexend']"
          data-vaul-no-drag
        >
          {/* Grab Handle */}
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-3 mb-2 cursor-grab active:cursor-grabbing" />

          {/* Sticky Top Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#6B1F3D]/10 text-[#6B1F3D] dark:bg-[#6B1F3D]/25 dark:text-rose-300 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[15px] text-neutral-900 dark:text-white truncate">
                    {poDisplayCode}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleCopy(poDisplayCode, 'detail-code', e)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition shrink-0 active:bg-neutral-100"
                    aria-label="Salin nomor PO"
                  >
                    {copiedKey === 'detail-code' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ml-1 shrink-0 ${pillBg}`}>
                    {pillLabel}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-400 truncate">
                  {platformName}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer shrink-0 active:scale-95"
              aria-label="Tutup rincian"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Unified Single Scroll Container */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5" data-vaul-no-drag>
            {/* Section 1: Informasi Pembelian */}
            <div className="bg-neutral-50 dark:bg-neutral-950/50 rounded-2xl p-4 border border-neutral-100 dark:border-neutral-800/80 space-y-3">
              <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Informasi Pembelian
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-neutral-400 text-[11px] block">Tanggal Beli</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formatDetailDate(po.purchaseDate)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 text-[11px] block">Platform</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {platformName} ({currency})
                  </span>
                </div>
                {po.supplierOrderNumber && (
                  <div>
                    <span className="text-neutral-400 text-[11px] block">No. Order Supplier</span>
                    <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1">
                      {po.supplierOrderNumber}
                      <button
                        type="button"
                        onClick={(e) => handleCopy(po.supplierOrderNumber, 'detail-ord', e)}
                        className="w-5 h-5 rounded flex items-center justify-center text-neutral-400 hover:text-neutral-600 active:bg-neutral-200"
                        aria-label="Salin nomor order supplier"
                      >
                        {copiedKey === 'detail-ord' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </span>
                  </div>
                )}
                {po.supplierTrackingNumber && (
                  <div>
                    <span className="text-neutral-400 text-[11px] block">Nomor Resi</span>
                    <span className="font-mono font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      {po.supplierTrackingNumber}
                      <button
                        type="button"
                        onClick={(e) => handleCopy(po.supplierTrackingNumber, 'detail-resi', e)}
                        className="w-5 h-5 rounded flex items-center justify-center text-neutral-400 hover:text-amber-600 active:bg-amber-100"
                        aria-label="Salin nomor resi"
                      >
                        {copiedKey === 'detail-resi' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </span>
                  </div>
                )}
              </div>

              {po.notes && (
                <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 text-xs">
                  <span className="text-neutral-400 text-[11px] block mb-0.5">Catatan / Keterangan:</span>
                  <p className="text-neutral-700 dark:text-neutral-300 italic">{po.notes}</p>
                </div>
              )}
            </div>

            {/* Section 2: Daftar Item Buku (Ecommerce-style with Left Thumbnail Image) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  Daftar Buku ({itemsToRender.length} item · {orderQty} pcs)
                </h4>
                <span className="text-xs font-mono font-semibold text-neutral-600 dark:text-neutral-300">
                  Diterima: {totalReceivedQty}/{orderQty} ({Math.round(progressPercent)}%)
                </span>
              </div>

              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900">
                {itemsToRender.map((it: any, idx: number) => {
                  const matchedBook = books.find(b => b.id === it.bookId || b.bookName === it.bookName || b.title === it.bookName);
                  const bookCoverUrl = matchedBook?.cover || it.cover;
                  const itemOrderedQty = it.qty || 1;
                  const itemReceivedQty = po.status === 'received'
                    ? (it.qtyReceived !== undefined ? it.qtyReceived : itemOrderedQty)
                    : (it.qtyReceived || 0);

                  const hasImage = Boolean(bookCoverUrl && !imageErrors[`${idx}-${it.bookId}`]);

                  return (
                    <div key={idx} className="p-3.5 flex gap-3 items-start text-xs">
                      {/* Left: Product Image Thumbnail */}
                      <div className="w-14 h-18 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/70 dark:border-neutral-700/60 overflow-hidden shrink-0 flex items-center justify-center">
                        {hasImage ? (
                          <img
                            src={bookCoverUrl}
                            alt={it.bookName}
                            className="w-full h-full object-cover"
                            onError={() => setImageErrors(prev => ({ ...prev, [`${idx}-${it.bookId}`]: true }))}
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-neutral-400 p-1 text-center">
                            <BookOpen className="w-5 h-5 mb-0.5" />
                            <span className="text-[8.5px] font-bold leading-tight">Buku</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Product Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <h5 className="font-bold text-[13px] text-neutral-900 dark:text-white leading-snug line-clamp-2">
                          {it.bookName}
                        </h5>

                        <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                          <span>Qty: <b className="text-neutral-800 dark:text-neutral-200">{itemOrderedQty}</b> pcs</span>
                          <span>•</span>
                          <span className={itemReceivedQty >= itemOrderedQty ? 'text-emerald-600 font-bold' : 'text-amber-600 font-semibold'}>
                            Diterima: {itemReceivedQty} pcs
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <span className="text-neutral-400">
                            Harga: {currency === 'IDR'
                              ? formatIDR(it.pricePlatformTotal / itemOrderedQty)
                              : currency === 'NTD'
                              ? formatNTD(it.priceNTDTotal / itemOrderedQty)
                              : `US$ ${((it.pricePlatformTotal || 0) / itemOrderedQty).toFixed(2)}`}
                          </span>

                          {canViewAmount && (
                            <span className="font-bold text-neutral-900 dark:text-white">
                              {currency === 'IDR'
                                ? formatIDR(it.pricePlatformTotal)
                                : currency === 'NTD'
                                ? formatNTD(it.priceNTDTotal)
                                : `US$ ${(it.pricePlatformTotal || 0).toFixed(2)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Riwayat Penerimaan (Goods Receipt Logs) */}
            {po.receipts && po.receipts.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5" />
                  Riwayat Penerimaan ({po.receipts.length})
                </h4>
                <div className="space-y-2">
                  {po.receipts.map((rc: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-emerald-900 dark:text-emerald-300">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Penerimaan #{idx + 1}
                        </span>
                        <span className="font-mono text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                          {formatDetailDate(rc.receivedDate)}
                        </span>
                      </div>
                      {rc.kodeEkspedisi && (
                        <div className="text-[11px] text-neutral-600 dark:text-neutral-400">
                          Ekspedisi / Forwarder: <span className="font-mono font-bold text-neutral-900 dark:text-white">{rc.kodeEkspedisi}</span>
                        </div>
                      )}
                      {rc.receivedBy && (
                        <div className="text-[11px] text-neutral-500">
                          Diterima Oleh: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{rc.receivedBy}</span>
                        </div>
                      )}
                      {rc.note && (
                        <div className="text-[11px] text-neutral-500 italic bg-white/60 dark:bg-neutral-900/60 p-2 rounded-lg border border-emerald-100/50 dark:border-emerald-900/20">
                          Catatan: {rc.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 4: Ringkasan Finansial (Strict Multi-Currency Rules) */}
            {canViewAmount && (
              <div className="bg-neutral-50 dark:bg-neutral-950/50 rounded-2xl p-4 border border-neutral-100 dark:border-neutral-800/80 space-y-2 font-['Lexend'] text-xs">
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <CreditCard className="w-3.5 h-3.5" />
                  Ringkasan Pembayaran
                </h4>

                {/* Subtotal in Primary Currency */}
                <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                  <span>Subtotal</span>
                  <span className="font-['Inter'] font-semibold">
                    {currency === 'IDR'
                      ? formatIDR(totalIDR)
                      : currency === 'NTD'
                      ? formatNTD(totalNTD)
                      : `US$ ${totalUSD.toFixed(2)}`}
                  </span>
                </div>

                {/* Diskon if any */}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Diskon</span>
                    <span className="font-['Inter'] font-semibold">
                      -{currency === 'IDR'
                        ? formatIDR(discountAmount)
                        : currency === 'NTD'
                        ? formatNTD(discountAmount)
                        : `US$ ${discountAmount.toFixed(2)}`}
                    </span>
                  </div>
                )}

                {/* Grand Total Row */}
                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 flex items-baseline justify-between font-bold text-neutral-900 dark:text-white">
                  <span>Grand Total</span>
                  <div className="text-right">
                    <span className="font-['Inter'] text-[16px] text-[#6B1F3D] dark:text-rose-300">
                      {currency === 'IDR'
                        ? formatIDR(grandTotalIDR)
                        : currency === 'NTD'
                        ? formatNTD(grandTotalNTD)
                        : `US$ ${grandTotalUSD.toFixed(2)}`}
                    </span>
                    {/* Secondary NT$ reference only when primary is IDR or USD */}
                    {currency !== 'NTD' && grandTotalNTD > 0 && (
                      <span className="block text-[11px] text-neutral-400 font-normal mt-0.5">
                        ≈ {formatNTD(grandTotalNTD)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Action Bar (44px min button height) */}
          <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] flex items-center gap-2.5">
            {isStaffValue && onReceivePO && po.status !== 'received' && po.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReceivePO(po);
                }}
                className={`flex-1 h-11 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer active:scale-98 ${
                  po.status === 'partial'
                    ? 'bg-[#48607F] hover:bg-[#3d526d] active:bg-[#34465d]'
                    : 'bg-[#A6791E] hover:bg-[#8f681a] active:bg-[#785716]'
                }`}
              >
                <PackageCheck className="w-4 h-4 stroke-[2.5]" />
                <span>{po.status === 'partial' ? 'Lanjut Terima' : 'Terima Barang'}</span>
              </button>
            )}

            {isStaffValue && onEditPO && po.status === 'pending' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditPO(po);
                }}
                className="flex-1 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 transition cursor-pointer active:scale-98"
              >
                <Pencil className="w-4 h-4" />
                <span>Edit Pembelian</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer active:scale-98"
            >
              Tutup
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
});

PurchaseDetailDrawer.displayName = 'PurchaseDetailDrawer';
