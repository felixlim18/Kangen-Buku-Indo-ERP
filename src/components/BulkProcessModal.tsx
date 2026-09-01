import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, Undo2, Send, Copy, Save, Loader2, Check, ArrowUpDown } from 'lucide-react';
import { SalesOrder } from '../types';
import { confirmSalesOrderTransaction } from '../lib/db-helpers';
import { doc, updateDoc, Timestamp, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useSidebar } from '../lib/sidebar-context';
import { ImagePreviewModal } from './ui/ImagePreviewModal';
import { useModalEsc } from '../lib/use-modal-esc';
import { getEffectiveOrderLogistics, sanitizeResiNumber } from '../lib/sales-logistics-utils';

interface BulkProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  menungguOrders: SalesOrder[];
  inventories: any[];
  ledgerEntries: any[];
  purchaseOrders: any[];
  salesOrders: any[];
  damagedRecords: any[];
  books: any[];
}

interface RowData {
  orderId: string;
  orderNo: string;
  resi: string;
  customerNote: string;
  status: 'idle' | 'success' | 'error';
  deskripsi: string;
  deskripsiType: '' | 'ok' | 'warn';
  order: SalesOrder;
}

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function parseDateRobust(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  const ymd = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 0, 0, 0, 0);
  }

  const dmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10), 0, 0, 0, 0);
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

function formatIndoDate(isoStr: string) {
  const d = parseDateRobust(isoStr);
  if (!d) return isoStr;
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function isNotYetDue(isoStr: string) {
  const requested = parseDateRobust(isoStr);
  if (!requested) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return requested.getTime() > today.getTime();
}

/**
 * Resolve display and sorting platform cleanly:
 * Handles orders where platformOrder is '-' or missing but platformChannel has the marketplace name (e.g. Shopee).
 */
const getResolvedPlatform = (order?: Partial<SalesOrder> | null): string => {
  if (!order) return '-';
  const p = (order.platformOrder || '').trim();
  const c = (order.platformChannel || '').trim();
  if (p && p !== '-' && p.toLowerCase() !== 'null' && p.toLowerCase() !== 'undefined') return p;
  if (c && c !== '-' && c.toLowerCase() !== 'null' && c.toLowerCase() !== 'undefined') return c;
  return '-';
};

const getResolvedChannel = (order?: Partial<SalesOrder> | null): string => {
  if (!order) return '';
  const p = (order.platformOrder || '').trim();
  const c = (order.platformChannel || '').trim();
  if (!p || p === '-') return '';
  if (c && c !== '-' && c.toLowerCase() !== p.toLowerCase()) return c;
  return '';
};

/**
 * Default platform order score:
 * 1. '-'
 * 2. Shopee
 * 3. IopenMall
 * 4. 7-Eleven
 * 5. Family Mart
 * 6. Post Office
 * 999. Others
 */
const getDefaultPlatformScore = (platform?: string): number => {
  const p = (platform || '').trim().toLowerCase();
  if (!p || p === '-') return 1;
  if (p.includes('shopee')) return 2;
  if (p.includes('iopenmall')) return 3;
  if (p.includes('7-eleven') || p.includes('7-11') || p === 'seven') return 4;
  if (p.includes('family')) return 5;
  if (p.includes('post') || p.includes('pos')) return 6;
  return 999;
};

/**
 * Detect courier type from tracking number and fallback logistics
 */
const detectCourierType = (resiRaw?: string | null, order?: SalesOrder): 'spx' | '7-11' | 'familymart' | 'hilife' | 'post' | 'unknown' => {
  const clean = sanitizeResiNumber(resiRaw);
  if (!clean) return 'unknown';

  // 1. Shopee Express: Diawali "TW" atau "SPX"
  if (/^TW/i.test(clean) || /^SPX/i.test(clean)) {
    return 'spx';
  }

  // 2. Post Office: 14 digit angka murni atau diawali "PO" / "POST"
  if (/^\d{14}$/.test(clean) || /^POST?/i.test(clean)) {
    return 'post';
  }

  // 3. 7-Eleven: 1 huruf diikuti 11 digit angka (contoh: E85208963980, E0606...)
  if (/^[A-Z]\d{11}$/i.test(clean)) {
    return '7-11';
  }

  // 4. Hi-Life: diawali "6MSC" atau digit diikuti huruf kapital
  if (/^6MSC/i.test(clean) || (/^\d/.test(clean) && /[A-Z]/i.test(clean))) {
    return 'hilife';
  }

  // 5. FamilyMart: 11 digit angka murni, diawali FM, atau murni digit angka
  if (/^\d{11}$/.test(clean) || /^\d+$/.test(clean) || /^FM/i.test(clean)) {
    return 'familymart';
  }

  // Fallback to order logistics if available
  const logistics = (order?.pickupLogistics || '').toLowerCase();
  if (logistics.includes('shopee') || logistics.includes('spx')) return 'spx';
  if (logistics.includes('7-11') || logistics.includes('7-eleven') || logistics.includes('seven')) return '7-11';
  if (logistics.includes('family')) return 'familymart';
  if (logistics.includes('hi-life') || logistics.includes('hilife')) return 'hilife';
  if (logistics.includes('post') || logistics.includes('pos')) return 'post';

  return 'unknown';
};

/**
 * Score calculation for "Urutkan Pengiriman":
 * 1) Nomor Resi Shopee Xpress (Platform: Shopee) -> 100
 * 2) Nomor Resi 7-Eleven:
 *    - Platform: Shopee -> 200
 *    - Platform: IopenMall -> 210
 *    - Platform: Lainnya -> 220
 * 3) Nomor Resi Family Mart:
 *    - Platform: Shopee -> 300
 *    - Platform: Family Mart -> 310
 *    - Platform: Lainnya -> 320
 * 4) Nomor Resi Hi-Life:
 *    - Platform: Shopee -> 400
 *    - Platform: Lainnya -> 410
 * 5) Nomor Resi Post Office:
 *    - Platform: Post Office -> 500
 *    - Platform: Lainnya -> 510
 * 6) Resi Lainnya / Unknown -> 600
 * 7) Tanpa Nomor Resi (Kosong) -> 1000 + default platform score
 */
const getShippingPriorityScore = (resi: string, order?: SalesOrder): number => {
  const cleanResi = sanitizeResiNumber(resi);
  const resolvedPlatform = getResolvedPlatform(order);
  const p = resolvedPlatform.trim().toLowerCase();

  if (!cleanResi) {
    return 1000 + getDefaultPlatformScore(resolvedPlatform);
  }

  const courier = detectCourierType(cleanResi, order);

  // 1) Shopee Xpress (Shopee)
  if (courier === 'spx' && p.includes('shopee')) {
    return 100;
  }

  // 2) 7-Eleven
  if (courier === '7-11') {
    if (p.includes('shopee')) return 200;
    if (p.includes('iopenmall')) return 210;
    return 220;
  }

  // 3) Family Mart
  if (courier === 'familymart') {
    if (p.includes('shopee')) return 300;
    if (p.includes('family')) return 310;
    return 320;
  }

  // 4) Hi-Life
  if (courier === 'hilife') {
    if (p.includes('shopee')) return 400;
    return 410;
  }

  // 5) Post Office
  if (courier === 'post') {
    if (p.includes('post') || p.includes('pos')) return 500;
    return 510;
  }

  // 6) Resi Lainnya yang memiliki resi tetapi tidak cocok kriteria spesifik
  return 600;
};

export const BulkProcessModal: React.FC<BulkProcessModalProps> = ({
  isOpen,
  onClose,
  menungguOrders,
  salesOrders,
  books
}) => {
  const { user } = useAuth();
  const { sidebarHidden } = useSidebar();

  const formatPhoneNumber = (phone?: string) => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };
  
  const [rows, setRows] = useState<RowData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [processProgress, setProcessProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ success: number; warn: number; fail: number } | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ url: string, x: number, y: number, width: number, align?: 'center' | 'right' } | null>(null);

  // Master checkbox element ref for indeterminate state
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Per-order promise chain to prevent race conditions during rapid typing
  const saveQueueRef = useRef<{ [orderId: string]: Promise<void> }>({});
  // Track the latest resi value per order for the queue to pick up
  const latestResiRef = useRef<{ [orderId: string]: string }>({});

  useModalEsc(isOpen, onClose, isProcessing || isSavingAll);
  
  const gridRef = useRef<HTMLDivElement>(null);

  const getStorageKey = useCallback(() => {
    const uid = user?.email || user?.uid || 'default';
    return `kbi_bulk_pack_prefs_${uid}`;
  }, [user]);

  const savePreferencesToLocalStorage = useCallback((orderIds: string[], checkedIds: string[]) => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify({ orderIds, checkedIds }));
    } catch (err) {
      // Ignore quota errors
    }
  }, [getStorageKey]);

  const getPreferencesFromLocalStorage = useCallback((): { orderIds?: string[]; checkedIds?: string[] } | null => {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [getStorageKey]);

  const savePreferencesToFirestore = useCallback(async (orderIds: string[], checkedIds: string[]) => {
    const userDocId = user?.email || user?.uid;
    if (!userDocId) return;
    try {
      const prefRef = doc(db, 'userPreferences', userDocId);
      await setDoc(prefRef, {
        bulkPackSort: {
          orderIds,
          checkedIds,
          updatedAt: Timestamp.now()
        }
      }, { merge: true });
    } catch (err) {
      console.warn('Could not save user preferences to Firestore:', err);
    }
  }, [user]);

  // Load and sort initial data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const allOrders = salesOrders && salesOrders.length > 0 ? salesOrders : menungguOrders;
    const dikemasOrders = (allOrders || []).filter(o => o.status === 'packed');

    // 1. Read instant local cache if available
    const localPrefs = getPreferencesFromLocalStorage();
    const savedOrderIds = localPrefs?.orderIds || [];
    const savedCheckedIds = new Set(localPrefs?.checkedIds || []);

    const orderRankMap = new Map<string, number>();
    savedOrderIds.forEach((id, idx) => orderRankMap.set(id, idx));

    // Sort: if previously saved in custom order, keep position; otherwise sort by default platform
    const sortedOrders = [...dikemasOrders].sort((a, b) => {
      const hasRankA = orderRankMap.has(a.id);
      const hasRankB = orderRankMap.has(b.id);

      if (hasRankA && hasRankB) {
        return orderRankMap.get(a.id)! - orderRankMap.get(b.id)!;
      }
      if (hasRankA && !hasRankB) return -1;
      if (!hasRankA && hasRankB) return 1;

      // Default platform order for new/unranked orders using resolved platform
      const platA = getResolvedPlatform(a);
      const platB = getResolvedPlatform(b);
      const scoreA = getDefaultPlatformScore(platA);
      const scoreB = getDefaultPlatformScore(platB);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return platA.localeCompare(platB);
    });

    const initialRows: RowData[] = sortedOrders.map(order => ({
      orderId: order.id,
      orderNo: order.orderNumber || order.orderCode || '',
      resi: order.shipment?.shippingNumber || '',
      customerNote: order.customerNote?.trim() || '-',
      status: 'idle',
      deskripsi: '',
      deskripsiType: '',
      order: order
    }));

    setRows(initialRows);

    // Retain valid checkboxes from stored selection
    const validChecked = new Set<string>();
    initialRows.forEach(r => {
      if (savedCheckedIds.has(r.orderId)) {
        validChecked.add(r.orderId);
      }
    });
    setSelectedIds(validChecked);
    setSummary(null);

    // 2. Background sync with Firestore for multi-device preference persistence
    const userDocId = user?.email || user?.uid;
    if (userDocId) {
      getDoc(doc(db, 'userPreferences', userDocId)).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          const firestoreOrderIds: string[] = data?.bulkPackSort?.orderIds || [];
          const firestoreCheckedIds: string[] = data?.bulkPackSort?.checkedIds || [];

          if (firestoreOrderIds.length > 0) {
            savePreferencesToLocalStorage(firestoreOrderIds, firestoreCheckedIds);

            const fsRankMap = new Map<string, number>();
            firestoreOrderIds.forEach((id, idx) => fsRankMap.set(id, idx));

            setRows(prevRows => {
              const reSorted = [...prevRows].sort((a, b) => {
                const hasA = fsRankMap.has(a.orderId);
                const hasB = fsRankMap.has(b.orderId);
                if (hasA && hasB) return fsRankMap.get(a.orderId)! - fsRankMap.get(b.orderId)!;
                if (hasA && !hasB) return -1;
                if (!hasA && hasB) return 1;
                const platA = getResolvedPlatform(a.order);
                const platB = getResolvedPlatform(b.order);
                const scA = getDefaultPlatformScore(platA);
                const scB = getDefaultPlatformScore(platB);
                if (scA !== scB) return scA - scB;
                return platA.localeCompare(platB);
              });
              return reSorted;
            });

            const fsCheckedSet = new Set(firestoreCheckedIds);
            setSelectedIds(prev => {
              const next = new Set<string>();
              dikemasOrders.forEach(o => {
                if (fsCheckedSet.has(o.id)) next.add(o.id);
              });
              return next;
            });
          }
        }
      }).catch(err => {
        console.warn('Could not load userPreferences from Firestore:', err);
      });
    }
  }, [isOpen, salesOrders, menungguOrders, user, getPreferencesFromLocalStorage, savePreferencesToLocalStorage]);

  // Master checkbox indeterminate sync
  useEffect(() => {
    if (masterCheckboxRef.current) {
      const nonSuccessRows = rows.filter(r => r.status !== 'success');
      const selectedCount = nonSuccessRows.filter(r => selectedIds.has(r.orderId)).length;
      const isAll = nonSuccessRows.length > 0 && selectedCount === nonSuccessRows.length;
      const isSome = selectedCount > 0 && !isAll;
      masterCheckboxRef.current.indeterminate = isSome;
    }
  }, [rows, selectedIds]);

  if (!isOpen) return null;

  // Toggle individual row checkbox
  const toggleSelect = (orderId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      const currentOrderIds = rows.map(r => r.orderId);
      const checkedArray = Array.from(next);
      savePreferencesToLocalStorage(currentOrderIds, checkedArray);
      savePreferencesToFirestore(currentOrderIds, checkedArray);
      return next;
    });
  };

  // Master checkbox: select all / deselect all
  const toggleSelectAll = () => {
    const nonSuccessRows = rows.filter(r => r.status !== 'success');
    const allSelected = nonSuccessRows.length > 0 && nonSuccessRows.every(r => selectedIds.has(r.orderId));

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        nonSuccessRows.forEach(r => next.delete(r.orderId));
      } else {
        nonSuccessRows.forEach(r => next.add(r.orderId));
      }
      const currentOrderIds = rows.map(r => r.orderId);
      const checkedArray = Array.from(next);
      savePreferencesToLocalStorage(currentOrderIds, checkedArray);
      savePreferencesToFirestore(currentOrderIds, checkedArray);
      return next;
    });
  };

  // Keyboard navigation for checkboxes (Arrow Up/Down and Enter)
  const handleCheckboxKeyDown = (e: React.KeyboardEvent, index: number, orderId: string) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = document.querySelector<HTMLInputElement>(`input[data-checkbox-index="${index + 1}"]`);
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = document.querySelector<HTMLInputElement>(`input[data-checkbox-index="${index - 1}"]`);
      prev?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      toggleSelect(orderId);
    }
  };

  // Keyboard navigation for resi inputs (Arrow Up/Down)
  const handleResiKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = document.querySelector<HTMLInputElement>(`input[data-resi-index="${index + 1}"]`);
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = document.querySelector<HTMLInputElement>(`input[data-resi-index="${index - 1}"]`);
      prev?.focus();
    }
  };

  // Action: "Urutkan Pengiriman"
  const handleSortShipping = () => {
    const sorted = [...rows].sort((a, b) => {
      const scoreA = getShippingPriorityScore(a.resi, a.order);
      const scoreB = getShippingPriorityScore(b.resi, b.order);
      return scoreA - scoreB;
    });

    setRows(sorted);

    const orderIds = sorted.map(r => r.orderId);
    const checkedIds = Array.from(selectedIds);
    savePreferencesToLocalStorage(orderIds, checkedIds);
    savePreferencesToFirestore(orderIds, checkedIds);
  };

  // Fire-and-forget instant autosave with per-order promise chaining (no delay)
  const instantSaveResi = (orderId: string, resiValue: string) => {
    latestResiRef.current[orderId] = resiValue;

    const prevPromise = saveQueueRef.current[orderId] || Promise.resolve();
    saveQueueRef.current[orderId] = prevPromise.then(async () => {
      const latestResi = latestResiRef.current[orderId];
      try {
        const orderRef = doc(db, 'salesOrders', orderId);
        await updateDoc(orderRef, {
          'shipment.shippingNumber': latestResi,
          updatedAt: Timestamp.now()
        });
        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === orderId);
          if (idx !== -1 && next[idx].deskripsi === 'Menyimpan...') {
            next[idx].deskripsi = 'Tersimpan';
            next[idx].deskripsiType = 'ok';
          }
          return next;
        });
      } catch (err) {
        console.error('Failed to auto-save resi', err);
        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === orderId);
          if (idx !== -1) {
            next[idx].deskripsi = 'Gagal menyimpan';
            next[idx].deskripsiType = '';
          }
          return next;
        });
      }
    });
  };

  const handleInputChange = (r: number, value: string) => {
    const newRows = [...rows];
    newRows[r].resi = sanitizeResiNumber(value);
    if (newRows[r].status === 'error') newRows[r].status = 'idle';
    newRows[r].deskripsi = 'Menyimpan...';
    newRows[r].deskripsiType = 'warn';
    setRows(newRows);

    // Fire-and-forget instant save
    instantSaveResi(newRows[r].orderId, newRows[r].resi);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT') return;

    const clipboard = e.clipboardData.getData('text');
    if (!clipboard) return;

    e.preventDefault();

    const startRow = parseInt(target.dataset.row || '0', 10);
    const lines = clipboard.replace(/\r/g, '').split('\n').filter(l => l.length > 0);
    
    const newRows = [...rows];
    const toSave: { orderId: string; resi: string }[] = [];

    lines.forEach((line, i) => {
      const rowIndex = startRow + i;
      if (rowIndex < newRows.length && newRows[rowIndex].status !== 'success') {
        const cells = line.split('\t');
        const sanitized = sanitizeResiNumber(cells[0] || line);
        newRows[rowIndex].resi = sanitized;
        newRows[rowIndex].status = 'idle';
        newRows[rowIndex].deskripsi = 'Menyimpan...';
        newRows[rowIndex].deskripsiType = 'warn';
        if (sanitized.trim()) {
          toSave.push({ orderId: newRows[rowIndex].orderId, resi: sanitized });
        }
      }
    });

    setRows(newRows);

    // Instant save all pasted rows
    toSave.forEach(({ orderId, resi }) => instantSaveResi(orderId, resi));
  };

  const handleRowProcess = async (rowIndex: number) => {
    const newRows = [...rows];
    const row = newRows[rowIndex];
    const orderNo = row.orderNo.trim();
    const resi = row.resi.trim();
    if (!orderNo || !resi || row.status === 'success') return;

    try {
      await confirmSalesOrderTransaction(row.order.id, user?.uid || 'anonymous');
      const orderRef = doc(db, 'salesOrders', row.order.id);
      const finalOrderNo = row.order.orderNumber || row.order.orderCode || '';
      await updateDoc(orderRef, {
        status: 'shipped',
        shippedAt: Timestamp.now(),
        orderNumber: finalOrderNo,
        shipment: {
          orderNumber: finalOrderNo,
          shippingNumber: resi,
          shippingDate: Timestamp.fromDate(new Date()),
          arrangedAt: Timestamp.now()
        },
        updatedAt: Timestamp.now()
      });
      row.status = 'success';
      row.deskripsi = 'Berhasil dikirim';
      row.deskripsiType = 'ok';
      setSummary(prev => prev ? { ...prev, success: prev.success + 1 } : { success: 1, warn: 0, fail: 0 });
    } catch (err: any) {
      row.status = 'error';
      row.deskripsi = err.message || 'Gagal memproses';
      setSummary(prev => prev ? { ...prev, fail: prev.fail + 1 } : { success: 0, warn: 0, fail: 1 });
    }
    setRows(newRows);
  };

  const handleRowRevert = async (rowIndex: number) => {
    const row = rows[rowIndex];
    try {
      const orderRef = doc(db, 'salesOrders', row.order.id);
      await updateDoc(orderRef, {
        status: 'confirmed',
        updatedAt: Timestamp.now()
      });
      setRows(prev => prev.filter((_, i) => i !== rowIndex));
    } catch (err: any) {
      console.error('Revert failed:', err);
    }
  };

  // "Simpan" button: save all resi values to Firestore (status stays 'packed')
  const handleSaveAll = async () => {
    setIsSavingAll(true);
    const rowsToSave = rows.filter(r => r.resi.trim() && r.status !== 'success');
    setProcessProgress({ current: 0, total: rowsToSave.length });

    let saved = 0;
    const promises = rowsToSave.map(async (row) => {
      try {
        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === row.orderId);
          if (idx !== -1) {
            next[idx].deskripsi = 'Menyimpan...';
            next[idx].deskripsiType = 'warn';
          }
          return next;
        });

        const orderRef = doc(db, 'salesOrders', row.orderId);
        await updateDoc(orderRef, {
          'shipment.shippingNumber': row.resi,
          updatedAt: Timestamp.now()
        });

        saved++;
        setProcessProgress(p => p ? { ...p, current: saved } : null);

        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === row.orderId);
          if (idx !== -1) {
            next[idx].deskripsi = 'Tersimpan';
            next[idx].deskripsiType = 'ok';
          }
          return next;
        });
      } catch (err) {
        console.error('Failed to save resi for', row.orderId, err);
        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === row.orderId);
          if (idx !== -1) {
            next[idx].deskripsi = 'Gagal menyimpan';
            next[idx].deskripsiType = '';
          }
          return next;
        });
      }
    });

    await Promise.all(promises);
    setIsSavingAll(false);
    setTimeout(() => setProcessProgress(null), 1500);
  };

  // "Proses" button: only processes SELECTED orders with valid resi (status -> 'shipped')
  const handleProcess = async () => {
    const sourceOrders = salesOrders && salesOrders.length > 0 ? salesOrders : menungguOrders;
    // Process rows that are selected, have resi, and not yet success
    const rowsToProcess = rows.filter(r => selectedIds.has(r.orderId) && r.orderNo.trim() && r.resi.trim() && r.status !== 'success');
    
    if (rowsToProcess.length === 0) return;

    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    let notYetDueCount = 0;

    setProcessProgress({ current: 0, total: rowsToProcess.length });
    let processed = 0;

    for (const row of rowsToProcess) {
      const order = sourceOrders.find(o => o.id === row.orderId || o.orderNumber === row.orderNo || o.orderCode === row.orderNo);

      if (!order) {
        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === row.orderId);
          if (idx !== -1) {
            next[idx].status = 'error';
            next[idx].deskripsi = 'Order tidak ditemukan';
          }
          return next;
        });
        errorCount++;
        processed++;
        setProcessProgress(p => p ? { ...p, current: processed } : null);
        continue;
      }

      // Mark as processing
      setRows(prev => {
        const next = [...prev];
        const idx = next.findIndex(x => x.orderId === row.orderId);
        if (idx !== -1) {
          next[idx].deskripsi = 'Memproses...';
          next[idx].deskripsiType = 'warn';
        }
        return next;
      });

      try {
        await confirmSalesOrderTransaction(order.id, user?.uid || 'anonymous');
        
        const orderRef = doc(db, 'salesOrders', order.id);
        const finalOrderNo = order.orderNumber || order.orderCode || '';
        await updateDoc(orderRef, {
          status: 'shipped',
          shippedAt: Timestamp.now(),
          orderNumber: finalOrderNo,
          shipment: {
            orderNumber: finalOrderNo,
            shippingNumber: row.resi,
            shippingDate: Timestamp.fromDate(new Date()),
            arrangedAt: Timestamp.now()
          },
          updatedAt: Timestamp.now()
        });

        successCount++;
        const isWarning = order.estimatedShippingDate && isNotYetDue(order.estimatedShippingDate);
        if (isWarning) notYetDueCount++;

        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === row.orderId);
          if (idx !== -1) {
            next[idx].status = 'success';
            next[idx].deskripsi = isWarning
              ? `Belum Waktunya Dikirim, Diminta Kirim Tanggal ${formatIndoDate(order.estimatedShippingDate!)}`
              : 'Berhasil dikirim';
            next[idx].deskripsiType = isWarning ? 'warn' : 'ok';
          }
          return next;
        });
      } catch (err: any) {
        errorCount++;
        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === row.orderId);
          if (idx !== -1) {
            next[idx].status = 'error';
            next[idx].deskripsi = err.message || 'Gagal memproses (Cek stok)';
          }
          return next;
        });
      }

      processed++;
      setProcessProgress(p => p ? { ...p, current: processed } : null);
    }

    setSummary({ success: successCount, warn: notYetDueCount, fail: errorCount });
    setIsProcessing(false);
    setTimeout(() => setProcessProgress(null), 1500);
  };

  const filledCount = rows.filter(r => r.resi.trim()).length;
  const nonSuccessRows = rows.filter(r => r.status !== 'success');
  const selectedCount = nonSuccessRows.filter(r => selectedIds.has(r.orderId)).length;
  const processableCount = rows.filter(r => selectedIds.has(r.orderId) && r.resi.trim() && r.status !== 'success').length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] transition-all duration-300 w-full ${
          sidebarHidden ? 'max-w-[97vw]' : 'max-w-[94vw]'
        }`}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-7 py-4 bg-gradient-to-r from-[#173a6b] to-[#2b5a9e] text-white flex-none overflow-hidden shadow-sm">
          <div className="flex items-center gap-3.5 z-10">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[1.2px] text-white/70">
                  Pemrosesan Batch
                </span>
              </div>
              <h2 className="font-['Space_Grotesk'] text-[18px] font-bold tracking-[-0.3px] text-white leading-tight">
                Proses Massal Pesanan Dikemas
              </h2>
            </div>
          </div>
          
          <button 
            onClick={onClose} 
            disabled={isProcessing}
            className="z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="absolute right-0 top-0 bottom-0 w-80 opacity-10 flex items-center justify-around pointer-events-none pr-4">
            {Array.from({ length: 90 }).map((_, i) => (
              <span key={i} className="block bg-white/80 w-[2px]" style={{ height: `${[40, 60, 100, 75][Math.floor(Math.random() * 4)]}%` }}></span>
            ))}
          </div>

          {/* Smooth progress bar */}
          {processProgress && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-emerald-300 rounded-full"
                style={{
                  width: processProgress.total > 0 ? `${(processProgress.current / processProgress.total) * 100}%` : '0%',
                  transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 md:p-5 pb-3 flex flex-col flex-1 min-h-0">
          {summary && (
            <div className="flex flex-wrap gap-4 px-4 py-2.5 bg-[#f3f7fc] border border-[#e5edf9] rounded-lg text-[12.5px] mb-3 items-center flex-none">
              {summary.success > 0 && <span className="text-[#12876b] font-medium inline-flex items-center gap-1">✓ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.success}</span> order berhasil diproses</span>}
              {summary.warn > 0 && <span className="text-[#a9711f] font-medium inline-flex items-center gap-1">⚠ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.warn}</span> belum waktunya dikirim</span>}
              {summary.fail > 0 && <span className="text-[#b8433a] font-medium inline-flex items-center gap-1">✕ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.fail}</span> gagal diproses</span>}
            </div>
          )}

          {/* Top Controls Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap flex-none">
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-[#525c6d] font-['Space_Grotesk'] font-medium">
                Total <span className="font-bold text-[#101826] font-numeric">{rows.length}</span> pesanan dikemas
              </span>
              {selectedCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#2b5a9e]/10 text-[#2b5a9e] border border-[#2b5a9e]/20">
                  <Check className="w-3 h-3" />
                  {selectedCount} dipilih
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSortShipping}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#173a6b] hover:bg-[#0f274a] text-white text-[12.5px] font-['Space_Grotesk'] font-semibold rounded-lg shadow-xs transition-all duration-200 cursor-pointer active:scale-95"
                title="Urutkan pesanan berdasarkan Nomor Resi dan Platform Order"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                Urutkan Pengiriman
              </button>
            </div>
          </div>

          {/* Table Container: Unified Scroll Container with lockstep sticky header */}
          <div className="border border-[#dde4f0] rounded-xl overflow-hidden bg-white flex flex-col flex-1 min-h-[260px] shadow-xs">
            <div 
              className="flex-1 overflow-auto relative min-h-0" 
              ref={gridRef}
              onPaste={handlePaste}
            >
              <div className="min-w-[1150px]">
                {/* Sticky Header: Perfectly matches row columns */}
                <div 
                  className="sticky top-0 z-20 grid gap-0 bg-[#f1f6fc] border-b border-[#dde4f0] shadow-xs"
                  style={{ gridTemplateColumns: '44px 180px 220px 160px 220px 60px minmax(140px, 1fr) 75px' }}
                >
                  {/* Master Checkbox */}
                  <div className="flex items-center justify-center p-2.5 border-r border-[#dde4f0]">
                    <input
                      type="checkbox"
                      ref={masterCheckboxRef}
                      checked={nonSuccessRows.length > 0 && nonSuccessRows.every(r => selectedIds.has(r.orderId))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-[#2b5a9e] border-gray-300 focus:ring-[#2b5a9e] focus:ring-offset-0 cursor-pointer"
                      title="Pilih Semua / Batalkan Semua"
                    />
                  </div>
                  <span className="font-['Space_Grotesk'] text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-3.5 border-r border-[#dde4f0] whitespace-nowrap">
                    Nomor Order
                  </span>
                  <span className="font-['Space_Grotesk'] text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-3.5 border-r border-[#dde4f0] whitespace-nowrap">
                    Nomor Resi
                  </span>
                  <span className="font-['Space_Grotesk'] text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-3.5 border-r border-[#dde4f0] whitespace-nowrap">
                    Platform Order
                  </span>
                  <span className="font-['Space_Grotesk'] text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-3.5 border-r border-[#dde4f0] whitespace-nowrap">
                    Nama Barang
                  </span>
                  <span className="font-['Space_Grotesk'] text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-center text-center p-2.5 flex items-center border-r border-[#dde4f0] whitespace-nowrap">
                    Qty
                  </span>
                  <span className="font-['Space_Grotesk'] text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-3.5 border-r border-[#dde4f0] whitespace-nowrap">
                    Note Customer
                  </span>
                  <span className="font-['Space_Grotesk'] text-[10.5px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-center text-center p-2.5 flex items-center whitespace-nowrap">
                    Aksi
                  </span>
                </div>

                {/* Table Body Rows */}
                {rows.length === 0 ? (
                  <div className="p-12 text-center text-[#525c6d] font-['Inter'] text-sm">
                    Tidak ada orderan berstatus Dikemas saat ini.
                  </div>
                ) : (
                  rows.map((row, i) => {
                    const isSelected = selectedIds.has(row.orderId);
                    const resolvedPlat = getResolvedPlatform(row.order);
                    const resolvedChan = getResolvedChannel(row.order);

                    return (
                      <React.Fragment key={row.orderId || i}>
                        <div 
                          className={`grid gap-0 border-b border-[#dde4f0] transition-colors items-stretch
                            ${row.status === 'success' ? 'bg-[#e5f5f0] shadow-[inset_3px_0_0_#12876b]' : row.status === 'error' ? 'bg-[#fbebea] shadow-[inset_3px_0_0_#b8433a]' : isSelected ? 'bg-[#edf4fc]' : i % 2 !== 0 ? 'bg-[#f8fafc]' : 'bg-white'}
                          `}
                          style={{ gridTemplateColumns: '44px 180px 220px 160px 220px 60px minmax(140px, 1fr) 75px' }}
                        >
                          {/* Checkbox */}
                          <div className="flex items-center justify-center p-2 border-r border-[#dde4f0]">
                            <input
                              type="checkbox"
                              data-checkbox-index={i}
                              checked={isSelected}
                              onChange={() => toggleSelect(row.orderId)}
                              onKeyDown={(e) => handleCheckboxKeyDown(e, i, row.orderId)}
                              disabled={row.status === 'success'}
                              className="w-4 h-4 rounded text-[#2b5a9e] border-gray-300 focus:ring-[#2b5a9e] focus:ring-offset-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </div>

                          {/* Nomor Order */}
                          <div className="flex items-center justify-between px-3.5 py-2 border-r border-[#dde4f0] relative h-full min-w-0">
                            <span className="font-['IBM_Plex_Mono'] text-[13px] font-semibold text-[#173a6b]" title={row.orderNo}>
                              {row.orderNo}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveTooltip(activeTooltip === row.orderId ? null : row.orderId)}
                              className="p-1 text-neutral-400 hover:text-[#2b5a9e] hover:bg-blue-50 rounded-md transition-colors shrink-0 ml-1.5 cursor-pointer"
                              title="Lihat Detail Pesanan"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {activeTooltip === row.orderId && (
                              <div className="absolute top-[60%] mt-2 left-4 w-[320px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.12)] border border-[#e5e7eb] rounded-xl p-4 z-50 text-left cursor-default flex flex-col" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-3">
                                  <span className="font-semibold text-[13px] text-neutral-800 tracking-tight">Detail Pesanan</span>
                                  <X className="w-3.5 h-3.5 cursor-pointer text-neutral-400 hover:text-neutral-600 shrink-0" onClick={() => setActiveTooltip(null)} />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
                                  {/* Nama Pembeli */}
                                  <div className="flex flex-col group items-start">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Nama</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11.5px] text-neutral-800 font-medium truncate" title={row.order.customerName}>{row.order.customerName || '-'}</span>
                                      {row.order.customerName && (
                                        <button onClick={() => navigator.clipboard.writeText(row.order.customerName || '')} className="text-neutral-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100" title="Copy">
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* No Handphone */}
                                  <div className="flex flex-col group items-start">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">No. HP</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11.5px] text-neutral-800 font-medium truncate font-['Inter']">{formatPhoneNumber(row.order.phoneNumber)}</span>
                                      {row.order.phoneNumber && (
                                        <button onClick={() => navigator.clipboard.writeText(row.order.phoneNumber || '')} className="text-neutral-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100" title="Copy">
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Opsi Pengiriman */}
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Pengiriman</span>
                                    <span className="text-[11.5px] text-neutral-800 font-medium truncate">{getEffectiveOrderLogistics({ ...row.order, shipment: { ...row.order.shipment, shippingNumber: row.resi || row.order.shipment?.shippingNumber || '' } }, undefined, '-')}</span>
                                  </div>

                                  {/* Total Belanja */}
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Total</span>
                                    <span className="text-[11.5px] font-bold text-[#173a6b]">NT$ {((row.order.totalPrice || 0) / 100).toLocaleString()}</span>
                                  </div>
                                </div>

                                {/* Kode / Alamat */}
                                <div className="flex flex-col bg-neutral-50 rounded-lg p-2.5 mb-3 border border-neutral-100 group">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Kode / Alamat</span>
                                    <div className="flex gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {row.order.addressPhotoUrl && (
                                        <div className="relative flex">
                                          <div 
                                            className="text-neutral-400 hover:text-brand-600 transition-colors flex items-center gap-1 bg-white border border-neutral-200 px-1.5 py-0.5 rounded shadow-sm cursor-pointer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewImage(row.order.addressPhotoUrl);
                                              setHoverPreview(null);
                                            }}
                                            onMouseEnter={(e) => {
                                              if (!row.order.addressPhotoUrl) return;
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setHoverPreview({ url: row.order.addressPhotoUrl, x: rect.right, y: rect.top, width: 220, align: 'right' });
                                            }}
                                            onMouseLeave={() => setHoverPreview(null)}
                                          >
                                            <Eye className="w-3 h-3" />
                                            <span className="text-[8px] font-bold uppercase tracking-wider">View</span>
                                          </div>
                                        </div>
                                      )}
                                      {row.order.pickupDetails && (
                                        <button onClick={() => navigator.clipboard.writeText(row.order.pickupDetails || '')} className="text-neutral-400 hover:text-brand-600 transition-colors" title="Copy Alamat">
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-neutral-700 font-medium line-clamp-2 leading-relaxed" title={row.order.pickupDetails}>{row.order.pickupDetails || '-'}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Nomor Resi (Styled input box with clear outline) */}
                          <div className="px-3 py-2 border-r border-[#dde4f0] h-full flex items-center">
                            <input 
                              type="text" 
                              className="w-full h-9 px-3 bg-white border border-[#cdd7e5] hover:border-[#2b5a9e]/60 focus:border-[#2b5a9e] focus:ring-2 focus:ring-[#2b5a9e]/15 rounded-lg font-['IBM_Plex_Mono'] text-[13px] tracking-[0.2px] text-[#101826] placeholder:font-['Inter'] placeholder:text-[#98a1b0] placeholder:text-[11.5px] transition-all outline-none disabled:bg-gray-100 disabled:text-gray-400 shadow-2xs"
                              value={row.resi}
                              placeholder="Ketik / Paste No Resi"
                              disabled={row.status === 'success'}
                              data-row={i}
                              data-resi-index={i}
                              onChange={e => handleInputChange(i, e.target.value)}
                              onKeyDown={e => handleResiKeyDown(e, i)}
                            />
                          </div>

                          {/* Platform Order (Resolved clean platform & channel) */}
                          <div className="flex flex-col justify-center px-3.5 py-2 border-r border-[#dde4f0] h-full">
                            <span className="font-['Space_Grotesk'] text-[12.5px] font-bold text-neutral-800 tracking-tight leading-tight">
                              {resolvedPlat}
                            </span>
                            {resolvedChan && (
                              <span className="font-['Inter'] text-[10.5px] text-neutral-500 mt-0.5 font-medium leading-tight">
                                {resolvedChan}
                              </span>
                            )}
                          </div>

                          {/* Nama Barang & QTY (Subgrid matched to 65px qty) */}
                          <div className="col-span-2 flex flex-col h-full border-r border-[#dde4f0]">
                            {row.order.items?.map((item, idx) => {
                              const coverUrl = item.bookCover || books?.find(b => b.id === item.bookId)?.cover;
                              return (
                                <div key={idx} className={`grid grid-cols-[1fr_60px] flex-1 ${idx !== 0 ? 'border-t border-[#dde4f0]' : ''}`}>
                                  {/* Nama Barang */}
                                  <div className="flex items-center gap-2.5 px-3 py-2 min-w-0 flex-1">
                                    <div 
                                      className="relative rounded shrink-0 overflow-visible border border-neutral-200 cursor-pointer bg-neutral-100 shadow-2xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (coverUrl) setPreviewImage(coverUrl);
                                        setHoverPreview(null);
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!coverUrl) return;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setHoverPreview({ url: coverUrl, x: rect.left + rect.width / 2, y: rect.top, width: 112, align: 'center' });
                                      }}
                                      onMouseLeave={() => setHoverPreview(null)}
                                    >
                                      {coverUrl ? (
                                        <img src={coverUrl} alt="cover" referrerPolicy="no-referrer" className="w-[32px] h-[44px] object-cover rounded-sm" />
                                      ) : (
                                        <div className="w-[32px] h-[44px] flex items-center justify-center text-[6px] text-neutral-400">No Img</div>
                                      )}
                                    </div>
                                    <span 
                                      className="text-[12.5px] font-medium text-neutral-800 leading-[1.35] break-words line-clamp-2 min-w-0"
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        wordBreak: 'break-word'
                                      }}
                                      title={item.bookName || '-'}
                                    >
                                      {item.bookName || '-'}
                                    </span>
                                  </div>
                                  {/* Qty */}
                                  <div className="flex items-center justify-center font-bold font-numeric text-[13px] text-neutral-900 border-l border-[#dde4f0]">
                                    {item.qty} <span className="text-[10px] ml-0.5 font-normal text-neutral-500">pcs</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Note Dari Customer */}
                          <div className="flex flex-col justify-center px-3.5 py-2 font-['Inter'] text-[12px] leading-[1.35] text-[#374151] border-r border-[#dde4f0] h-full">
                            <div className={`font-medium ${row.customerNote === '-' ? 'text-[#9ca3af]' : 'text-[#1f2937]'}`}>
                              {row.customerNote}
                            </div>
                            {row.deskripsi && (
                              <div
                                className={`text-[10.5px] font-semibold mt-1 inline-flex items-center gap-1.5 transition-all duration-300 ease-out ${
                                  row.deskripsiType === 'ok' ? 'text-[#12876b]' : row.deskripsiType === 'warn' ? 'text-[#a9711f]' : 'text-[#b8433a]'
                                }`}
                                style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
                              >
                                {row.deskripsiType === 'warn' && (row.deskripsi === 'Menyimpan...' || row.deskripsi === 'Memproses...') ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : row.deskripsiType === 'ok' ? (
                                  <Check className="w-3 h-3" />
                                ) : row.deskripsiType === 'warn' ? (
                                  <span>⚠</span>
                                ) : (
                                  <span>✕</span>
                                )}
                                {row.deskripsi}
                              </div>
                            )}
                          </div>

                          {/* Aksi */}
                          <div className="px-2 py-2 flex items-center justify-center gap-1.5 h-full">
                            <button
                              onClick={() => handleRowRevert(i)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Kembalikan ke status Confirmed"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRowProcess(i)}
                              disabled={row.status === 'success' || !row.resi.trim()}
                              className="p-1.5 text-[#2b5a9e] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Proses Kirim (Baris ini)"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2.5 px-6 py-3.5 border-t border-[#dde4f0] bg-[#e9edf5] flex-none">
          <span className="font-['IBM_Plex_Mono'] text-[11.5px] text-[#525c6d]">
            {filledCount} / {rows.length} resi terisi
            <span className="ml-2.5 text-[#2b5a9e] font-semibold">
              • {selectedCount} dipilih
            </span>
            {processProgress && (
              <span className="ml-2 text-[#2b5a9e] font-semibold">
                ({processProgress.current}/{processProgress.total})
              </span>
            )}
          </span>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="bg-white hover:bg-[#f3f7fc] text-[#525c6d] border border-[#dde4f0] font-['Space_Grotesk'] font-semibold text-[13px] px-4.5 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            >
              Tutup
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSavingAll || isProcessing || filledCount === 0}
              className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-['Space_Grotesk'] font-bold text-[13px] tracking-[0.2px] px-4.5 py-2 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {isSavingAll ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan...</>
              ) : (
                <><Save className="w-3.5 h-3.5" /> Simpan</>
              )}
            </button>
            <button 
              onClick={handleProcess} 
              disabled={isProcessing || isSavingAll || processableCount === 0} 
              className="bg-[#2b5a9e] hover:bg-[#173a6b] text-white border-none font-['Space_Grotesk'] font-bold text-[13px] tracking-[0.2px] px-5.5 py-2 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              title={processableCount === 0 ? "Centang pesanan yang sudah ada resi untuk diproses" : undefined}
            >
              {isProcessing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memproses...</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Proses{selectedCount > 0 ? ` (${selectedCount})` : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>

      {previewImage && (
        <ImagePreviewModal
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage}
          title="Pratinjau"
        />
      )}

      {hoverPreview && !previewImage && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed z-[9999] bg-white p-1.5 rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.2)] border border-neutral-200 pointer-events-none"
          style={{ 
            left: hoverPreview.x, 
            top: hoverPreview.y - 8, 
            transform: hoverPreview.align === 'center' ? 'translate(-50%, -100%)' : 'translate(-100%, -100%)',
            width: `${hoverPreview.width}px`
          }}
        >
          <img src={hoverPreview.url} alt="Preview" className="w-full h-auto max-h-[280px] object-contain rounded-md shadow-sm" />
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
};
