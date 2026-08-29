import { Drawer } from 'vaul';
import { getNextJournalId } from '../lib/journalUtils';
import Papa from 'papaparse';
import type ExcelJSTypes from 'exceljs';
import { loadXLSX, loadExcelJS, loadJsPDF, loadHtml2Canvas } from '../lib/lazy-libs';
import { ImagePreviewModal } from "./ui/ImagePreviewModal";
import { BookRecommendationsModal } from './BookRecommendationsModal';
import { TruncatedTooltip } from "./ui/TruncatedTooltip";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DateRangePicker } from './ui/DateRangePicker';
import { useMediaQuery } from '../lib/use-media-query';
import { BulkProcessModal } from './BulkProcessModal';
import './SalesOrderForm.css';
import './SalesOrderForm.dark.css';
import './SalesOrderDetail.css';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { fetchCurrentExchangeRate } from '../lib/period-closing-utils';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { Book, SalesOrder, SalesOrderItem, InventoryRecord, OrderTypeConfig, ChannelConfig, PlatformOrderConfig, LogisticsConfig, BusinessPartner } from '../types';
import { confirmSalesOrderTransaction, packSalesOrderTransaction, generateOrderCode, completeSalesOrderTransaction, reverseSalesOrderTransaction, revertCompletedSalesOrderToShipped, splitSalesOrderTransaction, processMarketplaceRefundTransaction, revertDiambilToReturned } from '../lib/db-helpers';
import { formatNTD, formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { getCurrentKontrolStokForBook, getPhysicalOnHandStockForBook } from "../lib/inventory-utils";
import { useAuth } from '../lib/auth-context';
import { useSettings } from '../lib/use-settings';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../lib/use-modal-esc';
import {
  Plus,
  Search,
  ShoppingBag,
  FileDown,
  Truck,
  Trash2,
  Sparkles,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Printer,
  Calendar,
  Layers,
  User,
  HeartHandshake,
  SlidersHorizontal,
  RefreshCw,
  Edit,
  XCircle,
  HelpCircle,
  BookOpen,
  Download,
  AlertTriangle,
  Copy,
  Scan,
  Eye,
  Minus,
  Gift,
  Trash,
  AlertCircle,
  UploadCloud,
  Upload,
  FileText,
  FileSpreadsheet,
  Lightbulb,
  Settings,
  ShoppingCart,
  Menu,
  MoreHorizontal,
  Pin,
  Package,
  GitFork,
  Loader2,
  QrCode
} from 'lucide-react';
import QRCode from 'qrcode';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { PackingChecklist } from './PackingChecklist';

const DEFAULT_ORDER_TYPES = ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Shopee Ads', 'Tokopedia Ads'];
const DEFAULT_CHANNELS_WITH_COLOR = [
  { name: 'WhatsApp', color: '#25D366' },
  { name: 'Shopee', color: '#EE4D2D' },
  { name: 'Messenger', color: '#0084FF' },
  { name: 'Instagram', color: '#E1306C' },
  { name: 'LINE', color: '#00B900' },
  { name: 'Website', color: '#6366F1' },
];
const DEFAULT_CHANNELS = DEFAULT_CHANNELS_WITH_COLOR.map(c => c.name);
const DEFAULT_PLATFORMS = ['7-Eleven', 'IopenMall', 'Shopee', 'FamilyMart'];
const DEFAULT_LOGISTICS = ['7-Eleven', 'FamilyMart', 'Alamat Rumah'];
const DEFAULT_MARKETPLACES = ['Shopee', 'Tokopedia', 'TikTok Shop', 'Lazada', 'Lainnya'];

const getChannelColor = (channelName: string, channelObj?: { color?: string }): string => {
  if (channelObj?.color) return channelObj.color;
  if (!channelName || channelName === '-') return '#6B7280';
  const nameLower = channelName.trim().toLowerCase();
  if (nameLower.includes('whatsapp') || nameLower.includes('wa')) return '#25D366';
  if (nameLower.includes('shopee')) return '#EE4D2D';
  if (nameLower.includes('tokopedia')) return '#42B549';
  if (nameLower.includes('tiktok')) return '#000000';
  if (nameLower.includes('messenger') || nameLower.includes('facebook')) return '#0084FF';
  if (nameLower.includes('instagram') || nameLower.includes('ig')) return '#E1306C';
  if (nameLower.includes('line')) return '#00B900';
  if (nameLower.includes('website') || nameLower.includes('web')) return '#6366F1';
  if (nameLower.includes('reseller')) return '#8B5CF6';
  return '#3B82F6';
};

const getOrderDateMs = (order: SalesOrder): number => {
  if (order.orderDate) {
    if (typeof order.orderDate.seconds === 'number') {
      return order.orderDate.seconds * 1000;
    }
    if (order.orderDate instanceof Date) {
      return order.orderDate.getTime();
    }
    if (typeof order.orderDate === 'number') {
      return order.orderDate;
    }
    if (typeof order.orderDate === 'string') {
      const parsed = new Date(order.orderDate).getTime();
      if (!isNaN(parsed)) return parsed;
    }
  }
  if (order.createdAt?.seconds) {
    return order.createdAt.seconds * 1000;
  }
  return 0;
};

const getTimestampMs = (val: any): number | null => {
  if (!val) return null;
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  return null;
};

const getShippedDateMs = (order: SalesOrder): number => {
  const ts = getTimestampMs(order.shippedAt) ||
    getTimestampMs(order.shipment?.arrangedAt) ||
    getTimestampMs(order.shipment?.shippingDate);
  return ts ?? getOrderDateMs(order);
};

const getCompletedDateMs = (order: SalesOrder): number => {
  const ts = getTimestampMs(order.completedAt);
  return ts ?? getOrderDateMs(order);
};

const parseShippingDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // 1. Check YYYY-MM-DD or YYYY/MM/DD
  const ymd = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d, 0, 0, 0, 0);
  }

  // 2. Check DD-MM-YYYY or DD/MM/YYYY
  const dmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    const y = parseInt(dmy[3], 10);
    return new Date(y, m, d, 0, 0, 0, 0);
  }

  // 3. Fallback standard parsing
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return null;
};

const isShippingDateFuture = (dateStr?: string | null): boolean => {
  const shipDate = parseShippingDate(dateStr);
  if (!shipDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return shipDate.getTime() > today.getTime();
};

const getReturnedDateMs = (order: SalesOrder): number => {
  const ts = getTimestampMs(order.returnedAt);
  return ts ?? getOrderDateMs(order);
};

const getPackedDateMs = (order: SalesOrder): number => {
  const ts = getTimestampMs(order.packedAt);
  return ts ?? getOrderDateMs(order);
};

const getCancelledDateMs = (order: SalesOrder): number => {
  const ts = getTimestampMs(order.cancelledAt);
  return ts ?? getOrderDateMs(order);
};

const isDateInRange = (dateMs: number, startDate: Date | null, endDate: Date | null): boolean => {
  if (!dateMs) return true;
  if (startDate) {
    const startMs = new Date(startDate.getTime()).setHours(0, 0, 0, 0);
    if (dateMs < startMs) return false;
  }
  if (endDate) {
    const endMs = new Date(endDate.getTime()).setHours(23, 59, 59, 999);
    if (dateMs > endMs) return false;
  }
  return true;
};

const formatPhoneNumber = (digits: string) => {
  const clean = digits.replace(/\D/g, '');
  if (clean.length <= 4) {
    return clean;
  } else if (clean.length <= 7) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  } else {
    return `${clean.slice(0, 4)}-${clean.slice(4, 7)}-${clean.slice(7, 10)}`;
  }
};


const NewOrderModalWrapper = ({ isOpen, onClose, isMobileScreen, sidebarHidden, children }) => {
  if (!isOpen) return null;

  if (isMobileScreen) {
    return createPortal(
      <Drawer.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-[9999]" />
          <Drawer.Content className="bg-[#f5f6f7] dark:bg-[#0d1117] flex flex-col rounded-t-[16px] h-[96%] mt-24 fixed bottom-0 left-0 right-0 z-[10000] outline-none">
            <div className="p-4 bg-white dark:bg-neutral-900 rounded-t-[16px] flex-1 flex flex-col overflow-hidden shadow-[0_-4px_24px_rgba(0,0,0,0.08)] border border-neutral-200/50 dark:border-neutral-800">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700 mb-4 cursor-grab active:cursor-grabbing" />
              <div className="flex-1 overflow-y-auto w-full max-w-full pb-safe">
                <div className="kbi-so-card kbi-so-card--vaul" onClick={e => e.stopPropagation()}>
                  {children}
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>,
      document.body
    );
  }

  return createPortal(
    <div className={`kbi-so-overlay${sidebarHidden ? ' kbi-so-overlay--rail' : ''}`} onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="kbi-so-card" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
};

const QrCodeModal: React.FC<{
  order: SalesOrder;
  resi: string;
  onClose: () => void;
  sidebarHidden: boolean;
}> = ({ order, resi, onClose, sidebarHidden }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current && resi) {
      QRCode.toCanvas(
        canvasRef.current,
        resi,
        {
          width: 220,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) console.error('Error generating QR code:', error);
        }
      );
    }
  }, [resi]);

  const handleCopyResi = () => {
    if (!resi) return;
    navigator.clipboard.writeText(resi);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Cetak QR Code Resi - ${order.orderCode}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; margin: 0; padding: 20px; text-align: center; }
              .card { border: 2px dashed #000; border-radius: 12px; padding: 24px; max-width: 320px; width: 100%; box-sizing: border-box; }
              .logo { font-size: 16px; font-weight: bold; margin-bottom: 6px; }
              .title { font-size: 12px; color: #555; margin-bottom: 12px; letter-spacing: 0.5px; }
              img { width: 220px; height: 220px; display: block; margin: 0 auto; }
              .resi { font-size: 20px; font-weight: 800; font-family: monospace; letter-spacing: 1px; margin: 14px 0 6px; }
              .meta { font-size: 12px; color: #333; margin-top: 4px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="logo">KANGEN BUKU INDO</div>
              <div class="title">LABEL QR CODE RESI PENGIRIMAN</div>
              <img src="${dataUrl}" alt="QR Code Resi" />
              <div class="resi">${resi}</div>
              <div class="meta"><strong>Order:</strong> ${order.orderCode}</div>
              <div class="meta"><strong>Customer:</strong> ${order.customerName || '-'}</div>
              <div class="meta"><strong>Ekspedisi:</strong> ${order.pickupLogistics || '-'}</div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={getModalOverlayClass(sidebarHidden, 'z-50')}
    >
      <div
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-[92%] p-5 space-y-4 animate-scale-up my-auto text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white leading-none">QR Code Nomor Resi</h3>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1 font-mono">{order.orderCode}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code Canvas */}
        <div className="flex flex-col items-center justify-center p-3 bg-neutral-50 dark:bg-neutral-950/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/80">
          <div className="p-3 bg-white rounded-xl shadow-xs border border-neutral-200/80 flex items-center justify-center">
            <canvas ref={canvasRef} className="w-[200px] h-[200px] block" />
          </div>
          <p className="text-[11px] text-neutral-400 mt-2">Scan QR Code 2D untuk membaca Nomor Resi</p>
        </div>

        {/* Order Details & Resi Copy Box */}
        <div className="space-y-2 text-left">
          <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200/70 dark:border-neutral-700/60 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Nomor Resi</div>
              <div className="font-mono text-xs font-bold text-neutral-900 dark:text-white truncate selection:bg-indigo-100">
                {resi}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyResi}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer select-none ${copied
                ? 'bg-emerald-500 text-white shadow-xs'
                : 'bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-600 shadow-2xs'
                }`}
              title="Salin Nomor Resi"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>Salin</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-xl border border-neutral-200/50 dark:border-neutral-800">
            <div>
              <span className="text-[10.5px] text-neutral-400 block">Customer</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate block">{order.customerName || '-'}</span>
            </div>
            <div>
              <span className="text-[10.5px] text-neutral-400 block">Kurir / Logistik</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate block">{order.pickupLogistics || '-'}</span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2 px-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-200/60 dark:border-indigo-800/50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak QR</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-3 text-xs font-bold text-white bg-neutral-800 hover:bg-neutral-900 dark:bg-neutral-700 dark:hover:bg-neutral-600 rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export const SalesTab: React.FC = () => {
  const { profile, user } = useAuth();
  const { branding, lineSettings } = useSettings();
  const { sidebarHidden } = useSidebar();
  const isStaffValue = profile?.role === 'owner' || profile?.role === 'staff';

  const hasPerm = (key: string) => {
    if (profile?.role === 'owner') return true;
    return !!profile?.permissions?.[key];
  };

  const canViewAmount = hasPerm('sales.viewAmount');

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [inventories, setInventories] = useState<InventoryRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [damagedRecords, setDamagedRecords] = useState<any[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);

  // Custom states for Dynamic Config Manager
  const [orderTypes, setOrderTypes] = useState<OrderTypeConfig[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [platforms, setPlatforms] = useState<PlatformOrderConfig[]>([]);
  const [logistics, setLogistics] = useState<LogisticsConfig[]>([]);
  const [marketplaces, setMarketplaces] = useState<any[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isConfigInitialized, setIsConfigInitialized] = useState(false);
  const [isSeedingDone, setIsSeedingDone] = useState(false);
  const [isManageConfigOpen, setIsManageConfigOpen] = useState(false);
  const [manageActiveTab, setManageActiveTab] = useState<'type' | 'channel' | 'platform' | 'logistik' | 'marketplace'>('channel');
  const [configInputVal, setConfigInputVal] = useState('');
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editingConfigVal, setEditingConfigVal] = useState('');
  const [deleteConfigState, setDeleteConfigState] = useState<{
    type: 'individual' | 'all';
    itemId?: string;
    itemName?: string;
    tab: 'type' | 'channel' | 'platform' | 'logistik' | 'marketplace';
  } | null>(null);

  // Open Form modal
  const [previewImage, setPreviewImage] = useState<{ url: string, title: string } | null>(null);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isOrderSubmitting, setIsOrderSubmitting] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);

  const isLockedOrder = editingOrder && editingOrder.status && editingOrder.status !== 'draft' && !editingOrder.isDraft;
  const isOwner = profile?.role === 'owner';
  const canEditMetadata = isLockedOrder && isOwner;
  const isFormLockedForMetadata = isLockedOrder && !isOwner;
  const isFinancialsLocked = !!isLockedOrder;


  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBulkProcessOpen, setIsBulkProcessOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [recoOrderData, setRecoOrderData] = useState<{ bookIds: string[], categories: string[] } | null>(null);

  // Print Invoice state
  const [printInvoiceOrder, setPrintInvoiceOrder] = useState<SalesOrder | null>(null);

  // Delete Order Confirmation state
  const [selectedOrderForDelete, setSelectedOrderForDelete] = useState<SalesOrder | null>(null);
  const [isDeleteOrderSubmitting, setIsDeleteOrderSubmitting] = useState(false);

  // Split Order (Opsi Kirim Partial) state
  const [splitOrderModalData, setSplitOrderModalData] = useState<SalesOrder | null>(null);
  const [selectedSplitBookIds, setSelectedSplitBookIds] = useState<string[]>([]);
  const [isSplitSubmitting, setIsSplitSubmitting] = useState(false);

  // Marketplace Refund Confirmation state
  const [refundConfirmOrder, setRefundConfirmOrder] = useState<SalesOrder | null>(null);
  const [isRefundSubmitting, setIsRefundSubmitting] = useState(false);

  // QR Code 2D Resi Modal state
  const [qrCodeModalOrder, setQrCodeModalOrder] = useState<SalesOrder | null>(null);

  // Esc key listeners for modals
  useModalEsc(isChecklistOpen, () => setIsChecklistOpen(false));
  useModalEsc(!!editingOrder, () => setEditingOrder(null));
  useModalEsc(isImportModalOpen, () => setIsImportModalOpen(false));
  useModalEsc(isBulkProcessOpen, () => setIsBulkProcessOpen(false));
  useModalEsc(!!printInvoiceOrder, () => setPrintInvoiceOrder(null));
  useModalEsc(!!selectedOrderForDelete, () => setSelectedOrderForDelete(null), isDeleteOrderSubmitting);
  useModalEsc(isManageConfigOpen, () => setIsManageConfigOpen(false));
  useModalEsc(!!splitOrderModalData, () => setSplitOrderModalData(null), isSplitSubmitting);
  useModalEsc(!!refundConfirmOrder, () => setRefundConfirmOrder(null), isRefundSubmitting);
  useModalEsc(!!qrCodeModalOrder, () => setQrCodeModalOrder(null));

  const handleOpenSplitOrderModal = (order: SalesOrder) => {
    // Determine default items to move to child SO (items that are NOT ready/sufficient in stock)
    const isOrderAlreadyDeducted = order.status === 'packed' || order.status === 'shipped' || order.status === 'confirmed' || order.status === 'completed';
    const bookIdsToSplit: string[] = [];
    for (const item of order.items || []) {
      const physical = getPhysicalOnHandStockForBook(item.bookId, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords);
      const avail = isOrderAlreadyDeducted ? physical + item.qty : physical;
      if (avail < item.qty) {
        bookIdsToSplit.push(item.bookId);
      }
    }
    setSelectedSplitBookIds(bookIdsToSplit);
    setSplitOrderModalData(order);
  };

  const handleConfirmSplitOrder = async () => {
    if (!splitOrderModalData) return;
    if (selectedSplitBookIds.length === 0) {
      alert('Pilih minimal 1 barang yang belum ready untuk dipindahkan ke Sales Order Baru.');
      return;
    }
    if (selectedSplitBookIds.length === splitOrderModalData.items.length) {
      alert('Harus ada minimal 1 barang yang tetap dikirim di Sales Order Awal ini.');
      return;
    }

    try {
      setIsSplitSubmitting(true);
      const res = await splitSalesOrderTransaction(
        splitOrderModalData.id,
        selectedSplitBookIds,
        user?.email || 'System'
      );

      setSplitOrderModalData(null);
      alert(`Berhasil membagi order! Sales Order Baru #${res.childOrderCode} telah dibuat untuk barang tertinggal (status Draft).`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Gagal membagi order');
    } finally {
      setIsSplitSubmitting(false);
    }
  };

  const handleConfirmMarketplaceRefund = async () => {
    if (!refundConfirmOrder) return;
    try {
      setIsRefundSubmitting(true);
      await processMarketplaceRefundTransaction(
        refundConfirmOrder.id,
        user?.email || 'System',
        `Refund Marketplace / Barang Kurang SO ${refundConfirmOrder.orderCode} (${refundConfirmOrder.customerName || 'Pelanggan'})`
      );
      setRefundConfirmOrder(null);
      setViewingOrderDetail(null);
      alert(`Jurnal Refund Marketplace untuk SO #${refundConfirmOrder.orderCode} berhasil diposting ke Beban Lain-lain (5500) dan Piutang Usaha (1110).`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Gagal memproses refund marketplace');
    } finally {
      setIsRefundSubmitting(false);
    }
  };

  // New order form fields
  const [orderDateInput, setOrderDateInput] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState('');
  const [customerPlatformName, setCustomerPlatformName] = useState('');
  const [platformChannel, setPlatformChannel] = useState<string>('WhatsApp');
  const [platformOrder, setPlatformOrder] = useState<string>('Shopee');
  const [orderType, setOrderType] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<SalesOrder['paymentMethod']>('COD');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pickupLogistics, setPickupLogistics] = useState<SalesOrder['pickupLogistics']>('');
  const [pickupDetails, setPickupDetails] = useState('');
  const [cartItems, setCartItems] = useState<SalesOrderItem[]>([]);
  const [discountInput, setDiscountInput] = useState('0');
  const [platformFeeInput, setPlatformFeeInput] = useState('0');
  const [grandTotalInput, setGrandTotalInput] = useState('');
  const [isEditingGrandTotal, setIsEditingGrandTotal] = useState(false);
  const [partnerProfitPercent, setPartnerProfitPercent] = useState('0');
  const [customerNote, setCustomerNote] = useState('');
  const [phoneWarning, setPhoneWarning] = useState('');
  const [exchangeRateTWDtoIDR, setExchangeRateTWDtoIDR] = useState<number>(500);
  const [orderNumber, setOrderNumber] = useState('');
  const [estimatedShippingDate, setEstimatedShippingDate] = useState('');
  const [perluKonfirmasiSebelumKirim, setPerluKonfirmasiSebelumKirim] = useState<boolean>(false);

  const [buyerType, setBuyerType] = useState<'langsung' | 'reseller' | 'marketplace'>('marketplace');
  const [selectedPartner, setSelectedPartner] = useState<{ id: string, name: string, profitSharePercent: number } | null>(null);
  const [addressPhotoUrl, setAddressPhotoUrl] = useState<string>('');
  const [addressPhotoFile, setAddressPhotoFile] = useState<File | null>(null);

  const [currentPage, setCurrentPage] = useState(1);

  // Payment method change confirmation states
  const [showPaymentChangeConfirmModal, setShowPaymentChangeConfirmModal] = useState(false);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<string | null>(null);

  const handlePaymentMethodChange = (newMethod: string) => {
    if (newMethod === paymentMethod) return;

    const isPlatformFilled = Boolean(platformOrder && platformOrder.trim() !== '');
    const isOrderNoFilled = Boolean(orderNumber && orderNumber.trim() !== '');

    if (isPlatformFilled && isOrderNoFilled) {
      setPendingPaymentMethod(newMethod);
      setShowPaymentChangeConfirmModal(true);
    } else {
      setPaymentMethod(newMethod as any);
    }
  };

  const handleConfirmPaymentMethodChange = () => {
    if (pendingPaymentMethod) {
      setPaymentMethod(pendingPaymentMethod as any);
      setPlatformOrder('');
      setOrderNumber('');
    }
    setPendingPaymentMethod(null);
    setShowPaymentChangeConfirmModal(false);
  };

  const handleCancelPaymentMethodChange = () => {
    setPendingPaymentMethod(null);
    setShowPaymentChangeConfirmModal(false);
  };

  useModalEsc(showPaymentChangeConfirmModal, () => handleCancelPaymentMethodChange());

  // Form field shake feedback states
  const [copiedOrderNo, setCopiedOrderNo] = useState(false);
  const [shakeFields, setShakeFields] = useState<Record<string, boolean>>({});
  const triggerShake = (fieldKey: string) => {
    setShakeFields(prev => ({ ...prev, [fieldKey]: true }));
    setTimeout(() => {
      setShakeFields(prev => ({ ...prev, [fieldKey]: false }));
    }, 500);
  };

  // Kemas modal confirmation state
  const [confirmingCustomerPreKemasOrder, setConfirmingCustomerPreKemasOrder] = useState<SalesOrder | null>(null);
  const [confirmingKemasOrder, setConfirmingKemasOrder] = useState<SalesOrder | null>(null);
  const [isKemasSubmitting, setIsKemasSubmitting] = useState<boolean>(false);

  // Process confirmation modal state
  const [isProsesConfirmOpen, setIsProsesConfirmOpen] = useState(false);
  const [selectedOrderForProses, setSelectedOrderForProses] = useState<SalesOrder | null>(null);
  const [prosesOrderNo, setProsesOrderNo] = useState('');
  const [prosesResi, setProsesResi] = useState('');
  const [prosesDate, setProsesDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  });

  // Camera Barcode/QR Code scanner states
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const toggleCameraFacingMode = async () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextMode);
    if (html5QrCodeRef.current) {
      const instance = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch (e: any) {
        console.warn("Stop scanner notice on flip:", e?.message || e);
      }
    }
  };

  const stopScanning = async () => {
    if (html5QrCodeRef.current) {
      const instance = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch (err: any) {
        console.warn("Notice during stop scanner:", err?.message || err);
      }
    }
    setIsScanning(false);
    setScanError(null);
  };

  const handleCloseProsesModal = async () => {
    await stopScanning();
    setIsProsesConfirmOpen(false);
    setSelectedOrderForProses(null);
  };

  // Play dynamic audible beep feedback for operators on success
  const playScanSuccessBeep = () => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      const audioCtx = new AudioCtxClass();

      // A pleasant premium high-pitched upward notification chime
      const playTone = (freq: number, startDelay: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startDelay);

        gain.gain.setValueAtTime(0, audioCtx.currentTime + startDelay);
        gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + startDelay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startDelay + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + startDelay);
        osc.stop(audioCtx.currentTime + startDelay + duration);
      };

      // Upward harmonic interval chime (B5 -> E6)
      playTone(987.77, 0, 0.07);
      playTone(1318.51, 0.05, 0.15);
    } catch (e) {
      console.warn("Audible notification feedback failed:", e);
    }
  };

  // Scan initialization effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNewOrderOpen(false);
        setEditingOrder(null);
        setViewingOrderDetail(null);
        setPreviewImage(null);
        setIsChecklistOpen(false);
        setIsBulkProcessOpen(false);
        setIsImportModalOpen(false);
        setIsManageConfigOpen(false);
        setRecoOrderData(null);
        setSplitOrderModalData(null);
        setPrintInvoiceOrder(null);
        setRefundConfirmOrder(null);
        setShowPaymentChangeConfirmModal(false);
        setConfirmingKemasOrder(null);
        setConfirmingCustomerPreKemasOrder(null);
        setConfirmingSelesaiOrderId(null);
        setConfirmingDiambilOrder(null);
        setRevertConfirmState(null);
        setSelectedOrderForDelete(null);
        setIsProsesConfirmOpen(false);
        setSelectedOrderForProses(null);
        setQrCodeModalOrder(null);
        stopScanning();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isScanning) {
      const timer = setTimeout(() => {
        const element = document.getElementById('qr-reader');
        if (element) {
          try {
            const scanner = new Html5Qrcode("qr-reader", {
              formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.AZTEC,
                Html5QrcodeSupportedFormats.CODABAR,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.CODE_93,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.DATA_MATRIX,
                Html5QrcodeSupportedFormats.MAXICODE,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.PDF_417,
                Html5QrcodeSupportedFormats.RSS_14,
                Html5QrcodeSupportedFormats.RSS_EXPANDED,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION
              ],
              verbose: false,
              experimentalFeatures: {
                useBarCodeDetectorIfSupported: false
              }
            });
            html5QrCodeRef.current = scanner;

            // Deep-level engine override: Force ZXing's TRY_HARDER decoding hint to true
            try {
              const anyScanner = scanner as any;
              if (anyScanner.qrcode) {
                const decoders = [
                  anyScanner.qrcode.primaryDecoder,
                  anyScanner.qrcode.secondaryDecoder
                ].filter(Boolean);

                decoders.forEach(decoder => {
                  if (decoder.hints && typeof decoder.hints.forEach === "function") {
                    decoder.hints.forEach((value: any, key: any) => {
                      if (value === false) {
                        decoder.hints.set(key, true);
                        console.log("Deep override details: Mutated ZXing hint to enable TRY_HARDER");
                      }
                    });
                  }
                });
              }
            } catch (e) {
              console.warn("Could not set TRY_HARDER hint override:", e);
            }

            scanner.start(
              { facingMode: cameraFacingMode },
              {
                fps: 30,
                // Disable crop bounding boxes so the engine analyzes full width of the frame
                qrbox: undefined,
                aspectRatio: 1.333333,
                videoConstraints: {
                  facingMode: cameraFacingMode,
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  aspectRatio: { ideal: 1.333333 },
                  advanced: [{ focusMode: "continuous" }] as any
                }
              },
              (decodedText) => {
                playScanSuccessBeep();
                setProsesResi(decodedText.trim().toUpperCase());
                stopScanning();
              },
              () => {
                // Ignore silent frame scans
              }
            ).then(() => {
              localStorage.setItem('cameraPermissionGranted', 'true');
            }).catch((startErr) => {
              console.error("Camera access failed:", startErr);
              setScanError("Gagal mengakses kamera. Silakan periksa izin kamera perangkat Anda.");
            });
          } catch (initErr) {
            console.error("HTML5Qrcode init failed:", initErr);
            setScanError("Inisialisasi pemindai gagal.");
          }
        }
      }, 300);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [isScanning, cameraFacingMode]);

  // Table Filters & Search
  const [activeFilterTab, setActiveFilterTab] = useState<'Semua' | 'Pending' | 'Dikirim' | 'Berhasil' | 'Return' | 'Cancel'>('Semua');
  const [globalSearch, setGlobalSearch] = useState('');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Check for navigation filter from other tabs (e.g. OngkosKirimTab)
  useEffect(() => {
    const filter = localStorage.getItem('search_sales_order_filter');
    if (filter) {
      setGlobalSearch(filter);
      setActiveFilterTab('Semua');
      localStorage.removeItem('search_sales_order_filter');
    }
  }, []);

  // Advanced Filter Inputs
  const [platformFilterInput, setPlatformFilterInput] = useState('');
  const [sumberFilterInput, setSumberFilterInput] = useState('');
  const [courierInput, setCourierInput] = useState('');
  const [detailsInput, setDetailsInput] = useState('');

  // Global Date Filter (Default: Semua Tanggal)
  const [globalStartDate, setGlobalStartDate] = useState<Date | null>(null);
  const [globalEndDate, setGlobalEndDate] = useState<Date | null>(null);
  const [globalDateLabel, setGlobalDateLabel] = useState<string>('Semua');

  // Applied Advanced Filter values
  const [appliedPlatform, setAppliedPlatform] = useState('');
  const [appliedSumber, setAppliedSumber] = useState('');
  const [appliedCourier, setAppliedCourier] = useState('');
  const [appliedDetails, setAppliedDetails] = useState('');

  // Row Stepper Expand State
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [viewingOrderDetail, setViewingOrderDetail] = useState<SalesOrder | null>(null);

  // On tablet the order detail is a permanent pane beside the list, so the
  // modal must not also mount. This is the only layout decision made in JS —
  // everything else is CSS, so there is no flash of the wrong shell.
  const isTabletTier = useMediaQuery('(min-width: 768px) and (max-width: 1023.98px)');

  // Overflow sheet holding the masthead's secondary actions on mobile, where
  // six buttons will not fit on one row.
  const [isSalesActionsOpen, setIsSalesActionsOpen] = useState(false);

  // One path to "new order", shared by the desktop toolbar button and the
  // mobile floating action button.

  const [isMobileScreen, setIsMobileScreen] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const target = document.getElementById('top-header-actions-portal');
    if (target) setPortalTarget(target);

    const handleResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const openNewOrder = () => {
    setEditingOrder(null);
    resetOrderForm();
    setIsNewOrderOpen(true);
  };

  // Tab-Specific confirmation overlays
  const [confirmingSelesaiOrderId, setConfirmingSelesaiOrderId] = useState<string | null>(null);
  const [isSelesaiSubmitting, setIsSelesaiSubmitting] = useState(false);
  // Umur piutang dipilih saat order diselesaikan, bukan saat dibuat - jatuh temponya
  // baru mulai berjalan begitu order benar-benar masuk Piutang Usaha.
  const [selesaiTermsDays, setSelesaiTermsDays] = useState<30 | 60 | 90>(30);
  const [isProsesSubmitting, setIsProsesSubmitting] = useState(false);
  const [confirmingDiambilOrder, setConfirmingDiambilOrder] = useState<SalesOrder | null>(null);
  const [selectedReturnMode, setSelectedReturnMode] = useState<'stock' | 'writeoff'>('stock');
  const [revertConfirmState, setRevertConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Order lama (dibuat saat umur piutang masih ada di form) sudah punya nilainya -
  // pakai itu sebagai nilai awal, selain itu default 30 hari.
  const openSelesaiConfirm = (order: SalesOrder) => {
    setSelesaiTermsDays((order.paymentTermsDays as 30 | 60 | 90) || 30);
    setConfirmingSelesaiOrderId(order.id);
  };

  const [categoryChangeConfirm, setCategoryChangeConfirm] = useState<{
    currentCategory: 'marketplace' | 'langsung' | 'reseller';
    targetCategory: 'marketplace' | 'langsung' | 'reseller';
  } | null>(null);

  const [platformAutoConfig, setPlatformAutoConfig] = useState<Record<string, { enabled: boolean; enabledAt?: string }>>({});
  const [newPlatformOngkosKirim, setNewPlatformOngkosKirim] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'ongkir_platform_config'), (snap) => {
      if (snap.exists()) {
        setPlatformAutoConfig(snap.data()?.platforms || {});
      } else {
        setPlatformAutoConfig({});
      }
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    return () => unsub();
  }, []);

  const handleSelectBuyerType = (target: 'marketplace' | 'langsung' | 'reseller') => {
    if (target === buyerType) return;
    if (editingOrder) {
      setCategoryChangeConfirm({
        currentCategory: buyerType,
        targetCategory: target,
      });
    } else {
      applyBuyerTypeChange(target);
    }
  };

  const applyBuyerTypeChange = (target: 'marketplace' | 'langsung' | 'reseller') => {
    setBuyerType(target);
    if (target === 'marketplace') {
      setPlatformOrder('');
      setOrderType('');
      setPickupLogistics('');
      setPickupDetails('');
      setPaymentMethod('');
      setPhoneNumber('');
      setCustomerPlatformName(customerPlatformName || customerName || '');
      setCustomerName('');
      setPlatformChannel('Shopee');
      setSelectedPartner(null);
    } else {
      if (resolvedPlatforms.length > 0) {
        const exists = resolvedPlatforms.some(p => p.name === platformOrder);
        if (!exists) {
          setPlatformOrder(resolvedPlatforms[0].name);
        }
      }
      if (!paymentMethod) {
        setPaymentMethod('COD');
      }
      if (!pickupLogistics && resolvedLogistics.length > 0) {
        setPickupLogistics(resolvedLogistics[0].name);
      }
      if (target === 'langsung') {
        setSelectedPartner(null);
      }
    }
    setCategoryChangeConfirm(null);
  };

  useEffect(() => {
    if (viewingOrderDetail) {
      const updated = orders.find(o => o.id === viewingOrderDetail.id);
      if (updated) {
        setViewingOrderDetail(updated);
      }
    }
  }, [orders]);

  // Book command-search state
  const [bookSearch, setBookSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory'), (snap) => {
      const iList: any[] = [];
      snap.forEach((d) => iList.push(d.data()));
      setInventories(iList);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const oList: any[] = [];
      snap.forEach((d) => oList.push({ id: d.id, ...d.data() }));
      setOrders(oList.sort((a, b) => {
        const dateDiff = getOrderDateMs(b) - getOrderDateMs(a);
        if (dateDiff !== 0) return dateDiff;
        const codeA = a.orderCode || '';
        const codeB = b.orderCode || '';
        return codeB.localeCompare(codeA);
      }));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          partnersSnap,
          catSnap,
          ledgerSnap,
          poSnap,
          damagedSnap
        ] = await Promise.all([
          getDocs(collection(db, 'partners')),
          getDocs(collection(db, 'catalog')),
          getDocs(collection(db, 'inventoryLedger')),
          getDocs(collection(db, 'purchaseOrders')),
          getDocs(collection(db, 'damagedStock'))
        ]);

        const pList = [];
        partnersSnap.forEach((d) => pList.push({ id: d.id, ...d.data() }));
        setPartners(pList);


        const bList = [];
        catSnap.forEach((d) => {
          const item = d.data();
          if (item.isActive) {
            bList.push({ id: d.id, ...item });
          }
        });
        setBooks(bList);


        const lList = [];
        ledgerSnap.forEach((d) => lList.push(d.data()));
        setLedgerEntries(lList);

        const poList = [];
        poSnap.forEach((d) => poList.push({ id: d.id, ...d.data() }));
        setPurchaseOrders(poList);

        const dList = [];
        damagedSnap.forEach((d) => dList.push(d.data()));
        setDamagedRecords(dList);

      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
          console.warn('Quota exceeded while fetching SalesTab data');
        } else {
          console.error('Error fetching data for SalesTab:', err);
        }
      }
    };
    loadData();
  }, []);



  // 1. Separate, strict useEffect that runs once on mount for Guarded Seeding
  useEffect(() => {
    const initializeConfigSeeding = async () => {
      try {
        const configSnap = await getDocs(collection(db, 'categories'));
        let isInitializedDocPresent = false;
        let hasPlatforms = false;
        let hasLogistics = false;
        let hasMarketplaces = false;
        let isV2 = false;

        configSnap.forEach((d) => {
          if (d.id === 'config_initialized') {
            isInitializedDocPresent = true;
            if (d.data().v2) isV2 = true;
          }
          if (d.id.startsWith('config_platform_')) {
            hasPlatforms = true;
          }
          if (d.id.startsWith('config_logistik_')) {
            hasLogistics = true;
          }
          if (d.id.startsWith('config_marketplace_')) {
            hasMarketplaces = true;
          }
        });

        if (!isInitializedDocPresent || !isV2) {
          if (!isV2) {
            // Delete old configs to force a clean slate
            for (const d of configSnap.docs) {
              if (d.id.startsWith('config_')) {
                await deleteDoc(doc(db, 'categories', d.id));
              }
            }
          }
          // Write initialization flag document first so that any other triggers or re-reads know it's already initialized
          await setDoc(doc(db, 'categories', 'config_initialized'), {
            orderTypes: true,
            channels: true,
            platforms: true,
            logistics: true,
            marketplaces: true,
            v2: true,
            createdAt: Timestamp.now()
          });

          // Write default order types to Firestore
          for (const [idx, def] of DEFAULT_ORDER_TYPES.entries()) {
            const defId = `config_type_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
            await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
          }

          // Write default platforms/channels to Firestore
          for (const [idx, def] of DEFAULT_CHANNELS_WITH_COLOR.entries()) {
            const defId = `config_channel_default_${def.name.toLowerCase().replace(/\s+/g, '_')}`;
            await setDoc(doc(db, 'categories', defId), { name: def.name, color: def.color, position: idx, createdAt: Timestamp.now() });
          }

          // Write default platforms to Firestore
          for (const [idx, def] of DEFAULT_PLATFORMS.entries()) {
            const defId = `config_platform_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
            await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
          }

          // Write default logistics to Firestore
          for (const [idx, def] of DEFAULT_LOGISTICS.entries()) {
            const defId = `config_logistik_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
            await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
          }

          // Write default marketplaces to Firestore
          for (const [idx, def] of DEFAULT_MARKETPLACES.entries()) {
            const defId = `config_marketplace_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
            await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
          }
        } else {
          if (!hasPlatforms) {
            for (const [idx, def] of DEFAULT_PLATFORMS.entries()) {
              const defId = `config_platform_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
              await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
            }
            await updateDoc(doc(db, 'categories', 'config_initialized'), {
              platforms: true
            });
          }
          if (!hasLogistics) {
            for (const [idx, def] of DEFAULT_LOGISTICS.entries()) {
              const defId = `config_logistik_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
              await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
            }
            await updateDoc(doc(db, 'categories', 'config_initialized'), {
              logistics: true
            });
          }
          if (!hasMarketplaces) {
            for (const [idx, def] of DEFAULT_MARKETPLACES.entries()) {
              const defId = `config_marketplace_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
              await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
            }
            await updateDoc(doc(db, 'categories', 'config_initialized'), {
              marketplaces: true
            });
          }
        }
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || String(err).toLowerCase().includes('quota')) {
          console.warn("Quota exceeded during config initialization. Continuing with cached or empty data.");
        } else {
          console.error("Guarded config initialization error:", err);
        }
      } finally {
        setIsSeedingDone(true);
      }
    };

    initializeConfigSeeding();
  }, []);

  // 2. Strict Read-Only Categories Listener (subscribes only after Seeding is fully resolved)
  useEffect(() => {
    if (!isSeedingDone) return;

    const unsubConfigs = onSnapshot(collection(db, 'categories'), (snap) => {
      const docsMapped = snap.docs.map(docItem => ({ id: docItem.id, ...docItem.data() as any }));
      const typesList: any[] = [];
      const channelsList: any[] = [];
      const platformsList: any[] = [];
      const logisticsList: any[] = [];
      const marketplacesList: any[] = [];
      let isInitializedDocPresent = false;

      docsMapped.forEach((item) => {
        if (item.id === 'config_initialized') {
          isInitializedDocPresent = true;
        } else if (item.id.startsWith('config_type_')) {
          typesList.push({ id: item.id, name: item.name, position: item.position, createdAt: item.createdAt });
        } else if (item.id.startsWith('config_channel_')) {
          channelsList.push({ id: item.id, name: item.name, color: item.color, orderCategory: item.orderCategory, position: item.position, createdAt: item.createdAt });
        } else if (item.id.startsWith('config_platform_')) {
          platformsList.push({ id: item.id, name: item.name, position: item.position, ongkosKirim: item.ongkosKirim, isCod: item.isCod, isTransfer: item.isTransfer, createdAt: item.createdAt, adminFee: typeof item.adminFee === 'number' ? item.adminFee : (parseFloat(item.adminFee) || 0) });
        } else if (item.id.startsWith('config_logistik_')) {
          logisticsList.push({ id: item.id, name: item.name, position: item.position, platforms: item.platforms, createdAt: item.createdAt });
        } else if (item.id.startsWith('config_marketplace_')) {
          marketplacesList.push({ id: item.id, name: item.name, position: item.position, createdAt: item.createdAt });
        }
      });

      const sortByPosition = (a: any, b: any) => {
        const posA = a.position !== undefined ? a.position : 999999;
        const posB = b.position !== undefined ? b.position : 999999;
        if (posA !== posB) return posA - posB;
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB;
      };

      typesList.sort(sortByPosition);
      channelsList.sort(sortByPosition);
      platformsList.sort(sortByPosition);
      logisticsList.sort(sortByPosition);
      marketplacesList.sort(sortByPosition);

      setOrderTypes(typesList);
      setChannels(channelsList);
      setPlatforms(platformsList);
      setLogistics(logisticsList);
      setMarketplaces(marketplacesList);

      if (isInitializedDocPresent) {
        setIsConfigInitialized(true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });

    return () => {

    };
  }, [isSeedingDone]);

  // Fetch kurs resmi bulanan (cached di Firestore, auto-update tiap bulan) saat modal
  // dibuka dan metode pembayaran Transfer.
  useEffect(() => {
    if (isNewOrderOpen && paymentMethod === 'Transfer') {
      let isMounted = true;
      fetchCurrentExchangeRate().then((rate) => {
        if (isMounted && rate && rate > 0) setExchangeRateTWDtoIDR(rate);
      });
      return () => {
        isMounted = false;
      };
    }
  }, [isNewOrderOpen, paymentMethod]);

  // Filter dynamic config results
  const resolvedOrderTypes = (orderTypes.length > 0 || isConfigInitialized) ? orderTypes : DEFAULT_ORDER_TYPES.map((name, idx) => ({ id: `default_type_${idx}`, name }));
  const resolvedChannels = (channels.length > 0 || isConfigInitialized) ? channels : DEFAULT_CHANNELS_WITH_COLOR.map((item, idx) => ({ id: `default_channel_${idx}`, name: item.name, color: item.color }));
  const resolvedPlatforms = (platforms.length > 0 || isConfigInitialized) ? platforms : DEFAULT_PLATFORMS.map((name, idx) => ({ id: `default_platform_${idx}`, name }));
  const resolvedLogistics = (logistics.length > 0 || isConfigInitialized) ? logistics : DEFAULT_LOGISTICS.map((name, idx) => ({ id: `default_logistik_${idx}`, name }));
  const resolvedMarketplaces = (marketplaces.length > 0 || isConfigInitialized) ? marketplaces : DEFAULT_MARKETPLACES.map((name, idx) => ({ id: `default_marketplace_${idx}`, name }));

  // Target category based on buyerType in Orderan Baru form
  const targetCategory = useMemo(() => {
    if (buyerType === 'marketplace') return 'Marketplace';
    if (buyerType === 'reseller') return 'Reseller';
    return 'Direct Order';
  }, [buyerType]);

  // Filter channels based on target orderCategory
  const filteredChannels = useMemo(() => {
    const list = resolvedChannels.filter((c) => {
      if (c.orderCategory) {
        return c.orderCategory === targetCategory;
      }
      const nameLower = (c.name || '').toLowerCase();
      if (targetCategory === 'Marketplace') {
        return nameLower.includes('shopee') || nameLower.includes('tokopedia') || nameLower.includes('tiktok') || nameLower.includes('lazada') || nameLower.includes('bukalapak') || nameLower.includes('blibli');
      } else if (targetCategory === 'Reseller') {
        return nameLower.includes('reseller');
      } else {
        return !nameLower.includes('shopee') && !nameLower.includes('tokopedia') && !nameLower.includes('tiktok') && !nameLower.includes('lazada') && !nameLower.includes('bukalapak') && !nameLower.includes('blibli') && !nameLower.includes('reseller');
      }
    });
    return list.length > 0 ? list : resolvedChannels;
  }, [resolvedChannels, targetCategory]);

  // Filter platform orders based on payment method (COD vs Transfer) AND selected Opsi Pengiriman (pickupLogistics)
  const filteredPlatformsByPayment = useMemo(() => {
    const selectedLogisticsItem = resolvedLogistics.find((l: any) => l.name === pickupLogistics);
    return resolvedPlatforms.filter((p: any) => {
      // 1. Filter by payment method
      if (paymentMethod === 'COD' && p.isCod === false) return false;
      if (paymentMethod === 'Transfer' && p.isTransfer === false) return false;

      // 2. Filter by selected Opsi Pengiriman relation
      if (
        selectedLogisticsItem &&
        Array.isArray(selectedLogisticsItem.platforms) &&
        selectedLogisticsItem.platforms.length > 0
      ) {
        return selectedLogisticsItem.platforms.includes(p.name);
      }

      return true;
    });
  }, [resolvedPlatforms, paymentMethod, pickupLogistics, resolvedLogistics]);

  // Logistics options (Opsi Pengiriman) available to choose
  const availableLogistics = resolvedLogistics;

  // Sync dropdown choices dynamically when dynamic configurations are deleted or modified
  useEffect(() => {
    if (orderType === '') return;
    if (resolvedOrderTypes.length > 0) {
      const exists = resolvedOrderTypes.some((t) => t.name === orderType);
      if (!exists) {
        setOrderType(resolvedOrderTypes[0].name);
      }
    }
  }, [resolvedOrderTypes, orderType]);

  useEffect(() => {
    if (filteredChannels.length > 0) {
      const exists = filteredChannels.some((c) => c.name === platformChannel);
      if (!exists) {
        setPlatformChannel(filteredChannels[0].name);
      }
    }
  }, [filteredChannels, platformChannel]);

  useEffect(() => {
    if (editingOrder) return;
    const listToUse = buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment;
    if (listToUse.length > 0) {
      const exists = listToUse.some((p) => p.name === platformOrder);
      if (!exists) {
        setPlatformOrder(listToUse[0].name);
        const matched = listToUse[0];
        if (matched && matched.adminFee !== undefined) {
          setPlatformFeeInput(String(matched.adminFee));
        } else {
          setPlatformFeeInput('0');
        }
      }
    } else {
      setPlatformOrder('');
      setPlatformFeeInput('0');
    }
  }, [filteredPlatformsByPayment, resolvedMarketplaces, platformOrder, buyerType, editingOrder]);

  useEffect(() => {
    if (editingOrder) return;
    if (availableLogistics.length > 0) {
      const exists = availableLogistics.some((l) => l.name === pickupLogistics);
      if (!exists && pickupLogistics !== '') {
        setPickupLogistics(availableLogistics[0].name);
      }
    } else {
      setPickupLogistics('');
    }
  }, [availableLogistics, pickupLogistics, editingOrder]);

  const matchingBooks = bookSearch.trim().length >= 1 ? books.filter(b =>
    b.bookNameLower?.includes(bookSearch.toLowerCase()) ||
    b.author?.toLowerCase().includes(bookSearch.toLowerCase())
  ) : [];

  // Add book item to cart helper
  const handleAddBookToCart = (book: Book, isFree = false) => {
    // Auto pricing resolve
    let finalPrice = 0;
    if (!isFree) {
      if (buyerType === 'marketplace') {
        finalPrice = book.shopeePrice || book.generalPrice || 0;
      } else if (buyerType === 'reseller') {
        finalPrice = book.resellerPrice || book.generalPrice || 0;
      } else {
        finalPrice = platformChannel === 'Shopee' ? (book.shopeePrice || book.generalPrice || 0) : (book.generalPrice || 0);
      }
    }

    // If editing, preserve the original unit price of this item if it existed in the original order
    if (editingOrder && editingOrder.items) {
      const originalItem = editingOrder.items.find(
        (orig) => orig.bookId === book.id && orig.isFree === isFree
      );
      if (originalItem) {
        finalPrice = originalItem.unitPrice;
      }
    }

    // Find moving average cost for COGS Snapshot at sale time
    const invItem = inventories.find(i => i.bookId === book.id);
    const resolvedCogs = invItem ? invItem.movingAverageCost : 0;

    const existingIndex = isFree ? -1 : cartItems.findIndex(it => it.bookId === book.id && !it.isFree);
    if (existingIndex > -1) {
      const nextItems = [...cartItems];
      nextItems[existingIndex].qty += 1;
      nextItems[existingIndex].lineTotal = nextItems[existingIndex].qty * nextItems[existingIndex].unitPrice;
      setCartItems(nextItems);
    } else {
      setCartItems([...cartItems, {
        bookId: book.id,
        bookName: book.bookName,
        bookCover: book.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80',
        unitPrice: finalPrice,
        qty: 1,
        lineTotal: finalPrice,
        cogsSnapshot: resolvedCogs,
        isFree: isFree
      }]);
    }

    setBookSearch('');
    setShowSearchResults(false);
  };

  // Adjust Cart qty steppers
  const handleCartQtyChange = (idx: number, delta: number) => {
    const nextItems = [...cartItems];
    const newQty = nextItems[idx].qty + delta;
    if (newQty <= 0) {
      nextItems.splice(idx, 1);
    } else {
      nextItems[idx].qty = newQty;
      nextItems[idx].lineTotal = newQty * nextItems[idx].unitPrice;
    }
    setCartItems(nextItems);
  };

  // Pricing calculations
  const cartSubtotal = cartItems.reduce((acc, item) => acc + item.lineTotal, 0);
  const discountCents = Math.round(parseFloat(cleanCommas(discountInput)) * 100) || 0;
  const platformFeeCents = Math.round(parseFloat(cleanCommas(platformFeeInput)) * 100) || 0;
  const cartTotalPrice = Math.max(0, cartSubtotal - discountCents - platformFeeCents);

  // Business partner profit share percentage calculation
  const partnerSharePercent = parseFloat(partnerProfitPercent) || 0;
  const partnerProfitShareVal = orderType === 'Business Partner'
    ? Math.round((cartTotalPrice * partnerSharePercent) / 100)
    : 0;

  // Recalculate cart prices when buyer type or platform channel changes (auto pricing)
  useEffect(() => {
    if (cartItems.length === 0) return;
    const resolvedItems = cartItems.map(item => {
      if (item.isFree) return item;

      // If editing, preserve the original unit price of this item if it existed in the original order
      if (editingOrder && editingOrder.items) {
        const originalItem = editingOrder.items.find(
          (orig) => orig.bookId === item.bookId && orig.isFree === item.isFree
        );
        if (originalItem) {
          return {
            ...item,
            unitPrice: originalItem.unitPrice,
            lineTotal: item.qty * originalItem.unitPrice
          };
        }
      }

      const origBook = books.find(b => b.id === item.bookId);
      if (!origBook) return item;
      let nextPrice = origBook.generalPrice || 0;
      if (buyerType === 'marketplace') {
        nextPrice = origBook.shopeePrice || origBook.generalPrice || 0;
      } else if (buyerType === 'reseller') {
        nextPrice = origBook.resellerPrice || origBook.generalPrice || 0;
      } else {
        nextPrice = platformChannel === 'Shopee' ? (origBook.shopeePrice || origBook.generalPrice || 0) : (origBook.generalPrice || 0);
      }

      return {
        ...item,
        unitPrice: nextPrice,
        lineTotal: item.qty * nextPrice
      };
    });
    setCartItems(resolvedItems);
  }, [buyerType, platformChannel]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;

      // 3. Textarea Form Exception
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true')) {
        return; // Allow default line break
      }

      // Check if "Cari buku" input inside the main form has focus
      if (
        target instanceof HTMLInputElement &&
        target.placeholder &&
        target.placeholder.includes("Cari buku")
      ) {
        return;
      }

      // Contextual Modal Scope:
      // A. Revert Status / Confirmation Overlay (e.g., revertConfirmState)
      if (revertConfirmState) {
        e.preventDefault();
        e.stopPropagation();
        const triggerRevertConfirm = async () => {
          try {
            await revertConfirmState.onConfirm();
          } catch (err) {
            console.error("Gagal melakukan aksi:", err);
          } finally {
            setRevertConfirmState(null);
          }
        };
        triggerRevertConfirm();
        return;
      }

      // B. Return "Diambil" Confirmation Modal (confirmingDiambilOrder)
      if (confirmingDiambilOrder) {
        e.preventDefault();
        e.stopPropagation();
        handleProcessConfirmingDiambilOrder();
        return;
      }

      // C. Selesai Confirmation Overlay (confirmingSelesaiOrderId)
      if (confirmingSelesaiOrderId) {
        e.preventDefault();
        e.stopPropagation();
        const triggerSelesaiConfirm = async () => {
          if (isSelesaiSubmitting) return;
          // Guard yang sama seperti tombol "Ya, Selesai & Berhasil" di modal - tanpa ini
          // Enter melewati pengecekan dan user cuma dapat alert error dari server.
          const targetOrder = orders.find(o => o.id === confirmingSelesaiOrderId);
          const isTransfer = targetOrder?.paymentMethod === 'Transfer';
          const transferAlreadyPaid = targetOrder?.paymentStatus === 'paid' || (targetOrder?.amountPaid || 0) >= (targetOrder?.totalPrice || 0) - 5;
          if (isTransfer && !transferAlreadyPaid) return;
          if (!(await promptDoubleConfirmation("Menyelesaikan Pembayaran dan Status Orderan"))) return;
          try {
            setIsSelesaiSubmitting(true);
            await completeSalesOrderTransaction(confirmingSelesaiOrderId, user?.uid || 'anonymous', selesaiTermsDays);
            setConfirmingSelesaiOrderId(null);
          } catch (err: any) {
            console.error("Error setting order completed", err);
            alert(err?.message || 'Gagal menyelesaikan order.');
          } finally {
            setIsSelesaiSubmitting(false);
          }
        };
        triggerSelesaiConfirm();
        return;
      }

      // D. "Konfirmasi Kirim & Barcode No Resi" modal (isProsesConfirmOpen && selectedOrderForProses)
      if (isProsesConfirmOpen && selectedOrderForProses) {
        e.preventDefault();
        e.stopPropagation();
        const triggerProsesConfirm = async () => {
          if (isProsesSubmitting) return;
          const cleanResi = prosesResi.trim();
          if (!cleanResi) {
            triggerShake('prosesResi');
            return;
          }
          if (!(await promptDoubleConfirmation("Memproses Pengiriman dan Memotong Persediaan Stok"))) return;

          setIsProsesSubmitting(true);
          // Frontend stock verification
          const insufficientItems: string[] = [];
          for (const item of selectedOrderForProses.items || []) {
            const inv = inventories.find(i => i.bookId === item.bookId);
            const available = inv ? inv.endingStock : 0;
            if (available < item.qty) {
              insufficientItems.push(`${item.bookName} (Stok: ${available}, Dibutuhkan: ${item.qty})`);
            }
          }
          if (insufficientItems.length > 0) {
            safeAlert(`Gagal memproses: Stok tidak mencukupi untuk item berikut:\n${insufficientItems.join('\n')}`);
            setIsProsesSubmitting(false);
            return;
          }

          try {
            await confirmSalesOrderTransaction(selectedOrderForProses.id, user?.uid || 'anonymous');

            const orderRef = doc(db, 'salesOrders', selectedOrderForProses.id);
            const finalOrderNo = selectedOrderForProses.orderNumber || '';
            await updateDoc(orderRef, {
              status: 'shipped',
              shippedAt: Timestamp.now(),
              orderNumber: finalOrderNo,
              shipment: {
                orderNumber: finalOrderNo,
                shippingNumber: cleanResi,
                shippingDate: Timestamp.fromDate(new Date(prosesDate)),
                arrangedAt: Timestamp.now()
              },
              updatedAt: Timestamp.now()
            });

            setIsProsesConfirmOpen(false);
            setSelectedOrderForProses(null);
          } catch (err: any) {
            safeAlert(`Gagal konfirmasi pesanan: ${err.message}`);
          } finally {
            setIsProsesSubmitting(false);
          }
        };
        triggerProsesConfirm();
        return;
      }

      // E. "Orderan baru" form modal (isNewOrderOpen)
      if (isNewOrderOpen) {
        e.preventDefault();
        e.stopPropagation();
        handleOrderSubmit();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [
    isNewOrderOpen,
    isProsesConfirmOpen,
    isProsesSubmitting,
    selectedOrderForProses,
    prosesOrderNo,
    prosesResi,
    prosesDate,
    confirmingSelesaiOrderId,
    isSelesaiSubmitting,
    selesaiTermsDays,
    orders,
    confirmingDiambilOrder,
    selectedReturnMode,
    revertConfirmState,
    customerName,
    customerPlatformName,
    platformChannel,
    orderType,
    paymentMethod,
    phoneNumber,
    pickupLogistics,
    pickupDetails,
    cartItems,
    discountInput,
    partnerProfitPercent,
    customerNote,
    orderNumber,
    editingOrder,
    inventories,
    user,
    cartSubtotal,
    discountCents,
    cartTotalPrice,
    partnerProfitShareVal,
    shakeFields,
    triggerShake
  ]);

  // Compress image via canvas (returns a Blob)
  const compressSalesImage = (file: File | Blob, maxWidth = 600, maxHeight = 800, quality = 0.7): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file instanceof Blob ? file : file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Failed to get canvas context')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => { blob ? resolve(blob) : reject(new Error('Failed to compress image')); },
            'image/jpeg',
            quality
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Upload address photo to Firebase Storage; returns download URL.
  // Falls back to compressed base64 if Storage upload fails.
  const uploadAddressPhoto = async (dataUrl: string): Promise<string> => {
    // Convert data URL to Blob for compression
    const resp = await fetch(dataUrl);
    const originalBlob = await resp.blob();
    const compressedBlob = await compressSalesImage(originalBlob, 600, 800, 0.7);

    try {
      const storagePath = `sales-photos/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, compressedBlob, { contentType: 'image/jpeg' });
      return await getDownloadURL(storageRef);
    } catch (storageErr) {
      console.warn('Firebase Storage upload failed for address photo, falling back to compressed base64:', storageErr);
      // Fallback: return compressed base64 (much smaller than original)
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(compressedBlob);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
    }
  };

  // Strip bookCover from items to keep Firestore document small
  const stripItemCovers = (items: SalesOrderItem[]): SalesOrderItem[] => {
    return items.map(({ bookCover, ...rest }) => ({ ...rest, bookCover: '' }));
  };

  // Submit order to Firestore (Supports Create and Edit)
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') {
        return;
      }

      if (target instanceof HTMLInputElement && target.placeholder && target.placeholder.includes("Cari buku")) {
        e.preventDefault();
        if (matchingBooks.length > 0) {
          const firstBook = matchingBooks[0];
          handleAddBookToCart(firstBook);
          setBookSearch('');
          setShowSearchResults(false);
        }
        return;
      }

      e.preventDefault();
      handleOrderSubmit(e);
    }
  };

  const handleOrderSubmit = async (e?: React.FormEvent | React.MouseEvent, options: { isDraft?: boolean } = {}) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (isOrderSubmitting) return;

    let hasValidationError = false;
    const cleanPhone = phoneNumber.trim();

    if (buyerType === 'marketplace') {
      if (!customerPlatformName.trim() || customerPlatformName.trim().length > 100) {
        triggerShake('customerPlatformName');
        hasValidationError = true;
      }
    } else {
      if (!customerName.trim() || customerName.trim().length > 100) {
        triggerShake('customerName');
        hasValidationError = true;
      }

      if (!customerPlatformName.trim() || customerPlatformName.trim().length > 100) {
        triggerShake('customerPlatformName');
        hasValidationError = true;
      }

      const digitsOnly = cleanPhone.replace(/\D/g, '');
      const isValidLocal = cleanPhone.startsWith('0') && digitsOnly.length === 10;
      const isValidIntl = (cleanPhone.startsWith('+') || cleanPhone.startsWith('886')) && digitsOnly.length >= 7 && digitsOnly.length <= 15;

      if (!cleanPhone || (!isValidLocal && !isValidIntl)) {
        triggerShake('phoneNumber');
        hasValidationError = true;
      }
    }

    if (hasValidationError) {
      return;
    }

    if (cartItems.length === 0) {
      safeAlert("Peringatan: Keranjang orderan masih kosong. Silakan cari dan tambahkan buku terlebih dahulu.");
      return;
    }

    try {
      setIsOrderSubmitting(true);
      const orderDateTs = orderDateInput
        ? Timestamp.fromDate(new Date(`${orderDateInput}T12:00:00`))
        : Timestamp.now();

      const isMarketplace = buyerType === 'marketplace';
      const finalCustomerName = isMarketplace ? '' : customerName.trim().toUpperCase();
      const finalCustomerPlatformName = isMarketplace
        ? (customerPlatformName.trim() || customerName.trim())
        : customerPlatformName.trim();
      const finalPhone = isMarketplace ? '' : cleanPhone;
      const finalPickupLogistics = isMarketplace ? '' : (pickupLogistics || '');
      const finalPickupDetails = isMarketplace ? '' : (pickupDetails || '');
      const finalPaymentMethod = isMarketplace ? '' : (paymentMethod || '');
      const finalOrderType = isMarketplace ? '' : (orderType || '');
      const finalPlatformOrder = isMarketplace ? '' : (platformOrder || '');
      const finalPlatformChannel = isMarketplace ? (platformChannel || 'Shopee') : (platformChannel || '');

      if (editingOrder) {
        // Edit mode
        if (isLockedOrder) {
          if (!isOwner) {
            safeAlert("Anda tidak memiliki akses untuk mengedit order yang sudah diproses.");
            return;
          }
          if (!(await promptDoubleConfirmation("Menyimpan Perubahan Metadata Orderan (Tanpa merubah harga & stok)"))) return;
          const orderRef = doc(db, 'salesOrders', editingOrder.id);
          let resolvedAddressPhotoUrl = addressPhotoUrl;
          if (addressPhotoUrl && addressPhotoUrl.startsWith('data:')) {
            resolvedAddressPhotoUrl = await uploadAddressPhoto(addressPhotoUrl);
          }
          const metadataPayload: any = {
            orderDate: orderDateTs,
            customerName: finalCustomerName,
            customerPlatformName: finalCustomerPlatformName,
            platformChannel: finalPlatformChannel,
            platformOrder: finalPlatformOrder,
            orderType: finalOrderType,
            paymentMethod: finalPaymentMethod,
            phoneNumber: finalPhone,
            pickupLogistics: finalPickupLogistics,
            pickupDetails: finalPickupDetails,
            customerNote: customerNote || '',
            orderNumber: orderNumber || '',
            estimatedShippingDate: estimatedShippingDate || '',
            buyerType,
            partnerId: isMarketplace ? '' : (selectedPartner?.id || ''),
            partnerName: isMarketplace ? '' : (selectedPartner?.name || ''),
            addressPhotoUrl: resolvedAddressPhotoUrl,
            updatedAt: Timestamp.now()
          };
          // Explicitly NOT updating items, subtotal, discount, platformFee, totalPrice, partnerProfitShare
          try {
            await updateDoc(orderRef, metadataPayload);
            setIsNewOrderOpen(false);
            setEditingOrder(null);
            resetOrderForm();
          } catch (err: any) {
            console.error("Failed updating metadata", err);
            safeAlert(`Gagal update: ${err.message}`);
          } finally {
            setIsOrderSubmitting(false);
          }
          return;
        }

        if (!(await promptDoubleConfirmation("Menyimpan Perubahan Orderan"))) {
          setIsOrderSubmitting(false);
          return;
        }
        const orderRef = doc(db, 'salesOrders', editingOrder.id);

        // Upload address photo to Storage if it's a base64 data URL
        let resolvedAddressPhotoUrl = addressPhotoUrl;
        if (addressPhotoUrl && addressPhotoUrl.startsWith('data:')) {
          resolvedAddressPhotoUrl = await uploadAddressPhoto(addressPhotoUrl);
        }

        const updatePayload: any = {
          orderDate: orderDateTs,
          customerName: finalCustomerName,
          customerPlatformName: finalCustomerPlatformName,
          platformChannel: finalPlatformChannel,
          platformOrder: finalPlatformOrder,
          orderType: finalOrderType,
          paymentMethod: finalPaymentMethod,
          phoneNumber: finalPhone,
          pickupLogistics: finalPickupLogistics,
          pickupDetails: finalPickupDetails,
          customerNote: customerNote || '',
          orderNumber: orderNumber || '',
          estimatedShippingDate: estimatedShippingDate || '',
          buyerType,
          partnerId: isMarketplace ? '' : (selectedPartner?.id || ''),
          partnerName: isMarketplace ? '' : (selectedPartner?.name || ''),
          addressPhotoUrl: resolvedAddressPhotoUrl,
          isDraft: options.isDraft ?? false,
          items: stripItemCovers(cartItems),
          subtotal: cartSubtotal,
          discount: discountCents,
          platformFee: platformFeeCents,
          totalPrice: cartTotalPrice,
          partnerProfitShare: partnerProfitShareVal,
          updatedAt: Timestamp.now()
        };
        await updateDoc(orderRef, updatePayload);
        setIsNewOrderOpen(false);
        setEditingOrder(null);
        resetOrderForm();
      } else {
        // Create mode
        if (!(await promptDoubleConfirmation("Mencatat Orderan Baru"))) return;
        const orderCode = await generateOrderCode('S');
        const orderId = doc(collection(db, 'salesOrders')).id;
        const orderRef = doc(db, 'salesOrders', orderId);

        // Upload address photo to Storage if it's a base64 data URL
        let resolvedAddressPhotoUrl = addressPhotoUrl;
        if (addressPhotoUrl && addressPhotoUrl.startsWith('data:')) {
          resolvedAddressPhotoUrl = await uploadAddressPhoto(addressPhotoUrl);
        }

        const orderPayload: any = {
          id: orderId,
          orderCode,
          orderDate: orderDateTs,
          customerName: finalCustomerName,
          customerPlatformName: finalCustomerPlatformName,
          platformChannel: finalPlatformChannel,
          platformOrder: finalPlatformOrder,
          orderType: finalOrderType,
          paymentMethod: finalPaymentMethod,
          phoneNumber: finalPhone,
          pickupLogistics: finalPickupLogistics,
          pickupDetails: finalPickupDetails,
          customerNote: customerNote || '',
          orderNumber: orderNumber || '',
          estimatedShippingDate: estimatedShippingDate || '',
          buyerType,
          partnerId: isMarketplace ? '' : (selectedPartner?.id || ''),
          partnerName: isMarketplace ? '' : (selectedPartner?.name || ''),
          addressPhotoUrl: resolvedAddressPhotoUrl,
          isDraft: options.isDraft ?? false,
          items: stripItemCovers(cartItems),
          subtotal: cartSubtotal,
          discount: discountCents,
          platformFee: platformFeeCents,
          totalPrice: cartTotalPrice,
          status: 'draft',
          partnerProfitShare: partnerProfitShareVal,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: user?.uid || 'anonymous'
        };

        await setDoc(orderRef, orderPayload);

        // Dispatch LINE notification asynchronously
        if (lineSettings?.enabled && lineSettings?.channelAccessToken) {
          fetch('/api/line/notify-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channelAccessToken: lineSettings.channelAccessToken,
              ownerUserId: lineSettings.ownerUserId,
              resellerUserId: lineSettings.resellerUserId,
              notifyOwnerNewOrder: lineSettings.notifyOwnerNewOrder,
              notifyResellerNewOrder: lineSettings.notifyResellerNewOrder,
              orderData: orderPayload
            })
          }).catch((err) => console.warn('Gagal mengirim notifikasi LINE:', err));
        }

        setIsNewOrderOpen(false);
        if (!options.isDraft && cartItems.length > 0) {
          const bookIds = cartItems.map(item => item.bookId);
          const categories = new Set<string>();
          cartItems.forEach(item => {
            const b = books.find(bk => bk.id === item.bookId);
            if (b) {
              const catArray = Array.isArray(b.category) ? b.category : [b.category];
              catArray.forEach(c => categories.add(c));
            }
          });
          if (categories.size > 0) {
            setRecoOrderData({
              bookIds,
              categories: Array.from(categories)
            });
          }
        }
        resetOrderForm();
      }
    } catch (err: any) {
      console.error("Error saving sales order", err);
      safeAlert(`Gagal menyimpan orderan: ${err.message || err}`);
    } finally {
      setIsOrderSubmitting(false);
    }
  };

  const resetOrderForm = () => {
    setOrderDateInput(new Date().toISOString().slice(0, 10));
    setCustomerName('');
    setCustomerPlatformName('');
    setPlatformChannel(resolvedChannels[0]?.name || 'WhatsApp');
    setPlatformOrder(resolvedPlatforms[0]?.name || 'Shopee');
    setOrderType('');
    setPaymentMethod('COD');
    setPhoneNumber('');
    setPickupLogistics(resolvedLogistics[0]?.name || '');
    setPickupDetails('');
    setCartItems([]);
    setDiscountInput('0');
    setPlatformFeeInput('0');
    setGrandTotalInput('');
    setIsEditingGrandTotal(false);
    setPartnerProfitPercent('0');
    setCustomerNote('');
    setOrderNumber('');
    setEstimatedShippingDate('');
    setPerluKonfirmasiSebelumKirim(false);
    setPhoneWarning('');
    setBuyerType('langsung');
    setSelectedPartner(null);
    setAddressPhotoUrl('');
    setAddressPhotoFile(null);
  };

  const handleTogglePlatformOngkosKirim = async (item: PlatformOrderConfig) => {
    const currentEnabled = item.ongkosKirim ?? platformAutoConfig[item.name]?.enabled ?? false;
    const newEnabled = !currentEnabled;

    try {
      if (item.id && !item.id.startsWith('default_')) {
        await updateDoc(doc(db, 'categories', item.id), {
          ongkosKirim: newEnabled
        });
      } else {
        const docId = `config_platform_default_${item.name.toLowerCase().replace(/\s+/g, '_')}`;
        await setDoc(doc(db, 'categories', docId), {
          name: item.name,
          ongkosKirim: newEnabled,
          createdAt: Timestamp.now()
        }, { merge: true });
      }

      const updatedConfig = {
        ...platformAutoConfig,
        [item.name]: {
          enabled: newEnabled,
          enabledAt: newEnabled ? new Date().toISOString() : (platformAutoConfig[item.name]?.enabledAt || new Date().toISOString())
        }
      };
      await setDoc(doc(db, 'settings', 'ongkir_platform_config'), { platforms: updatedConfig }, { merge: true });
    } catch (err) {
      console.error("Error toggling platform ongkos kirim:", err);
    }
  };

  const handleAddConfig = async (tab: 'type' | 'channel' | 'platform' | 'logistik' | 'marketplace', name: string) => {
    if (!name.trim()) {
      triggerShake('configInput');
      return;
    }
    try {
      // Check for duplicates
      const currentList = tab === 'type' ? resolvedOrderTypes
        : (tab === 'channel' ? resolvedChannels
          : (tab === 'platform' ? resolvedPlatforms
            : (tab === 'logistik' ? resolvedLogistics
              : resolvedMarketplaces)));

      if (currentList.some(item => item.name?.toLowerCase() === name.trim().toLowerCase())) {
        safeAlert(`Peringatan: Konfigurasi "${name.trim()}" sudah ada.`);
        return;
      }

      // Generate custom ID
      const newId = `config_${tab}_${doc(collection(db, 'categories')).id}`;
      const nextPosition = currentList.length;

      // If Firestore collections are currently empty, copy remaining defaults to Firestore first (omitting nothing)
      // to avoid suddenly populating ONLY the new item.
      if (tab === 'type' && orderTypes.length === 0) {
        for (const [idx, def] of DEFAULT_ORDER_TYPES.entries()) {
          const defId = `config_type_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
        }
      } else if (tab === 'channel' && channels.length === 0) {
        for (const [idx, def] of DEFAULT_CHANNELS_WITH_COLOR.entries()) {
          const defId = `config_channel_default_${def.name.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'categories', defId), { name: def.name, color: def.color, position: idx, createdAt: Timestamp.now() });
        }
      } else if (tab === 'platform' && platforms.length === 0) {
        for (const [idx, def] of DEFAULT_PLATFORMS.entries()) {
          const defId = `config_platform_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
        }
      } else if (tab === 'logistik' && logistics.length === 0) {
        for (const [idx, def] of DEFAULT_LOGISTICS.entries()) {
          const defId = `config_logistik_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
        }
      } else if (tab === 'marketplace' && marketplaces.length === 0) {
        for (const [idx, def] of DEFAULT_MARKETPLACES.entries()) {
          const defId = `config_marketplace_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
        }
      }

      const payload: any = {
        name: name.trim(),
        position: nextPosition,
        createdAt: Timestamp.now()
      };

      if (tab === 'platform') {
        payload.ongkosKirim = newPlatformOngkosKirim;
      }

      await setDoc(doc(db, 'categories', newId), payload);

      if (tab === 'platform') {
        const updatedConfig = {
          ...platformAutoConfig,
          [name.trim()]: {
            enabled: newPlatformOngkosKirim,
            enabledAt: new Date().toISOString()
          }
        };
        await setDoc(doc(db, 'settings', 'ongkir_platform_config'), { platforms: updatedConfig }, { merge: true });
        setNewPlatformOngkosKirim(false);
      }

      setConfigInputVal('');
    } catch (err: any) {
      safeAlert(`Gagal menambah konfigurasi: ${err.message}`);
    }
  };

  const handleEditConfig = async (tab: 'type' | 'channel' | 'platform' | 'logistik' | 'marketplace', id: string, oldName: string, newName: string) => {
    if (!newName.trim()) {
      triggerShake(`editConfig_${id}`);
      return;
    }
    try {
      // Check for duplicates (excluding self)
      const currentList = tab === 'type' ? resolvedOrderTypes
        : (tab === 'channel' ? resolvedChannels
          : (tab === 'platform' ? resolvedPlatforms
            : (tab === 'logistik' ? resolvedLogistics
              : resolvedMarketplaces)));

      if (currentList.some(item => item.id !== id && item.name?.toLowerCase() === newName.trim().toLowerCase())) {
        safeAlert(`Peringatan: Konfigurasi "${newName.trim()}" sudah ada.`);
        return;
      }

      // If it's a default fallback proxy
      if (id.startsWith('default_type_') || id.startsWith('default_channel_') || id.startsWith('default_platform_') || id.startsWith('default_logistik_') || id.startsWith('default_marketplace_')) {
        // We first populate all current defaults (with the edited one replaced) into Firestore
        const defaultsList = tab === 'type' ? DEFAULT_ORDER_TYPES
          : (tab === 'channel' ? DEFAULT_CHANNELS
            : (tab === 'platform' ? DEFAULT_PLATFORMS
              : (tab === 'logistik' ? DEFAULT_LOGISTICS
                : DEFAULT_MARKETPLACES)));

        for (const [idx, def] of defaultsList.entries()) {
          const finalName = def === oldName ? newName.trim() : def;
          const defId = `config_${tab}_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'categories', defId), { name: finalName, position: idx, createdAt: Timestamp.now() });
        }
      } else {
        await updateDoc(doc(db, 'categories', id), { name: newName.trim() });
      }
      setEditingConfigId(null);
      setEditingConfigVal('');

      // Propagate update to existing orders
      try {
        let fieldToUpdate = '';
        if (tab === 'type') fieldToUpdate = 'orderType';
        if (tab === 'channel') fieldToUpdate = 'platformChannel';
        if (tab === 'platform') fieldToUpdate = 'platformOrder';
        if (tab === 'marketplace') fieldToUpdate = 'platformOrder';
        if (tab === 'logistik') fieldToUpdate = 'pickupLogistics';

        if (fieldToUpdate && oldName) {
          const q = query(collection(db, 'salesOrders'), where(fieldToUpdate, '==', oldName));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          let count = 0;
          snapshot.forEach((docItem) => {
            batch.update(docItem.ref, { [fieldToUpdate]: newName.trim() });
            count++;
          });
          if (count > 0) {
            await batch.commit();
            console.log(`Updated ${count} orders for ${fieldToUpdate}`);
          }
        }
      } catch (err) {
        console.error("Failed to propagate config edit to orders:", err);
      }
    } catch (err: any) {
      safeAlert(`Gagal mengubah konfigurasi: ${err.message}`);
    }
  };

  const handleDeleteConfig = async (tab: 'type' | 'channel' | 'platform' | 'logistik' | 'marketplace', id: string, nameToDelete: string, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm(`Apakah kamu yakin ingin menghapus "${nameToDelete}"?`)) return;
    try {
      console.log(`[Delete Action] Attempting to delete ID: "${id}" (Name: "${nameToDelete}") from collection 'categories' (${tab})`);

      // 1. Instantly filter local state arrays
      if (tab === 'type') {
        setOrderTypes(prevTypes => prevTypes.filter(item => item.id !== id));
      } else if (tab === 'channel') {
        setChannels(prevChannels => prevChannels.filter(item => item.id !== id));
      } else if (tab === 'platform') {
        setPlatforms(prevPlatforms => prevPlatforms.filter(item => item.id !== id));
      } else if (tab === 'logistik') {
        setLogistics(prevLogistics => prevLogistics.filter(item => item.id !== id));
      } else {
        setMarketplaces(prevMarketplaces => prevMarketplaces.filter(item => item.id !== id));
      }

      // 2. Write/Delete on Firestore
      if (id.startsWith('default_type_') || id.startsWith('default_channel_') || id.startsWith('default_platform_') || id.startsWith('default_logistik_') || id.startsWith('default_marketplace_')) {
        // Mark initializer true so resolving logic doesn't use static fallback DEFAULT_ORDER_TYPES array
        await setDoc(doc(db, 'categories', 'config_initialized'), {
          orderTypes: true,
          channels: true,
          platforms: true,
          logistics: true,
          marketplaces: true,
          v2: true,
          createdAt: Timestamp.now()
        });
        setIsConfigInitialized(true);

        const defaultsList = tab === 'type' ? DEFAULT_ORDER_TYPES
          : (tab === 'channel' ? DEFAULT_CHANNELS
            : (tab === 'platform' ? DEFAULT_PLATFORMS
              : (tab === 'logistik' ? DEFAULT_LOGISTICS
                : DEFAULT_MARKETPLACES)));

        for (const [idx, def] of defaultsList.entries()) {
          if (def !== nameToDelete) {
            const defId = `config_${tab}_default_${def.toLowerCase().replace(/\s+/g, '_')}`;
            await setDoc(doc(db, 'categories', defId), { name: def, position: idx, createdAt: Timestamp.now() });
          }
        }
        console.log(`[Delete Action] Successfully processed default proxy deletion for: "${nameToDelete}"`);
      } else {
        await deleteDoc(doc(db, 'categories', id));
        console.log(`[Delete Action] Successfully deleted Firestore document with ID: "${id}"`);
      }
    } catch (error: any) {
      console.error(error);
      alert("Gagal menghapus data: " + error.message);
    }
  };

  const handleDeleteItem = async (e: any, id: string) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log("handleDeleteItem called with ID:", id);
    if (!id) {
      console.error("handleDeleteItem: ID is undefined or empty!");
      return;
    }
    const item = (manageActiveTab === 'type' ? resolvedOrderTypes
      : (manageActiveTab === 'channel' ? resolvedChannels
        : (manageActiveTab === 'platform' ? resolvedPlatforms
          : (manageActiveTab === 'logistik' ? resolvedLogistics
            : resolvedMarketplaces)))).find((x) => x.id === id);

    if (!item) {
      console.warn("Item not found in lists for ID:", id);
      return;
    }
    setDeleteConfigState({
      type: 'individual',
      itemId: id,
      itemName: item.name,
      tab: manageActiveTab
    });
  };

  const handleClearAllConfig = async (tab: 'type' | 'channel' | 'platform' | 'logistik' | 'marketplace', skipConfirm = false) => {
    const listName = tab === 'type' ? 'Sumber Campaign'
      : (tab === 'channel' ? 'Channel'
        : (tab === 'platform' ? 'Platform Order'
          : (tab === 'marketplace' ? 'Platform Marketplace' : 'Opsi Pengiriman')));

    if (!skipConfirm && !window.confirm(`Apakah kamu yakin ingin menghapus semua list "${listName}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const itemsToClear = tab === 'type' ? resolvedOrderTypes
        : (tab === 'channel' ? resolvedChannels
          : (tab === 'platform' ? resolvedPlatforms
            : (tab === 'logistik' ? resolvedLogistics
              : resolvedMarketplaces)));

      console.log(`[Clear All Action] Attempting to clear all ${itemsToClear.length} items for "${tab}"`);

      // 1. Instantly set local state to empty array
      if (tab === 'type') {
        setOrderTypes([]);
      } else if (tab === 'channel') {
        setChannels([]);
      } else if (tab === 'platform') {
        setPlatforms([]);
      } else if (tab === 'logistik') {
        setLogistics([]);
      } else {
        setMarketplaces([]);
      }

      // 2. Mark config as initialized so the static arrays aren't shown as defaults anymore
      await setDoc(doc(db, 'categories', 'config_initialized'), {
        orderTypes: true,
        channels: true,
        platforms: true,
        logistics: true,
        marketplaces: true,
        v2: true,
        createdAt: Timestamp.now()
      });
      setIsConfigInitialized(true);

      // 3. Delete any documents on Firestore in parallel
      const deletePromises = itemsToClear
        .filter(item =>
          !item.id.startsWith('default_type_') &&
          !item.id.startsWith('default_channel_') &&
          !item.id.startsWith('default_platform_') &&
          !item.id.startsWith('default_logistik_') &&
          !item.id.startsWith('default_marketplace_')
        )
        .map(item => {
          console.log(`[Clear All Action] Deleting document ID: "${item.id}"`);
          return deleteDoc(doc(db, 'categories', item.id));
        });

      await Promise.all(deletePromises);
      console.log(`[Clear All Action] Successfully cleared all config items on Firestore and local state.`);
    } catch (error: any) {
      console.error(error);
      alert("Gagal menghapus data: " + error.message);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = async (e: React.DragEvent, hoverIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === hoverIndex) return;

    const activeList = manageActiveTab === 'type' ? [...orderTypes]
      : (manageActiveTab === 'channel' ? [...channels]
        : (manageActiveTab === 'platform' ? [...platforms]
          : (manageActiveTab === 'logistik' ? [...logistics]
            : [...marketplaces])));

    const draggedItem = activeList[draggedIndex];
    activeList.splice(draggedIndex, 1);
    activeList.splice(hoverIndex, 0, draggedItem);

    if (manageActiveTab === 'type') {
      setOrderTypes(activeList);
    } else if (manageActiveTab === 'channel') {
      setChannels(activeList);
    } else if (manageActiveTab === 'platform') {
      setPlatforms(activeList);
    } else if (manageActiveTab === 'logistik') {
      setLogistics(activeList);
    } else {
      setMarketplaces(activeList);
    }

    setDraggedIndex(hoverIndex);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;
    const finalDraggedIndex = draggedIndex;
    setDraggedIndex(null);

    try {
      const activeList = manageActiveTab === 'type' ? orderTypes
        : (manageActiveTab === 'channel' ? channels
          : (manageActiveTab === 'platform' ? platforms
            : (manageActiveTab === 'logistik' ? logistics
              : marketplaces)));

      const batch = writeBatch(db);
      activeList.forEach((item, index) => {
        if (item.id.startsWith('default_type_') || item.id.startsWith('default_channel_') || item.id.startsWith('default_platform_') || item.id.startsWith('default_logistik_') || item.id.startsWith('default_marketplace_')) {
          const docId = `config_${manageActiveTab}_default_${item.name.toLowerCase().replace(/\s+/g, '_')}`;
          batch.set(doc(db, 'categories', docId), {
            name: item.name,
            position: index,
            createdAt: Timestamp.now()
          });
        } else {
          batch.update(doc(db, 'categories', item.id), {
            position: index
          });
        }
      });
      await batch.commit();
      console.log("Successfully saved drag-reorder positions to Firestore");
    } catch (err) {
      console.error("Failed to save reorder positions:", err);
    }
  };

  const handlePhoneChange = (val: string) => {
    const limited = val.slice(0, 10);
    setPhoneNumber(limited);
    setPhoneWarning('');
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('print-faktur-area');
    if (!element) return;

    // Helper: converts oklch(L C H / A) layout style to standard rgb/rgba
    const oklchToRgb = (oklchStr: string): string => {
      const regex = /oklch\s*\(\s*([\d\.]+%?)\s+([\d\.]+)\s+([\d\.]+(?:deg|rad|turn)?)(?:\s*\/\s*([\d\.]+%?))?\s*\)/g;

      return oklchStr.replace(regex, (match, lStr, cStr, hStr, aStr) => {
        let L = parseFloat(lStr);
        if (lStr.endsWith('%')) {
          L = L / 100;
        }
        let C = parseFloat(cStr);
        let H = parseFloat(hStr);
        if (hStr.endsWith('rad')) {
          H = (H * 180) / Math.PI;
        } else if (hStr.endsWith('turn')) {
          H = H * 360;
        }

        let alpha = 1;
        if (aStr) {
          if (aStr.endsWith('%')) {
            alpha = parseFloat(aStr) / 100;
          } else {
            alpha = parseFloat(aStr);
          }
        }

        const hRad = (H * Math.PI) / 180;
        const aVal = C * Math.cos(hRad);
        const bVal = C * Math.sin(hRad);

        const l_ = L + 0.3963377774 * aVal + 0.2158037573 * bVal;
        const m_ = L - 0.1055613458 * aVal - 0.0638541728 * bVal;
        const s_ = L - 0.0894841775 * aVal - 1.2914855480 * bVal;

        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;

        const rLinear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

        const f = (c: number) => {
          return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        };

        let r = Math.round(f(rLinear) * 255);
        let g = Math.round(f(gLinear) * 255);
        let b = Math.round(f(bLinear) * 255);

        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));

        if (alpha === 1) {
          return `rgb(${r}, ${g}, ${b})`;
        } else {
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      });
    };

    const processRules = (rules: CSSRuleList) => {
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        try {
          if (rule instanceof CSSStyleRule) {
            if (rule.style && rule.style.cssText) {
              if (rule.style.cssText.includes('oklch')) {
                for (let j = 0; j < rule.style.length; j++) {
                  const prop = rule.style[j];
                  const val = rule.style.getPropertyValue(prop);
                  if (val && val.includes('oklch')) {
                    rule.style.setProperty(prop, oklchToRgb(val));
                  }
                }
              }
            }
          } else if ((rule as any).cssRules) {
            processRules((rule as any).cssRules);
          }
        } catch (e) {
          // ignore CORS or individual rule errors
        }
      }
    };

    try {
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // 1. Convert all <style> tags content containing oklch
          const styleTags = clonedDoc.querySelectorAll('style');
          styleTags.forEach((tag) => {
            if (tag.innerHTML) {
              tag.innerHTML = oklchToRgb(tag.innerHTML);
            }
          });

          // 2. Process all stylesheets rules recursively to replace variables and classes
          for (let i = 0; i < clonedDoc.styleSheets.length; i++) {
            const sheet = clonedDoc.styleSheets[i];
            try {
              if (sheet.cssRules) {
                processRules(sheet.cssRules);
              }
            } catch (e) {
              // Ignore CORS restricted stylesheets
            }
          }

          // 3. Traverses DOM and rewrite any inline elements containing oklch CSS values
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el: any) => {
            if (el.style) {
              const inlineStyle = el.getAttribute('style');
              if (inlineStyle && inlineStyle.includes('oklch')) {
                el.setAttribute('style', oklchToRgb(inlineStyle));
              }
            }
          });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const jsPDF = await loadJsPDF();
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Invoice-${printInvoiceOrder?.orderCode || 'Faktur'}.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      safeAlert("Gagal mengunduh PDF. Silakan coba lagi.");
    }
  };

  const safeAlert = (msg: string) => {
    try {
      window.alert(msg);
    } catch (e) {
      console.warn("window.alert blocked:", msg);
    }
  };

  const promptDoubleConfirmation = (actionLabel: string): Promise<boolean> => {
    return Promise.resolve(true);
  };

  const handleConfirmKemas = async () => {
    if (!confirmingKemasOrder) return;
    if (isShippingDateFuture(confirmingKemasOrder.estimatedShippingDate)) {
      safeAlert(`Belum Waktunya Untuk Dikemas, Request Customer Adalah ${confirmingKemasOrder.estimatedShippingDate?.replace(/-/g, '/')}`);
      setConfirmingKemasOrder(null);
      return;
    }
    setIsKemasSubmitting(true);
    try {
      await packSalesOrderTransaction(confirmingKemasOrder.id, user?.uid || 'anonymous');
      setConfirmingKemasOrder(null);
    } catch (err: any) {
      console.error("Gagal mengemas order:", err);
      safeAlert(`Gagal menandai order sebagai Dikemas: ${err.message || err}`);
    } finally {
      setIsKemasSubmitting(false);
    }
  };

  const handleTogglePin = async (order: SalesOrder) => {
    try {
      const orderRef = doc(db, 'salesOrders', order.id);
      const isCurrentlyPinned = !!order.isPinned;
      await updateDoc(orderRef, {
        isPinned: !isCurrentlyPinned,
        pinnedAt: !isCurrentlyPinned ? Timestamp.now() : null
      });
    } catch (err: any) {
      console.error("Gagal toggle pin:", err);
      safeAlert(`Gagal mengubah status pin: ${err.message || err}`);
    }
  };

  const handleRevertToPacked = async (order: SalesOrder) => {
    if (!(await promptDoubleConfirmation("Kembali ke status 'Dikemas'?"))) return;
    try {
      await reverseSalesOrderTransaction(order.id, user?.uid || 'anonymous', 'packed', 'stock');
    } catch (err) {
      console.error("Error reverting status to packed", err);
    }
  };

  const handleRevertPackedToDraft = async (order: SalesOrder) => {
    try {
      await reverseSalesOrderTransaction(order.id, user?.uid || 'anonymous', 'draft', 'stock');
    } catch (err: any) {
      console.error("Error reverting packed status to draft", err);
      safeAlert(`Gagal mengembalikan status ke Pending: ${err.message || err}`);
    }
  };

  // Revert back status transitions (conditional paths with step-back tracking)
  const handleRevertToDraft = async (order: SalesOrder) => {
    if (!(await promptDoubleConfirmation("Kembali ke status 'Pending' (Draft) dan Mengembalikan Kuantitas Stok Ke Rak?"))) return;
    try {
      await reverseSalesOrderTransaction(order.id, user?.uid || 'anonymous', 'draft', 'stock');
    } catch (err) {
      console.error("Error reverting status to draft", err);
    }
  };

  const handleRevertToShipped = async (order: SalesOrder) => {
    if (!(await promptDoubleConfirmation("Kembali ke status 'Dikirim'"))) return;
    try {
      if (order.status === 'returned') {
        const orderRef = doc(db, 'salesOrders', order.id);
        await updateDoc(orderRef, {
          status: 'shipped',
          returnedAt: null,
          updatedAt: Timestamp.now()
        });
      } else {
        await revertCompletedSalesOrderToShipped(order.id, user?.uid || 'anonymous');
      }
    } catch (err: any) {
      console.error("Error reverting status to shipped", err);
      safeAlert(`Gagal mengembalikan status ke Dikirim: ${err.message || err}`);
    }
  };

  const handleRevertToPreceding = async (order: SalesOrder) => {
    const target = order.precedingStatus === 'returned' ? 'returned' : 'draft';
    const targetLabel = target === 'returned' ? 'Return' : 'Pending (Draft)';
    if (!(await promptDoubleConfirmation(`Kembali ke status sebelumnya '${targetLabel}'`))) return;
    try {
      if (target === 'returned' && order.diambilAt) {
        await revertDiambilToReturned(order.id, user?.uid || 'anonymous');
      } else {
        const orderRef = doc(db, 'salesOrders', order.id);
        const updateData: any = {
          status: target,
          updatedAt: Timestamp.now()
        };
        if (target === 'draft') {
          updateData.shipment = null;
        }
        await updateDoc(orderRef, updateData);
      }
    } catch (err: any) {
      console.error("Error reverting cancel status", err);
      safeAlert(`Gagal mengembalikan status: ${err.message || err}`);
    }
  };

  const handleTransitionToReturned = async (orderId: string) => {
    setRevertConfirmState({
      message: "Apakah kamu yakin ingin menandai orderan ini sebagai 'Return'?",
      onConfirm: async () => {
        try {
          const orderRef = doc(db, 'salesOrders', orderId);
          await updateDoc(orderRef, {
            status: 'returned',
            returnedAt: Timestamp.now(),
            precedingStatus: 'shipped',
            updatedAt: Timestamp.now()
          });
        } catch (err: any) {
          console.error("Error setting return status", err);
          safeAlert(`Gagal menandai return: ${err.message || err}`);
        }
      }
    });
  };

  const handleTransitionToCancelled = async (order: SalesOrder) => {
    if (!(await promptDoubleConfirmation("Membatalkan orderan (Cancel)"))) return;
    try {
      await reverseSalesOrderTransaction(order.id, user?.uid || 'anonymous', 'cancelled', 'stock');
    } catch (err) {
      console.error("Error cancelling order", err);
    }
  };

  const handleDeleteOrder = (order: SalesOrder) => {
    setSelectedOrderForDelete(order);
  };

  const handleProcessConfirmingDiambilOrder = async () => {
    if (!confirmingDiambilOrder) return;
    const isStock = selectedReturnMode === 'stock';
    const modeLabel = isStock
      ? "Mengambil Buku Return dan Mengembalikan Kuantitas Stok Ke Rak"
      : "Menghapuskan/Menulis-off Buku Return sebagai Rusak / Hilang (Tanpa Mengajukan Stok)";
    if (!(await promptDoubleConfirmation(modeLabel))) return;
    try {
      await reverseSalesOrderTransaction(
        confirmingDiambilOrder.id,
        user?.uid || 'anonymous',
        'cancelled',
        isStock ? 'stock' : 'damaged'
      );

      const orderRef = doc(db, 'salesOrders', confirmingDiambilOrder.id);
      await updateDoc(orderRef, {
        diambilAt: Timestamp.now(),
        precedingStatus: 'returned'
      });

      if (!isStock) {
        // When Rusak/Hilang selected, record damaged stock so "Stok" is reduced and "Stok digudang" stays unchanged
        for (const item of confirmingDiambilOrder.items || []) {
          if (item.bookId && item.qty > 0) {
            const damagedId = doc(collection(db, 'damagedStock')).id;
            const ledgerId = `LEDGER-${damagedId}`;
            const journalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
            const batch = writeBatch(db);

            const ledgerRef = doc(db, 'inventoryLedger', ledgerId);
            batch.set(ledgerRef, {
              id: ledgerId,
              bookId: item.bookId,
              timestamp: Timestamp.now(),
              type: 'damaged_stock',
              qtyDelta: -item.qty,
              unitCost: Math.round((item.cogsSnapshot || 0)),
              refCollection: 'damagedStock',
              refId: damagedId,
              note: `Buku Return Rusak/Hilang (SO ${confirmingDiambilOrder.orderCode || confirmingDiambilOrder.id})`
            });

            const damagedRef = doc(db, 'damagedStock', damagedId);
            const totalLoss = (item.cogsSnapshot || 0) * item.qty;
            const docNo = `PS${new Date().toISOString().replace(/-/g, '').substring(2, 8)}${Math.floor(100 + Math.random() * 900)}`;
            batch.set(damagedRef, {
              id: damagedId,
              docNo: docNo,
              adjustmentType: 'Barang Rusak',
              bookId: item.bookId,
              bookName: item.bookName || '',
              qty: item.qty,
              date: new Date().toISOString().substring(0, 10),
              notes: `Return Rusak/Hilang (SO ${confirmingDiambilOrder.orderCode || confirmingDiambilOrder.id})`,
              unitCost: item.cogsSnapshot || 0,
              totalCost: totalLoss,
              journalId: journalId,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now()
            });

            // Create Journal Entry
            const journalRef = doc(db, 'journalEntries', journalId);
            const journalLines = [
              { account: 'Beban Lain-lain', accountCode: '5500', debit: totalLoss, credit: 0 },
              { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: totalLoss }
            ];
            batch.set(journalRef, {
              id: journalId,
              date: Timestamp.now(),
              description: `Barang Rusak - ${item.bookName} ${item.qty} pcs (SO ${confirmingDiambilOrder.orderCode || confirmingDiambilOrder.id})`,
              lines: journalLines,
              refCollection: 'damagedStock',
              refId: damagedId,
              amount: totalLoss
            });

            await batch.commit();
          }
        }
      }

      const successMsg = isStock
        ? "Sukses: Stok buku telah dikembalikan ke gudang."
        : "Sukses: Order dihapuskan tanpa mengembalikan stok ke gudang (Dicatat sebagai Rusak/Hilang).";
      safeAlert(successMsg);
      setConfirmingDiambilOrder(null);
    } catch (err: any) {
      safeAlert(`Gagal update: ${err.message}`);
    }
  };

  const handleConfirmDeleteOrder = async () => {
    if (!selectedOrderForDelete || isDeleteOrderSubmitting) return;
    setIsDeleteOrderSubmitting(true);
    try {
      await deleteDoc(doc(db, 'salesOrders', selectedOrderForDelete.id));
      setSelectedOrderForDelete(null);
    } catch (err: any) {
      console.error("Error deleting order", err);
      safeAlert(`Gagal menghapus orderan: ${err.message || err}`);
    } finally {
      setIsDeleteOrderSubmitting(false);
    }
  };

  // Applied Advanced filters handling
  const handleApplyAdvancedFilters = () => {
    setAppliedPlatform(platformFilterInput);
    setAppliedSumber(sumberFilterInput);
    setAppliedCourier(courierInput);
    setAppliedDetails(detailsInput);
  };

  const handleResetAdvancedFilters = () => {
    setPlatformFilterInput('');
    setSumberFilterInput('');
    setCourierInput('');
    setDetailsInput('');
    setAppliedPlatform('');
    setAppliedSumber('');
    setAppliedCourier('');
    setAppliedDetails('');
  };

  // 0. Filter by Global Date Filter (Before cards and status tab)
  const dateFilteredOrders = useMemo(() => {
    const filtered = orders.filter(order => {
      const orderDateMs = getOrderDateMs(order);
      return isDateInRange(orderDateMs, globalStartDate, globalEndDate);
    });

    return filtered.sort((a, b) => {
      const dateDiff = getOrderDateMs(b) - getOrderDateMs(a);
      if (dateDiff !== 0) return dateDiff;
      const codeA = a.orderCode || '';
      const codeB = b.orderCode || '';
      return codeB.localeCompare(codeA);
    });
  }, [orders, globalStartDate, globalEndDate]);

  // Status card arrays using event-specific timestamps
  const pendingOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'draft' && o.status) return false;
      return isDateInRange(getOrderDateMs(o), globalStartDate, globalEndDate);
    });
  }, [orders, globalStartDate, globalEndDate]);

  const packedOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'packed') return false;
      return isDateInRange(getPackedDateMs(o), globalStartDate, globalEndDate);
    });
  }, [orders, globalStartDate, globalEndDate]);

  const shippedOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'shipped' && o.status !== 'confirmed') return false;
      return isDateInRange(getShippedDateMs(o), globalStartDate, globalEndDate);
    });
  }, [orders, globalStartDate, globalEndDate]);

  const returnedOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'returned') return false;
      return isDateInRange(getReturnedDateMs(o), globalStartDate, globalEndDate);
    });
  }, [orders, globalStartDate, globalEndDate]);

  const completedOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'completed') return false;
      return isDateInRange(getCompletedDateMs(o), globalStartDate, globalEndDate);
    });
  }, [orders, globalStartDate, globalEndDate]);

  const cancelledOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'cancelled') return false;
      return isDateInRange(getCancelledDateMs(o), globalStartDate, globalEndDate);
    });
  }, [orders, globalStartDate, globalEndDate]);

  // 1. Filter by Active Filter Tab (Status row selector)
  const statusFiltered = useMemo(() => {
    if (activeFilterTab === 'Pending') return pendingOrders;
    if (activeFilterTab === 'Dikemas') return packedOrders;
    if (activeFilterTab === 'Dikirim') return shippedOrders;
    if (activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai') return completedOrders;
    if (activeFilterTab === 'Return') return returnedOrders;
    if (activeFilterTab === 'Cancel') return cancelledOrders;
    return dateFilteredOrders;
  }, [activeFilterTab, pendingOrders, packedOrders, shippedOrders, completedOrders, returnedOrders, cancelledOrders, dateFilteredOrders]);

  // 2. Filter by Global Search & Applied Advanced filters
  const searchedOrders = statusFiltered.filter((order) => {
    // Global search match
    if (globalSearch.trim()) {
      const gs = globalSearch.toLowerCase();
      const matchCode = order.orderCode?.toLowerCase().includes(gs);
      const matchName = order.customerName?.toLowerCase().includes(gs);
      const matchPlatform = order.customerPlatformName?.toLowerCase().includes(gs);
      const matchPhone = order.phoneNumber?.toLowerCase().includes(gs);
      const matchOrderNum = order.orderNumber?.toLowerCase().includes(gs);
      const matchItem = order.items?.some(it => it.bookName?.toLowerCase().includes(gs));
      const matchResi = order.shipment?.shippingNumber?.toLowerCase().includes(gs);
      if (!matchCode && !matchName && !matchPlatform && !matchPhone && !matchOrderNum && !matchItem && !matchResi) {
        return false;
      }
    }

    // Applied Platform Order
    if (appliedPlatform) {
      const p = appliedPlatform.toLowerCase();
      const matchPlatformOrder = order.platformOrder?.toLowerCase() === p;
      const matchPlatformChannel = order.platformChannel?.toLowerCase() === p;
      if (!matchPlatformOrder && !matchPlatformChannel) {
        return false;
      }
    }

    // Applied Sumber Order (Order Type / Campaign)
    if (appliedSumber) {
      const s = appliedSumber.toLowerCase();
      const matchOrderType = order.orderType?.toLowerCase() === s;
      const matchChannel = order.platformChannel?.toLowerCase() === s;
      if (!matchOrderType && !matchChannel) {
        return false;
      }
    }

    // Applied Courier / Opsi Pengiriman
    if (appliedCourier) {
      const c = appliedCourier.toLowerCase();
      const matchLogistics = order.pickupLogistics?.toLowerCase() === c;
      if (!matchLogistics) {
        return false;
      }
    }

    // Applied Details (Address / Comment, or any book name inside items)
    if (appliedDetails.trim()) {
      const ad = appliedDetails.toLowerCase();
      const addrMatch = order.pickupDetails?.toLowerCase().includes(ad);
      const noteMatch = order.customerNote?.toLowerCase().includes(ad);
      const itemMatch = (order.items || []).some(it => it.bookName?.toLowerCase().includes(ad));
      if (!addrMatch && !noteMatch && !itemMatch) {
        return false;
      }
    }

    return true;
  });

  // State for row hover tracking
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  // Overdue calculation helper (Khusus orderan status Pending)
  const getOverdueDays = (order: SalesOrder): number => {
    const isPendingStatus = !order.status || order.status === 'draft';
    if (!isPendingStatus) {
      return 0;
    }
    const ms = getOrderDateMs(order);
    if (!ms) return 0;
    const now = Date.now();
    const diffTime = now - ms;
    if (diffTime <= 0) return 0;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const getPinnedMs = (order: SalesOrder): number => {
    if (!order.pinnedAt) return 0;
    if (typeof order.pinnedAt.seconds === 'number') return order.pinnedAt.seconds * 1000;
    if (order.pinnedAt instanceof Date) return order.pinnedAt.getTime();
    if (typeof order.pinnedAt === 'number') return order.pinnedAt;
    if (order.pinnedAt.toDate) return order.pinnedAt.toDate().getTime();
    return 0;
  };

  const checkIsReadyStock = (order: SalesOrder) => {
    const isPendingStatus = !order.status || order.status === 'draft';
    if (!isPendingStatus || !order.items || order.items.length === 0) return false;
    return order.items.every((item) => {
      if (item.markedTertinggal || item.markedRefund) return true;
      const available = getPhysicalOnHandStockForBook(
        item.bookId,
        inventories,
        ledgerEntries,
        purchaseOrders,
        orders,
        damagedRecords
      );
      return available >= (item.qty || 1);
    });
  };

  // 3. Sort orders: 
  const sortedOrders = useMemo(() => {
    const sortByCodeDesc = (a: SalesOrder, b: SalesOrder) => {
      const codeA = a.orderCode || '';
      const codeB = b.orderCode || '';
      return codeB.localeCompare(codeA);
    };

    const getTsMs = (val: any) => {
      if (!val) return 0;
      if (typeof val.seconds === 'number') return val.seconds * 1000;
      if (val instanceof Date) return val.getTime();
      if (typeof val === 'number') return val;
      return 0;
    };

    const sortByTimestampDesc = (a: SalesOrder, b: SalesOrder, tsA: any, tsB: any) => {
      const msA = getTsMs(tsA);
      const msB = getTsMs(tsB);
      if (msA !== msB) return msB - msA;
      return sortByCodeDesc(a, b);
    };

    if (activeFilterTab === 'Semua' || activeFilterTab === 'Pending') {
      const pinnedItems: SalesOrder[] = [];
      const readyStockItems: SalesOrder[] = [];
      const overdueItems: SalesOrder[] = [];
      const normalItems: SalesOrder[] = [];

      searchedOrders.forEach((order) => {
        if (order.isPinned) {
          pinnedItems.push(order);
        } else if (checkIsReadyStock(order)) {
          readyStockItems.push(order);
        } else if (getOverdueDays(order) >= 15) {
          overdueItems.push(order);
        } else {
          normalItems.push(order);
        }
      });

      pinnedItems.sort((a, b) => {
        const pinDiff = getPinnedMs(b) - getPinnedMs(a);
        if (pinDiff !== 0) return pinDiff;
        return sortByCodeDesc(a, b);
      });
      // Highlight hijau (ready stock) diurutkan dari tanggal terlama ke tanggal terbaru (Oldest -> Newest / Ascending)
      readyStockItems.sort((a, b) => {
        const dateDiff = getOrderDateMs(a) - getOrderDateMs(b);
        if (dateDiff !== 0) return dateDiff;
        return (a.orderCode || '').localeCompare(b.orderCode || '');
      });
      overdueItems.sort(sortByCodeDesc);
      normalItems.sort(sortByCodeDesc);

      return [...pinnedItems, ...readyStockItems, ...overdueItems, ...normalItems];
    } else if (activeFilterTab === 'Dikirim') {
      return [...searchedOrders].sort((a, b) => {
        const tsA = a.shippedAt || a.shipment?.arrangedAt || a.shipment?.shippingDate;
        const tsB = b.shippedAt || b.shipment?.arrangedAt || b.shipment?.shippingDate;
        return sortByTimestampDesc(a, b, tsA, tsB);
      });
    } else if (activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai') {
      return [...searchedOrders].sort((a, b) => sortByTimestampDesc(a, b, a.completedAt, b.completedAt));
    } else if (activeFilterTab === 'Return') {
      return [...searchedOrders].sort((a, b) => sortByTimestampDesc(a, b, a.returnedAt, b.returnedAt));
    } else if (activeFilterTab === 'Cancel') {
      return [...searchedOrders].sort((a, b) => sortByTimestampDesc(a, b, a.cancelledAt, b.cancelledAt));
    } else {
      return [...searchedOrders].sort(sortByCodeDesc);
    }
  }, [searchedOrders, activeFilterTab, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords]);

  // Counts for Ribbon Filters
  const countMenunggu = orders.filter((order) => order.status === 'draft').length;
  const countDikirim = orders.filter((order) => order.status === 'shipped' || order.status === 'confirmed').length;
  const countReturn = orders.filter((order) => order.status === 'returned').length;

  // Pagination config
  const itemsPerPage = 50;
  const totalItems = sortedOrders.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedOrders = sortedOrders.slice(startIndex, startIndex + itemsPerPage);


  const getLocalizedStatus = (order: SalesOrder) => {
    if (order.status === 'completed') return 'Selesai';
    if (order.status === 'shipped') return 'Dikirim';
    if (order.status === 'cancelled') return 'Cancel';
    if (order.status === 'returned') return 'Return';
    if (order.status === 'draft' || !order.status) return order.isDraft ? 'Draft' : 'Pending';
    return order.status;
  };


  const handleProcessCSVImport = () => {
    if (!selectedFile) return;

    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();

    const runImportOnRows = async (rows: any[]) => {
      try {
        let successCount = 0;

        // Columns required check
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2; // header is row 1
          const statusInput = row['Status']?.trim();
          const customerNameInput = row['Nama Pembeli']?.trim();
          const customerPlatformNameInput = (row['Nama Akun Media Sosial/Platform'] || '').trim();
          const phoneInput = (row['No. HP Handphone'] || '').trim();

          if (!statusInput) {
            alert(`Gagal Import ke Sales Orders - Pada baris ${rowNum}, kolom Status belum diisi.`);
            return;
          }

          const buyerTypeRaw = (row['Kategori Order'] || row['Identitas Pembeli'] || '').trim();
          const isMarketplace = buyerTypeRaw.toLowerCase() === 'marketplace';

          if (!buyerTypeRaw) {
            alert(`Gagal Import ke Sales Orders - Pada baris ${rowNum}, kolom Kategori Order / Identitas Pembeli belum diisi.`);
            return;
          }

          if (buyerTypeRaw !== 'Direct Order' && buyerTypeRaw !== 'Pembeli Langsung' &&
            buyerTypeRaw !== 'Reseller Order' && buyerTypeRaw !== 'Reseller/Partner' &&
            buyerTypeRaw !== 'Marketplace') {
            alert(`Gagal Import ke Sales Orders - Pada baris ${rowNum}, kolom Kategori Order hanya diperbolehkan berisi "Direct Order", "Reseller Order", atau "Marketplace".`);
            return;
          }

          if (!isMarketplace) {
            if (!customerNameInput) {
              alert(`Gagal Import ke Sales Orders - Pada baris ${rowNum}, kolom Nama Pembeli belum diisi.`);
              return;
            }
            if (!customerPlatformNameInput) {
              alert(`Gagal Import ke Sales Orders - Pada baris ${rowNum}, kolom Nama Akun Media Sosial/Platform belum diisi.`);
              return;
            }
            if (!phoneInput) {
              alert(`Gagal Import ke Sales Orders - Pada baris ${rowNum}, kolom No. HP Handphone belum diisi.`);
              return;
            }
          }
        }

        // Process batch
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const statusInput = row['Status']?.trim() || '';
          const buyerTypeInputRaw = (row['Kategori Order'] || row['Identitas Pembeli'] || '').trim();
          let buyerTypeInput: 'langsung' | 'reseller' | 'marketplace' = 'langsung';
          if (buyerTypeInputRaw === 'Reseller Order' || buyerTypeInputRaw === 'Reseller/Partner') {
            buyerTypeInput = 'reseller';
          } else if (buyerTypeInputRaw === 'Marketplace') {
            buyerTypeInput = 'marketplace';
          }

          const customerNameInput = row['Nama Pembeli']?.trim() || '';
          const itemsStr = row['Nama Buku/Barang']?.trim() || '';
          const customerPlatformNameInput = (row['Nama Akun Media Sosial/Platform'] || '').trim();
          const phoneInput = (row['No. HP Handphone'] || '').trim();
          const channelOrderInput = row['Channel Order']?.trim() || '';
          const sourceOrderInput = (row['Sumber Campaign'] || row['Sumber Order'] || '').trim();
          const paymentMethodInput = (row['Sistem Pembayaran'] || row['Metode Bayar'] || '').trim();
          const pickupLogisticsInput = (row['Pickup Logistik'] || row['Opsi Pengiriman'] || '').trim();
          const pickupDetailsInput = row['Kode Toko/Alamat']?.trim() || '';

          const rawGrandTotal = row['Grand Total (TWD)']?.trim();
          const hasGrandTotal = rawGrandTotal !== undefined && rawGrandTotal !== '';
          const grandTotalInput = parseFloat(rawGrandTotal || '0');
          const grandTotalCents = Math.round(grandTotalInput * 100) || 0;

          const platformOrderInput = (row['Platform Marketplace'] || row['Platform Order'] || '').trim();
          const customerNoteInput = row['Catatan Customer']?.trim() || '';
          const orderNumberInput = row['Nomor Order']?.trim() || '';
          const shippingNumberInput = row['Nomor Resi']?.trim() || '';

          const tanggalSOInput = row['Tanggal SO']?.trim() || row['Tanggal']?.trim() || '';
          let parsedOrderDate = Timestamp.now();
          if (tanggalSOInput) {
            const parsedMs = Date.parse(tanggalSOInput);
            const seconds = Math.floor(parsedMs / 1000);
            if (!isNaN(parsedMs) && seconds >= -62135596800 && seconds <= 253402300799) {
              parsedOrderDate = Timestamp.fromMillis(parsedMs);
            } else {
              const dmyMatch = tanggalSOInput.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
              if (dmyMatch) {
                const day = parseInt(dmyMatch[1]);
                const month = parseInt(dmyMatch[2]) - 1;
                const year = parseInt(dmyMatch[3]);
                const d = new Date(year, month, day);
                const dSeconds = Math.floor(d.getTime() / 1000);
                if (!isNaN(d.getTime()) && dSeconds >= -62135596800 && dSeconds <= 253402300799) {
                  parsedOrderDate = Timestamp.fromDate(d);
                }
              }
            }
          }

          const isShopee = channelOrderInput.toLowerCase() === 'shopee';

          // Items parser
          const newItems: SalesOrderItem[] = [];
          const parts = itemsStr.split(/[;,]/);
          let computedSubtotal = 0;
          for (const part of parts) {
            const match = part.trim().split(':');
            if (match.length >= 2) {
              const itemIdent = match[0].trim();
              const qtyStr = match[1].trim();
              const qtyDigits = qtyStr.replace(/\D/g, '');
              const qty = parseInt(qtyDigits) || 1;

              const foundBook = books.find(b =>
                (b.productId && b.productId.toLowerCase() === itemIdent.toLowerCase()) ||
                (b.id && b.id.toLowerCase() === itemIdent.toLowerCase()) ||
                (b.bookName && b.bookName.toLowerCase() === itemIdent.toLowerCase())
              );

              const bName = foundBook ? foundBook.bookName : itemIdent;
              const unitPrice = foundBook ? (isShopee ? (foundBook.shopeePrice || 0) : (foundBook.generalPrice || 0)) : 0;
              newItems.push({
                bookId: foundBook ? foundBook.id : 'unknown',
                bookName: bName,
                bookCover: foundBook ? (foundBook.cover || '') : '',
                qty: qty,
                unitPrice: unitPrice,
                lineTotal: unitPrice * qty,
                cogsSnapshot: 0,
                isFree: false
              });
              computedSubtotal += (unitPrice * qty);
            }
          }

          const finalTotalPrice = hasGrandTotal ? grandTotalCents : computedSubtotal;
          const discountCents = computedSubtotal > finalTotalPrice ? (computedSubtotal - finalTotalPrice) : 0;

          const isDraft = statusInput.toLowerCase() === 'draft';
          let mappedStatus: SalesOrder['status'] = isDraft ? 'draft' : 'confirmed';
          if (statusInput.toLowerCase() === 'dikirim') mappedStatus = 'shipped';
          if (statusInput.toLowerCase() === 'berhasil' || statusInput.toLowerCase() === 'selesai') mappedStatus = 'completed';
          if (statusInput.toLowerCase() === 'return' || statusInput.toLowerCase() === 'returned') mappedStatus = 'returned';
          if (statusInput.toLowerCase() === 'cancel' || statusInput.toLowerCase() === 'cancelled') mappedStatus = 'cancelled';
          if (statusInput.toLowerCase() === 'menunggu' || statusInput.toLowerCase() === 'pending') mappedStatus = 'draft';

          // Resolve reseller/partner if applicable
          let partnerId = '';
          let partnerName = '';
          let partnerProfitShare = 0;
          if (buyerTypeInput === 'reseller') {
            const resellerNameInput = (row['Nama Reseller'] || row['Pilih Reseller'] || '').trim();
            if (resellerNameInput) {
              const foundPartner = partners.find(p => p.name?.toLowerCase() === resellerNameInput.toLowerCase());
              if (foundPartner) {
                partnerId = foundPartner.id;
                partnerName = foundPartner.name;
                partnerProfitShare = foundPartner.profitSharePercent || 0;
              } else {
                partnerName = resellerNameInput;
              }
            }
          }

          const estimatedShippingDateInput = (row['Tanggal Diminta Kirim'] || '').trim();

          const isImportMkp = buyerTypeInput === 'marketplace';
          const importCustomerName = isImportMkp ? '' : customerNameInput;
          const importCustomerPlatformName = isImportMkp
            ? (customerPlatformNameInput || customerNameInput || channelOrderInput || 'Shopee')
            : customerPlatformNameInput;
          const importPhone = isImportMkp ? '' : phoneInput;
          const importPickupLogistics = isImportMkp ? '' : (pickupLogisticsInput || resolvedLogistics[0]?.name || '7-11');
          const importPickupDetails = isImportMkp ? '' : pickupDetailsInput;
          const importPaymentMethod = isImportMkp ? '' : (paymentMethodInput || 'COD');
          const importOrderType = isImportMkp ? '' : (sourceOrderInput || resolvedOrderTypes[0]?.name || 'Meta Ads');
          const importPlatformOrder = isImportMkp ? '' : (platformOrderInput || resolvedPlatforms[0]?.name || 'Shopee');

          const newId = doc(collection(db, 'salesOrders')).id;
          const newOrderCode = await generateOrderCode('S');
          const payload: any = {
            id: newId,
            orderCode: newOrderCode,
            orderDate: parsedOrderDate,
            customerName: importCustomerName,
            customerPlatformName: importCustomerPlatformName,
            platformChannel: channelOrderInput || (isImportMkp ? 'Shopee' : (resolvedChannels[0]?.name || 'WhatsApp')),
            platformOrder: importPlatformOrder,
            orderType: importOrderType,
            paymentMethod: importPaymentMethod,
            phoneNumber: importPhone,
            pickupLogistics: importPickupLogistics,
            pickupDetails: importPickupDetails,
            customerNote: customerNoteInput,
            orderNumber: orderNumberInput,
            estimatedShippingDate: estimatedShippingDateInput,
            perluKonfirmasiSebelumKirim: false,
            buyerType: buyerTypeInput,
            partnerId: isImportMkp ? '' : partnerId,
            partnerName: isImportMkp ? '' : partnerName,
            addressPhotoUrl: '',
            isDraft: isDraft,
            items: newItems,
            subtotal: computedSubtotal,
            discount: discountCents,
            totalPrice: finalTotalPrice,
            status: mappedStatus,
            partnerProfitShare: partnerProfitShare,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            createdBy: 'import'
          };

          if (shippingNumberInput) {
            payload.shipment = {
              shippingNumber: shippingNumberInput,
              shippedAt: Timestamp.now()
            };
          }

          if (mappedStatus === 'shipped') {
            const draftPayload = {
              ...payload,
              status: 'draft' as const
            };
            await setDoc(doc(db, 'salesOrders', newId), draftPayload);

            await confirmSalesOrderTransaction(newId, user?.uid || 'anonymous');

            const finalOrderNo = orderNumberInput || '';
            await updateDoc(doc(db, 'salesOrders', newId), {
              status: 'shipped',
              shippedAt: Timestamp.now(),
              shipment: {
                orderNumber: finalOrderNo,
                shippingNumber: shippingNumberInput || '',
                shippedAt: Timestamp.now(),
                arrangedAt: Timestamp.now()
              },
              updatedAt: Timestamp.now()
            });
          } else {
            await setDoc(doc(db, 'salesOrders', newId), payload);
          }
          successCount++;
        }

        setIsImportModalOpen(false);
        setSelectedFile(null);
        alert(`Impor selesai! Berhasil: ${successCount}`);

      } catch (err: any) {
        console.error(err);
        alert('Terjadi kesalahan saat memproses data impor: ' + err.message);
      }
    };

    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const XLSX = await loadXLSX();
          const workbook = XLSX.read(data, { type: 'array' });
          const rows: any[] = [];

          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            let defaultCategory = '';
            if (sheetName.toLowerCase().includes('marketplace')) defaultCategory = 'Marketplace';
            else if (sheetName.toLowerCase().includes('direct')) defaultCategory = 'Direct Order';
            else if (sheetName.toLowerCase().includes('reseller')) defaultCategory = 'Reseller Order';

            sheetRows.forEach((r: any) => {
              const cleanedRow: any = {};
              Object.keys(r).forEach(k => {
                cleanedRow[k.trim()] = String(r[k]).trim();
              });

              if (defaultCategory && !cleanedRow['Kategori Order'] && !cleanedRow['Identitas Pembeli']) {
                cleanedRow['Kategori Order'] = defaultCategory;
              }
              rows.push(cleanedRow);
            });
          });

          await runImportOnRows(rows);
        } catch (err: any) {
          alert('Gagal membaca file Excel: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } else {
      // Parse CSV
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.replace(/^\ufeff/, '').trim(),
        complete: async (results) => {
          const rawRows = results.data as any[];
          const cleanedRows = rawRows.map(r => {
            const cr: any = {};
            Object.keys(r).forEach(k => {
              cr[k.trim()] = String(r[k]).trim();
            });
            return cr;
          });
          await runImportOnRows(cleanedRows);
        },
        error: (error: any) => {
          alert('Gagal membaca file CSV: ' + error.message);
        }
      });
    }
  };

  const downloadExcelTemplate = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();

      const sampleProductId1 = books && books[0] ? (books[0].productId || 'KB-260712-2804') : 'KB-260712-2804';
      const sampleProductId2 = books && books[1] ? (books[1].productId || 'KB-260712-1691') : 'KB-260712-1691';
      const sampleItems = `${sampleProductId1}:1pcs, ${sampleProductId2}:2pcs`;

      // Helper to format header rows
      const styleHeader = (worksheet: ExcelJSTypes.Worksheet) => {
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF5B1D33' } // Elegant Dark Burgundy for KangenBukuIndo
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        headerRow.height = 28;
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      };

      // 1. SHEET MARKETPLACE
      const wsMkp = workbook.addWorksheet('Marketplace');
      wsMkp.columns = [
        { header: 'Status', key: 'Status', width: 12 },
        { header: 'Tanggal SO', key: 'Tanggal SO', width: 15 },
        { header: 'Kategori Order', key: 'Kategori Order', width: 18 },
        { header: 'Nama Pembeli', key: 'Nama Pembeli', width: 22 },
        { header: 'Platform Marketplace', key: 'Platform Marketplace', width: 22 },
        { header: 'Nama Buku/Barang', key: 'Nama Buku/Barang', width: 30 },
        { header: 'Grand Total (TWD)', key: 'Grand Total (TWD)', width: 18 },
        { header: 'Nomor Order', key: 'Nomor Order', width: 18 },
        { header: 'Nomor Resi', key: 'Nomor Resi', width: 18 },
        { header: 'Catatan Customer', key: 'Catatan Customer', width: 25 },
        { header: 'Tanggal Diminta Kirim', key: 'Tanggal Diminta Kirim', width: 22 }
      ];
      styleHeader(wsMkp);
      wsMkp.addRow({
        'Status': 'Pending',
        'Tanggal SO': '2026-07-21',
        'Kategori Order': 'Marketplace',
        'Nama Pembeli': 'BUDI UTOMO',
        'Platform Marketplace': resolvedMarketplaces[0]?.name || 'Shopee',
        'Nama Buku/Barang': sampleItems,
        'Grand Total (TWD)': 500,
        'Nomor Order': 'ORD-MKP-12345',
        'Nomor Resi': 'RESI-MKP-12345',
        'Catatan Customer': 'Tolong dibungkus bubble wrap tebal',
        'Tanggal Diminta Kirim': '2026-07-25'
      });

      // 2. SHEET DIRECT ORDER
      const wsDir = workbook.addWorksheet('Direct Order');
      wsDir.columns = [
        { header: 'Status', key: 'Status', width: 12 },
        { header: 'Tanggal SO', key: 'Tanggal SO', width: 15 },
        { header: 'Kategori Order', key: 'Kategori Order', width: 18 },
        { header: 'Nama Pembeli', key: 'Nama Pembeli', width: 22 },
        { header: 'Nama Akun Media Sosial/Platform', key: 'Nama Akun Media Sosial/Platform', width: 30 },
        { header: 'Channel Order', key: 'Channel Order', width: 18 },
        { header: 'Platform Order', key: 'Platform Order', width: 22 },
        { header: 'Sumber Campaign', key: 'Sumber Campaign', width: 18 },
        { header: 'No. HP Handphone', key: 'No. HP Handphone', width: 18 },
        { header: 'Opsi Pengiriman', key: 'Opsi Pengiriman', width: 18 },
        { header: 'Metode Bayar', key: 'Metode Bayar', width: 15 },
        { header: 'Kode Toko/Alamat', key: 'Kode Toko/Alamat', width: 25 },
        { header: 'Nama Buku/Barang', key: 'Nama Buku/Barang', width: 30 },
        { header: 'Grand Total (TWD)', key: 'Grand Total (TWD)', width: 18 },
        { header: 'Nomor Order', key: 'Nomor Order', width: 18 },
        { header: 'Nomor Resi', key: 'Nomor Resi', width: 18 },
        { header: 'Catatan Customer', key: 'Catatan Customer', width: 25 },
        { header: 'Tanggal Diminta Kirim', key: 'Tanggal Diminta Kirim', width: 22 }
      ];
      styleHeader(wsDir);
      wsDir.addRow({
        'Status': 'Pending',
        'Tanggal SO': '2026-07-21',
        'Kategori Order': 'Direct Order',
        'Nama Pembeli': 'SITI RAHMA',
        'Nama Akun Media Sosial/Platform': 'Siti Rahma WA',
        'Channel Order': resolvedChannels[0]?.name || 'WhatsApp',
        'Platform Order': resolvedPlatforms[0]?.name || 'Shopee',
        'Sumber Campaign': resolvedOrderTypes[0]?.name || 'Meta Ads',
        'No. HP Handphone': '08123456789',
        'Opsi Pengiriman': resolvedLogistics[0]?.name || '7-11',
        'Metode Bayar': 'COD',
        'Kode Toko/Alamat': '7-11 Toko Indah (No. 123456)',
        'Nama Buku/Barang': sampleItems,
        'Grand Total (TWD)': 500,
        'Nomor Order': 'ORD-DIR-12345',
        'Nomor Resi': 'RESI-DIR-12345',
        'Catatan Customer': 'Kirim sebelum jam 5 sore',
        'Tanggal Diminta Kirim': '2026-07-26'
      });

      // 3. SHEET RESELLER
      const wsRes = workbook.addWorksheet('Reseller');
      wsRes.columns = [
        { header: 'Status', key: 'Status', width: 12 },
        { header: 'Tanggal SO', key: 'Tanggal SO', width: 15 },
        { header: 'Kategori Order', key: 'Kategori Order', width: 18 },
        { header: 'Nama Reseller', key: 'Nama Reseller', width: 22 },
        { header: 'Nama Pembeli', key: 'Nama Pembeli', width: 22 },
        { header: 'Nama Akun Media Sosial/Platform', key: 'Nama Akun Media Sosial/Platform', width: 30 },
        { header: 'Channel Order', key: 'Channel Order', width: 18 },
        { header: 'Platform Order', key: 'Platform Order', width: 22 },
        { header: 'No. HP Handphone', key: 'No. HP Handphone', width: 18 },
        { header: 'Opsi Pengiriman', key: 'Opsi Pengiriman', width: 18 },
        { header: 'Metode Bayar', key: 'Metode Bayar', width: 15 },
        { header: 'Kode Toko/Alamat', key: 'Kode Toko/Alamat', width: 25 },
        { header: 'Nama Buku/Barang', key: 'Nama Buku/Barang', width: 30 },
        { header: 'Grand Total (TWD)', key: 'Grand Total (TWD)', width: 18 },
        { header: 'Nomor Order', key: 'Nomor Order', width: 18 },
        { header: 'Nomor Resi', key: 'Nomor Resi', width: 18 },
        { header: 'Catatan Customer', key: 'Catatan Customer', width: 25 },
        { header: 'Tanggal Diminta Kirim', key: 'Tanggal Diminta Kirim', width: 22 }
      ];
      styleHeader(wsRes);
      wsRes.addRow({
        'Status': 'Pending',
        'Tanggal SO': '2026-07-21',
        'Kategori Order': 'Reseller Order',
        'Nama Reseller': partners[0]?.name || 'RESELLER ABC',
        'Nama Pembeli': 'AHMAD KURNIA',
        'Nama Akun Media Sosial/Platform': 'Ahmad Kurnia IG',
        'Channel Order': resolvedChannels[0]?.name || 'WhatsApp',
        'Platform Order': resolvedPlatforms[0]?.name || 'Shopee',
        'No. HP Handphone': '08765432100',
        'Opsi Pengiriman': resolvedLogistics[0]?.name || '7-11',
        'Metode Bayar': 'Transfer',
        'Kode Toko/Alamat': 'Alamat Lengkap Reseller',
        'Nama Buku/Barang': sampleItems,
        'Grand Total (TWD)': 1000,
        'Nomor Order': 'ORD-RES-12345',
        'Nomor Resi': 'RESI-RES-12345',
        'Catatan Customer': 'Jangan sertakan nota harga',
        'Tanggal Diminta Kirim': '2026-07-27'
      });

      // Status & configuration values for dropdown formulae
      const statusFormula = `"${['Draft', 'Pending', 'Confirmed', 'Dikirim', 'Selesai', 'Return', 'Cancelled'].join(',')}"`;

      const mkpNames = resolvedMarketplaces.map(m => m.name).filter(Boolean);
      const mkpFormula = `"${mkpNames.join(',')}"`;

      const channelNames = resolvedChannels.map(c => c.name).filter(Boolean);
      const channelFormula = `"${channelNames.join(',')}"`;

      const platformNames = resolvedPlatforms.map(p => p.name).filter(Boolean);
      const platformFormula = `"${platformNames.join(',')}"`;

      const orderTypeNames = resolvedOrderTypes.map(t => t.name).filter(Boolean);
      const orderTypeFormula = `"${orderTypeNames.join(',')}"`;

      const logisticsNames = resolvedLogistics.map(l => l.name).filter(Boolean);
      const logisticsFormula = `"${logisticsNames.join(',')}"`;

      const paymentMethodFormula = `"${['COD', 'Transfer', 'Cash'].join(',')}"`;

      const resellerNames = partners.map(p => p.name).filter(Boolean);
      const resellerFormula = resellerNames.length > 0 ? `"${resellerNames.join(',')}"` : null;

      // Apply data validation to rows 2-200 for each sheet
      for (let r = 2; r <= 200; r++) {
        // Marketplace Sheet
        const rowMkp = wsMkp.getRow(r);
        rowMkp.getCell(1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [statusFormula],
          showErrorMessage: true,
          errorTitle: 'Status Tidak Valid',
          error: 'Pilih status dari daftar dropdown.'
        };
        rowMkp.getCell(3).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Marketplace"'],
          showErrorMessage: true,
          errorTitle: 'Kategori Order Tidak Valid',
          error: 'Kategori Order untuk sheet ini harus "Marketplace".'
        };
        rowMkp.getCell(5).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [mkpFormula],
          showErrorMessage: true,
          errorTitle: 'Platform Marketplace Tidak Valid',
          error: 'Pilih platform marketplace dari daftar dropdown.'
        };

        // Direct Order Sheet
        const rowDir = wsDir.getRow(r);
        rowDir.getCell(1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [statusFormula],
          showErrorMessage: true,
          errorTitle: 'Status Tidak Valid',
          error: 'Pilih status dari daftar dropdown.'
        };
        rowDir.getCell(3).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Direct Order"'],
          showErrorMessage: true,
          errorTitle: 'Kategori Order Tidak Valid',
          error: 'Kategori Order untuk sheet ini harus "Direct Order".'
        };
        rowDir.getCell(6).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [channelFormula],
          showErrorMessage: true,
          errorTitle: 'Channel Order Tidak Valid',
          error: 'Pilih channel order dari daftar dropdown.'
        };
        rowDir.getCell(7).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [platformFormula],
          showErrorMessage: true,
          errorTitle: 'Platform Order Tidak Valid',
          error: 'Pilih platform order dari daftar dropdown.'
        };
        rowDir.getCell(8).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [orderTypeFormula],
          showErrorMessage: true,
          errorTitle: 'Sumber Campaign Tidak Valid',
          error: 'Pilih sumber campaign dari daftar dropdown.'
        };
        rowDir.getCell(10).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [logisticsFormula],
          showErrorMessage: true,
          errorTitle: 'Opsi Pengiriman Tidak Valid',
          error: 'Pilih opsi pengiriman dari daftar dropdown.'
        };
        rowDir.getCell(11).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [paymentMethodFormula],
          showErrorMessage: true,
          errorTitle: 'Metode Bayar Tidak Valid',
          error: 'Pilih metode bayar dari daftar dropdown.'
        };

        // Reseller Sheet
        const rowRes = wsRes.getRow(r);
        rowRes.getCell(1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [statusFormula],
          showErrorMessage: true,
          errorTitle: 'Status Tidak Valid',
          error: 'Pilih status dari daftar dropdown.'
        };
        rowRes.getCell(3).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Reseller Order"'],
          showErrorMessage: true,
          errorTitle: 'Kategori Order Tidak Valid',
          error: 'Kategori Order untuk sheet ini harus "Reseller Order".'
        };
        if (resellerFormula) {
          rowRes.getCell(4).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [resellerFormula],
            showErrorMessage: true,
            errorTitle: 'Nama Reseller Tidak Valid',
            error: 'Pilih nama reseller dari daftar dropdown.'
          };
        }
        rowRes.getCell(7).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [channelFormula],
          showErrorMessage: true,
          errorTitle: 'Channel Order Tidak Valid',
          error: 'Pilih channel order dari daftar dropdown.'
        };
        rowRes.getCell(8).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [platformFormula],
          showErrorMessage: true,
          errorTitle: 'Platform Order Tidak Valid',
          error: 'Pilih platform order dari daftar dropdown.'
        };
        rowRes.getCell(10).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [logisticsFormula],
          showErrorMessage: true,
          errorTitle: 'Opsi Pengiriman Tidak Valid',
          error: 'Pilih opsi pengiriman dari daftar dropdown.'
        };
        rowRes.getCell(11).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [paymentMethodFormula],
          showErrorMessage: true,
          errorTitle: 'Metode Bayar Tidak Valid',
          error: 'Pilih metode bayar dari daftar dropdown.'
        };
      }

      // Write to buffer and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `template_sales_orders_${Date.now().toString().slice(-4)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      console.error('Error generating template:', err);
      alert('Gagal mendownload template Excel: ' + err.message);
    }
  };

  const exportSalesToCSV = () => {
    const headers = [
      'Status',
      'Tanggal SO',
      'Kategori Order',
      'Nama Pembeli',
      'Nama Buku/Barang',
      'Nama Akun Media Sosial/Platform',
      'No. HP Handphone',
      'Channel Order',
      'Sumber Campaign',
      'Sistem Pembayaran',
      'Pickup Logistik',
      'Kode Toko/Alamat',
      'Grand Total (TWD)',
      'Platform Order',
      'Catatan Customer',
      'Nomor Order',
      'Nomor Resi'
    ].join(',');

    const rows = searchedOrders.map(order => {
      const itemsStr = (order.items || []).map(i => `${i.bookName}:${i.qty}pcs`).join(', ');

      let tanggalStr = '';
      if (order.orderDate) {
        try {
          const d = order.orderDate.toDate ? order.orderDate.toDate() : new Date(order.orderDate.seconds * 1000);
          tanggalStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } catch (e) { }
      }

      let buyerTypeLabel = 'Direct Order';
      if (order.buyerType === 'reseller') {
        buyerTypeLabel = 'Reseller Order';
      } else if (order.buyerType === 'marketplace') {
        buyerTypeLabel = 'Marketplace';
      }

      return [
        getLocalizedStatus(order),
        tanggalStr,
        buyerTypeLabel,
        order.customerName || '',
        itemsStr,
        order.customerPlatformName || '',
        order.phoneNumber || '',
        order.platformChannel || '',
        order.orderType || '',
        order.paymentMethod || '',
        order.pickupLogistics || '',
        order.pickupDetails || '',
        (order.totalPrice || 0) / 100,
        order.platformOrder || '',
        order.customerNote || '',
        order.orderNumber || '',
        order.shipment?.shippingNumber || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = "\uFEFF" + [headers, ...rows].join("\n"); const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sales_orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const handleEditOrderClick = (order: SalesOrder) => {
    setEditingOrder(order);
    let dateStr = new Date().toISOString().slice(0, 10);
    if (order.orderDate) {
      try {
        const d = order.orderDate.toDate ? order.orderDate.toDate() : new Date(order.orderDate.seconds * 1000);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } catch (e) { }
    }
    setOrderDateInput(dateStr);
    setCustomerName(order.customerName || '');
    setCustomerPlatformName(order.customerPlatformName || '');
    setPlatformChannel(order.platformChannel || 'WhatsApp');
    setPlatformOrder(order.platformOrder || 'Shopee');
    setOrderType(order.orderType || '');
    setPaymentMethod(order.paymentMethod || 'COD');
    setPhoneNumber((order.phoneNumber || '').replace(/\D/g, '').slice(0, 10));
    setPickupLogistics(order.pickupLogistics || resolvedLogistics[0]?.name || '');
    setPickupDetails(order.pickupDetails || '');
    setCartItems(order.items || []);
    setDiscountInput(String((order.discount || 0) / 100));
    setPlatformFeeInput(String((order.platformFee || 0) / 100));
    setGrandTotalInput('');
    setIsEditingGrandTotal(false);
    setPartnerProfitPercent(order.orderType === 'Business Partner' && order.partnerProfitShare ? '10' : '0'); // fallback default
    setCustomerNote(order.customerNote || '');
    setOrderNumber(order.orderNumber || '');
    setEstimatedShippingDate(order.estimatedShippingDate || '');
    setPerluKonfirmasiSebelumKirim(order.perluKonfirmasiSebelumKirim || false);
    setPhoneWarning('');
    const initialBuyerType = order.buyerType || (
      (order.platformOrder && ['Shopee', 'Tokopedia', 'TikTok Shop', 'Lazada'].includes(order.platformOrder)) || order.orderType === 'Marketplace'
        ? 'marketplace'
        : (order.partnerId || order.orderType === 'Reseller Order' ? 'reseller' : 'langsung')
    );
    setBuyerType(initialBuyerType);
    if (initialBuyerType === 'marketplace') {
      setPlatformOrder('');
      setOrderType('');
      setPaymentMethod('');
      setPickupLogistics('');
      setPickupDetails('');
      setPhoneNumber('');
      setCustomerPlatformName(order.customerPlatformName || order.customerName || 'Shopee');
      setCustomerName('');
      setPlatformChannel(order.platformChannel || 'Shopee');
      setSelectedPartner(null);
    } else if (order.partnerId && partners) {
      const p = partners.find(x => x.id === order.partnerId);
      if (p) setSelectedPartner({ id: p.id, name: p.name, profitSharePercent: p.profitSharePercent });
      else setSelectedPartner({ id: order.partnerId, name: order.partnerName || 'Unknown Partner', profitSharePercent: 0 });
    } else {
      setSelectedPartner(null);
    }
    setAddressPhotoUrl(order.addressPhotoUrl || '');
    setAddressPhotoFile(null);
    setIsNewOrderOpen(true);
  };

  // Order detail body. Rendered inside a modal on mobile/desktop and inside the
  // tablet master-detail pane. Kept as a local render function (like renderStepper)
  // so it keeps closing over the ~20 handlers and lookups it needs, rather than
  // threading them through props.
  const renderOrderDetail = (o: SalesOrder) => {
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
      if (!dateObj || isNaN(dateObj.getTime())) {
        return '—';
      }
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
      if (!dateObj || isNaN(dateObj.getTime())) {
        return '';
      }
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd}, ${hh}:${min}`;
    };

    const getStatusBadge = (status?: string) => {
      if (status === 'shipped' || status === 'confirmed') {
        return { label: 'Dikirim', bc: 'var(--sky)', bt: 'var(--sky-tint)' };
      }
      if (status === 'completed') {
        return { label: 'Selesai', bc: 'var(--green)', bt: 'var(--green-tint)' };
      }
      if (status === 'returned') {
        return { label: 'Return', bc: 'var(--slate)', bt: 'var(--slate-tint)' };
      }
      if (status === 'cancelled') {
        return { label: 'Dibatalkan', bc: 'var(--rose)', bt: 'var(--rose-tint)' };
      }
      return { label: 'Pending', bc: 'var(--amber)', bt: 'var(--amber-tint)' };
    };

    const getCategoryBadge = (order: SalesOrder) => {
      if (order.buyerType === 'marketplace') {
        return { label: 'Marketplace', bc: 'var(--sky)', bt: 'var(--sky-tint)' };
      }
      if (order.buyerType === 'reseller') {
        return { label: 'Reseller', bc: 'var(--amber)', bt: 'var(--amber-tint)' };
      }
      if (order.buyerType === 'langsung') {
        return { label: 'Direct', bc: 'var(--green)', bt: 'var(--green-tint)' };
      }
      if (order.platformOrder && ['Shopee', 'Tokopedia', 'TikTok Shop', 'Lazada'].includes(order.platformOrder)) {
        return { label: 'Marketplace', bc: 'var(--sky)', bt: 'var(--sky-tint)' };
      }
      if (order.orderType === 'Reseller Order') {
        return { label: 'Reseller', bc: 'var(--amber)', bt: 'var(--amber-tint)' };
      }
      return { label: 'Direct', bc: 'var(--green)', bt: 'var(--green-tint)' };
    };

    const getStatusHistory = (order: SalesOrder) => {
      const events: { label: string; date: any; key: string; color: string; tint: string; badgeLabel: string; author?: string }[] = [];

      const creatorName = (order as any).createdByName || order.createdBy || 'Felix Salim';
      const dateMenunggu = order.orderDate || order.createdAt;
      if (dateMenunggu) {
        events.push({
          key: 'pending',
          label: 'Order Dibuat',
          date: dateMenunggu,
          color: 'var(--amber)',
          tint: 'var(--amber-tint)',
          badgeLabel: 'Pending',
          author: creatorName
        });
      }

      const datePacked = order.packedAt;
      if (datePacked && (order.status === 'packed' || order.status === 'shipped' || order.status === 'completed' || order.status === 'returned' || order.precedingStatus === 'returned')) {
        events.push({
          key: 'packed',
          label: 'Order Dikemas',
          date: datePacked,
          color: 'var(--indigo)',
          tint: 'var(--indigo-tint)',
          badgeLabel: 'Dikemas'
        });
      }

      const dateDikirim = order.shippedAt || order.shipment?.arrangedAt || order.shipment?.shippingDate;
      if (dateDikirim && (order.status === 'shipped' || order.status === 'completed' || order.status === 'returned' || order.precedingStatus === 'returned')) {
        const shippingNo = order.shipment?.shippingNumber;
        events.push({
          key: 'dikirim',
          label: 'Order Dikirim',
          date: dateDikirim,
          color: 'var(--sky)',
          tint: 'var(--sky-tint)',
          badgeLabel: 'Dikirim',
          author: shippingNo ? `Resi ${shippingNo}` : undefined
        });
      }

      const dateSelesai = order.completedAt;
      if (dateSelesai && order.status === 'completed') {
        events.push({
          key: 'selesai',
          label: 'Order Selesai',
          date: dateSelesai,
          color: 'var(--green)',
          tint: 'var(--green-tint)',
          badgeLabel: 'Selesai'
        });
      }

      const dateReturn = order.returnedAt;
      if (dateReturn && (order.status === 'returned' || order.precedingStatus === 'returned')) {
        events.push({
          key: 'returned',
          label: 'Order Diretur',
          date: dateReturn,
          color: 'var(--slate)',
          tint: 'var(--slate-tint)',
          badgeLabel: 'Return'
        });
      }

      const dateDiambil = order.diambilAt;
      if (dateDiambil) {
        events.push({
          key: 'diambil',
          label: 'Buku Return Diambil Pemilik',
          date: dateDiambil,
          color: 'var(--brand)',
          tint: 'var(--brand-tint)',
          badgeLabel: 'Diambil'
        });
      }

      const dateCancel = order.cancelledAt;
      if (dateCancel && order.status === 'cancelled') {
        events.push({
          key: 'cancelled',
          label: 'Order Dibatalkan',
          date: dateCancel,
          color: 'var(--rose)',
          tint: 'var(--rose-tint)',
          badgeLabel: 'Dibatalkan'
        });
      }

      const getMillis = (d: any) => {
        if (!d) return 0;
        if (typeof d.toDate === 'function') return d.toDate().getTime();
        if (d.seconds !== undefined) return d.seconds * 1000;
        if (d instanceof Date) return d.getTime();
        const parsed = new Date(d).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };

      return events.sort((a, b) => getMillis(a.date) - getMillis(b.date));
    };

    const historyEvents = getStatusHistory(o);
    const statusBadge = getStatusBadge(o.status);
    const categoryBadge = getCategoryBadge(o);

    const totalQty = o.items?.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) || 0;
    const itemsCount = o.items?.length || 0;
    const rawCode = o.orderCode || '';
    const displayOrderCode = rawCode.startsWith('#') ? rawCode : `#${rawCode}`;
    // createdByName is written by InventoryTab but absent from the SalesOrder
    // type; same cast the stepper uses for this field.
    const creatorName = (o as any).createdByName || o.createdBy || 'Felix Salim';

    const estShipping = o.estimatedShippingDate
      ? formatDetailDate(o.estimatedShippingDate)
      : '–';

    const bt = o.buyerType;
    const isMarketplace = bt === 'marketplace' || (!bt && (
      (o.platformOrder && ['Shopee', 'Tokopedia', 'TikTok Shop', 'Lazada'].includes(o.platformOrder)) ||
      o.orderType === 'Marketplace'
    ));
    const isReseller = bt === 'reseller' || (!bt && (o.orderType === 'Reseller Order' || !!o.partnerId));

    const rawOrderDate = o.orderDate || o.createdAt;
    const orderDateFormatted = rawOrderDate ? formatDetailDate(rawOrderDate) : '–';
    const customerNameFormatted = o.customerName?.trim() || '–';

    const rawSocial = o.customerPlatformName?.trim();
    const socialAccountFormatted = rawSocial ? rawSocial : '–';

    const phoneFormatted = o.phoneNumber?.trim() || '–';
    const logisticsFormatted = o.pickupLogistics?.trim() || '–';
    const pickupDetailsFormatted = o.pickupDetails?.trim() || '–';
    const paymentMethodFormatted = o.paymentMethod?.trim() || '–';

    const platformOrderFormatted = o.platformOrder?.trim() || '–';
    const sumberCampaignFormatted = o.orderType?.trim() || '–';
    const orderNumberFormatted = o.orderNumber?.trim() || '–';
    const shippingNumberFormatted = o.shipment?.shippingNumber?.trim() || '–';
    const customerNoteFormatted = o.customerNote?.trim() || '–';

    const lastUpdated = o.updatedAt
      ? formatUpdatedAt(o.updatedAt)
      : formatUpdatedAt(o.orderDate || o.createdAt);

    return (
      <>
        {/* ══════ HEADER ══════ */}
        <div className="mhead">
          <div className="mk">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="htx">
            <div className="eyebrow">Rincian Sales Order</div>
            <div className="hrow">
              <h2>{displayOrderCode}</h2>
              <span className="bdg" style={{ '--bc': statusBadge.bc, '--bt': statusBadge.bt } as React.CSSProperties}>
                <span className="d"></span>
                {statusBadge.label}
              </span>
              <span className="bdg" style={{ '--bc': categoryBadge.bc, '--bt': categoryBadge.bt } as React.CSSProperties}>
                <span className="d"></span>
                {categoryBadge.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            <button
              type="button"
              className="w-8 h-8 rounded-lg text-[#9ca3af] hover:text-[#02a077] hover:bg-[#e7f5ef] dark:hover:bg-emerald-950/40 transition flex items-center justify-center cursor-pointer"
              title="Rekomendasi Buku"
              onClick={(e) => {
                e.stopPropagation();
                if (o.items && o.items.length > 0) {
                  const bookIds = o.items.map(item => item.bookId);
                  const categories = new Set<string>();
                  o.items.forEach(item => {
                    const b = books.find(bk => bk.id === item.bookId);
                    if (b) {
                      const catArray = Array.isArray(b.category) ? b.category : [b.category];
                      catArray.forEach(c => categories.add(c));
                    }
                  });
                  if (categories.size > 0) {
                    setRecoOrderData({
                      bookIds,
                      categories: Array.from(categories)
                    });
                  }
                }
              }}
            >
              <Lightbulb className="w-4 h-4" />
            </button>
            <button className="mclose" aria-label="Tutup" onClick={() => setViewingOrderDetail(null)}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* ══════ BODY ══════ */}
        <div className="mbody">
          {/* Informasi Umum */}
          <div className="sec">
            <div className="sec-h">
              <h3>Informasi Umum</h3>
              <span className="rule"></span>
            </div>
            <div className="info-grid">
              {/* BARIS 1 (4 kolom): Kategori Order | Tanggal Pembelian | Nama Pembeli | Nama Akun Sosial Media / Platform */}
              <div className="icell">
                <div className="k">Kategori Order</div>
                <div className="v">
                  {isMarketplace ? (
                    <>
                      <div>Marketplace</div>
                      <div className="text-[12px] text-neutral-500 font-medium mt-0.5">{o.platformChannel || 'Shopee'}</div>
                    </>
                  ) : isReseller ? (
                    <>
                      <div>Reseller Order</div>
                      <div className="text-[12px] text-neutral-500 font-medium mt-0.5">{o.partnerName || '–'}</div>
                      <div className="text-[11px] text-neutral-400 font-normal mt-0.5">{o.platformChannel || o.platformOrder || o.orderType || '–'}</div>
                    </>
                  ) : (
                    <>
                      <div>Direct Order</div>
                      <div className="text-[12px] text-neutral-500 font-medium mt-0.5">{o.platformChannel || o.platformOrder || o.orderType || '–'}</div>
                    </>
                  )}
                </div>
              </div>

              <div className="icell">
                <div className="k">Tanggal Pembelian</div>
                <div className={`v ${orderDateFormatted !== '–' ? 'mono' : 'muted'}`}>{orderDateFormatted}</div>
              </div>

              <div className="icell">
                <div className="k">Nama Pembeli</div>
                <div className={`v ${customerNameFormatted === '–' ? 'muted' : ''}`}>{customerNameFormatted}</div>
              </div>

              <div className="icell">
                <div className="k">Nama Platform</div>
                <div className={`v ${socialAccountFormatted === '–' ? 'muted' : ''} inline-flex items-center gap-1.5`}>
                  <span>{socialAccountFormatted}</span>
                  {socialAccountFormatted !== '–' && socialAccountFormatted !== '-' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(socialAccountFormatted); }}
                      className="p-1 text-neutral-400 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition cursor-pointer"
                      title="Salin Nama Platform"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* BARIS 2 (4 kolom): No. Handphone | Opsi Pengiriman | Kode Toko / Alamat | Metode Bayar */}
              <div className="icell">
                <div className="k">No. Handphone</div>
                <div className={`v ${phoneFormatted !== '–' ? 'mono' : 'muted'} inline-flex items-center gap-1.5`}>
                  <span>{phoneFormatted}</span>
                  {phoneFormatted !== '–' && phoneFormatted !== '-' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(phoneFormatted); }}
                      className="p-1 text-neutral-400 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition cursor-pointer"
                      title="Salin No. Handphone"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="icell">
                <div className="k">Opsi Pengiriman</div>
                <div className={`v ${logisticsFormatted === '–' ? 'muted' : ''}`}>{logisticsFormatted}</div>
              </div>

              <div className="icell">
                <div className="k">Kode Toko / Alamat</div>
                <div className={`v ${pickupDetailsFormatted === '–' ? 'muted' : ''} inline-flex items-center gap-1.5`}>
                  {o.addressPhotoUrl ? (
                    <div
                      className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 cursor-pointer hover:underline"
                      onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: o.addressPhotoUrl!, title: 'Foto Alamat / Kode Toko' }); }}
                      title="Lihat Foto Alamat"
                    >
                      <span>{pickupDetailsFormatted}</span>
                      <Eye className="w-4 h-4 shrink-0" />
                    </div>
                  ) : (
                    <span>{pickupDetailsFormatted}</span>
                  )}
                  {pickupDetailsFormatted !== '–' && pickupDetailsFormatted !== '-' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(pickupDetailsFormatted); }}
                      className="p-1 text-neutral-400 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition cursor-pointer shrink-0"
                      title="Salin Kode Toko / Alamat"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="icell">
                <div className="k">Metode Bayar</div>
                <div className={`v ${paymentMethodFormatted === '–' ? 'muted' : ''}`}>{paymentMethodFormatted}</div>
              </div>

              {/* BARIS 3 (4 kolom): Platform Order | Nomor Order | Nomor Resi | Tanggal Diminta Kirim */}
              <div className="icell">
                <div className="k">Platform Order</div>
                <div className={`v ${isMarketplace || platformOrderFormatted === '–' ? 'muted' : ''}`}>
                  {isMarketplace ? '–' : (platformOrderFormatted !== '–' ? platformOrderFormatted : (o.platformChannel || '–'))}
                </div>
              </div>

              <div className="icell">
                <div className="k">Nomor Order</div>
                <div className={`v ${orderNumberFormatted !== '–' ? 'mono' : 'muted'} inline-flex items-center gap-1.5`}>
                  <span>{orderNumberFormatted}</span>
                  {orderNumberFormatted !== '–' && orderNumberFormatted !== '-' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(orderNumberFormatted); }}
                      className="p-1 text-neutral-400 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition cursor-pointer"
                      title="Salin Nomor Order"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="icell">
                <div className="k">Nomor Resi</div>
                <div className="v inline-flex items-center gap-1.5">
                  {shippingNumberFormatted !== '–' ? (
                    <span className="chip">{shippingNumberFormatted}</span>
                  ) : (
                    <span className="muted">–</span>
                  )}
                  {shippingNumberFormatted !== '–' && shippingNumberFormatted !== '-' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(shippingNumberFormatted); }}
                      className="p-1 text-neutral-400 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition cursor-pointer"
                      title="Salin Nomor Resi"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="icell">
                <div className="k">Tanggal Diminta Kirim</div>
                <div className={`v ${estShipping === '–' ? 'muted' : ''}`}>{estShipping}</div>
              </div>

              {/* BARIS 4: Sumber Campaign (1 kolom, tepat dibawah Platform Order) | Note dari Customer (3 kolom) */}
              <div className="icell">
                <div className="k">Sumber Campaign</div>
                <div className={`v ${sumberCampaignFormatted === '–' ? 'muted' : ''}`}>{sumberCampaignFormatted}</div>
              </div>

              <div className="icell span-3">
                <div className="k">Note dari Customer</div>
                <div className={`v ${customerNoteFormatted === '–' ? 'muted' : ''}`}>{customerNoteFormatted}</div>
              </div>
            </div>
          </div>

          {/* Buku + Ringkasan */}
          <div className="sec">
            <div className="cols">
              <div>
                <div className="sec-h">
                  <h3>Daftar Buku</h3>
                  <span className="cnt n">{itemsCount} item · {totalQty} Pcs</span>
                  <span className="rule"></span>
                </div>
                <div className="book-wrap">
                  <div
                    className="book-scroll"
                    ref={(el) => {
                      if (el) {
                        const fade = el.nextElementSibling;
                        if (fade) {
                          const scrollable = el.scrollHeight > el.clientHeight + 2;
                          fade.classList.toggle('on', scrollable);
                        }
                      }
                    }}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const fade = el.nextElementSibling;
                      if (fade) {
                        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
                        const scrollable = el.scrollHeight > el.clientHeight + 2;
                        fade.classList.toggle('on', scrollable && !atBottom);
                      }
                    }}
                  >
                    {o.items?.map((it, idx) => {
                      const isTertinggal = it.markedTertinggal || it.markedRefund;
                      const resolvedCover = it.bookCover || books.find(b => b.id === it.bookId)?.cover || '';
                      return (
                        <div key={idx} className={`book ${isTertinggal ? '!bg-neutral-100 dark:!bg-neutral-800/80 opacity-60 p-2 rounded-lg border border-neutral-200 dark:border-neutral-700/60 mb-2' : ''}`}>
                          <div
                            className="cov"
                            onClick={(e) => {
                              if (resolvedCover) {
                                e.stopPropagation();
                                setPreviewImage({ url: resolvedCover, title: it.bookName });
                              }
                            }}
                            style={{ cursor: resolvedCover ? 'pointer' : 'default' }}
                          >
                            {resolvedCover ? (
                              <img referrerPolicy="no-referrer" src={resolvedCover} alt="" className="w-full h-full object-cover rounded-[5px]" />
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className="bi">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="bt" title={it.bookName}>{it.bookName}</div>
                              {isTertinggal && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
                                  Tertinggal
                                </span>
                              )}
                            </div>
                            <div className="bs">{it.qty} Pcs × {formatNTD(it.unitPrice)}</div>
                          </div>
                          <div className="bp">{formatNTD(it.lineTotal)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="fade"></div>
                </div>
              </div>

              <div>
                <div className="sec-h">
                  <h3>Ringkasan Total</h3>
                  <span className="rule"></span>
                </div>
                <div className="summary">
                  {canViewAmount ? (
                    <>
                      <div className="srow">
                        <span className="k">Subtotal</span>
                        <span className="v n">{formatNTD(o.subtotal)}</span>
                      </div>
                      <div className="srow disc">
                        <span className="k">Diskon</span>
                        <span className="v n">−{formatNTD(o.discount || 0)}</span>
                      </div>
                      {o.platformFee ? (
                        <div className="srow" style={{ color: '#d97706' }}>
                          <span className="k">Biaya Platform</span>
                          <span className="v n">−{formatNTD(o.platformFee)}</span>
                        </div>
                      ) : null}
                      <div className="srow grand">
                        <span className="k">Total Akhir (TWD)</span>
                        <span className="v n">{formatNTD(o.totalPrice)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="srow" style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                      <span className="k">Nilai disembunyikan</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Riwayat */}
          <div className="sec">
            <div className="sec-h">
              <h3>Riwayat Status &amp; Transaksi</h3>
              <span className="rule"></span>
            </div>
            <div className="tl">
              {historyEvents.map((ev) => (
                <div key={ev.key} className="tli" style={{ '--tc': ev.color } as React.CSSProperties}>
                  <div className="tli-h">
                    <div>
                      <div className="tli-t">{ev.label}</div>
                      <div className="tli-d">
                        {formatDetailDate(ev.date)}
                        {ev.author ? ` · ${ev.author}` : ''}
                      </div>
                      {ev.key === 'pending' && o.parentOrderCode && (
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1 flex items-center gap-1">
                          <span>Bagian Dari SO:</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const parent = orders.find(o => o.id === o.parentOrderId || o.orderCode === o.parentOrderCode || `#${o.orderCode}` === o.parentOrderCode);
                              if (parent) setViewingOrderDetail(parent);
                              else alert(`SO #${o.parentOrderCode} tidak ditemukan`);
                            }}
                            className="underline hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer"
                          >
                            #{o.parentOrderCode.replace(/^#/, '')}
                          </button>
                        </div>
                      )}
                      {o.childOrderCodes && o.childOrderCodes.length > 0 && (ev.key === 'pending' || ev.key === 'dikirim') && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1 flex items-center gap-1 flex-wrap">
                          <span>SO Barang Tertinggal:</span>
                          {o.childOrderCodes.map((ccode, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const child = orders.find(o => o.orderCode === ccode || `#${o.orderCode}` === ccode || o.orderCode === `#${ccode}`);
                                if (child) setViewingOrderDetail(child);
                                else alert(`SO ${ccode} tidak ditemukan`);
                              }}
                              className="underline hover:text-amber-800 dark:hover:text-amber-300 cursor-pointer"
                            >
                              #{ccode.replace(/^#/, '')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="bdg" style={{ '--bc': ev.color, '--bt': ev.tint } as React.CSSProperties}>
                      <span className="d"></span>
                      {ev.badgeLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════ FOOT ══════ */}
        <div className="mfoot">
          <span className="foot-meta">
            {lastUpdated ? `Terakhir diperbarui ${lastUpdated}` : ''}
          </span>
          <div className="foot-btns">
            {isStaffValue && (o.status === 'draft' || o.status === 'confirmed') && (o.items?.length || 0) > 1 && (
              <button
                type="button"
                className="btn bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800"
                onClick={() => {
                  const ord = o;
                  setViewingOrderDetail(null);
                  handleOpenSplitOrderModal(ord);
                }}
              >
                <GitFork className="w-4 h-4" />
                Opsi Kirim Sebagian
              </button>
            )}

            {isStaffValue && !o.isMarketplaceRefunded && (o.parentOrderId || o.status === 'cancelled' || o.status === 'draft' || o.status === 'confirmed') && (
              <button
                type="button"
                className="btn bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
                onClick={() => {
                  setRefundConfirmOrder(o);
                }}
              >
                Refund Marketplace
              </button>
            )}

            {o.isMarketplaceRefunded && (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                <Check className="w-4 h-4" />
                Marketplace Refunded
              </span>
            )}

            {isStaffValue && (o.status === 'shipped' || o.status === 'confirmed') && (
              <>
                <button
                  type="button"
                  className="btn text-white bg-[#0f7a52] hover:bg-[#0c6342]"
                  onClick={() => {
                    setViewingOrderDetail(null);
                    openSelesaiConfirm(o);
                  }}
                >
                  Selesai
                </button>
                <button
                  type="button"
                  className="btn text-white bg-[#dd7d84] hover:bg-[#a8323b]"
                  onClick={() => {
                    const orderId = o.id;
                    setViewingOrderDetail(null);
                    handleTransitionToReturned(orderId);
                  }}
                >
                  Return
                </button>
              </>
            )}
            
            {profile?.role === 'owner' && (
              <button
                type="button"
                className="btn text-[#3d4451] bg-[#f3f4f6] hover:bg-[#e8eaed] dark:text-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 font-['Lexend']"
                onClick={() => {
                  setViewingOrderDetail(null);
                  handleEditOrderClick(o);
                }}
              >
                <Edit className="w-4 h-4 mr-1.5" />
                Edit Metadata
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                window.print();
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9V3h12v6M6 18H4v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6h-2M6 14h12v7H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
              Cetak
            </button>
            <button
              type="button"
              className="btn btn-brand"
              onClick={() => setViewingOrderDetail(null)}
            >
              Tutup
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderStepper = (order: SalesOrder) => {
    const formatDateStyle = (dt: any) => {
      if (!dt) return '';
      let dateObj: Date | null = null;
      if (dt.seconds) {
        dateObj = new Date(dt.seconds * 1000);
      } else if (dt instanceof Date) {
        dateObj = dt;
      } else if (typeof dt === 'string' || typeof dt === 'number') {
        dateObj = new Date(dt);
      }
      if (!dateObj || isNaN(dateObj.getTime())) {
        return '';
      }
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd}`;
    };

    // Determine the pathway
    let steps: { key: string; label: string; date: any; isCompleted: boolean; isCurrent: boolean }[] = [];

    const dateMenunggu = order.orderDate || order.createdAt;
    const datePacked = order.packedAt;
    const dateDikirim = order.shippedAt || order.shipment?.arrangedAt || order.shipment?.shippingDate;
    const dateReturn = order.returnedAt;
    const dateDiambil = order.diambilAt;
    const dateCancel = order.cancelledAt;
    const dateSelesai = order.completedAt;

    if (order.status === 'cancelled' && order.precedingStatus === 'returned') {
      // Cancelled via Return Pipeline Timeline (5 steps)
      steps = [
        { key: 'menunggu', label: 'Pending', date: dateMenunggu, isCompleted: true, isCurrent: false },
        { key: 'packed', label: 'Dikemas', date: datePacked, isCompleted: true, isCurrent: false },
        { key: 'dikirim', label: 'Dikirim', date: dateDikirim, isCompleted: true, isCurrent: false },
        { key: 'return', label: 'Return', date: dateReturn, isCompleted: true, isCurrent: false },
        { key: 'cancel', label: 'Cancel', date: dateCancel || dateDiambil, isCompleted: true, isCurrent: true }
      ];
    } else if (order.status === 'returned') {
      // Standard Return Workflow Timeline (4 steps)
      steps = [
        { key: 'menunggu', label: 'Pending', date: dateMenunggu, isCompleted: true, isCurrent: false },
        { key: 'packed', label: 'Dikemas', date: datePacked, isCompleted: true, isCurrent: false },
        { key: 'dikirim', label: 'Dikirim', date: dateDikirim, isCompleted: true, isCurrent: false },
        { key: 'return', label: 'Return', date: dateReturn, isCompleted: true, isCurrent: true }
      ];
    } else if (order.status === 'cancelled') {
      // Direct Cancellation Pipeline Timeline (2 steps: Menunggu -> Cancel)
      steps = [
        { key: 'menunggu', label: 'Pending', date: dateMenunggu, isCompleted: true, isCurrent: false },
        { key: 'cancel', label: 'Cancel', date: dateCancel, isCompleted: true, isCurrent: true }
      ];
    } else {
      // Default/Normal: Pending -> Dikemas -> Dikirim -> Selesai
      const isDraftActive = true;
      const isPackedActive = order.status === 'packed' || order.status === 'shipped' || order.status === 'completed';
      const isShippedActive = order.status === 'shipped' || order.status === 'completed';
      const isCompletedActive = order.status === 'completed';

      steps = [
        { key: 'menunggu', label: 'Pending', date: dateMenunggu, isCompleted: isDraftActive, isCurrent: order.status === 'draft' || !order.status },
        { key: 'packed', label: 'Dikemas', date: datePacked, isCompleted: isPackedActive, isCurrent: order.status === 'packed' },
        { key: 'dikirim', label: 'Dikirim', date: dateDikirim, isCompleted: isShippedActive, isCurrent: order.status === 'shipped' },
        { key: 'completed', label: 'Selesai', date: dateSelesai, isCompleted: isCompletedActive, isCurrent: order.status === 'completed' }
      ];
    }

    return (
      <div className="w-full flex items-center justify-between relative mt-2 mb-4 font-text max-w-2xl mx-auto">
        {steps.map((st, i) => {
          const isActive = st.isCompleted;
          const isCurrent = st.isCurrent;
          const dateStr = formatDateStyle(st.date);
          return (
            <div key={st.key} className="flex flex-col items-center flex-1 relative">
              {/* Connected Connector Line */}
              {i > 0 && (
                <div className={`absolute right-1/2 left-[-50%] top-3.5 -translate-y-1/2 h-1 z-0 ${isActive ? 'bg-brand-600' : 'bg-neutral-200 dark:bg-neutral-800'
                  }`} />
              )}
              {/* Node Circle */}
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 relative z-10 ${isCurrent
                ? 'bg-brand-600 text-white ring-4 ring-brand-500/20'
                : isActive
                  ? 'bg-brand-500 text-white'
                  : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}>
                {i + 1}
              </div>
              <span className={`text-[10px] mt-1.5 font-semibold uppercase tracking-wider relative z-10 ${isActive ? 'text-brand-600 dark:text-brand-400 font-extrabold' : 'text-neutral-400'
                }`}>
                {st.label}
              </span>
              {/* Automated Real-time Timestamp Layout System */}
              {dateStr && (
                <span className="text-[9px] text-neutral-400 dark:text-neutral-500 font-medium tracking-normal mt-0.5 relative z-10">
                  {dateStr}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const currentManageList = manageActiveTab === 'type'
    ? resolvedOrderTypes
    : (manageActiveTab === 'channel' ? resolvedChannels
      : (manageActiveTab === 'platform' ? resolvedPlatforms
        : (manageActiveTab === 'marketplace' ? resolvedMarketplaces : resolvedLogistics)));

  const activeTabLabel = manageActiveTab === 'type'
    ? 'Sumber Campaign'
    : (manageActiveTab === 'channel' ? 'Channel'
      : (manageActiveTab === 'platform' ? 'Platform Order'
        : (manageActiveTab === 'marketplace' ? 'Platform Marketplace' : 'Opsi Pengiriman')));

  const activeTabPlaceholder = manageActiveTab === 'type'
    ? 'contoh: TikTok shop'
    : (manageActiveTab === 'channel' ? 'contoh: Telegram'
      : (manageActiveTab === 'platform' ? 'contoh: Shopee'
        : (manageActiveTab === 'marketplace' ? 'contoh: Shopee' : 'contoh: 7-Eleven')));

  const pendingSum = useMemo(() => pendingOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0), [pendingOrders]);
  const packedSum = useMemo(() => packedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0), [packedOrders]);
  const shippedSum = useMemo(() => shippedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0), [shippedOrders]);
  const returnedSum = useMemo(() => returnedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0), [returnedOrders]);
  const completedSum = useMemo(() => completedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0), [completedOrders]);
  const cancelledSum = useMemo(() => cancelledOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0), [cancelledOrders]);
  const searchedSum = useMemo(() => searchedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0), [searchedOrders]);

  const activeBigCount = useMemo(() => {
    if (activeFilterTab === 'Pending') return pendingOrders.length;
    if (activeFilterTab === 'Dikemas') return packedOrders.length;
    if (activeFilterTab === 'Dikirim') return shippedOrders.length;
    if (activeFilterTab === 'Return') return returnedOrders.length;
    if (activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai') return completedOrders.length;
    if (activeFilterTab === 'Cancel') return cancelledOrders.length;
    return dateFilteredOrders.length;
  }, [activeFilterTab, pendingOrders.length, packedOrders.length, shippedOrders.length, returnedOrders.length, completedOrders.length, cancelledOrders.length, dateFilteredOrders.length]);

  return (
    <div className="space-y-4">
      {/* Portal for Mobile Topbar Actions */}
      {portalTarget && isMobileScreen && isStaffValue && createPortal(
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-transparent active:bg-neutral-200/50 dark:active:bg-neutral-800 text-[#3d4451] dark:text-neutral-200 transition"
          onClick={() => setIsSalesActionsOpen(true)}
          aria-label="Aksi lainnya"
        >
          <MoreHorizontal className="w-[22px] h-[22px]" />
        </button>,
        portalTarget
      )}

      {/* 1. MASTHEAD HEADER CARD */}
      <div className="hidden md:block bg-transparent md:bg-white md:dark:bg-neutral-900 border-none md:border md:border-[#E7E1D2] md:dark:border-neutral-800 rounded-[14px] p-0 md:p-5 sm:p-6 shadow-none md:shadow-xs mb-2">
        <div className="kbi-somast flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center justify-between md:justify-start w-full md:w-auto gap-3">
            <div className="flex items-center gap-3">
              <div className="hidden md:flex w-[38px] h-[38px] rounded-[10px] bg-[#0d1117] dark:bg-white text-white dark:text-[#0d1117] items-center justify-center shrink-0 shadow-2xs">
                <ShoppingCart className="w-[19px] h-[19px]" />
              </div>
              <div>
                <h1 className="text-[21px] font-bold font-['Lexend'] tracking-tight text-[#0d1117] dark:text-white leading-tight">
                  Sales Orders
                </h1>
                <div className="text-[12.5px] text-[#9ca3af] mt-0.5 font-['Lexend']">
                  <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-300">{dateFilteredOrders.length}</b> orderan <span className="hidden md:inline">· {globalDateLabel || 'Semua Tanggal'}</span>
                </div>
              </div>
            </div>
          </div>

          {isStaffValue && (
            <div className="hidden md:flex items-center gap-2 flex-wrap">
              <button
                id="import-sales-button"
                onClick={() => setIsImportModalOpen(true)}
                className="w-[34px] h-[34px] rounded-[8px] bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 text-[#6b7280] dark:text-neutral-300 hover:text-[#0d1117] hover:border-neutral-300 dark:hover:border-neutral-700 transition flex items-center justify-center shrink-0 cursor-pointer"
                title="Import (Excel)"
              >
                <Upload className="w-[15px] h-[15px]" />
              </button>
              <button
                id="export-sales-button"
                onClick={exportSalesToCSV}
                className="w-[34px] h-[34px] rounded-[8px] bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 text-[#6b7280] dark:text-neutral-300 hover:text-[#0d1117] hover:border-neutral-300 dark:hover:border-neutral-700 transition flex items-center justify-center shrink-0 cursor-pointer"
                title="Export (CSV)"
              >
                <Download className="w-[15px] h-[15px]" />
              </button>
              <div className="w-[1px] h-[22px] bg-[#E7E1D2] dark:bg-neutral-800 mx-1 hidden sm:block" />
              <button
                id="manage-sales-config"
                onClick={() => setIsManageConfigOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 hover:text-[#0d1117] hover:border-neutral-300 dark:hover:border-neutral-700 text-[13px] font-semibold transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#6b7280]" />
                Manage
              </button>
              <button
                onClick={() => setIsChecklistOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 hover:text-[#0d1117] hover:border-neutral-300 dark:hover:border-neutral-700 text-[13px] font-semibold transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-[#6b7280]" />
                Checklist
              </button>
              {hasPerm('sales.prosesMassal') && (
                <button
                  onClick={() => setIsBulkProcessOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[#eef3fa] dark:bg-brand-950/40 text-[#2b5a9e] dark:text-brand-300 hover:bg-[#e2ebf6] dark:hover:bg-brand-900/60 text-[13px] font-semibold transition cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Proses Massal
                </button>
              )}
              <button
                id="create-sales-order"
                onClick={openNewOrder}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[#2b5a9e] hover:bg-[#1e4275] text-white text-[13px] font-semibold shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Orderan Baru
              </button>
            </div>
          )}
          {/* Mobile: "..." button is moved to the title row above. */}
        </div>
      </div>

      {/* 2. PIPELINE CARD */}
      <div className="bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[14px] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-['Inter'] text-[26px] font-bold tracking-tight text-[#0d1117] dark:text-white">
              {activeBigCount}
            </span>
            <span className="text-[12.5px] text-[#9ca3af]">
              {activeFilterTab === 'Semua' ? (
                <>orderan{canViewAmount && <> · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(pendingSum)}</b> pending</>}</>
              ) : activeFilterTab === 'Pending' ? (
                <>orderan Pending{canViewAmount && <> · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(pendingSum)}</b></>}</>
              ) : activeFilterTab === 'Dikemas' ? (
                <>orderan Dikemas{canViewAmount && <> · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(packedSum)}</b></>}</>
              ) : activeFilterTab === 'Dikirim' ? (
                <>orderan Dikirim{canViewAmount && <> · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(shippedSum)}</b></>}</>
              ) : activeFilterTab === 'Return' ? (
                <>orderan Return{canViewAmount && <> · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(returnedSum)}</b></>}</>
              ) : activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai' ? (
                <>orderan Selesai{canViewAmount && <> · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(completedSum)}</b></>}</>
              ) : (
                <>orderan Cancel{canViewAmount && <> · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(cancelledSum)}</b></>}</>
              )}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <DateRangePicker
              startDate={globalStartDate}
              endDate={globalEndDate}
              presetLabel={globalDateLabel}
              onChange={(start, end, label) => {
                setGlobalStartDate(start);
                setGlobalEndDate(end);
                if (label) setGlobalDateLabel(label);
              }}
            />
          </div>
        </div>

        {/* FLOW BAR */}
        <div className="flex h-[7px] rounded-full overflow-hidden bg-[#f3f4f6] dark:bg-neutral-800 mb-4 gap-0.5">
          {[
            { key: 'Pending', count: pendingOrders.length, color: '#f0a952', label: 'Pending' },
            { key: 'Dikemas', count: packedOrders.length, color: '#6366f1', label: 'Dikemas' },
            { key: 'Dikirim', count: shippedOrders.length, color: '#57a5d4', label: 'Dikirim' },
            { key: 'Return', count: returnedOrders.length, color: '#dd7d84', label: 'Return' },
            { key: 'Berhasil', count: completedOrders.length, color: '#4fbb8c', label: 'Selesai' },
            { key: 'Cancel', count: cancelledOrders.length, color: '#a8b0bb', label: 'Cancel' },
          ].map((seg) => {
            if (seg.count === 0) return null;
            const isFocused = activeFilterTab === 'Semua' || activeFilterTab === seg.key || ((activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai') && seg.key === 'Berhasil');
            return (
              <div
                key={seg.key}
                title={`${seg.label}: ${seg.count}`}
                style={{
                  flexGrow: seg.count,
                  backgroundColor: seg.color,
                  opacity: isFocused ? 1 : 0.28,
                }}
                className="rounded-full min-w-[3px] transition-all duration-300"
              />
            );
          })}
        </div>

        {/* CHIPS */}
        <div className="kbi-sostat flex overflow-x-auto snap-x hide-scrollbar gap-2.5 pb-2 sm:grid sm:grid-cols-4 lg:grid-cols-7 sm:overflow-visible sm:pb-0 mb-3">
          {/* Semua */}
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab('Semua');
              setExpandedOrderId(null);
              setCurrentPage(1);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border hover:bg-neutral-50 dark:hover:bg-neutral-800 ${activeFilterTab === 'Semua'
              ? 'border-[#0d1117] dark:border-white bg-[#f5f6f7] dark:bg-neutral-800'
              : 'border-[#E7E1D2] dark:border-neutral-800'
              }`}
          >
            {activeFilterTab === 'Semua' && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#0d1117] dark:bg-white" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0d1117] dark:bg-white shrink-0" />
              <span className={`text-[10px] font-semibold ${activeFilterTab === 'Semua' ? 'text-[#0d1117] dark:text-white' : 'text-[#6b7280]'}`}>
                Semua
              </span>
            </div>
            <div className={`font-['Inter'] font-bold text-[16px] leading-none ${activeFilterTab === 'Semua' ? 'text-[#0d1117] dark:text-white' : 'text-[#0d1117] dark:text-neutral-100'}`}>
              {dateFilteredOrders.length}
            </div>
            <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
              seluruh periode
            </div>
          </button>

          {/* Pending */}
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab(activeFilterTab === 'Pending' ? 'Semua' : 'Pending');
              setExpandedOrderId(null);
              setCurrentPage(1);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border hover:bg-neutral-50 dark:hover:bg-neutral-800 ${activeFilterTab === 'Pending'
              ? 'border-[#b45309] bg-[#fef3e2] dark:bg-amber-955/30'
              : 'border-[#E7E1D2] dark:border-neutral-800'
              }`}
          >
            {activeFilterTab === 'Pending' && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#b45309]" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#b45309] shrink-0" />
              <span className={`text-[10px] font-semibold ${activeFilterTab === 'Pending' ? 'text-[#b45309]' : 'text-[#6b7280]'}`}>
                Pending
              </span>
            </div>
            <div className={`font-['Inter'] font-bold text-[16px] leading-none ${activeFilterTab === 'Pending' ? 'text-[#b45309]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
              {pendingOrders.length}
            </div>
            <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
              {canViewAmount ? (pendingOrders.length > 0 ? formatNTD(pendingSum) : '—') : ''}
            </div>
          </button>

          {/* Dikemas */}
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab(activeFilterTab === 'Dikemas' ? 'Semua' : 'Dikemas');
              setExpandedOrderId(null);
              setCurrentPage(1);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border hover:bg-neutral-50 dark:hover:bg-neutral-800 ${activeFilterTab === 'Dikemas'
              ? 'border-[#6366f1] bg-[#eef2ff] dark:bg-indigo-955/30'
              : 'border-[#E7E1D2] dark:border-neutral-800'
              }`}
          >
            {activeFilterTab === 'Dikemas' && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#6366f1]" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1] shrink-0" />
              <span className={`text-[10px] font-semibold ${activeFilterTab === 'Dikemas' ? 'text-[#6366f1]' : 'text-[#6b7280]'}`}>
                Dikemas
              </span>
            </div>
            <div className={`font-['Inter'] font-bold text-[16px] leading-none ${activeFilterTab === 'Dikemas' ? 'text-[#6366f1]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
              {packedOrders.length}
            </div>
            <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
              {canViewAmount ? (packedOrders.length > 0 ? formatNTD(packedSum) : '—') : ''}
            </div>
          </button>

          {/* Dikirim */}
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab(activeFilterTab === 'Dikirim' ? 'Semua' : 'Dikirim');
              setExpandedOrderId(null);
              setCurrentPage(1);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border hover:bg-neutral-50 dark:hover:bg-neutral-800 ${activeFilterTab === 'Dikirim'
              ? 'border-[#1d6fa5] bg-[#e8f2f9] dark:bg-sky-955/30'
              : 'border-[#E7E1D2] dark:border-neutral-800'
              }`}
          >
            {activeFilterTab === 'Dikirim' && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1d6fa5]" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1d6fa5] shrink-0" />
              <span className={`text-[10px] font-semibold ${activeFilterTab === 'Dikirim' ? 'text-[#1d6fa5]' : 'text-[#6b7280]'}`}>
                Dikirim
              </span>
            </div>
            <div className={`font-['Inter'] font-bold text-[16px] leading-none ${activeFilterTab === 'Dikirim' ? 'text-[#1d6fa5]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
              {shippedOrders.length}
            </div>
            <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
              {canViewAmount ? (shippedOrders.length > 0 ? formatNTD(shippedSum) : '—') : ''}
            </div>
          </button>

          {/* Selesai */}
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab(activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai' ? 'Semua' : 'Berhasil');
              setExpandedOrderId(null);
              setCurrentPage(1);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border hover:bg-neutral-50 dark:hover:bg-neutral-800 ${activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai'
              ? 'border-[#0f7a52] bg-[#e7f5ef] dark:bg-emerald-955/30'
              : 'border-[#E7E1D2] dark:border-neutral-800'
              }`}
          >
            {(activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai') && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#0f7a52]" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0f7a52] shrink-0" />
              <span className={`text-[10px] font-semibold ${activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai' ? 'text-[#0f7a52]' : 'text-[#6b7280]'}`}>
                Selesai
              </span>
            </div>
            <div className={`font-['Inter'] font-bold text-[16px] leading-none ${activeFilterTab === 'Berhasil' || activeFilterTab === 'Selesai' ? 'text-[#0f7a52]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
              {completedOrders.length}
            </div>
            <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
              {canViewAmount ? (completedOrders.length > 0 ? formatNTD(completedSum) : '—') : ''}
            </div>
          </button>

          {/* Return */}
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab(activeFilterTab === 'Return' ? 'Semua' : 'Return');
              setExpandedOrderId(null);
              setCurrentPage(1);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border hover:bg-neutral-50 dark:hover:bg-neutral-800 ${activeFilterTab === 'Return'
              ? 'border-[#a8323b] bg-[#fbecec] dark:bg-rose-955/30'
              : 'border-[#E7E1D2] dark:border-neutral-800'
              }`}
          >
            {activeFilterTab === 'Return' && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#a8323b]" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a8323b] shrink-0" />
              <span className={`text-[10px] font-semibold ${activeFilterTab === 'Return' ? 'text-[#a8323b]' : 'text-[#6b7280]'}`}>
                Return
              </span>
            </div>
            <div className={`font-['Inter'] font-bold text-[16px] leading-none ${activeFilterTab === 'Return' ? 'text-[#a8323b]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
              {returnedOrders.length}
            </div>
            <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
              {canViewAmount ? (returnedOrders.length > 0 ? formatNTD(returnedSum) : '—') : ''}
            </div>
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab(activeFilterTab === 'Cancel' ? 'Semua' : 'Cancel');
              setExpandedOrderId(null);
              setCurrentPage(1);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border hover:bg-neutral-50 dark:hover:bg-neutral-800 ${activeFilterTab === 'Cancel'
              ? 'border-[#5b6472] bg-[#f1f2f4] dark:bg-neutral-800 shadow-sm'
              : 'border-[#E7E1D2] dark:border-neutral-800'
              }`}
          >
            {activeFilterTab === 'Cancel' && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#5b6472]" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5b6472] shrink-0" />
              <span className={`text-[10px] font-semibold ${activeFilterTab === 'Cancel' ? 'text-[#5b6472]' : 'text-[#6b7280]'}`}>
                Cancel
              </span>
            </div>
            <div className={`font-['Inter'] font-bold text-[16px] leading-none ${activeFilterTab === 'Cancel' ? 'text-[#5b6472]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
              {cancelledOrders.length}
            </div>
            <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
              {canViewAmount ? (cancelledOrders.length > 0 ? formatNTD(cancelledSum) : '—') : ''}
            </div>
          </button>
        </div>
      </div>

      {/* 3. TOOLBAR */}
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 w-full flex items-center bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[10px] px-3.5 h-11 md:h-auto md:py-2.5 focus-within:border-[#2b5a9e] focus-within:ring-2 focus-within:ring-[#2b5a9e]/10 transition">
            <Search className="w-[15px] h-[15px] text-[#9ca3af] shrink-0 mr-2.5" />
            <input
              type="text"
              id="q"
              placeholder="Cari nama pembeli, nomor order, resi, atau judul buku…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full bg-transparent border-none outline-none font-['Lexend'] text-[13.5px] text-[#0d1117] dark:text-white placeholder-[#9ca3af]"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
            aria-label="Filter"
            className={`inline-flex items-center justify-center md:justify-start gap-1.5 w-11 h-11 md:w-auto md:h-auto px-0 py-0 md:px-3.5 md:py-2.5 border rounded-[8px] font-['Lexend'] font-semibold text-[13px] transition cursor-pointer select-none shrink-0 ${isFilterDrawerOpen
              ? 'bg-[#eef3fa] border-[#2b5a9e] text-[#2b5a9e]'
              : 'bg-white dark:bg-neutral-900 border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-700'
              }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Filter</span>
            <ChevronDown className={`hidden md:block w-3.5 h-3.5 transition-transform duration-150 ${isFilterDrawerOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expandable Advanced Filter Drawer */}
        {isFilterDrawerOpen && (
          <div className="bg-neutral-50 dark:bg-neutral-950 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end animate-fadeIn">
            {/* MOBILE ONLY: Date Picker in Filter Drawer */}
            <div className="md:hidden col-span-full space-y-1">
              <label className="text-[10px] font-bold capitalize text-neutral-500 tracking-wider">Tanggal Order</label>
              <DateRangePicker
                startDate={globalStartDate}
                endDate={globalEndDate}
                presetLabel={globalDateLabel}
                onChange={(start, end, label) => {
                  setGlobalStartDate(start);
                  setGlobalEndDate(end);
                  if (label) setGlobalDateLabel(label);
                }}
              />
            </div>

            {/* 1. Platform Order */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold capitalize text-neutral-500 tracking-wider">Platform Order</label>
              <select
                value={platformFilterInput}
                onChange={(e) => setPlatformFilterInput(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-white focus:outline-none"
              >
                <option value="">Semua Platform</option>
                {resolvedPlatforms.map((p) => (
                  <option key={p.id || p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* 2. Sumber Order */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold capitalize text-neutral-500 tracking-wider">Sumber Order</label>
              <select
                value={sumberFilterInput}
                onChange={(e) => setSumberFilterInput(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-white focus:outline-none"
              >
                <option value="">Semua Sumber Order</option>
                {resolvedOrderTypes.map((t) => (
                  <option key={t.id || t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* 3. Opsi Pengiriman */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold capitalize text-neutral-500 tracking-wider">Opsi Pengiriman</label>
              <select
                value={courierInput}
                onChange={(e) => setCourierInput(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-white focus:outline-none"
              >
                <option value="">Semua Pengiriman</option>
                {resolvedLogistics.map((l) => (
                  <option key={l.id || l.name} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* 4. Detail Alamat / Catatan */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold capitalize text-neutral-500 tracking-wider">Detail Alamat / Catatan</label>
              <input
                type="text"
                placeholder="Cari isi alamat / note..."
                value={detailsInput}
                onChange={(e) => setDetailsInput(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-white"
              />
            </div>

            {/* 5. Action Buttons */}
            <div className="md:col-span-1 flex gap-2 w-full justify-end">
              <button
                type="button"
                onClick={handleResetAdvancedFilters}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-850 cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApplyAdvancedFilters}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#2b5a9e] hover:bg-[#1e4275] rounded-lg shadow-xs cursor-pointer"
              >
                Search
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4a. MOBILE ORDER CARDS (<768px)
           A record-per-card presentation of the exact same paginatedOrders list
           the table below renders. Every control calls the identical handler —
           this is a second view of the same data, not a second code path. */}
      <div className="kbi-ocards md:hidden">
        {paginatedOrders.map((order, orderIdx) => {
          const orderQty = (order.items || []).reduce((acc, it) => acc + (it.qty || 0), 0);
          const orderDateMs = getOrderDateMs(order);
          const formattedDate = orderDateMs
            ? new Date(orderDateMs).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : 'N/A';

          const overdueDays = getOverdueDays(order);
          const isOverdue = overdueDays >= 15;
          const isCritical = overdueDays >= 21;
          const isReadyStock = checkIsReadyStock(order);
          const isPinnedOrder = !!order.isPinned;
          const showReadyStockHighlight = !isPinnedOrder && isReadyStock;
          const showOverdueHighlight = !isPinnedOrder && !showReadyStockHighlight && isOverdue;

          let cardBgClass = '!bg-white dark:!bg-neutral-900 !border-[#E7E1D2] dark:!border-neutral-800';
          if (order.isPinned) {
            cardBgClass = '!bg-amber-50 dark:!bg-amber-900/10 !border-amber-200 dark:!border-amber-900/30';
          } else if (showReadyStockHighlight) {
            cardBgClass = '!bg-emerald-50 dark:!bg-emerald-900/10 !border-emerald-200 dark:!border-emerald-900/30';
          } else if (showOverdueHighlight) {
            cardBgClass = isCritical ? '!bg-red-50 dark:!bg-red-900/10 !border-red-200 dark:!border-red-900/30' : '!bg-orange-50 dark:!bg-orange-900/10 !border-orange-200 dark:!border-orange-900/30';
          }

          let pillColor = '#b45309';
          let pillBg = '#fef3e2';
          let pillLabel = 'Pending';
          if (order.status === 'completed') { pillColor = '#0f7a52'; pillBg = '#e7f5ef'; pillLabel = 'Selesai'; }
          else if (order.status === 'packed') { pillColor = '#6366f1'; pillBg = '#eef2ff'; pillLabel = 'Dikemas'; }
          else if (order.status === 'shipped' || order.status === 'confirmed') { pillColor = '#1d6fa5'; pillBg = '#e8f2f9'; pillLabel = 'Dikirim'; }
          else if (order.status === 'returned') { pillColor = '#a8323b'; pillBg = '#fbecec'; pillLabel = 'Return'; }
          else if (order.status === 'cancelled') { pillColor = '#5b6472'; pillBg = '#f1f2f4'; pillLabel = 'Cancel'; }
          else if (order.isDraft) { pillLabel = 'Draft'; }

          const channelName = order.platformChannel || '-';
          const channelObj = resolvedChannels.find(c => (c.name || '').toLowerCase() === channelName.toLowerCase());
          const channelColor = getChannelColor(channelName, channelObj);

          const isDraftLike = order.status === 'draft' || !order.status;
          const canDelete = order.status !== 'packed' && order.status !== 'shipped' && order.status !== 'confirmed'
            && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'returned';

          return (
            <article
              key={`m-${order.id}-${orderIdx}`}
              className={`kbi-ocard ${cardBgClass}`}
              onClick={() => setViewingOrderDetail(order)}
            >
              {/* Status ribbon — the card's spine. */}
              <span className="kbi-ocard__ribbon" style={{ backgroundColor: pillColor }} aria-hidden="true" />

              <div className="kbi-ocard__top pb-1">
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0 mr-2">
                  <span className="font-bold text-neutral-900 dark:text-white text-[13px] leading-none truncate max-w-[100px]">{order.orderCode}</span>
                  <span className="text-neutral-300 dark:text-neutral-600 leading-none text-xs">•</span>
                  <span className="font-semibold text-[11.5px] truncate flex-1" style={{ color: channelColor }}>{channelName}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandedOrderId(expandedOrderId === order.id ? null : order.id); }}
                  className="kbi-ocard__status shrink-0"
                  style={{ backgroundColor: pillBg, color: pillColor, minHeight: '24px', padding: '2px 6px' }}
                  aria-expanded={expandedOrderId === order.id}
                >
                  <span className="kbi-ocard__statusdot" style={{ backgroundColor: pillColor }} />
                  {pillLabel}
                </button>
              </div>

              <div className="kbi-ocard__rule border-t border-neutral-200 dark:border-neutral-700/60 my-1" />

              <div className="kbi-ocard__body pt-1">
                {/* Baris 2: Nomor Order + Copy */}
                {order.orderNumber && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[12px] font-mono text-neutral-600 dark:text-neutral-400">{order.orderNumber}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(order.orderNumber);
                          alert('Nomor Order berhasil disalin!');
                        }
                      }}
                      className="text-neutral-400 hover:text-brand-500 transition-colors p-1"
                      title="Copy Nomor Order"
                    >
                      <Copy className="w-[12px] h-[12px]" />
                    </button>
                  </div>
                )}

                {/* Baris 3: Nama Pembeli */}
                <div className="font-bold text-[#2b5a9e] dark:text-brand-400 text-[13px] mb-2 leading-none">
                  {order.buyerType === 'marketplace' && order.customerPlatformName ? order.customerPlatformName : (order.customerName || channelName)}
                </div>

                {/* Baris 4: Date + Tags + COD */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                  <span className="font-medium">{formattedDate}</span>

                  {showReadyStockHighlight && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-1 py-0.5 rounded-[4px] font-semibold"><Check className="h-3 w-3" />Stok siap</span>
                  )}
                  {showOverdueHighlight && (
                    <span className="inline-flex items-center px-1 py-0.5 rounded-[4px] font-semibold" style={{ backgroundColor: isCritical ? '#fde3e1' : '#fef3e0', color: isCritical ? '#a8323b' : '#b45309' }}>{overdueDays} hari</span>
                  )}
                  {isPinnedOrder && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-1 py-0.5 rounded-[4px] font-semibold"><Pin className="h-3 w-3 fill-current" />Disematkan</span>
                  )}

                  <span className="text-neutral-300 dark:text-neutral-600">•</span>
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    {order.paymentMethod || 'COD'}
                  </span>
                  {order.pickupLogistics && (
                    <>
                      <span className="text-neutral-300 dark:text-neutral-600">•</span>
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                        {order.pickupLogistics}
                      </span>
                    </>
                  )}
                </div>

                {/* Baris 5: Qty + Diskon + Total */}
                <div className="flex items-center justify-between mt-1 mb-0">
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span>Qty: <b className="text-neutral-700 dark:text-neutral-300">{orderQty}</b></span>
                    {!!order.discount && (
                      <>
                        <span className="text-neutral-300 dark:text-neutral-600">•</span>
                        <span>Diskon: <b className="text-rose-500">−{formatNTD(order.discount)}</b></span>
                      </>
                    )}
                  </div>
                  {canViewAmount && (
                    <div className="font-black text-[#2b5a9e] dark:text-[#818cf8] text-[13px]">
                      {formatNTD(order.totalPrice)}
                    </div>
                  )}
                </div>
              </div>

              <div className="kbi-ocard__actions" onClick={(e) => e.stopPropagation()}>
                <div className="kbi-ocard__icons">
                  <button type="button" className="kbi-ocard__mini" title="Cetak Invoice" aria-label="Cetak invoice"
                    onClick={() => setPrintInvoiceOrder(order)}>
                    <Printer className="h-4 w-4" />
                  </button>

                  {isDraftLike && isStaffValue ? (
                    <button type="button" className="kbi-ocard__mini" title="Edit Orderan" aria-label="Edit orderan"
                      onClick={() => handleEditOrderClick(order)}>
                      <Edit className="h-4 w-4" />
                    </button>
                  ) : (order.status === 'packed' || order.status === 'shipped' || order.status === 'confirmed') ? (() => {
                    const resi = (order.shipment?.shippingNumber || (order as any).shippingNumber || '').trim();
                    const hasResi = !!resi;
                    return (
                      <button
                        type="button"
                        className={`kbi-ocard__mini ${!hasResi ? 'opacity-35 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500' : 'text-[#2b5a9e] dark:text-brand-400 hover:bg-[#eaf1fb] dark:hover:bg-neutral-800'}`}
                        title={hasResi ? 'Lihat QR Code Resi' : 'Nomor resi belum tersedia'}
                        aria-label={hasResi ? 'Lihat QR Code Resi' : 'Nomor resi belum tersedia'}
                        onClick={() => {
                          if (!hasResi) {
                            safeAlert('Nomor resi belum tersedia untuk orderan ini.');
                            return;
                          }
                          setQrCodeModalOrder(order);
                        }}
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    );
                  })() : (
                    <button type="button" className="kbi-ocard__mini" title="Detail Orderan" aria-label="Detail orderan"
                      onClick={() => setViewingOrderDetail(order)}>
                      <Eye className="h-4 w-4" />
                    </button>
                  )}

                  <button type="button"
                    className={`kbi-ocard__mini ${order.isPinned ? 'is-pinned' : ''}`}
                    title={order.isPinned ? 'Unpin Orderan' : 'Pin Orderan'}
                    aria-label={order.isPinned ? 'Lepas sematan' : 'Sematkan orderan'}
                    onClick={() => handleTogglePin(order)}>
                    <Pin className={`h-4 w-4 ${order.isPinned ? 'fill-current' : ''}`} />
                  </button>

                  <button type="button" className="kbi-ocard__mini is-reco" title="Rekomendasi Buku" aria-label="Rekomendasi buku"
                    onClick={() => {
                      if (order.items && order.items.length > 0) {
                        const bookIds = order.items.map(item => item.bookId);
                        const categories = new Set<string>();
                        order.items.forEach(item => {
                          const b = books.find(bk => bk.id === item.bookId);
                          if (b) {
                            const catArray = Array.isArray(b.category) ? b.category : [b.category];
                            catArray.forEach(c => categories.add(c));
                          }
                        });
                        if (categories.size > 0) {
                          setRecoOrderData({ bookIds, categories: Array.from(categories) });
                        }
                      }
                    }}>
                    <Lightbulb className="h-4 w-4" />
                  </button>

                  {isStaffValue && order.status && order.status !== 'draft' && (
                    <button type="button" className="kbi-ocard__mini" title="Kembali ke Status Sebelumnya" aria-label="Kembali ke status sebelumnya"
                      onClick={() => {
                        let msg = '';
                        let cb = () => { };
                        if (order.status === 'packed') {
                          msg = "Apakah kamu yakin ingin kembali ke status 'Pending'?";
                          cb = () => handleRevertPackedToDraft(order);
                        } else if (order.status === 'shipped') {
                          msg = "Apakah kamu yakin ingin kembali ke status 'Dikemas'?";
                          cb = () => handleRevertToPacked(order);
                        } else if (order.status === 'completed' || order.status === 'returned') {
                          msg = "Apakah kamu yakin ingin kembali ke status 'Dikirim'?";
                          cb = () => handleRevertToShipped(order);
                        } else if (order.status === 'cancelled') {
                          const target = order.precedingStatus === 'returned' ? 'returned' : 'draft';
                          const targetLabel = target === 'returned' ? 'Return' : 'Pending';
                          msg = `Apakah kamu yakin ingin kembali ke status '${targetLabel}'?`;
                          cb = () => handleRevertToPreceding(order);
                        }
                        if (msg) setRevertConfirmState({ message: msg, onConfirm: cb });
                      }}>
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  )}

                  {canDelete && (
                    <button type="button" className="kbi-ocard__mini is-danger" title="Hapus Orderan" aria-label="Hapus orderan"
                      onClick={() => handleDeleteOrder(order)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {isDraftLike && isStaffValue ? (() => {
                  const isEstShippingInFuture = isShippingDateFuture(order.estimatedShippingDate);
                  return (
                    <button
                      type="button"
                      className={`kbi-ocard__cta ${isEstShippingInFuture ? 'opacity-40 cursor-not-allowed !bg-neutral-300 dark:!bg-neutral-700 !text-neutral-500 dark:!text-neutral-400 border border-neutral-300 dark:border-neutral-700 shadow-none' : ''}`}
                      style={{
                        backgroundColor: isEstShippingInFuture ? undefined : '#6366f1',
                        cursor: isEstShippingInFuture ? 'not-allowed' : 'pointer'
                      }}
                      title={isEstShippingInFuture ? `Belum waktunya dikemas, request customer: ${order.estimatedShippingDate?.replace(/-/g, '/')}` : undefined}
                      onClick={() => {
                        if (isShippingDateFuture(order.estimatedShippingDate)) {
                          safeAlert(`Belum Waktunya Untuk Dikemas, Request Customer Adalah ${order.estimatedShippingDate?.replace(/-/g, '/')}`);
                          return;
                        }
                        if (order.perluKonfirmasiSebelumKirim) {
                          setConfirmingCustomerPreKemasOrder(order);
                        } else {
                          setConfirmingKemasOrder(order);
                        }
                      }}
                    >
                      Kemas
                    </button>
                  );
                })() : order.status === 'packed' && isStaffValue ? (
                  <button type="button" className="kbi-ocard__cta" style={{ backgroundColor: '#2b5a9e' }}
                    onClick={() => {
                      setSelectedOrderForProses(order);
                      setProsesOrderNo('');
                      setProsesResi(order.shipment?.shippingNumber || '');
                      const d = new Date();
                      setProsesDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                      setIsProsesConfirmOpen(true);
                    }}>Kirim</button>
                ) : (order.status === 'shipped' || order.status === 'confirmed') && isStaffValue ? (
                  <div className="kbi-ocard__ctagroup">
                    <button type="button" className="kbi-ocard__cta" style={{ backgroundColor: '#0f7a52' }}
                      onClick={() => { openSelesaiConfirm(order); }}>Selesai</button>
                    <button type="button" className="kbi-ocard__cta kbi-ocard__cta--ghost"
                      onClick={() => handleTransitionToReturned(order.id)}>Return</button>
                  </div>
                ) : order.status === 'returned' && isStaffValue ? (
                  <button type="button" className="kbi-ocard__cta" style={{ backgroundColor: '#2b5a9e' }}
                    onClick={() => { setSelectedReturnMode('stock'); setConfirmingDiambilOrder(order); }}>Diambil</button>
                ) : (
                  <button type="button" className="kbi-ocard__cta kbi-ocard__cta--neutral"
                    onClick={() => setViewingOrderDetail(order)}>Detail</button>
                )}
              </div>

              {expandedOrderId === order.id && (
                <div className="kbi-ocard__stepper" onClick={(e) => e.stopPropagation()}>
                  {renderStepper(order)}
                </div>
              )}
            </article>
          );
        })}

        {searchedOrders.length === 0 && (
          <div className="kbi-ocard__empty">
            <div className="kbi-ocard__emptyicon"><Search className="w-5 h-5" /></div>
            <p>Tidak ada orderan yang cocok dengan filter ini.</p>
          </div>
        )}
      </div>

      {/* 4b. TABLET MASTER–DETAIL (768–1023px)
           A tablet has room to keep the list in view while a record is open,
           so the detail renders beside the list instead of covering it. Rows
           call the same setViewingOrderDetail the table row and mobile card
           already call — one selection state, three presentations. */}
      <div className="kbi-sosplit hidden md:grid lg:hidden">
        <div className="kbi-olist" role="list" aria-label="Daftar orderan">
          {paginatedOrders.map((order, orderIdx) => {
            const orderDateMs = getOrderDateMs(order);
            const formattedDate = orderDateMs
              ? new Date(orderDateMs).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
              : 'N/A';

            let pillColor = '#b45309';
            let pillBg = '#fef3e2';
            let pillLabel = 'Pending';
            if (order.status === 'completed') { pillColor = '#0f7a52'; pillBg = '#e7f5ef'; pillLabel = 'Selesai'; }
            else if (order.status === 'packed') { pillColor = '#6366f1'; pillBg = '#eef2ff'; pillLabel = 'Dikemas'; }
            else if (order.status === 'shipped' || order.status === 'confirmed') { pillColor = '#1d6fa5'; pillBg = '#e8f2f9'; pillLabel = 'Dikirim'; }
            else if (order.status === 'returned') { pillColor = '#a8323b'; pillBg = '#fbecec'; pillLabel = 'Return'; }
            else if (order.status === 'cancelled') { pillColor = '#5b6472'; pillBg = '#f1f2f4'; pillLabel = 'Cancel'; }
            else if (order.isDraft) { pillLabel = 'Draft'; }

            const isActive = viewingOrderDetail?.id === order.id;

            return (
              <button
                key={`t-${order.id}-${orderIdx}`}
                type="button"
                role="listitem"
                aria-current={isActive ? 'true' : undefined}
                className={`kbi-orow ${isActive ? 'is-active' : ''}`}
                onClick={() => setViewingOrderDetail(order)}
              >
                <span className="kbi-orow__ribbon" style={{ backgroundColor: pillColor }} aria-hidden="true" />
                <div className="kbi-orow__top">
                  <span className="kbi-orow__code">{order.orderCode}</span>
                  <span className="kbi-orow__date">{formattedDate}</span>
                </div>
                <div className="kbi-orow__buyer">{order.customerName}</div>
                <div className="kbi-orow__bottom">
                  <span className="kbi-orow__total">{canViewAmount ? formatNTD(order.totalPrice) : ''}</span>
                  <span className="kbi-orow__status" style={{ backgroundColor: pillBg, color: pillColor }}>
                    <span className="kbi-orow__statusdot" style={{ backgroundColor: pillColor }} />
                    {pillLabel}
                  </span>
                </div>
              </button>
            );
          })}

          {searchedOrders.length === 0 && (
            <div className="kbi-olist__empty">Tidak ada orderan yang cocok dengan filter ini.</div>
          )}
        </div>

        <div className="kbi-sopane">
          {viewingOrderDetail ? (
            <div className="kbi-rincian-modal kbi-rincian--pane">
              {renderOrderDetail(viewingOrderDetail)}
            </div>
          ) : (
            <div className="kbi-sopane__empty">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <span className="eyebrow">Rincian Sales Order</span>
              <p>Pilih orderan di sebelah kiri untuk melihat rinciannya.</p>
            </div>
          )}
        </div>
      </div>

      {/* 4. SHEET TABLE */}
      <div className="kbi-sofoot bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[14px] overflow-hidden shadow-xs">
        {/* The table is desktop-only now — mobile has the card list, tablet has
            the master–detail split. The foot bar below stays on every tier: it
            carries the totals and pagination all three presentations need. */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse table min-w-[960px]">
            <thead>
              <tr className="border-b border-[#E7E1D2] dark:border-neutral-800 bg-white dark:bg-neutral-900 text-[10.5px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                <th className="text-left py-3 px-4.5 w-[130px]">Order</th>
                <th className="text-left py-3 px-4.5">Pembeli</th>
                <th className="text-left py-3 px-4.5 w-[120px]">Sumber</th>
                <th className="text-left py-3 px-4.5 w-[190px]">Pengiriman</th>
                <th className="text-center py-3 px-4.5 w-[60px]">Qty</th>
                <th className="text-right py-3 px-4.5 w-[135px]">Total</th>
                <th className="text-left py-3 px-4.5 w-[110px]">Status</th>
                <th className="text-right py-3 px-4.5 w-[180px]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6] dark:divide-neutral-800 text-sm">
              {paginatedOrders.map((order, orderIdx) => {
                const orderQty = (order.items || []).reduce((acc, it) => acc + (it.qty || 0), 0);
                const orderDateMs = getOrderDateMs(order);
                const formattedDate = orderDateMs ? new Date(orderDateMs).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'N/A';

                const shipDateMs = order.shipment?.shippingDate?.seconds
                  ? order.shipment.shippingDate.seconds * 1000
                  : (order.shippedAt?.seconds ? order.shippedAt.seconds * 1000 : null);
                let shippedDateFormatted: string | null = null;
                if (shipDateMs) {
                  const sd = new Date(shipDateMs);
                  shippedDateFormatted = `${sd.getFullYear()}/${String(sd.getMonth() + 1).padStart(2, '0')}/${String(sd.getDate()).padStart(2, '0')}`;
                }

                const overdueDays = getOverdueDays(order);
                const isOverdue = overdueDays >= 15;
                const isCritical = overdueDays >= 21;

                const isReadyStock = checkIsReadyStock(order);

                // Priority order for highlights:
                // 1. Transaksi yang di Pinned
                // 2. Orderan Stok Siap (Highlight Hijau)
                // 3. Orderan Terlambat (Highlight Orange/Merah)
                // 4. Normal
                const isPinnedOrder = !!order.isPinned;
                const showReadyStockHighlight = !isPinnedOrder && isReadyStock;
                const showOverdueHighlight = !isPinnedOrder && !showReadyStockHighlight && isOverdue;

                let cardBgClass = 'bg-white dark:bg-neutral-900 border-[#E7E1D2] dark:border-neutral-800';
                if (order.isPinned) {
                  cardBgClass = 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30';
                } else if (showReadyStockHighlight) {
                  cardBgClass = 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30';
                } else if (showOverdueHighlight) {
                  cardBgClass = isCritical ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
                }

                const isRowHovered = hoveredRowId === order.id;

                let rowStyle: React.CSSProperties = {};
                let accentColor = '#d97706';

                if (showOverdueHighlight) {
                  const tintColor = isCritical ? '#fde3e1' : '#fef3e0';
                  const hoverTintColor = isCritical ? '#fbd2cf' : '#fdecd0';
                  accentColor = isCritical ? '#dc2626' : '#d97706';
                  const currentBg = isRowHovered ? hoverTintColor : tintColor;

                  rowStyle = {
                    boxShadow: `inset 4px 0 0 0 ${accentColor}`,
                    backgroundImage: `linear-gradient(115deg, ${currentBg} 0%, ${currentBg} 55%, transparent 100%)`,
                  };
                } else if (showReadyStockHighlight) {
                  const accentColor = '#15803d';
                  const tintColor = '#e9f7ee';
                  const hoverTintColor = '#daf0e2';
                  const currentBg = isRowHovered ? hoverTintColor : tintColor;

                  rowStyle = {
                    boxShadow: `inset 4px 0 0 0 ${accentColor}`,
                    backgroundImage: `linear-gradient(115deg, ${currentBg} 0%, ${currentBg} 55%, transparent 100%)`,
                  };
                }

                let pillColor = '#b45309';
                let pillBg = '#fef3e2';
                let pillLabel = 'Pending';

                if (order.status === 'completed') {
                  pillColor = '#0f7a52';
                  pillBg = '#e7f5ef';
                  pillLabel = 'Selesai';
                } else if (order.status === 'packed') {
                  pillColor = '#6366f1';
                  pillBg = '#eef2ff';
                  pillLabel = 'Dikemas';
                } else if (order.status === 'shipped' || order.status === 'confirmed') {
                  pillColor = '#1d6fa5';
                  pillBg = '#e8f2f9';
                  pillLabel = 'Dikirim';
                } else if (order.status === 'returned') {
                  pillColor = '#a8323b';
                  pillBg = '#fbecec';
                  pillLabel = 'Return';
                } else if (order.status === 'cancelled') {
                  pillColor = '#5b6472';
                  pillBg = '#f1f2f4';
                  pillLabel = 'Cancel';
                } else if (order.isDraft) {
                  pillLabel = 'Draft';
                }

                return (
                  <React.Fragment key={`${order.id}-${orderIdx}`}>
                    <tr
                      onMouseEnter={() => setHoveredRowId(order.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest('button') ||
                          target.closest('a') ||
                          target.closest('input') ||
                          target.closest('select')
                        ) {
                          return;
                        }
                        setViewingOrderDetail(order);
                      }}
                      style={rowStyle}
                      className={`group ${!showOverdueHighlight && !showReadyStockHighlight ? 'hover:bg-[#fcfcfd] dark:hover:bg-neutral-800/30' : ''} transition-colors border-b border-[#f3f4f6] dark:border-neutral-800/80 cursor-pointer text-sm`}
                    >
                      {/* Order */}
                      <td className="py-3.5 px-4.5 align-middle">
                        <button
                          type="button"
                          onClick={() => setViewingOrderDetail(order)}
                          className="font-['Inter'] font-semibold text-[13px] text-[#0d1117] dark:text-neutral-100 hover:text-[#2b5a9e] dark:hover:text-brand-400 transition text-left tracking-tight cursor-pointer"
                        >
                          {order.orderCode}
                        </button>
                        <div className="font-['Inter'] text-[11.5px] text-[#9ca3af] mt-0.5">
                          {formattedDate}
                        </div>
                        {shippedDateFormatted && (
                          <div className="font-['Inter'] text-[10px] font-semibold text-[#1d6fa5] mt-0.5" title="Tanggal Dikirim">
                            {shippedDateFormatted}
                          </div>
                        )}
                        {showOverdueHighlight && (
                          <div
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-1.5 rounded-full text-[10.5px] font-bold text-white shadow-2xs select-none"
                            style={{ backgroundColor: accentColor }}
                          >
                            <svg className="w-3 h-3 text-white fill-current shrink-0" viewBox="0 0 24 24">
                              <path d="M12 22C16.9706 22 21 17.9706 21 13C21 8.5 17.5 4.5 14 2C14 5 12 7 10 7C8 7 6 5 6 3.5C4 6 3 9 3 13C3 17.9706 7.02944 22 12 22ZM12 19C10.3431 19 9 17.6569 9 16C9 14.5 10.5 13 12 11.5C13.5 13 15 14.5 15 16C15 17.6569 13.6569 19 12 19Z" />
                            </svg>
                            <span className="w-[5px] h-[5px] rounded-full bg-white shrink-0" />
                            <span className="font-['Inter'] font-bold text-white whitespace-nowrap">{overdueDays} hari</span>
                          </div>
                        )}
                        {showReadyStockHighlight && (
                          <div
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-1.5 rounded-full text-[10.5px] font-bold text-white shadow-2xs select-none"
                            style={{ backgroundColor: '#15803d' }}
                          >
                            <svg className="w-3 h-3 text-white fill-none stroke-current stroke-[2.5] shrink-0" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            <span className="font-['Inter'] font-bold text-white whitespace-nowrap">Stok Siap</span>
                          </div>
                        )}
                      </td>

                      {/* Pembeli */}
                      <td className="py-3.5 px-4.5 align-middle">
                        <div className="font-bold text-[13.5px] text-[#0d1117] dark:text-neutral-100 tracking-tight line-clamp-1" title={order.customerName}>
                          {order.customerName}
                        </div>
                        {order.customerPlatformName && (
                          <div className="text-[11.5px] text-[#9ca3af] mt-0.5 truncate max-w-[180px]" title={order.customerPlatformName}>
                            {order.customerPlatformName}
                          </div>
                        )}
                      </td>

                      {/* Sumber */}
                      <td className="py-3.5 px-4.5 align-middle">
                        {(() => {
                          const channelName = order.platformChannel || '-';
                          const channelObj = resolvedChannels.find(c => (c.name || '').toLowerCase() === channelName.toLowerCase());
                          const channelColor = getChannelColor(channelName, channelObj);
                          return (
                            <span
                              className="text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-md inline-block max-w-[120px] truncate border"
                              style={{
                                color: channelColor,
                                backgroundColor: channelColor.startsWith('#') ? `${channelColor}18` : '#3B82F618',
                                borderColor: channelColor.startsWith('#') ? `${channelColor}33` : '#3B82F633'
                              }}
                              title={channelName}
                            >
                              {channelName}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Pengiriman */}
                      <td className="py-3.5 px-4.5 align-middle">
                        <div className="flex items-center gap-1.5 text-[12.5px] text-[#3d4451] dark:text-neutral-300 font-medium">
                          <span className="text-[10px] font-bold tracking-wider uppercase bg-[#f3f4f6] dark:bg-neutral-800 text-[#6b7280] dark:text-neutral-300 px-1.5 py-0.5 rounded shrink-0">
                            {order.paymentMethod || 'COD'}
                          </span>
                          <span className="truncate max-w-[130px]">
                            {order.buyerType === 'marketplace' || order.orderType?.toLowerCase() === 'marketplace' ? '-' : (order.pickupLogistics || '-')}
                          </span>
                        </div>
                        {order.orderNumber && (
                          <div className="font-['Inter'] text-[11px] text-[#9ca3af] font-numeric mt-0.5" title={order.orderNumber}>
                            {order.orderNumber}
                          </div>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="py-3.5 px-4.5 text-center align-middle">
                        <span className="font-['Inter'] text-[13px] font-medium text-[#3d4451] dark:text-neutral-200">
                          {orderQty}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4.5 text-right align-middle">
                        {canViewAmount ? (
                          <>
                            <div className="font-['Inter'] font-bold text-[13.5px] text-[#0d1117] dark:text-neutral-100 tracking-tight">
                              {formatNTD(order.totalPrice)}
                            </div>
                            <div className={`font-['Inter'] text-[11px] mt-0.5 ${order.discount ? 'text-[#a8323b]' : 'text-[#9ca3af]'}`}>
                              {order.discount ? `−${formatNTD(order.discount)}` : 'tanpa diskon'}
                            </div>
                          </>
                        ) : (
                          <div className="font-['Inter'] text-[13.5px] text-[#9ca3af]">—</div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4.5 align-middle">
                        <div className="flex justify-start">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedOrderId(expandedOrderId === order.id ? null : order.id);
                            }}
                            className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full transition cursor-pointer"
                            style={{ backgroundColor: pillBg, color: pillColor }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: pillColor }} />
                            <span>{pillLabel}</span>
                            {expandedOrderId === order.id ? <ChevronUp className="h-3 w-3 opacity-60" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
                          </button>
                        </div>
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4.5 text-right align-middle border-none">
                        <div className="flex items-center justify-end gap-1">
                          {/* Action buttons wrapper (2x2 grid on left, Reverse/Delete centered on right) */}
                          <div className="flex items-center gap-1">
                            {/* 2x2 Grid for Print/View (Row 1) and Pin/Recommend (Row 2) */}
                            <div className="flex flex-col gap-0.5">
                              {/* ROW 1: Print | View */}
                              <div className="flex items-center gap-0.5">
                                {/* Print invoice button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPrintInvoiceOrder(order);
                                  }}
                                  className="w-7 h-7 rounded-[7px] text-[#9ca3af] hover:text-[#0d1117] dark:hover:text-white hover:bg-[#f3f4f6] dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
                                  title="Cetak Invoice"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </button>

                                {/* Edit or View detail button */}
                                {(order.status === 'draft' || !order.status) && isStaffValue ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditOrderClick(order);
                                    }}
                                    className="w-7 h-7 rounded-[7px] text-[#9ca3af] hover:text-[#0d1117] dark:hover:text-white hover:bg-[#f3f4f6] dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
                                    title="Edit Orderan"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                ) : (order.status === 'packed' || order.status === 'shipped' || order.status === 'confirmed') ? (() => {
                                  const resi = (order.shipment?.shippingNumber || (order as any).shippingNumber || '').trim();
                                  const hasResi = !!resi;
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!hasResi) {
                                          safeAlert('Nomor resi belum tersedia untuk orderan ini.');
                                          return;
                                        }
                                        setQrCodeModalOrder(order);
                                      }}
                                      className={`w-7 h-7 rounded-[7px] transition flex items-center justify-center ${!hasResi
                                        ? 'opacity-35 cursor-not-allowed text-[#9ca3af] bg-[#f3f4f6] dark:bg-neutral-800/60'
                                        : 'text-[#2b5a9e] dark:text-brand-400 hover:text-[#1e4275] hover:bg-[#eaf1fb] dark:hover:bg-neutral-800 cursor-pointer'
                                        }`}
                                      title={hasResi ? "Lihat QR Code Resi" : "Nomor resi belum tersedia"}
                                    >
                                      <QrCode className="h-3.5 w-3.5" />
                                    </button>
                                  );
                                })() : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingOrderDetail(order);
                                    }}
                                    className="w-7 h-7 rounded-[7px] text-[#9ca3af] hover:text-[#0d1117] dark:hover:text-white hover:bg-[#f3f4f6] dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
                                    title="Detail Orderan"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* ROW 2: Pin | Recommend */}
                              <div className="flex items-center gap-0.5">
                                {/* Pin button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePin(order);
                                  }}
                                  className={`w-7 h-7 rounded-[7px] transition flex items-center justify-center cursor-pointer ${order.isPinned
                                    ? 'text-[#6366f1] bg-[#eef2ff] dark:bg-indigo-955/40 hover:bg-[#e0e7ff]'
                                    : 'text-[#9ca3af] hover:text-[#0d1117] dark:hover:text-white hover:bg-[#f3f4f6] dark:hover:bg-neutral-800'
                                    }`}
                                  title={order.isPinned ? "Unpin Orderan" : "Pin Orderan"}
                                >
                                  <Pin className={`h-3.5 w-3.5 ${order.isPinned ? 'fill-current text-[#6366f1]' : ''}`} />
                                </button>

                                {/* Recommendation button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (order.items && order.items.length > 0) {
                                      const bookIds = order.items.map(item => item.bookId);
                                      const categories = new Set<string>();
                                      order.items.forEach(item => {
                                        const b = books.find(bk => bk.id === item.bookId);
                                        if (b) {
                                          const catArray = Array.isArray(b.category) ? b.category : [b.category];
                                          catArray.forEach(c => categories.add(c));
                                        }
                                      });
                                      if (categories.size > 0) {
                                        setRecoOrderData({
                                          bookIds,
                                          categories: Array.from(categories)
                                        });
                                      }
                                    }
                                  }}
                                  className="w-7 h-7 rounded-[7px] text-[#9ca3af] hover:text-[#02a077] hover:bg-[#e7f5ef] transition flex items-center justify-center cursor-pointer"
                                  title="Rekomendasi Buku"
                                >
                                  <Lightbulb className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Reverse button standing on the right of the 2x2 grid */}
                            {isStaffValue && order.status && order.status !== 'draft' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  let msg = "";
                                  let cb = () => { };
                                  if (order.status === 'packed') {
                                    msg = "Apakah kamu yakin ingin kembali ke status 'Pending'?";
                                    cb = () => handleRevertPackedToDraft(order);
                                  } else if (order.status === 'shipped') {
                                    msg = "Apakah kamu yakin ingin kembali ke status 'Dikemas'?";
                                    cb = () => handleRevertToPacked(order);
                                  } else if (order.status === 'completed' || order.status === 'returned') {
                                    msg = "Apakah kamu yakin ingin kembali ke status 'Dikirim'?";
                                    cb = () => handleRevertToShipped(order);
                                  } else if (order.status === 'cancelled') {
                                    const target = order.precedingStatus === 'returned' ? 'returned' : 'draft';
                                    const targetLabel = target === 'returned' ? 'Return' : 'Pending';
                                    msg = `Apakah kamu yakin ingin kembali ke status '${targetLabel}'?`;
                                    cb = () => handleRevertToPreceding(order);
                                  }

                                  if (msg) {
                                    setRevertConfirmState({ message: msg, onConfirm: cb });
                                  }
                                }}
                                className="w-7 h-7 shrink-0 rounded-[7px] text-[#9ca3af] hover:text-[#0d1117] dark:hover:text-white hover:bg-[#f3f4f6] dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
                                title="Kembali ke Status Sebelumnya"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Delete button standing on the right of the 2x2 grid */}
                            {order.status !== 'packed' && order.status !== 'shipped' && order.status !== 'confirmed' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'returned' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteOrder(order);
                                }}
                                className="w-7 h-7 shrink-0 rounded-[7px] text-[#9ca3af] hover:text-[#a8323b] hover:bg-[#fbecec] transition flex items-center justify-center cursor-pointer"
                                title="Hapus Orderan"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Main Status Action Button */}
                          {(order.status === 'draft' || !order.status) && isStaffValue ? (() => {
                            const isEstShippingInFuture = isShippingDateFuture(order.estimatedShippingDate);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isShippingDateFuture(order.estimatedShippingDate)) {
                                    safeAlert(`Belum Waktunya Untuk Dikemas, Request Customer Adalah ${order.estimatedShippingDate?.replace(/-/g, '/')}`);
                                    return;
                                  }
                                  if (order.perluKonfirmasiSebelumKirim) {
                                    setConfirmingCustomerPreKemasOrder(order);
                                  } else {
                                    setConfirmingKemasOrder(order);
                                  }
                                }}
                                title={isEstShippingInFuture ? `Belum waktunya dikemas, request customer: ${order.estimatedShippingDate?.replace(/-/g, '/')}` : undefined}
                                className={`px-3.5 py-1.5 rounded-[7px] font-['Lexend'] font-semibold text-[12px] transition shadow-2xs select-none ml-1 ${isEstShippingInFuture
                                  ? 'bg-neutral-200 hover:bg-neutral-300 text-neutral-400 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-500 cursor-not-allowed border border-neutral-300 dark:border-neutral-700'
                                  : 'bg-[#6366f1] hover:bg-[#4f46e5] text-white cursor-pointer'
                                  }`}
                              >
                                Kemas
                              </button>
                            );
                          })() : order.status === 'packed' && isStaffValue ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrderForProses(order);
                                setProsesOrderNo('');
                                setProsesResi(order.shipment?.shippingNumber || '');
                                const d = new Date();
                                setProsesDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                                setIsProsesConfirmOpen(true);
                              }}
                              className="px-3.5 py-1.5 rounded-[7px] bg-[#2b5a9e] hover:bg-[#1e4275] text-white font-['Lexend'] font-semibold text-[12px] transition shadow-2xs cursor-pointer select-none ml-1"
                            >
                              Kirim
                            </button>
                          ) : (order.status === 'shipped' || order.status === 'confirmed') && isStaffValue ? (
                            <div className="flex flex-col gap-1 ml-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSelesaiConfirm(order);
                                }}
                                className="px-3.5 py-1.5 rounded-[7px] bg-[#0f7a52] hover:bg-[#0c6342] text-white font-['Lexend'] font-semibold text-[12px] transition shadow-2xs cursor-pointer select-none text-center"
                              >
                                Selesai
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransitionToReturned(order.id);
                                }}
                                className="px-3.5 py-1.5 rounded-[7px] bg-[#dd7d84] hover:bg-[#a8323b] text-white font-['Lexend'] font-semibold text-[12px] transition shadow-2xs cursor-pointer select-none text-center"
                                title="Tandai orderan sebagai Return"
                              >
                                Return
                              </button>
                            </div>
                          ) : order.status === 'returned' && isStaffValue ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReturnMode('stock');
                                setConfirmingDiambilOrder(order);
                              }}
                              className="px-3.5 py-1.5 rounded-[7px] bg-[#2b5a9e] hover:bg-[#1e4275] text-white font-['Lexend'] font-semibold text-[12px] transition shadow-2xs cursor-pointer select-none ml-1"
                            >
                              Diambil
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingOrderDetail(order);
                              }}
                              className="px-3.5 py-1.5 rounded-[7px] bg-[#f3f4f6] dark:bg-neutral-800 hover:bg-[#e8eaed] text-[#3d4451] dark:text-neutral-200 font-['Lexend'] font-semibold text-[12px] transition cursor-pointer select-none ml-1"
                            >
                              Detail
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Stepper expansion row */}
                    {expandedOrderId === order.id && (
                      <tr className="bg-neutral-50/40 dark:bg-neutral-950/20">
                        <td colSpan={8} className="py-4 px-6 border-b border-neutral-200 dark:border-neutral-800">
                          <div className="flex flex-col items-center justify-center gap-4 py-3 px-6 max-w-4xl mx-auto">
                            <div className="w-full flex flex-row items-center justify-center gap-4">
                              {renderStepper(order)}
                            </div>
                            <button
                              onClick={() => setViewingOrderDetail(order)}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-bold text-[#2b5a9e] dark:text-brand-400 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-xs transition cursor-pointer"
                            >
                              <Eye className="h-4 w-4" />
                              Lihat Rincian Detail Lengkap
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {searchedOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 px-6 text-center">
                    <div className="w-11 h-11 mx-auto mb-3 rounded-xl bg-[#f3f4f6] dark:bg-neutral-800 text-[#9ca3af] flex items-center justify-center">
                      <Search className="w-5 h-5" />
                    </div>
                    <p className="text-[13.5px] text-[#6b7280] font-medium">Tidak ada orderan yang cocok dengan filter ini.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Foot Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-4.5 py-3.5 border-t border-[#E7E1D2] dark:border-neutral-800 text-[12.5px] text-[#9ca3af] gap-3">
          <div>
            Menampilkan <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-200">{paginatedOrders.length}</b> dari <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-200">{searchedOrders.length}</b> orderan
          </div>
          <div className="flex items-center gap-4">
            <div>
              Nilai total <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-200">{formatNTD(searchedSum)}</b>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 disabled:opacity-40 cursor-pointer"
                >
                  Prev
                </button>
                <span className="font-['Inter'] text-xs font-medium text-[#6b7280]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Printer Window Overlay */}
      {printInvoiceOrder && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPrintInvoiceOrder(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 rounded-2xl border border-neutral-300 dark:border-neutral-800 shadow-2xl w-[94%] max-w-3xl overflow-hidden my-auto max-h-[90vh]">
            <div className="p-5 border-b border-neutral-150 dark:border-neutral-800 flex items-center justify-between no-print-section">
              <span className="text-sm font-bold flex items-center gap-2"><Printer className="h-4 w-4 text-brand-500" /> CETAK FORMAT INVOICE RETAIL</span>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadPDF}
                  className="p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-500 shadow-sm transition cursor-pointer flex items-center justify-center"
                  title="Download PDF"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPrintInvoiceOrder(null)}
                  className="px-3.5 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-semibold transition"
                >
                  Tutup
                </button>
              </div>
            </div>

            {/* Print friendly document view */}
            <div id="print-faktur-area" className="p-8 bg-white text-black font-text leading-tight">
              <div className="flex justify-between items-center pb-6 border-b border-neutral-300">
                <div className="flex flex-col gap-1">
                  <div className="h-14 flex items-center">
                    {branding.logoUrl ? (
                      <img src={branding.logoUrl} alt="Logo Usaha" className="h-[52px] max-w-[220px] object-contain" />
                    ) : (
                      <svg viewBox="0 0 450 120" className="h-[52px] w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* Left: Book & Hands Icon */}
                        <g transform="translate(10, 10)">
                          {/* Book cover (orange-red/coral fill, deep teal stroke) */}
                          <path d="M42,20 C42,10 32,3 22,3 C12,3 2,10 2,20 L2,65 C2,75 12,82 22,82 L72,82 C82,82 92,75 92,65 L92,-5 L42,-5 Z" fill="#ea7462" stroke="#1d4d5e" strokeWidth="4.5" strokeLinejoin="round" />
                          <path d="M42,20 L42,82" stroke="#1d4d5e" strokeWidth="4.5" strokeLinecap="round" />

                          {/* Spine top page curve */}
                          <path d="M42,-5 C42,5 32,12 22,12 C12,12 2,5 2,-5" fill="#ffffff" stroke="#1d4d5e" strokeWidth="4.5" strokeLinejoin="round" />
                          <path d="M38,8 C38,8 30,14 22,14 C14,14 6,8 6,8" stroke="#1d4d5e" strokeWidth="2" strokeLinecap="round" />

                          {/* Hands cradling the book */}
                          <path d="M12,42 C-10,50 -5,88 28,95 C60,98 96,85 102,58 C104,46 90,43 87,50 C77,70 54,80 34,77 C18,75 18,48 28,42" stroke="#1d4d5e" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="#ffffff" />
                          <path d="M94,52 C102,62 98,72 82,78 M89,66 C96,74 89,81 76,86" stroke="#1d4d5e" strokeWidth="4" strokeLinecap="round" />
                          <path d="M14,58 C1,66 11,80 22,78 M23,68 C11,76 18,87 29,84 M33,75 C24,82 30,92 41,87" stroke="#1d4d5e" strokeWidth="3" strokeLinecap="round" />
                          <path d="M68,28 C58,23 52,30 56,38 C60,46 80,52 87,50" stroke="#1d4d5e" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="#ffffff" />
                        </g>

                        {/* Right Text: KANGEN BUKU INDO */}
                        <g transform="translate(135, 10)">
                          {/* K */}
                          <path d="M15,15 L15,48 M35,15 L15,31 L35,48" stroke="#00829d" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* A */}
                          <path d="M45,48 L58,15 L71,48 M51,36 L65,36" stroke="#00829d" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* N */}
                          <path d="M82,48 L82,15 L102,48 L102,15" stroke="#00829d" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* G */}
                          <path d="M135,24 C132,16 122,14 116,18 C110,22 108,31 112,39 C116,47 126,48 132,44 L132,32 L123,32" stroke="#00829d" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* E */}
                          <path d="M145,15 L165,15 M145,31.5 L160,31.5 M145,48 L165,48 M145,15 L145,48" stroke="#00829d" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* N */}
                          <path d="M175,48 L175,15 L195,48 L195,15" stroke="#00829d" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />

                          {/* B */}
                          <path d="M15,62 L15,95 L28,95 C33,95 38,91 38,86.5 C38,82 34,78.5 28,78.5 C34,78.5 38,75 38,70.5 C38,65 33,62 28,62 Z" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="#ea7462" />
                          {/* U */}
                          <path d="M48,62 L48,85 C48,91 53,95 59,95 C65,95 70,91 70,85 L70,62" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* K */}
                          <path d="M80,62 L80,95 M100,62 L80,78 L100,95" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* U */}
                          <path d="M110,62 L110,85 C110,91 115,95 121,95 C127,95 132,91 132,85 L132,62" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* I */}
                          <path d="M150,62 L150,95" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* N */}
                          <path d="M162,95 L162,62 L182,95 L182,62" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                          {/* D */}
                          <path d="M192,62 L192,95 L205,95 C215,95 222,87 222,78.5 C222,70 215,62 205,62 Z" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="#ea7462" />
                          {/* O */}
                          <path d="M245,62 C236,62 230,70 230,78.5 C230,87 236,95 245,95 C254,95 260,87 260,78.5 C260,70 254,62 245,62 Z" stroke="#ea7462" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">{branding.namaUsaha || "KangenBukuIndo"} · {branding.alamat || "E-Commerce Buku Indonesia Terpercaya di Taiwan"}</p>
                </div>
                <div className="text-right">
                  <h4 className="text-xl font-bold uppercase tracking-wide text-neutral-700">FAKTUR INVOICE</h4>
                  <p className="text-sm font-numeric font-bold text-brand-600 mt-1">{printInvoiceOrder.orderCode}</p>
                  <p className="text-xs text-neutral-500 mt-1">Tgl: <strong className="font-bold text-neutral-900">{printInvoiceOrder.orderDate?.seconds ? new Date(printInvoiceOrder.orderDate.seconds * 1000).toLocaleDateString('zh-TW') : 'N/A'}</strong></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 py-6 text-xs border-b border-neutral-150">
                <div>
                  <h5 className="font-bold text-neutral-500 capitalize tracking-widest text-[9px] mb-2">Tujuan Pengiriman:</h5>
                  <p className="text-sm font-bold text-neutral-900">{printInvoiceOrder.customerName}</p>
                  {printInvoiceOrder.phoneNumber && <p className="mt-1">Telp: {printInvoiceOrder.phoneNumber}</p>}
                </div>
                <div>
                  <h5 className="font-bold text-neutral-500 capitalize tracking-widest text-[9px] mb-2">Kurir Pengiriman:</h5>
                  <p className="font-bold text-neutral-800">{printInvoiceOrder.pickupLogistics}</p>
                  <p className="mt-1">Metode Bayar: <strong className="uppercase">{printInvoiceOrder.paymentMethod}</strong></p>
                  <p className="mt-1 text-neutral-600">Keterangan: {printInvoiceOrder.pickupDetails || '-'}</p>
                </div>
              </div>

              <table className="w-full text-left border-collapse my-6 text-xs">
                <thead>
                  <tr className="border-b-2 border-neutral-300 text-neutral-500 font-bold uppercase text-[9px]">
                    <th className="py-2">Deskripsi Buku</th>
                    <th className="py-2 text-right">Harga Satuan</th>
                    <th className="py-2 text-center">Jumlah</th>
                    <th className="py-2 text-right">Total (TWD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-150">
                  {printInvoiceOrder.items?.map((item, idx) => (
                    <tr key={idx} className="text-neutral-800">
                      <td className="py-3 font-semibold">{item.bookName}{item.isFree && " (Gratis)"}</td>
                      <td className="py-3 text-right font-numeric">{formatNTD(item.unitPrice)}</td>
                      <td className="py-3 text-center font-numeric">{item.qty} pcs</td>
                      <td className="py-3 text-right font-numeric font-bold">{formatNTD(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {canViewAmount && (
                <div className="w-1/2 ml-auto space-y-2 pt-4 border-t-2 border-neutral-200 text-xs text-right">
                  <div className="flex justify-between font-medium">
                    <span className="text-neutral-550">Subtotal:</span>
                    <span className="font-numeric">{formatNTD(printInvoiceOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-rose-500">
                    <span>Diskon Platform:</span>
                    <span className="font-numeric">-{formatNTD(printInvoiceOrder.discount || 0)}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm text-neutral-900 border-t border-neutral-205 pt-2">
                    <span>GRAND TOTAL (TWD):</span>
                    <span className="font-numeric text-brand-600">{formatNTD(printInvoiceOrder.totalPrice)}</span>
                  </div>
                </div>
              )}

              <div className="pt-10 text-center text-[10px] text-neutral-400 italic">
                Terima kasih atas pesanan Anda. Hubungi kami bila ada ketidaksesuaian barang.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Lanjutkan Proses Pengiriman? "Proses" Confirmation Modal */}
      {isProsesConfirmOpen && selectedOrderForProses && (() => {
        let isEarlyShipping = false;
        if (selectedOrderForProses.estimatedShippingDate && prosesDate) {
          const estDate = new Date(selectedOrderForProses.estimatedShippingDate);
          estDate.setHours(0, 0, 0, 0);
          const pDate = new Date(prosesDate);
          pDate.setHours(0, 0, 0, 0);
          if (estDate > pDate) {
            isEarlyShipping = true;
          }
        }

        const isOrderAlreadyDeducted = selectedOrderForProses.status === 'packed' || selectedOrderForProses.status === 'shipped' || selectedOrderForProses.status === 'confirmed' || selectedOrderForProses.status === 'completed';
        const insufficientItemsList: { name: string, stock: number, needed: number }[] = [];
        for (const item of selectedOrderForProses.items || []) {
          if (item.markedTertinggal || item.markedRefund) continue;
          const physical = getPhysicalOnHandStockForBook(item.bookId, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords);
          const available = isOrderAlreadyDeducted ? physical + item.qty : physical;
          if (available < item.qty) {
            insufficientItemsList.push({ name: item.bookName, stock: available, needed: item.qty });
          }
        }
        const hasWarning = isEarlyShipping || insufficientItemsList.length > 0;

        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleCloseProsesModal();
              }
            }}
            className={getModalOverlayClass(sidebarHidden, 'z-50')}
          >
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[92%] max-w-lg overflow-hidden animate-scaleIn my-auto">
              <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-neutral-800 dark:text-neutral-100">
                  <Truck className="h-4 w-4 text-brand-500 animate-pulse" />
                  Kirim Orderan
                </h3>
                <button onClick={handleCloseProsesModal} className="text-neutral-400 hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 p-1 rounded-lg transition"><X className="h-5 w-5" /></button>
              </div>

              <div className="p-5 space-y-4 text-xs font-text">

                {/* 1. [Modal Top Info Grid] */}
                <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-500 capitalize font-bold block mb-1">Penerima</span>
                      <p className="font-bold text-neutral-800 dark:text-neutral-100 uppercase">{selectedOrderForProses.customerName}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-neutral-500 capitalize font-bold block mb-1">COD Kurir Logistics</span>
                      <p className="font-bold text-neutral-800 dark:text-neutral-100">{selectedOrderForProses.pickupLogistics}</p>
                      <p className="text-neutral-600 dark:text-neutral-400 mt-1 font-medium leading-tight">{selectedOrderForProses.pickupDetails || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 2. [Modal Mid Section] */}
                <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3">
                  <div>
                    <span className="text-[10px] text-neutral-500 capitalize font-bold block mb-2">Nama Buku / Barang</span>
                    <div className="max-h-28 overflow-y-auto space-y-2">
                      {(selectedOrderForProses.items || []).map((it, idx) => {
                        const isTertinggal = it.markedTertinggal || it.markedRefund;
                        const resolvedCover = it.bookCover || books.find(b => b.id === it.bookId)?.cover || '';
                        return (
                          <div key={idx} className={`flex items-center gap-3 p-1.5 rounded-lg ${isTertinggal ? 'bg-neutral-200/60 dark:bg-neutral-800/80 opacity-60 border border-neutral-300 dark:border-neutral-700' : ''}`}>
                            <span className="text-neutral-400 dark:text-neutral-500">•</span>
                            {resolvedCover ? (
                              <img
                                src={resolvedCover}
                                alt={it.bookName}
                                referrerPolicy="no-referrer"
                                className="w-10 h-12 object-cover rounded border border-neutral-200 dark:border-neutral-800 shrink-0 cursor-pointer hover:opacity-80 transition"
                                onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: resolvedCover, title: it.bookName }); }}
                              />
                            ) : (
                              <div className="w-10 h-12 bg-neutral-100 dark:bg-neutral-800 rounded flex items-center justify-center shrink-0 border border-neutral-200 dark:border-neutral-800">
                                <BookOpen className="h-4 w-4 text-neutral-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <TruncatedTooltip content={it.bookName} className="font-bold text-neutral-800 dark:text-neutral-200 text-xs">
                                  {it.bookName}
                                </TruncatedTooltip>
                                {isTertinggal && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
                                    Tertinggal
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-neutral-500 font-numeric">
                                {it.qty} pcs
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-numeric text-xs font-bold text-neutral-800 dark:text-neutral-200">
                                {formatNTD(it.unitPrice)}
                              </span>
                              {it.qty > 1 && (
                                <p className="text-[10px] text-neutral-400 font-numeric">
                                  Subtotal: {formatNTD(it.lineTotal || (it.unitPrice * it.qty))}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {canViewAmount && (
                    <div className="pt-2.5 border-t border-dashed border-neutral-250 dark:border-neutral-800 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-neutral-500 font-text">Diskon</span>
                        <span className="font-numeric text-xs font-bold text-red-600 dark:text-red-400">
                          {selectedOrderForProses.discount ? `- ${formatNTD(selectedOrderForProses.discount)}` : formatNTD(0)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-neutral-200/50 dark:border-neutral-800/50">
                        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-350 font-text">Total Tagihan</span>
                        <span className="font-numeric text-sm font-black text-[#2b5a9e]">{formatNTD(selectedOrderForProses.totalPrice)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. [Modal Lower Form Fields Refactoring] */}
                <div className="space-y-4">
                  {selectedOrderForProses.customerNote && (
                    <div className="bg-neutral-50 dark:bg-neutral-950/20 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
                      <span className="text-[10px] text-[#737373] capitalize font-bold block mb-1">Deskripsi</span>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 font-bold whitespace-pre-wrap">
                        {selectedOrderForProses.customerNote}
                      </p>
                    </div>
                  )}

                  {/* NOMOR ORDER - readOnly field with Copy button */}
                  <div>
                    <label className="block text-xs capitalize font-bold text-neutral-500 mb-1">Nomor Order</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        readOnly
                        value={(selectedOrderForProses.orderNumber || selectedOrderForProses.orderCode || selectedOrderForProses.id || '').replace(/^#+/, '')}
                        className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm font-bold text-neutral-700 dark:text-neutral-200 focus:outline-none cursor-not-allowed font-numeric"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const orderNo = (selectedOrderForProses.orderNumber || selectedOrderForProses.orderCode || selectedOrderForProses.id || '').replace(/^#+/, '');
                          if (orderNo) {
                            navigator.clipboard.writeText(orderNo);
                            setCopiedOrderNo(true);
                            setTimeout(() => setCopiedOrderNo(false), 2000);
                          }
                        }}
                        className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold text-neutral-700 dark:text-neutral-200 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                        title="Copy Nomor Order"
                      >
                        {copiedOrderNo ? (
                          <>
                            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 text-neutral-500" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* NOMOR RESI - copy action support, scanning capability */}
                  <div>
                    <label className="block text-xs capitalize font-bold text-neutral-500 mb-1">Nomor Resi *</label>
                    <div className={`relative transition-all ${shakeFields['prosesResi'] ? 'animate-shake' : ''}`}>
                      <input
                        type="text"
                        required
                        placeholder="Masukkan atau scan barcode resi pengiriman..."
                        value={prosesResi}
                        onChange={(e) => setProsesResi(e.target.value.toUpperCase().replace(/\s/g, ''))}
                        className={`w-full pl-3 pr-10 py-2 border rounded-lg text-sm text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all ${shakeFields['prosesResi']
                          ? 'border-red-500 ring-1 ring-red-500 bg-red-50/50 dark:bg-red-950/20'
                          : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950'
                          }`}
                      />
                      <button
                        type="button"
                        onClick={() => setIsScanning(true)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-brand-500 transition cursor-pointer"
                        title="Scan Barcode / QR Code"
                      >
                        <Scan className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* TANGGAL DIKIRIM - native interactive date picker */}
                  <div>
                    <label className="block text-xs capitalize font-bold text-neutral-500 mb-1">Tanggal Dikirim *</label>
                    <input
                      type="date"
                      required
                      value={prosesDate}
                      onChange={(e) => setProsesDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-lg text-sm text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {/* 4. Warnings */}
                {(isEarlyShipping || insufficientItemsList.length > 0) && (
                  <div className="space-y-2 mb-4">
                    {isEarlyShipping && (
                      <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-lg p-3">
                        <span className="text-[10px] text-orange-500 capitalize font-bold block mb-1 font-text">Belum Waktunya Dikirim, Diminta Kirim Tanggal {(() => { const d = new Date(selectedOrderForProses.estimatedShippingDate!); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; })()}</span>
                      </div>
                    )}
                    {insufficientItemsList.length > 0 && (
                      <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-lg p-3">
                        <span className="text-[10px] text-orange-500 capitalize font-bold block mb-1 font-text">Stok Tidak Mencukupi untuk Item Berikut :</span>
                        <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-1">
                          {insufficientItemsList.map((it, idx) => (
                            <li key={idx} className="font-text">
                              <strong>{it.name}</strong> (Stok: <span className="font-numeric">{it.stock}</span> pcs, Dibutuhkan: <span className="font-numeric">{it.needed}</span> pcs)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. [Modal Footer Action Buttons] */}
                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-150 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={handleCloseProsesModal}
                    className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 text-xs font-semibold rounded-lg text-neutral-600 dark:text-neutral-300 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isProsesSubmitting}
                    onClick={async () => {
                      if (isProsesSubmitting) return;
                      const cleanResi = prosesResi.trim();
                      setIsProsesSubmitting(true);
                      try {
                        const orderRef = doc(db, 'salesOrders', selectedOrderForProses.id);
                        const finalOrderNo = selectedOrderForProses.orderNumber || '';
                        const updateData: any = {
                          orderNumber: finalOrderNo,
                          updatedAt: Timestamp.now()
                        };

                        if (cleanResi) {
                          updateData.shipment = {
                            orderNumber: finalOrderNo,
                            shippingNumber: cleanResi,
                            shippingDate: Timestamp.fromDate(new Date(prosesDate)),
                            arrangedAt: selectedOrderForProses.shipment?.arrangedAt || Timestamp.now()
                          };
                        }

                        await updateDoc(orderRef, updateData);

                        // Tutup modal sesuai kesepakatan 
                        await stopScanning();
                        setIsProsesConfirmOpen(false);
                        setSelectedOrderForProses(null);
                      } catch (err: any) {
                        safeAlert(`Gagal menyimpan perubahan: ${err.message}`);
                      } finally {
                        setIsProsesSubmitting(false);
                      }
                    }}
                    className="px-4 py-2 border border-brand-500 hover:bg-brand-50 text-xs font-bold rounded-lg text-brand-600 transition cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    disabled={isProsesSubmitting}
                    onClick={async () => {
                      if (isProsesSubmitting) return;
                      if (hasWarning) {
                        triggerShake('prosesSubmitBtn');
                        return;
                      }
                      const cleanResi = prosesResi.trim();
                      if (!cleanResi) {
                        triggerShake('prosesResi');
                        return;
                      }
                      if (!(await promptDoubleConfirmation("Memproses Pengiriman dan Memotong Persediaan Stok"))) return;

                      setIsProsesSubmitting(true);
                      try {
                        // 1. Deduct Inventory & Add Audit Log Transactionally
                        await confirmSalesOrderTransaction(selectedOrderForProses.id, user?.uid || 'anonymous');

                        // 2. Transition Status to Shipped & Store Shipment barcode Info
                        const orderRef = doc(db, 'salesOrders', selectedOrderForProses.id);
                        const finalOrderNo = selectedOrderForProses.orderNumber || '';
                        await updateDoc(orderRef, {
                          status: 'shipped',
                          shippedAt: Timestamp.now(),
                          orderNumber: finalOrderNo,
                          shipment: {
                            orderNumber: finalOrderNo,
                            shippingNumber: cleanResi,
                            shippingDate: Timestamp.fromDate(new Date(prosesDate)),
                            arrangedAt: Timestamp.now()
                          },
                          updatedAt: Timestamp.now()
                        });

                        await stopScanning();
                        setIsProsesConfirmOpen(false);
                        setSelectedOrderForProses(null);
                      } catch (err: any) {
                        safeAlert(`Gagal konfirmasi pesanan: ${err.message}`);
                      } finally {
                        setIsProsesSubmitting(false);
                      }
                    }}
                    className={`px-5 py-2 bg-brand-600 hover:bg-brand-700 text-xs font-bold text-white rounded-lg shadow-sm transition cursor-pointer ${shakeFields['prosesSubmitBtn'] ? 'animate-shake' : ''}`}
                  >
                    Konfirmasi Kirim
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Camera Scanner Interstitial Layer Overlay */}
      {isScanning && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-[100]')}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[92%] max-w-md overflow-hidden p-5 space-y-4 animate-scaleIn my-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-neutral-800 dark:text-neutral-100">
                <Scan className="h-4 w-4 text-brand-500 animate-pulse" />
                Scan Barcode / QR Code
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleCameraFacingMode}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                  title="Balik Kamera Depan / Belakang"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                  <span className="hidden sm:inline">{cameraFacingMode === 'environment' ? 'Belakang' : 'Depan'}</span>
                </button>
                <button
                  onClick={stopScanning}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-150 p-1 rounded-lg transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black border border-neutral-200 dark:border-neutral-800 flex items-center justify-center">
              {/* Target scan wrapper */}
              <div id="qr-reader" className={`w-full h-full object-cover ${cameraFacingMode === 'user' ? 'video-mirror-user' : 'video-mirror-environment'}`}></div>

              {/* Overlay button on top of camera stream for quick mobile flip */}
              <div className="absolute top-2 right-2 z-20">
                <button
                  type="button"
                  onClick={toggleCameraFacingMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-black/65 hover:bg-black/85 backdrop-blur-md text-white rounded-full text-xs font-medium border border-white/20 shadow-md transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-brand-300" />
                  <span>Kamera {cameraFacingMode === 'environment' ? 'Belakang' : 'Depan'}</span>
                </button>
              </div>

              {/* High precision landscape visual guide corners covering the wide barcode region */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3">
                <div className="w-[95%] h-[40%] border border-dashed border-brand-400/80 rounded-lg relative flex items-center justify-center bg-brand-500/5">
                  {/* Corner indicators */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-brand-500 rounded-tl-sm"></div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-brand-500 rounded-tr-sm"></div>
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-brand-500 rounded-bl-sm"></div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-brand-500 rounded-br-sm"></div>

                  {/* High responsiveness guidance message within viewport */}
                  <span className="absolute bottom-1.5 text-[8px] text-brand-300 tracking-wider uppercase bg-neutral-950/45 px-1.5 py-0.5 rounded backdrop-blur-xs font-numeric">
                    Sejajarkan Barcode Di Sini
                  </span>

                  {/* Red laser animation line overlay */}
                  <div className="absolute inset-x-2 h-0.5 bg-rose-500 opacity-85 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse shadow-rose-500"></div>
                </div>
              </div>

              <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs text-[9px] font-numeric text-neutral-300 rounded uppercase tracking-wider flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                HD 720p Active
              </div>
            </div>

            {scanError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl space-y-1.5">
                <p className="text-[10px] text-rose-600 dark:text-rose-400 text-center font-bold">{scanError}</p>
                <p className="text-[9px] text-neutral-500 dark:text-neutral-400 text-center leading-normal">
                  Tips: Browser melarang akses kamera di dalam bingkai pratinjau (iFrame). Silakan klik ikon pratinjau <strong>Buka di Tab Baru (Open in new tab)</strong> pada pojok kanan atas layar untuk memakai scanner secara penuh.
                </p>
              </div>
            )}

            <p className="text-center text-[10px] sm:text-[11px] text-neutral-500 leading-normal">
              Arahkan kamera perangkat Anda langsung pada label resi pengiriman untuk mendeteksi barcode otomatis.
            </p>

            <button
              type="button"
              onClick={stopScanning}
              className="w-full py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              Tutup Kamera
            </button>
          </div>
        </div>
      )}

      {/* 2. Selesai Confirmation Overlay */}
      {confirmingSelesaiOrderId && (() => {
        const targetOrder = orders.find(o => o.id === confirmingSelesaiOrderId);
        const isTransfer = targetOrder?.paymentMethod === 'Transfer';
        const transferAlreadyPaid = targetOrder?.paymentStatus === 'paid' || (targetOrder?.amountPaid || 0) >= (targetOrder?.totalPrice || 0) - 5;
        const blockedByUnpaidTransfer = isTransfer && !transferAlreadyPaid;
        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setConfirmingSelesaiOrderId(null);
              }
            }}
            className={getModalOverlayClass(sidebarHidden, 'z-50')}
          >
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[90%] max-w-sm overflow-hidden animate-scaleIn p-5 space-y-4 my-auto">
              <div className="flex items-center gap-2 text-emerald-600">
                <Check className="h-5 w-5" />
                <h3 className="font-bold text-neutral-800 dark:text-neutral-100">Konfirmasi Pembayaran Selesai?</h3>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Konfirmasi status penyelesaian transaksi order ini.
              </p>
              <div className={`space-y-1 p-3 rounded-xl border text-xs ${blockedByUnpaidTransfer ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400' : 'bg-neutral-50 dark:bg-neutral-950/40 border-neutral-100 dark:border-neutral-800 text-neutral-500'}`}>
                {isTransfer ? (
                  blockedByUnpaidTransfer
                    ? <span>Metode <b>Transfer</b>, tapi order ini <b>belum tercatat lunas</b>. Catat penerimaan transfer dulu lewat tab "Penerimaan Transfer (Income)" sebelum menyelesaikan order.</span>
                    : <span>Metode <b>Transfer</b> (sudah lunas) &rarr; jurnal Dr Pendapatan Diterima di Muka / Cr Revenue. Order tidak masuk Piutang Usaha.</span>
                ) : (
                  <span>Metode <b>COD</b> &rarr; order akan otomatis masuk <b>Piutang Usaha</b> (Dr Piutang Usaha / Cr Revenue).</span>
                )}
              </div>
              {!isTransfer && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Umur Piutang</label>
                  <select
                    value={selesaiTermsDays}
                    onChange={(e) => setSelesaiTermsDays(Number(e.target.value) as 30 | 60 | 90)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                  >
                    <option value={30}>30 Hari</option>
                    <option value={60}>60 Hari</option>
                    <option value={90}>90 Hari</option>
                  </select>
                  <p className="text-[10px] text-neutral-400 leading-relaxed">
                    Jatuh tempo dihitung {selesaiTermsDays} hari sejak hari ini.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                <button
                  onClick={() => setConfirmingSelesaiOrderId(null)}
                  className="px-3.5 py-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 rounded text-neutral-600 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  disabled={isSelesaiSubmitting || blockedByUnpaidTransfer}
                  onClick={async () => {
                    if (isSelesaiSubmitting || blockedByUnpaidTransfer) return;
                    if (!(await promptDoubleConfirmation("Menyelesaikan Pembayaran dan Status Orderan"))) return;
                    try {
                      setIsSelesaiSubmitting(true);
                      await completeSalesOrderTransaction(confirmingSelesaiOrderId!, user?.uid || 'anonymous', selesaiTermsDays);
                      setConfirmingSelesaiOrderId(null);
                    } catch (err: any) {
                      console.error("Error setting order completed", err);
                      alert(err?.message || 'Gagal menyelesaikan order.');
                    } finally {
                      setIsSelesaiSubmitting(false);
                    }
                  }}
                  className={`px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-bold cursor-pointer ${(isSelesaiSubmitting || blockedByUnpaidTransfer) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSelesaiSubmitting ? 'Memproses...' : 'Ya, Selesai & Berhasil'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. Return "Diambil" Confirmation Modal */}
      {confirmingDiambilOrder && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmingDiambilOrder(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[90%] max-w-md overflow-hidden animate-scaleIn p-5 space-y-4 text-xs font-text my-auto">
            <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-neutral-800 dark:text-neutral-100">
              <RefreshCw className="h-4 w-4 text-brand-500 animate-spin" />
              Buku Return Telah Diambil?
            </h3>
            <p className="text-neutral-500 leading-normal">
              Bagaimana status fisik dari buku return ini setelah diambil kembali? Silakan tentukan opsi pengembalian stok:
            </p>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-1">
              <span className="text-[9px] capitalize font-bold text-neutral-450">Item Terkait:</span>
              {(confirmingDiambilOrder.items || []).map((it, idx) => (
                <p key={idx} className="font-bold text-neutral-800 dark:text-neutral-200">
                  • {it.bookName} <span className="font-numeric text-[10px]">({it.qty} pcs)</span>
                </p>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-center">
              {/* Option A: Return to Stock */}
              <button
                type="button"
                onClick={() => setSelectedReturnMode('stock')}
                className={`p-3 border rounded-xl space-y-1 text-left transition cursor-pointer ${selectedReturnMode === 'stock'
                  ? 'border-brand-600 dark:border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 text-brand-900 dark:text-brand-200 ring-2 ring-brand-500/20'
                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 text-neutral-800 dark:text-neutral-100'
                  }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-brand-700 dark:text-brand-400">
                  <Check className="h-3.5 w-3.5" />
                  Kembalikan Stok
                </div>
                <p className="text-[10px] text-neutral-500 leading-tight">Fisik buku mulus, kembalikan ke persediaan rak gilingan.</p>
              </button>

              {/* Option B: Write off */}
              <button
                type="button"
                onClick={() => setSelectedReturnMode('writeoff')}
                className={`p-3 border rounded-xl space-y-1 text-left transition cursor-pointer ${selectedReturnMode === 'writeoff'
                  ? 'border-rose-500 dark:border-rose-550 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 text-neutral-800 dark:text-neutral-100'
                  }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-rose-600">
                  <XCircle className="h-3.5 w-3.5" />
                  Rusak / Hilang
                </div>
                <p className="text-[10px] text-neutral-500 leading-tight">Fisik cacat/hilang di kurir, catatkan tanpa mengembalikan ke persediaan rak.</p>
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 font-text">
              <button
                type="button"
                onClick={handleProcessConfirmingDiambilOrder}
                className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg cursor-pointer transition shadow-sm"
              >
                Ya, Konfirmasi
              </button>
              <button
                onClick={() => setConfirmingDiambilOrder(null)}
                className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-350 font-bold rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portalled to <body> for the same reason as the FAB above: `.kbi-main > *`
          carries a transform entrance animation, and Chromium keeps such an element
          as the containing block for its fixed-position descendants even after the
          animation finishes. Left inside the tree, this overlay is positioned against
          the tab wrapper — on a phone that puts it hundreds of pixels below the fold,
          which reads as a blank screen. The sidebar offset moved out of Tailwind
          `!left-*` utilities into SalesOrderForm.css: Tailwind v4 emits real cascade
          layers, and a layered `!important` outranks the unlayered `!important` in
          mobile.css, so the mobile full-bleed reset could never win. */}
      <NewOrderModalWrapper
        isOpen={isNewOrderOpen}
        onClose={() => {
          setIsNewOrderOpen(false);
          setEditingOrder(null);
          resetOrderForm();
        }}
        isMobileScreen={isMobileScreen}
        sidebarHidden={sidebarHidden}
      >
        <div className="kbi-so-card-header">
          <div className="kbi-so-card-header-left">
            <div className="kbi-so-icon-badge">
              <ShoppingBag className="w-[18px] h-[18px]" />
            </div>
            <h2 className="kbi-so-card-title">{editingOrder ? 'Edit Orderan' : 'Orderan Baru'}</h2>
            <span className="kbi-so-status-pill"><span className="kbi-so-dot"></span>{editingOrder ? 'EDIT' : 'PENDING'}</span>
            {buyerType === 'marketplace' && (
              <span className="kbi-so-marketplace-pill" id="marketplacePill"><span className="kbi-so-dot"></span>MARKETPLACE</span>
            )}
            {buyerType === 'langsung' && (
              <span className="kbi-so-direct-pill" id="directPill"><span className="kbi-so-dot"></span>DIRECT</span>
            )}
            {buyerType === 'reseller' && (
              <span className="kbi-so-reseller-pill" id="resellerPill"><span className="kbi-so-dot"></span>RESELLER</span>
            )}
          </div>
          <button className="kbi-so-icon-btn" onClick={() => { setIsNewOrderOpen(false); setEditingOrder(null); resetOrderForm(); }}>
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="kbi-so-card-body">
          {/* LEFT: Kategori Order */}
          <div className="kbi-so-col-left">
            <p className="kbi-so-col-heading">Kategori Order</p>

            <div className="kbi-so-buyer-type-toggle">
              <button
                type="button"
                disabled={isFormLockedForMetadata}
                className={buyerType === 'marketplace' ? 'active bt-marketplace' : ''}
                onClick={() => handleSelectBuyerType('marketplace')}
              >
                Marketplace
              </button>
              <button
                type="button"
                disabled={isFormLockedForMetadata}
                className={buyerType === 'langsung' ? 'active bt-langsung' : ''}
                onClick={() => handleSelectBuyerType('langsung')}
              >
                Direct Order
              </button>
              <button
                type="button"
                disabled={isFormLockedForMetadata}
                className={buyerType === 'reseller' ? 'active bt-reseller' : ''}
                onClick={() => handleSelectBuyerType('reseller')}
              >
                Reseller Order
              </button>
            </div>

            {buyerType === 'reseller' && (
              <div className="kbi-so-field">
                <label className="kbi-so-label">Pilih Reseller</label>
                {!selectedPartner ? (
                  <div className="kbi-so-reseller-search-wrap">
                    <input
                      disabled={isFormLockedForMetadata}
                      className="kbi-so-ledger-input"
                      placeholder="Pilih dari daftar (opsional)..."
                      value={configInputVal}
                      onChange={(e) => setConfigInputVal(e.target.value)}
                    />
                    <div className="kbi-so-reseller-suggestions" style={{ position: 'relative', marginTop: 4, display: 'block' }}>
                      {partners.filter(p => p.name?.toLowerCase().includes(configInputVal.toLowerCase())).map(p => (
                        <button key={p.id} type="button" className="kbi-so-reseller-row" onClick={() => { setSelectedPartner({ id: p.id, name: p.name, profitSharePercent: p.profitSharePercent }); setConfigInputVal(''); }}>
                          <span>{p.name}</span>

                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="kbi-so-reseller-chip">
                    <div>
                      <div className="kbi-so-reseller-chip-name">{selectedPartner.name}</div>

                    </div>
                    <button type="button" onClick={() => setSelectedPartner(null)}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="kbi-so-field">
              <label className="kbi-so-label">Tanggal Pembelian *</label>
              <input
                type="date"
                disabled={isFormLockedForMetadata}
                className="kbi-so-ledger-input font-numeric"
                value={orderDateInput}
                onChange={(e) => setOrderDateInput(e.target.value)}
              />
            </div>

            <div className="kbi-so-field">
              <label className="kbi-so-label">{buyerType === 'marketplace' ? 'Nama Platform *' : 'Nama Pembeli *'}</label>
              <input
                className={`kbi-so-ledger-input ${shakeFields[buyerType === 'marketplace' ? 'customerPlatformName' : 'customerName'] ? 'animate-shake border-red-500' : ''}`}
                disabled={isFormLockedForMetadata}
                placeholder={buyerType === 'marketplace' ? "Contoh: Shopee, Tokopedia..." : "Nama asli penerima..."}
                value={buyerType === 'marketplace' ? customerPlatformName : customerName}
                onChange={(e) => {
                  if (buyerType === 'marketplace') {
                    setCustomerPlatformName(e.target.value);
                    setCustomerName('');
                  } else {
                    setCustomerName(e.target.value);
                  }
                }}
                onBlur={() => {
                  if (buyerType === 'marketplace') {
                    setCustomerPlatformName(customerPlatformName.trim());
                  } else {
                    setCustomerName(customerName.trim().toUpperCase());
                  }
                }}
              />
            </div>

            {buyerType === 'marketplace' && (
              <div className="kbi-so-field">
                <label className="kbi-so-label">Sumber Orderan *</label>
                <div className="kbi-so-select-wrap relative">
                  <select
                    className="kbi-so-ledger-input"
                    disabled={isFormLockedForMetadata}
                    value={platformChannel}
                    onChange={e => setPlatformChannel(e.target.value)}
                  >
                    {!platformChannel && <option value="" disabled>-- Pilih Sumber Orderan --</option>}
                    {filteredChannels.map((c, cIdx) => (
                      <option key={`${c.id || c.name}-${cIdx}`} value={c.name}>{c.name}</option>
                    ))}
                    {platformChannel && !filteredChannels.some(c => c.name === platformChannel) && (
                      <option value={platformChannel}>{platformChannel}</option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                </div>
              </div>
            )}

            {buyerType !== 'marketplace' && (
              <>
                <div className="kbi-so-field">
                  <label className="kbi-so-label">Nama Platform *</label>
                  <input
                    className={`kbi-so-ledger-input ${shakeFields['customerPlatformName'] ? 'animate-shake border-red-500' : ''}`}
                    disabled={isFormLockedForMetadata}
                    placeholder="Contoh: Andrea Hirata"
                    value={customerPlatformName}
                    onChange={(e) => setCustomerPlatformName(e.target.value)}
                    onBlur={() => setCustomerPlatformName(customerPlatformName.trim())}
                  />
                </div>

                <div className="kbi-so-field">
                  <label className="kbi-so-label">Sumber Orderan *</label>
                  <div className="kbi-so-select-wrap relative">
                    <select
                      className="kbi-so-ledger-input"
                      disabled={isFormLockedForMetadata}
                      value={platformChannel}
                      onChange={e => setPlatformChannel(e.target.value)}
                    >
                      {!platformChannel && <option value="" disabled>-- Pilih Sumber Orderan --</option>}
                      {filteredChannels.map((c, cIdx) => (
                        <option key={`${c.id || c.name}-${cIdx}`} value={c.name}>{c.name}</option>
                      ))}
                      {platformChannel && !filteredChannels.some(c => c.name === platformChannel) && (
                        <option value={platformChannel}>{platformChannel}</option>
                      )}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  </div>
                </div>

                <div className="kbi-so-field">
                  <label className="kbi-so-label">No. Handphone *</label>
                  <input
                    className={`kbi-so-ledger-input ${shakeFields['phoneNumber'] ? 'animate-shake !border-red-500 !ring-red-500 border-2' : ''}`}
                    disabled={isFormLockedForMetadata}
                    placeholder="0984287114"
                    value={formatPhoneNumber(phoneNumber)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      if (digits.length > 10) {
                        triggerShake('phoneNumber');
                        return;
                      }
                      setPhoneNumber(digits);
                    }}
                  />
                </div>

                {buyerType !== 'reseller' && (
                  <div className="kbi-so-field">
                    <label className="kbi-so-label">Sumber Campaign</label>
                    <div className="kbi-so-select-wrap relative">
                      <select
                        className="kbi-so-ledger-input"
                        disabled={isFormLockedForMetadata}
                        value={orderType}
                        onChange={e => setOrderType(e.target.value)}
                      >
                        <option value="">-- Pilih Sumber Campaign --</option>
                        {resolvedOrderTypes.map((t, tIdx) => (
                          <option key={`${t.id || t.name}-${tIdx}`} value={t.name}>{t.name}</option>
                        ))}
                        {orderType && !resolvedOrderTypes.some(t => t.name === orderType) && (
                          <option value={orderType}>{orderType}</option>
                        )}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                <div className="kbi-so-field-row">
                  <div>
                    <label className="kbi-so-label">Opsi Pengiriman</label>
                    <div className="kbi-so-select-wrap relative">
                      <select
                        className="kbi-so-ledger-input"
                        disabled={isFormLockedForMetadata}
                        value={pickupLogistics}
                        onChange={e => setPickupLogistics(e.target.value)}
                      >
                        {!pickupLogistics && <option value="" disabled>-- Pilih Opsi Pengiriman --</option>}
                        {availableLogistics.map((l, lIdx) => (
                          <option key={`${l.id || l.name}-${lIdx}`} value={l.name}>{l.name}</option>
                        ))}
                        {pickupLogistics && !availableLogistics.some(l => l.name === pickupLogistics) && (
                          <option value={pickupLogistics}>{pickupLogistics}</option>
                        )}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="kbi-so-label">Metode Bayar</label>
                    <div className="kbi-so-select-wrap">
                      <select className="kbi-so-ledger-input" disabled={isFormLockedForMetadata} value={paymentMethod} onChange={(e: any) => handlePaymentMethodChange(e.target.value)}>
                        <option value="COD">COD</option>
                        <option value="Transfer">Transfer</option>
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    </div>
                  </div>
                </div>

                <div className="kbi-so-field-row" style={{ alignItems: 'start' }}>
                  <div>
                    <label className="kbi-so-label">Kode Toko / Alamat</label>
                    <textarea
                      className="kbi-so-ledger-input"
                      disabled={isFormLockedForMetadata}
                      placeholder="Contoh: Toko No. 991823..."
                      value={pickupDetails}
                      onChange={e => setPickupDetails(e.target.value)}
                    ></textarea>
                  </div>
                  <div>
                    <label className="kbi-so-label">Foto Fapiao / Alamat</label>
                    <input
                      type="file"
                      id="fotoAlamatInput"
                      accept="image/*"
                      className="hidden"
                      disabled={isFormLockedForMetadata}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setAddressPhotoFile(file);
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setAddressPhotoUrl(ev.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {!addressPhotoUrl ? (
                      <label htmlFor="fotoAlamatInput" className={`kbi-so-upload-box ${isFormLockedForMetadata ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <UploadCloud className="w-[15px] h-[15px]" />
                        <span>Upload Foto</span>
                      </label>
                    ) : (
                      <div className="kbi-so-upload-preview">
                        <img src={addressPhotoUrl} alt="Preview" />
                        {!isFormLockedForMetadata && (
                          <button type="button" onClick={() => { setAddressPhotoUrl(''); setAddressPhotoFile(null); }}>
                            <X className="w-[12px] h-[12px]" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="kbi-so-field-row">
                  <div>
                    <label className="kbi-so-label">Platform Order</label>
                    <div className="kbi-so-select-wrap relative">
                      <select
                        className="kbi-so-ledger-input"
                        disabled={isFormLockedForMetadata}
                        value={platformOrder}
                        onChange={e => {
                          const val = e.target.value;
                          setPlatformOrder(val);
                          if (!editingOrder) {
                            const listToUse = buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment;
                            const matched = listToUse.find((p: any) => p.name === val);
                            if (matched && matched.adminFee !== undefined) {
                              setPlatformFeeInput(String(matched.adminFee));
                            } else {
                              setPlatformFeeInput('0');
                            }
                          }
                        }}
                      >
                        {!platformOrder && <option value="" disabled>-- Pilih Platform Order --</option>}
                        {(buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment).map((p, pIdx) => (
                          <option key={`${p.id || p.name}-${pIdx}`} value={p.name}>{p.name}</option>
                        ))}
                        {platformOrder && !(buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment).some(p => p.name === platformOrder) && (
                          <option value={platformOrder}>{platformOrder}</option>
                        )}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="kbi-so-label">Nomor Order</label>
                    <div className="kbi-so-nomor-row">
                      <input className="kbi-so-ledger-input font-numeric" disabled={isFormLockedForMetadata} value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Opsional (Otomatis jika kosong)" />
                      <button type="button" className="kbi-so-copy-btn" onClick={() => navigator.clipboard.writeText(orderNumber)} title="Salin Nomor Order">
                        <Copy className="w-[15px] h-[15px]" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {buyerType === 'marketplace' && (
              <div className="kbi-so-field">
                <label className="kbi-so-label">Nomor Order</label>
                <div className="kbi-so-nomor-row">
                  <input className="kbi-so-ledger-input font-numeric" disabled={isFormLockedForMetadata} value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Opsional (Otomatis jika kosong)" />
                  <button type="button" className="kbi-so-copy-btn" onClick={() => navigator.clipboard.writeText(orderNumber)} title="Salin Nomor Order">
                    <Copy className="w-[15px] h-[15px]" />
                  </button>
                </div>
              </div>
            )}

            <div className="kbi-so-field">
              <label className="kbi-so-label">Note dari Customer</label>
              <textarea
                className="kbi-so-ledger-input"
                disabled={isFormLockedForMetadata}
                placeholder="Catatan tambahan dari pembeli..."
                value={customerNote}
                onChange={e => setCustomerNote(e.target.value)}
              ></textarea>
            </div>

            <div className="kbi-so-field" style={{ marginBottom: 4 }}>
              <label className="kbi-so-label">Konfirmasi Sebelum Dikirim</label>
              <label className="kbi-so-toggle-wrapper" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                <div className="kbi-so-toggle relative w-10 h-5">
                  <input
                    type="checkbox"
                    disabled={isFormLockedForMetadata}
                    checked={perluKonfirmasiSebelumKirim}
                    onChange={e => setPerluKonfirmasiSebelumKirim(e.target.checked)}
                    className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer peer"
                  />
                  <div className="absolute inset-0 bg-neutral-300 dark:bg-neutral-600 rounded-full peer-checked:bg-[#6366f1] transition-colors duration-200"></div>
                  <div className="absolute top-[2px] left-[2px] bg-white border border-gray-300 rounded-full h-4 w-4 transition-transform duration-200 peer-checked:translate-x-5 peer-checked:border-white shadow-sm"></div>
                </div>
                <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
                  {perluKonfirmasiSebelumKirim ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            <div className="kbi-so-field" style={{ marginBottom: 4 }}>
              <label className="kbi-so-label">Tanggal Diminta Kirim</label>
              <div className="relative group">
                <input
                  type="date"
                  disabled={isFormLockedForMetadata}
                  className="kbi-so-ledger-input font-numeric w-full pr-10 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  value={estimatedShippingDate}
                  onChange={e => setEstimatedShippingDate(e.target.value)}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 group-hover:text-brand-500 transition-colors">
                  <Calendar className="w-[15px] h-[15px]" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Nama Buku / Barang */}
          <div className="kbi-so-col-right">
            <p className="kbi-so-col-heading">Nama Buku / Barang</p>

            <div className="kbi-so-search-wrap">
              <Search className="w-4 h-4 search-icon text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="kbi-so-ledger-input pl-10"
                disabled={isFinancialsLocked}
                placeholder="Cari buku aktif untuk ditambahkan..."
                value={bookSearch}
                onChange={e => { setBookSearch(e.target.value); setShowSearchResults(true); }}
                onFocus={() => setShowSearchResults(true)}
              />
              {showSearchResults && bookSearch && (
                <div className="kbi-so-suggestions">
                  {matchingBooks.map(b => {
                    const stok = getCurrentKontrolStokForBook(b.id, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords);
                    const tone = stok <= 0 ? 'zero' : stok <= 10 ? 'low' : 'ok';
                    const chipText = `Stok : ${stok}`;
                    const price = buyerType === 'marketplace'
                      ? (b.shopeePrice || b.generalPrice || 0)
                      : buyerType === 'reseller'
                        ? (b.resellerPrice || b.generalPrice || 0)
                        : (platformChannel === 'Shopee' ? (b.shopeePrice || b.generalPrice || 0) : (b.generalPrice || 0));
                    // Cuma harga - tanpa "/pcs" dan tanpa suffix (Marketplace)/(Reseller).
                    // buyerType berlaku untuk seluruh order, jadi semua baris di dropdown
                    // selalu memakai daftar harga yang sama; suffix-nya cuma memakan lebar
                    // yang dibutuhkan judul buku. Warnanya tetap jadi penanda daftar harga.
                    const priceLabel = formatNTD(price);
                    return (
                      <button key={b.id} type="button" className="kbi-so-suggestion-row" onMouseDown={(e) => {
                        e.preventDefault();
                        handleAddBookToCart(b);
                      }}>
                        <span className="kbi-so-suggestion-title">{b.bookName}</span>
                        <span className="kbi-so-suggestion-meta">
                          <span className="kbi-so-suggestion-price" style={buyerType === 'marketplace' ? { color: '#2563EB', fontWeight: 600 } : buyerType === 'reseller' ? { color: '#6B4C9A', fontWeight: 600 } : {}}>{priceLabel}</span>
                          <span className={`kbi-so-stock-chip ${tone}`}>{chipText}</span>
                        </span>
                      </button>
                    );
                  })}
                  {matchingBooks.length === 0 && (
                    <div className="p-3 text-sm text-neutral-500 text-center">Tidak ada buku ditemukan.</div>
                  )}
                </div>
              )}
            </div>

            <div className="kbi-so-item-list">
              {cartItems.length === 0 && (
                <div className="kbi-so-empty-items">Belum ada buku ditambahkan ke order ini.</div>
              )}
              {cartItems.map((it, idx) => {
                const stok = getCurrentKontrolStokForBook(it.bookId, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords);
                const backorder = it.qty > stok;
                const shortfall = Math.max(0, it.qty - stok);
                const b = books.find(book => book.id === it.bookId);
                return (
                  <div key={`${it.bookId}-${idx}`} className="kbi-so-item-card">
                    {(() => {
                      const resolvedCover = it.bookCover || b?.cover || ''; return resolvedCover ? (
                        <div
                          className="w-14 bg-neutral-50 dark:bg-neutral-900 overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-800 cursor-pointer transition hover:opacity-80"
                          onClick={() => setPreviewImage({ url: resolvedCover, title: it.bookName })}
                        >
                          <img referrerPolicy="no-referrer" src={resolvedCover} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-800" style={{ backgroundColor: b?.color || '#2B5A9E' }}>
                          <BookOpen className="w-4 h-4 text-white" />
                        </div>
                      );
                    })()}
                    <div className="kbi-so-item-info">
                      <div className="flex items-center gap-2 max-w-full overflow-hidden">
                        <TruncatedTooltip content={it.bookName} className="kbi-so-item-title">
                          {it.bookName.length > 30 ? `${it.bookName.slice(0, 30)}...` : it.bookName}
                        </TruncatedTooltip>
                        {it.isFree && <span className="kbi-so-gratis-tag shrink-0">GRATIS</span>}
                        {(it.markedTertinggal || it.markedRefund) && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
                            Tertinggal
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className={`kbi-so-item-stock-note ${backorder ? 'warn' : 'ok'}`}>
                          Stok {stok} pcs
                        </div>
                        {backorder && (
                          <span className="kbi-so-backorder-tag shrink-0">BACKORDER</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col justify-center items-end pr-3 gap-1 border-l border-neutral-100 dark:border-neutral-800/50 pl-2 shrink-0">
                      <div className="kbi-so-qty-stepper !p-0">
                        <button type="button" disabled={isFinancialsLocked} onClick={() => handleCartQtyChange(idx, -1)}><Minus className="w-[13px] h-[13px]" /></button>
                        <span className="text-sm">{it.qty}</span>
                        <button type="button" disabled={isFinancialsLocked} onClick={() => handleCartQtyChange(idx, 1)}><Plus className="w-[13px] h-[13px]" /></button>
                      </div>
                      <div className="kbi-so-item-line-total !p-0 font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap whitespace-pre text-xs">{formatNTD(it.lineTotal).replace(' ', '')}</div>
                    </div>
                    <div className="kbi-so-item-actions !border-l-0">
                      <button type="button" disabled={isFinancialsLocked} className="gift-btn !px-1.5" onClick={() => {
                        const newItems = [...cartItems];
                        newItems[idx].isFree = !newItems[idx].isFree;
                        newItems[idx].lineTotal = newItems[idx].isFree ? 0 : newItems[idx].qty * newItems[idx].unitPrice;
                        setCartItems(newItems);
                      }}><Gift className="w-3.5 h-3.5" /></button>
                      <button type="button" disabled={isFinancialsLocked} className="remove-btn !px-1.5" onClick={() => {
                        const newItems = [...cartItems];
                        newItems.splice(idx, 1);
                        setCartItems(newItems);
                      }}><Trash className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="kbi-so-summary-block">
              <div className="kbi-so-summary-row"><span>Subtotal</span><span className="val">{formatNTD(cartSubtotal)}</span></div>
              <div className="kbi-so-summary-row" style={{ color: '#ec003f' }}>
                <span>Diskon Potongan (TWD)</span>
                <input
                  type="number"
                  step="any"
                  disabled={isFinancialsLocked}
                  placeholder="0"
                  value={discountInput === '0' ? '' : discountInput}
                  onChange={(e) => {
                    setIsEditingGrandTotal(false);
                    setDiscountInput(e.target.value);
                  }}
                  className="kbi-so-ledger-input font-numeric kbi-so-diskon-input"
                  style={{ color: '#ec003f' }}
                />
              </div>
              <div className="kbi-so-summary-row" style={{ color: '#d97706' }}>
                <span>Biaya Platform</span>
                <input
                  type="number"
                  step="any"
                  disabled={isFinancialsLocked}
                  placeholder="0"
                  value={platformFeeInput === '0' ? '' : platformFeeInput}
                  onChange={(e) => {
                    setPlatformFeeInput(e.target.value);
                  }}
                  className="kbi-so-ledger-input font-numeric kbi-so-diskon-input"
                  style={{ color: '#d97706' }}
                />
              </div>
              {buyerType === 'reseller' && selectedPartner && (
                <div className="kbi-so-summary-row" style={{ color: '#6B4C9A', fontWeight: 600 }}>
                  <span>Estimasi Komisi Partner</span>
                  <span className="val">{formatNTD((cartTotalPrice * selectedPartner.profitSharePercent) / 100)} ({selectedPartner.profitSharePercent}%)</span>
                </div>
              )}
              <div className="kbi-so-grand-total-row">
                <span className="kbi-so-grand-total-label">Grand Total (TWD)</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#2B5A9E] dark:text-[#818cf8]">NT$</span>
                  <input
                    type="number"
                    step="any"
                    disabled={isFinancialsLocked}
                    value={isEditingGrandTotal ? grandTotalInput : (cartTotalPrice / 100)}
                    onFocus={() => {
                      setIsEditingGrandTotal(true);
                      setGrandTotalInput(String(cartTotalPrice / 100));
                    }}
                    onBlur={() => setIsEditingGrandTotal(false)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGrandTotalInput(val);
                      setIsEditingGrandTotal(true);
                      const cleanVal = cleanCommas(val);
                      if (cleanVal.trim() === '') {
                        setDiscountInput(String(cartSubtotal / 100));
                      } else {
                        const parsedGt = parseFloat(cleanVal);
                        if (!isNaN(parsedGt)) {
                          const subtotalTwd = cartSubtotal / 100;
                          const calcDiscount = Math.max(0, subtotalTwd - parsedGt);
                          setDiscountInput(String(Math.round(calcDiscount * 100) / 100));
                        }
                      }
                    }}
                    className="kbi-so-ledger-input font-numeric kbi-so-grand-total-input text-right font-extrabold text-lg text-[#2B5A9E] dark:text-[#818cf8] bg-transparent border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-0.5 focus:outline-hidden focus:ring-1 focus:ring-[#2B5A9E]"
                    style={{ width: '120px' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Backorder Banner */}
        {cartItems.some(it => {
          const stok = getCurrentKontrolStokForBook(it.bookId, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords);
          return it.qty > stok;
        }) && (
            <div className="kbi-so-backorder-banner">
              <div className="kbi-so-backorder-banner-left">
                <AlertCircle className="w-[18px] h-[18px]" />
                <div>
                  <div className="kbi-so-backorder-banner-title">Beberapa buku butuh PO tambahan setelah order ini disimpan</div>
                </div>
              </div>
            </div>
          )}

        <div className="kbi-so-card-footer">
          <button
            disabled={isOrderSubmitting}
            className="kbi-so-btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => { setIsNewOrderOpen(false); setEditingOrder(null); resetOrderForm(); }}
          >
            Batal
          </button>

          {canEditMetadata ? (
            <button
              disabled={isOrderSubmitting}
              className="kbi-so-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              onClick={(e) => handleOrderSubmit(e)}
            >
              {isOrderSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin inline-block" />
                  <span>Sedang Diproses...</span>
                </>
              ) : (
                'Simpan Perubahan Metadata'
              )}
            </button>
          ) : !isLockedOrder ? (
            <>
              <button
                disabled={isOrderSubmitting}
                className="kbi-so-btn-outline disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                onClick={(e) => handleOrderSubmit(e, { isDraft: true })}
              >
                {isOrderSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin inline-block" />
                    <span>Sedang Diproses...</span>
                  </>
                ) : (
                  'Simpan Draft'
                )}
              </button>
              <button
                disabled={isOrderSubmitting}
                className="kbi-so-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                onClick={(e) => handleOrderSubmit(e, { isDraft: false })}
              >
                {isOrderSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin inline-block" />
                    <span>Sedang Diproses...</span>
                  </>
                ) : (
                  'Konfirmasi Order'
                )}
              </button>
            </>
          ) : null}
        </div>
      </NewOrderModalWrapper>

      {/* Category Change Confirmation Overlay — rendered via portal so it always
          floats above the order-form portal (kbi-so-overlay z-index 40). */}
      {categoryChangeConfirm && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCategoryChangeConfirm(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-[200]')}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[90%] max-w-md overflow-hidden animate-scaleIn p-6 space-y-4 my-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 dark:text-neutral-100 text-base">Konfirmasi Perubahan Kategori Order</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Perubahan ini akan menyesuaikan form pilihan platform & pengiriman.</p>
              </div>
            </div>

            <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 text-xs text-neutral-700 dark:text-neutral-300 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-500">Kategori Saat Ini:</span>
                <span className="px-2 py-0.5 rounded font-bold bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200">
                  {categoryChangeConfirm.currentCategory === 'marketplace' ? 'Marketplace' : categoryChangeConfirm.currentCategory === 'reseller' ? 'Reseller Order' : 'Direct Order'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-500">Kategori Baru:</span>
                <span className="px-2 py-0.5 rounded font-bold bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300">
                  {categoryChangeConfirm.targetCategory === 'marketplace' ? 'Marketplace' : categoryChangeConfirm.targetCategory === 'reseller' ? 'Reseller Order' : 'Direct Order'}
                </span>
              </div>
              <p className="pt-1 text-neutral-600 dark:text-neutral-350 text-[11.5px] leading-relaxed">
                {categoryChangeConfirm.targetCategory === 'marketplace'
                  ? 'Format input akan disesuaikan untuk Marketplace (pilihan platform marketplace & nomor pesanan marketplace).'
                  : categoryChangeConfirm.targetCategory === 'reseller'
                    ? 'Format input akan disesuaikan untuk Reseller Order (pilih mitra reseller & skema komisi).'
                    : 'Format input akan disesuaikan untuk Direct Order (pilihan akun sosial media / platform & saluran order).'}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs font-text">
              <button
                type="button"
                onClick={() => setCategoryChangeConfirm(null)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-neutral-600 dark:text-neutral-350 font-bold cursor-pointer transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => applyBuyerTypeChange(categoryChangeConfirm.targetCategory)}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-700 rounded-xl text-white font-bold cursor-pointer transition shadow-sm"
              >
                Ya, Ubah Kategori
              </button>
            </div>
          </div>
        </div>
        , document.body)}

      {/* Revert Status Confirmation Overlay */}
      {revertConfirmState && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setRevertConfirmState(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-55')}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[90%] max-w-sm overflow-hidden animate-scaleIn p-5 space-y-4 my-auto">
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
              <RefreshCw className="h-5 w-5" />
              <h3 className="font-bold text-neutral-800 dark:text-neutral-100">Konfirmasi Balik Status</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-350 leading-relaxed font-semibold">
              {revertConfirmState.message}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs font-text">
              <button
                onClick={() => setRevertConfirmState(null)}
                className="px-3.5 py-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-350 font-bold cursor-pointer transition"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  try {
                    await revertConfirmState.onConfirm();
                  } catch (err: any) {
                    console.error("Gagal melakukan aksi:", err);
                  } finally {
                    setRevertConfirmState(null);
                  }
                }}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 rounded-lg text-white font-bold cursor-pointer transition shadow-sm"
              >
                Ya, Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Config Confirmation Overlay */}
      {deleteConfigState && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteConfigState(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-[60]')}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[90%] max-w-sm overflow-hidden animate-scaleIn p-5 space-y-4 my-auto">
            <div className="flex items-center gap-2 text-rose-650 dark:text-rose-400">
              <Trash2 className="h-5 w-5" />
              <h3 className="font-bold text-neutral-800 dark:text-neutral-100">
                Konfirmasi Hapus
              </h3>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-350 leading-relaxed font-semibold">
              {deleteConfigState.type === 'individual'
                ? `Hapus ${deleteConfigState.itemName}? Tindakan ini tidak dapat dibatalkan.`
                : `Hapus semua ${deleteConfigState.tab === 'channel' ? 'Channel' : 'Sumber Campaign'}? Semua data akan dihapus permanen.`}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs font-text">
              <button
                onClick={() => setDeleteConfigState(null)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-350 font-bold cursor-pointer transition select-none"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  try {
                    if (deleteConfigState.type === 'individual') {
                      await handleDeleteConfig(
                        deleteConfigState.tab,
                        deleteConfigState.itemId!,
                        deleteConfigState.itemName!,
                        true
                      );
                    } else {
                      await handleClearAllConfig(deleteConfigState.tab, true);
                    }
                  } catch (err: any) {
                    console.error("Gagal melakukan aksi hapus:", err);
                  } finally {
                    setDeleteConfigState(null);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 rounded-lg text-white font-bold cursor-pointer transition shadow-sm select-none"
              >
                {deleteConfigState.type === 'individual' ? 'Hapus' : 'Hapus Semua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Sistem Konfigurasi Modal */}
      {/* Import Modal */}
      {isImportModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsImportModalOpen(false);
              setSelectedFile(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-[60]')}
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-[92%] max-w-lg overflow-hidden my-auto">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                <Upload className="h-5 w-5 text-indigo-600 animate-pulse" />
                Impor Orderan via Excel / CSV
              </h3>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setSelectedFile(null);
                }}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Gunakan fitur ini untuk menambah data orderan baru secara bulk dari file Excel (.xlsx) atau CSV (.csv).
              </p>

              {/* Template Download Section */}
              <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-4 border border-indigo-100 dark:border-indigo-900/30 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-indigo-950 dark:text-indigo-300">Format Template Excel</h4>
                  <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80 mt-0.5">Unduh template 3 tab (Marketplace, Direct, Reseller).</p>
                </div>
                <button
                  onClick={downloadExcelTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Template Excel
                </button>
              </div>

              {/* File Upload Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase">Pilih File Excel / CSV</label>
                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer hover:border-indigo-500 ${selectedFile ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/5' : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                  onClick={() => document.getElementById('sales-csv-file-input')?.click()}
                >
                  <FileSpreadsheet className="h-8 w-8 text-neutral-450 mx-auto mb-2" />
                  {selectedFile ? (
                    <div className="text-sm font-medium text-neutral-850 dark:text-neutral-200">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                      Klik untuk memilih file Excel (.xlsx) atau CSV (.csv)
                    </div>
                  )}
                  <input
                    id="sales-csv-file-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setSelectedFile(null);
                }}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-750 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm font-semibold rounded-lg transition"
              >
                Batal
              </button>
              <button
                disabled={!selectedFile}
                onClick={handleProcessCSVImport}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-800 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-sm transition"
              >
                Mulai Impor
              </button>
            </div>
          </div>
        </div>
      )}

      {isManageConfigOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsManageConfigOpen(false);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col my-auto max-w-[92vw] max-h-[92vh]" style={{ width: '544px', height: '659px' }}>
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Settings className="h-5 w-5 text-brand-500" />
                <h3 className="text-lg font-bold text-neutral-850 dark:text-neutral-100">
                  Manage Sistem Konfigurasi
                </h3>
              </div>
              <button
                onClick={() => setIsManageConfigOpen(false)}
                className="text-neutral-400 hover:text-neutral-305 hover:bg-neutral-50 dark:hover:bg-neutral-800 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex overflow-x-auto scrollbar-none whitespace-nowrap border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 animate-fadeIn flex-shrink-0">
              <button
                onClick={() => {
                  setManageActiveTab('channel');
                  setConfigInputVal('');
                  setEditingConfigId(null);
                }}
                className={`flex-shrink-0 px-4 py-3 text-center text-sm font-bold border-b-2 transition select-none cursor-pointer ${manageActiveTab === 'channel'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-350'
                  }`}
              >
                Channel
              </button>
              <button
                onClick={() => {
                  setManageActiveTab('platform');
                  setConfigInputVal('');
                  setEditingConfigId(null);
                }}
                className={`flex-shrink-0 px-4 py-3 text-center text-sm font-bold border-b-2 transition select-none cursor-pointer ${manageActiveTab === 'platform'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-350'
                  }`}
              >
                Platform Order
              </button>
              <button
                onClick={() => {
                  setManageActiveTab('type');
                  setConfigInputVal('');
                  setEditingConfigId(null);
                }}
                className={`flex-shrink-0 px-4 py-3 text-center text-sm font-bold border-b-2 transition select-none cursor-pointer ${manageActiveTab === 'type'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-350'
                  }`}
              >
                Sumber Campaign
              </button>
              <button
                onClick={() => {
                  setManageActiveTab('logistik');
                  setConfigInputVal('');
                  setEditingConfigId(null);
                }}
                className={`flex-shrink-0 px-4 py-3 text-center text-sm font-bold border-b-2 transition select-none cursor-pointer ${manageActiveTab === 'logistik'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-350'
                  }`}
              >
                Opsi Pengiriman
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Add Input field */}
              <div className="space-y-1.5">
                <label className="block text-xs capitalize font-bold text-neutral-500">
                  TAMBAH BARU ({activeTabLabel})
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={activeTabPlaceholder}
                    value={configInputVal}
                    onChange={(e) => setConfigInputVal(e.target.value)}
                    className={`flex-1 px-3.5 py-2 border rounded-lg text-sm bg-white dark:bg-neutral-950 text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all ${shakeFields['configInput']
                      ? 'border-red-500 ring-1 ring-red-500 animate-shake bg-red-50/20 dark:bg-red-950/20'
                      : 'border-neutral-300 dark:border-neutral-700'
                      }`}
                  />

                  {manageActiveTab === 'platform' && (
                    <div className="flex items-center gap-2 shrink-0 bg-white dark:bg-neutral-950 px-3 py-1.5 border border-neutral-200 dark:border-neutral-800 rounded-lg">
                      <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Ongkos Kirim:</span>
                      <button
                        type="button"
                        onClick={() => setNewPlatformOngkosKirim(!newPlatformOngkosKirim)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${newPlatformOngkosKirim ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700'
                          }`}
                        title={`Toggle Ongkos Kirim: ${newPlatformOngkosKirim ? 'ON' : 'OFF'}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${newPlatformOngkosKirim ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                      </button>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${newPlatformOngkosKirim
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                        }`}>
                        {newPlatformOngkosKirim ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => handleAddConfig(manageActiveTab, configInputVal)}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-lg shadow-xs transition cursor-pointer select-none"
                  >
                    Tambah
                  </button>
                </div>
              </div>

              {/* List Container */}
              <div className="space-y-2 flex flex-col flex-1">
                <div className="flex items-center justify-between flex-shrink-0">
                  <span className="block text-xs capitalize font-bold text-neutral-500">
                    LIST AKTIF / TERDAFTAR
                  </span>
                  <div className="flex items-center gap-2">
                    {currentManageList.length > 0 && (
                      <button
                        onClick={() => {
                          setDeleteConfigState({
                            type: 'all',
                            tab: manageActiveTab
                          });
                        }}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-450 dark:hover:text-rose-400 hover:underline transition select-none cursor-pointer flex items-center gap-1 bg-transparent border-0"
                        title={`Hapus semua list ${activeTabLabel}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        Hapus Semua
                      </button>
                    )}
                    <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded font-bold text-neutral-500">
                      {currentManageList.length} item
                    </span>
                  </div>
                </div>

                <div className="border border-neutral-150 dark:border-neutral-800 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800 flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950 min-h-[220px]">
                  {currentManageList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-neutral-400">
                      Belum ada konfigurasi terdaftar.
                    </div>
                  ) : (
                    currentManageList.map((item, index) => (
                      <div
                        key={`${item.id || item.name}-${index}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 flex items-center justify-between gap-3 text-sm transition-all select-none ${draggedIndex === index
                          ? 'opacity-40 bg-neutral-100 dark:bg-neutral-800 border-2 border-dashed border-brand-300'
                          : 'hover:bg-neutral-100/50 dark:hover:bg-neutral-800/30'
                          }`}
                      >
                        {editingConfigId === item.id ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <input
                              type="text"
                              className={`flex-1 px-2.5 py-1 text-xs border bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-brand-500 ${shakeFields[`editConfig_${item.id}`]
                                ? 'border-red-500 ring-1 ring-red-500 animate-shake'
                                : 'border-neutral-300 dark:border-neutral-700'
                                }`}
                              value={editingConfigVal}
                              onChange={(e) => setEditingConfigVal(e.target.value)}
                            />
                            <button
                              onClick={() => handleEditConfig(manageActiveTab, item.id, item.name, editingConfigVal)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/25 rounded cursor-pointer transition"
                              title="Simpan"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => { setEditingConfigId(null); setEditingConfigVal(''); }}
                              className="p-1.5 text-neutral-400 hover:text-neutral-505 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded cursor-pointer transition"
                              title="Batal"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5 flex-1 overflow-hidden">
                              <div
                                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition cursor-grab active:cursor-grabbing p-1"
                                title="Tarik untuk mengurutkan"
                              >
                                <Menu className="h-4 w-4" />
                              </div>
                              <span className="font-semibold text-neutral-750 dark:text-neutral-250 truncate">
                                {item.name}
                              </span>
                            </div>

                            {manageActiveTab === 'platform' && (() => {
                              const isOngkirEnabled = item.ongkosKirim ?? platformAutoConfig[item.name]?.enabled ?? false;
                              return (
                                <div className="flex items-center gap-2 shrink-0 mr-2">
                                  <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                                    Ongkos Kirim:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePlatformOngkosKirim(item)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isOngkirEnabled ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700'
                                      }`}
                                    title={`Ongkos Kirim untuk ${item.name}: ${isOngkirEnabled ? 'ON' : 'OFF'}`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isOngkirEnabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                  </button>
                                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${isOngkirEnabled
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                                    }`}>
                                    {isOngkirEnabled ? 'ON' : 'OFF'}
                                  </span>
                                </div>
                              );
                            })()}

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setEditingConfigId(item.id);
                                  setEditingConfigVal(item.name);
                                }}
                                className="p-1.5 text-neutral-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition"
                                title="Ubah Nama"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteItem(e, item.id)}
                                className="z-50 relative p-2 text-red-650 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition"
                                title="Hapus"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setIsManageConfigOpen(false)}
                className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-bold text-sm rounded-lg shadow-xs transition select-none cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SALES ORDER DETAIL MODAL */}
      {viewingOrderDetail && !isTabletTier && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewingOrderDetail(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="kbi-rincian-modal animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            {renderOrderDetail(viewingOrderDetail)}
          </div>
        </div>
      )}

      {isChecklistOpen && <PackingChecklist onClose={() => setIsChecklistOpen(false)} salesOrders={orders} books={books} />}
      <BookRecommendationsModal
        isOpen={!!recoOrderData}
        onClose={() => setRecoOrderData(null)}
        referenceBookIds={recoOrderData?.bookIds || []}
        referenceCategories={recoOrderData?.categories || []}
        books={books}
        inventories={inventories}
      />
      <ImagePreviewModal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageUrl={previewImage?.url || ''}
        title={previewImage?.title}
      />
      {isBulkProcessOpen && (
        <BulkProcessModal
          isOpen={isBulkProcessOpen}
          onClose={() => setIsBulkProcessOpen(false)}
          menungguOrders={orders.filter(o => o.status === 'packed')}
          inventories={inventories}
          ledgerEntries={ledgerEntries}
          purchaseOrders={purchaseOrders}
          salesOrders={orders}
          damagedRecords={damagedRecords}
          books={books}
        />
      )}

      {/* ================= MODAL: Konfirmasi Customer Pre-Kemas ================= */}
      {confirmingCustomerPreKemasOrder && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmingCustomerPreKemasOrder(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-[90%] p-5 space-y-4 animate-scale-up my-auto" onClick={e => e.stopPropagation()}>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">Apakah udah di konfirmasi ke Customer ?</h3>
              <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-3 text-left space-y-2 bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-500">Kategori:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100 capitalize">{confirmingCustomerPreKemasOrder.buyerType || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-500">Sumber Order:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">{confirmingCustomerPreKemasOrder.platformChannel || confirmingCustomerPreKemasOrder.platformOrder || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-500">Nomor Order:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">{confirmingCustomerPreKemasOrder.orderNumber || confirmingCustomerPreKemasOrder.orderCode}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingCustomerPreKemasOrder(null)}
                className="flex-1 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-xl transition cursor-pointer"
              >
                Belum
              </button>
              <button
                type="button"
                onClick={() => {
                  const ord = confirmingCustomerPreKemasOrder;
                  if (ord && isShippingDateFuture(ord.estimatedShippingDate)) {
                    safeAlert(`Belum Waktunya Untuk Dikemas, Request Customer Adalah ${ord.estimatedShippingDate?.replace(/-/g, '/')}`);
                    setConfirmingCustomerPreKemasOrder(null);
                    return;
                  }
                  setConfirmingCustomerPreKemasOrder(null);
                  setConfirmingKemasOrder(ord);
                }}
                className="flex-1 py-2 text-xs font-bold text-white bg-[#6366f1] hover:bg-[#4f46e5] rounded-xl shadow-xs transition cursor-pointer"
              >
                Sudah
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Konfirmasi Kemas Orderan ================= */}
      {confirmingKemasOrder && (() => {
        const insufficientKemasItems: { name: string; stock: number; needed: number }[] = [];
        for (const item of confirmingKemasOrder.items || []) {
          if (item.markedTertinggal || item.markedRefund) continue;
          const available = getPhysicalOnHandStockForBook(item.bookId, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords);
          if (available < item.qty) {
            insufficientKemasItems.push({ name: item.bookName, stock: available, needed: item.qty });
          }
        }
        const hasStockError = insufficientKemasItems.length > 0;

        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !isKemasSubmitting) {
                setConfirmingKemasOrder(null);
              }
            }}
            className={getModalOverlayClass(sidebarHidden, 'z-50')}
          >
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-[90%] p-5 space-y-4 animate-scale-up my-auto" onClick={e => e.stopPropagation()}>
              <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <Package className="h-6 w-6" />
              </div>

              <div className="text-center">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">Tandai Sudah Dikemas?</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Konfirmasi bahwa barang untuk orderan <strong className="text-neutral-800 dark:text-neutral-200">{confirmingKemasOrder.orderCode}</strong> ({confirmingKemasOrder.customerName || 'Tanpa Nama'}) telah selesai dikemas.
                </p>
              </div>

              {hasStockError && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-200 text-left space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Stok Gudang Tidak Mencukupi:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1 font-medium">
                    {insufficientKemasItems.map((it, idx) => (
                      <li key={idx}>
                        {it.name}: Stok <strong>{it.stock}</strong>, Dibutuhkan <strong>{it.needed}</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10.5px] text-amber-600 dark:text-amber-400 pt-0.5">
                    Proses pengemasan tidak dapat dilanjutkan sebelum stok gudang tersedia.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isKemasSubmitting}
                  onClick={() => setConfirmingKemasOrder(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                {(confirmingKemasOrder.items?.length || 0) > 1 && (
                  <button
                    type="button"
                    disabled={isKemasSubmitting}
                    onClick={() => {
                      const ord = confirmingKemasOrder;
                      setConfirmingKemasOrder(null);
                      handleOpenSplitOrderModal(ord);
                    }}
                    className="px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 rounded-xl border border-indigo-200 dark:border-indigo-800 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <GitFork className="h-3.5 w-3.5" />
                    <span>Kirim Sebagian</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isKemasSubmitting || hasStockError}
                  onClick={handleConfirmKemas}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#6366f1] hover:bg-[#4f46e5] rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isKemasSubmitting && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>Konfirmasi Kemas</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL: Konfirmasi Hapus Orderan ================= */}
      {selectedOrderForDelete && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleteOrderSubmitting) {
              setSelectedOrderForDelete(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-[90%] p-5 space-y-4 animate-scale-up my-auto" onClick={e => e.stopPropagation()}>
            <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="h-6 w-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">Hapus Orderan?</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Apakah Anda yakin ingin menghapus orderan <strong className="text-neutral-800 dark:text-neutral-200">{selectedOrderForDelete.orderCode}</strong> ({selectedOrderForDelete.customerName || 'Tanpa Nama'})?
              </p>
              <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-2 font-medium">
                Tindakan ini tidak dapat dibatalkan dan data orderan akan dihapus secara permanen dari sistem.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleteOrderSubmitting}
                onClick={() => setSelectedOrderForDelete(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleteOrderSubmitting}
                onClick={handleConfirmDeleteOrder}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleteOrderSubmitting && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Hapus Orderan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: 2D QR Code Nomor Resi ================= */}
      {qrCodeModalOrder && (() => {
        const resi = (qrCodeModalOrder.shipment?.shippingNumber || (qrCodeModalOrder as any).shippingNumber || '').trim();
        return (
          <QrCodeModal
            order={qrCodeModalOrder}
            resi={resi}
            onClose={() => setQrCodeModalOrder(null)}
            sidebarHidden={sidebarHidden}
          />
        );
      })()}

      {/* ================= MODAL: Konfirmasi Perubahan Metode Bayar ================= */}
      {showPaymentChangeConfirmModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancelPaymentMethodChange();
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-[100]')}
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-[90%] p-5 space-y-4 animate-scale-up my-auto" onClick={e => e.stopPropagation()}>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">Perubahan Metode Bayar</h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-2 leading-relaxed">
                Apakah Anda yakin ingin mengubah Metode Bayar?
                <br />
                Jika diganti, maka isi <strong className="font-bold text-blue-600 dark:text-blue-400">Platform Order</strong> dan <strong className="font-bold text-blue-600 dark:text-blue-400">Nomor Order</strong> akan terhapus.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancelPaymentMethodChange}
                className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentMethodChange}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Opsi Kirim / Split Order ================= */}
      {splitOrderModalData && (() => {
        const keptItems = (splitOrderModalData.items || []).filter(i => !selectedSplitBookIds.includes(i.bookId));
        const splitItems = (splitOrderModalData.items || []).filter(i => selectedSplitBookIds.includes(i.bookId));

        const keptTotal = keptItems.reduce((sum, i) => sum + i.lineTotal, 0);
        const splitTotal = splitItems.reduce((sum, i) => sum + i.lineTotal, 0);

        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSplitSubmitting) {
                setSplitOrderModalData(null);
              }
            }}
            className={getModalOverlayClass(sidebarHidden, 'z-50')}
          >
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-lg w-[92%] p-6 space-y-5 animate-scale-up my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                    <GitFork className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">Opsi Kirim — Kirim Sebagian</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      SO <strong className="text-neutral-800 dark:text-neutral-200">{splitOrderModalData.orderCode}</strong> ({splitOrderModalData.customerName || 'Tanpa Nama'})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitOrderModalData(null)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Pilih barang yang <strong>belum ready / tertinggal</strong> untuk dipindahkan ke <strong>Sales Order Baru</strong> (status Draft).
                Barang yang centang dibuka akan <strong>tetap dikirim sekarang</strong> di SO awal ini.
              </div>

              {/* Items checklist */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Daftar Barang Transaksi ({splitOrderModalData.items?.length || 0} item)
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                  {splitOrderModalData.items?.map((item) => {
                    const isSplit = selectedSplitBookIds.includes(item.bookId);
                    const isOrderAlreadyDeducted = splitOrderModalData.status === 'packed' || splitOrderModalData.status === 'shipped' || splitOrderModalData.status === 'confirmed' || splitOrderModalData.status === 'completed';
                    const physical = getPhysicalOnHandStockForBook(item.bookId, inventories, ledgerEntries, purchaseOrders, orders, damagedRecords);
                    const avail = isOrderAlreadyDeducted ? physical + item.qty : physical;
                    const isSufficient = avail >= item.qty;

                    return (
                      <div key={item.bookId} className={`p-3.5 flex items-center gap-3 transition ${isSplit ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'bg-white dark:bg-neutral-900'}`}>
                        <input
                          type="checkbox"
                          id={`split-chk-${item.bookId}`}
                          checked={isSplit}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSplitBookIds([...selectedSplitBookIds, item.bookId]);
                            } else {
                              setSelectedSplitBookIds(selectedSplitBookIds.filter(id => id !== item.bookId));
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 rounded border-neutral-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <label htmlFor={`split-chk-${item.bookId}`} className="text-xs font-semibold text-neutral-900 dark:text-white cursor-pointer block truncate">
                            {item.bookName}
                          </label>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-2">
                            <span>{item.qty} Pcs × {formatNTD(item.unitPrice)}</span>
                            <span>•</span>
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{formatNTD(item.lineTotal)}</span>
                          </div>
                        </div>

                        <div>
                          {isSufficient ? (
                            <span className="px-2 py-0.5 text-[10.5px] font-semibold rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              Ready ({avail})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10.5px] font-semibold rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              Stok {avail} / {item.qty}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Breakdown summary */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
                <div className="space-y-1">
                  <div className="font-semibold text-neutral-600 dark:text-neutral-400">Dikirim Sekarang (SO Awal):</div>
                  <div className="text-neutral-900 dark:text-white font-bold">{keptItems.length} item ({formatNTD(keptTotal)})</div>
                </div>
                <div className="space-y-1 border-l border-neutral-200 dark:border-neutral-700 pl-3">
                  <div className="font-semibold text-amber-700 dark:text-amber-400">Pindah ke SO Baru (Tertinggal):</div>
                  <div className="text-amber-900 dark:text-amber-200 font-bold">{splitItems.length} item ({formatNTD(splitTotal)})</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  disabled={isSplitSubmitting}
                  onClick={() => setSplitOrderModalData(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSplitSubmitting || selectedSplitBookIds.length === 0 || selectedSplitBookIds.length === splitOrderModalData.items.length}
                  onClick={handleConfirmSplitOrder}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSplitSubmitting && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>Proses Split & Kirim Sebagian</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL: Marketplace Refund ================= */}
      {refundConfirmOrder && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRefundSubmitting) {
              setRefundConfirmOrder(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-md w-[90%] p-6 space-y-4 animate-scale-up my-auto" onClick={e => e.stopPropagation()}>
            <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">Proses Refund Marketplace?</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                SO <strong className="text-neutral-800 dark:text-neutral-200">{refundConfirmOrder.orderCode}</strong> ({refundConfirmOrder.customerName || 'Tanpa Nama'})
              </p>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs space-y-2 text-neutral-700 dark:text-neutral-300">
              <p>
                Sistem akan memposting Jurnal Otomatis{canViewAmount && <> sebesar <strong className="text-rose-600 dark:text-rose-400">{formatNTD(refundConfirmOrder.totalPrice)}</strong></>}:
              </p>
              <div className="font-mono text-[11px] bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1">
                <div className="text-emerald-700 dark:text-emerald-400">Debit: 5500 Beban Lain-lain</div>
                <div className="text-rose-700 dark:text-rose-400 pl-4">Kredit: 1110 Piutang Usaha</div>
              </div>
              <p className="text-[11px] text-neutral-500">
                Status order akan diubah menjadi Dibatalkan / Refunded. Action ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isRefundSubmitting}
                onClick={() => setRefundConfirmOrder(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isRefundSubmitting}
                onClick={handleConfirmMarketplaceRefund}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isRefundSubmitting && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Konfirmasi Refund Marketplace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile: floating "new order" + overflow sheet ────────────────────
          The masthead's six actions do not fit on a phone. The primary one
          moves to a thumb-reachable floating button; the rest live in a sheet.
          Every control calls the same handler the toolbar button calls.

          Both are portalled to <body>. `.kbi-main > *` carries a transform
          entrance animation, and Chromium keeps such an element as the
          containing block for its fixed-position descendants even after the
          animation completes — inside the tree these would be positioned
          against the tab wrapper instead of the viewport, landing ~500px below
          the fold. Portalling is the only reliable escape. */}
      {isStaffValue && createPortal(
        <button
          type="button"
          className="kbi-sofab md:hidden"
          onClick={openNewOrder}
          aria-label="Orderan baru"
        >
          <Plus className="w-6 h-6" />
        </button>,
        document.body,
      )}

      {isStaffValue && isSalesActionsOpen && createPortal(
        <div
          className="md:hidden kbi-msheet-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="Aksi Sales Orders"
          onClick={(e) => { if (e.target === e.currentTarget) setIsSalesActionsOpen(false); }}
        >
          <div className="kbi-msheet">
            <div className="kbi-msheet__grip"><span /></div>
            <div className="kbi-msheet__head">
              <div className="kbi-msheet__headrow">
                <div>
                  <h2 className="kbi-msheet__title">Aksi Lainnya</h2>
                  <p className="kbi-msheet__sub">Sales Orders</p>
                </div>
                <button
                  type="button"
                  className="kbi-msheet__close"
                  onClick={() => setIsSalesActionsOpen(false)}
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="kbi-msheet__body">
              {[
                { icon: Settings, label: 'Manage Konfigurasi', hint: 'Channel, platform, logistik', run: () => setIsManageConfigOpen(true), show: true },
                { icon: Check, label: 'Checklist Packing', hint: 'Daftar pesanan untuk dikemas', run: () => setIsChecklistOpen(true), show: true },
                { icon: SlidersHorizontal, label: 'Proses Massal', hint: 'Input resi banyak sekaligus', run: () => setIsBulkProcessOpen(true), show: hasPerm('sales.prosesMassal') },
                { icon: Upload, label: 'Import Excel / CSV', hint: 'Unggah orderan dari berkas', run: () => setIsImportModalOpen(true), show: true },
                { icon: Download, label: 'Export CSV', hint: 'Unduh orderan terfilter', run: () => exportSalesToCSV(), show: true },
              ].filter(a => a.show).map(({ icon: Icon, label, hint, run }) => (
                <button
                  key={label}
                  type="button"
                  className="kbi-sosheet__row"
                  onClick={() => { setIsSalesActionsOpen(false); run(); }}
                >
                  <span className="kbi-sosheet__icon"><Icon className="w-[18px] h-[18px]" /></span>
                  <span className="kbi-sosheet__text">
                    <span className="kbi-sosheet__label">{label}</span>
                    <span className="kbi-sosheet__hint">{hint}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 kbi-sosheet__chev" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
