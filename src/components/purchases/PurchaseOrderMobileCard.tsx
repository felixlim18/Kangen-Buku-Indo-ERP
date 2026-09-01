import React, { useState } from 'react';
import { Drawer } from 'vaul';
import {
  Copy,
  Check,
  Eye,
  Pencil,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  ChevronRight,
  X,
  PackageCheck,
  Package,
  Clock,
  Ban,
  FileText
} from 'lucide-react';
import { formatNTD, formatIDR, formatNumber } from '../../lib/decimal-utils';

export interface PurchaseOrderMobileCardProps {
  po: any;
  platform?: { id: string; name: string; currency?: string };
  isStaffValue: boolean;
  canViewAmount: boolean;
  onOpenDetail: (po: any) => void;
  onEditPO?: (po: any) => void;
  onReceivePO?: (po: any) => void;
  onRevertStatus?: (po: any) => void;
  onDeletePO?: (po: any) => void;
  onClosePO?: (po: any) => void;
}

export const PurchaseOrderMobileCard: React.FC<PurchaseOrderMobileCardProps> = React.memo(({
  po,
  platform,
  isStaffValue,
  canViewAmount,
  onOpenDetail,
  onEditPO,
  onReceivePO,
  onRevertStatus,
  onDeletePO,
  onClosePO,
}) => {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  const orderDateMs = po.purchaseDate?.seconds ? po.purchaseDate.seconds * 1000 : null;
  const formattedDate = orderDateMs
    ? new Date(orderDateMs).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—';

  const totalIDR = itemsToRender.reduce((sum: number, item: any) => sum + (item.pricePlatformTotal || 0), 0);
  const totalNTD = itemsToRender.reduce((sum: number, item: any) => sum + (item.priceNTDTotal || 0), 0);
  const totalUSD = itemsToRender.reduce((sum: number, item: any) => sum + (item.pricePlatformTotal || 0), 0);

  // Status spine and badge config
  let spineColor = 'bg-[#A6791E]';
  let pillBg = 'bg-[#F8EFD9] text-[#A6791E] border-[#A6791E]/20 dark:bg-amber-955/30 dark:text-amber-300';
  let pillLabel = 'Menunggu';

  if (po.status === 'received') {
    spineColor = 'bg-[#4C6B4F]';
    pillBg = 'bg-[#E9F0E9] text-[#4C6B4F] border-[#4C6B4F]/20 dark:bg-emerald-955/30 dark:text-emerald-300';
    pillLabel = 'Diterima';
  } else if (po.status === 'partial') {
    spineColor = 'bg-[#48607F]';
    pillBg = 'bg-[#E8EDF3] text-[#48607F] border-[#48607F]/20 dark:bg-slate-955/30 dark:text-slate-300';
    pillLabel = 'Sebagian';
  } else if (po.status === 'cancelled') {
    spineColor = 'bg-[#A34A32]';
    pillBg = 'bg-[#F5E5DF] text-[#A34A32] border-[#A34A32]/20 dark:bg-rose-955/30 dark:text-rose-300';
    pillLabel = 'Cancel';
  }

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

  return (
    <>
      <article
        onClick={() => onOpenDetail(po)}
        className="bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs active:scale-[0.99] transition duration-150 flex relative cursor-pointer select-none font-['Lexend']"
      >
        {/* Left Status Spine */}
        <div className={`w-2 shrink-0 ${spineColor}`} />

        <div className="flex-1 p-4 space-y-3 min-w-0">
          {/* Row 1: PO Code + Copy Button + Platform + Status Pill */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="font-bold text-[14px] text-neutral-900 dark:text-white truncate">
                {poDisplayCode}
              </span>
              <button
                type="button"
                onClick={(e) => handleCopy(poDisplayCode, `code-${po.id}`, e)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition shrink-0 active:bg-neutral-100 dark:active:bg-neutral-800"
                aria-label="Salin nomor PO"
              >
                {copiedKey === `code-${po.id}` ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 truncate max-w-[120px]">
                {platformName}
              </span>
              <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${pillBg}`}>
                {pillLabel}
              </div>
            </div>
          </div>

          {/* Row 2: Supplier Order Number & Tracking Resi (Only transaction info, NO product name) */}
          {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
            <div className="space-y-1 text-xs">
              {po.supplierOrderNumber && (
                <div className="flex items-center gap-1.5 font-mono text-neutral-600 dark:text-neutral-300">
                  <span className="text-neutral-400 font-sans text-[11px]">Order:</span>
                  <span className="font-semibold">{po.supplierOrderNumber}</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopy(po.supplierOrderNumber, `order-${po.id}`, e)}
                    className="w-6 h-6 rounded flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition active:bg-neutral-100"
                    aria-label="Salin nomor order supplier"
                  >
                    {copiedKey === `order-${po.id}` ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              )}
              {po.supplierTrackingNumber && (
                <div className="flex items-center gap-1.5 font-mono text-amber-700 dark:text-amber-400">
                  <span className="text-neutral-400 font-sans text-[11px]">Resi:</span>
                  <span className="font-semibold">{po.supplierTrackingNumber}</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopy(po.supplierTrackingNumber, `resi-${po.id}`, e)}
                    className="w-6 h-6 rounded flex items-center justify-center text-neutral-400 hover:text-amber-600 transition active:bg-amber-50 dark:active:bg-amber-950/40"
                    aria-label="Salin nomor resi"
                  >
                    {copiedKey === `resi-${po.id}` ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Row 3: Progress Bar (Received Qty / Ordered Qty) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
              <span>Progress Diterima:</span>
              <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                {totalReceivedQty} / {orderQty} pcs ({Math.round(progressPercent)}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: po.status === 'received' ? '#4C6B4F' : po.status === 'partial' ? '#48607F' : '#A6791E',
                }}
              />
            </div>
          </div>

          {/* Row 4: Purchase Date & Multi-Currency Grand Total */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
            <div className="text-neutral-500 dark:text-neutral-400 text-[11px]">
              <span className="text-neutral-400">Beli: </span>
              <span className="font-semibold">{formattedDate}</span>
            </div>
            <div className="text-right">
              {canViewAmount ? (
                <div>
                  <span className="font-['Inter'] font-bold text-[14.5px] text-neutral-900 dark:text-white">
                    {currency === 'IDR'
                      ? formatIDR(totalIDR)
                      : currency === 'NTD'
                      ? formatNTD(totalNTD)
                      : `US$ ${totalUSD.toFixed(2)}`}
                  </span>
                  {/* Secondary reference only if IDR or USD */}
                  {currency !== 'NTD' && totalNTD > 0 && (
                    <span className="block text-[10px] text-neutral-400 font-normal">
                      ≈ {formatNTD(totalNTD)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="font-semibold text-neutral-400">Rp ***</span>
              )}
            </div>
          </div>

          {/* Row 5: Action Buttons (44px min height) */}
          <div className="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            {/* Primary Lifecycle Action Button */}
            {isStaffValue && onReceivePO && po.status !== 'received' && po.status !== 'cancelled' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReceivePO(po);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl text-xs font-bold text-white transition duration-150 shadow-xs cursor-pointer active:scale-[0.98] ${
                  po.status === 'partial'
                    ? 'bg-[#48607F] hover:bg-[#3d526d] active:bg-[#34465d]'
                    : 'bg-[#A6791E] hover:bg-[#8f681a] active:bg-[#785716]'
                }`}
              >
                <PackageCheck className="w-4 h-4 stroke-[2.5]" />
                <span>{po.status === 'partial' ? 'Lanjut Terima' : 'Terima Barang'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail(po);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl text-xs font-semibold bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-[#E7E1D2] dark:border-neutral-700 transition duration-150 cursor-pointer active:scale-[0.98]"
              >
                <Eye className="w-4 h-4" />
                <span>Lihat Detail</span>
              </button>
            )}

            {/* More Actions Trigger (...) - 44x44px touch target */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsActionsOpen(true);
              }}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-[#E7E1D2] dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition shrink-0 cursor-pointer active:scale-95"
              aria-label="Aksi lainnya"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </article>

      {/* Action Sheet Drawer (vaul) */}
      <Drawer.Root open={isActionsOpen} onOpenChange={setIsActionsOpen}>
        <Drawer.Portal>
          <Drawer.Overlay 
            className="fixed inset-0 bg-black/60 z-[9999] backdrop-blur-[2px]" 
            onClick={(e) => e.stopPropagation()}
          />
          <Drawer.Content
            className="fixed bottom-0 left-0 right-0 z-[10000] bg-white dark:bg-neutral-900 rounded-t-[24px] max-h-[85dvh] flex flex-col border-t border-[#E7E1D2] dark:border-neutral-800 outline-none pb-safe"
            data-vaul-no-drag
          >
            {/* Grab Handle */}
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700 mt-3 mb-2 cursor-grab active:cursor-grabbing" />

            {/* Header (44px touch target close) */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
              <div>
                <h3 className="font-['Lexend'] font-bold text-[16px] text-neutral-900 dark:text-white">
                  Aksi Pembelian
                </h3>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  {poDisplayCode} · {platformName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsActionsOpen(false)}
                className="w-11 h-11 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Tutup aksi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Actions List (48px touch targets) */}
            <div className="p-3 space-y-1 overflow-y-auto font-['Lexend'] flex-1" data-vaul-no-drag>
              {/* 1. Lihat Rincian */}
              <button
                type="button"
                onClick={() => {
                  setIsActionsOpen(false);
                  onOpenDetail(po);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition text-left cursor-pointer min-h-[48px] active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 flex items-center justify-center shrink-0">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-neutral-900 dark:text-white">
                      Lihat Rincian
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      Periksa detail buku, foto & penerimaan
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </button>

              {/* 2. Edit Pembelian */}
              {isStaffValue && onEditPO && po.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onEditPO(po);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition text-left cursor-pointer min-h-[48px] active:bg-neutral-100 dark:active:bg-neutral-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 flex items-center justify-center shrink-0">
                      <Pencil className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-neutral-900 dark:text-white">
                        Edit Pembelian
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Ubah item buku, platform, atau nomor resi
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </button>
              )}

              {/* 3. Revert Status */}
              {isStaffValue && onRevertStatus && po.status && po.status !== 'pending' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onRevertStatus(po);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition text-left cursor-pointer min-h-[48px] active:bg-neutral-100 dark:active:bg-neutral-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/30 text-purple-600 flex items-center justify-center shrink-0">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-neutral-900 dark:text-white">
                        Kembalikan ke PENDING
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Batalkan penerimaan dan atur ulang stok
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </button>
              )}

              {/* 4. Tutup PO / Refund */}
              {isStaffValue && onClosePO && (po.status === 'pending' || po.status === 'partial') && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onClosePO(po);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition text-left cursor-pointer min-h-[48px] active:bg-neutral-100 dark:active:bg-neutral-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 text-orange-600 flex items-center justify-center shrink-0">
                      <Ban className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-neutral-900 dark:text-white">
                        Tutup PO / Refund
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Selesaikan sisa item atau catat refund
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </button>
              )}

              {/* 5. Hapus PO (Destructive) */}
              {isStaffValue && onDeletePO && !((po.qtyReceived || 0) > 0 || po.status === 'received' || po.status === 'partial') && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onDeletePO(po);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 transition text-left cursor-pointer min-h-[48px] active:bg-rose-100 dark:active:bg-rose-900/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                        Hapus Pembelian
                      </div>
                      <div className="text-[11px] text-rose-400/80">
                        Hapus permanen draft pembelian ini
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rose-400" />
                </button>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
});

PurchaseOrderMobileCard.displayName = 'PurchaseOrderMobileCard';
