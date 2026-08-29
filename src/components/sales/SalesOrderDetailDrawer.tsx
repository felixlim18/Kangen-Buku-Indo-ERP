import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Drawer } from 'vaul';
import {
  X,
  Copy,
  Eye,
  Lightbulb,
  Check,
  Printer,
  Edit,
  GitFork,
  BookOpen,
  Calendar,
  User,
  Phone,
  Truck,
  MapPin,
  CreditCard,
  Tag,
  Clock,
  AlertCircle,
  FileText
} from 'lucide-react';
import { SalesOrder, Book } from '../../types';
import { formatNTD } from '../../lib/decimal-utils';
import { getEffectiveOrderLogistics } from '../../lib/sales-logistics-utils';

interface SalesOrderDetailDrawerProps {
  order: SalesOrder | null;
  isOpen: boolean;
  isSuspended?: boolean;
  onClose: () => void;
  books: Book[];
  availableLogistics?: Array<{ id?: string; name: string }>;
  isStaffValue: boolean;
  role?: string;
  onOpenSplitOrderModal?: (order: SalesOrder) => void;
  onOpenRefundConfirm?: (order: SalesOrder) => void;
  onOpenSelesaiConfirm?: (order: SalesOrder) => void;
  onTransitionToReturned?: (orderId: string) => void;
  onEditOrder?: (order: SalesOrder) => void;
  onPreviewImage?: (image: { url: string; title?: string }) => void;
  onOpenRecommendations?: (recoData: { bookIds: string[]; categories: string[] }) => void;
  onPrintInvoice?: (order: SalesOrder) => void;
}

export const SalesOrderDetailDrawer: React.FC<SalesOrderDetailDrawerProps> = ({
  order,
  isOpen,
  isSuspended = false,
  onClose,
  books,
  availableLogistics,
  isStaffValue,
  role,
  onOpenSplitOrderModal,
  onOpenRefundConfirm,
  onOpenSelesaiConfirm,
  onTransitionToReturned,
  onEditOrder,
  onPreviewImage,
  onOpenRecommendations,
  onPrintInvoice,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !order) return null;

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

  const formatUpdatedAt = (dt: any) => {
    if (!dt) return '';
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
    if (!dateObj || isNaN(dateObj.getTime())) return '';
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  };

  const copyToClipboard = (text: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const getStatusBadge = (status?: string) => {
    if (status === 'shipped' || status === 'confirmed') {
      return { label: 'Dikirim', bg: 'bg-sky-50 dark:bg-sky-950/50', text: 'text-[#1d6fa5] dark:text-sky-400', border: 'border-sky-200 dark:border-sky-800/60', dot: 'bg-[#1d6fa5]' };
    }
    if (status === 'packed') {
      return { label: 'Dikemas', bg: 'bg-indigo-50 dark:bg-indigo-950/50', text: 'text-[#6366f1] dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-800/60', dot: 'bg-[#6366f1]' };
    }
    if (status === 'completed') {
      return { label: 'Selesai', bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-[#0f7a52] dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/60', dot: 'bg-[#0f7a52]' };
    }
    if (status === 'returned') {
      return { label: 'Return', bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-[#a8323b] dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800/60', dot: 'bg-[#a8323b]' };
    }
    if (status === 'cancelled') {
      return { label: 'Dibatalkan', bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-300', border: 'border-neutral-200 dark:border-neutral-700', dot: 'bg-neutral-500' };
    }
    return { label: 'Pending', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-[#b45309] dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/60', dot: 'bg-[#b45309]' };
  };

  const getCategoryBadge = (ord: SalesOrder) => {
    if (ord.buyerType === 'marketplace' || (ord.platformOrder && ['Shopee', 'Tokopedia', 'TikTok Shop', 'Lazada'].includes(ord.platformOrder))) {
      return { label: 'Marketplace', bg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800' };
    }
    if (ord.buyerType === 'reseller' || ord.orderType === 'Reseller Order' || !!ord.partnerId) {
      return { label: 'Reseller', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    }
    return { label: 'Direct', bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
  };

  const statusBadge = getStatusBadge(order.status);
  const categoryBadge = getCategoryBadge(order);
  const totalQty = order.items?.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) || 0;
  const rawCode = order.orderCode || '';
  const displayOrderCode = rawCode.startsWith('#') ? rawCode : `#${rawCode}`;
  const rawOrderDate = order.orderDate || order.createdAt;
  const orderDateFormatted = rawOrderDate ? formatDetailDate(rawOrderDate) : '–';
  const customerNameFormatted = order.customerName?.trim() || '–';
  const socialAccountFormatted = order.customerPlatformName?.trim() || '–';
  const phoneFormatted = order.phoneNumber?.trim() || '–';
  const logisticsFormatted = getEffectiveOrderLogistics(order, availableLogistics, '–');
  const pickupDetailsFormatted = order.pickupDetails?.trim() || '–';
  const paymentMethodFormatted = order.paymentMethod?.trim() || '–';
  const platformOrderFormatted = order.platformOrder?.trim() || '–';
  const sumberCampaignFormatted = order.orderType?.trim() || '–';
  const orderNumberFormatted = order.orderNumber?.trim() || '–';
  const shippingNumberFormatted = order.shipment?.shippingNumber?.trim() || '–';
  const estShipping = order.estimatedShippingDate ? formatDetailDate(order.estimatedShippingDate) : '–';
  const customerNoteFormatted = order.customerNote?.trim() || '–';
  const lastUpdated = order.updatedAt ? formatUpdatedAt(order.updatedAt) : formatUpdatedAt(order.orderDate || order.createdAt);

  const isMarketplace = order.buyerType === 'marketplace' || (!order.buyerType && (
    (order.platformOrder && ['Shopee', 'Tokopedia', 'TikTok Shop', 'Lazada'].includes(order.platformOrder)) ||
    order.orderType === 'Marketplace'
  ));
  const isReseller = order.buyerType === 'reseller' || (!order.buyerType && (order.orderType === 'Reseller Order' || !!order.partnerId));

  // Status timeline events
  const creatorName = (order as any).createdByName || order.createdBy || 'Staff';
  const timelineEvents: { label: string; date: any; badgeLabel: string; dotColor: string }[] = [];
  if (rawOrderDate) {
    timelineEvents.push({ label: `Order Dibuat (${creatorName})`, date: rawOrderDate, badgeLabel: 'Pending', dotColor: 'bg-amber-500' });
  }
  if (order.packedAt) {
    timelineEvents.push({ label: 'Order Dikemas', date: order.packedAt, badgeLabel: 'Dikemas', dotColor: 'bg-indigo-500' });
  }
  const dateDikirim = order.shippedAt || order.shipment?.arrangedAt || order.shipment?.shippingDate;
  if (dateDikirim) {
    const resiInfo = order.shipment?.shippingNumber ? ` (Resi ${order.shipment.shippingNumber})` : '';
    timelineEvents.push({ label: `Order Dikirim${resiInfo}`, date: dateDikirim, badgeLabel: 'Dikirim', dotColor: 'bg-sky-500' });
  }
  if (order.completedAt) {
    timelineEvents.push({ label: 'Order Selesai', date: order.completedAt, badgeLabel: 'Selesai', dotColor: 'bg-emerald-500' });
  }
  if (order.returnedAt) {
    timelineEvents.push({ label: 'Order Diretur', date: order.returnedAt, badgeLabel: 'Return', dotColor: 'bg-slate-500' });
  }
  if (order.diambilAt) {
    timelineEvents.push({ label: 'Buku Diambil Pemilik', date: order.diambilAt, badgeLabel: 'Diambil', dotColor: 'bg-brand-500' });
  }
  if (order.cancelledAt) {
    timelineEvents.push({ label: 'Order Dibatalkan', date: order.cancelledAt, badgeLabel: 'Dibatalkan', dotColor: 'bg-rose-500' });
  }

  return createPortal(
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSuspended) onClose();
      }}
      modal={false}
      shouldScaleBackground={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          onClick={() => {
            if (!isSuspended) onClose();
          }}
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] ${isSuspended ? 'pointer-events-none' : ''}`}
        />
        <Drawer.Content
          inert={isSuspended ? true : undefined}
          className={`fixed bottom-0 left-0 right-0 max-h-[94dvh] h-[94dvh] flex flex-col bg-[#f8fafc] dark:bg-[#0f141c] rounded-t-[22px] z-[10000] outline-none shadow-2xl border-t border-neutral-200/80 dark:border-neutral-800 overflow-hidden ${isSuspended ? 'pointer-events-none select-none opacity-90' : ''}`}
        >
          {/* Header Strip */}
          <div className="flex-shrink-0 bg-white dark:bg-neutral-900 border-b border-neutral-200/80 dark:border-neutral-800 px-4 pt-3 pb-3">
            {/* Grab Handle */}
            <div className="mx-auto w-12 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700 mb-3 cursor-grab active:cursor-grabbing" />

            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-base font-bold text-neutral-900 dark:text-white tracking-tight">
                      {displayOrderCode}
                    </span>
                    <button
                      type="button"
                      data-vaul-no-drag
                      onClick={() => copyToClipboard(displayOrderCode, 'order-code')}
                      className="p-1 text-neutral-400 hover:text-brand-600 rounded active:scale-95 transition cursor-pointer"
                      title="Salin Kode Order"
                      aria-label="Salin Kode Order"
                    >
                      {copiedKey === 'order-code' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                    {statusBadge.label}
                  </span>

                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${categoryBadge.bg}`}>
                    {categoryBadge.label}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                  {order.customerName || order.platformChannel || 'Tanpa Nama'} · {orderDateFormatted}
                </p>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {order.items && order.items.length > 0 && onOpenRecommendations && (
                  <button
                    type="button"
                    onClick={() => {
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
                    className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center active:scale-95 transition cursor-pointer"
                    title="Rekomendasi Buku"
                  >
                    <Lightbulb className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center active:scale-95 transition cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div data-vaul-no-drag className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 text-neutral-800 dark:text-neutral-200">
            {/* 1. Informasi Pesanan Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-3.5">
              <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2.5">
                <FileText className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                  Informasi Pesanan
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                    Kategori Order
                  </span>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-100">
                    {isMarketplace ? 'Marketplace' : isReseller ? 'Reseller' : 'Direct Order'}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {order.platformChannel || order.platformOrder || order.orderType || '—'}
                  </div>
                </div>

                <div>
                  <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                    Tanggal Order
                  </span>
                  <div className="font-semibold font-mono text-neutral-800 dark:text-neutral-100">
                    {orderDateFormatted}
                  </div>
                </div>

                <div>
                  <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                    Nama Pembeli
                  </span>
                  <div className="font-bold text-brand-600 dark:text-brand-400 break-words">
                    {customerNameFormatted}
                  </div>
                </div>

                <div>
                  <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                    Akun Sosial / Platform
                  </span>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-100 flex items-center gap-1">
                    <span className="truncate">{socialAccountFormatted}</span>
                    {socialAccountFormatted !== '–' && (
                      <button
                        type="button"
                        data-vaul-no-drag
                        onClick={() => copyToClipboard(socialAccountFormatted, 'social-account')}
                        className="p-1 text-neutral-400 hover:text-brand-600 cursor-pointer"
                        aria-label="Salin Akun Platform"
                      >
                        {copiedKey === 'social-account' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                    No. Handphone
                  </span>
                  <div className="font-semibold font-mono text-neutral-800 dark:text-neutral-100 flex items-center gap-1">
                    <span>{phoneFormatted}</span>
                    {phoneFormatted !== '–' && (
                      <button
                        type="button"
                        data-vaul-no-drag
                        onClick={() => copyToClipboard(phoneFormatted, 'phone')}
                        className="p-1 text-neutral-400 hover:text-brand-600 cursor-pointer"
                        aria-label="Salin Nomor Telepon"
                      >
                        {copiedKey === 'phone' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                    Metode Bayar
                  </span>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-100">
                    {paymentMethodFormatted}
                  </div>
                </div>

                <div className="col-span-2">
                  <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                    Logistik & Alamat / Kode Toko
                  </span>
                  <div className="flex items-center gap-2 flex-wrap text-neutral-800 dark:text-neutral-100 font-semibold">
                    <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[11.5px] font-bold">
                      {logisticsFormatted}
                    </span>
                    <span className="break-all">{pickupDetailsFormatted}</span>
                    {order.addressPhotoUrl && onPreviewImage && (
                      <button
                        type="button"
                        onClick={() => onPreviewImage({ url: order.addressPhotoUrl!, title: 'Foto Alamat / Kode Toko' })}
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Foto</span>
                      </button>
                    )}
                    {pickupDetailsFormatted !== '–' && (
                      <button
                        type="button"
                        data-vaul-no-drag
                        onClick={() => copyToClipboard(pickupDetailsFormatted, 'pickup-address')}
                        className="p-1 text-neutral-400 hover:text-brand-600 cursor-pointer"
                        aria-label="Salin Alamat / Kode Toko"
                      >
                        {copiedKey === 'pickup-address' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {orderNumberFormatted !== '–' && (
                  <div>
                    <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                      Nomor Order
                    </span>
                    <div className="font-mono text-neutral-800 dark:text-neutral-100 flex items-center gap-1">
                      <span className="truncate">{orderNumberFormatted}</span>
                      <button
                        type="button"
                        data-vaul-no-drag
                        onClick={() => copyToClipboard(orderNumberFormatted, 'order-number')}
                        className="p-1 text-neutral-400 hover:text-brand-600 cursor-pointer"
                        aria-label="Salin Nomor Order"
                      >
                        {copiedKey === 'order-number' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                )}

                {shippingNumberFormatted !== '–' && (
                  <div>
                    <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                      Nomor Resi
                    </span>
                    <div className="font-mono text-neutral-800 dark:text-neutral-100 flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold truncate">
                        {shippingNumberFormatted}
                      </span>
                      <button
                        type="button"
                        data-vaul-no-drag
                        onClick={() => copyToClipboard(shippingNumberFormatted, 'shipping-number')}
                        className="p-1 text-neutral-400 hover:text-brand-600 cursor-pointer"
                        aria-label="Salin Nomor Resi"
                      >
                        {copiedKey === 'shipping-number' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                )}

                {estShipping !== '–' && (
                  <div className="col-span-2">
                    <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase block mb-0.5">
                      Tanggal Diminta Kirim
                    </span>
                    <div className="font-semibold text-amber-600 dark:text-amber-400">
                      {estShipping}
                    </div>
                  </div>
                )}

                {customerNoteFormatted !== '–' && (
                  <div className="col-span-2 bg-amber-50/70 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                    <span className="text-[10.5px] font-bold text-amber-800 dark:text-amber-400 uppercase block mb-1">
                      Catatan Pembeli
                    </span>
                    <p className="text-xs text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                      {customerNoteFormatted}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Daftar Buku Item Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                    Daftar Buku
                  </h4>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                  {order.items?.length || 0} Item · {totalQty} Pcs
                </span>
              </div>

              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {order.items?.map((it, idx) => {
                  const isTertinggal = it.markedTertinggal || it.markedRefund;
                  const resolvedCover = it.bookCover || books.find((b) => b.id === it.bookId)?.cover || '';
                  return (
                    <div key={idx} className={`py-2.5 flex items-center gap-3 ${isTertinggal ? 'opacity-50' : ''}`}>
                      <div
                        className="w-11 h-14 rounded-lg bg-neutral-200 dark:bg-neutral-800 flex-shrink-0 overflow-hidden cursor-pointer shadow-xs"
                        onClick={() => {
                          if (resolvedCover && onPreviewImage) {
                            onPreviewImage({ url: resolvedCover, title: it.bookName });
                          }
                        }}
                      >
                        {resolvedCover ? (
                          <img src={resolvedCover} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400">
                            <BookOpen className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-neutral-900 dark:text-white line-clamp-2 leading-tight">
                            {it.bookName}
                          </span>
                          {isTertinggal && (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Tertinggal
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-neutral-500 dark:text-neutral-400 mt-1">
                          {it.qty} Pcs × {formatNTD(it.unitPrice)}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="font-mono font-bold text-xs text-neutral-900 dark:text-white">
                          {formatNTD(it.lineTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Ringkasan Pembayaran */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-2 text-xs">
              <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
                <span>Subtotal ({totalQty} Buku)</span>
                <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                  {formatNTD(order.subtotal || order.totalPrice)}
                </span>
              </div>

              {!!order.discount && order.discount > 0 && (
                <div className="flex items-center justify-between text-rose-500">
                  <span>Diskon Order</span>
                  <span className="font-mono font-bold">−{formatNTD(order.discount)}</span>
                </div>
              )}

              {!!order.platformFee && order.platformFee > 0 && (
                <div className="flex items-center justify-between text-neutral-500">
                  <span>Admin Platform Fee</span>
                  <span className="font-mono">−{formatNTD(order.platformFee)}</span>
                </div>
              )}

              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-2 flex items-center justify-between text-sm font-bold">
                <span className="text-neutral-900 dark:text-white">Total Tagihan</span>
                <span className="font-mono text-base font-black text-brand-600 dark:text-brand-400">
                  {formatNTD(order.totalPrice)}
                </span>
              </div>
            </div>

            {/* 4. Timeline Status */}
            {timelineEvents.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
                  <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                    Riwayat Transaksi
                  </h4>
                </div>

                <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-neutral-200 dark:before:bg-neutral-800">
                  {timelineEvents.map((ev, i) => (
                    <div key={i} className="relative">
                      <div className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white dark:ring-neutral-900 ${ev.dotColor}`} />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white">
                          {ev.label}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500">
                          {formatDetailDate(ev.date)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Action Bar */}
          <div data-vaul-no-drag className="flex-shrink-0 bg-white dark:bg-neutral-900 border-t border-neutral-200/80 dark:border-neutral-800 p-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] flex items-center gap-2">
            {/* Cetak */}
            {onPrintInvoice && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPrintInvoice(order);
                }}
                className="h-11 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak</span>
              </button>
            )}

            {/* Split Order */}
            {isStaffValue && (order.status === 'draft' || order.status === 'confirmed') && (order.items?.length || 0) > 1 && onOpenSplitOrderModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSplitOrderModal(order);
                }}
                className="h-11 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
              >
                <GitFork className="w-4 h-4" />
                <span>Split</span>
              </button>
            )}

            {/* Edit Metadata */}
            {role === 'owner' && onEditOrder && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditOrder(order);
                }}
                className="h-11 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
            )}

            {/* Selesai & Return for Shipped */}
            {isStaffValue && (order.status === 'shipped' || order.status === 'confirmed') && onOpenSelesaiConfirm && onTransitionToReturned && (
              <div className="flex-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSelesaiConfirm(order);
                  }}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Selesai</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onTransitionToReturned(order.id);
                  }}
                  className="h-11 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center active:scale-95 transition cursor-pointer"
                >
                  <span>Return</span>
                </button>
              </div>
            )}

            {/* Close Button fallback for full width if no primary state actions */}
            {!(isStaffValue && (order.status === 'shipped' || order.status === 'confirmed')) && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold text-xs flex items-center justify-center active:scale-95 transition cursor-pointer"
              >
                Tutup
              </button>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>,
    document.body
  );
};
