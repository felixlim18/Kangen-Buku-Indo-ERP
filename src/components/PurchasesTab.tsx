import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { FALLBACK_NTD_PER_IDR, FALLBACK_NTD_PER_USD } from '../lib/exchangeRateConstants';
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  Timestamp,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { Book, PurchaseOrder } from '../types';
import { DateRangePicker } from './ui/DateRangePicker';
import { getNextJournalId } from '../lib/journalUtils';
import { generateSystemPoNumber, sanitizePurchaseOrders } from '../lib/db-helpers';
import { formatNTD, formatIDR, formatNumber, formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { useAuth } from '../lib/auth-context';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../lib/use-modal-esc';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  ensureAutoAccountExists,
  getInventoryAccount,
  getInventoryInTransitAccount,
  getFreightInAccount,
  getCashAccount,
  generateReceivingJournals,
  prepareReceiptEventData,
  writeReceiptEventAndJournal,
  findAccountBySystemKey
} from '../lib/journalAuto';

const ensureAccountExists = async (code: string, name: string, type: 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses', subType: string) => {
  const docRef = doc(db, 'coa', code);
  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        id: code,
        code,
        name,
        type,
        subType,
        isActive: true,
        createdAt: Timestamp.now()
      });
    }
  } catch (err) {
    console.error(`Failed to ensure account ${name} exists:`, err);
  }
};

import { Decimal } from 'decimal.js';
import { Eye, Pencil, ChevronLeft, Edit2, LayoutGrid, PackageCheck, Package, X, Check, Search, Calendar, ChevronDown, ChevronUp, Trash2, Printer, Plus } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

import { FileSpreadsheet, Download, Upload, CheckCircle2, BookOpen, Copy, Loader2, AlertTriangle, RefreshCw, RotateCcw, Scan, Truck, ChevronRight, AlertCircle, MessageSquareWarning, Barcode } from 'lucide-react';

const PriceMismatchBadge = ({ item, idx, pricingTiers, currentFXRate, selectedPlatform, catalogBook, onReviewAction }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // If item is already reviewed, show green check
  const isReviewed = !!item.priceReviewStatus;

  // Calculate Unit Price in IDR
  const qty = parseFloat(cleanCommas(item.qtyStr || '0')) || 0;
  if (qty <= 0) return null;

  let unitPriceIDR = 0;
  if (selectedPlatform?.currency === 'IDR') {
    const platTotal = parseFloat(cleanCommas(item.pricePlatformStr || '0')) || 0;
    unitPriceIDR = platTotal / qty;
  } else if (selectedPlatform?.currency === 'NTD') {
    const ntdTotal = parseFloat(cleanCommas(item.priceNTDStr || '0')) || 0;
    if (currentFXRate > 0) {
      unitPriceIDR = (ntdTotal / qty) / currentFXRate;
    }
  } else {
    return null; // Not IDR or NTD, cannot reliably check pricing
  }

  if (unitPriceIDR < pricingTiers[0]?.from || unitPriceIDR > pricingTiers[pricingTiers.length - 1]?.to) {
    return null; // Out of bounds
  }

  const expectedTier = pricingTiers.find((t: any) => unitPriceIDR >= t.from && unitPriceIDR <= t.to);
  if (!expectedTier) return null;

  const currentMkt = catalogBook?.shopeePrice || 0;
  const currentGen = catalogBook?.generalPrice || 0;

  const expectedMktCents = expectedTier.mkt * 100;
  const expectedGenCents = expectedTier.umum * 100;

  const mktDiff = expectedMktCents !== currentMkt;
  const genDiff = expectedGenCents !== currentGen;

  if (!mktDiff && !genDiff && !isReviewed) {
    return null; // No difference, and not reviewed, no icon needed
  }

  const formatLocalNTD = (cents: number) => {
    if (isNaN(cents) || cents === undefined || cents === null) cents = 0;
    const value = cents / 100;
    const formatted = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
    return (value < 0 ? '-' : '') + 'NT$' + formatted;
  };

  const toggleOpen = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      let left = rect.right + 12;
      let isLeftSided = false;

      // if not enough space on right, pop to the left
      if (left + 500 > viewportWidth) {
        left = rect.left - 500 - 12;
        isLeftSided = true;
      }

      setPopoverStyle({
        top: Math.max(16, rect.top - 20),
        left: left,
        ['--popover-direction' as any]: isLeftSided ? 'right' : 'left'
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative inline-block ml-2">
      <button 
        ref={buttonRef}
        type="button" 
        onClick={toggleOpen}
        className={`p-1.5 rounded-full transition-colors ${isReviewed ? 'text-[#2F7D5A] hover:bg-[#2F7D5A]/10' : 'text-[#A9442C] hover:bg-[#A9442C]/10'}`}
      >
        {isReviewed ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
      </button>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setIsOpen(false)} />
          <div 
            style={popoverStyle}
            className={`fixed w-[500px] bg-[#FCFBF8] border border-[#EAE4D7] shadow-xl rounded-2xl p-5 z-[9999] animate-in fade-in zoom-in-95 font-text flex flex-col gap-5`}
          >
            {/* The caret arrow */}
            <div 
              className="absolute w-4 h-4 bg-[#FCFBF8] border-b border-l border-[#EAE4D7] transform rotate-45"
              style={{
                top: '26px',
                ...(popoverStyle['--popover-direction' as any] === 'right' 
                  ? { right: '-8px', borderLeft: 'none', borderBottom: 'none', borderRight: '1px solid #EAE4D7', borderTop: '1px solid #EAE4D7' }
                  : { left: '-8px' }
                )
              }}
            />

            <div className="flex gap-4 items-start relative z-10">
              <div className="flex-1">
                <div className="flex items-start gap-1.5 text-[#A9442C]">
                  <AlertTriangle className="w-[18px] h-[18px] mt-[2px] shrink-0" strokeWidth={2.5} />
                  <div className="font-bold text-[13px] leading-[1.1] tracking-tight uppercase">Selisih Harga<br/>Terdeteksi</div>
                </div>
              </div>
              <div className="flex-[1.5] pt-[2px]">
                <h4 className="font-serif font-bold text-[16px] text-[#212121] leading-snug">{item.bookName}</h4>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 relative z-10">
              <div className="bg-[#FDFBF7] border border-[#EAE4D7] rounded-xl p-4">
                <p className="text-[10px] uppercase font-bold tracking-widest text-[#8A7A6D] mb-3">Berdasarkan Katalog</p>
                
                <div className="space-y-3">
                  <div>
                    <div className="text-[13px] text-[#8A7A6D] mb-0.5">Marketplace</div>
                    <div className="font-numeric font-bold text-[#212121] text-[19px]">{formatLocalNTD(currentMkt)}</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-[#8A7A6D] mb-0.5">Umum</div>
                    <div className="font-numeric font-bold text-[#212121] text-[19px]">{formatLocalNTD(currentGen)}</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-[#FDFBF7] border border-[#EAE4D7] rounded-xl p-4">
                <p className="text-[10px] uppercase font-bold tracking-widest text-[#8A7A6D] mb-3">Berdasarkan Pembelian</p>
                
                <div className="space-y-3">
                  <div>
                    <div className="text-[13px] text-[#8A7A6D] mb-0.5">Marketplace</div>
                    <div className="font-numeric font-bold text-[#212121] text-[19px]">{formatLocalNTD(expectedMktCents)}</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-[#8A7A6D] mb-0.5">Umum</div>
                    <div className="font-numeric font-bold text-[#212121] text-[19px]">{formatLocalNTD(expectedGenCents)}</div>
                  </div>
                </div>
              </div>
            </div>

            {!isReviewed ? (
              <div className="flex gap-2 justify-end relative z-10 pt-1">
                <button 
                  type="button" 
                  onClick={() => { onReviewAction(idx, 'abaikan'); setIsOpen(false); }}
                  className="px-5 py-2 text-[14px] font-bold text-[#212121] bg-white border border-[#EAE4D7] hover:bg-[#F5F1E7] rounded-xl transition"
                >
                  Abaikan
                </button>
                <button 
                  type="button" 
                  onClick={() => { onReviewAction(idx, 'perbaikan'); setIsOpen(false); }}
                  className="px-5 py-2 text-[14px] font-bold text-white bg-[#7A3245] hover:bg-[#602534] rounded-xl transition shadow-sm"
                >
                  Konfirm & Tandai
                </button>
              </div>
            ) : (
              <div className="text-center py-2.5 bg-[#FDFBF7] rounded-xl text-xs text-[#8A7A6D] italic font-medium border border-[#EAE4D7] relative z-10">
                Telah ditandai: {item.priceReviewStatus === 'abaikan' ? 'Abaikan' : 'Perlu Perbaikan'}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export const PurchasesTab = () => {
  const { user, profile } = useAuth();
  const isStaffValue = profile?.role === "staff" || profile?.role === "owner";
  const hasPerm = (perm: string) => { if (profile?.role === "owner") return true; return profile?.permissions?.[perm] === true; };



  
  
  const html5QrCodeRef = useRef<any>(null);
  const [startDate, setStartDate] = useState<any>(null);
  const [endDate, setEndDate] = useState<any>(null);
  const pageSize = 50;
  const formatToHTMLDateImpl = (date: any) => {
    if (!date) return '';
    try {
      if (date instanceof Date) return date.toISOString().split('T')[0];
      if (date.seconds) return new Date(date.seconds * 1000).toISOString().split('T')[0];
      return new Date(date).toISOString().split('T')[0];
    } catch { return ''; }
  };
  const parsePoDateToString = (date: any) => formatToHTMLDateImpl(date);
  const convertStringToTimestamp = (str: any) => {
    if (!str) return Timestamp.now();
    try {
      const d = new Date(str);
      return Timestamp.fromDate(d);
    } catch { return Timestamp.now(); }
  };
  const [poPresetLabel, setPoPresetLabel] = useState('Semua');
  const [activeTab, setActiveTab] = useState('main');
  const setCsvPlatformId = (id: any) => {};
  const formatToHTMLDate = (date: any) => formatToHTMLDateImpl(date);
  const [trackingNumberInputs, setTrackingNumberInputs] = useState<any>({});
  const handleSaveTrackingNumber = async (po: any, val: any) => {};

  const [poStatusFilter, setPoStatusFilter] = useState('Semua');
  const [currentPage, setCurrentPage] = useState(1);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const [platformModalError, setPlatformModalError] = useState('');
  const [editingPlatformId, setEditingPlatformId] = useState<string|null>(null);
  const [platformNameInput, setPlatformNameInput] = useState('');
  const [platformCurrencyInput, setPlatformCurrencyInput] = useState('IDR');
  const [copiedPoId, setCopiedPoId] = useState<string | null>(null);
  const [hoveredPoId, setHoveredPoId] = useState<string | null>(null);
  
  const getPoFreightCodes = (po: any): string[] => [];
  const getPoFreightCostForCode = (po: any, code: any) => '-';
  const renderDualCurrency = (platAmt: any, ntdAmt: any, currency: any, class1: any, class2: any) => <span>{platAmt}</span>;
  const formatUSD = (val: any) => `${val}`;

  const [deletePlatformState, setDeletePlatformState] = useState<any>(null);
  const [isCsvUploadOpen, setIsCsvUploadOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [csvValidationResult, setCsvValidationResult] = useState<any>(null);
  const [addedItems, setAddedItems] = useState<any[]>([]);
  const [previewCoverIdx, setPreviewCoverIdx] = useState<number | null>(null);
  const [poDate, setPoDate] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [shakeFields, setShakeFields] = useState<Record<string, boolean>>({});
  const [poPaymentStatus, setPoPaymentStatus] = useState('');
  const [rateFetchStatus, setRateFetchStatus] = useState('');
  const [supplierOrderNumber, setSupplierOrderNumber] = useState('');
  const [supplierTrackingNumber, setSupplierTrackingNumber] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);
  



  const [poDiscount, setPoDiscount] = useState(0);
  const [actualReceiptTotal, setActualReceiptTotal] = useState(0);
  const [isPoViewOnly, setIsPoViewOnly] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string|null>(null);
  const sidebarHidden = false;
  const [isPoFreightDropdownOpen, setIsPoFreightDropdownOpen] = useState(false);
  const [showNoRemainingToast, setShowNoRemainingToast] = useState(false);
  const [revertConfirmState, setRevertConfirmState] = useState<any>(null);
  const [scanErrorToast, setScanErrorToast] = useState<string|null>(null);
  const [tempKodeEkspedisi, setTempKodeEkspedisi] = useState('');
  const [kodeEkspedisi, setKodeEkspedisi] = useState('');
  const [expandedScannedPoId, setExpandedScannedPoId] = useState<string|null>(null);
  const scanStepRef = useRef(1);
  const [bulkCameraFacingMode, setBulkCameraFacingMode] = useState('environment');
  const toggleBulkCameraFacingMode = () => setBulkCameraFacingMode(p => p === 'environment' ? 'user' : 'environment');
  const [bulkScanSearchQuery, setBulkScanSearchQuery] = useState('');

  const { collapsed: sidebarCollapsed } = useSidebar();
  
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [freightInList, setFreightInList] = useState<any[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);

  const getPendingFreightInRecords = () => {
    if (!freightInList || !Array.isArray(freightInList)) return [];
    return freightInList
      .map(f => ({
        ...f,
        freightCode: (f.freightCode || f.id || '').toString().trim().toUpperCase()
      }))
      .filter(f => f.freightCode && f.status !== 'Completed' && f.status !== 'Selesai' && f.status !== 'Capitalized' && !f.isCapitalized);
  };

  const getFreightStatus = (f: string) => {
    if (!f) return 'Pending';
    const clean = f.trim().toUpperCase();
    const rec = freightInList.find(item => (item.freightCode || item.id || '').toString().trim().toUpperCase() === clean);
    if (!rec) return 'Pending';
    return rec.status || (rec.isCapitalized ? 'Completed' : 'Pending');
  };

  const [scannedPos, setScannedPos] = useState<any[]>([]);
  const scannedPosRef = useRef<any[]>([]);
  const lastScannedTimeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  useEffect(() => {
    scannedPosRef.current = scannedPos;
  }, [scannedPos]);

  const playScanSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      // Audio context ignored if not active
    }
  };

  const handleProcessScannedCode = (rawCode: string) => {
    if (!rawCode || !rawCode.trim()) return;
    const cleanCode = rawCode.trim();
    const lowerCode = cleanCode.toLowerCase();

    // Debounce rapid identical camera scans within 1.2s
    const now = Date.now();
    if (lastScannedTimeRef.current.code === lowerCode && (now - lastScannedTimeRef.current.time) < 1200) {
      return;
    }
    lastScannedTimeRef.current = { code: lowerCode, time: now };

    const currentScannedPos = scannedPosRef.current || [];

    // 1. Check if cleanCode matches a Purchase Order (by purchaseCode, id, supplierOrderNumber, or supplierTrackingNumber)
    const matchedPo = purchaseOrders.find(po => {
      if (po.status === 'cancelled' || po.status === 'completed') return false;
      const pCode = (po.purchaseCode || '').toLowerCase();
      const pId = (po.id || '').toLowerCase();
      const cleanPCode = pCode.replace(/^#?p(?!o)/, 'po').replace(/^#/, '');
      const supOrder = (po.supplierOrderNumber || '').toLowerCase();
      const supTrack = (po.supplierTrackingNumber || '').toLowerCase();

      return pCode === lowerCode ||
        pId === lowerCode ||
        cleanPCode === lowerCode ||
        (cleanPCode && lowerCode.includes(cleanPCode)) ||
        (pCode && lowerCode.includes(pCode)) ||
        (supOrder && supOrder === lowerCode) ||
        (supTrack && supTrack === lowerCode);
    });

    if (matchedPo) {
      const existingIndex = currentScannedPos.findIndex(s => s.id === matchedPo.id);
      if (existingIndex >= 0) {
        setExpandedScannedPoId(matchedPo.id);
        playScanSound();
        setScanSuccessToast(`PO #${matchedPo.purchaseCode || matchedPo.id} sudah ada di daftar antrean scan.`);
        setTimeout(() => setScanSuccessToast(null), 3500);
        return;
      }

      const poItems = matchedPo.items && matchedPo.items.length > 0 ? matchedPo.items : [{
        bookId: matchedPo.bookId,
        bookName: matchedPo.bookName,
        qty: matchedPo.qty,
        qtyReceived: matchedPo.qtyReceived || 0,
        pricePlatformTotal: matchedPo.purchasePriceIDR || matchedPo.purchasePriceNTD / 100,
        priceNTDTotal: matchedPo.purchasePriceNTD,
        pricePerItem: matchedPo.pricePerUnitNTD
      }];

      const initialMap: Record<string, { qtyReceivedThisTime: string, isCancelled: boolean }> = {};
      poItems.forEach((it: any) => {
        const remaining = Math.max(0, it.qty - (it.qtyReceived || 0));
        initialMap[it.bookId] = {
          qtyReceivedThisTime: String(remaining || 1),
          isCancelled: false
        };
      });

      const newEntry = {
        id: matchedPo.id,
        purchaseCode: matchedPo.purchaseCode,
        supplierId: matchedPo.supplierId,
        supplierName: matchedPo.supplierName,
        po: matchedPo,
        receiveItemsState: initialMap,
        isSaved: false,
        scannedBarcodes: [cleanCode],
        kodeEkspedisi: kodeEkspedisi || tempKodeEkspedisi
      };

      setScannedPos(prev => [newEntry, ...prev]);
      setExpandedScannedPoId(matchedPo.id);
      playScanSound();
      setScanSuccessToast(`PO #${matchedPo.purchaseCode || matchedPo.id} berhasil terdeteksi dan ditambahkan.`);
      setTimeout(() => setScanSuccessToast(null), 3500);
      return;
    }

    // 2. Check if cleanCode matches an Item/Book Barcode, ISBN, SKU, or Product ID
    const matchedBook = books.find(b => {
      if (!b) return false;
      const isbn = (b.isbn || '').toString().trim().toLowerCase();
      const barcode = (b.barcode || '').toString().trim().toLowerCase();
      const sku = (b.sku || '').toString().trim().toLowerCase();
      const bId = (b.id || '').toString().trim().toLowerCase();
      const prodId = (b.productId || '').toString().trim().toLowerCase();
      const title = (b.bookName || '').toString().trim().toLowerCase();

      return isbn === lowerCode ||
        barcode === lowerCode ||
        sku === lowerCode ||
        bId === lowerCode ||
        prodId === lowerCode ||
        (lowerCode.length >= 4 && title === lowerCode);
    });

    const targetBookId = matchedBook ? matchedBook.id : null;
    const targetBookName = matchedBook ? matchedBook.bookName : cleanCode;

    const activePOs = purchaseOrders.filter(po => po.status !== 'cancelled' && po.status !== 'completed');

    const matchingPOs = activePOs.filter(po => {
      const items = po.items && po.items.length > 0 ? po.items : [{
        bookId: po.bookId,
        bookName: po.bookName,
        isbn: po.isbn,
        barcode: po.barcode
      }];

      return items.some((it: any) => {
        if (targetBookId && it.bookId === targetBookId) return true;
        const itIsbn = (it.isbn || '').toString().trim().toLowerCase();
        const itBarcode = (it.barcode || '').toString().trim().toLowerCase();
        const itName = (it.bookName || '').toString().trim().toLowerCase();
        return itIsbn === lowerCode || itBarcode === lowerCode || (lowerCode.length >= 4 && itName === lowerCode);
      });
    });

    if (matchingPOs.length > 0) {
      // Find an existing entry in currentScannedPos that still has room for this item
      let existingEntry = currentScannedPos.find(s => {
        if (!matchingPOs.some(mPo => mPo.id === s.id)) return false;
        const poItems = s.po.items && s.po.items.length > 0 ? s.po.items : [{
          bookId: s.po.bookId,
          bookName: s.po.bookName,
          qty: s.po.qty
        }];
        const matchedItem = poItems.find((it: any) =>
          (targetBookId && it.bookId === targetBookId) ||
          (it.isbn || '').toString().trim().toLowerCase() === lowerCode ||
          (it.barcode || '').toString().trim().toLowerCase() === lowerCode ||
          (it.bookName || '').toString().trim().toLowerCase() === lowerCode
        );
        if (!matchedItem) return false;
        const curQty = Number(s.receiveItemsState[matchedItem.bookId]?.qtyReceivedThisTime || '0') || 0;
        return curQty < matchedItem.qty;
      });

      if (!existingEntry) {
        existingEntry = currentScannedPos.find(s => matchingPOs.some(mPo => mPo.id === s.id));
      }

      if (existingEntry) {
        const targetPoId = existingEntry.id;
        const poItems = existingEntry.po.items && existingEntry.po.items.length > 0 ? existingEntry.po.items : [{
          bookId: existingEntry.po.bookId,
          bookName: existingEntry.po.bookName,
          qty: existingEntry.po.qty
        }];

        const matchedItem = poItems.find((it: any) =>
          (targetBookId && it.bookId === targetBookId) ||
          (it.isbn || '').toString().trim().toLowerCase() === lowerCode ||
          (it.barcode || '').toString().trim().toLowerCase() === lowerCode ||
          (it.bookName || '').toString().trim().toLowerCase() === lowerCode
        ) || poItems[0];

        let updatedQty = 0;
        setScannedPos(prev => prev.map(entry => {
          if (entry.id === targetPoId) {
            const curState = entry.receiveItemsState[matchedItem.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
            const curQty = Number(curState.qtyReceivedThisTime || '0') || 0;
            const maxQty = matchedItem.qty || 999;
            const nextQty = Math.min(maxQty, curQty + 1);
            updatedQty = nextQty;
            const newBarcodes = Array.from(new Set([...(entry.scannedBarcodes || []), cleanCode]));

            return {
              ...entry,
              isSaved: false,
              scannedBarcodes: newBarcodes,
              receiveItemsState: {
                ...entry.receiveItemsState,
                [matchedItem.bookId]: {
                  ...curState,
                  qtyReceivedThisTime: String(nextQty)
                }
              }
            };
          }
          return entry;
        }));

        setExpandedScannedPoId(targetPoId);
        playScanSound();
        setScanSuccessToast(`+1 unit "${matchedItem.bookName || targetBookName}" [Barcode: ${cleanCode}] (Total: ${updatedQty || 1}/${matchedItem.qty || 1})`);
        setTimeout(() => setScanSuccessToast(null), 3500);
        return;
      } else {
        const targetPo = matchingPOs[0];
        const poItems = targetPo.items && targetPo.items.length > 0 ? targetPo.items : [{
          bookId: targetPo.bookId,
          bookName: targetPo.bookName,
          qty: targetPo.qty,
          qtyReceived: targetPo.qtyReceived || 0,
          pricePlatformTotal: targetPo.purchasePriceIDR || targetPo.purchasePriceNTD / 100,
          priceNTDTotal: targetPo.purchasePriceNTD,
          pricePerItem: targetPo.pricePerUnitNTD
        }];

        const initialMap: Record<string, { qtyReceivedThisTime: string, isCancelled: boolean }> = {};
        poItems.forEach((it: any) => {
          const isThisItem = (targetBookId && it.bookId === targetBookId) ||
            (it.isbn || '').toString().trim().toLowerCase() === lowerCode ||
            (it.barcode || '').toString().trim().toLowerCase() === lowerCode ||
            (it.bookName || '').toString().trim().toLowerCase() === lowerCode;

          initialMap[it.bookId] = {
            qtyReceivedThisTime: isThisItem ? '1' : '0',
            isCancelled: false
          };
        });

        const newEntry = {
          id: targetPo.id,
          purchaseCode: targetPo.purchaseCode,
          supplierId: targetPo.supplierId,
          supplierName: targetPo.supplierName,
          po: targetPo,
          receiveItemsState: initialMap,
          isSaved: false,
          scannedBarcodes: [cleanCode],
          kodeEkspedisi: kodeEkspedisi || tempKodeEkspedisi
        };

        setScannedPos(prev => [newEntry, ...prev]);
        setExpandedScannedPoId(targetPo.id);
        playScanSound();
        setScanSuccessToast(`PO #${targetPo.purchaseCode || targetPo.id} ditambahkan (1 pcs "${targetBookName}" [Barcode: ${cleanCode}]).`);
        setTimeout(() => setScanSuccessToast(null), 3500);
        return;
      }
    }

    // 3. No match found
    setScanErrorToast(`Barcode / Kode "${cleanCode}" tidak terdaftar di katalog atau PO aktif.`);
    setTimeout(() => setScanErrorToast(null), 4000);
  };

  const handleSaveBulkScannedPO = async (scannedId: string) => {
    const entry = scannedPos.find(s => s.id === scannedId);
    if (!entry || entry.isSaved) return;

    const po = entry.po;
    const receiveState = entry.receiveItemsState || {};
    const currentKodeEkspedisi = (kodeEkspedisi || tempKodeEkspedisi || entry.kodeEkspedisi || '').trim().toUpperCase();

    try {
      const batch = writeBatch(db);
      const poItems = po.items && po.items.length > 0 ? po.items : [{
        bookId: po.bookId,
        bookName: po.bookName,
        qty: po.qty,
        qtyReceived: po.qtyReceived || 0,
        pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
        priceNTDTotal: po.purchasePriceNTD,
        pricePerItem: po.pricePerUnitNTD
      }];

      const currencyLabel = po.purchasePriceIDR ? 'IDR' : po.purchasePriceUSD ? 'USD' : 'NTD';
      let latestLogs: string[] = [...(po.receiptLogs || [])];
      let updatedItemsList = poItems.map((it: any) => ({ ...it }));
      let totalReceivedThisRunSum = 0;
      let hasPartialsRemaining = false;
      let allCancelled = true;
      let totalReceivedValueCents = 0;
      let totalReceivedValuePlat = 0;
      let bookDescriptions: string[] = [];
      const todayFormatted = formatToYYYYMMDD(new Date());

      for (let i = 0; i < updatedItemsList.length; i++) {
        const item = updatedItemsList[i];
        const stateRow = receiveState[item.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };

        if (!stateRow.isCancelled) {
          allCancelled = false;
          const qtyRecNum = parseCommasToNumber(stateRow.qtyReceivedThisTime);
          if (qtyRecNum > 0) {
            totalReceivedThisRunSum += qtyRecNum;
            item.qtyReceived = (item.qtyReceived || 0) + qtyRecNum;
            const itemRecValNTDCents = Math.round(item.priceNTDTotal * (qtyRecNum / item.qty));
            totalReceivedValueCents += itemRecValNTDCents;
            totalReceivedValuePlat += currencyLabel === 'IDR' ? Math.round(item.pricePlatformTotal * (qtyRecNum / item.qty)) : 0;
            bookDescriptions.push(`${qtyRecNum} unit ${item.bookName}`);

            // Update inventory
            const invRef = doc(db, 'inventory', item.bookId);
            const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', item.bookId)));
            let prevEnding = 0;
            let prevReady = 0;
            let prevAvg = 0;
            let prevPurchased = 0;
            let prevTransit = 0;
            if (!invSnap.empty) {
              const cur = invSnap.docs[0].data();
              prevEnding = cur.endingStock || 0;
              prevReady = cur.readyStock || 0;
              prevAvg = cur.movingAverageCost || 0;
              prevPurchased = cur.totalPurchased || 0;
              prevTransit = cur.inTransitStock || 0;
            }
            const nextEnding = prevEnding + qtyRecNum;
            const nextReady = prevReady + qtyRecNum;
            const nextTransit = Math.max(0, prevTransit - qtyRecNum);

            const totalQtyOrdered = updatedItemsList.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
            const diskon_per_unit_cents = (po.discount || 0) / totalQtyOrdered;
            const freight_per_unit_cents = ((po.forwarderFeeNTD || 0) * 100) / totalQtyOrdered;
            const unitLandedCents = item.pricePerItem - diskon_per_unit_cents + freight_per_unit_cents;

            let nextAvgCost = unitLandedCents;
            if (prevEnding + qtyRecNum > 0) {
              const prevValDecimal = new Decimal(prevEnding).mul(prevAvg);
              const recValDecimal = new Decimal(qtyRecNum).mul(unitLandedCents);
              nextAvgCost = prevValDecimal.plus(recValDecimal).div(prevEnding + qtyRecNum).toNumber();
            }

            batch.set(invRef, {
              bookId: item.bookId,
              initialStock: 0,
              totalPurchased: prevPurchased + qtyRecNum,
              totalDispatched: 0,
              endingStock: nextEnding,
              readyStock: nextReady,
              inTransitStock: nextTransit,
              movingAverageCost: nextAvgCost,
              totalInventoryValue: new Decimal(nextEnding).mul(nextAvgCost).toNumber(),
              stockStatus: nextEnding > 0 ? 'in_stock' : 'sold_out',
              lastUpdated: Timestamp.now()
            }, { merge: true });

            const ledgerId = doc(collection(db, 'inventoryLedger')).id;
            batch.set(doc(db, 'inventoryLedger', ledgerId), {
              id: ledgerId,
              bookId: item.bookId,
              type: 'purchase_received',
              qtyDelta: qtyRecNum,
              unitCost: unitLandedCents,
              refCollection: 'purchaseOrders',
              refId: po.id,
              balanceAfter: nextEnding,
              movingAvgAfter: nextAvgCost,
              timestamp: Timestamp.now(),
              userId: user?.uid || 'anonymous'
            });

            latestLogs.push(`${todayFormatted} ${item.bookName}: diterima ${qtyRecNum} unit${currentKodeEkspedisi ? ` (Freight-In: ${currentKodeEkspedisi})` : ''}`);
          }
        }

        if ((item.qtyReceived || 0) < item.qty && !item.isCancelled) {
          hasPartialsRemaining = true;
        }
      }

      if (totalReceivedThisRunSum === 0 && !allCancelled) {
        alert("Tidak ada jumlah barang diterima yang dimasukkan.");
        return;
      }

      let overallStatus = 'received';
      if (allCancelled) {
        overallStatus = 'cancelled';
      } else if (hasPartialsRemaining) {
        overallStatus = 'partial';
      }

      const updatePoData: any = {
        status: overallStatus,
        items: updatedItemsList,
        receiptLogs: latestLogs,
        lastUpdated: Timestamp.now()
      };

      if (currentKodeEkspedisi) {
        updatePoData.kodeEkspedisi = currentKodeEkspedisi;
      }

      const poRef = doc(db, 'purchaseOrders', po.id);
      batch.update(poRef, updatePoData);

      await batch.commit();

      setScannedPos(prev => prev.map(old => {
        if (old.id === scannedId) {
          return {
            ...old,
            isSaved: true,
            po: {
              ...po,
              status: overallStatus,
              items: updatedItemsList,
              kodeEkspedisi: currentKodeEkspedisi || po.kodeEkspedisi
            }
          };
        }
        return old;
      }));

      setScanSuccessToast(`Penerimaan PO #${po.purchaseCode || po.id} berhasil disimpan!`);
      setTimeout(() => setScanSuccessToast(null), 3500);
    } catch (err: any) {
      console.error("Gagal menyimpan penerimaan bulk scan:", err);
      alert("Gagal menyimpan penerimaan: " + (err.message || err));
    }
  };
  
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isClosePoModalOpen, setIsClosePoModalOpen] = useState(false);
  
  const [selectedPo, setSelectedPo] = useState<any>(null);
  const [closingPo, setClosingPo] = useState<any>(null);
  
  const [receiveItemsState, setReceiveItemsState] = useState<any[]>([]);
  const [receiveKodeEkspedisi, setReceiveKodeEkspedisi] = useState('');
  const [receiveDate, setReceiveDate] = useState('');
  const [receiveNoteGlobal, setReceiveNoteGlobal] = useState('');
  const [isProcessingReceive, setIsProcessingReceive] = useState(false);
  
  const [closePoOption, setClosePoOption] = useState('refund');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundRate, setRefundRate] = useState('');
  const [refundDate, setRefundDate] = useState('');
  const [closePoNote, setClosePoNote] = useState('');
  
  const [deleteConfirmPoId, setDeleteConfirmPoId] = useState<string|null>(null);
  const [expandedPoId, setExpandedPoId] = useState<string|null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  const [shaking, setShaking] = useState<Record<string, boolean>>({});
  const handlePriceReviewAction = async (idx: number, action: 'abaikan' | 'perbaikan') => {
    const item = addedItems[idx];
    if (!item) return;

    setAddedItems(prev => {
      const newItems = [...prev];
      newItems[idx].priceReviewStatus = action;
      return newItems;
    });

    if (action === 'perbaikan') {
      const taskId = `task_price_${item.bookId}_${Date.now()}`;
      try {
        await setDoc(doc(db, 'dashboardTasks', taskId), {
          id: taskId,
          t: `Perlu Perbaikan Harga: ${item.bookName}`,
          due: 'today',
          done: false,
          createdAt: Timestamp.now()
        });
      } catch (err) {
        console.error("Failed to create dashboard task for price review:", err);
      }
    }
  };

  const triggerShake = (id: string) => {
    setShaking(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setShaking(prev => ({ ...prev, [id]: false })), 500);
  };
  
  const parseCommasToNumber = (val: string) => parseFloat(cleanCommas(val)) || 0;
  const formatToYYYYMMDD = (d: Date) => d.toISOString().split('T')[0];
  
  const [isBulkReceiveScanOpen, setIsBulkReceiveScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState(1);
  const [scanSuccessToast, setScanSuccessToast] = useState<string | null>(null);

  const handleStopBulkReceiveScan = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn("Failed to stop scanner:", e);
      }
      html5QrCodeRef.current = null;
    }
  };

  // Scanner dynamic viewport effect initialization
  useEffect(() => {
    if (isBulkReceiveScanOpen && scanStep === 2) {
      const timer = setTimeout(() => {
        const element = document.getElementById('bulk-qr-reader');
        if (element) {
          try {
            const scanner = new Html5Qrcode("bulk-qr-reader", {
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

            // Apply ZXing Try Harder overrides
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
                      }
                    });
                  }
                });
              }
            } catch (e) {
              console.warn("Hint modification skipped:", e);
            }

            scanner.start(
              { facingMode: bulkCameraFacingMode },
              {
                fps: 30,
                qrbox: undefined,
                aspectRatio: 1.333333,
                videoConstraints: {
                  facingMode: bulkCameraFacingMode,
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  aspectRatio: { ideal: 1.333333 },
                  advanced: [{ focusMode: "continuous" }] as any
                }
              },
              (decodedText) => {
                handleProcessScannedCode(decodedText);
              },
              () => {
                // Ignore empty frames
              }
            ).then(() => {
              localStorage.setItem('cameraPermissionGranted', 'true');
            }).catch((err) => {
              console.error("Camera sweep start failed:", err);
              setScanErrorToast("Gagal menyalakan kamera. Silakan aktifkan izin kamera.");
            });

          } catch (initErr) {
            console.error("Scanner setup error:", initErr);
            setScanErrorToast("Inisialisasi kamera gagal.");
          }
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        handleStopBulkReceiveScan();
      };
    } else {
      handleStopBulkReceiveScan();
    }
  }, [isBulkReceiveScanOpen, scanStep, bulkCameraFacingMode]);

  // Clean scan history on closing the "Terima Barang" modal
  useEffect(() => {
    if (!isBulkReceiveScanOpen) {
      setScannedPos([]);
      setExpandedScannedPoId(null);
      setScanStep(1);
      scanStepRef.current = 1;
      setKodeEkspedisi("");
    } else {
      setScanStep(1);
      scanStepRef.current = 1;
      setKodeEkspedisi("");
    }
  }, [isBulkReceiveScanOpen]);

  // Fetch live exchange rates on opening Tambah Buku / Edit PO modal or platform select change
  useEffect(() => {
    if (!isNewPoOpen) {
      setRateFetchStatus('idle');
      return;
    }

    const selectedPlat = platforms.find(p => p.id === platformId);
    if (!selectedPlat) {
      setRateFetchStatus('idle');
      return;
    }

    const currency = selectedPlat.currency || 'NTD';
    if (currency === 'NTD' || currency === 'TWD') {
      setRateFetchStatus('success');
      return;
    }

    let isSubscribed = true;
    setRateFetchStatus('fetching');

    const fetchRate = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`https://open.er-api.com/v6/latest/${currency}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error('Failed to fetch exchange rate');
        }

        const data = await response.json();
        if (data && data.result === 'success' && data.rates) {
          let twdRate = data.rates.TWD;
          if (!twdRate && data.rates.NTD) {
            twdRate = data.rates.NTD;
          }

          if (twdRate && typeof twdRate === 'number') {
            if (isSubscribed) {
              setLiveRates(prev => {
                const updated = { ...prev, [currency]: twdRate };
                try {
                  localStorage.setItem('last_fetched_rates', JSON.stringify(updated));
                } catch (e) {
                  console.error(e);
                }
                return updated;
              });
              setRateFetchStatus('success');
            }
            return;
          }
        }
        throw new Error('Invalid rate data');
      } catch (err) {
        console.error('Exchange rate fetch error:', err);
        if (isSubscribed) {
          setRateFetchStatus('failed');
        }
      }
    };

    fetchRate();

    return () => {
      isSubscribed = false;
    };
  }, [isNewPoOpen, platformId, platforms]);


  useEffect(() => {
    const loadData = async () => {
      try {
        const [platSnap, poSnap, catSnap, freightSnap, journalSnap, tiersSnap] = await Promise.all([
          getDocs(collection(db, 'platforms')),
          getDocs(collection(db, 'purchaseOrders')),
          getDocs(collection(db, 'catalog')),
          getDocs(collection(db, 'freightIn')),
          getDocs(collection(db, 'journalEntries')),
          getDocs(collection(db, 'pricingTiers'))
        ]);
        
        // Platforms
        const platList = [];
        platSnap.forEach((d) => platList.push({ id: d.id, ...d.data() }));
        setPlatforms(platList);

        // Purchase Orders
        const pList = [];
        poSnap.forEach((d) => pList.push({ id: d.id, ...d.data() }));
        const sorted = pList.sort((a, b) => {
          const dateA = a.purchaseDate?.seconds || 0;
          const dateB = b.purchaseDate?.seconds || 0;
          return dateB - dateA;
        });
        setPurchaseOrders(sanitizePurchaseOrders(sorted));

        // Catalog
        const bList = [];
        catSnap.forEach((d) => bList.push({ id: d.id, ...d.data() }));
        setBooks(bList);

        // Freight In
        const fList = [];
        freightSnap.forEach((d) => fList.push({ id: d.id, ...d.data() }));
        setFreightInList(fList);

        // Journal Entries
        const jList = [];
        journalSnap.forEach((d) => jList.push({ id: d.id, ...d.data() }));
        setJournalEntries(jList);

        // Pricing Tiers
        const tList = [];
        tiersSnap.forEach((d) => tList.push({ id: d.id, ...d.data() }));
        tList.sort((a, b) => a.from - b.from);
        setPricingTiers(tList);

      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
           console.warn('Quota exceeded while fetching PurchasesTab data');
        } else {
           console.error('Error fetching data for PurchasesTab:', err);
        }
      }
    };

    loadData();
  }, []);

  // Listen for navigation requests from Journal Entry list links
  useEffect(() => {
    const filter = localStorage.getItem('search_po_filter');
    if (filter) {
      setSearchQuery(filter);
      localStorage.removeItem('search_po_filter');
    }
  }, []);

  // Keyboard shortcut for creation modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isNewPoOpen && e.key === 'Enter') {
        const activeElem = document.activeElement;
        if (activeElem && activeElem.tagName === 'TEXTAREA') return; // Do not interrupt multi-line catatan
        e.preventDefault();
        const submitBtn = document.getElementById('save-new-po-btn');
        if (submitBtn) {
          (submitBtn as HTMLButtonElement).click();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNewPoOpen]);

  // Derived Values & Filtering
  const selectedPlatform = platforms.find(p => p.id === platformId);
  const currentFXRate = selectedPlatform 
    ? (liveRates[selectedPlatform.currency] ?? (selectedPlatform.currency === 'IDR' ? FALLBACK_NTD_PER_IDR : selectedPlatform.currency === 'USD' ? FALLBACK_NTD_PER_USD : 1.0))
    : 1.0;

  const isWithinTrailing2Days = (dateData: any) => {
    if (!dateData) return false;
    const date = dateData.seconds ? new Date(dateData.seconds * 1000) : new Date(dateData);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 2;
  };

  // Active Checklist: created within trailing 2 days AND NOT shipped yet, and status pending and no tracking number
  const tasksChecklistPOs = purchaseOrders.filter(po => {
    const isPending = po.status === 'pending';
    const noTrackingNumber = !po.supplierTrackingNumber || po.supplierTrackingNumber.trim() === '';
    return isWithinTrailing2Days(po.purchaseDate) && !po.isShipped && isPending && noTrackingNumber;
  });

  // Task History: shipped within trailing 24 hours
  const tasksHistoryPOs = purchaseOrders.filter(po => {
    if (!po.isShipped || !po.shippedAt) return false;
    const shippedDate = po.shippedAt.seconds ? new Date(po.shippedAt.seconds * 1000) : new Date(po.shippedAt);
    const now = new Date();
    const diffHours = (now.getTime() - shippedDate.getTime()) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 24;
  });

  const getPoDateObj = (po: any): Date | null => {
    if (!po) return null;
    const rawDate = po.purchaseDate || po.createdAt || po.date;
    if (!rawDate) return null;
    if (typeof rawDate.toDate === 'function') {
      return rawDate.toDate();
    }
    if (rawDate.seconds !== undefined) {
      return new Date(rawDate.seconds * 1000);
    }
    if (rawDate instanceof Date) {
      return isNaN(rawDate.getTime()) ? null : rawDate;
    }
    return parseDateClient(rawDate);
  };

  const calculatePoRemainingNTDCents = (po: any): number => {
    if (po.status === 'received' || po.status === 'cancelled') return 0;
    if (po.status === 'pending') {
      return po.purchasePriceNTD || 0;
    }
    if (Array.isArray(po.items) && po.items.length > 0) {
      const totalGross = po.items.reduce((sum: number, item: any) => {
        if (item.isCancelled) return sum;
        const qty = item.qty || 0;
        const unitPrice = item.pricePerItem || item.pricePerUnitNTD || (qty ? Math.round((item.priceNTDTotal || 0) / qty) : 0);
        return sum + (qty * unitPrice);
      }, 0);

      let remGross = 0;
      po.items.forEach((item: any) => {
        if (item.isCancelled) return;
        const qty = item.qty || 0;
        const qtyReceived = item.qtyReceived || 0;
        const remQty = Math.max(0, qty - qtyReceived);
        const unitPrice = item.pricePerItem || item.pricePerUnitNTD || (qty ? Math.round((item.priceNTDTotal || 0) / qty) : 0);
        remGross += remQty * unitPrice;
      });

      if (totalGross > 0) {
        return Math.round((po.purchasePriceNTD || 0) * (remGross / totalGross));
      }
      return po.purchasePriceNTD || 0;
    }
    const qty = po.qty || 1;
    const qtyReceived = po.qtyReceived || 0;
    const remQty = Math.max(0, qty - qtyReceived);
    return Math.round((po.purchasePriceNTD || 0) * (remQty / qty));
  };

  const matchesSearch = (po: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesCode = po.purchaseCode?.toLowerCase().includes(q);
    const matchesTracking = po.supplierOrderNumber?.toLowerCase().includes(q);
    const matchesBookRoot = po.bookName?.toLowerCase().includes(q);
    const matchesItems = po.items?.some((it: any) => it && it.bookName && it.bookName.toLowerCase().includes(q));
    const resolvedPlatName = platforms.find(p => p.id === po.supplierId)?.name || po.supplierName || '';
    const matchesPlatform = resolvedPlatName.toLowerCase().includes(q);
    return matchesCode || matchesTracking || matchesBookRoot || matchesPlatform || matchesItems;
  };

  const matchesDate = (po: any) => {
    if (!startDate && !endDate) return true;
    const poDateObj = getPoDateObj(po);
    if (!poDateObj) return true;
    if (startDate) {
      const start = new Date(startDate.getTime());
      start.setHours(0, 0, 0, 0);
      if (poDateObj < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate.getTime());
      end.setHours(23, 59, 59, 999);
      if (poDateObj > end) return false;
    }
    return true;
  };

  // Filter master PO lists
  const dateFilteredPOs = purchaseOrders.filter(matchesDate);

  const statusFilteredPOs = dateFilteredPOs.filter(po => {
    if (poStatusFilter === 'Semua') return true;
    if (poStatusFilter === 'Menunggu') return po.status === 'pending';
    if (poStatusFilter === 'Sebagian') return po.status === 'partial';
    if (poStatusFilter === 'Diterima') return po.status === 'received';
    if (poStatusFilter === 'Cancel') return po.status === 'cancelled';
    return true;
  });

  const filteredPOs = statusFilteredPOs.filter(matchesSearch);
  const paginatedPOs = filteredPOs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = Math.ceil(filteredPOs.length / pageSize);

  const downloadImportTemplate = async () => {
    try {
      // Get actual, valid Product ID from current catalog if available
      const realBook1 = books && books.length > 0 ? (books[0].productId || books[0].id) : "BK001";
      const realBook2 = books && books.length > 1 ? (books[1].productId || books[1].id) : (books && books.length > 0 ? (books[0].productId || books[0].id) : "BK002");

      // Get actual, valid Platform name from current platforms list if available
      const idrPlat = platforms.find(p => p.currency === 'IDR')?.name || "Shopee Indonesia";
      const ntdPlat = platforms.find(p => p.currency === 'NTD')?.name || "Kangen Buku Taiwan";

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('PO Import Template');

      // Define columns
      worksheet.columns = [
        { header: 'Nomor Pembelian', key: 'poNum', width: 22 },
        { header: 'Tanggal Pembelian (YYYY/MM/DD)', key: 'tglPo', width: 30 },
        { header: 'Tanggal Diterima (YYYY/MM/DD)', key: 'tglTerima', width: 30 },
        { header: 'Platform Belanja', key: 'plat', width: 25 },
        { header: 'Status Pembayaran', key: 'statusBayar', width: 35 },
        { header: 'Kode Akun Kas', key: 'kodeKas', width: 18 },
        { header: 'Nomor Resi', key: 'resi', width: 20 },
        { header: 'Nomor Freight In', key: 'freightIn', width: 22 },
        { header: 'Diskon Pembelian', key: 'diskon', width: 20 },
        { header: 'Product ID', key: 'prodId', width: 15 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'Status Penerimaan', key: 'statusTerima', width: 22 },
        { header: 'Harga Total (Mata Uang Asal)', key: 'hargaTotal', width: 32 },
        { header: 'NTD Total', key: 'ntdTotal', width: 15 },
        { header: '/ Item NTD', key: 'itemNtd', width: 15 }
      ];

      // Format header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF5B1D33' } // Elegant Dark Burgundy for KangenBukuIndo
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerRow.height = 32;

      // Add 2 valid example rows
      worksheet.addRow({
        poNum: '2026072001',
        tglPo: '2026/07/21',
        tglTerima: '',
        plat: idrPlat,
        statusBayar: 'Lunas Langsung (Cash)',
        kodeKas: '1102', // Cash IDR
        resi: '',
        freightIn: '',
        diskon: 0,
        prodId: 'KB-260712-1520',
        qty: 1,
        statusTerima: 'Pending',
        hargaTotal: '',
        ntdTotal: '',
        itemNtd: 200
      });

      worksheet.addRow({
        poNum: '2026072001',
        tglPo: '2026/07/21',
        tglTerima: '',
        plat: idrPlat,
        statusBayar: 'Lunas Langsung (Cash)',
        kodeKas: '1102', // Cash IDR
        resi: '',
        freightIn: '',
        diskon: 0,
        prodId: 'KB-260712-1295',
        qty: 2,
        statusTerima: 'Pending',
        hargaTotal: 60000,
        ntdTotal: '',
        itemNtd: ''
      });

      // Align cells
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { vertical: 'middle', horizontal: 'left' };
          // Right align numbers
          row.getCell(9).alignment = { horizontal: 'right' }; // discount
          row.getCell(11).alignment = { horizontal: 'right' }; // qty
          row.getCell(13).alignment = { horizontal: 'right' }; // harga total
          row.getCell(14).alignment = { horizontal: 'right' }; // ntd total
          row.getCell(15).alignment = { horizontal: 'right' }; // item ntd
        }
      });

      // Platform, payment, and receipt statuses for dropdowns
      const platformNames = platforms.map(p => p.name).filter(Boolean);
      const platformFormula = `"${platformNames.join(',')}"`;
      const paymentStatusFormula = `"${['Lunas Langsung (Cash)', 'Belum Dibayar (Kredit/Utang)'].join(',')}"`;
      const receiptStatusFormula = `"${['Pending', 'Sebagian', 'Diterima'].join(',')}"`;

      // Apply data validation to rows 2-200
      for (let r = 2; r <= 200; r++) {
        const row = worksheet.getRow(r);
        
        // Platform Belanja (Col D / Column 4)
        row.getCell(4).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [platformFormula],
          showErrorMessage: true,
          errorTitle: 'Platform Tidak Valid',
          error: 'Pilih Platform Belanja dari daftar dropdown.'
        };

        // Status Pembayaran (Col E / Column 5)
        row.getCell(5).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [paymentStatusFormula],
          showErrorMessage: true,
          errorTitle: 'Status Pembayaran Tidak Valid',
          error: 'Pilih "Lunas Langsung (Cash)" atau "Belum Dibayar (Kredit/Utang)".'
        };

        // Status Penerimaan (Col L / Column 12)
        row.getCell(12).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [receiptStatusFormula],
          showErrorMessage: true,
          errorTitle: 'Status Penerimaan Tidak Valid',
          error: 'Pilih "Pending", "Sebagian", atau "Diterima" untuk item buku ini.'
        };
      }

      // Freeze headers
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Write to buffer and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `template_import_po_${Date.now().toString().slice(-4)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

    } catch (err: any) {
      console.error('Error generating template:', err);
      alert('Gagal mendownload template Excel: ' + err.message);
    }
  };

  const sanitizeValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.substring(1, str.length - 1).trim();
    }
    if (str.startsWith("'") && str.endsWith("'")) {
      str = str.substring(1, str.length - 1).trim();
    }
    return str;
  };

  const cleanNumberClient = (val: any): number => {
    const str = sanitizeValue(val);
    if (!str) return NaN;
    
    let cleaned = str.replace(/^[a-zA-Z\$\s\.\,\-]+/, (match) => {
      return match.includes('-') ? '-' : '';
    });
    
    cleaned = cleaned.replace(/^(rp|ntd|nt\$|usd|idr)\s*/i, '');
    cleaned = cleaned.trim().replace(/\s+/g, '');
    
    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
    } else if (cleaned.includes(',')) {
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        cleaned = cleaned.replace(/,/g, '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes('.')) {
      const parts = cleaned.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        cleaned = cleaned.replace(/\./g, '');
      }
    }
    
    return parseFloat(cleaned);
  };

  const getValClient = (row: any, possibleKeys: string[]) => {
    for (const k of possibleKeys) {
      const cleanK = k.replace(/^\ufeff/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const origKey of Object.keys(row)) {
        const cleanOrig = origKey.replace(/^\ufeff/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanOrig === cleanK) {
          return sanitizeValue(row[origKey]);
        }
      }
    }
    return '';
  };

  const parseDateClient = (dateStr: any) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) {
      return isNaN(dateStr.getTime()) ? null : dateStr;
    }
    const rawStr = String(dateStr).trim();
    if (!rawStr) return null;

    if (/^\d{8}$/.test(rawStr)) {
      const y = parseInt(rawStr.substring(0, 4), 10);
      const m = parseInt(rawStr.substring(4, 6), 10) - 1;
      const d = parseInt(rawStr.substring(6, 8), 10);
      const date = new Date(y, m, d, 12, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }

    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(rawStr)) {
      const parts = rawStr.split(/[-/]/);
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const date = new Date(y, m, d, 12, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }

    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(rawStr)) {
      const parts = rawStr.split(/[-/]/);
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      const date = new Date(y, m, d, 12, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }

    const d = new Date(rawStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const processImportFile = async (file: File) => {
    setIsImporting(true);
    setCsvValidationResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const binaryData = evt.target?.result;
          const workbook = XLSX.read(binaryData, { type: 'binary', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

          // Filter out rows where "Nomor Pembelian" is empty or helper rows
          const activeRows = rawRows.filter((row: any) => {
            const poNum = getValClient(row, ['Nomor Pembelian', 'NomorPembelian', 'No Pembelian', 'po', 'po_number', 'ponumber']);
            if (!poNum) return false;
            const str = String(poNum).trim();
            return str !== '' && !str.startsWith('#');
          });

          if (activeRows.length === 0) {
            setCsvValidationResult({
              status: 'error',
              message: 'Tidak ada baris data transaksi PO yang valid untuk diimpor. Pastikan file Anda memiliki kolom "Nomor Pembelian" dan tidak kosong.'
            });
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          // Validation arrays
          const missingFieldsRows: string[] = [];
          const invalidNumbersRows: string[] = [];
          const invalidDatesRows: string[] = [];
          const invalidPlatformsRows: string[] = [];
          const invalidProductsRows: string[] = [];
          const invalidPriceColsRows: string[] = [];
          const inconsistentPoRows: string[] = [];
          const duplicatePoRows: string[] = [];

          // Catalog ID check mapping
          const catalogIds = new Set<string>();
          books.forEach(b => {
            if (b.id) catalogIds.add(b.id.toUpperCase());
            if (b.productId) catalogIds.add(b.productId.toUpperCase());
          });

          // Platform check mapping
          const platformMap = new Map<string, any>();
          platforms.forEach(p => {
            platformMap.set(p.id.toLowerCase(), p);
            if (p.name) {
              platformMap.set(p.name.trim().toLowerCase(), p);
            }
          });

          const findPlatformClient = (inputName: string) => {
            if (!inputName) return null;
            const cleanInput = inputName.trim().toLowerCase();
            if (platformMap.has(cleanInput)) return platformMap.get(cleanInput);
            for (const [key, val] of platformMap.entries()) {
              if (val.name && val.name.trim().toLowerCase() === cleanInput) return val;
            }
            return null;
          };

          // To check duplicate PO in system
          const systemPoCodes = new Set<string>();
          purchaseOrders.forEach(po => {
            if (po.purchaseCode) systemPoCodes.add(po.purchaseCode.toUpperCase());
            if (po.supplierOrderNumber) systemPoCodes.add(po.supplierOrderNumber.toUpperCase());
          });

          // Group by PO to validate PO-level fields consistency
          const poGroups = new Map<string, any[]>();

          activeRows.forEach((row: any, idx: number) => {
            const lineNum = idx + 2; // header is line 1

            const poNum = getValClient(row, ['Nomor Pembelian']);
            const tglPo = getValClient(row, ['Tanggal Pembelian (YYYY/MM/DD)', 'Tanggal Pembelian']);
            const tglTerima = getValClient(row, ['Tanggal Diterima (YYYY/MM/DD)', 'Tanggal Diterima']);
            const plat = getValClient(row, ['Platform Belanja']);
            const statusBayar = getValClient(row, ['Status Pembayaran']);
            const kodeKas = getValClient(row, ['Kode Akun Kas']);
            const resi = getValClient(row, ['Nomor Resi']);
            const freightIn = getValClient(row, ['Nomor Freight In']);
            const diskon = getValClient(row, ['Diskon Pembelian']);

            const prodId = getValClient(row, ['Product ID']);
            const qtyStr = getValClient(row, ['Qty']);
            const statusTerima = getValClient(row, ['Status Penerimaan']);

            const hargaTotalAsal = getValClient(row, ['Harga Total (Mata Uang Asal)']);
            const ntdTotal = getValClient(row, ['NTD Total']);
            const itemNtd = getValClient(row, ['/ Item NTD']);

            // Parse Date Helper to prevent parsing issue
            const parsedTglPo = parseDateClient(tglPo);
            const parsedTglTerima = parseDateClient(tglTerima);

            // Grouping for inconsistency check
            if (poNum) {
              const poKey = poNum.trim().toUpperCase();
              if (!poGroups.has(poKey)) poGroups.set(poKey, []);
              poGroups.get(poKey)!.push({
                lineNum,
                row,
                levelPO: {
                  tglPo: parsedTglPo ? parsedTglPo.toISOString().split('T')[0] : '',
                  tglTerima: parsedTglTerima ? parsedTglTerima.toISOString().split('T')[0] : '',
                  plat: plat ? plat.trim().toLowerCase() : '',
                  statusBayar: statusBayar ? statusBayar.trim().toLowerCase() : '',
                  kodeKas: kodeKas ? kodeKas.trim() : '',
                  resi: resi ? resi.trim().toLowerCase() : '',
                  freightIn: freightIn ? freightIn.trim().toLowerCase() : '',
                  diskon: diskon ? parseFloat(cleanCommas(diskon)) || 0 : 0
                }
              });
            }

            // Standard Dropdown Check
            if (statusBayar && statusBayar !== 'Lunas Langsung (Cash)' && statusBayar !== 'Belum Dibayar (Kredit/Utang)') {
              missingFieldsRows.push(`Baris ${lineNum}: Pilihan Status Pembayaran harus "Lunas Langsung (Cash)" atau "Belum Dibayar (Kredit/Utang)"`);
            }
            if (statusTerima && statusTerima !== 'Pending' && statusTerima !== 'Sebagian' && statusTerima !== 'Diterima') {
              missingFieldsRows.push(`Baris ${lineNum}: Pilihan Status Penerimaan harus "Pending", "Sebagian", atau "Diterima"`);
            }

            // Platform check
            const matchedPlat = plat ? findPlatformClient(plat) : null;
            if (plat && !matchedPlat) {
              invalidPlatformsRows.push(`Baris ${lineNum}: Platform "${plat}" tidak terdaftar`);
            }

            // Account Kas check
            if (statusBayar === 'Lunas Langsung (Cash)') {
              if (!kodeKas) {
                missingFieldsRows.push(`Baris ${lineNum}: Kode Akun Kas wajib diisi jika Status Pembayaran = "Lunas Langsung (Cash)"`);
              }
            } else if (statusBayar === 'Belum Dibayar (Kredit/Utang)') {
              if (kodeKas) {
                missingFieldsRows.push(`Baris ${lineNum}: Kode Akun Kas harus dikosongkan jika Status Pembayaran = "Belum Dibayar (Kredit/Utang)"`);
              }
            }

            // Duplicate system check
            if (poNum && systemPoCodes.has(poNum.trim().toUpperCase())) {
              duplicatePoRows.push(`Baris ${lineNum}: Nomor PO "${poNum}" sudah ada di sistem`);
            }

            // Product check
            if (!prodId) {
              missingFieldsRows.push(`Baris ${lineNum}: Product ID wajib diisi`);
            } else {
              const cleanProdId = prodId.trim().toUpperCase();
              if (!catalogIds.has(cleanProdId)) {
                invalidProductsRows.push(`Baris ${lineNum}: Product ID "${prodId}" tidak ditemukan di Katalog`);
              }
            }

            // Qty check
            const qtyVal = cleanNumberClient(qtyStr);
            if (!qtyStr || isNaN(qtyVal) || qtyVal <= 0) {
              invalidNumbersRows.push(`Baris ${lineNum}: Qty harus berupa angka positif > 0`);
            }

            // Dates check
            if (!tglPo) {
              missingFieldsRows.push(`Baris ${lineNum}: Tanggal Pembelian wajib diisi`);
            } else if (!parsedTglPo) {
              invalidDatesRows.push(`Baris ${lineNum}: format Tanggal Pembelian tidak valid ("${tglPo}")`);
            }

            if (tglTerima && !parsedTglTerima) {
              invalidDatesRows.push(`Baris ${lineNum}: format Tanggal Diterima tidak valid ("${tglTerima}")`);
            }

            // 3-Price-Columns option check
            let filledPrices = 0;
            const pTotalAsal = cleanNumberClient(hargaTotalAsal);
            const pNtdTotal = cleanNumberClient(ntdTotal);
            const pItemNtd = cleanNumberClient(itemNtd);

            if (!isNaN(pTotalAsal) && pTotalAsal > 0) filledPrices++;
            if (!isNaN(pNtdTotal) && pNtdTotal > 0) filledPrices++;
            if (!isNaN(pItemNtd) && pItemNtd > 0) filledPrices++;

            if (filledPrices === 0) {
              invalidPriceColsRows.push(`Baris ${lineNum}: Wajib mengisi TEPAT SATU kolom harga (Harga Total / NTD Total / / Item NTD) dengan angka > 0`);
            } else if (filledPrices > 1) {
              invalidPriceColsRows.push(`Baris ${lineNum}: Pengisian harga konflik. Hanya boleh mengisi salah satu dari tiga kolom harga (Harga Total / NTD Total / / Item NTD)`);
            }
          });

          // Validate PO-level consistency
          poGroups.forEach((groupItems, poCode) => {
            if (groupItems.length > 1) {
              const first = groupItems[0].levelPO;
              for (let i = 1; i < groupItems.length; i++) {
                const current = groupItems[i].levelPO;
                const diffs = [];
                if (first.tglPo !== current.tglPo) diffs.push('Tanggal Pembelian');
                if (first.tglTerima !== current.tglTerima) diffs.push('Tanggal Diterima');
                if (first.plat !== current.plat) diffs.push('Platform Belanja');
                if (first.statusBayar !== current.statusBayar) diffs.push('Status Pembayaran');
                if (first.kodeKas !== current.kodeKas) diffs.push('Kode Akun Kas');
                if (first.resi !== current.resi) diffs.push('Nomor Resi');
                if (first.freightIn !== current.freightIn) diffs.push('Nomor Freight In');
                if (first.diskon !== current.diskon) diffs.push('Diskon Pembelian');

                if (diffs.length > 0) {
                  inconsistentPoRows.push(`Nomor PO "${poCode}": Perbedaan nilai kolom Level PO di Baris ${groupItems[i].lineNum} dibanding Baris ${groupItems[0].lineNum} (kolom: ${diffs.join(', ')})`);
                }
              }
            }
          });

          // Show all errors if any
          if (
            missingFieldsRows.length > 0 ||
            invalidPlatformsRows.length > 0 ||
            invalidProductsRows.length > 0 ||
            invalidNumbersRows.length > 0 ||
            invalidDatesRows.length > 0 ||
            invalidPriceColsRows.length > 0 ||
            inconsistentPoRows.length > 0 ||
            duplicatePoRows.length > 0
          ) {
            setCsvValidationResult({
              status: 'error',
              message: 'Validasi Excel Gagal. Mohon perbaiki kesalahan berikut sebelum mengimpor:',
              details: {
                missingFields: missingFieldsRows.length > 0 ? missingFieldsRows.join('\n') : undefined,
                invalidProducts: invalidProductsRows.length > 0 ? invalidProductsRows.join('\n') : undefined,
                invalidPlatforms: invalidPlatformsRows.length > 0 ? invalidPlatformsRows.join('\n') : undefined,
                invalidDates: invalidDatesRows.length > 0 ? invalidDatesRows.join('\n') : undefined,
                invalidNumbers: invalidNumbersRows.length > 0 ? invalidNumbersRows.join('\n') : undefined,
                invalidPrices: invalidPriceColsRows.length > 0 ? invalidPriceColsRows.join('\n') : undefined,
                inconsistentPo: inconsistentPoRows.length > 0 ? inconsistentPoRows.join('\n') : undefined,
                duplicatePo: duplicatePoRows.length > 0 ? duplicatePoRows.join('\n') : undefined
              }
            });
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          // Process and send to server
          const response = await fetch('/api/import-po', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              rows: rawRows,
              userId: user?.uid || 'admin',
              liveRates: liveRates
            })
          });

          const responseData = await response.json();
          if (!response.ok) {
            setCsvValidationResult({
              status: 'error',
              message: responseData.error || 'Gagal melakukan import data PO.',
              details: responseData.details ? {
                missingFields: responseData.details.missingFields || undefined,
                invalidProducts: responseData.details.invalidProducts || undefined,
                invalidPlatforms: responseData.details.invalidPlatforms || undefined,
                invalidDates: responseData.details.invalidDates || undefined,
                invalidNumbers: responseData.details.invalidNumbers || undefined,
                invalidPrices: responseData.details.invalidPrices || undefined,
                inconsistentPo: responseData.details.inconsistentPo || undefined,
                duplicatePo: responseData.details.duplicatePo || undefined
              } : undefined
            });
          } else {
            setCsvValidationResult({
              status: 'success',
              message: responseData.summary || 'Seluruh data Purchase Order berhasil diimpor dengan sukses!'
            });
          }
        } catch (err: any) {
          setCsvValidationResult({
            status: 'error',
            message: `Gagal membaca file Excel: ${err.message}`
          });
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsBinaryString(file);
    } catch (err: any) {
      setCsvValidationResult({
        status: 'error',
        message: 'Error: ' + err.message
      });
      setIsImporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImportFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      await processImportFile(droppedFile);
    }
  };

  // Fake function to consume the rest of old handleImportFile
  const old_handleImport_discarded = (file: any) => {
    const Papa = { parse: (...args: any[]) => {} };
    const user = { uid: '' };
    const liveRates = {};
    const getValClient = (...args: any[]) => '';
    const cleanNumberClient = (...args: any[]): number => 0;
    const books: any[] = [];
    const platforms: any[] = [];
    const parseDateClient = (...args: any[]) => null;
    try {
      const options: any = {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.replace(/^\ufeff/, '').trim(),
        complete: async (results) => {
          try {
            // Filter out empty rows or comment lines
            const activeRows = results.data.filter((row: any) => {
              const poNum = getValClient(row, ['Nomor Pembelian', 'NomorPembelian', 'No Pembelian', 'po', 'po_number', 'ponumber']);
              if (!poNum) return false;
              const str = String(poNum).trim();
              return str !== '' && !str.startsWith('#');
            });

            if (activeRows.length === 0) {
              setCsvValidationResult({
                status: 'error',
                message: 'Tidak ada baris data transaksi PO yang valid untuk diimpor. Pastikan file Anda memiliki kolom "Nomor Pembelian" dan tidak kosong.'
              });
              setIsImporting(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }

            // Client-side Validations
            const missingFieldsRows: string[] = [];
            const invalidNumbersRows: string[] = [];
            const invalidDatesRows: string[] = [];
            const invalidPlatformsRows: string[] = [];
            const invalidProductsRows: string[] = [];

            // Catalog ID check mapping
            const catalogIds = new Set<string>();
            books.forEach(b => {
              if (b.id) catalogIds.add(b.id.toUpperCase());
              if (b.productId) catalogIds.add(b.productId.toUpperCase());
            });

            // Platform check mapping
            const platformMap = new Map<string, any>();
            platforms.forEach(p => {
              platformMap.set(p.id.toLowerCase(), p);
              if (p.name) {
                platformMap.set(p.name.trim().toLowerCase(), p);
              }
            });

            const findPlatformClient = (inputName: string) => {
              if (!inputName) return null;
              const cleanInput = inputName.trim().toLowerCase();
              if (platformMap.has(cleanInput)) return platformMap.get(cleanInput);
              for (const [key, val] of platformMap.entries()) {
                if (val.name && val.name.trim().toLowerCase() === cleanInput) return val;
              }
              for (const [key, val] of platformMap.entries()) {
                if (val.name && (val.name.trim().toLowerCase().includes(cleanInput) || cleanInput.includes(val.name.trim().toLowerCase()))) return val;
              }
              return null;
            };

            activeRows.forEach((row: any, idx: number) => {
              const lineNum = idx + 2;

              const poNum = getValClient(row, ['Nomor Pembelian', 'NomorPembelian', 'No Pembelian', 'po', 'po_number', 'ponumber']);
              const tglPo = getValClient(row, ['Tanggal Pembelian (YYYY/MM/DD)', 'Tanggal Pembelian (YYYYMMDD)', 'Tanggal Pembelian', 'TanggalPembelian', 'Tanggal PO', 'po_date', 'podate']);
              const plat = getValClient(row, ['Platform Belanja', 'PlatformBelanja', 'Platform', 'supplier']);
              const statusBayar = getValClient(row, ['Status Pembayaran', 'StatusPembayaran', 'payment_status', 'paymentstatus']);
              const prodId = getValClient(row, ['Product ID', 'ProductID', 'book_id', 'bookid', 'product_id', 'productid']);
              const qtyStr = getValClient(row, ['Qty', 'quantity', 'jumlah', 'pcs', 'pc']);
              const hgSatuan = getValClient(row, ['Harga Satuan', 'HargaSatuan', 'unit_price', 'price', 'hargasatuan', 'harga']);
              const hgTotalIdr = getValClient(row, ['Harga Total (IDR)', 'Harga Total', 'HargaTotalIDR', 'Harga Total IDR', 'price_platform_total', 'platform_total', 'hargatotal', 'hargatotalidr', 'total_belanja_sebenarnya']);
              const ntdTotal = getValClient(row, ['NTD Total', 'Total NTD', 'NTDTotal', 'TotalNTD', 'price_ntd_total', 'ntd_total', 'total_ntd']);

              const matchedPlat = plat ? findPlatformClient(plat) : null;
              const currency = matchedPlat?.currency || 'IDR';

              let hasValidPrice = false;
              const parsedHargaSatuan = cleanNumberClient(hgSatuan);
              const parsedHargaTotalIDR = cleanNumberClient(hgTotalIdr);
              const parsedNTDTotal = cleanNumberClient(ntdTotal);

              if (!isNaN(parsedHargaSatuan) && parsedHargaSatuan >= 0) {
                hasValidPrice = true;
              } else if (currency === 'NTD' && !isNaN(parsedNTDTotal) && parsedNTDTotal >= 0) {
                hasValidPrice = true;
              } else if (currency !== 'NTD' && !isNaN(parsedHargaTotalIDR) && parsedHargaTotalIDR >= 0) {
                hasValidPrice = true;
              }

              // Missing Fields
              const missingCols: string[] = [];
              if (!poNum) missingCols.push('Nomor Pembelian');
              if (!tglPo) missingCols.push('Tanggal Pembelian');
              if (!plat) missingCols.push('Platform Belanja');
              if (!statusBayar) missingCols.push('Status Pembayaran');
              if (!prodId) missingCols.push('Product ID');
              if (!qtyStr) missingCols.push('Qty/Pcs');
              if (!hasValidPrice) missingCols.push('Harga (Satuan/Total)');

              if (missingCols.length > 0) {
                missingFieldsRows.push(`Baris ${lineNum}: Kolom hilang [ ${missingCols.join(', ')} ]`);
              }

              // Platform Valid
              if (plat && !matchedPlat) {
                invalidPlatformsRows.push(`Baris ${lineNum}: "${plat}"`);
              }

              // Product Valid
              if (prodId) {
                const cleanProdId = prodId.trim().toUpperCase();
                if (!catalogIds.has(cleanProdId)) {
                  invalidProductsRows.push(`Baris ${lineNum}: "${prodId}"`);
                }
              }

              // Numeric validation
              const qty = cleanNumberClient(qtyStr);
              if (isNaN(qty) || qty <= 0) {
                invalidNumbersRows.push(`Baris ${lineNum}: Jumlah Qty / Pcs tidak valid (${qtyStr || 'kosong'})`);
              } else if (!hasValidPrice) {
                invalidNumbersRows.push(`Baris ${lineNum}: Harga tidak valid`);
              }

              // Date validation
              const pDate = parseDateClient(tglPo);
              if (!pDate && tglPo) {
                invalidDatesRows.push(`Baris ${lineNum}: "${tglPo}"`);
              }
            });

            if (
              missingFieldsRows.length > 0 ||
              invalidPlatformsRows.length > 0 ||
              invalidProductsRows.length > 0 ||
              invalidNumbersRows.length > 0 ||
              invalidDatesRows.length > 0
            ) {
              const availablePlatformsList = Array.from(new Set(platforms.map(p => p.name))).join(', ');
              setCsvValidationResult({
                status: 'error',
                message: 'Validasi gagal. Silakan perbaiki file Anda sebelum mengimpor.',
                details: {
                  missingFields: missingFieldsRows.length > 0 ? missingFieldsRows.join('\n') : undefined,
                  invalidProducts: invalidProductsRows.length > 0 ? `Product ID tidak terdaftar di Katalog Buku:\n${invalidProductsRows.join('\n')}` : undefined,
                  invalidPlatforms: invalidPlatformsRows.length > 0 ? `Platform Belanja tidak terdaftar: ${invalidPlatformsRows.join(', ')}. Pilihan terdaftar: [ ${availablePlatformsList} ]` : undefined,
                  invalidDates: invalidDatesRows.length > 0 ? `Format tanggal salah (Wajib YYYY/MM/DD atau YYYYMMDD): ${invalidDatesRows.join(', ')}` : undefined,
                  invalidNumbers: invalidNumbersRows.length > 0 ? `Angka Qty/Harga tidak valid:\n${invalidNumbersRows.join('\n')}` : undefined
                }
              });
              setIsImporting(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }

            // Send to server
            const response = await fetch('/api/import-po', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                rows: results.data,
                userId: user?.uid || 'admin',
                liveRates: liveRates
              })
            });

            const responseData = await response.json();
            if (!response.ok) {
              setCsvValidationResult({
                status: 'error',
                message: responseData.error || 'Gagal menyimpan transaksi ke sistem.',
                details: responseData.details ? {
                  missingFields: responseData.details.missingFields || undefined,
                  invalidProducts: responseData.details.invalidProducts || undefined,
                  invalidPlatforms: responseData.details.invalidPlatforms || undefined,
                  invalidDates: responseData.details.invalidDates || undefined,
                  invalidNumbers: responseData.details.invalidNumbers || undefined
                } : undefined
              });
            } else {
              setCsvValidationResult({
                status: 'success',
                message: responseData.summary || 'Seluruh data Purchase Order berhasil diimpor dengan sukses!'
              });
            }
          } catch (err: any) {
            setCsvValidationResult({
              status: 'error',
              message: `Network Error: ${err.message}`
            });
          } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        },
        error: (err) => {
          setCsvValidationResult({
            status: 'error',
            message: 'Gagal membaca format file CSV: ' + err.message
          });
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
    } catch (err: any) {
      setCsvValidationResult({
        status: 'error',
        message: 'Error: ' + err.message
      });
      setIsImporting(false);
    }
  };

  // Platform CRUD actions
  const handleSavePlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platformNameInput.trim()) {
      triggerShake('platformNameInput');
      return;
    }

    try {
      if (editingPlatformId) {
        await updateDoc(doc(db, 'platforms', editingPlatformId), {
          name: platformNameInput.trim(),
          currency: platformCurrencyInput,
          updatedAt: Timestamp.now()
        });
        setEditingPlatformId(null);
      } else {
        const id = doc(collection(db, 'platforms')).id;
        await setDoc(doc(db, 'platforms', id), {
          id,
          name: platformNameInput.trim(),
          currency: platformCurrencyInput,
          createdAt: Timestamp.now()
        });
      }
      setPlatformNameInput('');
      setPlatformCurrencyInput('IDR');
      setPlatformModalError(null);
    } catch (err: any) {
      setPlatformModalError("Error saving platform: " + err.message);
    }
  };

  const handleDeletePlatform = async (id: string, name: string) => {
    const referencedPOs = purchaseOrders.filter(po => po.supplierId === id);
    if (referencedPOs.length > 0) {
      setPlatformModalError(
        `Platform tidak dapat dihapus karena masih digunakan oleh ${referencedPOs.length} Purchase Order. Hapus atau arsipkan PO tersebut terlebih dahulu.`
      );
      return;
    }

    try {
      await deleteDoc(doc(db, 'platforms', id));
      setPlatformModalError(null);
    } catch (err: any) {
      setPlatformModalError("Error deleting platform: " + err.message);
    }
  };

  // Add search line for PO matrix
  const handleAddCatalogToPO = (book: Book) => {
    if (addedItems.some(it => it.bookId === book.id)) {
      alert("Buku ini sudah berada di daftar.");
      setCatalogSearch('');
      setShowCatalogDropdown(false);
      return;
    }

    setAddedItems(prev => [
      ...prev,
      {
        bookId: book.id,
        bookName: book.bookName,
        qtyStr: '0',
        pricePlatformStr: '0',
        priceNTDStr: '0',
        pricePerItemStr: '0'
      }
    ]);
    setCatalogSearch('');
    setShowCatalogDropdown(false);
  };

  // Recalculations helpers inside PO form lanes
  const handleLineQtyChange = (idx: number, val: string) => {
    const cleanQty = val.replace(/[^\d.-]/g, '');
    const formattedQty = cleanQty ? Number(cleanQty).toLocaleString('en-US') : '';
    const numQty = cleanQty ? parseFloat(cleanQty) : 1;

    setAddedItems(prev => {
      const copy = [...prev];
      const item = copy[idx];
      item.qtyStr = formattedQty;

      // Keep platform total cost intact, update NTD and unit cost
      const platStr = parseCommasToNumber(item.pricePlatformStr);
      const totalNTDVal = platStr * currentFXRate;
      item.priceNTDStr = totalNTDVal.toLocaleString('en-US', {maximumFractionDigits: 2});
      item.pricePerItemStr = (totalNTDVal / (numQty || 1)).toLocaleString('en-US', {maximumFractionDigits: 2});
      return copy;
    });
  };

  const handlePlatformChange = (newPlatformId: string) => {
    setPlatformId(newPlatformId);
    const newPlatform = platforms.find(p => p.id === newPlatformId);
    const newRate = newPlatform 
      ? (liveRates[newPlatform.currency] ?? (newPlatform.currency === 'IDR' ? FALLBACK_NTD_PER_IDR : newPlatform.currency === 'USD' ? FALLBACK_NTD_PER_USD : 1.0))
      : 1.0;

    setAddedItems(prev => prev.map(item => {
      const platPrice = parseCommasToNumber(item.pricePlatformStr);
      const numQty = parseCommasToNumber(item.qtyStr) || 1;
      let totalNTDVal = 0;

      if (newPlatform?.currency === 'IDR' || newPlatform?.currency === 'USD') {
        totalNTDVal = platPrice * newRate;
      } else if (newPlatform?.currency === 'NTD') {
        totalNTDVal = platPrice;
      } else {
        totalNTDVal = parseCommasToNumber(item.priceNTDStr);
      }

      return {
        ...item,
        priceNTDStr: totalNTDVal.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        pricePerItemStr: (totalNTDVal / numQty).toLocaleString('en-US', { maximumFractionDigits: 2 })
      };
    }));
  };

  const handleLinePlatformPriceChange = (idx: number, val: string) => {
    const clean = val.replace(/[^\d.-]/g, '');
    const formatted = clean ? Number(clean).toLocaleString('en-US') : '';
    const platPrice = clean ? parseFloat(clean) : 0;

    setAddedItems(prev => {
      const copy = [...prev];
      const item = copy[idx];
      item.pricePlatformStr = formatted;

      const totalNTDVal = platPrice * currentFXRate;
      item.priceNTDStr = totalNTDVal.toLocaleString('en-US', {maximumFractionDigits: 2});

      const numQty = parseCommasToNumber(item.qtyStr) || 1;
      item.pricePerItemStr = (totalNTDVal / numQty).toLocaleString('en-US', {maximumFractionDigits: 2});
      return copy;
    });
  };

  const handleLineNTDPriceChange = (idx: number, val: string) => {
    const clean = val.replace(/[^\d.-]/g, '');
    const formatted = clean ? Number(clean).toLocaleString('en-US') : '';
    const ntdPrice = clean ? parseFloat(clean) : 0;

    setAddedItems(prev => {
      const copy = [...prev];
      const item = copy[idx];
      item.priceNTDStr = formatted;

      const platPrice = currentFXRate > 0 ? (ntdPrice / currentFXRate) : 0;
      item.pricePlatformStr = platPrice.toLocaleString('en-US', {maximumFractionDigits: 2});

      const numQty = parseCommasToNumber(item.qtyStr) || 1;
      item.pricePerItemStr = (ntdPrice / numQty).toLocaleString('en-US', {maximumFractionDigits: 2});
      return copy;
    });
  };

  const handleLinePerItemPriceChange = (idx: number, val: string) => {
    const clean = val.replace(/[^\d.-]/g, '');
    const formatted = clean ? Number(clean).toLocaleString('en-US') : '';
    const perItemPrice = clean ? parseFloat(clean) : 0;

    setAddedItems(prev => {
      const copy = [...prev];
      const item = copy[idx];
      item.pricePerItemStr = formatted;

      const numQty = parseCommasToNumber(item.qtyStr) || 1;
      const totalNTDVal = perItemPrice * numQty;
      item.priceNTDStr = totalNTDVal.toLocaleString('en-US', {maximumFractionDigits: 2});

      const platPrice = currentFXRate > 0 ? (totalNTDVal / currentFXRate) : 0;
      item.pricePlatformStr = platPrice.toLocaleString('en-US', {maximumFractionDigits: 2});
      return copy;
    });
  };

  const handleLineNameChange = (idx: number, val: string) => {
    setAddedItems(prev => {
      const copy = [...prev];
      copy[idx].bookName = val;
      return copy;
    });
  };

  const handleAddManualRow = () => {
    setAddedItems(prev => [
      ...prev,
      {
        bookId: 'manual_' + Date.now(),
        bookName: 'Buku Baru',
        qtyStr: '1',
        pricePlatformStr: '0',
        priceNTDStr: '0',
        pricePerItemStr: '0'
      }
    ]);
  };

  // Handle Editing an existing PO
  const handleEditPO = (po: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPoViewOnly(false);
    setEditingPoId(po.id);
    setPoDate(parsePoDateToString(po.purchaseDate || po.createdAt || po.date));
    setPlatformId(po.supplierId || '');
    setPoPaymentStatus(po.paymentStatus || 'paid');
    setSupplierOrderNumber(po.supplierOrderNumber || '');
    setSupplierTrackingNumber(po.supplierTrackingNumber || '');
    
    // Dynamically convert stored TWD cents discount to Platform Currency
    const poPlatform = platforms.find(p => p.id === po.supplierId);
    const poCurrency = poPlatform?.currency || 'NTD';
    if (po.discount) {
      if (poCurrency === 'IDR') {
        const idrDiscount = Math.round((po.discount / 100) / (po.exchangeRate || FALLBACK_NTD_PER_IDR));
        setPoDiscount(String(idrDiscount));
      } else if (poCurrency === 'USD') {
        const usdDiscount = (po.discount / 100) / (po.exchangeRate || FALLBACK_NTD_PER_USD);
        setPoDiscount(String(usdDiscount));
      } else {
        setPoDiscount(String(po.discount / 100));
      }
    } else {
      setPoDiscount('0');
    }

    setActualReceiptTotal('');
    
    // Map items to addedItems
    const poItems = po.items && po.items.length > 0 ? po.items : [{
      bookId: po.bookId,
      bookName: po.bookName,
      qty: po.qty,
      qtyReceived: po.qtyReceived || 0,
      isCancelled: po.isCancelled || false,
      pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceUSD || po.purchasePriceNTD / 100,
      priceNTDTotal: po.purchasePriceNTD,
      pricePerItem: po.pricePerUnitNTD
    }];

    const mappedItems = poItems.map((item: any) => {
      let itemQty = item.qty;
      if (po.isClosedPartially && item.qtyReceived !== undefined) {
        itemQty = item.qtyReceived;
      }

      const unitPriceNTD = item.pricePerItem || item.pricePerUnitNTD || ((item.priceNTDTotal || 0) / (item.qty || 1)) || 0;
      const adjustedPriceNTD = itemQty * (unitPriceNTD / 100);

      let itemPlatTotal = item.pricePlatformTotal;
      if (itemPlatTotal === undefined || itemPlatTotal === null) {
        itemPlatTotal = poCurrency === 'IDR' ? (po.purchasePriceIDR || 0) : poCurrency === 'USD' ? (po.purchasePriceUSD || 0) : ((po.purchasePriceNTD || 0) / 100);
      }
      if (po.isClosedPartially && item.qty && item.qty > 0 && itemQty !== item.qty) {
        itemPlatTotal = itemPlatTotal * (itemQty / item.qty);
      }

      const formattedPlatPrice = poCurrency === 'IDR' ? Math.round(itemPlatTotal) : Number(itemPlatTotal.toFixed(2));

      return {
        bookId: item.bookId,
        bookName: item.bookName,
        qtyStr: String(itemQty),
        qtyReceived: item.qtyReceived || 0,
        isCancelled: item.isCancelled || false,
        pricePlatformStr: String(formattedPlatPrice),
        priceNTDStr: Number(adjustedPriceNTD).toFixed(2),
        pricePerItemStr: Number(unitPriceNTD / 100).toFixed(2),
        pricePlatformTotal: formattedPlatPrice,
        priceNTDTotal: Math.round(adjustedPriceNTD * 100),
        pricePerItem: unitPriceNTD,
        priceReviewStatus: item.priceReviewStatus || null
      };
    });

    setAddedItems(mappedItems);
    
    setIsNewPoOpen(true);
  };

  // Handle Viewing an existing PO (Read-Only)
  const handleViewPO = (po: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPoViewOnly(true);
    setEditingPoId(po.id);
    setSelectedPo(po); // Ensure receiptLogs can be resolved if needed
    setPoDate(parsePoDateToString(po.purchaseDate || po.createdAt || po.date));
    setPlatformId(po.supplierId || '');
    setPoPaymentStatus(po.paymentStatus || 'paid');
    setSupplierOrderNumber(po.supplierOrderNumber || '');
    setSupplierTrackingNumber(po.supplierTrackingNumber || '');
    
    // Dynamically convert stored TWD cents discount to Platform Currency
    const poPlatform = platforms.find(p => p.id === po.supplierId);
    const poCurrency = poPlatform?.currency || 'NTD';
    if (po.discount) {
      if (poCurrency === 'IDR') {
        const idrDiscount = Math.round((po.discount / 100) / (po.exchangeRate || FALLBACK_NTD_PER_IDR));
        setPoDiscount(String(idrDiscount));
      } else if (poCurrency === 'USD') {
        const usdDiscount = (po.discount / 100) / (po.exchangeRate || FALLBACK_NTD_PER_USD);
        setPoDiscount(String(usdDiscount));
      } else {
        setPoDiscount(String(po.discount / 100));
      }
    } else {
      setPoDiscount('0');
    }

    setActualReceiptTotal('');
    
    // Map items to addedItems
    const poItems = po.items && po.items.length > 0 ? po.items : [{
      bookId: po.bookId,
      bookName: po.bookName,
      qty: po.qty,
      qtyReceived: po.qtyReceived || 0,
      isCancelled: po.isCancelled || false,
      pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
      priceNTDTotal: po.purchasePriceNTD,
      pricePerItem: po.pricePerUnitNTD
    }];

    setAddedItems(poItems.map((item: any) => ({
      bookId: item.bookId,
      bookName: item.bookName,
      qtyStr: String(item.qty),
      qtyReceived: item.qtyReceived || 0,
      isCancelled: item.isCancelled || false,
      pricePlatformStr: String(item.pricePlatformTotal || 0),
      priceNTDStr: String((item.priceNTDTotal || 0) / 100),
      pricePerItemStr: String((item.pricePerItem || 0) / 100),
      pricePlatformTotal: item.pricePlatformTotal || 0,
      priceNTDTotal: item.priceNTDTotal || 0,
      pricePerItem: item.pricePerItem || 0,
      priceReviewStatus: item.priceReviewStatus || null
    })));
    
    setIsNewPoOpen(true);
  };

  // Revert PO Status back to exactly PENDING
  const handleRevertPOStatus = async (po: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (po.status === 'pending') {
      alert("Order is already at its initial state (Pending).");
      return;
    }

    try {
      const batch = writeBatch(db);

      // Find all cashFlow entries associated with this PO
      const cfSnap = await getDocs(
        query(
          collection(db, 'cashFlow'),
          where('refId', '==', po.id)
        )
      );
      const cfDocsToDelete = cfSnap.docs.filter(docSnap => docSnap.data().refType === 'purchase_order');
      
      // Delete cashFlow entries
      cfDocsToDelete.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      // Find all inventoryLedger entries associated with this PO
      const ledgerDeleteSnap = await getDocs(
        query(
          collection(db, 'inventoryLedger'),
          where('refId', '==', po.id)
        )
      );
      const ledgerDocsToDelete = ledgerDeleteSnap.docs.filter(docSnap => docSnap.data().refCollection === 'purchaseOrders');

      // Delete inventoryLedger entries
      ledgerDocsToDelete.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      // Delete auto-journal entries
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-freight`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-capitalize`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-capitalize-mig`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-close`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-close-refund`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-close-selisih`));
      
      // Aggressively find and delete any other journals related to this PO (e.g. corrections)
      const journalsQuery1 = query(collection(db, 'journalEntries'), where('refId', '==', po.id));
      const journalsQuery2 = query(collection(db, 'journalEntries'), where('refId', '==', po.purchaseCode));
      const journalsQuery3 = query(collection(db, 'journalEntries'), where('sourceId', '==', po.id));
      
      const [jSnap1, jSnap2, jSnap3] = await Promise.all([getDocs(journalsQuery1), getDocs(journalsQuery2), getDocs(journalsQuery3)]);
      
      const allJournals = new Map();
      jSnap1.forEach(d => allJournals.set(d.id, d));
      jSnap2.forEach(d => allJournals.set(d.id, d));
      jSnap3.forEach(d => allJournals.set(d.id, d));
      
      allJournals.forEach((docSnap, jId) => {
        const data = docSnap.data();
        // Do not delete the creation journal
        if (jId !== `JU-PO-${po.id}-create` && data.description !== 'Pemesanan Barang') {
          batch.delete(docSnap.ref);
        }
      });
      
      const receiptEventsSnap = await getDocs(collection(db, 'purchaseOrders', po.id, 'receiptEvents'));
      const freightsToUncapitalize = new Set<string>();
      
      receiptEventsSnap.forEach(d => {
        batch.delete(d.ref);
        batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-capitalize-${d.id}`));
        const data = d.data();
        if (data.freightCode) {
          freightsToUncapitalize.add(data.freightCode);
        }
      });
      
      // Uncapitalize associated Freight-In records if they were capitalized
      for (const fCode of Array.from(freightsToUncapitalize)) {
        const freightRef = doc(db, 'freightIn', fCode);
        const freightSnap = await getDoc(freightRef);
        if (freightSnap.exists()) {
          const fData = freightSnap.data();
          if (fData.isCapitalized) {
            batch.update(freightRef, {
              isCapitalized: false,
              capitalizationJournalId: ''
            });
            if (fData.capitalizationJournalId) {
              batch.delete(doc(db, 'journalEntries', fData.capitalizationJournalId));
            }
          }
        }
      }
      
      const poItems = po.items && po.items.length > 0 ? po.items : [{ bookId: po.bookId, qty: po.qty, qtyReceived: po.qtyReceived || 0, isCancelled: po.status === 'cancelled' }];
      for (const item of poItems) {
        const qtyReceived = item.qtyReceived || 0;
        const originalQty = item.cancelledQty ? (item.isCancelled ? item.qty : (item.qty + item.cancelledQty)) : item.qty;
        
        const inTransitToAdd = originalQty;
        const stockToSubtract = qtyReceived;

        const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', item.bookId)));
        if (!invSnap.empty) {
          const invRef = doc(db, 'inventory', item.bookId);
          const cur = invSnap.docs[0].data();
          
          // Revert moving average cost to before this receipt by fetching the latest previous ledger entry
          let nextAvgCost = cur.movingAverageCost || 0;
          const ledgersSnap = await getDocs(
            query(collection(db, 'inventoryLedger'), where('bookId', '==', item.bookId))
          );
          const remainingLedgers = ledgersSnap.docs
            .map(d => d.data())
            .filter(d => d.refId !== po.id)
            .sort((a, b) => {
              const timeA = a.timestamp?.seconds || 0;
              const timeB = b.timestamp?.seconds || 0;
              return timeB - timeA;
            });
            
          if (remainingLedgers.length > 0) {
            nextAvgCost = remainingLedgers[0].movingAvgAfter || 0;
          } else {
            nextAvgCost = 0;
          }

          const nextEnding = Math.max(0, (cur.endingStock || 0) - stockToSubtract);
          const nextReady = Math.max(0, (cur.readyStock || 0) - stockToSubtract);
          const nextTransit = (cur.inTransitStock || 0) + inTransitToAdd;
          
          batch.update(invRef, {
            endingStock: nextEnding,
            readyStock: nextReady,
            inTransitStock: nextTransit,
            movingAverageCost: nextAvgCost,
            totalInventoryValue: new Decimal(nextEnding).mul(nextAvgCost).toNumber(),
            stockStatus: nextEnding > 0 ? 'in_stock' : 'sold_out',
            lastUpdated: Timestamp.now()
          });
        }
      }

      // Reset nested items in PO to pending stats and restore their original quantities
      const cleanItems = poItems.map((item: any) => {
        const originalQty = item.cancelledQty ? (item.isCancelled ? item.qty : (item.qty + item.cancelledQty)) : item.qty;
        const { cancelledQty, ...rest } = item;
        return {
          ...rest,
          qty: originalQty,
          qtyReceived: 0,
          isCancelled: false
        };
      });

      // Implement an updateDoc call that strictly resets the Firestore document status to 'pending'
      const updatePromise = updateDoc(doc(db, 'purchaseOrders', po.id), {
        status: 'pending',
        items: cleanItems,
        qtyReceived: 0,
        isCancelled: false,
        isClosedPartially: false,
        kodeEkspedisi: '',
        receipts: [],
        receiptLogs: [],
        updatedAt: Timestamp.now()
      });

      // Update local state array simultaneously to ensure immediate UI feedback
      setPurchaseOrders(prev => prev.map(p => {
        if (p.id === po.id) {
          return {
            ...p,
            status: 'pending',
            items: cleanItems,
            qtyReceived: 0,
            isCancelled: false,
            isClosedPartially: false,
            kodeEkspedisi: '',
            receipts: [],
            receiptLogs: []
          };
        }
        return p;
      }));

      // Commit child adjustments and Firestore updates in parallel
      await Promise.all([batch.commit(), updatePromise]);

      alert(`Status pembelian ${po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')} berhasil dikembalikan ke "PENDING".`);
    } catch (err: any) {
      alert("Gagal mengembalikan status pembelian: " + err.message);
    }
  };

  // Submit and save newly drafted multi-item Purchase Order
  const handleSavePurchaseOrder = async (e?: React.FormEvent | React.MouseEvent, saveAsDraft: boolean = false) => {
    if (e) e.preventDefault();
    let hasError = false;

    if (!platformId) {
      triggerShake('platformId');
      hasError = true;
    }
    if (!supplierOrderNumber.trim()) {
      triggerShake('supplierOrderNumber');
      hasError = true;
    }
    if (addedItems.length === 0) {
      triggerShake('addedItems');
      hasError = true;
    }
    // Validate each lane has positive Qty and Prices
    addedItems.forEach((item, idx) => {
      const q = parseCommasToNumber(item.qtyStr);
      const prPlat = parseCommasToNumber(item.pricePlatformStr);
      const prNtd = parseCommasToNumber(item.priceNTDStr);
      if (q <= 0) {
        triggerShake(`qty-${idx}`);
        hasError = true;
      }
      if (prPlat <= 0 || prNtd <= 0) {
        triggerShake(`price-${idx}`);
        hasError = true;
      }
    });

    if (hasError) return;

    // Validation for poDiscount: cannot be negative, cannot exceed subtotal in platform currency
    const parsedDiscount = parseFloat(cleanCommas(poDiscount || '0'));
    const selectedPlatformForVal = platforms.find(p => p.id === platformId);
    const isIdrVal = selectedPlatformForVal?.currency === 'IDR';
    const isUsdVal = selectedPlatformForVal?.currency === 'USD';
    const subtotalVal = addedItems.reduce((acc, it) => {
      if (isIdrVal) {
        return acc + parseCommasToNumber(it.pricePlatformStr);
      } else if (isUsdVal) {
        return acc + parseCommasToNumber(it.pricePlatformStr);
      } else {
        return acc + parseCommasToNumber(it.priceNTDStr);
      }
    }, 0);

    if (parsedDiscount < 0) {
      alert("Diskon tidak boleh negatif!");
      return;
    }
    if (parsedDiscount > subtotalVal) {
      alert("Diskon tidak boleh melebihi Total Belanja di Form!");
      return;
    }

    try {
      let poId = doc(collection(db, 'purchaseOrders')).id;
      let existingPo: any = null;
      let sysPoCode = '';

      if (editingPoId) {
        poId = editingPoId;
        existingPo = purchaseOrders.find(p => p.id === editingPoId);
        sysPoCode = existingPo.purchaseCode || await generateSystemPoNumber();
      } else {
        sysPoCode = await generateSystemPoNumber();
      }

      const poRef = doc(db, 'purchaseOrders', poId);

      // Compute aggregates
      let aggregateQty = 0;
      let aggregatePlatformCurTotal = 0;
      let aggregateNTDTotalCents = 0;

      const itemsPayload = addedItems.map(item => {
        const q = parseCommasToNumber(item.qtyStr);
        const pPlat = parseCommasToNumber(item.pricePlatformStr);
        const pNtd = parseCommasToNumber(item.priceNTDStr);
        const pPerItem = parseCommasToNumber(item.pricePerItemStr);

        aggregateQty += q;
        aggregatePlatformCurTotal += pPlat;
        aggregateNTDTotalCents += (pNtd * 100); // NTD cents

        return {
          bookId: item.bookId,
          bookName: item.bookName,
          qty: q,
          pricePlatformTotal: pPlat,
          priceNTDTotal: pNtd * 100, // Cents conversion
          pricePerItem: pPerItem * 100, // Cents conversion
          qtyReceived: item.qtyReceived || 0,
          isCancelled: item.isCancelled || false,
          priceReviewStatus: item.priceReviewStatus || null
        };
      });

      const firstItem = itemsPayload[0];

      const selectedPlatform = platforms.find(p => p.id === platformId);

      const isIdrCurrency = selectedPlatform?.currency === 'IDR';
      const isNtd = selectedPlatform?.currency === 'NTD' || !selectedPlatform?.currency;
      const discountPlatformCur = isNtd ? 0 : parseFloat(cleanCommas(poDiscount || '0'));
      const discountCents = isNtd 
        ? Math.round(parseFloat(cleanCommas(poDiscount || '0')) * 100)
        : Math.round(discountPlatformCur * currentFXRate * 100);

      const netNTDTotalCents = Math.max(0, aggregateNTDTotalCents - discountCents);
      const netPlatformCurTotal = Math.max(0, aggregatePlatformCurTotal - discountPlatformCur);

      const poPayload: any = {
        ...existingPo,
        id: poId,
        purchaseCode: sysPoCode,
        purchaseDate: convertStringToTimestamp(poDate),
        bookId: firstItem.bookId, // legacy support
        bookName: itemsPayload.length === 1 ? firstItem.bookName : `${firstItem.bookName} + ${itemsPayload.length - 1} item lainnya`,
        qty: aggregateQty,
        supplierId: platformId,
        supplierName: selectedPlatform?.name || 'Unknown platform',
        purchasePriceIDR: selectedPlatform?.currency === 'IDR' ? netPlatformCurTotal : 0,
        purchasePriceUSD: selectedPlatform?.currency === 'USD' ? netPlatformCurTotal : 0,
        exchangeRate: currentFXRate,
        discount: discountCents,
        purchasePriceNTD: netNTDTotalCents, // cents
        pricePerUnitNTD: Math.round(netNTDTotalCents / aggregateQty), // cents
        supplierOrderNumber: supplierOrderNumber.trim(),
        supplierTrackingNumber: supplierTrackingNumber.trim(),
        items: itemsPayload,
        paymentStatus: poPaymentStatus,
        isUnpaid: poPaymentStatus === 'unpaid',
        wasCredit: poPaymentStatus === 'unpaid' || existingPo?.wasCredit === true,
        amountPaid: editingPoId ? (existingPo?.amountPaid || 0) : (poPaymentStatus === 'unpaid' ? 0 : netNTDTotalCents),
        updatedAt: Timestamp.now()
      };

      if (existingPo && existingPo.isClosedPartially) {
        poPayload.adjustmentStatus = saveAsDraft ? 'draft' : 'saved';
      }

      const batch = writeBatch(db);

      // Retroactive Adjustment check for existing PO updates
      if (editingPoId && existingPo && !saveAsDraft) {
        const coaSnap = await getDocs(collection(db, 'coa'));
        const coaAccounts = coaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        const adjAccount = findAccountBySystemKey(coaAccounts, 'inventory_adjustment') || { code: '5500', name: 'Beban Kerugian Pembelian' };

        const oldItems = existingPo.items && existingPo.items.length > 0 ? existingPo.items : [{ bookId: existingPo.bookId, qty: existingPo.qty, qtyReceived: existingPo.qtyReceived || 0, pricePerItem: existingPo.pricePerUnitNTD || 0 }];
        const oldTotalQtyOrdered = oldItems.filter((it: any) => !it.isCancelled).reduce((sum: number, it: any) => sum + (it.qty || 0), 0) || 1;
        const oldDiscountCents = existingPo.discount || 0;
        const oldFreightCents = (existingPo.forwarderFeeNTD || 0) * 100;

        const newTotalQtyOrdered = itemsPayload.filter((it: any) => !it.isCancelled).reduce((sum: number, it: any) => sum + (it.qty || 0), 0) || 1;
        const newDiscountCents = discountCents;
        const newFreightCents = (existingPo.forwarderFeeNTD || 0) * 100;

        for (const newItem of itemsPayload) {
          const oldItem = oldItems.find((it: any) => it.bookId === newItem.bookId);
          if (!oldItem) continue;

          const qtyReceived = oldItem.qtyReceived || 0;
          if (qtyReceived <= 0) continue;

          // Compute old unit landed cost (cents)
          const oldItemPricePerItem = oldItem.pricePerItem || (existingPo.pricePerUnitNTD || 0);
          const oldAvgCostCents = Math.round(oldItemPricePerItem - (oldDiscountCents / oldTotalQtyOrdered) + (oldFreightCents / oldTotalQtyOrdered));

          // Compute new unit landed cost (cents)
          const newAvgCostCents = Math.round(newItem.pricePerItem - (newDiscountCents / newTotalQtyOrdered) + (newFreightCents / newTotalQtyOrdered));

          if (newAvgCostCents !== oldAvgCostCents) {
            const correctionCents = qtyReceived * (newAvgCostCents - oldAvgCostCents);
            
            // 1. Create a correction journal entry
            const corrJournalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
            const corrJournalRef = doc(db, 'journalEntries', corrJournalId);
            
            const invAcc = getInventoryAccount();
            const absCorrection = Math.abs(correctionCents);

            const isCreditCorrection = correctionCents < 0;
            const corrLines = [
              {
                account: isCreditCorrection ? adjAccount.name : invAcc.name,
                accountCode: isCreditCorrection ? adjAccount.code : invAcc.code,
                debit: absCorrection,
                credit: 0,
                ...(isIdrCurrency ? {
                  originalCurrency: 'IDR',
                  originalDebitIDR: Math.round(absCorrection / 100 / currentFXRate),
                  originalCreditIDR: 0
                } : {})
              },
              {
                account: isCreditCorrection ? invAcc.name : adjAccount.name,
                accountCode: isCreditCorrection ? invAcc.code : adjAccount.code,
                debit: 0,
                credit: absCorrection,
                ...(isIdrCurrency ? {
                  originalCurrency: 'IDR',
                  originalDebitIDR: 0,
                  originalCreditIDR: Math.round(absCorrection / 100 / currentFXRate)
                } : {})
              }
            ];

            const corrJournalPayload = {
              id: corrJournalId,
              date: Timestamp.now(),
              description: `Koreksi Nilai Persediaan PO #${sysPoCode} - ${newItem.bookName}`,
              refType: 'System',
              refId: sysPoCode,
              createdAt: Timestamp.now(),
              lines: corrLines,
              poCode: sysPoCode,
              isCorrectionJournal: true
            };

            batch.set(corrJournalRef, corrJournalPayload);

            // 2. Adjust the inventory document
            const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', newItem.bookId)));
            if (!invSnap.empty) {
              const invRef = doc(db, 'inventory', newItem.bookId);
              const curData = invSnap.docs[0].data();
              const endingStock = curData.endingStock || 0;
              const totalInventoryValue = curData.totalInventoryValue || 0;
              const newTotalInventoryValue = Math.max(0, totalInventoryValue + correctionCents);
              const newMovingAverageCost = endingStock > 0 ? Math.round(newTotalInventoryValue / endingStock) : curData.movingAverageCost;

              batch.update(invRef, {
                totalInventoryValue: newTotalInventoryValue,
                movingAverageCost: newMovingAverageCost,
                lastUpdated: Timestamp.now()
              });
            }
          }
        }
      }

      // Auto-journal entry on creation / update (skip if saving draft adjustment)
      if (!saveAsDraft) {
        // Fetch sequential ID for creation
        let journalId = `JU-PO-${poId}-create`;
        const tglForJrn = existingPo ? existingPo.purchaseDate?.toDate?.() || new Date(existingPo.purchaseDate) : new Date();
        const dateStrForJrn = (tglForJrn instanceof Date && !isNaN(tglForJrn.getTime()) ? tglForJrn : new Date()).toISOString().split('T')[0];
        
        // If editing and it already has a sequential ID, we should try to keep it, 
        // but creation journal isn't explicitly saved in PO document. 
        // We will just create a new sequential ID and delete the old ones if any (which is handled below)
        journalId = await getNextJournalId(dateStrForJrn);
        
        const journalRef = doc(db, 'journalEntries', journalId);

        // Ensure required accounts exist in Chart of Accounts (CoA)
        const transitAcc = getInventoryInTransitAccount();
        const cashAcc = getCashAccount(isIdrCurrency ? 'IDR' : 'NTD');
        const isCredit = poPaymentStatus === 'unpaid';

        await ensureAutoAccountExists(transitAcc);
        if (isCredit) {
          await ensureAutoAccountExists({ code: '2100', name: 'Utang Usaha', type: 'Liabilities', subType: 'Kewajiban Lancar' });
        } else {
          await ensureAutoAccountExists(cashAcc);
        }

        // Delete previous creation journal if it exists (so we don't duplicate on edit)
        if (editingPoId) {
          const oldJrnSnap1 = await getDocs(query(collection(db, 'journalEntries'), where('refId', '==', sysPoCode)));
          oldJrnSnap1.forEach(d => {
            if (d.data().description === 'Pemesanan Barang') batch.delete(d.ref);
          });
          const oldJrnSnap2 = await getDocs(query(collection(db, 'journalEntries'), where('refId', '==', poId)));
          oldJrnSnap2.forEach(d => {
            if (d.data().description === 'Pemesanan Barang') batch.delete(d.ref);
          });
          
          const oldJrnSnap3 = await getDocs(query(collection(db, 'journalEntries'), where('sourceId', '==', poId)));
          oldJrnSnap3.forEach(d => {
            if (d.data().description === 'Pemesanan Barang') batch.delete(d.ref);
          });

          batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-create`));
        }
        
        // Keep the original purchase price for the creation journal if adjusted
        let createJournalNTDCents = netNTDTotalCents;
        let createJournalPlatformTotal = netPlatformCurTotal;

        if (editingPoId && existingPo && existingPo.isClosedPartially) {
          createJournalNTDCents = existingPo.originalPurchasePriceNTD || existingPo.purchasePriceNTD || netNTDTotalCents;
          createJournalPlatformTotal = (selectedPlatform?.currency === 'IDR' ? (existingPo.originalPurchasePriceIDR || existingPo.purchasePriceIDR || 0) : (selectedPlatform?.currency === 'USD' ? (existingPo.originalPurchasePriceUSD || existingPo.purchasePriceUSD || 0) : 0)) || netPlatformCurTotal;
        }

        const journalPayload: any = {
          id: journalId,
          date: existingPo ? existingPo.purchaseDate : Timestamp.now(),
          description: 'Pemesanan Barang',
          refType: 'System',
          refId: sysPoCode,
          createdAt: existingPo ? (existingPo.createdAt || Timestamp.now()) : Timestamp.now(),
          lines: [
            {
              account: transitAcc.name,
              accountCode: transitAcc.code,
              debit: createJournalNTDCents,
              credit: 0,
              ...(isIdrCurrency ? {
                originalCurrency: 'IDR',
                originalDebitIDR: createJournalPlatformTotal,
                originalCreditIDR: 0
              } : {})
            },
            {
              account: isCredit ? 'Utang Usaha' : cashAcc.name,
              accountCode: isCredit ? '2100' : cashAcc.code,
              debit: 0,
              credit: createJournalNTDCents,
              ...(isIdrCurrency ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: createJournalPlatformTotal
              } : {})
            }
          ]
        };
        batch.set(journalRef, journalPayload);

        // Also update close reconciliation journal if adjusting closed partially PO (only for non-refund closures)
        if (editingPoId && existingPo && existingPo.isClosedPartially && existingPo.closePoOption !== 'refund') {
          const closeJournalQuery = query(collection(db, 'journalEntries'), where('refId', '==', poId), where('description', '==', 'Tutup Pesanan (Potongan/Selisih)'));
          const closeJournalSnapDocs = await getDocs(closeJournalQuery);
          let closeJournalSnap = { exists: () => false, data: () => null };
          let closeJournalRef = null;
          if (!closeJournalSnapDocs.empty) {
            closeJournalRef = closeJournalSnapDocs.docs[0].ref;
            closeJournalSnap = { exists: () => true, data: () => closeJournalSnapDocs.docs[0].data() };
          }

          const initialNTDTotal = existingPo.originalPurchasePriceNTD || existingPo.purchasePriceNTD || 0;
          const initialPlatformTotal = (selectedPlatform?.currency === 'IDR' ? (existingPo.originalPurchasePriceIDR || existingPo.purchasePriceIDR || 0) : (selectedPlatform?.currency === 'USD' ? (existingPo.originalPurchasePriceUSD || existingPo.purchasePriceUSD || 0) : 0)) || 0;

          const adjustmentNTDCents = Math.max(0, initialNTDTotal - netNTDTotalCents);
          const adjustmentPlatformTotal = Math.max(0, initialPlatformTotal - netPlatformCurTotal);

          if (closeJournalSnap.exists()) {
            const jData = closeJournalSnap.data();
            const updatedLines = jData.lines.map((line: any, index: number) => {
              const lineCopy = { ...line };
              if (index === 0) {
                lineCopy.debit = adjustmentNTDCents;
                lineCopy.credit = 0;
                if (isIdrCurrency) {
                  lineCopy.originalDebitIDR = adjustmentPlatformTotal;
                  lineCopy.originalCreditIDR = 0;
                }
              } else if (index === 1) {
                lineCopy.debit = 0;
                lineCopy.credit = adjustmentNTDCents;
                if (isIdrCurrency) {
                  lineCopy.originalDebitIDR = 0;
                  lineCopy.originalCreditIDR = adjustmentPlatformTotal;
                }
              }
              return lineCopy;
            });
            batch.update(closeJournalRef!, {
              lines: updatedLines,
              updatedAt: Timestamp.now()
            });
          } else {
            if (!closeJournalRef) {
              const newCloseId = await getNextJournalId(new Date().toISOString().split('T')[0]);
              closeJournalRef = doc(db, 'journalEntries', newCloseId);
            }
            const transitAcc = getInventoryInTransitAccount();
            const cashAcc = getCashAccount(isIdrCurrency ? 'IDR' : 'NTD');
            const isCredit = poPaymentStatus === 'unpaid';

            let offsetAccountCode = '';
            let offsetAccountName = '';
            const poCloseOption = existingPo.closePoOption || 'refund';

            if (isCredit) {
              offsetAccountCode = '2100';
              offsetAccountName = 'Utang Usaha';
            } else {
              if (poCloseOption === 'refund') {
                offsetAccountCode = cashAcc.code;
                offsetAccountName = cashAcc.name;
              } else {
                offsetAccountCode = '5500';
                offsetAccountName = 'Beban Kerugian Pembelian';
              }
            }

            const closeJournalPayload: any = {
              id: closeJournalRef!.id,
              date: Timestamp.now(),
              description: `Tutup Sisa PO ${existingPo.purchaseCode} - Penyesuaian`,
              refType: 'System',
              refId: existingPo.purchaseCode,
              createdAt: Timestamp.now(),
              lines: [
                {
                  account: offsetAccountName,
                  accountCode: offsetAccountCode,
                  debit: adjustmentNTDCents,
                  credit: 0,
                  ...(isIdrCurrency ? {
                    originalCurrency: 'IDR',
                    originalDebitIDR: adjustmentPlatformTotal,
                    originalCreditIDR: 0
                  } : {})
                },
                {
                  account: transitAcc.name,
                  accountCode: transitAcc.code,
                  debit: 0,
                  credit: adjustmentNTDCents,
                  ...(isIdrCurrency ? {
                    originalCurrency: 'IDR',
                    originalDebitIDR: 0,
                    originalCreditIDR: adjustmentPlatformTotal
                  } : {})
                }
              ]
            };
            batch.set(closeJournalRef, closeJournalPayload);
          }
        }
      }

      if (!editingPoId) {
        poPayload.createdAt = Timestamp.now();
        poPayload.forwarderFeeNTD = 0;
        poPayload.status = 'pending';
        poPayload.isShipped = false;
        poPayload.receipts = [];
        poPayload.receiptLogs = [];
        batch.set(poRef, poPayload);
      } else {
        batch.update(poRef, poPayload);
      }

      // If editing and NOT a closed/adjusted PO, adjust inTransitStock first
      if (!existingPo?.isClosedPartially) {
        if (editingPoId && existingPo) {
          const oldItems = existingPo.items && existingPo.items.length > 0 ? existingPo.items : [{ bookId: existingPo.bookId, qty: existingPo.qty }];
          for (const item of oldItems) {
            const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', item.bookId)));
            if (!invSnap.empty) {
              const invRef = doc(db, 'inventory', item.bookId);
              const curData = invSnap.docs[0].data();
              batch.update(invRef, {
                inTransitStock: Math.max(0, (curData.inTransitStock || 0) - item.qty),
                lastUpdated: Timestamp.now()
              });
            }
          }
        }

        // Increment inTransitStock on dynamic books inventory catalog for the new / updated books
        for (const item of itemsPayload) {
          const invRef = doc(db, 'inventory', item.bookId);
          const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', item.bookId)));
          
          if (invSnap.empty) {
            batch.set(invRef, {
              bookId: item.bookId,
              initialStock: 0,
              totalPurchased: 0,
              totalDispatched: 0,
              endingStock: 0,
              readyStock: 0,
              shippedStock: 0,
              inTransitStock: item.qty,
              ordersPlaced: 1,
              ordersShipped: 0,
              movingAverageCost: 0,
              totalInventoryValue: 0,
              stockStatus: 'sold_out',
              lastUpdated: Timestamp.now()
            });
          } else {
            const curData = invSnap.docs[0].data();
            batch.update(invRef, {
              inTransitStock: (curData.inTransitStock || 0) + item.qty,
              ordersPlaced: editingPoId ? (curData.ordersPlaced || 0) : ((curData.ordersPlaced || 0) + 1),
              lastUpdated: Timestamp.now()
            });
          }
        }
      }

      await batch.commit();

      setIsNewPoOpen(false);
      const defaultPlat = platforms.find(p => p.name.includes("Shopee Indonesia") && p.currency === 'IDR') || platforms[0];
      if (defaultPlat) {
        setPlatformId(defaultPlat.id);
      } else {
        setPlatformId('');
      }
      setPoPaymentStatus('paid');
      setSupplierOrderNumber('');
      setSupplierTrackingNumber('');
      setAddedItems([]);
      setPreviewCoverIdx(null);
      setEditingPoId(null);
    } catch (err: any) {
      alert("Error saving Purchase Order: " + err.message);
    }
  };

  const handleStep = (bookId: string, delta: number, remainingQty: number) => {
    setReceiveItemsState(prev => {
      const row = prev[bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
      const currentVal = parseCommasToNumber(row.qtyReceivedThisTime) || 0;
      const minQty = 0;
      const newVal = Math.max(minQty, Math.min(remainingQty, currentVal + delta));
      const isFull = newVal >= remainingQty;
      return {
        ...prev,
        [bookId]: {
          ...row,
          qtyReceivedThisTime: String(newVal),
          isCancelled: isFull ? false : row.isCancelled
        }
      };
    });
  };

  const handleDirectInput = (bookId: string, remainingQty: number, value: string) => {
    const cleanInput = value.replace(/\D/g, '');
    if (cleanInput === '') {
      setReceiveItemsState(prev => {
        const row = prev[bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
        return {
          ...prev,
          [bookId]: {
            ...row,
            qtyReceivedThisTime: ''
          }
        };
      });
      return;
    }
    const valNum = parseInt(cleanInput, 10);
    const minQty = 0;
    const clampedVal = Math.max(minQty, Math.min(remainingQty, valNum));
    setReceiveItemsState(prev => {
      const row = prev[bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
      const isFull = clampedVal >= remainingQty;
      return {
        ...prev,
        [bookId]: {
          ...row,
          qtyReceivedThisTime: String(clampedVal),
          isCancelled: isFull ? false : row.isCancelled
        }
      };
    });
  };

  // Open receiving Goods Modal
  const handleOpenReceiveGoods = (po: any) => {
    setSelectedPo(po);
    const poItems = po.items && po.items.length > 0 ? po.items : [{
      bookId: po.bookId,
      bookName: po.bookName,
      qty: po.qty,
      qtyReceived: 0,
      pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
      priceNTDTotal: po.purchasePriceNTD,
      pricePerItem: po.pricePerUnitNTD
    }];

    const initialMap: Record<string, { qtyReceivedThisTime: string, isCancelled: boolean }> = {};
    poItems.forEach((it: any) => {
      const remaining = Math.max(0, it.qty - (it.qtyReceived || 0));
      initialMap[it.bookId] = {
        qtyReceivedThisTime: remaining.toLocaleString('en-US', {maximumFractionDigits: 2}),
        isCancelled: false
      };
    });

    setReceiveItemsState(initialMap);
    setReceiveDate(formatToYYYYMMDD(new Date()));
    setReceiveNoteGlobal('');
    setReceiveKodeEkspedisi('');
    setIsReceiveOpen(true);
  };

  // Process Received Goods Confirmations
  const handleProcessReceiveGoods = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPo || isProcessingReceive) return;
    setIsProcessingReceive(true);

    let hasError = false;
    const poItems = selectedPo.items && selectedPo.items.length > 0 ? selectedPo.items : [{
      bookId: selectedPo.bookId,
      bookName: selectedPo.bookName,
      qty: selectedPo.qty,
      qtyReceived: 0,
      pricePlatformTotal: selectedPo.purchasePriceIDR || selectedPo.purchasePriceNTD / 100,
      priceNTDTotal: selectedPo.purchasePriceNTD,
      pricePerItem: selectedPo.pricePerUnitNTD
    }];

    // Validate we're not putting in negative/corrupt items
    poItems.forEach((it: any) => {
      const rowState = receiveItemsState[it.bookId];
      if (!rowState) return;
      if (!rowState.isCancelled) {
        const num = parseCommasToNumber(rowState.qtyReceivedThisTime);
        if (num < 0) {
          triggerShake(`rec-${it.bookId}`);
          hasError = true;
        }
      }
    });

    const cleanFreightCode = receiveKodeEkspedisi.trim().toUpperCase();
    if (cleanFreightCode) {
      if (getFreightStatus(cleanFreightCode) === 'Completed') {
        alert(`Nomor Freight-In "${cleanFreightCode}" sudah dijurnalkan (dikapitalisasi) dan tidak boleh digunakan lagi untuk transaksi penerimaan baru.`);
        hasError = true;
      }
    }

    if (hasError) {
      setIsProcessingReceive(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      const currencyLabel = selectedPo.purchasePriceIDR ? 'IDR' : selectedPo.purchasePriceUSD ? 'USD' : 'NTD';

      let latestLogs: string[] = [...(selectedPo.receiptLogs || [])];
      let updatedItemsList = poItems.map((it: any) => ({ ...it }));

      let totalReceivedThisRunSum = 0;
      let hasPartialsRemaining = false;
      let allCancelled = true;
      let totalReceivedValueCents = 0;
      let totalReceivedValuePlat = 0;
      let bookDescriptions: string[] = [];

      for (let i = 0; i < updatedItemsList.length; i++) {
        const item = updatedItemsList[i];
        const stateRow = receiveItemsState[item.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };

        if (stateRow.isCancelled) {
          // If already cancelled prior, skip financial returns again
          if (item.isCancelled) {
            continue;
          }

          // Trigger Cancellation financial return refund cashflow & reset inTransit stock
          item.isCancelled = true;

          const refundCashFlowId = doc(collection(db, 'cashFlow')).id;
          const cancelVal = currencyLabel === 'IDR' ? item.pricePlatformTotal : currencyLabel === 'USD' ? item.pricePlatformTotal : Math.round(item.priceNTDTotal / 100);

          batch.set(doc(db, 'cashFlow', refundCashFlowId), {
            id: refundCashFlowId,
            date: Timestamp.now(),
            ledger: currencyLabel === 'USD' ? 'NTD' : currencyLabel,
            direction: 'inflow',
            category: 'wholesale_purchase_cancellation_refund',
            amount: cancelVal,
            amountNTD: Math.round(item.priceNTDTotal / 100),
            fxRateUsed: selectedPo.exchangeRate,
            refType: 'purchase_order',
            refId: selectedPo.id,
            description: `Refunding cancelled book: ${item.bookName}`,
            createdAt: Timestamp.now()
          });

          // Subtract item.qty from inventory inTransitStock
          const invRef = doc(db, 'inventory', item.bookId);
          const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', item.bookId)));
          if (!invSnap.empty) {
            const curData = invSnap.docs[0].data();
            batch.update(invRef, {
              inTransitStock: Math.max(0, (curData.inTransitStock || 0) - (item.qty - (item.qtyReceived || 0))),
              lastUpdated: Timestamp.now()
            });
          }

          latestLogs.push(`${receiveDate} ${item.bookName}: dibatalkan`);
        } else {
          allCancelled = false;
          const qtyRecNum = parseCommasToNumber(stateRow.qtyReceivedThisTime);
          if (qtyRecNum > 0) {
            totalReceivedThisRunSum += qtyRecNum;
            item.qtyReceived = (item.qtyReceived || 0) + qtyRecNum;

            const itemRecValNTDCents = Math.round(item.priceNTDTotal * (qtyRecNum / item.qty));
            totalReceivedValueCents += itemRecValNTDCents;
            totalReceivedValuePlat += currencyLabel === 'IDR' ? Math.round(item.pricePlatformTotal * (qtyRecNum / item.qty)) : 0;
            bookDescriptions.push(`${qtyRecNum} unit ${item.bookName}`);

            // Update inventory
            const invRef = doc(db, 'inventory', item.bookId);
            const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', item.bookId)));

            let prevEnding = 0;
            let prevReady = 0;
            let prevAvg = 0;
            let prevPurchased = 0;
            let prevTransit = 0;

            if (!invSnap.empty) {
              const cur = invSnap.docs[0].data();
              prevEnding = cur.endingStock || 0;
              prevReady = cur.readyStock || 0;
              prevAvg = cur.movingAverageCost || 0;
              prevPurchased = cur.totalPurchased || 0;
              prevTransit = cur.inTransitStock || 0;
            }

            const nextEnding = prevEnding + qtyRecNum;
            const nextReady = prevReady + qtyRecNum;
            const nextTransit = Math.max(0, prevTransit - qtyRecNum);

            // Landed Unit cost in cents
            const totalQtyOrdered = updatedItemsList.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
            const diskon_per_unit_cents = (selectedPo.discount || 0) / totalQtyOrdered;
            const freight_per_unit_cents = ((selectedPo.forwarderFeeNTD || 0) * 100) / totalQtyOrdered;
            const unitLandedCents = item.pricePerItem - diskon_per_unit_cents + freight_per_unit_cents;

            // Recalculate moving average
            let nextAvgCost = unitLandedCents;
            if (prevEnding + qtyRecNum > 0) {
              const prevValDecimal = new Decimal(prevEnding).mul(prevAvg);
              const recValDecimal = new Decimal(qtyRecNum).mul(unitLandedCents);
              nextAvgCost = prevValDecimal.plus(recValDecimal).div(prevEnding + qtyRecNum).toNumber();
            }

            batch.set(invRef, {
              bookId: item.bookId,
              initialStock: 0,
              totalPurchased: prevPurchased + qtyRecNum,
              totalDispatched: 0,
              endingStock: nextEnding,
              readyStock: nextReady,
              inTransitStock: nextTransit,
              movingAverageCost: nextAvgCost,
              totalInventoryValue: new Decimal(nextEnding).mul(nextAvgCost).toNumber(),
              stockStatus: nextEnding > 0 ? 'in_stock' : 'sold_out',
              lastUpdated: Timestamp.now()
            }, { merge: true });

            // Create ledger run
            const ledgerId = doc(collection(db, 'inventoryLedger')).id;
            batch.set(doc(db, 'inventoryLedger', ledgerId), {
              id: ledgerId,
              bookId: item.bookId,
              type: 'purchase_received',
              qtyDelta: qtyRecNum,
              unitCost: unitLandedCents,
              refCollection: 'purchaseOrders',
              refId: selectedPo.id,
              balanceAfter: nextEnding,
              movingAvgAfter: nextAvgCost,
              timestamp: Timestamp.now(),
              userId: user?.uid || 'anonymous'
            });

            // Write Cash flow outflow and Double entry of the received portion (only if PO is paid/cash)
            if (selectedPo.paymentStatus !== 'unpaid') {
              const cfId = doc(collection(db, 'cashFlow')).id;
              const recValPlat = currencyLabel === 'IDR' ? Math.round(item.pricePlatformTotal * (qtyRecNum / item.qty)) : currencyLabel === 'USD' ? Math.round(item.pricePlatformTotal * (qtyRecNum / item.qty)) : Math.round((qtyRecNum * item.pricePerItem) / 100);

              batch.set(doc(db, 'cashFlow', cfId), {
                id: cfId,
                date: Timestamp.now(),
                ledger: currencyLabel === 'USD' ? 'NTD' : currencyLabel,
                direction: 'outflow',
                category: 'wholesale_purchase',
                amount: recValPlat,
                amountNTD: Math.round((qtyRecNum * item.pricePerItem) / 100),
                fxRateUsed: selectedPo.exchangeRate,
                refType: 'purchase_order',
                refId: selectedPo.id,
                description: `Paid partial: received ${qtyRecNum} units of ${item.bookName}`,
                createdAt: Timestamp.now()
              });
            }

            // Log item run progress
            const remaining = Math.max(0, item.qty - item.qtyReceived);
            const freightSuffix = receiveKodeEkspedisi.trim() ? ` (Freight-In: ${receiveKodeEkspedisi.trim().toUpperCase()})` : '';
            if (remaining > 0) {
              latestLogs.push(`${receiveDate} ${item.bookName}: ${qtyRecNum} item kurang ${remaining}${freightSuffix}`);
              hasPartialsRemaining = true;
            } else {
              latestLogs.push(`${receiveDate} ${item.bookName}: ${qtyRecNum} item diterima${freightSuffix}`);
            }
          } else {
            // Did not receive anything this time for this book, check if it still has pending leftovers
            const rem = Math.max(0, item.qty - item.qtyReceived);
            if (rem > 0) {
              hasPartialsRemaining = true;
            }
          }
        }
      }

      // Overall status determination
      let overallStatus = 'pending';
      if (allCancelled) {
        overallStatus = 'cancelled';
      } else if (hasPartialsRemaining) {
        overallStatus = 'partial';
      } else {
        overallStatus = 'received';
      }

      const activeReceipts = [...(selectedPo.receipts || [])];
      if (totalReceivedThisRunSum > 0) {
        const itemsReceivedThisTime = updatedItemsList
          .map((it: any) => {
            const stateRow = receiveItemsState[it.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
            const qty = parseCommasToNumber(stateRow.qtyReceivedThisTime);
            return { bookId: it.bookId, bookName: it.bookName, qtyReceived: qty };
          })
          .filter(it => it.qtyReceived > 0);

        activeReceipts.push({
          receivedDate: Timestamp.now(),
          receivedQty: totalReceivedThisRunSum,
          notes: receiveKodeEkspedisi.trim() 
            ? `[Nomor Freight-In: ${receiveKodeEkspedisi.trim().toUpperCase()}] ${receiveNoteGlobal.trim() || 'Received batch partial run'}` 
            : (receiveNoteGlobal.trim() || 'Received batch partial run'),
          receivedBy: user?.uid || 'anonymous',
          ...(receiveKodeEkspedisi.trim() ? { kodeEkspedisi: receiveKodeEkspedisi.trim().toUpperCase() } : {}),
          items: itemsReceivedThisTime
        });
      }

      let updatedPoQtyReceived = 0;
      updatedItemsList.forEach((it: any) => {
        updatedPoQtyReceived += (it.qtyReceived || 0);
      });

      const updatedPoObj = {
        ...selectedPo,
        status: overallStatus,
        items: updatedItemsList,
        receipts: activeReceipts,
        kodeEkspedisi: receiveKodeEkspedisi.trim() ? receiveKodeEkspedisi.trim().toUpperCase() : (selectedPo.kodeEkspedisi || '')
      };

      const eventId = doc(collection(db, 'purchaseOrders', selectedPo.id, 'receiptEvents')).id;
      let receiptEventData = null;
      if (totalReceivedThisRunSum > 0) {
        receiptEventData = await prepareReceiptEventData(
          db,
          selectedPo,
          receiveKodeEkspedisi.trim() ? receiveKodeEkspedisi.trim().toUpperCase() : undefined,
          totalReceivedThisRunSum,
          overallStatus
        );
      }

      if (totalReceivedThisRunSum > 0 && receiptEventData) {
        const itemsReceivedThisTime = updatedItemsList
          .map((it: any) => {
            const stateRow = receiveItemsState[it.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
            const qty = parseCommasToNumber(stateRow.qtyReceivedThisTime);
            return { bookId: it.bookId, bookName: it.bookName, qtyReceived: qty };
          })
          .filter(it => it.qtyReceived > 0);

        writeReceiptEventAndJournal(
          batch,
          selectedPo,
          eventId,
          receiptEventData,
          totalReceivedThisRunSum,
          itemsReceivedThisTime,
          receiveKodeEkspedisi.trim() ? receiveKodeEkspedisi.trim().toUpperCase() : undefined,
          overallStatus,
          user?.email || user?.uid || 'anonymous'
        );
      }

      const poUpdatePayload: any = {
        status: overallStatus,
        items: updatedItemsList,
        receipts: activeReceipts,
        receiptLogs: latestLogs,
        updatedAt: Timestamp.now()
      };
      if (receiveKodeEkspedisi.trim()) {
        poUpdatePayload.kodeEkspedisi = receiveKodeEkspedisi.trim().toUpperCase();
      }

      batch.update(doc(db, 'purchaseOrders', selectedPo.id), poUpdatePayload);

      await batch.commit();

      alert("Transaksi penerimaan gudang diproses dengan sukses!");
      setIsReceiveOpen(false);
      setSelectedPo(null);
    } catch (err: any) {
      alert("Gagal memproses penerimaan: " + err.message);
    } finally {
      setIsProcessingReceive(false);
    }
  };

  // Refund-specific partial closure logic with exact journals & cashFlow adjustments
  const handleConfirmRefundClosePo = async () => {
    if (!closingPo) return;
    try {
      const batch = writeBatch(db);
      const po = closingPo;
      
      const currencyLabel = po.purchasePriceIDR ? 'IDR' : po.purchasePriceUSD ? 'USD' : 'NTD';
      const isIdrCurrency = currencyLabel === 'IDR';
      
      let poItems = po.items && po.items.length > 0 ? po.items : [{
        bookId: po.bookId,
        bookName: po.bookName,
        qty: po.qty,
        qtyReceived: po.qtyReceived || 0,
        pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceUSD || po.purchasePriceNTD / 100,
        priceNTDTotal: po.purchasePriceNTD,
        pricePerItem: po.pricePerUnitNTD,
        isCancelled: po.isCancelled || false
      }];

      const getIDREquivalentLocal = (ntdCents: number, currentPo: any) => {
        const ntdValue = ntdCents / 100;
        const rate = currentPo.exchangeRate || FALLBACK_NTD_PER_IDR;
        if (rate > 0) {
          return Math.round(ntdValue / rate);
        }
        return Math.round(ntdValue / FALLBACK_NTD_PER_IDR);
      };

      const totalSubtotalNTD = poItems.reduce((acc: number, item: any) => acc + (item.priceNTDTotal || 0), 0) || 1;
      const totalSubtotalPlatform = poItems.reduce((acc: number, item: any) => acc + (item.pricePlatformTotal || 0), 0) || 1;
      const discountPlatform = currencyLabel === 'IDR' ? getIDREquivalentLocal(po.discount || 0, po) : (currencyLabel === 'USD' ? ((po.discount || 0) / 100 / (po.exchangeRate || FALLBACK_NTD_PER_USD)) : ((po.discount || 0) / 100));

      let totalCancelledCents = 0;
      let aggregateQtyReceived = 0;
      let totalCancelledPlat = 0;

      let updatedItemsList = poItems.map((it: any) => {
        const itemCopy = { ...it };
        const rec = itemCopy.qtyReceived || 0;
        const cancelledQty = itemCopy.qty - rec;
        
        const itemDiscountNTD = (po.discount || 0) * ((it.priceNTDTotal || 0) / totalSubtotalNTD);
        const netItemPriceNTDTotal = (it.priceNTDTotal || 0) - itemDiscountNTD; // cents
        const itemNetValCents = (netItemPriceNTDTotal / it.qty) * cancelledQty;

        const itemDiscountPlat = discountPlatform * ((it.pricePlatformTotal || 0) / totalSubtotalPlatform);
        const netItemPricePlat = (it.pricePlatformTotal || 0) - itemDiscountPlat;
        const itemNetValPlat = (netItemPricePlat / it.qty) * cancelledQty;

        totalCancelledCents += itemNetValCents;
        aggregateQtyReceived += rec;

        if (cancelledQty > 0) {
          totalCancelledPlat += itemNetValPlat;

          if (rec === 0) {
            itemCopy.isCancelled = true;
            itemCopy.cancelledQty = cancelledQty;
          } else {
            itemCopy.qty = rec;
            itemCopy.cancelledQty = cancelledQty;
          }
        }
        return itemCopy;
      });

      const totalCancelledNTD = totalCancelledCents / 100;

      // Parse user inputs
      const numRefundAmount = parseFloat(cleanCommas(refundAmount)) || 0;
      const numRefundRate = parseFloat(refundRate) || 0;
      const calculatedNTD = numRefundAmount * numRefundRate;

      // Decrease transitStock in inventory
      for (const originalItem of poItems) {
        const rec = originalItem.qtyReceived || 0;
        const cancelledQty = originalItem.qty - rec;

        if (cancelledQty > 0) {
          const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', originalItem.bookId)));
          if (!invSnap.empty) {
            const curData = invSnap.docs[0].data();
            const invRef = doc(db, 'inventory', originalItem.bookId);
            batch.update(invRef, {
              inTransitStock: Math.max(0, (curData.inTransitStock || 0) - cancelledQty),
              lastUpdated: Timestamp.now()
            });
          }
        }
      }

      // Accounts
      const transitAcc = getInventoryInTransitAccount();
      const cashAcc = getCashAccount(isIdrCurrency ? 'IDR' : 'NTD');
      await ensureAutoAccountExists(cashAcc);
      await ensureAutoAccountExists(transitAcc);

      // Parse custom Date
      const dateParts = refundDate.split('/');
      const parsedDate = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
        12,
        0,
        0
      );
      const timestampDate = Timestamp.fromDate(parsedDate);

      // 1. JURNAL 1 - Refund Barang (always created, value = Total Harga Buku dari Inventory in Transit in NT$)
      const dateStr = parsedDate.toISOString().split('T')[0];
      const journal1Id = await getNextJournalId(dateStr);
      const journal1Ref = doc(db, 'journalEntries', journal1Id);
      const journal1Payload = {
        id: journal1Id,
        date: timestampDate,
        description: `PO #${po.purchaseCode} Refund Barang`,
        refType: 'System',
        refId: po.purchaseCode,
        createdAt: Timestamp.now(),
        lines: [
          {
            account: cashAcc.name,
            accountCode: cashAcc.code,
            debit: Math.round(totalCancelledNTD * 100),
            credit: 0,
            ...(isIdrCurrency ? {
              originalCurrency: 'IDR',
              originalDebitIDR: Math.round(totalCancelledPlat),
              originalCreditIDR: 0
            } : {})
          },
          {
            account: transitAcc.name,
            accountCode: transitAcc.code,
            debit: 0,
            credit: Math.round(totalCancelledNTD * 100),
            ...(isIdrCurrency ? {
              originalCurrency: 'IDR',
              originalDebitIDR: 0,
              originalCreditIDR: Math.round(totalCancelledPlat)
            } : {})
          }
        ]
      };
      batch.set(journal1Ref, journal1Payload);

      // 2. JURNAL 2 - Selisih
      const selisihNTD = calculatedNTD - totalCancelledNTD;
      const selisihCents = Math.round(selisihNTD * 100);

      if (selisihCents !== 0) {
        const dateStr2 = parsedDate.toISOString().split('T')[0];
        const journal2Id = await getNextJournalId(dateStr2);
        const journal2Ref = doc(db, 'journalEntries', journal2Id);
        
        let lines = [];
        if (selisihCents > 0) {
          // Untung: Debit Cash, Kredit Pendapatan Lain-lain
          await ensureAutoAccountExists({ code: '4201', name: 'Pendapatan Lain-lain', type: 'Revenue', subType: 'Pendapatan Non-Operasional' });
          lines = [
            {
              account: cashAcc.name,
              accountCode: cashAcc.code,
              debit: selisihCents,
              credit: 0,
              ...(isIdrCurrency ? {
                originalCurrency: 'IDR',
                originalDebitIDR: Math.round(selisihCents / 100 / numRefundRate),
                originalCreditIDR: 0
              } : {})
            },
            {
              account: 'Pendapatan Lain-lain',
              accountCode: '4201',
              debit: 0,
              credit: selisihCents,
              ...(isIdrCurrency ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: Math.round(selisihCents / 100 / numRefundRate)
              } : {})
            }
          ];
        } else {
          // Rugi: Debit Beban Kerugian Pembelian, Kredit Cash
          const absSelisihCents = Math.abs(selisihCents);
          await ensureAutoAccountExists({ code: '5500', name: 'Beban Kerugian Pembelian', type: 'Expenses', subType: 'Biaya Umum dan Administrasi' });
          lines = [
            {
              account: 'Beban Kerugian Pembelian',
              accountCode: '5500',
              debit: absSelisihCents,
              credit: 0,
              ...(isIdrCurrency ? {
                originalCurrency: 'IDR',
                originalDebitIDR: Math.round(absSelisihCents / 100 / numRefundRate),
                originalCreditIDR: 0
              } : {})
            },
            {
              account: cashAcc.name,
              accountCode: cashAcc.code,
              debit: 0,
              credit: absSelisihCents,
              ...(isIdrCurrency ? {
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: Math.round(absSelisihCents / 100 / numRefundRate)
              } : {})
            }
          ];
        }

        const journal2Payload = {
          id: journal2Id,
          date: timestampDate,
          description: selisihCents > 0 
            ? `PO #${po.purchaseCode} Keuntungan Selisih Refund PO` 
            : `PO #${po.purchaseCode} Kerugian Selisih Refund PO`,
          refType: 'System',
          refId: po.purchaseCode,
          createdAt: Timestamp.now(),
          lines: lines
        };
        batch.set(journal2Ref, journal2Payload);
      }

      // Delete any old close single journal if it exists
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-close`));

      // 3. CASH FLOW RECORD
      const refundCashFlowId = doc(collection(db, 'cashFlow')).id;
      batch.set(doc(db, 'cashFlow', refundCashFlowId), {
        id: refundCashFlowId,
        date: timestampDate,
        ledger: currencyLabel === 'USD' ? 'NTD' : currencyLabel,
        direction: 'inflow',
        category: 'wholesale_purchase_cancellation_refund',
        amount: numRefundAmount,
        amountNTD: Math.round(calculatedNTD),
        fxRateUsed: numRefundRate,
        refType: 'purchase_order',
        refId: po.id,
        description: `Refund sisa PO ${po.purchaseCode} - ${po.bookName || 'Multiple books'}`,
        createdAt: Timestamp.now()
      });

      // 4. UPDATE PO DOCUMENT
      const activeReceipts = [...(po.receipts || [])];
      activeReceipts.push({
        receivedDate: timestampDate,
        receivedQty: 0,
        notes: closePoNote.trim() || 'Pembatalan sisa barang dikonfirmasi',
        receivedBy: user?.uid || 'anonymous'
      });

      let latestLogs = [...(po.receiptLogs || [])];
      latestLogs.push(`${refundDate} Sisa pesanan ditutup & dibatalkan via Refund: ${closePoNote.trim()}`);

      const hasNoItemsArray = !po.items || po.items.length === 0;
      const updateData: any = {
        status: 'received',
        isClosedPartially: true,
        closePoOption: 'refund',
        receipts: activeReceipts,
        receiptLogs: latestLogs,
        updatedAt: Timestamp.now(),
        originalItems: poItems,
        originalPurchasePriceNTD: po.purchasePriceNTD,
        originalPurchasePriceIDR: po.purchasePriceIDR || 0,
        originalPurchasePriceUSD: po.purchasePriceUSD || 0,
        originalQty: po.qty,
      };

      if (hasNoItemsArray) {
        const rec = po.qtyReceived || 0;
        updateData.qty = rec;
        if (rec === 0) {
          updateData.isCancelled = true;
        }
      } else {
        updateData.items = updatedItemsList;
        updateData.qty = aggregateQtyReceived;
      }

      batch.update(doc(db, 'purchaseOrders', po.id), updateData);

      await batch.commit();
      setIsClosePoModalOpen(false);
      setClosingPo(null);
      setClosePoNote('');
      alert("Proses refund sisa PO berhasil disimpan!");
    } catch (err: any) {
      alert("Gagal memproses refund sisa PO: " + err.message);
    }
  };

  // New feature: Tutup Sisa PO (Partial Closure & Reconciliation)
  const handleConfirmClosePo = async () => {
    if (!closingPo) return;
    try {
      if (closingPo.paymentStatus === 'paid' && closePoOption === 'refund') {
        await handleConfirmRefundClosePo();
        return;
      }
      const batch = writeBatch(db);
      const po = closingPo;
      
      const currencyLabel = po.purchasePriceIDR ? 'IDR' : po.purchasePriceUSD ? 'USD' : 'NTD';
      
      let poItems = po.items && po.items.length > 0 ? po.items : [{
        bookId: po.bookId,
        bookName: po.bookName,
        qty: po.qty,
        qtyReceived: po.qtyReceived || 0,
        pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceUSD || po.purchasePriceNTD / 100,
        priceNTDTotal: po.purchasePriceNTD,
        pricePerItem: po.pricePerUnitNTD,
        isCancelled: po.isCancelled || false
      }];

      let totalCancelledCents = 0;
      let aggregateQtyReceived = 0;

      let updatedItemsList = poItems.map((it: any) => {
        const itemCopy = { ...it };
        const rec = itemCopy.qtyReceived || 0;
        const cancelledQty = itemCopy.qty - rec;
        
        totalCancelledCents += cancelledQty * (itemCopy.pricePerItem || 0);
        aggregateQtyReceived += rec;

        if (cancelledQty > 0) {
          if (rec === 0) {
            // Entirely cancelled item
            itemCopy.isCancelled = true;
            itemCopy.cancelledQty = cancelledQty;
          } else {
            // Partially received
            itemCopy.qty = rec;
            itemCopy.cancelledQty = cancelledQty;
          }
        }
        return itemCopy;
      });

      // Write inventory changes & decrease transitStock for cancelled items
      for (const originalItem of poItems) {
        const rec = originalItem.qtyReceived || 0;
        const cancelledQty = originalItem.qty - rec;

        if (cancelledQty > 0) {
          // Adjust inTransitStock in inventory
          const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', originalItem.bookId)));
          if (!invSnap.empty) {
            const curData = invSnap.docs[0].data();
            const invRef = doc(db, 'inventory', originalItem.bookId);
            batch.update(invRef, {
              inTransitStock: Math.max(0, (curData.inTransitStock || 0) - cancelledQty),
              lastUpdated: Timestamp.now()
            });
          }
        }
      }

      // Generate Auto-Journal for "Tutup Sisa PO"
      // removed unused tgl
      const dateStr = new Date().toISOString().split('T')[0];
      const journalId = await getNextJournalId(dateStr);
      const journalRef = doc(db, 'journalEntries', journalId);

      const transitAcc = getInventoryInTransitAccount();
      const isIdrCurrency = currencyLabel === 'IDR';
      const cashAcc = getCashAccount(isIdrCurrency ? 'IDR' : 'NTD');
      const isCredit = po.paymentStatus === 'unpaid';

      // Determine offset account and description based on Close PO Options
      let offsetAccountCode = '';
      let offsetAccountName = '';
      
      if (isCredit) {
        // Unpaid PO always cancels Utang Usaha (Debit Utang Usaha / Kredit Transit)
        offsetAccountCode = '2100';
        offsetAccountName = 'Utang Usaha';
        await ensureAutoAccountExists({ code: '2100', name: 'Utang Usaha', type: 'Liabilities', subType: 'Kewajiban Lancar' });
      } else {
        // Paid PO can be Refund or Write-off
        if (closePoOption === 'refund') {
          offsetAccountCode = cashAcc.code;
          offsetAccountName = cashAcc.name;
          await ensureAutoAccountExists(cashAcc);

          // For refund, also add cashFlow record
          const refundCashFlowId = doc(collection(db, 'cashFlow')).id;
          const cancelValPlat = isIdrCurrency ? (po.exchangeRate > 0 ? Math.round(totalCancelledCents / 100 / po.exchangeRate * 100) / 100 : 0) : 0;

          batch.set(doc(db, 'cashFlow', refundCashFlowId), {
            id: refundCashFlowId,
            date: Timestamp.now(),
            ledger: currencyLabel === 'USD' ? 'NTD' : currencyLabel,
            direction: 'inflow',
            category: 'wholesale_purchase_cancellation_refund',
            amount: isIdrCurrency ? cancelValPlat : Math.round(totalCancelledCents / 100),
            amountNTD: Math.round(totalCancelledCents / 100),
            fxRateUsed: po.exchangeRate,
            refType: 'purchase_order',
            refId: po.id,
            description: `Refunding cancelled portion: ${po.bookName}`,
            createdAt: Timestamp.now()
          });
        } else {
          // Write-off (Debit Loss / Kredit Transit)
          offsetAccountCode = '5500';
          offsetAccountName = 'Beban Kerugian Pembelian';
          await ensureAutoAccountExists({ code: '5500', name: 'Beban Kerugian Pembelian', type: 'Expenses', subType: 'Biaya Umum dan Administrasi' });
        }
      }

      const journalPayload: any = {
        id: journalId,
        date: Timestamp.now(),
        description: `Tutup Sisa PO ${po.purchaseCode} - ${isCredit ? 'Batal Utang' : closePoOption === 'refund' ? 'Refund Cash' : 'Write-Off Selisih'}`,
        refType: 'System',
        refId: po.purchaseCode,
        createdAt: Timestamp.now(),
        lines: [
          {
            account: offsetAccountName,
            accountCode: offsetAccountCode,
            debit: totalCancelledCents,
            credit: 0,
            ...(isIdrCurrency ? {
              originalCurrency: 'IDR',
              originalDebitIDR: po.exchangeRate > 0 ? Math.round(totalCancelledCents / 100 / po.exchangeRate * 100) / 100 : 0,
              originalCreditIDR: 0
            } : {})
          },
          {
            account: transitAcc.name,
            accountCode: transitAcc.code,
            debit: 0,
            credit: totalCancelledCents,
            ...(isIdrCurrency ? {
              originalCurrency: 'IDR',
              originalDebitIDR: 0,
              originalCreditIDR: po.exchangeRate > 0 ? Math.round(totalCancelledCents / 100 / po.exchangeRate * 100) / 100 : 0
            } : {})
          }
        ]
      };
      batch.set(journalRef, journalPayload);

      // Append receipt log
      const activeReceipts = [...(po.receipts || [])];
      activeReceipts.push({
        receivedDate: Timestamp.now(),
        receivedQty: 0,
        notes: closePoNote.trim() || 'Pembatalan sisa barang dikonfirmasi',
        receivedBy: user?.uid || 'anonymous'
      });

      let latestLogs = [...(po.receiptLogs || [])];
      latestLogs.push(`${formatToYYYYMMDD(new Date())} Sisa pesanan ditutup & dibatalkan: ${closePoNote.trim()}`);

      // Handle root-level single item PO updates if items array was empty
      const hasNoItemsArray = !po.items || po.items.length === 0;
      const updateData: any = {
        status: 'received', // Diterima
        isClosedPartially: true, // partial closure indicator
        adjustmentStatus: 'draft', // set initial adjustment status as draft
        closePoOption: closePoOption, // save the reconciliation option chosen
        receipts: activeReceipts,
        receiptLogs: latestLogs,
        updatedAt: Timestamp.now(),
        // Store original values before adjustment
        originalItems: poItems,
        originalPurchasePriceNTD: po.purchasePriceNTD,
        originalPurchasePriceIDR: po.purchasePriceIDR || 0,
        originalPurchasePriceUSD: po.purchasePriceUSD || 0,
        originalQty: po.qty,
      };

      if (hasNoItemsArray) {
        const rec = po.qtyReceived || 0;
        updateData.qty = rec;
        if (rec === 0) {
          updateData.isCancelled = true;
        }
      } else {
        updateData.items = updatedItemsList;
        // Keep po.qty updated as well
        updateData.qty = aggregateQtyReceived;
      }

      batch.update(doc(db, 'purchaseOrders', po.id), updateData);

      await batch.commit();
      setIsClosePoModalOpen(false);
      setClosingPo(null);
      setClosePoNote('');
    } catch (err: any) {
      alert("Gagal memproses penutupan sisa PO: " + err.message);
    }
  };

  // Shipper Task Toggle Action (Checking supplier Shipment)
  const handleToggleTaskShipping = async (poId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'purchaseOrders', poId), {
        isShipped: true,
        shippedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } catch (err: any) {
      alert("Error updating shipping Task: " + err.message);
    }
  };

  // Revert shipping Task toggle (move back to not shipped)
  const handleUntoggleTaskShipping = async (poId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'purchaseOrders', poId), {
        isShipped: false,
        shippedAt: null,
        updatedAt: Timestamp.now()
      });
    } catch (err: any) {
      alert("Error reverting shipping Task: " + err.message);
    }
  };

  // Delete PO completely from Firestore and filter local state array instantly
  const handleDeletePurchase = async (e: React.MouseEvent, poId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;

    // Save previous state for rollback if delete fails
    const originalPurchaseOrders = [...purchaseOrders];

    try {
      // Instant optimistic local state update
      setPurchaseOrders(prev => prev.filter(p => p.id !== poId));
      setDeleteConfirmPoId(null);

      // Delete from Firestore via Batch to include auto-journals
      const batch = writeBatch(db);
      batch.delete(doc(db, 'purchaseOrders', poId));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-create`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-rec-freight`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-rec-capitalize`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-rec-capitalize-mig`));
      
      const journalsQuery1 = query(collection(db, 'journalEntries'), where('refId', '==', poId));
      const journalsQuery2 = query(collection(db, 'journalEntries'), where('refId', '==', po.purchaseCode));
      const journalsQuery3 = query(collection(db, 'journalEntries'), where('sourceId', '==', poId));
      
      const [jSnap1, jSnap2, jSnap3] = await Promise.all([getDocs(journalsQuery1), getDocs(journalsQuery2), getDocs(journalsQuery3)]);
      jSnap1.forEach(d => batch.delete(d.ref));
      jSnap2.forEach(d => batch.delete(d.ref));
      jSnap3.forEach(d => batch.delete(d.ref));

      const receiptEventsSnap = await getDocs(collection(db, 'purchaseOrders', poId, 'receiptEvents'));
      receiptEventsSnap.forEach(d => {
        batch.delete(d.ref);
        batch.delete(doc(db, 'journalEntries', `JU-PO-${poId}-rec-capitalize-${d.id}`));
      });
      await batch.commit();

      alert("Pembelian berhasil dihapus secara permanen.");
    } catch (err: any) {
      // Revert optimistic update on failure
      setPurchaseOrders(originalPurchaseOrders);
      handleFirestoreError(err, OperationType.DELETE, `purchaseOrders/${poId}`);
    }
  };

  // Archive / Cancel PO item
  const handleCancelEntirePO = async (po: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Apakah Anda benar-benar ingin membatalkan pembelian ini?")) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'purchaseOrders', po.id), {
        status: 'cancelled',
        updatedAt: Timestamp.now()
      });

      // Subtract in transit stock
      const poItems = po.items && po.items.length > 0 ? po.items : [{ bookId: po.bookId, qty: po.qty }];
      for (const item of poItems) {
        const invRef = doc(db, 'inventory', item.bookId);
        const invSnap = await getDocs(query(collection(db, 'inventory'), where('bookId', '==', item.bookId)));
        if (!invSnap.empty) {
          const cur = invSnap.docs[0].data();
          batch.update(invRef, {
            inTransitStock: Math.max(0, (cur.inTransitStock || 0) - item.qty),
            lastUpdated: Timestamp.now()
          });
        }
      }

      // Delete auto-journals on cancel
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-create`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-freight`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-capitalize`));
      batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-capitalize-mig`));

      const receiptEventsSnapCancel = await getDocs(collection(db, 'purchaseOrders', po.id, 'receiptEvents'));
      receiptEventsSnapCancel.forEach(d => {
        batch.delete(d.ref);
        batch.delete(doc(db, 'journalEntries', `JU-PO-${po.id}-rec-capitalize-${d.id}`));
      });

      await batch.commit();
      alert("Pembelian ini telah berhasil dibatalkan.");
    } catch (err: any) {
      alert("Gagal membatalkan pembelian: " + err.message);
    }
  };

  const handleRowAccordionToggle = (po: any, e: any) => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('svg') || e.target.closest('input')) {
      return;
    }
    setExpandedPoId(prev => prev === po.id ? null : po.id);
  };

  // Compute stats for masthead
  const poTerbukaCount = purchaseOrders.filter(po => po.status === 'pending' || po.status === 'partial').length;
  const totalThisMonthCents = purchaseOrders.reduce((sum, po) => {
    if (po.status === 'cancelled') return sum;
    const poDateObj = po.purchaseDate?.seconds ? new Date(po.purchaseDate.seconds * 1000) : new Date(po.purchaseDate);
    const now = new Date();
    if (poDateObj && poDateObj.getMonth() === now.getMonth() && poDateObj.getFullYear() === now.getFullYear()) {
      return sum + (po.purchasePriceNTD || 0);
    }
    return sum;
  }, 0);

  return (
    <div className="space-y-6 animate-fade-in select-text">
      
      {/* Header Panel / Masthead */}
      <div className="bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[14px] p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#6B1F3D]/10 text-[#6B1F3D] dark:bg-[#6B1F3D]/20 dark:text-rose-300 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[21px] font-bold font-['Lexend'] tracking-tight text-[#0d1117] dark:text-white leading-tight">
              Purchase Orders
            </h1>
            <div className="text-[12.5px] text-[#9ca3af] mt-0.5 font-['Lexend']">
              <b className="font-['Inter'] font-semibold text-[#3d4451] dark:text-neutral-300">{dateFilteredPOs.length}</b> PO · {poPresetLabel || 'Semua Tanggal'}
            </div>
          </div>
        </div>

        {activeTab === 'main' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleImportFile} />
            {hasPerm('purchases.import') && (
              <button 
                onClick={() => {
                  setCsvPlatformId('');
                  setCsvValidationResult(null);
                  setIsCsvUploadOpen(true);
                }} 
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 hover:text-[#0d1117] hover:border-neutral-300 dark:hover:border-neutral-700 text-[13px] font-semibold transition cursor-pointer"
                title="Import PO via Excel / CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#6b7280]" />
                Import Excel / CSV
              </button>
            )}
            <button
              onClick={() => setIsPlatformOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 hover:text-[#0d1117] hover:border-neutral-300 dark:hover:border-neutral-700 text-[13px] font-semibold transition cursor-pointer"
              title="Pengaturan Platform"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#6b7280]" />
              Platform
            </button>

            <button
              onClick={() => setActiveTab('tasks')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 text-[#3d4451] dark:text-neutral-200 hover:text-[#0d1117] hover:border-neutral-300 dark:hover:border-neutral-700 text-[13px] font-semibold transition cursor-pointer relative"
              title="Verifikasi Pengiriman"
            >
              <Calendar className="w-3.5 h-3.5 text-[#6b7280]" />
              Verifikasi
              {tasksChecklistPOs.length > 0 && (
                <span className="bg-[#6B1F3D] text-white font-text text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                  {tasksChecklistPOs.length}
                </span>
              )}
            </button>

            {hasPerm('purchases.receive') && (
              <button
                onClick={() => {
                  setScanSuccessToast(null);
                  setScanErrorToast(null);
                  setKodeEkspedisi("");
                  setTempKodeEkspedisi("");
                  setScanStep(1);
                  scanStepRef.current = 1;
                  setIsBulkReceiveScanOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[#A6791E] hover:bg-[#8A6217] text-white text-[13px] font-semibold shadow-xs transition cursor-pointer"
              >
                <Scan className="w-3.5 h-3.5" />
                Terima Barang
              </button>
            )}

            <button
              onClick={() => {
                setIsPoViewOnly(false);
                setAddedItems([]);
                setPoDate(formatToHTMLDate(new Date()));
                const defaultPlat = platforms.find(p => p.name.includes("Shopee Indonesia") && p.currency === 'IDR') || platforms[0];
                if (defaultPlat) {
                  setPlatformId(defaultPlat.id);
                } else {
                  setPlatformId('');
                }
                setSupplierOrderNumber('');
                setSupplierTrackingNumber('');
                setPoDiscount('0');
                setActualReceiptTotal('');
                setIsNewPoOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[#6B1F3D] hover:bg-[#4E1530] text-white text-[13px] font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Buku
            </button>
          </div>
        )}
      </div>

      {activeTab === 'tasks' ? (
        // Tasks Checklist sub-panel view
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-md font-bold text-neutral-800 dark:text-white uppercase tracking-wider">VERIFIKASI PENGIRIMAN</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Verifikasi apakah barang belanjaan berikut sudah dikirim oleh supplier.</p>
            </div>
            <button 
              onClick={() => setActiveTab('main')}
              className="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline cursor-pointer"
            >
              &larr; Kembali
            </button>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-[#A9812E] uppercase tracking-widest border-b border-[#E7E1D3] dark:border-neutral-800 pb-2">Perlu Verifikasi ({tasksChecklistPOs.length})</h4>
            {tasksChecklistPOs.length === 0 ? (
              <p className="text-xs text-neutral-400 py-2">Semua pengiriman belanjaan terverifikasi dan aman dalam 2 hari teakhir.</p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-[#E9E2D8] dark:border-neutral-800 rounded-xl overflow-hidden">
                {tasksChecklistPOs.map((po, idx) => (
                  <div key={`${po.id}-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-neutral-50/50 dark:bg-neutral-950/20 hover:bg-neutral-100/50 dark:hover:bg-neutral-950/40 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-numeric font-bold text-indigo-600 dark:text-indigo-440">{po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}</span>
                        <span className="text-neutral-400 font-numeric text-[10px]">
                          {po.purchaseDate?.seconds ? formatToYYYYMMDD(new Date(po.purchaseDate.seconds * 1000)) : 'N/A'}
                        </span>
                      </div>
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200 font-text break-words max-w-lg">{po.bookName}</p>
                      <p className="text-neutral-500">Platform: <span className="font-bold">{platforms.find(p => p.id === po.supplierId)?.name || po.supplierName}</span> | Qty: <span className="font-numeric font-bold">{po.qty}</span></p>
                      {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                        <p className="font-text text-[10px] text-neutral-500">
                          {po.supplierOrderNumber && <span>Order: <span className="font-numeric text-indigo-600 dark:text-indigo-400 font-bold">{po.supplierOrderNumber}</span></span>}
                          {po.supplierOrderNumber && po.supplierTrackingNumber && <span className="mx-1">;</span>}
                          {po.supplierTrackingNumber && <span>Resi: <span className="font-numeric text-orange-600 dark:text-orange-400 font-bold">{po.supplierTrackingNumber}</span></span>}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 sm:mt-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md overflow-hidden focus-within:border-indigo-500 transition-colors">
                        <input
                          type="text"
                          placeholder="Input Resi..."
                          value={trackingNumberInputs[po.id] || ''}
                          onChange={(e) => setTrackingNumberInputs(prev => ({...prev, [po.id]: e.target.value}))}
                          className="px-2 py-1.5 text-[10px] w-24 sm:w-32 focus:outline-none bg-transparent dark:text-white font-numeric"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => handleSaveTrackingNumber(po.id, e)}
                          className="px-2.5 py-1.5 bg-[#F1ECE4] hover:bg-[#E9E2D8] dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[#7A6D62] dark:text-neutral-300 font-bold uppercase text-[9px] transition cursor-pointer border-l border-neutral-200 dark:border-neutral-700"
                        >
                          Simpan
                        </button>
                      </div>
                      <button
                        onClick={(e) => handleToggleTaskShipping(po.id, e)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase text-[10px] rounded-md transition cursor-pointer"
                      >
                        <Check className="h-3 w-3" />
                        Telah Dikirim
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-neutral-100 dark:border-neutral-850">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Riwayat Task Hari ini</h4>
            {tasksHistoryPOs.length === 0 ? (
              <p className="text-xs text-neutral-400 py-2">Belum ada riwayat pengiriman baru dalam 24 jam terakhir.</p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-[#E9E2D8] dark:border-neutral-800 rounded-xl overflow-hidden">
                {tasksHistoryPOs.map((po, idx) => (
                  <div key={`${po.id}-${idx}`} className="p-4 bg-neutral-50/20 dark:bg-neutral-950/5 text-xs flex justify-between items-center opacity-70">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-numeric font-bold line-through text-neutral-400">{po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}</span>
                        <span className="text-neutral-400 font-numeric text-[9px] uppercase">
                          Shipped at: {po.shippedAt?.seconds ? formatToYYYYMMDD(new Date(po.shippedAt.seconds * 1000)) : 'N/A'}
                        </span>
                      </div>
                      <p className="font-text text-neutral-600 dark:text-neutral-400 truncate max-w-sm">{po.bookName}</p>
                      {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                        <p className="font-text text-[10px] text-neutral-500">
                          {po.supplierOrderNumber && <span>Order: <span className="font-numeric text-indigo-600 dark:text-indigo-400 font-bold">{po.supplierOrderNumber}</span></span>}
                          {po.supplierOrderNumber && po.supplierTrackingNumber && <span className="mx-1">;</span>}
                          {po.supplierTrackingNumber && <span>Resi: <span className="font-numeric text-orange-600 dark:text-orange-400 font-bold">{po.supplierTrackingNumber}</span></span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 border border-emerald-100 font-bold uppercase text-[9px]">
                        Terkirim
                      </span>
                      <button
                        onClick={(e) => handleUntoggleTaskShipping(po.id, e)}
                        className="px-2.5 py-1 text-xs font-bold text-neutral-600 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-100 dark:hover:bg-neutral-805 transition cursor-pointer"
                      >
                        Kembali
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        // Master list main table view
        <>
          {/* PIPELINE & STATUS FILTER CARD */}
          {(() => {
            const pendingPOs = dateFilteredPOs.filter(po => po.status === 'pending');
            const partialPOs = dateFilteredPOs.filter(po => po.status === 'partial');
            const receivedPOs = dateFilteredPOs.filter(po => po.status === 'received');
            const cancelledPOs = dateFilteredPOs.filter(po => po.status === 'cancelled');

            const pendingSumNTD = pendingPOs.reduce((sum, po) => sum + calculatePoRemainingNTDCents(po), 0);
            const partialSumNTD = partialPOs.reduce((sum, po) => sum + calculatePoRemainingNTDCents(po), 0);
            const receivedSumNTD = receivedPOs.reduce((sum, po) => sum + (po.purchasePriceNTD || 0), 0);
            const cancelledSumNTD = cancelledPOs.reduce((sum, po) => sum + (po.purchasePriceNTD || 0), 0);

            const activeBigCount = poStatusFilter === 'Semua' ? dateFilteredPOs.length
              : poStatusFilter === 'Menunggu' ? pendingPOs.length
              : poStatusFilter === 'Sebagian' ? partialPOs.length
              : poStatusFilter === 'Diterima' ? receivedPOs.length
              : cancelledPOs.length;

            return (
              <div className="bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[14px] p-4 sm:p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-['Inter'] text-[26px] font-bold tracking-tight text-[#0d1117] dark:text-white">
                      {activeBigCount}
                    </span>
                    <span className="text-[12.5px] text-[#9ca3af]">
                      {poStatusFilter === 'Semua' ? (
                        <>semua PO · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(pendingSumNTD)}</b> menunggu</>
                      ) : poStatusFilter === 'Menunggu' ? (
                        <>PO Menunggu · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(pendingSumNTD)}</b></>
                      ) : poStatusFilter === 'Sebagian' ? (
                        <>PO Sebagian · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(partialSumNTD)}</b></>
                      ) : poStatusFilter === 'Diterima' ? (
                        <>PO Diterima · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(receivedSumNTD)}</b></>
                      ) : (
                        <>PO Cancel · <b className="font-['Inter'] font-semibold text-[#0d1117] dark:text-neutral-200">{formatNTD(cancelledSumNTD)}</b></>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <DateRangePicker 
                      startDate={startDate}
                      endDate={endDate}
                      presetLabel={poPresetLabel}
                      onChange={(start, end, label) => {
                        setStartDate(start);
                        setEndDate(end);
                        if (label) setPoPresetLabel(label);
                      }}
                    />
                  </div>
                </div>

                {/* FLOW BAR */}
                <div className="flex h-[7px] rounded-full overflow-hidden bg-[#f3f4f6] dark:bg-neutral-800 mb-4 gap-0.5">
                  {[
                    { key: 'Menunggu', count: pendingPOs.length, color: '#A6791E', label: 'Menunggu' },
                    { key: 'Sebagian', count: partialPOs.length, color: '#48607F', label: 'Sebagian' },
                    { key: 'Diterima', count: receivedPOs.length, color: '#4C6B4F', label: 'Diterima' },
                    { key: 'Cancel', count: cancelledPOs.length, color: '#A34A32', label: 'Cancel' },
                  ].map((seg) => {
                    if (seg.count === 0) return null;
                    const isFocused = poStatusFilter === 'Semua' || poStatusFilter === seg.key;
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

                {/* STATUS FILTER CHIPS GRID */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {/* Semua */}
                  <button
                    type="button"
                    onClick={() => {
                      setPoStatusFilter('Semua');
                      setExpandedPoId(null);
                      setCurrentPage(1);
                    }}
                    className={`bg-white dark:bg-neutral-900 border rounded-[11px] p-3 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none ${
                      poStatusFilter === 'Semua'
                        ? 'border-[#0d1117] dark:border-white bg-[#f5f6f7] dark:bg-neutral-800'
                        : 'border-[#E7E1D2] dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    {poStatusFilter === 'Semua' && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#0d1117] dark:bg-white" />
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0d1117] dark:bg-white shrink-0" />
                      <span className={`text-[11.5px] font-semibold ${poStatusFilter === 'Semua' ? 'text-[#0d1117] dark:text-white' : 'text-[#6b7280]'}`}>
                        Semua
                      </span>
                    </div>
                    <div className={`font-['Inter'] font-bold text-[21px] leading-none ${poStatusFilter === 'Semua' ? 'text-[#0d1117] dark:text-white' : 'text-[#0d1117] dark:text-neutral-100'}`}>
                      {dateFilteredPOs.length}
                    </div>
                    <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
                      seluruh periode
                    </div>
                  </button>

                  {/* Menunggu */}
                  <button
                    type="button"
                    onClick={() => {
                      setPoStatusFilter(poStatusFilter === 'Menunggu' ? 'Semua' : 'Menunggu');
                      setExpandedPoId(null);
                      setCurrentPage(1);
                    }}
                    className={`bg-white dark:bg-neutral-900 border rounded-[11px] p-3 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none ${
                      poStatusFilter === 'Menunggu'
                        ? 'border-[#A6791E] bg-[#F8EFD9]/80 dark:bg-amber-955/30'
                        : 'border-[#E7E1D2] dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    {poStatusFilter === 'Menunggu' && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#A6791E]" />
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#A6791E] shrink-0" />
                      <span className={`text-[11.5px] font-semibold ${poStatusFilter === 'Menunggu' ? 'text-[#A6791E]' : 'text-[#6b7280]'}`}>
                        Menunggu
                      </span>
                    </div>
                    <div className={`font-['Inter'] font-bold text-[21px] leading-none ${poStatusFilter === 'Menunggu' ? 'text-[#A6791E]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
                      {pendingPOs.length}
                    </div>
                    <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
                      {pendingPOs.length > 0 ? `${formatNTD(pendingSumNTD)}` : '—'}
                    </div>
                  </button>

                  {/* Sebagian */}
                  <button
                    type="button"
                    onClick={() => {
                      setPoStatusFilter(poStatusFilter === 'Sebagian' ? 'Semua' : 'Sebagian');
                      setExpandedPoId(null);
                      setCurrentPage(1);
                    }}
                    className={`bg-white dark:bg-neutral-900 border rounded-[11px] p-3 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none ${
                      poStatusFilter === 'Sebagian'
                        ? 'border-[#48607F] bg-[#E8EDF3]/80 dark:bg-slate-955/30'
                        : 'border-[#E7E1D2] dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    {poStatusFilter === 'Sebagian' && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#48607F]" />
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#48607F] shrink-0" />
                      <span className={`text-[11.5px] font-semibold ${poStatusFilter === 'Sebagian' ? 'text-[#48607F]' : 'text-[#6b7280]'}`}>
                        Sebagian
                      </span>
                    </div>
                    <div className={`font-['Inter'] font-bold text-[21px] leading-none ${poStatusFilter === 'Sebagian' ? 'text-[#48607F]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
                      {partialPOs.length}
                    </div>
                    <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
                      {partialPOs.length > 0 ? `${formatNTD(partialSumNTD)}` : '—'}
                    </div>
                  </button>

                  {/* Diterima */}
                  <button
                    type="button"
                    onClick={() => {
                      setPoStatusFilter(poStatusFilter === 'Diterima' ? 'Semua' : 'Diterima');
                      setExpandedPoId(null);
                      setCurrentPage(1);
                    }}
                    className={`bg-white dark:bg-neutral-900 border rounded-[11px] p-3 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none ${
                      poStatusFilter === 'Diterima'
                        ? 'border-[#4C6B4F] bg-[#E9F0E9]/80 dark:bg-emerald-955/30'
                        : 'border-[#E7E1D2] dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    {poStatusFilter === 'Diterima' && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#4C6B4F]" />
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4C6B4F] shrink-0" />
                      <span className={`text-[11.5px] font-semibold ${poStatusFilter === 'Diterima' ? 'text-[#4C6B4F]' : 'text-[#6b7280]'}`}>
                        Diterima
                      </span>
                    </div>
                    <div className={`font-['Inter'] font-bold text-[21px] leading-none ${poStatusFilter === 'Diterima' ? 'text-[#4C6B4F]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
                      {receivedPOs.length}
                    </div>
                    <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
                      {receivedPOs.length > 0 ? `${formatNTD(receivedSumNTD)}` : '—'}
                    </div>
                  </button>

                  {/* Cancel */}
                  <button
                    type="button"
                    onClick={() => {
                      setPoStatusFilter(poStatusFilter === 'Cancel' ? 'Semua' : 'Cancel');
                      setExpandedPoId(null);
                      setCurrentPage(1);
                    }}
                    className={`bg-white dark:bg-neutral-900 border rounded-[11px] p-3 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none ${
                      poStatusFilter === 'Cancel'
                        ? 'border-[#A34A32] bg-[#F5E5DF]/80 dark:bg-rose-955/30'
                        : 'border-[#E7E1D2] dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    {poStatusFilter === 'Cancel' && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#A34A32]" />
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#A34A32] shrink-0" />
                      <span className={`text-[11.5px] font-semibold ${poStatusFilter === 'Cancel' ? 'text-[#A34A32]' : 'text-[#6b7280]'}`}>
                        Cancel
                      </span>
                    </div>
                    <div className={`font-['Inter'] font-bold text-[21px] leading-none ${poStatusFilter === 'Cancel' ? 'text-[#A34A32]' : 'text-[#0d1117] dark:text-neutral-100'}`}>
                      {cancelledPOs.length}
                    </div>
                    <div className="font-['Inter'] text-[10.5px] text-[#9ca3af] mt-1 truncate">
                      {cancelledPOs.length > 0 ? `${formatNTD(cancelledSumNTD)}` : '—'}
                    </div>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Search bar card */}
          <div className="bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[14px] p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-[#9ca3af] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari No. PO, Nomor Pembelian, atau Nama Buku..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 text-[13px] bg-transparent text-[#0d1117] dark:text-white placeholder-[#9ca3af] focus:outline-none"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#0d1117] dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Cards container */}
          <div className="space-y-4">
            {paginatedPOs.map((po, poIdx) => {
              const poPlatform = platforms.find(p => p.id === po.supplierId);
              const poCurrency = poPlatform?.currency || (po.purchasePriceIDR > 0 ? 'IDR' : (po.purchasePriceUSD > 0 ? 'USD' : 'NTD'));
              const itemsToRender = po.items && po.items.length > 0 ? po.items : [{
                bookId: po.bookId,
                bookName: po.bookName,
                qty: po.qty,
                pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
                priceNTDTotal: po.purchasePriceNTD,
                pricePerItem: po.pricePerUnitNTD,
              }];
              
              // Calculate ordered qty and received qty for progress bar
              const totalOrderedQty = itemsToRender.reduce((sum, it) => sum + (it.qty || 1), 0);
              let totalReceivedQty = 0;
              itemsToRender.forEach(it => {
                 if (it.isCancelled) return;
                 if (po.status === 'received') {
                   totalReceivedQty += (it.qtyReceived !== undefined ? it.qtyReceived : (it.qty || 1));
                 } else {
                   totalReceivedQty += (it.qtyReceived || 0);
                 }
              });
              const progressPercent = Math.min(100, Math.max(0, (totalReceivedQty / totalOrderedQty) * 100));

              // Spine colors
              const spineColor = po.status === 'received' 
                ? 'bg-[#4C6B4F]' 
                : po.status === 'partial' 
                ? 'bg-[#48607F]' 
                : po.status === 'cancelled'
                ? 'bg-[#A34A32]'
                : 'bg-[#A6791E]';

              // Status classes
              const statusLabel = po.status === 'pending' ? 'Pending' 
                : po.status === 'partial' ? 'Sebagian' 
                : po.status === 'received' ? 'Diterima' 
                : 'Dibatalkan';

              const statusSealClass = po.status === 'received' 
                ? 'bg-[#E9F0E9] text-[#4C6B4F] dark:bg-[#4C6B4F]/10 dark:text-[#E9F0E9] border border-[#4C6B4F]/20' 
                : po.status === 'partial' 
                ? 'bg-[#E8EDF3] text-[#48607F] dark:bg-[#48607F]/10 dark:text-[#E8EDF3] border border-[#48607F]/20' 
                : po.status === 'cancelled'
                ? 'bg-[#F5E5DF] text-[#A34A32] dark:bg-[#A34A32]/10 dark:text-[#F5E5DF] border border-[#A34A32]/20'
                : 'bg-[#F8EFD9] text-[#A6791E] dark:bg-[#A6791E]/10 dark:text-[#F8EFD9] border border-[#A6791E]/20';

              const iconBgClass = po.status === 'received' 
                ? 'bg-[#E9F0E9] text-[#4C6B4F] dark:bg-[#4C6B4F]/25 dark:text-[#E9F0E9]' 
                : po.status === 'partial' 
                ? 'bg-[#E8EDF3] text-[#48607F] dark:bg-[#48607F]/25 dark:text-[#E8EDF3]' 
                : po.status === 'cancelled'
                ? 'bg-[#F5E5DF] text-[#A34A32] dark:bg-[#A34A32]/25 dark:text-[#F5E5DF]'
                : 'bg-[#F8EFD9] text-[#A6791E] dark:bg-[#A6791E]/25 dark:text-[#F8EFD9]';

              return (
                <div 
                  key={po.id}
                  className="bg-white dark:bg-neutral-900 border border-[#E9E2D8] dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition duration-200 flex flex-col md:flex-row"
                >
                  {/* Spine line */}
                  <div className={`w-2 md:w-1.5 shrink-0 ${spineColor}`}></div>
                  
                  {/* Main Card Body */}
                  <div className="flex-1 p-5 flex flex-col justify-between">
                    
                    {/* Top content */}
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      
                      {/* Left section: Doc # & Date */}
                      <div className="flex gap-3.5 items-start">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBgClass}`}>
                          {po.status === 'received' && <PackageCheck className="h-5.5 w-5.5" />}
                          {po.status === 'partial' && <History className="h-5.5 w-5.5" />}
                          {po.status === 'cancelled' && <X className="h-5.5 w-5.5" />}
                          {po.status === 'pending' && <Calendar className="h-5.5 w-5.5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-text text-[13px] font-bold text-neutral-800 dark:text-neutral-200">
                              {po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}
                            </span>
                            
                            {/* Copy button */}
                            <button 
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const code = po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '') || '';
                                try {
                                  await navigator.clipboard.writeText(code);
                                  setCopiedPoId(po.id + '-copy');
                                  setTimeout(() => setCopiedPoId(null), 1000);
                                } catch (err) {
                                  console.error("Gagal menyalin text: ", err);
                                }
                              }}
                              className="p-1 text-[#AB9F92] hover:text-neutral-600 dark:hover:text-neutral-200 transition relative shrink-0 cursor-pointer"
                              title="Salin Nomor PO"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {copiedPoId === po.id + '-copy' && (
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                  copied!
                                </span>
                              )}
                            </button>
                          </div>
                          
                          <div className="text-[11.5px] text-[#AB9F92] dark:text-neutral-500 font-text mt-0.5">
                            {po.purchaseDate?.seconds 
                              ? formatToYYYYMMDD(new Date(po.purchaseDate.seconds * 1000)) 
                              : 'N/A'}
                            {po.receipts && po.receipts.length > 0 && (
                              <>
                                <span className="mx-1.5">·</span>
                                <span>Diterima {formatToYYYYMMDD(new Date(po.receipts[po.receipts.length - 1].receivedDate?.seconds * 1000))}</span>
                              </>
                            )}
                          </div>
                          
                          <div className="font-text text-[15px] font-bold text-neutral-900 dark:text-neutral-100 mt-1 flex items-baseline gap-1.5 flex-wrap">
                            <span>{platforms.find(p => p.id === po.supplierId)?.name || po.supplierName}</span>
                            
                            {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {po.supplierOrderNumber && (
                                  <>
                                    <span className="text-neutral-500 font-normal text-[12px]">No. Order :</span>
                                    <button 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const cleanCode = po.supplierOrderNumber.trim();
                                        try {
                                          await navigator.clipboard.writeText(cleanCode);
                                          setCopiedPoId(po.id + '_order');
                                          setTimeout(() => setCopiedPoId(null), 1000);
                                        } catch (err) {
                                          console.error("Gagal menyalin text: ", err);
                                        }
                                      }}
                                      className="inline-block hover:underline text-indigo-600 dark:text-indigo-400 font-text text-[12px] relative font-bold cursor-pointer"
                                      title="Klik untuk menyalin"
                                    >
                                      {po.supplierOrderNumber}
                                      {copiedPoId === po.id + '_order' && (
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                          copied!
                                        </span>
                                      )}
                                    </button>
                                  </>
                                )}
                                
                                {po.supplierOrderNumber && po.supplierTrackingNumber && (
                                  <span className="text-neutral-300 dark:text-neutral-600">;</span>
                                )}
                                
                                {po.supplierTrackingNumber && (
                                  <>
                                    <span className="text-neutral-500 font-normal text-[12px]">No. Resi :</span>
                                    <button 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const cleanCode = po.supplierTrackingNumber.trim();
                                        try {
                                          await navigator.clipboard.writeText(cleanCode);
                                          setCopiedPoId(po.id + '_tracking');
                                          setTimeout(() => setCopiedPoId(null), 1000);
                                        } catch (err) {
                                          console.error("Gagal menyalin text: ", err);
                                        }
                                      }}
                                      className="inline-block hover:underline text-orange-600 dark:text-orange-400 font-text text-[12px] relative font-bold cursor-pointer"
                                      title="Klik untuk menyalin"
                                    >
                                      {po.supplierTrackingNumber}
                                      {copiedPoId === po.id + '_tracking' && (
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                          copied!
                                        </span>
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right section: Financial stats, freight-in, status seal */}
                      <div className="flex flex-wrap items-start gap-6 lg:gap-8 justify-between lg:justify-end">
                        
                        {/* Total */}
                        <div className="text-left lg:text-right">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-[#AB9F92] mb-1">TOTAL</span>
                          <div className="font-text text-[14px] font-bold text-neutral-900 dark:text-neutral-100 leading-none">
                            {(() => {
                              const poPlatform = platforms.find(p => p.id === po.supplierId);
                              const poCurrency = poPlatform?.currency || (po.purchasePriceIDR > 0 ? 'IDR' : (po.purchasePriceUSD > 0 ? 'USD' : 'NTD'));
                              const platAmt = poCurrency === 'IDR' ? po.purchasePriceIDR : (poCurrency === 'USD' ? po.purchasePriceUSD : po.purchasePriceNTD / 100);
                              
                              if (poCurrency === 'IDR') {
                                return (
                                  <div className="flex flex-col lg:items-end">
                                    <span className="text-[#6B1F3D] dark:text-rose-400 font-bold">{formatIDR(platAmt)}</span>
                                    <span className="text-[11px] text-[#AB9F92] dark:text-neutral-500 font-normal mt-0.5">{formatNTD(po.purchasePriceNTD)}</span>
                                  </div>
                                );
                              } else if (poCurrency === 'USD') {
                                return (
                                  <div className="flex flex-col lg:items-end">
                                    <span className="text-[#6B1F3D] dark:text-rose-400 font-bold">{formatUSD(platAmt)}</span>
                                    <span className="text-[11px] text-[#AB9F92] dark:text-neutral-500 font-normal mt-0.5">{formatNTD(po.purchasePriceNTD)}</span>
                                  </div>
                                );
                              } else {
                                return (
                                  <span className="text-[#6B1F3D] dark:text-rose-400 font-bold">{formatNTD(po.purchasePriceNTD)}</span>
                                );
                              }
                            })()}
                          </div>
                        </div>

                        {/* Freight-In */}
                        <div className="text-left lg:text-right min-w-[100px]">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-[#AB9F92] mb-1">FREIGHT-IN</span>
                          <div className="flex flex-col lg:items-end gap-1">
                            {(() => {
                              const codes = getPoFreightCodes(po);
                              if (codes.length === 0) {
                                return <span className="text-[#AB9F92] font-text text-[12px]">—</span>;
                              }
                              return codes.map(code => {
                                return (
                                  <div key={code} className="flex items-center gap-1.5 lg:justify-end text-[11px]">
                                    <span className="font-text font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/20 px-1.5 py-0.5 rounded leading-none border border-orange-500/10">
                                      {code}
                                    </span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="text-left lg:text-right self-center">
                          <span className={`seal inline-flex items-center gap-1.5 font-bold text-[11px] px-3 py-1 rounded-full ${statusSealClass}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {statusLabel}
                          </span>
                        </div>
                        
                      </div>

                    </div>

                    {/* Bottom row: Progress line or toggle details, and buttons */}
                    <div className="mt-4 pt-4 border-t border-dashed border-[#E9E2D8] dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      
                      {/* Progress or Chevron detail toggle */}
                      <div className="flex items-center gap-3 flex-1 max-w-sm">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedPoId(prev => prev === po.id ? null : po.id);
                          }}
                          className="flex items-center gap-1.5 text-xs text-[#7A6D62] dark:text-neutral-400 hover:text-[#6B1F3D] dark:hover:text-rose-400 font-semibold cursor-pointer select-none"
                        >
                          {expandedPoId === po.id ? (
                            <>
                              <ChevronUp className="h-4 w-4 text-[#6B1F3D] dark:text-rose-400" />
                              Sembunyikan Rincian
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              Tampilkan Rincian ({itemsToRender.length} Buku)
                            </>
                          )}
                        </button>

                        {po.status === 'partial' && (
                          <div className="flex items-center gap-2 flex-1 pl-4 border-l border-[#E9E2D8] dark:border-neutral-800">
                            <span className="font-text text-[10px] text-[#7A6D62] dark:text-neutral-400 whitespace-nowrap">{totalReceivedQty}/{totalOrderedQty} pcs</span>
                            <div className="flex-1 h-1.5 rounded-full bg-[#F1ECE4] dark:bg-neutral-800 overflow-hidden">
                              <div className="h-full bg-[#48607F] rounded-full" style={{ width: `${progressPercent}%` }}></div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions group */}
                      <div className="flex items-center justify-end gap-2">
                        
                        {/* Primary action block (Terima / Lanjut Terima) */}
                        {isStaffValue && hasPerm('purchases.receive') && po.status !== 'received' && po.status !== 'cancelled' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenReceiveGoods(po);
                            }}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer text-white ${
                              po.status === 'partial'
                                ? 'bg-[#48607F] hover:bg-[#34475E]'
                                : 'bg-[#A6791E] hover:bg-[#8A6217]'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            {po.status === 'partial' ? 'Lanjut Terima' : 'Terima'}
                          </button>
                        )}

                        {/* Secondary action tools */}
                        <div className="flex items-center gap-1 bg-[#FAF8F5]/85 dark:bg-neutral-900/60 p-0.5 rounded-xl border border-[#E9E2D8] dark:border-neutral-800">
                          {/* View/Edit PO */}
                          {((po.qtyReceived || 0) > 0 || po.status === 'received' || po.status === 'partial') ? (
                            <button
                              onClick={(e) => handleViewPO(po, e)}
                              className="p-2 text-[#7A6D62] hover:text-[#6B1F3D] dark:text-neutral-400 dark:hover:text-rose-400 rounded-lg transition flex items-center justify-center cursor-pointer"
                              title="Lihat Detail Pembelian"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleEditPO(po, e)}
                              className="p-2 text-[#7A6D62] hover:text-[#6B1F3D] dark:text-neutral-400 dark:hover:text-rose-400 rounded-lg transition flex items-center justify-center cursor-pointer"
                              title="Edit Pembelian"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Revert status action */}
                          {isStaffValue && po.status && po.status !== 'pending' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevertConfirmState({
                                  message: `Apakah Anda benar-benar ingin mengembalikan status pembelian ${po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')} dari "${po.status.toUpperCase()}" ke "PENDING"? Semua penyesuaian stok dan arus kas akan dibalik/diatur ulang.`,
                                  onConfirm: () => handleRevertPOStatus(po)
                                });
                              }}
                              className="p-2 text-[#48607F] hover:text-indigo-600 dark:text-indigo-400 rounded-lg transition cursor-pointer flex items-center justify-center"
                              title="Kembali ke Status Sebelumnya"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Delete PO (only if no received items) */}
                          {isStaffValue && !((po.qtyReceived || 0) > 0 || po.status === 'received' || po.status === 'partial') && (
                            <div className="relative flex items-center justify-center">
                              {deleteConfirmPoId === po.id ? (
                                <div className="flex items-center gap-1 px-1 py-0.5 animate-in fade-in zoom-in-95 duration-150">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDeleteConfirmPoId(null);
                                    }}
                                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-[#F1ECE4] hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[#7A6D62] dark:text-neutral-300 rounded-lg transition cursor-pointer"
                                    title="Batal menghapus"
                                  >
                                    Batal
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeletePurchase(e, po.id)}
                                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-[#A34A32] hover:bg-[#833a25] text-white rounded-lg transition cursor-pointer"
                                    title="Konfirmasi Hapus"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  type="button" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDeleteConfirmPoId(po.id);
                                  }} 
                                  className="p-2 text-[#7A6D62] hover:text-[#A34A32] dark:text-neutral-450 dark:hover:text-red-400 rounded-lg transition cursor-pointer"
                                  title="Hapus Pembelian"
                                >
                                  <X className="w-3.5 h-3.5"/>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Breakdown / Accordion items block inside the card */}
                    {expandedPoId === po.id && (() => {
                      const poPlatform = platforms.find(p => p.id === po.supplierId);
                      const poCurrency = poPlatform?.currency || (po.purchasePriceIDR > 0 ? 'IDR' : (po.purchasePriceUSD > 0 ? 'USD' : 'NTD'));
                      const itemsToRender = po.items && po.items.length > 0 ? po.items : [{
                        bookId: po.bookId,
                        bookName: po.bookName,
                        qty: po.qty,
                        pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
                        priceNTDTotal: po.purchasePriceNTD,
                        pricePerItem: po.pricePerUnitNTD,
                      }];

                      const getIDREquivalent = (ntdCents: number, currentPo: any) => {
                        const ntdValue = ntdCents / 100;
                        const rate = currentPo.exchangeRate || liveRates?.['IDR'] || FALLBACK_NTD_PER_IDR;
                        if (rate > 0) {
                          return Math.round(ntdValue / rate);
                        }
                        return Math.round(ntdValue / FALLBACK_NTD_PER_IDR);
                      };
                      
                      const totalOrderedQty = itemsToRender.reduce((sum, it) => sum + (it.qty || 1), 0);
                      let totalReceivedQty = 0;
                      itemsToRender.forEach(it => {
                         if (it.isCancelled) return;
                         if (po.status === 'received') {
                           totalReceivedQty += (it.qtyReceived !== undefined ? it.qtyReceived : (it.qty || 1));
                         } else {
                           totalReceivedQty += (it.qtyReceived || 0);
                         }
                      });
                      const progressPercent = Math.min(100, Math.max(0, (totalReceivedQty / totalOrderedQty) * 100));

                      return (
                        <div className="mt-4 pt-4 border-t border-dashed border-[#E9E2D8] dark:border-neutral-800 relative select-text animate-in fade-in slide-in-from-top-1 duration-200">
                           
                          {/* The Eyebrow & Title */}
                          <div className="mb-4 ml-[2px]">
                             <p className="font-text text-[11px] tracking-[0.08em] text-[#AB9F92] uppercase mb-1">Rincian Penerimaan Barang</p>
                             <p className="text-[13px] text-[#7A6D62] dark:text-neutral-400 mb-0">
                               <b className="font-semibold text-neutral-900 dark:text-neutral-100">{po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}</b> — {platforms.find(p => p.id === po.supplierId)?.name || po.supplierName} · {po.purchaseDate?.seconds ? formatToYYYYMMDD(new Date(po.purchaseDate.seconds * 1000)) : 'N/A'}
                             </p>
                          </div>

                          {/* The Main Panel */}
                          <div className="bg-white dark:bg-neutral-950 border border-[#E9E2D8] dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
                            {/* Panel Head */}
                            <div className="flex items-end justify-between gap-6 px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
                              <div>
                                <h2 className="font-text font-bold text-[18px] text-neutral-900 dark:text-neutral-100 mb-0">Daftar Buku & Barang</h2>
                                <div className="text-xs text-[#7A6D62] dark:text-neutral-400 mt-1">{itemsToRender.length} jenis barang · {totalOrderedQty} pcs dipesan</div>
                              </div>
                              <div className="flex items-center gap-2.5 min-w-[190px]">
                                <span className="font-text text-xs text-[#7A6D62] dark:text-neutral-400 whitespace-nowrap">{totalReceivedQty} / {totalOrderedQty} pcs</span>
                                <div className="flex-1 h-1.5 rounded-full bg-[#F1ECE4] dark:bg-neutral-800 overflow-hidden">
                                  <div className="h-full bg-[#4C6B4F] rounded-full" style={{ width: `${progressPercent}%` }}></div>
                                </div>
                              </div>
                            </div>

                            {/* Items List */}
                            <div className="px-3 py-1.5">
                              {itemsToRender.map((item: any, idx: number) => {
                                  const bookObj = books.find(b => b.id === item.bookId || b.title === item.bookName);
                                  const coverUrl = bookObj?.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80';
                                  
                                  const isPOReceived = po.status === 'received';
                                  let receivedQty = item.qty || 1;
                                  let cancelledQty = item.cancelledQty || 0;
                                  
                                  if (item.isCancelled || (isPOReceived && (item.qtyReceived || 0) === 0 && !item.cancelledQty)) {
                                    receivedQty = 0;
                                    cancelledQty = item.qty || 1;
                                  } else if (isPOReceived && item.qtyReceived !== undefined && item.qtyReceived < (item.qty || 1) && !item.cancelledQty) {
                                    receivedQty = item.qtyReceived;
                                    cancelledQty = (item.qty || 1) - receivedQty;
                                  } else if (!isPOReceived) {
                                    receivedQty = item.qtyReceived || 0;
                                    cancelledQty = item.cancelledQty || 0;
                                    if (po.status === 'pending') {
                                       receivedQty = item.qty || 1; 
                                    }
                                  }
                                  
                                  const totalItemQty = (item.qty || 1);

                                  const renderRow = (qty: number, isCancelledRow: boolean, keySuffix: string) => {
                                    if (qty <= 0) return null;
                                    
                                    const proportion = qty / totalItemQty;
                                    const rowNTDTotal = (item.priceNTDTotal || 0) * proportion;

                                    let priceTop, priceBottom;
                                    if (poCurrency === 'IDR') {
                                      const originalIDR = item.pricePlatformTotal || getIDREquivalent(item.priceNTDTotal || 0, po);
                                      const rowIDR = originalIDR * proportion;
                                      priceTop = formatIDR(rowIDR);
                                      priceBottom = formatNTD(rowNTDTotal);
                                    } else if (poCurrency === 'USD') {
                                      const originalUSD = item.pricePlatformTotal || ((item.priceNTDTotal || 0) / 100 / (po.exchangeRate || FALLBACK_NTD_PER_USD));
                                      const rowUSD = originalUSD * proportion;
                                      priceTop = formatUSD(rowUSD);
                                      priceBottom = formatNTD(rowNTDTotal);
                                    } else {
                                      priceTop = formatNTD(rowNTDTotal);
                                      priceBottom = null;
                                    }

                                    if (isCancelledRow) {
                                      return (
                                        <div key={`${idx}-${keySuffix}`} className="mt-3 ml-12 p-3 rounded-xl border border-dashed border-[#E9E2D8] dark:border-neutral-800 flex items-center gap-3.5 relative bg-neutral-50/50 dark:bg-neutral-900/40">
                                          <span className="font-text text-[9px] font-bold tracking-[0.09em] text-[#A34A32] border border-[#A34A32]/20 rounded px-1.5 py-0.5 -rotate-3 shrink-0 uppercase bg-[#F5E5DF] dark:bg-[#A34A32]/10">Tutup Sisa</span>
                                          <div className="flex-1 min-w-0">
                                            <p className="italic line-through decoration-[#AB9F92] text-xs text-[#7A6D62] mb-1">{item.bookName}</p>
                                            <span className="italic line-through decoration-[#AB9F92] font-text text-[10px] text-[#AB9F92]">Qty {qty} pcs — tidak diterima</span>
                                          </div>
                                          <div className="text-right font-numeric shrink-0 italic ">
                                            <div className="text-xs font-semibold text-[#7A6D62] line-through decoration-[#AB9F92]">{priceTop}</div>
                                            {priceBottom && <div className="text-[10px] text-[#AB9F92] line-through decoration-[#AB9F92] mt-0.5">{priceBottom}</div>}
                                          </div>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <div key={`${idx}-${keySuffix}`} className="flex items-center gap-4">
                                          <img className="w-[48px] h-[48px] rounded-xl object-cover shrink-0 border border-[#E9E2D8] dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800" src={coverUrl} alt={item.bookName} referrerPolicy="no-referrer" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold mb-1 text-neutral-900 dark:text-neutral-150 break-words">{item.bookName}</p>
                                            <div className="flex items-center gap-2.5">
                                              <span className="font-text text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E9F0E9] text-[#4C6B4F]">Qty {qty} pcs</span>
                                              {po.status === 'received' || po.status === 'partial' ? (
                                                <span className="text-[10.5px] font-bold text-[#4C6B4F] flex items-center gap-1">
                                                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                  Diterima
                                                </span>
                                              ) : (po.status !== 'pending' && po.status !== 'cancelled') ? (
                                                <span className="text-[10.5px] font-semibold text-[#48607F] flex items-center gap-1">
                                                  Dalam Proses
                                                </span>
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="text-right font-numeric shrink-0 ">
                                            <div className="text-xs font-bold text-[#6B1F3D] dark:text-rose-450">{priceTop}</div>
                                            {priceBottom && <div className="text-[10px] text-[#AB9F92] mt-0.5">{priceBottom}</div>}
                                          </div>
                                        </div>
                                      );
                                    }
                                  };

                                  return (
                                    <div key={idx} className="px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800/60 last:border-b-0 flex flex-col">
                                      {renderRow(receivedQty, false, 'received')}
                                      {renderRow(cancelledQty, true, 'cancelled')}
                                    </div>
                                  );
                              })}
                            </div>

                            {/* Summary Box */}
                            <div className="bg-[#FAF8F5] dark:bg-neutral-900/40 border-t border-[#E9E2D8] dark:border-neutral-800 px-5 py-4 flex justify-end">
                              <div className="w-full max-w-[340px] flex flex-col gap-2">
                                {(() => {
                                  const discountCents = po.discount || 0;
                                  const discountNTD = discountCents / 100;
                                  const discountIDR = getIDREquivalent(discountCents, po);
                                  const discountUSD = discountNTD / (po.exchangeRate || FALLBACK_NTD_PER_USD);
                                  const totalNTD = po.purchasePriceNTD;
                                  const totalIDR = po.purchasePriceIDR || getIDREquivalent(totalNTD, po);

                                  let discountTop, discountBottom;
                                  if (poCurrency === 'IDR') {
                                     discountTop = discountCents > 0 ? `-${formatIDR(discountIDR)}` : 'Rp 0';
                                     discountBottom = discountCents > 0 ? `-${formatNTD(discountCents)}` : 'NT$ 0.00';
                                  } else if (poCurrency === 'USD') {
                                     discountTop = discountCents > 0 ? `-US$ ${discountUSD.toFixed(2)}` : 'US$ 0.00';
                                     discountBottom = discountCents > 0 ? `-${formatNTD(discountCents)}` : 'NT$ 0.00';
                                  } else {
                                     discountTop = discountCents > 0 ? `-${formatNTD(discountCents)}` : 'NT$ 0.00';
                                  }

                                  let totalTop, totalBottom;
                                  if (poCurrency === 'IDR') {
                                     totalTop = formatIDR(totalIDR);
                                     totalBottom = formatNTD(totalNTD);
                                  } else if (poCurrency === 'USD') {
                                     totalTop = formatUSD(po.purchasePriceUSD || (totalNTD / 100 / (po.exchangeRate || FALLBACK_NTD_PER_USD)));
                                     totalBottom = formatNTD(totalNTD);
                                  } else {
                                     totalTop = formatNTD(totalNTD);
                                  }

                                  return (
                                    <>
                                      <div className="flex justify-between items-baseline text-xs text-[#7A6D62] dark:text-neutral-400">
                                        <span>Diskon</span>
                                        <div className="text-right font-numeric text-neutral-900 dark:text-neutral-150 ">
                                          {discountTop}
                                          {discountBottom && <span className="block text-[10px] font-normal text-[#AB9F92]">{discountBottom}</span>}
                                        </div>
                                      </div>
                                      <div className="h-[1px] bg-[#E9E2D8] dark:bg-neutral-800 my-1"></div>
                                      <div className="flex justify-between items-baseline">
                                        <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">Total Pesanan</span>
                                        <div className="text-right font-numeric ">
                                          <span className="text-sm font-bold text-[#6B1F3D] dark:text-rose-450">{totalTop}</span>
                                          {totalBottom && <span className="block text-[10.5px] font-medium text-[#AB9F92] mt-px">{totalBottom}</span>}
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                          
                          <p className="text-[10px] text-[#AB9F92] text-center mt-3 font-text">
                            Baris bergaris putus-putus menandakan sisa barang yang ditutup dan tidak akan diterima.
                          </p>

                          {/* Action buttons (like Tutup Sisa PO if status === 'partial') */}
                          {po.status === 'partial' && (
                            <div className="mt-4 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setClosingPo(po);
                                  const items = po.items && po.items.length > 0 ? po.items : [{
                                    bookId: po.bookId,
                                    bookName: po.bookName,
                                    qty: po.qty,
                                    qtyReceived: po.qtyReceived || 0
                                  }];
                                  const noteText = (() => {
                                    if (items.length === 1) {
                                      const it = items[0];
                                      const rec = it.qtyReceived || 0;
                                      const cancelled = it.qty - rec;
                                      return `${it.bookName} Diterima ${rec}, Sisanya ${cancelled} dibatalkan`;
                                    } else {
                                      const parts = [];
                                      items.forEach((it: any) => {
                                        const rec = it.qtyReceived || 0;
                                        const cancelled = it.qty - rec;
                                        if (rec > 0) {
                                          parts.push(`${it.bookName} Diterima ${rec}`);
                                        }
                                        if (cancelled > 0) {
                                          parts.push(`${it.bookName} sebanyak ${cancelled} dibatalkan`);
                                        }
                                      });
                                      return parts.join(", ");
                                    }
                                  })();
                                  setClosePoNote(noteText);
                                  setClosePoOption('refund');
                                  setIsClosePoModalOpen(true);
                                }}
                                className="px-4 py-2 bg-[#A34A32] hover:bg-[#833a25] text-white rounded-xl text-xs font-bold uppercase transition shadow-sm cursor-pointer w-full md:w-auto text-center"
                              >
                                Tutup Sisa PO
                              </button>
                            </div>
                          )}

                        </div>
                      );
                    })()}

                  </div>
                </div>
              );
            })}

            {paginatedPOs.length === 0 && (
              <div className="p-12 text-center text-[#AB9F92] dark:text-neutral-500 font-semibold border border-dashed border-[#E9E2D8] dark:border-neutral-800 rounded-2xl bg-white/40 dark:bg-neutral-900/20 font-text">
                Tidak ada data pembelian yang cocok dengan filter penelusuran.
              </div>
            )}

            {/* Old table content remains temporarily inside but will be completely updated */}
            <div className="hidden">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
              
              <div className="overflow-x-auto w-full scrollbar-thin">
                <div className="min-w-[1200px] flex flex-col">

                  {/* Integrated Header Strip with Solid Tint Background */}
                  <div className="grid grid-cols-[1.4fr_1.1fr_1.4fr_1.1fr_1.2fr_1.3fr_1.3fr_1.1fr_1.5fr] gap-4 px-6 py-3.5 bg-slate-50 dark:bg-neutral-950/40 border-b border-neutral-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 text-[10px] font-bold uppercase tracking-wider select-text items-center mx-0.5">
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal">
                      <span className="block">NO. DOC</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal">
                      <span className="block">Tanggal</span>
                      <span className="block">Pembelian</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal">
                      <span className="block">Platform</span>
                      <span className="block">Pembelian</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal">
                      <span className="block">Total</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal font-bold">
                      <span className="block">Tanggal</span>
                      <span className="block">Diterima</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal">
                      <span className="block">Kode</span>
                      <span className="block">Freight-In</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal">
                      <span className="block">Biaya</span>
                      <span className="block">Freight-In</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal">
                      <span className="block">Status</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[44px] select-text whitespace-normal font-bold">
                      <span className="block">Aksi</span>
                    </div>
                  </div>

              {/* Flat Stacking Body Rows */}
              <div className="divide-y divide-gray-100 dark:divide-neutral-800/60">
                {paginatedPOs.map((po, poIdx) => {
                  const poItems = po.items && po.items.length > 0 ? po.items : [{
                    bookId: po.bookId,
                    bookName: po.bookName,
                    qty: po.qty,
                    pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
                    priceNTDTotal: po.purchasePriceNTD,
                    pricePerItem: po.pricePerUnitNTD,
                  }];

                  return (
                    <div 
                      key={`${po.id}-${poIdx}`} 
                      className={`px-6 py-4 transition-all duration-300 relative group backdrop-blur-xs select-text mx-0.5 ${
                        expandedPoId === po.id
                          ? 'bg-neutral-50/70 dark:bg-neutral-950/30 border-l-4 border-l-indigo-500 border-y border-neutral-200 dark:border-neutral-800/80 z-10'
                          : hoveredPoId === po.id
                          ? 'bg-neutral-50/50 dark:bg-neutral-950/25 border border-transparent z-10'
                          : 'bg-transparent hover:bg-neutral-50/20 dark:hover:bg-neutral-950/5 border border-transparent z-10'
                      }`}
                    >
                      {/* Floating blue gradient accent card border line */}
                      {expandedPoId !== po.id && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition duration-300" />
                      )}
                      
                       {/* Interactive Click Grid */}
                      <div 
                        onClick={(e) => handleRowAccordionToggle(po, e)}
                        className="grid grid-cols-[1.4fr_1.1fr_1.4fr_1.1fr_1.2fr_1.3fr_1.3fr_1.1fr_1.5fr] gap-4 items-center cursor-pointer text-xs w-full"
                      >
                        {/* 1. Nomor PO (Code) */}
                        <div className="text-center font-numeric font-bold text-neutral-900 dark:text-white flex items-center justify-center gap-1.5 text-center h-full min-h-[44px]">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPoId(prev => prev === po.id ? null : po.id);
                            }}
                            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition shrink-0 cursor-pointer"
                            title={expandedPoId === po.id ? "Sembunyikan Detail" : "Tampilkan Detail"}
                          >
                            {expandedPoId === po.id ? <ChevronUp className="h-4 w-4 text-indigo-500" /> : <ChevronDown className="h-4 w-4" />}
                          </button>

                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPoId(prev => prev === po.id ? null : po.id);
                            }}
                            className="inline-block text-blue-600 dark:text-blue-400 font-extrabold hover:underline cursor-pointer text-center select-text font-numeric"
                            title="Tampilkan Detail Buku & Barang"
                          >
                            {po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}
                          </button>
                          
                          <button 
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const code = po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '') || '';
                              try {
                                await navigator.clipboard.writeText(code);
                                setCopiedPoId(po.id + '-copy');
                                setTimeout(() => setCopiedPoId(null), 1000);
                              } catch (err) {
                                console.error("Gagal menyalin text: ", err);
                              }
                            }}
                            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition cursor-pointer relative"
                            title="Salin Nomor PO"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedPoId === po.id + '-copy' && (
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                copy!
                              </span>
                            )}
                          </button>
                        </div>

                        {/* 2. Tanggal Pembelian */}
                        <div className="text-center font-numeric tabular-nums text-neutral-600 dark:text-neutral-300 flex items-center justify-center h-full min-h-[44px]">
                          {po.purchaseDate?.seconds 
                            ? formatToYYYYMMDD(new Date(po.purchaseDate.seconds * 1000)) 
                            : 'N/A'}
                        </div>

                        {/* 3. Platform Pembelian */}
                        <div className="text-center font-semibold text-neutral-800 dark:text-neutral-200 flex flex-col items-center justify-center text-center h-full min-h-[44px] px-2 select-text">
                          <span className="block font-bold">{platforms.find(p => p.id === po.supplierId)?.name || po.supplierName}</span>
                          
                          {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                            <div className="flex flex-col items-center gap-0.5 mt-0.5">
                              {po.supplierOrderNumber && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-normal text-neutral-400">Order:</span>
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const cleanCode = po.supplierOrderNumber.trim();
                                      try {
                                        await navigator.clipboard.writeText(cleanCode);
                                        setCopiedPoId(po.id + '_order');
                                        setTimeout(() => setCopiedPoId(null), 1000);
                                      } catch (err) {
                                        console.error("Gagal menyalin text: ", err);
                                      }
                                    }}
                                    className="inline-block hover:underline text-indigo-600 dark:text-indigo-400 font-numeric text-[10px] cursor-pointer text-center relative font-bold"
                                    title="Klik untuk menyalin"
                                  >
                                    {po.supplierOrderNumber}
                                    {copiedPoId === po.id + '_order' && (
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                        copied!
                                      </span>
                                    )}
                                  </button>
                                </div>
                              )}
                              
                              {po.supplierTrackingNumber && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-normal text-neutral-400">Resi:</span>
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const cleanCode = po.supplierTrackingNumber.trim();
                                      try {
                                        await navigator.clipboard.writeText(cleanCode);
                                        setCopiedPoId(po.id + '_tracking');
                                        setTimeout(() => setCopiedPoId(null), 1000);
                                      } catch (err) {
                                        console.error("Gagal menyalin text: ", err);
                                      }
                                    }}
                                    className="inline-block hover:underline text-orange-600 dark:text-orange-400 font-numeric text-[10px] cursor-pointer text-center relative font-bold"
                                    title="Klik untuk menyalin"
                                  >
                                    {po.supplierTrackingNumber}
                                    {copiedPoId === po.id + '_tracking' && (
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                        copied!
                                      </span>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 4. Total Cost */}
                        <div className="text-center flex flex-col items-center justify-center h-full min-h-[44px] select-text">
                          {(() => {
                            const poPlatform = platforms.find(p => p.id === po.supplierId);
                            const poCurrency = poPlatform?.currency || (po.purchasePriceIDR > 0 ? 'IDR' : (po.purchasePriceUSD > 0 ? 'USD' : 'NTD'));
                            const platAmt = poCurrency === 'IDR' ? po.purchasePriceIDR : (poCurrency === 'USD' ? po.purchasePriceUSD : po.purchasePriceNTD / 100);
                            return renderDualCurrency(
                              platAmt,
                              po.purchasePriceNTD,
                              poCurrency,
                              "text-xs md:text-sm font-bold text-neutral-900 dark:text-neutral-100",
                              "text-[10px] text-neutral-450 dark:text-neutral-500"
                            );
                          })()}
                        </div>

                        {/* 5. Tanggal Diterima */}
                        <div className="text-center font-numeric text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-center h-full min-h-[44px]">
                          {po.receipts && po.receipts.length > 0 ? (
                            <span className="font-bold text-blue-500">
                              {formatToYYYYMMDD(new Date(po.receipts[po.receipts.length - 1].receivedDate?.seconds * 1000))}
                            </span>
                          ) : (
                            <span className="text-neutral-300 dark:text-neutral-700 font-normal">–</span>
                          )}
                        </div>

                        {/* 5.5 Kode Freight-in */}
                        <div className="text-center font-numeric text-[11px] text-neutral-600 dark:text-neutral-300 flex flex-col items-center justify-center gap-1 h-full min-h-[44px] py-1">
                          {(() => {
                            const codes = getPoFreightCodes(po);
                            if (codes.length === 0) {
                              return <span className="text-neutral-300 dark:text-neutral-700 font-normal">–</span>;
                            }
                            return codes.map(code => (
                              <span key={code} className="font-black text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/20 px-2 py-0.5 rounded border border-orange-500/10 block leading-none">
                                {code}
                              </span>
                            ));
                          })()}
                        </div>

                        {/* 5.6 Biaya Freight-in */}
                        <div className="text-center font-numeric text-[11px] font-bold text-neutral-800 dark:text-neutral-200 flex flex-col items-center justify-center gap-1.5 h-full min-h-[44px] py-1">
                          {(() => {
                            const codes = getPoFreightCodes(po);
                            if (codes.length === 0) {
                              return <span className="text-neutral-300 dark:text-neutral-700 font-normal">–</span>;
                            }
                            return codes.map(code => {
                              const costStr = getPoFreightCostForCode(po, code);
                              return (
                                <span key={code} className="block leading-none">
                                  {costStr === '-' ? '–' : costStr}
                                </span>
                              );
                            });
                          })()}
                        </div>

                        {/* 6. Status Badge */}
                        <div className="text-center flex items-center justify-center h-full min-h-[44px]">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border ${
                            po.status === 'received'
                              ? 'bg-emerald-50 text-emerald-750 dark:bg-emerald-950/25 border-emerald-250 dark:border-emerald-800 text-emerald-700'
                              : po.status === 'partial'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800'
                              : po.status === 'cancelled'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/20 border border-red-200 dark:border-red-800'
                              : 'bg-amber-50 text-amber-750 dark:bg-amber-950/15 border-amber-250 dark:border-amber-800 text-amber-700'
                          }`}>
                            {po.status === 'pending' && 'Pending'}
                            {po.status === 'partial' && 'Diterima Sebagian'}
                            {po.status === 'received' && 'Diterima'}
                            {po.status === 'cancelled' && 'Dibatalkan'}
                          </span>
                        </div>

                        {/* 7. Action Cell */}
                        <div className="text-center flex items-center justify-center h-full min-h-[44px]">
                          <div className="flex items-center justify-center gap-2 select-none w-full pr-1">
                            {isStaffValue && (
                              <>
                                {/* Primary Transition Action */}
                                {hasPerm('purchases.receive') && po.status !== 'received' && po.status !== 'cancelled' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenReceiveGoods(po);
                                    }}
                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition duration-150 shadow-xs whitespace-nowrap text-white ${
                                      po.status === 'partial'
                                        ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                                        : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800'
                                    }`}
                                  >
                                    {po.status === 'partial' ? 'Lanjut Terima' : 'Terima'}
                                  </button>
                                )}

                                {/* Compact Icon Action Group */}
                                <div className="flex items-center gap-1 bg-neutral-100/60 dark:bg-neutral-800/40 p-0.5 rounded-lg border border-neutral-200/40 dark:border-neutral-700/40">
                                  {/* Edit or View Details */}
                                  {((po.qtyReceived || 0) > 0 || po.status === 'received' || po.status === 'partial') ? (
                                    <button
                                      onClick={(e) => handleViewPO(po, e)}
                                      className="p-1 text-neutral-500 hover:text-blue-500 dark:text-neutral-400 dark:hover:text-blue-400 rounded transition duration-150 flex items-center justify-center cursor-pointer"
                                      title="Lihat Detail Pembelian"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => handleEditPO(po, e)}
                                      className="p-1 text-neutral-500 hover:text-blue-500 dark:text-neutral-400 dark:hover:text-blue-400 rounded transition duration-150 flex items-center justify-center"
                                      title="Edit Pembelian"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  {/* Revert Action */}
                                  {po.status && po.status !== 'pending' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRevertConfirmState({
                                          message: `Apakah Anda benar-benar ingin mengembalikan status pembelian ${po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')} dari "${po.status.toUpperCase()}" ke "PENDING"? Semua penyesuaian stok dan arus kas akan dibalik/diatur ulang.`,
                                          onConfirm: () => handleRevertPOStatus(po)
                                        });
                                      }}
                                      className="p-1 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 rounded transition duration-150 cursor-pointer flex items-center justify-center"
                                      title="Kembali ke Status Sebelumnya"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                    </button>
                                  )}

                                  {/* Delete Action (only if no received items) */}
                                  {!((po.qtyReceived || 0) > 0 || po.status === 'received' || po.status === 'partial') && (
                                    <div className="relative flex items-center justify-center">
                                      {deleteConfirmPoId === po.id ? (
                                        <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setDeleteConfirmPoId(null);
                                            }}
                                            className="px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-600 dark:text-neutral-300 rounded transition duration-150 cursor-pointer h-5"
                                            title="Batal menghapus"
                                          >
                                            Batal
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => handleDeletePurchase(e, po.id)}
                                            className="px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-red-500 hover:bg-red-600 text-white rounded transition duration-150 cursor-pointer h-5"
                                            title="Konfirmasi Hapus"
                                          >
                                            Yakin?
                                          </button>
                                        </div>
                                      ) : (
                                        <button 
                                          type="button" 
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDeleteConfirmPoId(po.id);
                                          }} 
                                          className="p-1 text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400 rounded transition duration-150 cursor-pointer"
                                          title="Hapus Pembelian"
                                        >
                                          <X className="w-3.5 h-3.5"/>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Accordion breakdown panel block */}
                      {expandedPoId === po.id && (() => {
                        const poPlatform = platforms.find(p => p.id === po.supplierId);
                        const poCurrency = poPlatform?.currency || (po.purchasePriceIDR > 0 ? 'IDR' : (po.purchasePriceUSD > 0 ? 'USD' : 'NTD'));
                        const itemsToRender = po.items && po.items.length > 0 ? po.items : [{
                          bookId: po.bookId,
                          bookName: po.bookName,
                          qty: po.qty,
                          pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceNTD / 100,
                          priceNTDTotal: po.purchasePriceNTD,
                          pricePerItem: po.pricePerUnitNTD,
                        }];

                        const getIDREquivalent = (ntdCents: number, currentPo: any) => {
                          const ntdValue = ntdCents / 100;
                          const rate = currentPo.exchangeRate || liveRates?.['IDR'] || FALLBACK_NTD_PER_IDR;
                          if (rate > 0) {
                            return Math.round(ntdValue / rate);
                          }
                          return Math.round(ntdValue / FALLBACK_NTD_PER_IDR);
                        };
                        
                        const totalOrderedQty = itemsToRender.reduce((sum, it) => sum + (it.qty || 1), 0);
                        let totalReceivedQty = 0;
                        itemsToRender.forEach(it => {
                           if (it.isCancelled) return;
                           if (po.status === 'received') {
                             totalReceivedQty += (it.qtyReceived !== undefined ? it.qtyReceived : (it.qty || 1));
                           } else {
                             totalReceivedQty += (it.qtyReceived || 0);
                           }
                        });
                        const progressPercent = Math.min(100, Math.max(0, (totalReceivedQty / totalOrderedQty) * 100));

                        return (
                          <div className="mt-4 pb-2 relative select-text animate-in fade-in slide-in-from-top-1 duration-200">
                             
                            {/* The Eyebrow & Title - as requested in UI reference */}
                            <div className="mb-4 ml-[2px]">
                               <p className="text-[12px] tracking-[0.08em] text-neutral-400 dark:text-neutral-500 uppercase mb-1.5">Purchase Orders · Rincian Penerimaan</p>
                               <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-0">
                                 <b className="font-semibold text-neutral-900 dark:text-neutral-100">{po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}</b> — {platforms.find(p => p.id === po.supplierId)?.name || po.supplierName} · {po.purchaseDate?.seconds ? formatToYYYYMMDD(new Date(po.purchaseDate.seconds * 1000)) : 'N/A'}
                               </p>
                            </div>

                            {/* The Main Panel */}
                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
                              {/* Panel Head */}
                              <div className="flex items-end justify-between gap-6 px-[26px] pt-[22px] pb-[18px] border-b border-neutral-100 dark:border-neutral-800">
                                <div>
                                  <h2 className="font-semibold text-[21px] tracking-tight text-neutral-900 dark:text-neutral-100 mb-0">Daftar Barang</h2>
                                  <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1">{itemsToRender.length} jenis barang · {totalOrderedQty} pcs dipesan</div>
                                </div>
                                <div className="flex items-center gap-2.5 min-w-[190px]">
                                  <span className="font-numeric text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{totalReceivedQty} / {totalOrderedQty} pcs</span>
                                  <div className="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                                    <div className="h-full bg-emerald-700 dark:bg-emerald-500 rounded-full" style={{ width: `${progressPercent}%` }}></div>
                                  </div>
                                </div>
                              </div>

                              {/* Items List */}
                              <div className="px-3 py-1.5">
                                {itemsToRender.map((item: any, idx: number) => {
                                    const bookObj = books.find(b => b.id === item.bookId || b.title === item.bookName);
                                    const coverUrl = bookObj?.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80';
                                    
                                    const isPOReceived = po.status === 'received';
                                    let receivedQty = item.qty || 1;
                                    let cancelledQty = item.cancelledQty || 0;
                                    
                                    if (item.isCancelled || (isPOReceived && (item.qtyReceived || 0) === 0 && !item.cancelledQty)) {
                                      receivedQty = 0;
                                      cancelledQty = item.qty || 1;
                                    } else if (isPOReceived && item.qtyReceived !== undefined && item.qtyReceived < (item.qty || 1) && !item.cancelledQty) {
                                      receivedQty = item.qtyReceived;
                                      cancelledQty = (item.qty || 1) - receivedQty;
                                    } else if (!isPOReceived) {
                                      receivedQty = item.qtyReceived || 0;
                                      cancelledQty = item.cancelledQty || 0;
                                      if (po.status === 'pending') {
                                         receivedQty = item.qty || 1; 
                                      }
                                    }
                                    
                                    const totalItemQty = (item.qty || 1);

                                    const renderRow = (qty: number, isCancelledRow: boolean, keySuffix: string) => {
                                      if (qty <= 0) return null;
                                      
                                      const proportion = qty / totalItemQty;
                                      const rowNTDTotal = (item.priceNTDTotal || 0) * proportion;

                                      let priceTop, priceBottom;
                                      if (poCurrency === 'IDR') {
                                        const originalIDR = item.pricePlatformTotal || getIDREquivalent(item.priceNTDTotal || 0, po);
                                        const rowIDR = originalIDR * proportion;
                                        priceTop = formatIDR(rowIDR);
                                        priceBottom = formatNTD(rowNTDTotal);
                                      } else if (poCurrency === 'USD') {
                                        const originalUSD = item.pricePlatformTotal || ((item.priceNTDTotal || 0) / 100 / (po.exchangeRate || FALLBACK_NTD_PER_USD));
                                        const rowUSD = originalUSD * proportion;
                                        priceTop = formatUSD(rowUSD);
                                        priceBottom = formatNTD(rowNTDTotal);
                                      } else {
                                        priceTop = formatNTD(rowNTDTotal);
                                        priceBottom = null;
                                      }

                                      if (isCancelledRow) {
                                        return (
                                          <div key={`${idx}-${keySuffix}`} className="mt-3 ml-[68px] p-3 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center gap-3.5 relative bg-[repeating-linear-gradient(135deg,#f3f4f6,#f3f4f6_8px,#ecedf0_8px,#ecedf0_9px)] dark:bg-[repeating-linear-gradient(135deg,#171717,#171717_8px,#262626_8px,#262626_9px)]">
                                            <span className="text-[10px] font-medium tracking-[0.09em] text-neutral-500 dark:text-neutral-400 border-[1.5px] border-neutral-400 dark:border-neutral-500 rounded-[5px] px-1.5 py-0.5 -rotate-6 shrink-0 uppercase bg-white/50 dark:bg-black/50">Tutup Sisa</span>
                                            <div className="flex-1 min-w-0">
                                              <p className="italic line-through decoration-neutral-400 dark:decoration-neutral-600 text-[13.5px] text-neutral-500 dark:text-neutral-400 mb-1">{item.bookName}</p>
                                              <span className="italic line-through decoration-neutral-400 dark:decoration-neutral-600 text-[11.5px] text-neutral-500 dark:text-neutral-400">Qty {qty} pcs — tidak diterima</span>
                                            </div>
                                            <div className="text-right font-numeric shrink-0 italic">
                                              <div className="text-[13.5px] font-semibold text-neutral-500 dark:text-neutral-400 line-through decoration-neutral-400 dark:decoration-neutral-600">{priceTop}</div>
                                              {priceBottom && <div className="text-[11.5px] text-neutral-500 dark:text-neutral-400 line-through decoration-neutral-400 dark:decoration-neutral-600 mt-0.5">{priceBottom}</div>}
                                            </div>
                                          </div>
                                        );
                                      } else {
                                        return (
                                          <div key={`${idx}-${keySuffix}`} className="flex items-center gap-4">
                                            <img className="w-[52px] h-[52px] rounded-xl object-cover shrink-0 border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800" src={coverUrl} alt={item.bookName} referrerPolicy="no-referrer" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[15px] font-semibold mb-1.5 text-neutral-900 dark:text-neutral-100 break-words">{item.bookName}</p>
                                              <div className="flex items-center gap-2.5">
                                                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Qty {qty} pcs</span>
                                                {po.status === 'received' || po.status === 'partial' ? (
                                                  <span className="text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                    Diterima
                                                  </span>
                                                ) : (po.status !== 'pending' && po.status !== 'cancelled') ? (
                                                  <span className="text-[11.5px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                                    Dalam Proses
                                                  </span>
                                                ) : null}
                                              </div>
                                            </div>
                                            <div className="text-right font-numeric shrink-0">
                                              <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">{priceTop}</div>
                                              {priceBottom && <div className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-0.5">{priceBottom}</div>}
                                            </div>
                                          </div>
                                        );
                                      }
                                    };

                                    return (
                                      <div key={idx} className="px-3.5 py-4 border-b border-neutral-100 dark:border-neutral-800/60 last:border-b-0 flex flex-col">
                                        {renderRow(receivedQty, false, 'received')}
                                        {renderRow(cancelledQty, true, 'cancelled')}
                                      </div>
                                    );
                                })}
                              </div>

                              {/* Summary Box */}
                              <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border-t border-neutral-200 dark:border-neutral-800 px-[26px] py-5 flex justify-end">
                                <div className="w-full max-w-[340px] flex flex-col gap-2.5">
                                  {(() => {
                                    const discountCents = po.discount || 0;
                                    const discountNTD = discountCents / 100;
                                    const discountIDR = getIDREquivalent(discountCents, po);
                                    const discountUSD = discountNTD / (po.exchangeRate || FALLBACK_NTD_PER_USD);
                                    const totalNTD = po.purchasePriceNTD;
                                    const totalIDR = po.purchasePriceIDR || getIDREquivalent(totalNTD, po);

                                    let discountTop, discountBottom;
                                    if (poCurrency === 'IDR') {
                                       discountTop = discountCents > 0 ? `-${formatIDR(discountIDR)}` : 'Rp 0';
                                       discountBottom = discountCents > 0 ? `-${formatNTD(discountCents)}` : 'NT$ 0.00';
                                    } else if (poCurrency === 'USD') {
                                       discountTop = discountCents > 0 ? `-US$ ${discountUSD.toFixed(2)}` : 'US$ 0.00';
                                       discountBottom = discountCents > 0 ? `-${formatNTD(discountCents)}` : 'NT$ 0.00';
                                    } else {
                                       discountTop = discountCents > 0 ? `-${formatNTD(discountCents)}` : 'NT$ 0.00';
                                    }

                                    let totalTop, totalBottom;
                                    if (poCurrency === 'IDR') {
                                       totalTop = formatIDR(totalIDR);
                                       totalBottom = formatNTD(totalNTD);
                                    } else if (poCurrency === 'USD') {
                                       totalTop = formatUSD(po.purchasePriceUSD || (totalNTD / 100 / (po.exchangeRate || FALLBACK_NTD_PER_USD)));
                                       totalBottom = formatNTD(totalNTD);
                                    } else {
                                       totalTop = formatNTD(totalNTD);
                                    }

                                    return (
                                      <>
                                        <div className="flex justify-between items-baseline text-[13px] text-neutral-500 dark:text-neutral-400">
                                          <span>Diskon</span>
                                          <div className="text-right font-numeric text-neutral-900 dark:text-neutral-100">
                                            {discountTop}
                                            {discountBottom && <span className="block text-[11.5px] font-normal text-neutral-500 dark:text-neutral-400">{discountBottom}</span>}
                                          </div>
                                        </div>
                                        <div className="h-[1px] bg-neutral-200 dark:bg-neutral-800 my-0.5"></div>
                                        <div className="flex justify-between items-baseline">
                                          <span className="font-semibold text-[14px] text-neutral-900 dark:text-neutral-100">Total Pesanan</span>
                                          <div className="text-right font-numeric">
                                            <span className="text-[19px] font-bold text-indigo-600 dark:text-indigo-400">{totalTop}</span>
                                            {totalBottom && <span className="block text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400 mt-px">{totalBottom}</span>}
                                          </div>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                            
                            <p className="text-[12px] text-neutral-400 dark:text-neutral-500 text-center mt-[18px]">
                              Baris bergaris putus-putus menandakan sisa barang yang ditutup dan tidak akan diterima.
                            </p>

                            {/* Action buttons (like Tutup Sisa PO if status === 'partial') */}
                            {po.status === 'partial' && (
                              <div className="mt-4 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setClosingPo(po);
                                    const items = po.items && po.items.length > 0 ? po.items : [{
                                      bookId: po.bookId,
                                      bookName: po.bookName,
                                      qty: po.qty,
                                      qtyReceived: po.qtyReceived || 0
                                    }];
                                    const noteText = (() => {
                                      if (items.length === 1) {
                                        const it = items[0];
                                        const rec = it.qtyReceived || 0;
                                        const cancelled = it.qty - rec;
                                        return `${it.bookName} Diterima ${rec}, Sisanya ${cancelled} dibatalkan`;
                                      } else {
                                        const parts = [];
                                        items.forEach((it: any) => {
                                          const rec = it.qtyReceived || 0;
                                          const cancelled = it.qty - rec;
                                          if (rec > 0) {
                                            parts.push(`${it.bookName} Diterima ${rec}`);
                                          }
                                          if (cancelled > 0) {
                                            parts.push(`${it.bookName} sebanyak ${cancelled} dibatalkan`);
                                          }
                                        });
                                        return parts.join(", ");
                                      }
                                    })();
                                    setClosePoNote(noteText);
                                    setClosePoOption('refund');
                                    setIsClosePoModalOpen(true);
                                  }}
                                  className="px-4 py-2 bg-[#f00505] hover:bg-[#d00404] text-white rounded-xl text-[12px] font-bold uppercase transition shadow-sm cursor-pointer w-full md:w-auto text-center"
                                >
                                  Tutup Sisa PO
                                </button>
                              </div>
                            )}

                          </div>
                        );
                      })()}                    </div>
                  );
                })}

                {paginatedPOs.length === 0 && (
                  <div className="p-12 text-center text-neutral-400 font-semibold">
                    Tidak ada data pembelian yang cocok dengan filter penelusuran.
                  </div>
                )}
              </div>

                </div>
              </div>

            </div>
          </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 bg-white/60 dark:bg-neutral-900/50 rounded-3xl border border-neutral-205/50 dark:border-neutral-850 flex items-center justify-between shadow-xs select-none backdrop-blur-md">
                <span className="text-xs text-neutral-500 font-numeric">
                  Menampilkan hlm {currentPage} dari {totalPages} ({filteredPOs.length} Pembelian)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-2 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-xl disabled:opacity-40 transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-2 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-xl disabled:opacity-40 transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Dynamic Platforms Configuration Modal (Manage Platform Button) */}
      {isPlatformOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsPlatformOpen(false);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white/95 dark:bg-neutral-900/95 rounded-3xl border border-neutral-200/50 dark:border-neutral-800 shadow-2xl w-[92%] max-w-2xl overflow-hidden backdrop-blur-md my-auto">
            <div className="p-5 border-b border-blue-100/50 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-widest flex items-center gap-2 bg-gradient-to-r from-neutral-800 to-neutral-950 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent">
                <LayoutGrid className="h-4.5 w-4.5 text-blue-500" />
                PENGATURAN PLATFORM
              </h3>
              <button onClick={() => setIsPlatformOpen(false)} className="text-neutral-400 hover:text-blue-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 p-1.5 rounded-lg transition cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {platformModalError && (
              <div className="mx-6 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-250 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400 text-xs font-bold font-text flex items-start gap-2.5 shadow-sm animate-in fade-in duration-200">
                <AlertCircle className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{platformModalError}</span>
                <button 
                  type="button" 
                  onClick={() => setPlatformModalError(null)}
                  className="text-neutral-400 hover:text-rose-600 transition p-0.5 rounded cursor-pointer self-start"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 select-text">
              {/* Form Save */}
              <form onSubmit={handleSavePlatform} className="space-y-4">
                <h4 className="text-[10px] uppercase font-black tracking-widest text-blue-500 pb-2 border-b border-blue-50 dark:border-neutral-850">
                  {editingPlatformId ? 'Edit Platform' : 'Tambah Platform Baru'}
                </h4>
                
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Nama Tempat Belanja / Platform *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Shopee Indo Wholesaler, Toko Hijau..."
                    value={platformNameInput}
                    onChange={(e) => setPlatformNameInput(e.target.value)}
                    className={`w-full px-4 py-2.5 text-xs border bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/25 rounded-2xl transition-all ${
                      shakeFields['platformNameInput']
                        ? 'border-red-500 ring-2 ring-red-500 animate-shake'
                        : 'border-neutral-200 dark:border-neutral-750'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Operational Currency Setting *</label>
                  <select
                    value={platformCurrencyInput}
                    onChange={(e) => setPlatformCurrencyInput(e.target.value as any)}
                    className="w-full px-4 py-2.5 text-xs border border-neutral-205 dark:border-neutral-750 bg-white/50 dark:bg-neutral-950 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition duration-150"
                  >
                    <option value="IDR">IDR (Indonesian Rupiah)</option>
                    <option value="NTD">NTD (New Taiwan Dollar)</option>
                    <option value="USD">USD (United States Dollar)</option>
                  </select>
                </div>

                <div className="flex gap-2.5 pt-2">
                  {editingPlatformId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlatformId(null);
                        setPlatformNameInput('');
                        setPlatformCurrencyInput('IDR');
                      }}
                      className="px-4 py-2 border rounded-lg text-xs font-bold text-neutral-600 dark:text-neutral-300"
                    >
                      Batal
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-lg shadow transition"
                  >
                    {editingPlatformId ? 'Simpan' : 'Tambah'}
                  </button>
                </div>
              </form>

              {/* Read Platforms List */}
              <div className="space-y-4 pl-0 md:pl-6 border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-800 max-h-96 overflow-y-auto select-text">
                <h4 className="text-[10px] uppercase font-black tracking-widest text-neutral-400">Platform Terdaftar</h4>
                <div className="space-y-2">
                  {platforms.map(plat => (
                    <div key={plat.id} className="flex justify-between items-center p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs select-text">
                      <div>
                        <p className="font-extrabold text-neutral-900 dark:text-neutral-100 leading-tight break-all max-w-[150px]">{plat.name}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 text-[10px] font-numeric font-black uppercase">
                          {plat.currency}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingPlatformId(plat.id);
                            setPlatformNameInput(plat.name);
                            setPlatformCurrencyInput(plat.currency);
                            setPlatformModalError(null);
                          }}
                          className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition cursor-pointer relative z-10"
                        >
                          <Edit2 className="h-3.5 w-3.5 text-neutral-500 pointer-events-none" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeletePlatformState({ id: plat.id, name: plat.name });
                          }}
                          className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition text-red-550 cursor-pointer relative z-10"
                        >
                          <Trash2 className="h-3.5 w-3.5 pointer-events-none" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Delete Platform Confirmation Overlay */}
          {deletePlatformState && (
            <div 
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setDeletePlatformState(null);
                }
              }}
              className={getModalOverlayClass(sidebarHidden, 'z-[60]')}
            >
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[90%] max-w-sm overflow-hidden animate-scaleIn p-5 space-y-4 my-auto">
                <div className="flex items-center gap-2 text-rose-650 dark:text-rose-400">
                  <Trash2 className="h-5 w-5" />
                  <h3 className="font-bold text-neutral-800 dark:text-neutral-100">
                    Konfirmasi Hapus Platform
                  </h3>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-350 leading-relaxed font-semibold">
                  Hapus platform <span className="font-extrabold">{deletePlatformState.name}</span>? Platform ini tidak akan tersedia saat membuat Purchase Order baru.
                </p>
                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs font-text">
                  <button 
                    type="button"
                    onClick={() => setDeletePlatformState(null)}
                    className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-350 font-bold cursor-pointer transition select-none"
                  >
                    Batal
                  </button>
                  <button 
                    type="button"
                    onClick={async () => {
                      const platId = deletePlatformState.id;
                      const platName = deletePlatformState.name;
                      setDeletePlatformState(null);
                      await handleDeletePlatform(platId, platName);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 rounded-lg text-white font-bold cursor-pointer transition shadow-sm select-none"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSV Upload / Import Modal */}
      {isCsvUploadOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCsvUploadOpen(false);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white/95 dark:bg-neutral-900/95 rounded-3xl border border-neutral-200/50 dark:border-neutral-800 shadow-2xl w-[92%] max-w-lg overflow-hidden backdrop-blur-md my-auto">
            <div className="p-5 border-b border-blue-100/50 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <FileSpreadsheet className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">
                    Import Purchase Order (Excel / CSV)
                  </h3>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-450 font-semibold font-text">
                    Unggah file Excel (.xlsx, .xls) atau CSV (.csv) untuk membuat PO & item secara otomatis
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsCsvUploadOpen(false)}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 rounded-lg cursor-pointer transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 font-text max-h-[80vh] overflow-y-auto">
              {/* Download Template Section */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-150 dark:border-neutral-800 rounded-2xl">
                <div className="space-y-0.5">
                  <p className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">Belum punya format Excel / CSV?</p>
                  <p className="text-[10px] text-neutral-500 font-medium">Download template yang kompatibel dengan daftar platform terbaru.</p>
                </div>
                <button
                  onClick={downloadImportTemplate}
                  className="px-3 py-2 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-850 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition active:scale-97 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Template
                </button>
              </div>

              {/* File Selector */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                  Pilih File Excel / CSV *
                </label>
                <div 
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition ${
                    dragActive 
                      ? 'border-[#6B1F3D] dark:border-indigo-400 bg-neutral-100/50 dark:bg-neutral-900/50 scale-[1.01]' 
                      : 'border-neutral-200 hover:border-[#6B1F3D] dark:border-neutral-800 dark:hover:border-indigo-400 bg-neutral-50/20 dark:bg-neutral-950/20 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/10'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      dragActive ? 'bg-[#6B1F3D]/10 text-[#6B1F3D] dark:text-indigo-400' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                    }`}>
                      {isImporting ? (
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                      ) : (
                        <Upload className="h-5 w-5" />
                      )}
                    </div>
                    <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      {isImporting ? "Sedang Mengimpor..." : (dragActive ? "Lepaskan file untuk mengunggah" : "Klik atau seret file ke sini untuk mengunggah")}
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      Mendukung format file Excel (.xlsx, .xls) dan CSV (.csv)
                    </p>
                  </div>
                </div>
              </div>

              {/* CSV Validation Result Display */}
              {csvValidationResult && (
                <div className={`p-4 rounded-2xl border text-xs font-semibold leading-relaxed space-y-2.5 animate-fade-in ${
                  csvValidationResult.status === 'success'
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/25 border-emerald-100/45 dark:border-emerald-900/30 text-emerald-850 dark:text-emerald-350'
                    : 'bg-rose-50/50 dark:bg-rose-950/25 border-rose-100/45 dark:border-rose-900/30 text-rose-850 dark:text-rose-350'
                }`}>
                  <div className="flex items-start gap-2.5">
                    {csvValidationResult.status === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className={`font-extrabold text-xs uppercase tracking-wide ${
                        csvValidationResult.status === 'success' ? 'text-emerald-900 dark:text-emerald-200' : 'text-rose-900 dark:text-rose-200'
                      }`}>
                        {csvValidationResult.status === 'success' ? 'Import Sukses' : 'Validasi Gagal'}
                      </p>
                      <p className="font-semibold text-neutral-600 dark:text-neutral-300">
                        {csvValidationResult.message}
                      </p>
                    </div>
                  </div>

                  {csvValidationResult.details && (
                    <div className="mt-3 pl-7 space-y-3 pt-3 border-t border-rose-100/45 dark:border-rose-900/30 text-[11px] text-neutral-600 dark:text-neutral-350 max-h-52 overflow-y-auto font-mono scrollbar-thin">
                      {csvValidationResult.details.missingFields && (
                        <div className="space-y-1">
                          <p className="font-bold text-rose-700 dark:text-rose-400">⚠️ Kolom Wajib Hilang atau Kosong:</p>
                          <pre className="p-2 bg-neutral-50 dark:bg-neutral-950 rounded-lg text-neutral-600 dark:text-neutral-450 border border-neutral-100 dark:border-neutral-850 whitespace-pre-wrap leading-tight text-[10px]">
                            {csvValidationResult.details.missingFields}
                          </pre>
                        </div>
                      )}

                      {csvValidationResult.details.invalidPlatforms && (
                        <div className="space-y-1">
                          <p className="font-bold text-rose-700 dark:text-rose-400">⚠️ Platform Belanja Tidak Cocok:</p>
                          <pre className="p-2 bg-neutral-50 dark:bg-neutral-950 rounded-lg text-neutral-600 dark:text-neutral-450 border border-neutral-100 dark:border-neutral-850 whitespace-pre-wrap leading-tight text-[10px]">
                            {csvValidationResult.details.invalidPlatforms}
                          </pre>
                        </div>
                      )}

                      {csvValidationResult.details.invalidProducts && (
                        <div className="space-y-1">
                          <p className="font-bold text-rose-700 dark:text-rose-400">⚠️ Product ID Tidak Ditemukan di Katalog:</p>
                          <pre className="p-2 bg-neutral-50 dark:bg-neutral-950 rounded-lg text-neutral-600 dark:text-neutral-450 border border-neutral-100 dark:border-neutral-850 whitespace-pre-wrap leading-tight text-[10px]">
                            {csvValidationResult.details.invalidProducts}
                          </pre>
                        </div>
                      )}

                      {csvValidationResult.details.invalidDates && (
                        <div className="space-y-1">
                          <p className="font-bold text-rose-700 dark:text-rose-400">⚠️ Format Tanggal Salah (Gunakan YYYY/MM/DD):</p>
                          <pre className="p-2 bg-neutral-50 dark:bg-neutral-950 rounded-lg text-neutral-600 dark:text-neutral-450 border border-neutral-100 dark:border-neutral-850 whitespace-pre-wrap leading-tight text-[10px]">
                            {csvValidationResult.details.invalidDates}
                          </pre>
                        </div>
                      )}

                      {csvValidationResult.details.invalidNumbers && (
                        <div className="space-y-1">
                          <p className="font-bold text-rose-700 dark:text-rose-400">⚠️ Qty atau Harga Tidak Valid:</p>
                          <pre className="p-2 bg-neutral-50 dark:bg-neutral-950 rounded-lg text-neutral-600 dark:text-neutral-450 border border-neutral-100 dark:border-neutral-850 whitespace-pre-wrap leading-tight text-[10px]">
                            {csvValidationResult.details.invalidNumbers}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-950 border-t border-neutral-150 dark:border-neutral-800 flex justify-end gap-2.5">
              <button 
                onClick={() => setIsCsvUploadOpen(false)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-750 rounded-xl text-neutral-600 dark:text-neutral-300 font-bold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO Baru Modal Creator overlay */}
      {isNewPoOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (addedItems.length > 0 && !isPoViewOnly) {
                if (!window.confirm("Keluar? Perubahan belanjaan belum disimpan.")) return;
              }
              setIsNewPoOpen(false);
              setEditingPoId(null);
              setIsPoViewOnly(false);
              setPreviewCoverIdx(null);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-[#E7E1D3] dark:border-neutral-800 shadow-[0_25px_60px_rgba(0,0,0,0.25)] w-[94%] max-w-5xl overflow-hidden my-auto max-h-[90vh]">
            <div className="p-6 border-b border-[#E7E1D3] dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-[10px] bg-[#6B2545] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-text text-[#1E1B17] dark:text-neutral-100 leading-tight">
                    {isPoViewOnly ? "Detail Pembelian Buku" : editingPoId ? "Edit Pembelian Buku" : "Tambah Pembelian Buku"}
                  </h3>
                  <p className="text-xs text-[#8A857D] dark:text-neutral-400 mt-0.5 font-text">
                    Catat pembelian &amp; rekonsiliasi penerimaan dari supplier
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setIsNewPoOpen(false);
                  setEditingPoId(null);
                  setIsPoViewOnly(false);
                  setPreviewCoverIdx(null);
                }} 
                className="p-2 rounded-lg text-[#8A857D] hover:bg-[#F4E3DA] hover:text-[#B5502F] transition duration-150 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchaseOrder} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              
              {/* SECTION 1: INFORMASI PEMBELIAN */}
              <div className="space-y-4 pb-6 border-b border-[#E7E1D3]/50 dark:border-neutral-800 font-text">
                {/* ROW 1: [Tanggal Order] [Platform Belanja] [Status Pembayaran] */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Tanggal Order *</label>
                    <input
                      type="date"
                      disabled={isPoViewOnly}
                      value={poDate}
                      onChange={(e) => setPoDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Platform Belanja *</label>
                    <select
                      value={platformId}
                      disabled={isPoViewOnly}
                      onChange={(e) => handlePlatformChange(e.target.value)}
                      className={`w-full px-3 py-2 text-sm border bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text ${
                        shakeFields['platformId']
                          ? 'border-red-500 ring-2 ring-red-500 animate-shake'
                          : 'border-[#E7E1D3] dark:border-neutral-700'
                      }`}
                    >
                      {platforms.map(p => (
                        <option key={p.id} value={p.id}>{p.name} [{p.currency}]</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Status Pembayaran *</label>
                    <select
                      value={poPaymentStatus}
                      disabled={isPoViewOnly}
                      onChange={(e) => setPoPaymentStatus(e.target.value as any)}
                      className="w-full px-3 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text"
                    >
                      <option value="paid">Lunas Langsung (Cash)</option>
                      <option value="unpaid">Belum Dibayar (Kredit/Utang)</option>
                    </select>
                  </div>
                </div>

                {/* ROW 2: [Nomor Pembelian] [Nomor Resi] */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Nomor Pembelian *</label>
                    <input
                      type="text"
                      required
                      disabled={isPoViewOnly}
                      placeholder="Contoh: ID-9080-X"
                      value={supplierOrderNumber}
                      onChange={(e) => setSupplierOrderNumber(e.target.value)}
                      className={`w-full px-3 py-2 text-sm border bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text ${
                        shakeFields['supplierOrderNumber']
                          ? 'border-red-500 ring-2 ring-red-500 animate-shake'
                          : 'border-[#E7E1D3] dark:border-neutral-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Nomor Resi</label>
                    <input
                      type="text"
                      disabled={isPoViewOnly}
                      placeholder="Contoh: JP-992923"
                      value={supplierTrackingNumber}
                      onChange={(e) => setSupplierTrackingNumber(e.target.value)}
                      className={`w-full px-3 py-2 text-sm border bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 disabled:bg-[#F7F3EA]/50 dark:disabled:bg-neutral-950 disabled:text-neutral-500 font-text ${
                        shakeFields['supplierTrackingNumber']
                          ? 'border-red-500 ring-2 ring-red-500 animate-shake'
                          : 'border-[#E7E1D3] dark:border-neutral-700'
                      }`}
                    />
                  </div>
                </div>
              </div>
              {/* SECTION 2: DAFTAR BUKU */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 select-none">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-[#8A857D] font-text">
                    Daftar Buku &amp; Belanjaan
                  </span>
                  <div className="flex-1 h-px bg-[#E7E1D3] dark:bg-neutral-800" />
                </div>
                
                <div className="space-y-3">
                  {!isPoViewOnly && (
                    <div className="relative">
                      <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">Cari &amp; Tambah Buku dari Katalog *</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#B7B0A3]" />
                        <input
                          type="text"
                          placeholder="Ketik nama buku catalog untuk menambahkan ke baris daftar belanja..."
                          value={catalogSearch}
                          onFocus={() => setShowCatalogDropdown(true)}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg placeholder-[#B7B0A3] focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 font-text"
                        />
                      </div>

                      {showCatalogDropdown && catalogSearch.trim().length > 0 && (
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-neutral-950 border border-[#E7E1D3] dark:border-neutral-800 rounded-lg shadow-2xl z-50 divide-y divide-[#E7E1D3]/50 dark:divide-neutral-850 font-text">
                          {(() => {
                            const filtered = books.filter(b => b && b.bookName && b.bookName.toLowerCase().includes(catalogSearch.toLowerCase()) && !addedItems.some(it => it.bookId === b.id));
                            if (filtered.length === 0) {
                              return (
                                <div className="p-3 text-xs font-semibold text-neutral-500 italic">
                                  Buku tidak ditemukan
                                </div>
                              );
                            }
                            return filtered.map(b => (
                              <div 
                                key={b.id} 
                                onClick={() => {
                                  handleAddCatalogToPO(b);
                                  setCatalogSearch('');
                                  setShowCatalogDropdown(false);
                                }}
                                className="p-2.5 hover:bg-[#F7F3EA] dark:hover:bg-neutral-900 cursor-pointer text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-3 select-text"
                              >
                                <img 
                                  src={b.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'} 
                                  alt={b.bookName} 
                                  className="w-8 h-12 object-cover rounded border border-[#E7E1D3] dark:border-neutral-800 shadow-xs shrink-0" 
                                  referrerPolicy="no-referrer"
                                />
                                <span>{b.bookName}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Added Books Matrix Table */}
                  {addedItems.length > 0 ? (
                    <div className="border border-[#E7E1D3] dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse min-w-[700px]">
                          <thead>
                            <tr className="bg-[#F7F3EA] dark:bg-neutral-950 text-[#8A857D] dark:text-neutral-400 text-[10px] uppercase font-bold tracking-wider border-b border-[#E7E1D3] dark:border-neutral-800 font-text">
                              <th className="p-3 text-left">Buku</th>
                              <th className="p-3 text-right w-24">Pcs</th>
                              {selectedPlatform?.currency !== 'NTD' && (
                                <th className="p-3 text-right w-36">Harga Total ({selectedPlatform?.currency})</th>
                              )}
                              <th className="p-3 text-right w-36">NTD Total</th>
                              <th className="p-3 text-right w-36">/ Item NTD</th>
                              {!isPoViewOnly && <th className="p-3 text-center w-16">Aksi</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E7E1D3]/50 dark:divide-neutral-800 text-sm">
                            {addedItems.map((item, idx) => {
                              const displayPlatformTotal = item.pricePlatformTotal !== undefined 
                                ? item.pricePlatformTotal 
                                : parseCommasToNumber(item.pricePlatformStr || '0');
                              
                              const displayNTDTotal = item.priceNTDTotal !== undefined 
                                ? item.priceNTDTotal 
                                : Math.round(parseCommasToNumber(item.priceNTDStr || '0') * 100);
                              
                              const displayPerItem = item.pricePerItem !== undefined 
                                ? item.pricePerItem 
                                : Math.round(parseCommasToNumber(item.pricePerItemStr || '0') * 100);

                              return (
                                <tr key={idx} className="hover:bg-[#F7F3EA]/30 dark:hover:bg-neutral-950/10 transition duration-100">
                                <td className="p-3">
                                  <div className="flex items-center gap-3">
                                    <div className="relative w-8 h-12 cursor-pointer group shrink-0" onClick={() => setPreviewCoverIdx(previewCoverIdx === idx ? null : idx)}>
                                      <img 
                                        src={books.find(b => b.id === item.bookId)?.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'} 
                                        alt={item.bookName} 
                                        className="w-8 h-12 object-cover rounded border border-[#E7E1D3] dark:border-neutral-800 shadow-sm transition group-hover:brightness-95 group-hover:scale-105" 
                                        referrerPolicy="no-referrer"
                                      />
                                      {previewCoverIdx === idx && (
                                        <>
                                          <div 
                                            className="fixed inset-0 z-40" 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewCoverIdx(null);
                                            }}
                                          />
                                          <div 
                                            className="absolute left-full top-0 ml-3 bg-white dark:bg-neutral-900 border border-[#E7E1D3] dark:border-neutral-800 rounded-xl p-2.5 shadow-2xl z-50 animate-fade-in w-36 sm:w-44"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="relative">
                                              <img 
                                                src={books.find(b => b.id === item.bookId)?.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'} 
                                                alt={item.bookName} 
                                                className="w-full h-auto object-cover rounded border border-neutral-100 dark:border-neutral-800 shadow-sm"
                                                referrerPolicy="no-referrer"
                                              />
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setPreviewCoverIdx(null);
                                                }}
                                                className="absolute -top-2 -right-2 bg-neutral-900/80 hover:bg-neutral-900 dark:bg-neutral-800/90 dark:hover:bg-neutral-750 text-white rounded-full p-1 shadow-md transition"
                                              >
                                                <X className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                            <div className="mt-2 text-[10px] leading-snug font-text font-semibold text-neutral-500 dark:text-neutral-400 text-center line-clamp-2">
                                              {item.bookName}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    <span className="font-text font-semibold text-[#1E1B17] dark:text-neutral-100 break-all line-clamp-2">
                                      {item.bookName}
                                    </span>
                                  </div>
                                </td>

                                {/* Quantity (Pcs) */}
                                <td className="p-3 text-right font-numeric">
                                  {isPoViewOnly ? (
                                    <span className="font-numeric font-bold text-neutral-800 dark:text-neutral-200">
                                      {item.qtyStr || '0'} pcs
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      value={item.qtyStr}
                                      onChange={(e) => handleLineQtyChange(idx, e.target.value)}
                                      className={`w-full max-w-[80px] px-2 py-1 border border-[#E7E1D3] dark:border-neutral-750 bg-white dark:bg-neutral-950 rounded text-right font-numeric text-xs font-bold focus:outline-none focus:border-[#A9812E] focus:ring-1 focus:ring-[#A9812E]/18 transition duration-150 inline-block ${
                                        shakeFields[`qty-${idx}`] ? 'border-red-500 ring-1 ring-red-500 animate-shake' : ''
                                      }`}
                                    />
                                  )}
                                </td>

                                {/* Platform Currency fields */}
                                {selectedPlatform?.currency !== 'NTD' && (
                                  <td className="p-3 text-right">
                                    {isPoViewOnly ? (
                                      <span className="font-numeric font-bold text-neutral-800 dark:text-neutral-200">
                                        {selectedPlatform?.currency === 'IDR' ? formatIDR(displayPlatformTotal) : '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(displayPlatformTotal)}
                                      </span>
                                    ) : (
                                      <input
                                        type="text"
                                        value={item.pricePlatformStr}
                                        onChange={(e) => handleLinePlatformPriceChange(idx, e.target.value)}
                                        className={`w-full max-w-[120px] px-2.5 py-1 border border-[#E7E1D3] dark:border-neutral-750 bg-white dark:bg-neutral-950 rounded font-numeric text-right text-xs font-bold focus:outline-none focus:border-[#A9812E] focus:ring-1 focus:ring-[#A9812E]/18 transition duration-150 inline-block ${
                                          shakeFields[`price-${idx}`] ? 'border-red-500 ring-1 ring-red-500 animate-shake' : ''
                                        }`}
                                      />
                                    )}
                                  </td>
                                )}

                                {/* Harga NTD (Total) */}
                                <td className="p-3 text-right">
                                  {isPoViewOnly ? (
                                    <span className="font-numeric font-bold text-[#6B2545] dark:text-rose-400">
                                      {formatNTD(displayNTDTotal)}
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      value={item.priceNTDStr}
                                      onChange={(e) => handleLineNTDPriceChange(idx, e.target.value)}
                                      className="w-full max-w-[120px] px-2.5 py-1 border border-[#E7E1D3] dark:border-neutral-750 bg-white dark:bg-neutral-950 rounded font-numeric text-right text-xs font-bold focus:outline-none focus:border-[#A9812E] focus:ring-1 focus:ring-[#A9812E]/18 transition duration-150 inline-block"
                                    />
                                  )}
                                </td>

                                {/* Harga NTD (Per pcs) */}
                                <td className="p-3 text-right">
                                  {isPoViewOnly ? (
                                    <span className="font-numeric text-neutral-500 dark:text-neutral-400">
                                      {formatNTD(displayPerItem)}
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      value={item.pricePerItemStr}
                                      onChange={(e) => handleLinePerItemPriceChange(idx, e.target.value)}
                                      className="w-full max-w-[120px] px-2.5 py-1 border border-[#E7E1D3] dark:border-neutral-750 bg-white dark:bg-neutral-950 rounded font-numeric text-right text-xs font-bold text-[#8A857D] focus:outline-none focus:border-[#A9812E] focus:ring-1 focus:ring-[#A9812E]/18 transition duration-150 inline-block"
                                    />
                                  )}
                                </td>

                                {!isPoViewOnly && (
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => setAddedItems(prev => prev.filter((_, i) => i !== idx))}
                                      className="text-neutral-400 hover:text-[#B5502F] hover:bg-[#F4E3DA] rounded-lg p-1.5 transition cursor-pointer"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                    <PriceMismatchBadge 
                                      item={item} 
                                      idx={idx}
                                      pricingTiers={pricingTiers}
                                      currentFXRate={currentFXRate}
                                      selectedPlatform={selectedPlatform}
                                      catalogBook={books.find(b => b.id === item.bookId)}
                                      onReviewAction={handlePriceReviewAction}
                                    />
                                  </td>
                                )}
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center border-2 border-dashed border-[#E7E1D3] dark:border-neutral-800 rounded-2xl text-[#8A857D] dark:text-neutral-500 select-none font-text">
                      Belum ada buku ditambahkan. Cari judul di atas atau tambah baris manual untuk memulai.
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: REKONSILIASI & DISKON */}
              {(() => {
                const platformCurrencySymbol = selectedPlatform?.currency === 'IDR' ? 'Rp' : selectedPlatform?.currency === 'USD' ? 'US$' : 'NT$';

                const subtotalPlatformCur = addedItems.reduce((acc, it) => {
                  if (selectedPlatform?.currency === 'IDR') {
                    return acc + (parseFloat(cleanCommas(it.pricePlatformStr || '0')) || 0);
                  } else if (selectedPlatform?.currency === 'USD') {
                    return acc + (parseFloat(cleanCommas(it.pricePlatformStr || '0')) || 0);
                  } else {
                    return acc + (parseFloat(cleanCommas(it.priceNTDStr || '0')) || 0);
                  }
                }, 0);

                const formatPlatformCurrency = (val: number) => {
                  if (selectedPlatform?.currency === 'IDR') {
                    return formatIDR(val);
                  } else if (selectedPlatform?.currency === 'USD') {
                    return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
                  } else {
                    return formatNTD(val * 100);
                  }
                };

                const parseCurrencyInput = (val: string) => {
                  const clean = val.replace(/,/g, '');
                  const num = parseFloat(clean);
                  return isNaN(num) ? 0 : num;
                };

                const actualVal = parseCurrencyInput(actualReceiptTotal);
                const diffVal = subtotalPlatformCur - actualVal;
                const currentDiscountVal = parseCurrencyInput(poDiscount);
                const hasDiff = Math.abs(currentDiscountVal - diffVal) > 0.001;
                const labelSuffix = ` (${platformCurrencySymbol})`;

                return (
                  <div className="space-y-4 font-text">
                    <div className="flex items-center gap-3 select-none">
                      <span className="text-[11px] font-bold tracking-wider uppercase text-[#8A857D] font-text">
                        Rekonsiliasi Penerimaan
                      </span>
                      <div className="flex-1 h-px bg-[#E7E1D3] dark:bg-neutral-800" />
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                      {/* Left inputs */}
                      <div className="lg:col-span-3 space-y-4">
                        {/* Actual receipt total input */}
                        <div>
                          <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase mb-1.5 font-text">
                            Total Belanja Sebenarnya{labelSuffix}
                          </label>
                          <input
                            type="text"
                            placeholder={isPoViewOnly ? "--" : "Masukkan total invoice/resi..."}
                            value={actualReceiptTotal}
                            disabled={isPoViewOnly}
                            onChange={(e) => setActualReceiptTotal(formatInputWithCommas(e.target.value))}
                            className="w-full px-3 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg placeholder-[#B7B0A3] focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 font-numeric font-bold text-right disabled:bg-[#F7F3EA]/30 dark:disabled:bg-neutral-950 disabled:text-neutral-400"
                          />
                          <p className="text-[11px] text-[#8A857D] dark:text-neutral-400 mt-1.5 select-none">
                            Jumlah total net yang tertera pada invoice asli dari supplier.
                          </p>
                        </div>

                        {/* Purchase discount input */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] font-semibold text-[#8A857D] tracking-wider uppercase font-text">
                              Diskon Pembelian{labelSuffix}
                            </label>
                            
                            {/* Auto Badge stamp matching the HTML layout */}
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 border border-dashed border-[#A9812E] text-[#A9812E] text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full select-none rotate-[-1deg]">
                                OTOMATIS
                              </span>
                              {hasDiff && !isPoViewOnly && (
                                <button
                                  type="button"
                                  onClick={() => setPoDiscount(String(diffVal))}
                                  className="text-[10px] font-semibold text-[#A9812E] hover:text-[#6B2545] cursor-pointer bg-transparent border-0 p-0 flex items-center gap-0.5 font-text"
                                >
                                  <Copy className="h-3 w-3" /> Salin Selisih
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <input
                            type="text"
                            placeholder="0"
                            value={poDiscount}
                            disabled={isPoViewOnly}
                            onChange={(e) => setPoDiscount(formatInputWithCommas(e.target.value))}
                            className="w-full px-3 py-2 text-sm border border-[#E7E1D3] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#1E1B17] dark:text-neutral-100 rounded-lg placeholder-[#B7B0A3] focus:outline-none focus:border-[#A9812E] focus:ring-2 focus:ring-[#A9812E]/18 transition duration-150 font-numeric font-bold text-right disabled:bg-[#F7F3EA]/30 dark:disabled:bg-neutral-950 disabled:text-neutral-400"
                          />
                          <p className="text-[11px] text-[#8A857D] dark:text-neutral-400 mt-1.5 select-none">
                            Dihitung otomatis atau disalin dari selisih Total Belanja Form dan Total Belanja Sebenarnya.
                          </p>
                          {parseFloat(cleanCommas(poDiscount || '0')) < 0 && (
                            <p className="text-[11px] text-[#B5502F] font-bold mt-1.5 animate-pulse">
                              Diskon tidak boleh negatif! (Nilai negatif berarti invoice asli lebih besar dari total form / ada biaya tambahan).
                            </p>
                          )}
                          {parseFloat(cleanCommas(poDiscount || '0')) > subtotalPlatformCur && (
                            <p className="text-[11px] text-[#B5502F] font-bold mt-1.5 animate-pulse">
                              Diskon tidak boleh melebihi Total Belanja di Form!
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right summary box */}
                      <div className="lg:col-span-2">
                        <div className="bg-[#F7F3EA] dark:bg-neutral-950 border border-[#E7E1D3] dark:border-neutral-800 rounded-xl p-5 text-sm space-y-3 shadow-xs">
                          <div className="flex justify-between items-center text-[#8A857D] dark:text-neutral-400">
                            <span className="font-medium">Total Belanja (Form)</span>
                            {(() => {
                              const isIDR = selectedPlatform?.currency === 'IDR';
                              const isUSD = selectedPlatform?.currency === 'USD';
                              if (isIDR || isUSD) {
                                return (
                                  <div className="text-right font-numeric flex flex-col items-end select-text">
                                    <span className="font-numeric font-bold text-[#1E1B17] dark:text-neutral-100">
                                      {formatPlatformCurrency(subtotalPlatformCur)}
                                    </span>
                                    <span className="font-numeric text-[10px] text-[#8A857D] dark:text-neutral-500 mt-0.5 font-bold">
                                      {formatNTD(Math.round(subtotalPlatformCur * currentFXRate * 100))}
                                    </span>
                                  </div>
                                );
                              } else {
                                return (
                                  <span className="font-numeric font-bold text-[#1E1B17] dark:text-neutral-100 select-text">
                                    {formatPlatformCurrency(subtotalPlatformCur)}
                                  </span>
                                );
                              }
                            })()}
                          </div>

                          <div className="flex justify-between items-center text-[#8A857D] dark:text-neutral-400">
                            <span className="font-medium">Diskon Pembelian</span>
                            <span className="font-numeric font-bold text-neutral-700 dark:text-neutral-300">
                              {formatPlatformCurrency(currentDiscountVal)}
                            </span>
                          </div>

                          <div className="h-px bg-[#E7E1D3] dark:bg-neutral-850" />

                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-[#1E1B17] dark:text-neutral-100">Net Total PO</span>
                            {(() => {
                              const isIDR = selectedPlatform?.currency === 'IDR';
                              const isUSD = selectedPlatform?.currency === 'USD';
                              const netPlat = Math.max(0, subtotalPlatformCur - currentDiscountVal);
                              if (isIDR || isUSD) {
                                return (
                                  <div className="text-right font-numeric flex flex-col items-end select-text">
                                    <span className="font-numeric font-bold text-[#6B2545] dark:text-rose-400 text-base">
                                      {formatPlatformCurrency(netPlat)}
                                    </span>
                                    <span className="font-numeric text-[10px] text-[#8A857D] dark:text-neutral-500 mt-0.5 font-bold">
                                      {formatNTD(Math.round(netPlat * currentFXRate * 100))}
                                    </span>
                                  </div>
                                );
                              } else {
                                return (
                                  <span className="font-numeric font-bold text-[#6B2545] dark:text-rose-400 text-base select-text">
                                    {formatPlatformCurrency(netPlat)}
                                  </span>
                                );
                              }
                            })()}
                          </div>

                          <div className="flex justify-between items-center text-[#8A857D] dark:text-neutral-400">
                            <span className="font-medium">Total Sebenarnya (Invoice)</span>
                            <span className="font-numeric font-bold text-neutral-700 dark:text-neutral-300">
                              {formatPlatformCurrency(actualVal)}
                            </span>
                          </div>

                          {actualReceiptTotal.trim() !== '' && (
                            <div className="pt-2.5 border-t border-dashed border-[#E7E1D3] dark:border-neutral-800 flex items-center gap-2 select-none">
                              {!hasDiff ? (
                                <>
                                  <Check className="h-4.5 w-4.5 text-[#3D6B4F] shrink-0" />
                                  <span className="text-xs font-semibold text-[#3D6B4F] dark:text-emerald-400">
                                    Seimbang — sesuai invoice
                                  </span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="h-4.5 w-4.5 text-[#B5502F] shrink-0" />
                                  <span className="text-xs font-semibold text-[#B5502F] dark:text-rose-500">
                                    Selisih {formatPlatformCurrency(Math.abs(diffVal))}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* TRANSACTION HISTORY TIMELINE */}
              {isPoViewOnly && selectedPo?.receiptLogs && selectedPo.receiptLogs.length > 0 && (
                <div className="space-y-4 bg-neutral-50/50 dark:bg-neutral-950/30 p-4 border border-neutral-200 dark:border-neutral-850 rounded-2xl">
                  <h4 className="text-[10px] uppercase font-black tracking-widest text-neutral-450 border-b border-neutral-200 dark:border-neutral-800 pb-1.5 flex items-center gap-1.5 select-none font-text">
                    <History className="h-3.5 w-3.5 text-neutral-400" />
                    RIWAYAT TRANSAKSI & PENERIMAAN BARANG
                  </h4>
                  <div className="p-3 bg-white dark:bg-neutral-900 rounded-xl space-y-1.5 max-h-48 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 border dark:border-neutral-800 text-[11px] leading-relaxed text-neutral-500">
                    {selectedPo.receiptLogs.map((log: string, idx: number) => (
                      <div key={idx} className="py-2 flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 self-center shrink-0" />
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom control handles */}
              <div className="flex justify-end gap-3.5 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                {isPoViewOnly ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewPoOpen(false);
                      setEditingPoId(null);
                      setIsPoViewOnly(false);
                    }}
                    className="px-6 py-2.5 bg-neutral-850 bg-neutral-800 hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-650 text-white text-xs font-bold uppercase rounded-lg shadow-md transition cursor-pointer"
                  >
                    Tutup
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewPoOpen(false);
                        setEditingPoId(null);
                      }}
                      className="px-5 py-2.5 border border-neutral-300 dark:border-neutral-700 text-xs font-bold uppercase rounded-lg text-neutral-600 dark:text-neutral-300 transition hover:bg-neutral-50 cursor-pointer"
                    >
                      Batal
                    </button>
                    {(() => {
                      const activePoBeingEdited = editingPoId ? purchaseOrders.find(p => p.id === editingPoId) : null;
                      const isAdjustedPo = activePoBeingEdited?.isClosedPartially === true;
                      
                      if (isAdjustedPo) {
                        return (
                          <>
                            <button
                              type="button"
                              onClick={(e) => handleSavePurchaseOrder(e, true)}
                              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold uppercase shadow-md transition cursor-pointer font-text"
                            >
                              Draft
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleSavePurchaseOrder(e, false)}
                              className="px-6 py-2.5 bg-[#1F6F54] hover:bg-[#1a5d46] text-white rounded-lg text-xs font-bold uppercase shadow-md transition cursor-pointer font-text"
                            >
                              simpan
                            </button>
                          </>
                        );
                      }
                      
                      return (
                        <button
                          type="button"
                          id="save-new-po-btn"
                          onClick={(e) => handleSavePurchaseOrder(e)}
                          className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold uppercase shadow-md transition cursor-pointer"
                        >
                          simpan
                        </button>
                      );
                    })()}
                  </>
                )}
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Warehouse Goods Receipt Modal (Diterima / Cancel) */}
      {isReceiveOpen && selectedPo && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsReceiveOpen(false);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50')}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-[18px] shadow-2xl border border-[#E1E5E2] dark:border-neutral-800 w-[92%] max-w-[620px] overflow-hidden max-h-[92vh] flex flex-col my-auto">
            {/* Head */}
            <div className="px-[30px] pt-[26px] pb-5 border-b border-[#EBEEEC] dark:border-neutral-800/60 flex justify-between items-start gap-4">
              <div>
                <p className="text-[11px] tracking-widest uppercase text-[#1F6F54] mb-1.5 flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1F6F54] inline-block" />
                  Audit Pelacakan
                </p>
                <h3 className="font-text font-bold text-[22px] text-neutral-900 dark:text-white leading-tight mb-1.5">
                  Penerimaan Barang
                </h3>
                <p className="text-[13px] text-[#69726E] dark:text-neutral-400 font-text">
                  <b className="font-numeric font-semibold text-[#14181B] dark:text-neutral-200">
                    {selectedPo.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}
                  </b>
                  {' · '}
                  {platforms.find(p => p.id === selectedPo.supplierId)?.name || selectedPo.supplierName}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setIsReceiveOpen(false)}
                className="w-8 h-8 rounded-lg border border-[#E1E5E2] dark:border-neutral-800 bg-white dark:bg-neutral-900 text-[#69726E] dark:text-neutral-450 flex items-center justify-center cursor-pointer shrink-0 hover:bg-[#EBEEEC] dark:hover:bg-neutral-850 transition duration-150"
                aria-label="Tutup"
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleProcessReceiveGoods} className="flex-1 overflow-y-auto min-h-0 flex flex-col">
              {/* Manifest */}
              <div className="bg-[#F2F4F3] dark:bg-neutral-950/40 border-b border-[#EBEEEC] dark:border-neutral-800/60 py-5 px-[30px] grid grid-cols-1 md:grid-cols-2 gap-[14px]">
                <div className="field">
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-[#9AA19D] dark:text-neutral-500 mb-1.5 font-text">Tanggal Terima</label>
                  <input
                    type="text"
                    required
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                    className="w-full border border-[#E1E5E2] dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-[10px] py-[10px] px-3 font-numeric text-[13.5px] text-[#14181B] dark:text-neutral-200 focus:outline-none focus:border-[#1F6F54] focus:ring-3 focus:ring-[#E7F2ED]/40 focus:ring-opacity-40 transition duration-150"
                  />
                </div>
                
                {/* Freight Autocomplete inside Field */}
                <div className="relative field">
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-[#9AA19D] dark:text-neutral-500 mb-1.5 font-text">Freight-In</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={receiveKodeEkspedisi}
                      onChange={(e) => {
                        setReceiveKodeEkspedisi(e.target.value.toUpperCase());
                        setIsPoFreightDropdownOpen(true);
                      }}
                      onFocus={() => setIsPoFreightDropdownOpen(true)}
                      placeholder="Pilih nomor Freight-In..."
                      className="w-full border border-[#E1E5E2] dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-[10px] py-[10px] pl-3 pr-8 font-numeric text-[13.5px] text-[#14181B] dark:text-neutral-200 focus:outline-none focus:border-[#1F6F54] focus:ring-3 focus:ring-[#E7F2ED]/40 focus:ring-opacity-40 transition duration-150 font-bold uppercase"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsPoFreightDropdownOpen(!isPoFreightDropdownOpen);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  {isPoFreightDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsPoFreightDropdownOpen(false)} 
                      />
                      <div className="absolute left-0 mt-1.5 w-full max-h-48 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-50 divide-y divide-neutral-100 dark:divide-neutral-850 animate-fade-in font-numeric text-[11px] text-left">
                        {getPendingFreightInRecords().length === 0 ? (
                          <div className="p-3 text-neutral-400 text-center font-text font-semibold">
                            Tidak ada Freight-In Pending
                          </div>
                        ) : (
                          getPendingFreightInRecords()
                            .filter(f => !receiveKodeEkspedisi || (f.freightCode || '').toLowerCase().includes(receiveKodeEkspedisi.toLowerCase()))
                            .map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => {
                                  setReceiveKodeEkspedisi(f.freightCode);
                                  setIsPoFreightDropdownOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-950/40 text-neutral-800 dark:text-neutral-200 font-bold transition flex flex-col gap-0.5"
                              >
                                <span className="text-[#1F6F54] dark:text-emerald-400 font-extrabold">{f.freightCode}</span>
                                <span className="text-[9px] text-neutral-400 font-text font-medium">
                                  Total: {f.totalKg} Kg | rate: {formatIDR(f.ratePerKg)}/Kg
                                </span>
                              </button>
                            ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Label section */}
              <p className="px-[30px] pt-5 pb-2 text-[11px] tracking-widest uppercase text-[#9AA19D] dark:text-neutral-500 font-bold">Barang</p>

              {/* Scrollable list content */}
              <div className="px-5 pb-1.5 space-y-3 overflow-y-auto max-h-72">
                {(selectedPo.items && selectedPo.items.length > 0 ? selectedPo.items : [{
                  bookId: selectedPo.bookId,
                  bookName: selectedPo.bookName,
                  qty: selectedPo.qty,
                  qtyReceived: 0,
                  pricePlatformTotal: selectedPo.purchasePriceIDR || selectedPo.purchasePriceNTD / 100,
                  priceNTDTotal: selectedPo.purchasePriceNTD,
                  pricePerItem: selectedPo.pricePerUnitNTD
                }]).map((item: any) => {
                  const progressState = receiveItemsState[item.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
                  const remainingQty = Math.max(0, item.qty - (item.qtyReceived || 0));
                  const currentVal = parseCommasToNumber(progressState.qtyReceivedThisTime) || 0;
                  const progressPercent = remainingQty > 0 ? (currentVal / remainingQty) * 100 : 0;
                  const isFull = currentVal >= remainingQty;
                  
                  const bookCover = books.find(b => b.id === item.bookId)?.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80';

                  return (
                    <div 
                      key={item.bookId}
                      className="mx-2.5 p-4 border rounded-2xl transition duration-200 bg-white dark:bg-neutral-900 border-[#EBEEEC] dark:border-neutral-800"
                    >
                      <div className="flex items-center gap-3.5">
                        <img 
                          className="w-[46px] h-[46px] rounded-lg object-cover border border-[#EBEEEC] dark:border-neutral-800 shrink-0 bg-neutral-100" 
                          src={bookCover} 
                          alt={item.bookName} 
                          referrerPolicy="no-referrer"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-[14.5px] font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-1 mb-1.5 font-text" title={item.bookName}>
                            {item.bookName}
                          </p>
                          <div className="flex items-center gap-2 font-numeric text-[11.5px] text-[#69726E] dark:text-neutral-400">
                            <span>Dipesan {item.qty}</span>
                            <div className="w-[52px] h-1 bg-[#EBEEEC] dark:bg-neutral-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#B8791F] dark:bg-amber-600 rounded-full transition-all duration-200" 
                                style={{ width: `${progressPercent}%` }} 
                              />
                            </div>
                            <span>Diterima {currentVal}</span>
                          </div>
                        </div>

                        {/* Stepper component */}
                        <div className="flex items-center border border-[#E1E5E2] dark:border-neutral-800 rounded-[10px] overflow-hidden shrink-0">
                          <button 
                            type="button" 
                            onClick={() => handleStep(item.bookId, -1, remainingQty)}
                            className="w-[30px] h-9 bg-[#F2F4F3] dark:bg-neutral-800 text-[#69726E] dark:text-neutral-400 text-lg cursor-pointer flex items-center justify-center hover:bg-[#EBEEEC] dark:hover:bg-neutral-750 transition border-none"
                          >
                            −
                          </button>
                          <input 
                            type="text" 
                            value={progressState.qtyReceivedThisTime}
                            onChange={(e) => handleDirectInput(item.bookId, remainingQty, e.target.value)}
                            className="w-[42px] h-9 border-none border-l border-r border-[#E1E5E2] dark:border-neutral-800 text-center font-numeric text-[14px] font-medium text-[#14181B] dark:text-neutral-100 bg-white dark:bg-neutral-900 focus:outline-none"
                            inputMode="numeric"
                          />
                          <button 
                            type="button" 
                            onClick={() => handleStep(item.bookId, 1, remainingQty)}
                            className="w-[30px] h-9 bg-[#F2F4F3] dark:bg-neutral-800 text-[#69726E] dark:text-neutral-400 text-lg cursor-pointer flex items-center justify-center hover:bg-[#EBEEEC] dark:hover:bg-neutral-750 transition border-none"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Catatan / Notes */}
              <div className="px-[30px] pt-4 pb-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9AA19D] dark:text-neutral-500 mb-2 font-text">Catatan</label>
                <textarea
                  value={receiveNoteGlobal}
                  onChange={(e) => setReceiveNoteGlobal(e.target.value)}
                  placeholder="Koli basah, ada bonus pembatas, dll"
                  rows={2}
                  className="w-full border border-[#E1E5E2] dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-[10px] py-[11px] px-[13px] text-[13.5px] text-[#14181B] dark:text-neutral-200 focus:outline-none focus:border-[#1F6F54] focus:ring-3 focus:ring-[#E7F2ED]/40 focus:ring-opacity-40 transition duration-150"
                />
              </div>

              {/* Audit Timeline */}
              {selectedPo.receiptLogs && selectedPo.receiptLogs.length > 0 && (
                <div className="px-[30px] pt-3 pb-2 space-y-2 select-none">
                  <h4 className="text-[10px] uppercase font-bold tracking-widest text-[#9AA19D] dark:text-neutral-500">Log Audit Pelacakan</h4>
                  <div className="p-3 bg-[#F2F4F3] dark:bg-neutral-950/45 rounded-xl space-y-1.5 max-h-32 overflow-y-auto divide-y divide-neutral-200 dark:divide-neutral-850 border border-[#E1E5E2] dark:border-neutral-800/60 text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {selectedPo.receiptLogs.map((log: string, idx: number) => (
                      <div key={idx} className="pt-1.5 first:pt-0 flex items-start gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1F6F54] self-center mt-1 shrink-0" />
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="px-[30px] pt-5 pb-7 flex flex-col items-center gap-3">
                <button
                  type="submit"
                  disabled={isProcessingReceive}
                  className="w-full border-none rounded-xl bg-[#1F6F54] hover:bg-[#195C46] text-white text-[15px] font-bold py-3.5 px-5 cursor-pointer flex items-center justify-center gap-2 tracking-wide transition duration-150 transform active:scale-[0.99] shadow-md shadow-emerald-950/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-[17px] h-[17px]" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {isProcessingReceive ? 'Memproses...' : 'Terima Barang'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsReceiveOpen(false)}
                  className="bg-none border-none text-[13px] text-[#69726E] dark:text-neutral-450 hover:text-[#14181B] dark:hover:text-white cursor-pointer py-1 transition"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* No Remaining Items Toast Alert Overlay */}
      {showNoRemainingToast && (
        <div className="fixed left-1/2 bottom-10 -translate-x-1/2 bg-[#14181B] text-white text-[13px] font-medium px-5 py-2.5 rounded-xl shadow-xl z-55 flex items-center gap-2 animate-fade-in select-none">
          <svg className="w-[15px] h-[15px] text-[#F0A94E]" viewBox="0 0 20 20" fill="none">
            <path d="M10 6.5v4.5M10 13.8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/>
          </svg>
          Tidak Ada Sisa
        </div>
      )}

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
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[90%] max-w-sm overflow-hidden p-5 space-y-4 my-auto">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <RefreshCw className="h-5 w-5 animate-spin-once" />
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
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-bold cursor-pointer transition shadow-sm"
              >
                Ya, Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Tutup Sisa PO (Partial Closure & Reconciliation) Modal */}
      {isClosePoModalOpen && closingPo && (() => {
        const po = closingPo;
        const currencyLabel = po.purchasePriceIDR ? 'IDR' : po.purchasePriceUSD ? 'USD' : 'NTD';
        const currencySymbol = currencyLabel === 'IDR' ? 'Rp' : currencyLabel === 'USD' ? '$' : 'NT$';
        const platformName = platforms.find(p => p.id === po.supplierId)?.name || po.supplierName || 'Unknown Platform';

        const poItems = po.items && po.items.length > 0 ? po.items : [{
          bookId: po.bookId,
          bookName: po.bookName,
          qty: po.qty,
          qtyReceived: po.qtyReceived || 0,
          pricePlatformTotal: po.purchasePriceIDR || po.purchasePriceUSD || po.purchasePriceNTD / 100,
          priceNTDTotal: po.purchasePriceNTD,
          pricePerItem: po.pricePerUnitNTD,
          isCancelled: po.isCancelled || false
        }];

        const cancelledItems = poItems.filter((it: any) => (it.qty - (it.qtyReceived || 0)) > 0);

        const getIDREquivalent = (ntdCents: number, currentPo: any) => {
          const ntdValue = ntdCents / 100;
          const rate = currentPo.exchangeRate || FALLBACK_NTD_PER_IDR;
          if (rate > 0) {
            return Math.round(ntdValue / rate);
          }
          return Math.round(ntdValue / FALLBACK_NTD_PER_IDR);
        };

        const totalSubtotalNTD = poItems.reduce((acc: number, item: any) => acc + (item.priceNTDTotal || 0), 0) || 1;
        const totalSubtotalPlatform = poItems.reduce((acc: number, item: any) => acc + (item.pricePlatformTotal || 0), 0) || 1;
        const discountPlatform = currencyLabel === 'IDR' ? getIDREquivalent(po.discount || 0, po) : (currencyLabel === 'USD' ? ((po.discount || 0) / 100 / (po.exchangeRate || FALLBACK_NTD_PER_USD)) : ((po.discount || 0) / 100));

        let totalCancelledPlat = 0;
        let totalCancelledNTD = 0;
        cancelledItems.forEach((it: any) => {
          const qtyOrdered = it.qty;
          const qtyReceived = it.qtyReceived || 0;
          const cancelledQty = qtyOrdered - qtyReceived;
          
          const itemDiscountNTD = (po.discount || 0) * ((it.priceNTDTotal || 0) / totalSubtotalNTD);
          const netItemPriceNTDTotal = (it.priceNTDTotal || 0) - itemDiscountNTD; // cents
          const itemValNTD = (netItemPriceNTDTotal / 100 / qtyOrdered) * cancelledQty;

          const itemDiscountPlat = discountPlatform * ((it.pricePlatformTotal || 0) / totalSubtotalPlatform);
          const netItemPricePlat = (it.pricePlatformTotal || 0) - itemDiscountPlat;
          const itemValPlat = (netItemPricePlat / qtyOrdered) * cancelledQty;

          totalCancelledPlat += itemValPlat;
          totalCancelledNTD += itemValNTD;
        });

        // Parse state
        const numRefundAmount = parseFloat(String(refundAmount).replace(/,/g, '')) || 0;
        const numRefundRate = parseFloat(refundRate) || 0;
        const calculatedNTD = numRefundAmount * numRefundRate;
        const selisihNTD = calculatedNTD - totalCancelledNTD;
        const isUntung = selisihNTD >= 0;

        const isIdrCurrency = currencyLabel === 'IDR';
        const cashAcc = getCashAccount(isIdrCurrency ? 'IDR' : 'NTD');

        if (po.paymentStatus === 'paid' && closePoOption === 'refund') {
          // RENDER THE REFUND FORM EXACTLY LIKE THE PICTURE
          return (
            <div 
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setIsClosePoModalOpen(false);
                  setClosingPo(null);
                }
              }}
              className={getModalOverlayClass(sidebarHidden, 'z-50')}
            >
              <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[92%] max-w-2xl flex flex-col overflow-hidden relative font-text text-neutral-800 dark:text-neutral-150 my-auto">
                {/* Modal Header */}
                <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#7A1B30] text-white p-3 rounded-2xl flex items-center justify-center shadow-md">
                      <RotateCcw className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-sm font-black uppercase tracking-wide text-neutral-900 dark:text-white">
                        Refund Sisa PO
                      </h3>
                      <p className="text-xs text-neutral-400 font-semibold mt-0.5">
                        {po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')} · {platformName}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setIsClosePoModalOpen(false);
                      setClosingPo(null);
                    }}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Main Content Area */}
                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto bg-white dark:bg-neutral-900">
                  {/* Option Switcher (Tabs) to allow reverting back to write-off */}
                  <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setClosePoOption('refund')}
                      className="flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all bg-white dark:bg-neutral-900 text-amber-900 dark:text-amber-400 shadow-xs"
                    >
                      Refund Sisa PO
                    </button>
                    <button
                      type="button"
                      onClick={() => setClosePoOption('writeoff')}
                      className="flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                    >
                      Tutup &amp; Catat Rugi (Write-Off)
                    </button>
                  </div>

                  {/* TANGGAL REFUND */}
                  <div>
                    <label className="block text-[10px] uppercase font-extrabold text-neutral-400 dark:text-neutral-500 tracking-wider mb-2">
                      TANGGAL REFUND
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={refundDate.replace(/\//g, '-')}
                        onChange={(e) => setRefundDate(e.target.value.replace(/-/g, '/'))}
                        className="w-full px-4 py-2.5 text-xs font-semibold border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/25 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* BUKU Table */}
                  <div className="space-y-2">
                    <label className="block text-[10px] uppercase font-extrabold text-[#8A857D] dark:text-neutral-400 tracking-wider">
                      DAFTAR BUKU YANG DI-REFUND
                    </label>
                    <div className="border border-[#E7E1D3] dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-[#F7F3EA] dark:bg-neutral-950 text-[#8A857D] dark:text-neutral-400 text-[10px] uppercase font-bold tracking-wider border-b border-[#E7E1D3] dark:border-neutral-800 font-text">
                              <th className="p-3 text-left">Buku</th>
                              <th className="p-3 text-right w-24">Sisa Qty</th>
                              <th className="p-3 text-right w-44">Harga Total Setelah Diskon ({currencyLabel})</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E7E1D3]/50 dark:divide-neutral-800 text-sm">
                            {cancelledItems.map((it: any, index: number) => {
                              const qtyOrdered = it.qty;
                              const qtyReceived = it.qtyReceived || 0;
                              const cancelledQty = qtyOrdered - qtyReceived;
                              
                              const itemDiscountNTD = (po.discount || 0) * ((it.priceNTDTotal || 0) / totalSubtotalNTD);
                              const netItemPriceNTDTotal = (it.priceNTDTotal || 0) - itemDiscountNTD; // cents
                              const itemValNTD = (netItemPriceNTDTotal / 100 / qtyOrdered) * cancelledQty;

                              const itemDiscountPlat = discountPlatform * ((it.pricePlatformTotal || 0) / totalSubtotalPlatform);
                              const netItemPricePlat = (it.pricePlatformTotal || 0) - itemDiscountPlat;
                              const itemValPlat = (netItemPricePlat / qtyOrdered) * cancelledQty;

                              const bookCover = books.find(b => b.id === it.bookId)?.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80';

                              return (
                                <tr key={index} className="hover:bg-[#F7F3EA]/30 dark:hover:bg-neutral-950/10 transition duration-100">
                                  <td className="p-3">
                                    <div className="flex items-center gap-3">
                                      <img 
                                        src={bookCover} 
                                        alt={it.bookName} 
                                        className="w-8 h-12 object-cover rounded border border-[#E7E1D3] dark:border-neutral-800 shadow-xs shrink-0" 
                                        referrerPolicy="no-referrer"
                                      />
                                      <span className="font-text font-semibold text-[#1E1B17] dark:text-neutral-100 break-words line-clamp-2 text-xs">
                                        {it.bookName}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-3 text-right font-numeric">
                                    <span className="font-numeric font-bold text-neutral-800 dark:text-neutral-200">
                                      {cancelledQty} pcs
                                    </span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex flex-col items-end">
                                      <span className="font-numeric font-bold text-neutral-800 dark:text-neutral-100">
                                        {currencySymbol} {currencyLabel === 'IDR' ? Math.round(itemValPlat).toLocaleString('en-US') : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(itemValPlat)}
                                      </span>
                                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-semibold font-numeric">
                                        ≈ NT$ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(itemValNTD)}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Total row */}
                            <tr className="bg-[#FAF8F5]/60 dark:bg-neutral-950/20 font-bold border-t border-[#E7E1D3] dark:border-neutral-800">
                              <td className="p-3 text-xs font-bold text-neutral-900 dark:text-white">
                                Total Harga Setelah Diskon ({currencyLabel})
                              </td>
                              <td className="p-3 text-right font-numeric font-bold text-neutral-900 dark:text-white">
                                {cancelledItems.reduce((acc: number, it: any) => acc + (it.qty - (it.qtyReceived || 0)), 0)} pcs
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex flex-col items-end justify-center font-bold">
                                  <span className="text-xs font-black text-neutral-900 dark:text-white font-numeric">
                                    {currencySymbol} {currencyLabel === 'IDR' ? Math.round(totalCancelledPlat).toLocaleString('en-US') : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalCancelledPlat)}
                                  </span>
                                  <span className="text-[10px] text-[#A6791E] dark:text-amber-450 font-bold font-numeric">
                                    ≈ NT$ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalCancelledNTD)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 leading-normal italic">
                      Nilai ini ditarik langsung dari Inventory in Transit, dikunci pada kurs PO saat dibuat (1 {currencySymbol} ≈ NT$ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(po.exchangeRate || 0)}) — tidak bisa diedit dari form ini.
                    </p>
                  </div>

                  {/* KURS REFUND */}
                  <div>
                    <label className="block text-[10px] uppercase font-extrabold text-neutral-400 dark:text-neutral-500 tracking-wider mb-2 flex items-center gap-1.5">
                      <Lock className="h-3 w-3 text-neutral-400" />
                      KURS REFUND → NTD (TERKUNCI)
                    </label>
                    <input
                      type="text"
                      value={refundRate}
                      disabled={true}
                      readOnly={true}
                      className="w-full px-4 py-2.5 text-xs font-semibold border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-850 text-neutral-400 dark:text-neutral-500 rounded-xl focus:outline-none cursor-not-allowed font-numeric"
                    />
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 leading-normal mt-1.5 italic">
                      Kurs refund dikunci sesuai kurs PO awal (1 {currencySymbol} ≈ NT$ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(po.exchangeRate || 0)}) — tidak dapat diedit.
                    </p>
                  </div>

                  {/* JUMLAH REFUND DITERIMA & SELISIH */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Column: Jumlah refund diterima */}
                    <div>
                      <label className="block text-[10px] uppercase font-extrabold text-neutral-400 dark:text-neutral-500 tracking-wider mb-2">
                        JUMLAH REFUND DITERIMA
                      </label>
                      <div className="flex items-center border border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-950 rounded-xl focus-within:ring-2 focus-within:ring-orange-500/25 overflow-hidden">
                        <span className="px-3 py-2.5 bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 text-neutral-500 text-xs font-bold font-numeric">
                          {currencySymbol}
                        </span>
                        <input
                          type="text"
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(formatInputWithCommas(e.target.value))}
                          className="w-full px-4 py-2 text-right text-xs font-semibold bg-transparent focus:outline-none dark:text-white font-numeric"
                        />
                      </div>
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1.5 font-semibold font-numeric">
                        ≈ NT$ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(calculatedNTD)}
                      </p>
                    </div>

                    {/* Right Column: Selisih Box */}
                    <div>
                      <label className="block text-[10px] uppercase font-extrabold text-neutral-400 dark:text-neutral-500 tracking-wider mb-2">
                        SELISIH (NTD)
                      </label>
                      <div className={`p-4 rounded-2xl border flex items-center justify-between h-[52px] ${
                        isUntung 
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/50' 
                          : 'bg-rose-50/40 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/50'
                      }`}>
                        <div className="flex flex-col">
                          <span className={`text-[9px] font-black tracking-wider uppercase ${isUntung ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                            {isUntung ? 'UNTUNG' : 'RUGI'}
                          </span>
                          <span className={`text-sm font-black font-numeric ${isUntung ? 'text-emerald-900 dark:text-emerald-300' : 'text-rose-900 dark:text-rose-300'}`}>
                            NT$ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(selisihNTD))}
                          </span>
                        </div>
                        <div className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg flex items-center gap-0.5 shadow-xs ${
                          isUntung 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-rose-600 text-white'
                        }`}>
                          <span>{isUntung ? '▲ UNTUNG' : '▼ RUGI'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* NOTE/DESCRIPTION FIELD */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-neutral-400 dark:text-neutral-500 mb-1.5">
                      Catatan Penutupan Sisa PO (Opsional)
                    </label>
                    <textarea
                      value={closePoNote}
                      onChange={(e) => setClosePoNote(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2.5 text-xs font-semibold border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/25 dark:text-white"
                      placeholder="Contoh: Sisa barang dibatalkan karena kosong..."
                    />
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 flex justify-end gap-3 text-xs font-text font-bold">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsClosePoModalOpen(false);
                      setClosingPo(null);
                      setClosePoNote('');
                    }}
                    className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-850 rounded-xl text-neutral-600 dark:text-neutral-300 cursor-pointer transition"
                  >
                    Batal
                  </button>
                  <button 
                    type="button"
                    onClick={handleConfirmClosePo}
                    className="px-6 py-2.5 bg-[#7A1B30] hover:bg-[#601222] text-white rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    Simpan Refund
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // Return the original/alternative layout for writeoff or unpaid credit cancellation
        return (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsClosePoModalOpen(false);
                setClosingPo(null);
              }
            }}
            className={getModalOverlayClass(sidebarHidden, 'z-50')}
          >
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-[92%] max-w-2xl overflow-hidden my-auto">
              <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500 animate-pulse" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-100">
                    Tutup Sisa PO &amp; Rekonsiliasi Sisa
                  </h3>
                </div>
                <button 
                  onClick={() => {
                    setIsClosePoModalOpen(false);
                    setClosingPo(null);
                  }}
                  className="text-neutral-400 hover:text-neutral-200 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto bg-white dark:bg-neutral-900">
                {po.paymentStatus === 'paid' && (
                  <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl mb-1">
                    <button
                      type="button"
                      onClick={() => setClosePoOption('refund')}
                      className="flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                    >
                      Refund Sisa PO
                    </button>
                    <button
                      type="button"
                      onClick={() => setClosePoOption('writeoff')}
                      className="flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all bg-white dark:bg-neutral-900 text-amber-900 dark:text-amber-400 shadow-xs"
                    >
                      Tutup &amp; Catat Rugi (Write-Off)
                    </button>
                  </div>
                )}

                {/* PO Info Card */}
                <div className="grid grid-cols-2 gap-4 bg-neutral-50 dark:bg-neutral-950/40 p-4 rounded-xl border border-neutral-150 dark:border-neutral-800 text-xs font-text font-semibold">
                  <div>
                    <span className="block text-[9px] uppercase text-neutral-400 font-bold">Kode Pembelian PO</span>
                    <span className="font-numeric text-neutral-800 dark:text-white text-sm">{po.purchaseCode}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase text-neutral-400 font-bold">Status Pembayaran</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 uppercase ${
                      po.paymentStatus === 'paid' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40' 
                        : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
                    }`}>
                      {po.paymentStatus === 'paid' ? 'LUNAS (CASH/PAID)' : 'BELUM BAYAR (TEMPO/CREDIT)'}
                    </span>
                  </div>
                </div>

                {/* Items List inside Close PO */}
                <div className="space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Item yang Mengalami Perubahan</h4>
                  <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-neutral-50 dark:bg-neutral-955 text-neutral-400 text-[10px] uppercase font-bold border-b border-neutral-200 dark:border-neutral-800">
                          <th className="p-3">Nama Buku</th>
                          <th className="p-3 text-center">Pesan</th>
                          <th className="p-3 text-center">Terima</th>
                          <th className="p-3 text-center text-rose-500">Sisa Batal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-850">
                        {poItems.map((it: any, index: number) => {
                          const rec = it.qtyReceived || 0;
                          const cancelled = it.qty - rec;
                          return (
                            <tr key={index} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-950/10 font-semibold text-neutral-700 dark:text-neutral-300">
                              <td className="p-3 break-words max-w-xs">{it.bookName}</td>
                              <td className="p-3 text-center font-numeric">{it.qty}</td>
                              <td className="p-3 text-center font-numeric text-emerald-600 dark:text-emerald-400">{rec}</td>
                              <td className="p-3 text-center font-numeric text-rose-500">{cancelled}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Accounting Options */}
                <div className="space-y-3 p-4 bg-amber-50/30 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/40 rounded-xl text-xs leading-relaxed">
                  <h4 className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400 tracking-wider">Metode Rekonsiliasi Akuntansi</h4>
                  
                  {po.paymentStatus === 'unpaid' ? (
                    <div className="text-amber-800 dark:text-amber-350 font-medium">
                      <p className="font-bold text-amber-900 dark:text-amber-300 mb-1">
                        Otomatis Mengurangi Utang Usaha (Batal Utang)
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        Sisa barang yang dibatalkan belum dibayar, sehingga otomatis memotong kewajiban/utang kepada supplier. 
                        Jurnal penyesuaian otomatis akan didebet ke akun <strong>Utang Usaha (2100)</strong> dan dikredit ke akun <strong>Persediaan Dalam Perjalanan (1202)</strong> sebesar sisa barang yang dibatalkan.
                      </p>
                    </div>
                  ) : (
                    <div className="text-amber-800 dark:text-amber-350 font-medium">
                      <p className="font-bold text-amber-900 dark:text-amber-300 mb-1">
                        Tutup &amp; Catat Kerugian (Write-Off)
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        Uang atas barang yang tidak terkirim hangus atau sisa pembulatan direlakan. 
                        Jurnal penyesuaian otomatis akan didebet ke akun <strong>Beban Kerugian Pembelian (5500)</strong> dan dikredit ke akun <strong>Persediaan Dalam Perjalanan (1202)</strong> sebesar sisa barang yang dibatalkan.
                      </p>
                    </div>
                  )}
                </div>

                {/* Note input field */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1.5">
                    Catatan Penutupan Sisa PO (Opsional)
                  </label>
                  <textarea
                    value={closePoNote}
                    onChange={(e) => setClosePoNote(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 text-xs font-semibold border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/25 dark:text-white"
                    placeholder="Contoh: Sisa barang 2 unit dibatalkan karena kosong..."
                  />
                </div>
              </div>

              <div className="p-5 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 flex justify-end gap-3 text-xs font-text font-bold">
                <button 
                  type="button"
                  onClick={() => {
                    setIsClosePoModalOpen(false);
                    setClosingPo(null);
                    setClosePoNote('');
                  }}
                  className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-neutral-600 dark:text-neutral-300 cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="button"
                  onClick={handleConfirmClosePo}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Proses Tutup Sisa PO
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Large Full-Screen Barcode & QR Scanner Modal View for Bulk Receiving — Redesign */}
      {isBulkReceiveScanOpen && (
        <div 
          onClick={async (e) => {
            if (e.target === e.currentTarget) {
              await handleStopBulkReceiveScan();
              setIsBulkReceiveScanOpen(false);
            }
          }}
          className={getModalOverlayClass(sidebarHidden, 'z-50 !bg-[#14121a]/50 backdrop-blur-[2px] p-3 sm:p-6 flex items-center justify-center')}
        >
          <div className="bg-white dark:bg-[#1B1922] border border-[#E8E2D3] dark:border-[#37343F] rounded-[22px] shadow-[0_40px_80px_-30px_rgba(33,31,41,0.4)] w-full max-w-[1180px] max-h-[92vh] flex flex-col overflow-hidden relative my-auto font-['Lexend'] text-[#211F29] dark:text-[#F4F2ED]">
            
            {/* Modal Redesigned Header */}
            <div className="px-6 py-5 border-b border-[#E8E2D3] dark:border-[#37343F] flex items-center justify-between shrink-0 gap-4 bg-white dark:bg-[#1B1922]">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-[12px] bg-[#B8763A]/13 text-[#B8763A] dark:text-[#D89963] flex items-center justify-center shrink-0">
                  <Scan className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-[0.1px] text-[#211F29] dark:text-[#F4F2ED] font-['Lexend'] m-0">
                    Penerimaan Barang Massal
                  </h3>
                  <p className="text-[13px] text-[#6E6B78] dark:text-[#AEA9B7] font-['Lexend'] m-0 mt-0.5 leading-snug">
                    {scanStep === 1 
                      ? "Pilih Nomor Freight-In untuk mengalokasikan biaya pengiriman, lalu mulai pindai barang."
                      : "Arahkan kamera ke barcode pengadaan supplier — pesanan terdaftar otomatis terdeteksi."
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-end gap-1.5 font-['Lexend']">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6E6B78] dark:text-[#AEA9B7]">
                    Langkah <span className="font-['Inter'] font-bold text-[#211F29] dark:text-[#F4F2ED]">{scanStep}</span>/2
                  </span>
                  <div className="flex gap-1 w-[120px]">
                    <div className={`flex-1 h-[6px] rounded-[3px] transition-all duration-300 ${scanStep >= 1 ? 'bg-[#B8763A]' : 'bg-[#E8E2D3] dark:bg-[#37343F]'}`} />
                    <div className={`flex-1 h-[6px] rounded-[3px] transition-all duration-300 ${scanStep >= 2 ? 'bg-[#B8763A]' : 'bg-[#E8E2D3] dark:bg-[#37343F]'}`} />
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={async () => {
                    await handleStopBulkReceiveScan();
                    setIsBulkReceiveScanOpen(false);
                  }} 
                  className="w-9 h-9 rounded-[10px] border border-[#E8E2D3] dark:border-[#37343F] bg-white dark:bg-[#1B1922] text-[#6E6B78] dark:text-[#AEA9B7] hover:bg-[#6E2A3A]/10 hover:text-[#6E2A3A] hover:border-[#6E2A3A]/30 flex items-center justify-center transition cursor-pointer"
                  title="Tutup"
                >
                  <X className="w-4 h-4 stroke-[2.2]" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              
              {/* Toast Notifications */}
              {scanSuccessToast && (
                <div className="p-3.5 bg-[#2F7D5A]/10 border border-[#2F7D5A]/30 rounded-[12px] text-[#2F7D5A] dark:text-[#75C49D] text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <Check className="h-4 w-4 shrink-0 text-[#2F7D5A]" />
                  <span>{scanSuccessToast}</span>
                </div>
              )}

              {scanErrorToast && (
                <div className="p-3.5 bg-[#6E2A3A]/10 border border-[#6E2A3A]/30 rounded-[12px] text-[#6E2A3A] dark:text-[#B86574] text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#6E2A3A]" />
                  <span>{scanErrorToast}</span>
                </div>
              )}

              {scanStep === 1 ? (
                /* STEP 1: Freight-In Selection */
                <div className="space-y-6">
                  {/* Hint Banner */}
                  <div className="flex gap-3.5 items-start bg-[#B8763A]/8 border border-[#B8763A]/22 rounded-[14px] p-4">
                    <div className="w-[34px] h-[34px] rounded-[9px] bg-[#B8763A] text-white flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-semibold text-[#211F29] dark:text-[#F4F2ED] font-['Lexend'] m-0">
                        Pilih Nomor Freight-In
                      </h3>
                      <p className="text-[13px] text-[#6E6B78] dark:text-[#AEA9B7] font-['Lexend'] m-0 mt-0.5 leading-relaxed">
                        Pilih dari daftar transaksi pending, atau masukkan kode secara manual. Biaya akan dialokasikan proporsional ke tiap PO saat dijurnalkan.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column (Inputs & Freight Cards) */}
                    <div className="lg:col-span-7 space-y-4">
                      <div>
                        <label className="block text-[11.5px] font-semibold tracking-[0.05em] uppercase text-[#6E6B78] dark:text-[#AEA9B7] mb-2">
                          Dari daftar pending
                        </label>
                        <div className="relative">
                          <select
                            value={tempKodeEkspedisi}
                            onChange={(e) => setTempKodeEkspedisi(e.target.value.toUpperCase())}
                            className="w-full h-[48px] pl-4 pr-10 border border-[#D9D0BC] dark:border-[#48454F] rounded-[8px] bg-white dark:bg-[#1B1922] text-[#211F29] dark:text-[#F4F2ED] font-['Inter'] text-[14px] focus:outline-none focus:border-[#B8763A] appearance-none cursor-pointer"
                          >
                            <option value="">— Pilih Nomor Freight-In (Pending) —</option>
                            {getPendingFreightInRecords().map((f) => (
                              <option key={f.id} value={f.freightCode}>
                                {f.freightCode} — Total: {f.totalKg} Kg | Rate: {formatIDR(f.ratePerKg)}/Kg ({f.date || '-'})
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A19DAA] pointer-events-none" />
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 my-4 text-[#A19DAA] text-[11.5px] font-semibold uppercase tracking-[0.08em] before:flex-1 before:h-px before:bg-[#E8E2D3] dark:before:bg-[#37343F] after:flex-1 after:h-px after:bg-[#E8E2D3] dark:after:bg-[#37343F]">
                        atau
                      </div>

                      <div>
                        <label className="block text-[11.5px] font-semibold tracking-[0.05em] uppercase text-[#6E6B78] dark:text-[#AEA9B7] mb-2">
                          Masukkan kode manual
                        </label>
                        <input
                          type="text"
                          placeholder="EX: FREIGHT-202607-01"
                          value={tempKodeEkspedisi}
                          onChange={(e) => setTempKodeEkspedisi(e.target.value.toUpperCase())}
                          className="w-full h-[48px] px-4 border border-[#D9D0BC] dark:border-[#48454F] rounded-[8px] bg-white dark:bg-[#1B1922] text-[#211F29] dark:text-[#F4F2ED] font-['Inter'] font-semibold text-[14px] focus:outline-none focus:border-[#B8763A] placeholder-[#A19DAA] uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[11.5px] font-semibold tracking-[0.05em] uppercase text-[#6E6B78] dark:text-[#AEA9B7] mb-2">
                          Rekomendasi freight-in pending
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                          {getPendingFreightInRecords().map((f) => {
                            const isSelected = tempKodeEkspedisi.trim().toUpperCase() === (f.freightCode || '').toUpperCase();
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => setTempKodeEkspedisi((f.freightCode || '').toUpperCase())}
                                className={`text-left border rounded-[14px] p-3.5 relative transition cursor-pointer ${
                                  isSelected
                                    ? 'border-[#34568B] bg-[#34568B]/6 shadow-[0_0_0_3px_rgba(52,86,139,0.1)]'
                                    : 'border-[#E8E2D3] dark:border-[#37343F] bg-white dark:bg-[#1B1922] hover:border-[#D9D0BC]'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-['Inter'] font-bold text-[14px] text-[#C1622A] uppercase">
                                    {f.freightCode}
                                  </span>
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-[#34568B]' : 'border-[#D9D0BC]'}`}>
                                    {isSelected && <div className="w-2 h-2 rounded-full bg-[#34568B]" />}
                                  </div>
                                </div>
                                <div className="flex gap-4 text-[12px] text-[#6E6B78] dark:text-[#AEA9B7]">
                                  <div>
                                    Total Kg: <b className="block font-['Inter'] font-bold text-[14px] text-[#211F29] dark:text-[#F4F2ED]">{f.totalKg} Kg</b>
                                  </div>
                                  <div>
                                    Rate: <b className="block font-['Inter'] font-bold text-[14px] text-[#211F29] dark:text-[#F4F2ED]">{formatIDR(f.ratePerKg)}</b>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Alloc preview */}
                        {(() => {
                          const matched = freightInList.find(f => f.freightCode?.toUpperCase() === tempKodeEkspedisi.trim().toUpperCase());
                          if (matched) {
                            const total = (matched.totalKg || 0) * (matched.ratePerKg || 0);
                            return (
                              <div className="mt-3.5 p-3.5 rounded-[8px] bg-[#F5F1E7] dark:bg-[#242230] border border-dashed border-[#D9D0BC] dark:border-[#48454F] text-[12.5px] text-[#6E6B78] dark:text-[#AEA9B7] leading-relaxed">
                                Estimasi biaya freight <b className="font-['Inter'] font-bold text-[#211F29] dark:text-[#F4F2ED]">{formatIDR(total)}</b> ({matched.totalKg} kg &times; {formatIDR(matched.ratePerKg)}/kg) akan dialokasikan proporsional ke setiap PO yang dipindai pada antrean ini saat dijurnalkan.
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

                    {/* Right Column (Side Panel Preview List) */}
                    <div className="lg:col-span-5 h-full">
                      <div className="border border-[#E8E2D3] dark:border-[#37343F] rounded-[14px] bg-[#F5F1E7] dark:bg-[#242230] p-5 h-full flex flex-col justify-between min-h-[360px]">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[13px] font-semibold text-[#211F29] dark:text-[#F4F2ED] m-0 flex items-center gap-2">
                              Preview List
                            </h4>
                            {scannedPos.length > 0 && (
                              <button 
                                type="button"
                                onClick={() => {
                                  setScannedPos([]);
                                  setExpandedScannedPoId(null);
                                }}
                                className="text-[12px] font-medium text-[#6E6B78] hover:text-[#6E2A3A] cursor-pointer"
                              >
                                Clear All
                              </button>
                            )}
                          </div>

                          {scannedPos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-10 text-[#A19DAA]">
                              <div className="w-[52px] h-[52px] rounded-full border border-dashed border-[#D9D0BC] dark:border-[#48454F] flex items-center justify-center mb-3.5 text-[#A19DAA]">
                                <Search className="w-5 h-5" />
                              </div>
                              <h5 className="text-[13.5px] font-semibold text-[#6E6B78] dark:text-[#AEA9B7] m-0 mb-1.5">
                                Antrean masih kosong
                              </h5>
                              <p className="text-[12.5px] text-[#A19DAA] dark:text-[#7B7787] m-0 leading-relaxed max-w-[220px]">
                                Gunakan scanner atau isikan kode pembelian manual di langkah berikutnya untuk menampilkan rincian buku pengadaan supplier.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                              {scannedPos.map((entry, idx) => (
                                <div key={entry.id} className="p-3 bg-white dark:bg-[#1B1922] border border-[#E8E2D3] dark:border-[#37343F] rounded-[10px] flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[#EFEADC] dark:bg-[#2C2A38] text-[#6E6B78] font-['Inter'] font-bold text-[11px] flex items-center justify-center">
                                      {idx + 1}
                                    </span>
                                    <span className="font-['Inter'] font-bold text-[13px] text-[#211F29] dark:text-[#F4F2ED]">
                                      #{entry.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-[#C1622A]">
                                      {entry.po?.supplierName || entry.supplierName || 'PO'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setScannedPos(prev => prev.filter(item => item.id !== entry.id));
                                        if (expandedScannedPoId === entry.id) {
                                          setExpandedScannedPoId(null);
                                        }
                                      }}
                                      className="p-1 text-[#A19DAA] hover:text-[#6E2A3A] rounded-[5px] transition cursor-pointer"
                                      title="Hapus"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 1 Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-[#E8E2D3] dark:border-[#37343F]">
                    <button
                      type="button"
                      onClick={() => {
                        setKodeEkspedisi("");
                        setScanStep(2);
                        scanStepRef.current = 2;
                        setScanSuccessToast("Langkah 1 dilewati (Tanpa Kode Freight-In).");
                        setTimeout(() => setScanSuccessToast(null), 3000);
                      }}
                      className="h-[46px] px-5 rounded-[11px] text-[13.5px] font-semibold text-[#6E6B78] dark:text-[#AEA9B7] border border-[#D9D0BC] dark:border-[#48454F] hover:bg-[#F5F1E7] dark:hover:bg-[#242230] transition cursor-pointer"
                    >
                      Tanpa Freight-In (Skip)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cleanCode = tempKodeEkspedisi.trim().toUpperCase();
                        if (cleanCode) {
                          if (getFreightStatus(cleanCode) === 'Completed') {
                            alert(`Nomor Freight-In "${cleanCode}" sudah dijurnalkan (dikapitalisasi) dan tidak boleh digunakan lagi.`);
                            return;
                          }
                          setKodeEkspedisi(cleanCode);
                          setScanSuccessToast(`Nomor Freight-In "${cleanCode}" dipilih.`);
                        } else {
                          setKodeEkspedisi("");
                          setScanSuccessToast("Langkah 1 dilewati (Tanpa Kode Freight-In).");
                        }
                        setScanStep(2);
                        scanStepRef.current = 2;
                        setTimeout(() => setScanSuccessToast(null), 3500);
                      }}
                      className="h-[46px] px-6 rounded-[11px] text-[13.5px] font-semibold bg-[#B8763A] hover:bg-[#B8763A]/90 text-white transition cursor-pointer shadow-sm flex items-center gap-2"
                    >
                      {tempKodeEkspedisi ? `Gunakan "${tempKodeEkspedisi}" & Lanjut` : 'Lanjut ke Scan Barang'}
                      <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 2: Barcode Camera Scan & Scanned Queue Ledger */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Camera Feed & Manual Inputs */}
                  <div className="lg:col-span-6 space-y-4">
                    {/* Active Freight Chip Header */}
                    <div className="flex items-center justify-between gap-2.5 bg-[#F5F1E7] dark:bg-[#242230] border border-[#E8E2D3] dark:border-[#37343F] rounded-[8px] p-3">
                      <div className="flex items-center gap-2 text-[13px] text-[#6E6B78] dark:text-[#AEA9B7]">
                        <Truck className="w-4 h-4 text-[#B8763A]" />
                        <span>Freight-In:</span>
                        <span className="font-['Inter'] font-bold text-[12.5px] text-white bg-[#C1622A] px-2.5 py-0.5 rounded-[6px]">
                          {kodeEkspedisi || "Tanpa Freight-In"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setScanStep(1);
                          scanStepRef.current = 1;
                        }}
                        className="text-[#34568B] dark:text-[#7E9EDB] font-semibold text-[12.5px] hover:underline cursor-pointer"
                      >
                        Ubah Freight-In
                      </button>
                    </div>

                    {/* Camera Viewport Frame */}
                    <div className="relative rounded-[18px] overflow-hidden bg-gradient-to-br from-[#2b2a35] to-[#1a1922] min-h-[250px] flex items-center justify-center shadow-inner">
                      <div className="absolute top-3.5 left-3.5 z-20 flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-[11.5px] text-white font-medium">
                        <span className="w-2 h-2 rounded-full bg-[#5FD08A] animate-pulse" />
                        Live Ready
                      </div>

                      {/* Camera Flip Toggle Button */}
                      <div className="absolute top-3.5 right-3.5 z-20">
                        <button
                          type="button"
                          onClick={toggleBulkCameraFacingMode}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-black/65 hover:bg-black/85 backdrop-blur-md text-white rounded-full text-[11.5px] font-medium border border-white/20 transition cursor-pointer shadow-md"
                          title="Balik Kamera Depan / Belakang"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-amber-300" />
                          <span>Kamera {bulkCameraFacingMode === 'environment' ? 'Belakang' : 'Depan'}</span>
                        </button>
                      </div>

                      {/* Guide Corner Brackets */}
                      <div className="absolute top-5 left-5 w-[34px] h-[34px] border-t-2 border-l-2 border-white/50 rounded-tl-[6px] pointer-events-none z-20" />
                      <div className="absolute top-5 right-5 w-[34px] h-[34px] border-t-2 border-r-2 border-white/50 rounded-tr-[6px] pointer-events-none z-20" />
                      <div className="absolute bottom-5 left-5 w-[34px] h-[34px] border-b-2 border-l-2 border-white/50 rounded-bl-[6px] pointer-events-none z-20" />
                      <div className="absolute bottom-5 right-5 w-[34px] h-[34px] border-b-2 border-r-2 border-white/50 rounded-br-[6px] pointer-events-none z-20" />
                      
                      {/* Animated Scanning Line */}
                      <div className="absolute inset-x-6 h-0.5 bg-gradient-to-r from-transparent via-[#B8763A] to-transparent shadow-[0_0_12px_rgba(184,118,58,0.7)] z-20 animate-bounce top-1/3 pointer-events-none" />

                      <div id="bulk-qr-reader" className={`w-full h-full min-h-[240px] ${bulkCameraFacingMode === 'user' ? 'video-mirror-user' : 'video-mirror-environment'}`} />
                    </div>

                    {/* Manual Input Fallback */}
                    <div className="bg-[#F5F1E7] dark:bg-[#242230] border border-[#E8E2D3] dark:border-[#37343F] rounded-[8px] p-3.5 space-y-2">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6E6B78] dark:text-[#AEA9B7]">
                        Nomor pembelian / barcode tidak terdeteksi?
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Masukkan kode pengadaan… (contoh: 26062001)"
                          value={bulkScanSearchQuery}
                          onChange={(e) => setBulkScanSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleProcessScannedCode(bulkScanSearchQuery);
                              setBulkScanSearchQuery('');
                            }
                          }}
                          className="flex-1 h-[42px] px-3.5 border border-[#D9D0BC] dark:border-[#48454F] rounded-[8px] bg-white dark:bg-[#1B1922] text-[#211F29] dark:text-[#F4F2ED] font-['Inter'] font-semibold text-[13px] focus:outline-none focus:border-[#B8763A]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            handleProcessScannedCode(bulkScanSearchQuery);
                            setBulkScanSearchQuery('');
                          }}
                          className="h-[42px] px-4 bg-[#B8763A] hover:bg-[#B8763A]/90 text-white rounded-[8px] text-[13px] font-semibold cursor-pointer transition shrink-0"
                        >
                          Cari
                        </button>
                      </div>
                    </div>

                    {/* Simulate Scan Button (Demo) */}
                    <button
                      type="button"
                      onClick={() => {
                        const activePos = purchaseOrders.filter(po => po.status !== 'cancelled' && po.status !== 'completed');
                        const targetPo = activePos.length > 0 ? activePos[Math.floor(Math.random() * activePos.length)] : purchaseOrders[0];
                        if (targetPo) {
                          handleProcessScannedCode(targetPo.purchaseCode || targetPo.id);
                        } else {
                          setScanErrorToast("Tidak ada PO aktif untuk disimulasikan.");
                        }
                      }}
                      className="w-full h-[42px] justify-center bg-white dark:bg-[#1B1922] border border-dashed border-[#D9D0BC] dark:border-[#48454F] text-[#6E6B78] dark:text-[#AEA9B7] rounded-[10px] text-[13px] font-semibold hover:border-[#B8763A] hover:text-[#B8763A] hover:bg-[#B8763A]/5 transition cursor-pointer flex items-center gap-2"
                    >
                      <Scan className="w-4 h-4" />
                      Simulasikan Scan Barang (Demo)
                    </button>
                  </div>

                  {/* Right Column: Scanned Queue Ledger */}
                  <div className="lg:col-span-6 h-full">
                    <div className="border border-[#E8E2D3] dark:border-[#37343F] rounded-[14px] bg-[#F5F1E7] dark:bg-[#242230] p-4 flex flex-col h-full min-h-[460px]">
                      <div className="flex items-center justify-between mb-3.5">
                        <h4 className="text-[13px] font-semibold text-[#211F29] dark:text-[#F4F2ED] m-0 flex items-center gap-2">
                          Preview List
                          <span className="bg-[#C1622A] text-white font-['Inter'] font-bold text-[11px] min-w-[20px] h-[20px] rounded-full px-1.5 inline-flex items-center justify-center">
                            {scannedPos.length}
                          </span>
                        </h4>
                        {scannedPos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setScannedPos([]);
                              setExpandedScannedPoId(null);
                            }}
                            className="text-[12px] font-medium text-[#6E6B78] hover:text-[#6E2A3A] cursor-pointer"
                          >
                            Clear All
                          </button>
                        )}
                      </div>

                      {/* List or Empty State */}
                      {scannedPos.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#A19DAA]">
                          <div className="w-[52px] h-[52px] rounded-full border border-dashed border-[#D9D0BC] dark:border-[#48454F] flex items-center justify-center mb-3.5 text-[#A19DAA]">
                            <Search className="w-5 h-5" />
                          </div>
                          <h5 className="text-[13.5px] font-semibold text-[#6E6B78] dark:text-[#AEA9B7] m-0 mb-1">
                            Antrean masih kosong
                          </h5>
                          <p className="text-[12.5px] text-[#A19DAA] dark:text-[#7B7787] m-0 leading-relaxed max-w-[220px]">
                            Pindai barcode atau gunakan input manual untuk mulai menerima barang.
                          </p>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[480px]">
                          {scannedPos.map((entry, qIdx) => {
                            const isExpanded = expandedScannedPoId === entry.id;
                            const hasItems = entry.po.items && entry.po.items.length > 0;
                            const localItemsList = hasItems ? entry.po.items : [{
                              bookId: entry.po.bookId,
                              bookName: entry.po.bookName,
                              qty: entry.po.qty,
                              qtyReceived: entry.po.qtyReceived || 0,
                              pricePlatformTotal: entry.po.purchasePriceIDR || entry.po.purchasePriceNTD / 100,
                              priceNTDTotal: entry.po.purchasePriceNTD,
                              pricePerItem: entry.po.pricePerUnitNTD
                            }];

                            const hasAnyQtyExceeded = localItemsList.some((item: any) => {
                              const progressState = entry.receiveItemsState[item.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
                              if (progressState.isCancelled) return false;
                              const qtyThisTime = Number(progressState.qtyReceivedThisTime || '0') || 0;
                              return qtyThisTime > item.qty;
                            });

                            return (
                              <div
                                key={entry.id}
                                className={`border rounded-[14px] overflow-hidden transition-all duration-200 ${
                                  entry.isSaved
                                    ? 'border-[#2F7D5A]/40 bg-[#2F7D5A]/5'
                                    : 'border-[#E8E2D3] dark:border-[#37343F] bg-white dark:bg-[#1B1922]'
                                }`}
                              >
                                {/* Card Head */}
                                <div
                                  onClick={() => setExpandedScannedPoId(isExpanded ? null : entry.id)}
                                  className="p-3.5 flex items-center justify-between gap-2.5 cursor-pointer select-none hover:bg-[#F5F1E7]/50 dark:hover:bg-[#242230]/50 transition"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-[22px] h-[22px] rounded-full bg-[#EFEADC] dark:bg-[#2C2A38] text-[#6E6B78] dark:text-[#AEA9B7] font-['Inter'] font-bold text-[11.5px] flex items-center justify-center shrink-0">
                                      {qIdx + 1}
                                    </span>
                                    <div className="min-w-0">
                                      <span className="font-['Inter'] font-bold text-[13px] text-[#211F29] dark:text-[#F4F2ED] block truncate">
                                        #{entry.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}
                                      </span>
                                      <span className="text-[11.5px] font-medium text-[#C1622A] block truncate">
                                        {platforms.find(p => p.id === (entry.po?.supplierId || entry.supplierId))?.name || entry.supplierName || 'Supplier'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {entry.isSaved ? (
                                      <span className="bg-[#2F7D5A]/15 text-[#2F7D5A] dark:text-[#75C49D] text-[10.5px] font-bold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full flex items-center gap-1">
                                        <Check className="w-3 h-3 stroke-[2.5]" /> Tersimpan
                                      </span>
                                    ) : (
                                      <span className="bg-[#B8763A]/14 text-[#B8763A] dark:text-[#D89963] text-[10.5px] font-bold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full">
                                        Draft Scan
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setScannedPos(prev => prev.filter(item => item.id !== entry.id));
                                        if (expandedScannedPoId === entry.id) {
                                          setExpandedScannedPoId(null);
                                        }
                                      }}
                                      className="p-1.5 text-[#A19DAA] hover:text-[#6E2A3A] rounded-[7px] hover:bg-[#F5F1E7] dark:hover:bg-[#242230] transition cursor-pointer"
                                      title="Hapus"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      className="p-1.5 text-[#6E6B78] dark:text-[#AEA9B7] rounded-[7px] hover:bg-[#F5F1E7] dark:hover:bg-[#242230] transition cursor-pointer"
                                      title={isExpanded ? "Perkecil" : "Perbesar"}
                                    >
                                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>
                                </div>

                                {/* Card Body (Expanded) */}
                                {isExpanded && (
                                  <div className="px-3.5 pb-3.5 pt-2 border-t border-[#E8E2D3] dark:border-[#37343F] space-y-3">
                                    {localItemsList.map((item: any) => {
                                      const progressState = entry.receiveItemsState[item.bookId] || { qtyReceivedThisTime: '0', isCancelled: false };
                                      const isCancelled = progressState.isCancelled;
                                      const bookDetails = books.find(b => b.id === item.bookId || b.title === item.bookName || b.bookName === item.bookName);
                                      const bookCover = bookDetails?.cover;
                                      const itemBarcode = item.barcode || item.isbn || item.sku || item.productId || bookDetails?.barcode || bookDetails?.isbn || bookDetails?.sku || bookDetails?.productId || (item.bookId !== item.bookName ? item.bookId : null);
                                      const qtyVal = Number(progressState.qtyReceivedThisTime || '0') || 0;

                                      return (
                                        <div
                                          key={item.bookId}
                                          className={`p-3 rounded-[10px] border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative overflow-hidden ${
                                            isCancelled
                                              ? 'bg-[#EFEADC]/50 dark:bg-[#2C2A38]/50 border-neutral-300 dark:border-neutral-700 opacity-75'
                                              : 'bg-[#F5F1E7]/40 dark:bg-[#242230]/40 border-[#E8E2D3] dark:border-[#37343F]'
                                          }`}
                                        >
                                          {isCancelled && (
                                            <div className="absolute inset-0 bg-[#F5F1E7]/80 dark:bg-[#1B1922]/80 flex items-center justify-center z-20">
                                              <span className="text-[#6E2A3A] font-bold text-[11px] bg-white dark:bg-[#242230] px-3 py-1 rounded-full border border-[#6E2A3A]/30 shadow-sm uppercase tracking-wider">
                                                Buku Dibatalkan
                                              </span>
                                            </div>
                                          )}

                                          <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {bookCover ? (
                                              <img
                                                src={bookCover}
                                                alt={item.bookName}
                                                referrerPolicy="no-referrer"
                                                className="w-[42px] h-[56px] object-cover rounded-[6px] shrink-0 border border-[#E8E2D3] dark:border-[#37343F]"
                                              />
                                            ) : (
                                              <div
                                                className="w-[42px] h-[56px] rounded-[6px] shrink-0 flex items-center justify-center text-white font-semibold text-[16px] shadow-inner"
                                                style={{ backgroundColor: '#B8763A' }}
                                              >
                                                {item.bookName?.charAt(0) || 'B'}
                                              </div>
                                            )}

                                            <div className="min-w-0 flex-1">
                                              <p className="font-['Lexend'] font-medium text-[13px] text-[#211F29] dark:text-[#F4F2ED] m-0 mb-1 leading-snug line-clamp-2" title={item.bookName}>
                                                {item.bookName}
                                              </p>
                                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6E6B78] dark:text-[#AEA9B7]">
                                                {itemBarcode && (
                                                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold bg-[#EFEADC] dark:bg-[#2C2A38] text-[#B8763A] dark:text-[#D89963] px-2 py-0.5 rounded-[5px] border border-[#D9D0BC] dark:border-[#48454F]" title="Barcode / ISBN Barang">
                                                    <Barcode className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{itemBarcode}</span>
                                                  </span>
                                                )}
                                                <span>Pesan <b className="font-['Inter'] font-bold text-[#211F29] dark:text-[#F4F2ED]">{item.qty} pcs</b></span>
                                                
                                                {/* Qty status note tag */}
                                                {qtyVal <= 0 ? (
                                                  <span className="bg-[#EFEADC] dark:bg-[#2C2A38] text-[#A19DAA] font-bold text-[10.5px] px-2 py-0.5 rounded-[6px]">
                                                    Belum diterima
                                                  </span>
                                                ) : qtyVal >= item.qty ? (
                                                  <span className="bg-[#2F7D5A]/13 text-[#2F7D5A] dark:text-[#75C49D] font-bold text-[10.5px] px-2 py-0.5 rounded-[6px]">
                                                    ✓ Lengkap
                                                  </span>
                                                ) : (
                                                  <span className="bg-[#B8763A]/14 text-[#B8763A] dark:text-[#D89963] font-bold text-[10.5px] px-2 py-0.5 rounded-[6px]">
                                                    ◐ Sebagian — kurang {item.qty - qtyVal}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Qty Stepper Controls */}
                                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto z-10">
                                            <div className="flex items-center border border-[#D9D0BC] dark:border-[#48454F] rounded-[9px] overflow-hidden bg-white dark:bg-[#1B1922]">
                                              <button
                                                type="button"
                                                disabled={isCancelled || entry.isSaved}
                                                onClick={() => {
                                                  const cur = Number(progressState.qtyReceivedThisTime || '0') || 0;
                                                  const nxt = Math.max(0, cur - 1);
                                                  setScannedPos(prev => prev.map(old => {
                                                    if (old.id === entry.id) {
                                                      const dState = {
                                                        ...old.receiveItemsState,
                                                        [item.bookId]: { ...progressState, qtyReceivedThisTime: String(nxt) }
                                                      };
                                                      return { ...old, receiveItemsState: dState };
                                                    }
                                                    return old;
                                                  }));
                                                }}
                                                className="w-7 h-8 bg-[#F5F1E7] dark:bg-[#242230] text-[#6E6B78] dark:text-[#AEA9B7] font-bold hover:bg-[#EFEADC] transition cursor-pointer disabled:opacity-40"
                                              >
                                                –
                                              </button>
                                              <input
                                                type="text"
                                                disabled={isCancelled || entry.isSaved}
                                                value={progressState.qtyReceivedThisTime}
                                                onChange={(e) => {
                                                  const typedVal = e.target.value.replace(/\D/g, '');
                                                  setScannedPos(prev => prev.map(old => {
                                                    if (old.id === entry.id) {
                                                      const dState = {
                                                        ...old.receiveItemsState,
                                                        [item.bookId]: { ...progressState, qtyReceivedThisTime: typedVal }
                                                      };
                                                      return { ...old, receiveItemsState: dState };
                                                    }
                                                    return old;
                                                  }));
                                                }}
                                                className="w-10 h-8 text-center font-['Inter'] font-bold text-[13px] text-[#211F29] dark:text-[#F4F2ED] bg-white dark:bg-[#1B1922] focus:outline-none disabled:opacity-40"
                                              />
                                              <button
                                                type="button"
                                                disabled={isCancelled || entry.isSaved}
                                                onClick={() => {
                                                  const cur = Number(progressState.qtyReceivedThisTime || '0') || 0;
                                                  const nxt = Math.min(item.qty, cur + 1);
                                                  setScannedPos(prev => prev.map(old => {
                                                    if (old.id === entry.id) {
                                                      const dState = {
                                                        ...old.receiveItemsState,
                                                        [item.bookId]: { ...progressState, qtyReceivedThisTime: String(nxt) }
                                                      };
                                                      return { ...old, receiveItemsState: dState };
                                                    }
                                                    return old;
                                                  }));
                                                }}
                                                className="w-7 h-8 bg-[#F5F1E7] dark:bg-[#242230] text-[#6E6B78] dark:text-[#AEA9B7] font-bold hover:bg-[#EFEADC] transition cursor-pointer disabled:opacity-40"
                                              >
                                                +
                                              </button>
                                            </div>

                                          </div>
                                        </div>
                                      );
                                    })}

                                    {/* Card Footer Save Action */}
                                    <div className="pt-2.5 flex items-center justify-between border-t border-[#E8E2D3] dark:border-[#37343F]">
                                      <span className="text-[11.5px] text-[#6E6B78] dark:text-[#AEA9B7]">
                                        Status: <b className="text-[#211F29] dark:text-[#F4F2ED] uppercase">{entry.isSaved ? 'TERSIMPAN' : 'PENDING'}</b>
                                      </span>
                                      <button
                                        type="button"
                                        disabled={entry.isSaved || hasAnyQtyExceeded}
                                        onClick={() => handleSaveBulkScannedPO(entry.id)}
                                        className={`h-[32px] px-3.5 rounded-[8px] text-[12px] font-semibold transition cursor-pointer ${
                                          entry.isSaved
                                            ? 'bg-[#EFEADC] dark:bg-[#2C2A38] text-[#A19DAA] border border-[#D9D0BC] cursor-not-allowed'
                                            : 'bg-[#B8763A] hover:bg-[#B8763A]/90 text-white shadow-sm'
                                        }`}
                                      >
                                        {entry.isSaved ? 'Tersimpan' : 'Simpan'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#E8E2D3] dark:border-[#37343F] bg-[#F5F1E7] dark:bg-[#242230] flex flex-wrap items-center justify-between gap-4 shrink-0">
              {/* Operator Info */}
              <div className="flex items-center gap-2.5">
                <div className="w-[36px] h-[36px] rounded-[10px] bg-[#34568B] text-white flex items-center justify-center font-['Inter'] font-bold text-[13px] shrink-0">
                  FE
                </div>
                <div>
                  <div className="text-[12.5px] font-semibold text-[#211F29] dark:text-[#F4F2ED] leading-snug">
                    {profile?.name || 'Felix Salim'} · Operator Gudang
                  </div>
                  <div className="text-[11.5px] text-[#6E6B78] dark:text-[#AEA9B7]">
                    {user?.email || 'felixsalimzz@gmail.com'}
                  </div>
                </div>
              </div>

              {/* Mini Stats */}
              <div className="hidden sm:flex items-center gap-5">
                <div className="text-center">
                  <div className="font-['Inter'] font-bold text-[16px] text-[#211F29] dark:text-[#F4F2ED]">
                    {scannedPos.length}
                  </div>
                  <div className="text-[10px] text-[#6E6B78] dark:text-[#AEA9B7] uppercase tracking-[0.05em]">
                    PO
                  </div>
                </div>
                <div className="w-px h-6 bg-[#D9D0BC] dark:bg-[#48454F]" />
                <div className="text-center">
                  <div className="font-['Inter'] font-bold text-[16px] text-[#211F29] dark:text-[#F4F2ED]">
                    {scannedPos.reduce((sum, entry) => {
                      const hasItems = entry.po?.items && entry.po.items.length > 0;
                      const items = hasItems ? entry.po.items : [{ bookId: entry.po?.bookId }];
                      return sum + items.reduce((s: number, item: any) => {
                        const st = entry.receiveItemsState?.[item.bookId];
                        return s + (Number(st?.qtyReceivedThisTime || '0') || 0);
                      }, 0);
                    }, 0)}
                  </div>
                  <div className="text-[10px] text-[#6E6B78] dark:text-[#AEA9B7] uppercase tracking-[0.05em]">
                    Pcs
                  </div>
                </div>
                <div className="w-px h-6 bg-[#D9D0BC] dark:bg-[#48454F]" />
                <div className="text-center">
                  <div className="font-['Inter'] font-bold text-[16px] text-[#211F29] dark:text-[#F4F2ED]">
                    {scannedPos.filter(e => e.isSaved).length}
                  </div>
                  <div className="text-[10px] text-[#6E6B78] dark:text-[#AEA9B7] uppercase tracking-[0.05em]">
                    Tersimpan
                  </div>
                </div>
              </div>

              {/* Finish Button */}
              <button
                type="button"
                onClick={async () => {
                  await handleStopBulkReceiveScan();
                  setIsBulkReceiveScanOpen(false);
                }}
                className="h-[44px] px-5 bg-[#6E2A3A] hover:bg-[#6E2A3A]/90 text-white rounded-[11px] font-semibold text-[13.5px] flex items-center gap-2 cursor-pointer shadow-sm transition"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                Tutup Antrean & Selesai
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
