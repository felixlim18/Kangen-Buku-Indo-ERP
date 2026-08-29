import React, { useState } from 'react';
import { Drawer } from 'vaul';
import {
  Copy,
  Check,
  Pin,
  Printer,
  Edit,
  Eye,
  Lightbulb,
  RefreshCw,
  Trash2,
  QrCode,
  MoreHorizontal,
  ChevronRight,
  X,
  AlertCircle
} from 'lucide-react';
import { SalesOrder, Book } from '../../types';
import { formatNTD } from '../../lib/decimal-utils';
import { getEffectiveOrderLogistics } from '../../lib/sales-logistics-utils';

interface SalesOrderMobileCardProps {
  order: SalesOrder;
  books: Book[];
  resolvedChannels: { name: string; color?: string }[];
  availableLogistics?: Array<{ id?: string; name: string }>;
  isStaffValue: boolean;
  canViewAmount: boolean;
  isReadyStock: boolean;
  overdueDays: number;
  isPinned: boolean;
  formattedDate: string;
  orderQty: number;
  onOpenDetail: (order: SalesOrder) => void;
  onEditOrder?: (order: SalesOrder) => void;
  onPrintInvoice?: (order: SalesOrder) => void;
  onTogglePin?: (order: SalesOrder) => void;
  onOpenRecommendations?: (recoData: { bookIds: string[]; categories: string[] }) => void;
  onOpenQrCode?: (order: SalesOrder) => void;
  onDeleteOrder?: (order: SalesOrder) => void;
  onRevertStatus?: (order: SalesOrder) => void;
  // Primary CTA handlers
  onKemasClick?: (order: SalesOrder) => void;
  onProsesKirimClick?: (order: SalesOrder) => void;
  onSelesaiClick?: (order: SalesOrder) => void;
  onReturnClick?: (orderId: string) => void;
  onDiambilClick?: (order: SalesOrder) => void;
}

export const SalesOrderMobileCard: React.FC<SalesOrderMobileCardProps> = React.memo(({
  order,
  books,
  resolvedChannels,
  availableLogistics,
  isStaffValue,
  canViewAmount,
  isReadyStock,
  overdueDays,
  isPinned,
  formattedDate,
  orderQty,
  onOpenDetail,
  onEditOrder,
  onPrintInvoice,
  onTogglePin,
  onOpenRecommendations,
  onOpenQrCode,
  onDeleteOrder,
  onRevertStatus,
  onKemasClick,
  onProsesKirimClick,
  onSelesaiClick,
  onReturnClick,
  onDiambilClick,
}) => {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'order-code' | 'order-number' | null>(null);

  const effectiveLogistics = getEffectiveOrderLogistics(order, availableLogistics);

  const isOverdue = overdueDays >= 15;
  const isCritical = overdueDays >= 21;
  const showReadyStockHighlight = !isPinned && isReadyStock;
  const showOverdueHighlight = !isPinned && !showReadyStockHighlight && isOverdue;

  // Status formatting
  let pillColor = '#b45309';
  let pillBg = '#fef3e2';
  let pillBorder = '#fde68a';
  let pillLabel = 'Pending';

  if (order.status === 'completed') {
    pillColor = '#0f7a52';
    pillBg = '#e7f5ef';
    pillBorder = '#a7f3d0';
    pillLabel = 'Selesai';
  } else if (order.status === 'packed') {
    pillColor = '#6366f1';
    pillBg = '#eef2ff';
    pillBorder = '#c7d2fe';
    pillLabel = 'Dikemas';
  } else if (order.status === 'shipped' || order.status === 'confirmed') {
    pillColor = '#1d6fa5';
    pillBg = '#e8f2f9';
    pillBorder = '#bae6fd';
    pillLabel = 'Dikirim';
  } else if (order.status === 'returned') {
    pillColor = '#a8323b';
    pillBg = '#fbecec';
    pillBorder = '#fecdd3';
    pillLabel = 'Return';
  } else if (order.status === 'cancelled') {
    pillColor = '#5b6472';
    pillBg = '#f1f2f4';
    pillBorder = '#e2e8f0';
    pillLabel = 'Cancel';
  }

  // Channel color
  const channelName = order.platformChannel || '-';
  const channelObj = resolvedChannels.find(
    (c) => (c.name || '').toLowerCase() === channelName.toLowerCase()
  );
  let channelColor = channelObj?.color;
  if (!channelColor) {
    const nameLower = channelName.trim().toLowerCase();
    if (nameLower.includes('whatsapp') || nameLower.includes('wa')) channelColor = '#25D366';
    else if (nameLower.includes('shopee')) channelColor = '#EE4D2D';
    else if (nameLower.includes('tokopedia')) channelColor = '#42B549';
    else if (nameLower.includes('tiktok')) channelColor = '#000000';
    else if (nameLower.includes('messenger') || nameLower.includes('facebook')) channelColor = '#0084FF';
    else if (nameLower.includes('instagram') || nameLower.includes('ig')) channelColor = '#E1306C';
    else if (nameLower.includes('line')) channelColor = '#00B900';
    else if (nameLower.includes('website') || nameLower.includes('web')) channelColor = '#6366F1';
    else channelColor = '#6B7280';
  }

  const isDraftLike = order.status === 'draft' || !order.status;
  const canDelete =
    order.status !== 'packed' &&
    order.status !== 'shipped' &&
    order.status !== 'confirmed' &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    order.status !== 'returned';

  const resi = (order.shipment?.shippingNumber || (order as any).shippingNumber || '').trim();
  const hasResi = !!resi;

  const copyOrderCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard && order.orderCode) {
      navigator.clipboard.writeText(order.orderCode);
      setCopiedKey('order-code');
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const copyOrderNumber = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard && order.orderNumber) {
      navigator.clipboard.writeText(order.orderNumber);
      setCopiedKey('order-number');
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  let cardBg = 'bg-white dark:bg-neutral-900 border-neutral-200/90 dark:border-neutral-800';
  if (isPinned) {
    cardBg = 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900/40';
  } else if (showReadyStockHighlight) {
    cardBg = 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-900/40';
  } else if (showOverdueHighlight) {
    cardBg = isCritical
      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900/40'
      : 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-900/40';
  }

  return (
    <>
      <article
        onClick={() => onOpenDetail(order)}
        className={`relative rounded-2xl border p-4 shadow-xs transition-all active:scale-[0.99] cursor-pointer overflow-hidden ${cardBg}`}
      >
        {/* Accent Spine */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[4px]"
          style={{ backgroundColor: pillColor }}
          aria-hidden="true"
        />

        <div className="pl-1">
          {/* Top Row: Order Code + Channel + Status Pill */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-white tracking-tight">
                {order.orderCode}
              </span>
              <button
                type="button"
                onClick={copyOrderCode}
                className="p-1 text-neutral-400 hover:text-brand-600 rounded active:scale-95 transition"
                title="Salin Kode Order"
                aria-label="Salin Kode Order"
              >
                {copiedKey === 'order-code' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>

              <span className="text-neutral-300 dark:text-neutral-700 text-xs">•</span>

              <span
                className="text-[11.5px] font-bold truncate max-w-[110px]"
                style={{ color: channelColor }}
              >
                {channelName}
              </span>
            </div>

            {/* Status Pill */}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 border"
              style={{
                backgroundColor: pillBg,
                color: pillColor,
                borderColor: pillBorder
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: pillColor }}
              />
              {pillLabel}
            </span>
          </div>

          {/* Customer Name + Order Number */}
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <div className="font-bold text-[13.5px] text-[#2b5a9e] dark:text-brand-400 truncate flex-1">
              {order.buyerType === 'marketplace' && order.customerPlatformName
                ? order.customerPlatformName
                : order.customerName || channelName}
            </div>

            {order.orderNumber && (
              <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400 shrink-0">
                <span className="truncate max-w-[100px]">{order.orderNumber}</span>
                <button
                  type="button"
                  onClick={copyOrderNumber}
                  className="p-0.5 text-neutral-400 hover:text-brand-600"
                  title="Salin Nomor Order"
                  aria-label="Salin Nomor Order"
                >
                  {copiedKey === 'order-number' ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Metadata Badges Strip */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px] text-neutral-500 dark:text-neutral-400">
            <span className="font-medium">{formattedDate}</span>

            {showReadyStockHighlight && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <Check className="w-3 h-3" />
                Stok siap
              </span>
            )}

            {showOverdueHighlight && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md font-bold text-[10px]"
                style={{
                  backgroundColor: isCritical ? '#fde2e1' : '#fef3e0',
                  color: isCritical ? '#a8323b' : '#b45309'
                }}
              >
                {overdueDays} hari
              </span>
            )}

            {isPinned && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <Pin className="w-3 h-3 fill-current" />
                Disematkan
              </span>
            )}

            <span className="text-neutral-300 dark:text-neutral-700">•</span>
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              {order.paymentMethod || 'COD'}
            </span>

            {effectiveLogistics && (
              <>
                <span className="text-neutral-300 dark:text-neutral-700">•</span>
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  {effectiveLogistics}
                </span>
              </>
            )}
          </div>

          {/* Pricing & Qty Strip */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800/80 mb-3">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span>
                Qty: <b className="text-neutral-800 dark:text-neutral-200">{orderQty} Pcs</b>
              </span>
              {!!order.discount && order.discount > 0 && (
                <>
                  <span className="text-neutral-300 dark:text-neutral-700">•</span>
                  <span>
                    Diskon: <b className="text-rose-500">−{formatNTD(order.discount)}</b>
                  </span>
                </>
              )}
            </div>

            {canViewAmount && (
              <div className="font-mono text-sm font-black text-brand-600 dark:text-brand-400">
                {formatNTD(order.totalPrice)}
              </div>
            )}
          </div>

          {/* Actions Strip */}
          <div
            className="flex items-center gap-2 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Primary Action Button */}
            {isDraftLike && isStaffValue && onKemasClick ? (
              <button
                type="button"
                onClick={() => onKemasClick(order)}
                className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition cursor-pointer"
              >
                <span>Kemas Orderan</span>
              </button>
            ) : order.status === 'packed' && isStaffValue && onProsesKirimClick ? (
              <button
                type="button"
                onClick={() => onProsesKirimClick(order)}
                className="flex-1 h-10 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition cursor-pointer"
              >
                <span>Kirim Pesanan</span>
              </button>
            ) : (order.status === 'shipped' || order.status === 'confirmed') && isStaffValue && onSelesaiClick && onReturnClick ? (
              <div className="flex-1 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelesaiClick(order)}
                  className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs active:scale-98 transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Selesai</span>
                </button>
                <button
                  type="button"
                  onClick={() => onReturnClick(order.id)}
                  className="px-3.5 h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60 font-bold text-xs flex items-center justify-center active:scale-98 transition cursor-pointer"
                >
                  <span>Return</span>
                </button>
              </div>
            ) : order.status === 'returned' && isStaffValue && onDiambilClick ? (
              <button
                type="button"
                onClick={() => onDiambilClick(order)}
                className="flex-1 h-10 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition cursor-pointer"
              >
                <span>Diambil Pemilik</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenDetail(order)}
                className="flex-1 h-10 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-neutral-500" />
                <span>Lihat Rincian</span>
              </button>
            )}

            {/* More Actions Trigger Button */}
            <button
              type="button"
              onClick={() => setIsActionsOpen(true)}
              className="w-10 h-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-center active:scale-95 transition cursor-pointer"
              title="Menu Lainnya"
              aria-label="Menu Lainnya"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </article>

      {/* Secondary Actions Drawer */}
      <Drawer.Root
        open={isActionsOpen}
        onOpenChange={(open) => setIsActionsOpen(open)}
        shouldScaleBackground={false}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 max-h-[85dvh] flex flex-col bg-white dark:bg-neutral-900 rounded-t-[22px] z-[10000] outline-none shadow-2xl border-t border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-800">
              <div className="mx-auto w-12 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mb-3 cursor-grab" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                    Opsi Orderan #{order.orderCode}
                  </h3>
                  <p className="text-xs text-neutral-500 truncate">
                    {order.customerName || order.platformChannel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActionsOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div data-vaul-no-drag className="p-4 space-y-2 overflow-y-auto pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
              {/* Cetak Invoice */}
              {onPrintInvoice && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onPrintInvoice(order);
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs flex items-center gap-3 active:scale-98 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-2xs">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold">Cetak Invoice</div>
                    <div className="text-[11px] text-neutral-400 font-normal">
                      Download / cetak tanda bukti pesanan
                    </div>
                  </div>
                </button>
              )}

              {/* Edit Orderan (Draft Only) */}
              {isDraftLike && isStaffValue && onEditOrder && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onEditOrder(order);
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs flex items-center gap-3 active:scale-98 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-700 flex items-center justify-center text-brand-600 dark:text-brand-400 shadow-2xs">
                    <Edit className="w-4 h-4" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold">Edit Orderan</div>
                    <div className="text-[11px] text-neutral-400 font-normal">
                      Ubah data buku, nama, atau alamat
                    </div>
                  </div>
                </button>
              )}

              {/* QR Code Resi */}
              {hasResi && onOpenQrCode && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onOpenQrCode(order);
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs flex items-center gap-3 active:scale-98 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-700 flex items-center justify-center text-sky-600 dark:text-sky-400 shadow-2xs">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold">Lihat QR Code Resi</div>
                    <div className="text-[11px] text-neutral-400 font-normal">
                      Scan barcode nomor resi ({resi})
                    </div>
                  </div>
                </button>
              )}

              {/* Rekomendasi Buku */}
              {order.items && order.items.length > 0 && onOpenRecommendations && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    const bookIds = order.items.map((it) => it.bookId);
                    const categories = new Set<string>();
                    order.items.forEach((it) => {
                      const b = books.find((bk) => bk.id === it.bookId);
                      if (b) {
                        const catArray = Array.isArray(b.category) ? b.category : [b.category];
                        catArray.forEach((c) => categories.add(c));
                      }
                    });
                    if (categories.size > 0) {
                      onOpenRecommendations({ bookIds, categories: Array.from(categories) });
                    }
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs flex items-center gap-3 active:scale-98 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-700 dark:text-amber-300 shadow-2xs">
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold">Rekomendasi Buku</div>
                    <div className="text-[11px] text-neutral-400 font-normal">
                      Saran buku terkait berdasarkan keranjang
                    </div>
                  </div>
                </button>
              )}

              {/* Pin / Unpin */}
              {onTogglePin && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onTogglePin(order);
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs flex items-center gap-3 active:scale-98 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-2xs">
                    <Pin className={`w-4 h-4 ${isPinned ? 'fill-current text-amber-500' : ''}`} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold">
                      {isPinned ? 'Lepas Sematan (Unpin)' : 'Sematkan di Atas (Pin)'}
                    </div>
                    <div className="text-[11px] text-neutral-400 font-normal">
                      Prioritaskan pesanan di bagian paling atas
                    </div>
                  </div>
                </button>
              )}

              {/* Revert Status */}
              {isStaffValue && order.status && order.status !== 'draft' && onRevertStatus && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onRevertStatus(order);
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs flex items-center gap-3 active:scale-98 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-2xs">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold">Kembali ke Status Sebelumnya</div>
                    <div className="text-[11px] text-neutral-400 font-normal">
                      Revert tahapan status pesanan
                    </div>
                  </div>
                </button>
              )}

              {/* Hapus Orderan */}
              {canDelete && onDeleteOrder && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onDeleteOrder(order);
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold text-xs flex items-center gap-3 active:scale-98 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-2xs">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold">Hapus Orderan</div>
                    <div className="text-[11px] text-rose-500 font-normal">
                      Hapus pesanan ini secara permanen
                    </div>
                  </div>
                </button>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
});
