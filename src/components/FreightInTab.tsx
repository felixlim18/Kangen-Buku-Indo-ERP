import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  writeBatch, 
  query, 
  where, 
  Timestamp,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { FALLBACK_NTD_PER_IDR } from '../lib/exchangeRateConstants';
import { useAuth } from '../lib/auth-context';
import { formatNTD, formatIDR, formatNumber, formatInputWithCommas, cleanCommas } from '../lib/decimal-utils';
import { sanitizePurchaseOrders } from '../lib/db-helpers';
import { Decimal } from 'decimal.js';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Truck, 
  Edit, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Trash2, 
  HelpCircle, 
  Package, 
  RotateCcw,
  Sparkles,
  Info,
  Copy,
  Notebook,
  QrCode,
  Camera,
  RefreshCw,
  X
} from 'lucide-react';
import { generateReceivingJournals } from '../lib/journalAuto';
import { getNextJournalId } from '../lib/journalUtils';
import { formatDate } from '../lib/date-utils';

const formatFreightDateDisplay = (createdAt: any): string => {
  return formatDate(createdAt);
};

const parseToDateString = (createdAt: any): string => {
  if (!createdAt) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  let d: Date | null = null;
  if (typeof createdAt.toDate === 'function') {
    d = createdAt.toDate();
  } else if (typeof createdAt.seconds === 'number') {
    d = new Date(createdAt.seconds * 1000);
  } else if (createdAt instanceof Date) {
    d = createdAt;
  } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d) {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface FreightInRecord {
  id: string; // is freightCode
  freightCode: string;
  ratePerKg: number;
  totalKg: number;
  exchangeRate?: number;
  docNo?: string;
  createdAt?: any;
  totalHargaPengiriman?: number;
  totalHargaPengirimanNTD?: number;
  isCapitalized?: boolean;
  capitalizationJournalId?: string;
}

function getEnrichedFreightList(list: FreightInRecord[]): (FreightInRecord & { docNo: string })[] {
  // 1. Helper to parse date
  const parseCreatedAt = (createdAt: any): Date | null => {
    if (!createdAt) return null;
    if (typeof createdAt.toDate === 'function') {
      return createdAt.toDate();
    }
    if (typeof createdAt.seconds === 'number') {
      return new Date(createdAt.seconds * 1000);
    }
    if (createdAt instanceof Date) {
      return createdAt;
    }
    if (typeof createdAt === 'string') {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof createdAt === 'number') {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const formatDateToYYMMDD = (date: Date): string => {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  };

  const docNoMap: Record<string, string> = {};
  const withDate: { rec: FreightInRecord; date: Date; dateStr: string }[] = [];
  const withoutDate: FreightInRecord[] = [];

  list.forEach(rec => {
    if (rec.docNo) {
      docNoMap[rec.freightCode] = rec.docNo;
    } else {
      const parsed = parseCreatedAt(rec.createdAt);
      if (parsed) {
        withDate.push({
          rec,
          date: parsed,
          dateStr: formatDateToYYMMDD(parsed)
        });
      } else {
        withoutDate.push(rec);
      }
    }
  });

  // Sort withDate chronologically (ascending).
  // If timestamps are identical, sort by freightCode to be 100% deterministic.
  withDate.sort((a, b) => {
    const timeA = a.date.getTime();
    const timeB = b.date.getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.rec.freightCode.localeCompare(b.rec.freightCode);
  });

  // Assign sequence numbers to withDate grouped by dateStr
  const countsPerDay: Record<string, number> = {};

  withDate.forEach(item => {
    const dateStr = item.dateStr;
    if (!countsPerDay[dateStr]) {
      countsPerDay[dateStr] = 0;
    }
    countsPerDay[dateStr] += 1;
    const seq = countsPerDay[dateStr];
    docNoMap[item.rec.freightCode] = `FI${dateStr}${String(seq).padStart(2, '0')}`;
  });

  // Sort withoutDate alphabetically by freightCode to be 100% deterministic
  withoutDate.sort((a, b) => a.freightCode.localeCompare(b.freightCode));

  withoutDate.forEach((rec, idx) => {
    const seq = idx + 1;
    docNoMap[rec.freightCode] = `FI000000${String(seq).padStart(2, '0')}`;
  });

  return list.map(rec => ({
    ...rec,
    docNo: docNoMap[rec.freightCode] || `FI00000001`
  }));
}

export default function FreightInTab() {
  const { user } = useAuth();
  
  // Real-time Lists
  const [freightList, setFreightList] = useState<FreightInRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  
  // Helper for today's date string (YYYY-MM-DD)
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Modal Fields for manual Freight-In creation
  const [isAddFreightOpen, setIsAddFreightOpen] = useState(false);
  const [newFreightDate, setNewFreightDate] = useState(getTodayDateString());
  const [newFreightCode, setNewFreightCode] = useState('');
  const [newTotalKg, setNewTotalKg] = useState('');
  const [newTotalCost, setNewTotalCost] = useState('');

  // Modal Fields for Freight-In editing
  const [isEditFreightOpen, setIsEditFreightOpen] = useState(false);
  const [editingFreight, setEditingFreight] = useState<FreightInRecord | null>(null);
  const [editFreightDate, setEditFreightDate] = useState(getTodayDateString());
  const [editFreightCode, setEditFreightCode] = useState('');
  const [editTotalKg, setEditTotalKg] = useState('');
  const [editTotalCost, setEditTotalCost] = useState('');
  const [isSavingFreight, setIsSavingFreight] = useState(false);

  // Barcode / QR Code Scanner State
  const [isFreightScannerOpen, setIsFreightScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [freightCameraFacingMode, setFreightCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const toggleFreightCameraFacingMode = async () => {
    const nextMode = freightCameraFacingMode === 'environment' ? 'user' : 'environment';
    setFreightCameraFacingMode(nextMode);
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        console.warn("Stop freight scanner error on flip:", e);
      }
    }
  };

  // Effect for Barcode / QR Code camera initialization
  useEffect(() => {
    let isMounted = true;
    if (isFreightScannerOpen) {
      setScannerError(null);
      const timer = setTimeout(() => {
        const element = document.getElementById('freight-qr-reader');
        if (element) {
          try {
            const scanner = new Html5Qrcode("freight-qr-reader", {
              formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128
              ],
              verbose: false,
              experimentalFeatures: {
                useBarCodeDetectorIfSupported: false
              }
            });
            html5QrCodeRef.current = scanner;

            const config = {
              fps: 20,
              qrbox: 250,
              aspectRatio: 1.333333,
              videoConstraints: {
                facingMode: freightCameraFacingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                aspectRatio: { ideal: 1.333333 },
                advanced: [{ focusMode: "continuous" }] as any
              }
            };

            scanner.start(
              { facingMode: freightCameraFacingMode },
              config,
              (decodedText) => {
                if (!isMounted) return;
                const cleanText = decodedText.trim().toUpperCase();
                if (cleanText) {
                  setNewFreightCode(cleanText);
                  setIsAddFreightOpen(true);
                  setSuccessToast(`Barcode / QR Terbaca: ${cleanText}`);
                  setTimeout(() => setSuccessToast(null), 3000);

                  if (html5QrCodeRef.current) {
                    html5QrCodeRef.current.stop().then(() => {
                      html5QrCodeRef.current = null;
                      setIsFreightScannerOpen(false);
                    }).catch(() => {
                      html5QrCodeRef.current = null;
                      setIsFreightScannerOpen(false);
                    });
                  } else {
                    setIsFreightScannerOpen(false);
                  }
                }
              },
              () => {}
            ).catch((err) => {
              console.error("Camera start error:", err);
              if (isMounted) {
                setScannerError("Gagal membuka kamera: " + (err.message || err));
              }
            });
          } catch (e: any) {
            console.error("Scanner init error:", e);
            if (isMounted) {
              setScannerError("Gagal inisialisasi scanner kamera.");
            }
          }
        }
      }, 300);

      return () => {
        isMounted = false;
        clearTimeout(timer);
        if (html5QrCodeRef.current) {
          html5QrCodeRef.current.stop().then(() => {
            html5QrCodeRef.current = null;
          }).catch(() => {
            html5QrCodeRef.current = null;
          });
        }
      };
    }
  }, [isFreightScannerOpen, freightCameraFacingMode]);

  const closeFreightScanner = async () => {
    if (html5QrCodeRef.current) {
      const instance = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch (e: any) {
        console.warn("Notice during stop freight scanner:", e?.message || e);
      }
    }
    setIsFreightScannerOpen(false);
  };

  // Confirmation state for unlinking PO
  const [unlinkingPo, setUnlinkingPo] = useState<{ poId: string; purchaseCode: string; freightCode: string } | null>(null);

  // Search Filter and Copy State
  const [searchQuery, setSearchQuery] = useState('');
  const [freightPage, setFreightPage] = useState<number>(1);

  useEffect(() => {
    setFreightPage(1);
  }, [searchQuery]);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedDocNo, setCopiedDocNo] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Expanded Rows State (freightCode -> boolean)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Loading States
  const [loading, setLoading] = useState(true);
  const [deletingFreightCode, setDeletingFreightCode] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; type: 'error' | 'success' | 'info' }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  // Helper to retrieve all Freight-In codes used in a purchase order
  const getPoFreightCodes = (po: any): string[] => {
    if (!po) return [];
    const codesSet = new Set<string>();
    if (po.kodeEkspedisi && po.kodeEkspedisi.trim()) {
      codesSet.add(po.kodeEkspedisi.trim().toUpperCase());
    }
    if (po.receipts && Array.isArray(po.receipts)) {
      po.receipts.forEach((r: any) => {
        if (r.kodeEkspedisi && r.kodeEkspedisi.trim()) {
          codesSet.add(r.kodeEkspedisi.trim().toUpperCase());
        } else if (r.notes) {
          const matchFreight = r.notes.match(/Freight-in:\s*([^\s\]\n]+)/i);
          if (matchFreight && matchFreight[1]) codesSet.add(matchFreight[1].toUpperCase());
          const matchResi = r.notes.match(/Resi:\s*([^\s\]\n]+)/i);
          if (matchResi && matchResi[1]) codesSet.add(matchResi[1].toUpperCase());
          const matchKode = r.notes.match(/\[Kode\s+Freight-in:\s*([^\]\n]+)\]/i);
          if (matchKode && matchKode[1]) codesSet.add(matchKode[1].toUpperCase());
          const matchKodeOld = r.notes.match(/\[Kode\s+Ekspedisi:\s*([^\]\n]+)\]/i);
          if (matchKodeOld && matchKodeOld[1]) codesSet.add(matchKodeOld[1].toUpperCase());
        }
      });
    }
    return Array.from(codesSet).filter(Boolean);
  };

  // Helper to calculate PO items qty received under a specific freight code
  const getPoTotalItemsReceivedForFreight = (po: any, freightCode: string): number => {
    if (!po || !freightCode) return 0;
    const cleanCode = freightCode.trim().toUpperCase();
    
    let total = 0;
    let hasReceiptWithThisFreight = false;

    if (po.receipts && Array.isArray(po.receipts)) {
      po.receipts.forEach((r: any) => {
        let matches = false;
        if (r.kodeEkspedisi && r.kodeEkspedisi.trim().toUpperCase() === cleanCode) {
          matches = true;
        } else if (r.notes) {
          const matchFreight = r.notes.match(/Freight-in:\s*([^\s\]\n]+)/i);
          if (matchFreight && matchFreight[1]?.toUpperCase() === cleanCode) matches = true;
          const matchResi = r.notes.match(/Resi:\s*([^\s\]\n]+)/i);
          if (matchResi && matchResi[1]?.toUpperCase() === cleanCode) matches = true;
          const matchKode = r.notes.match(/\[Kode\s+Freight-in:\s*([^\]\n]+)\]/i);
          if (matchKode && matchKode[1]?.toUpperCase() === cleanCode) matches = true;
          const matchKodeOld = r.notes.match(/\[Kode\s+Ekspedisi:\s*([^\]\n]+)\]/i);
          if (matchKodeOld && matchKodeOld[1]?.toUpperCase() === cleanCode) matches = true;
        }

        if (matches) {
          hasReceiptWithThisFreight = true;
          if (r.items && Array.isArray(r.items)) {
            r.items.forEach((it: any) => {
              total += (it.qtyReceived || 0);
            });
          } else {
            total += (r.receivedQty || 0);
          }
        }
      });
    }

    // If no specific receipt was found with this freight, but the overall PO is linked to this freight
    if (!hasReceiptWithThisFreight) {
      const overallCode = (po.kodeEkspedisi || '').trim().toUpperCase();
      if (overallCode === cleanCode) {
        if (po.items && po.items.length > 0) {
          po.items.forEach((item: any) => {
            total += (item.qtyReceived || 0);
          });
        } else {
          total += (po.qtyReceived || 0);
        }
      }
    }

    return total;
  };

  // Re-fetch helper to retrieve current Freight-in value from purchase order (fallback)
  const getKodeFreightIn = (po: any): string => {
    if (po && typeof po.kodeEkspedisi === 'string') {
      return po.kodeEkspedisi.toUpperCase();
    }
    if (!po || !po.receipts || po.receipts.length === 0) return '';
    const withField = po.receipts.find((r: any) => r.kodeEkspedisi);
    if (withField && withField.kodeEkspedisi) {
      return withField.kodeEkspedisi;
    }
    for (const r of po.receipts) {
      if (r.notes) {
        const matchFreight = r.notes.match(/Freight-in:\s*([^\s\]\n]+)/i);
        if (matchFreight && matchFreight[1]) return matchFreight[1].toUpperCase();
        const matchResi = r.notes.match(/Resi:\s*([^\s\]\n]+)/i);
        if (matchResi && matchResi[1]) return matchResi[1].toUpperCase();
        const matchKode = r.notes.match(/\[Kode\s+Freight-in:\s*([^\]\n]+)\]/i);
        if (matchKode && matchKode[1]) return matchKode[1].toUpperCase();
        const matchKodeOld = r.notes.match(/\[Kode\s+Ekspedisi:\s*([^\]\n]+)\]/i);
        if (matchKodeOld && matchKodeOld[1]) return matchKodeOld[1].toUpperCase();
      }
    }
    return '';
  };

  const getFreightStatus = (freightCode: string): 'Terpakai' | 'Pending' => {
    if (!freightCode) return 'Pending';
    const cleanCode = freightCode.trim().toUpperCase();
    
    const linkedPos = purchaseOrders.filter(p => {
      const codes = getPoFreightCodes(p);
      return codes.includes(cleanCode);
    });

    const jumlahPaketLinked = linkedPos.length;
    let jumlahBarang = 0;
    linkedPos.forEach(po => {
      jumlahBarang += getPoTotalItemsReceivedForFreight(po, cleanCode);
    });

    if (jumlahPaketLinked > 0 || jumlahBarang > 0) {
      return 'Terpakai';
    }
    return 'Pending';
  };

  // 1. Initial Listeners
  useEffect(() => {
    const loadData = async () => {
      try {
        const [freightSnap, journalSnap, poSnap, coaSnap] = await Promise.all([
          getDocs(collection(db, 'freightIn')),
          getDocs(collection(db, 'journalEntries')),
          getDocs(collection(db, 'purchaseOrders')),
          getDocs(collection(db, 'coa'))
        ]);
        
        // Freight In
        const list = [];
        freightSnap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const dateA = a.date?.seconds || 0;
          const dateB = b.date?.seconds || 0;
          return dateB - dateA;
        });
        setFreightList(list);

        // Journal Entries
        const jList = [];
        journalSnap.forEach(d => jList.push({ id: d.id, ...d.data() }));
        setJournalEntries(jList);

        // Purchase Orders
        const poList = [];
        poSnap.forEach((d) => poList.push({ id: d.id, ...d.data() }));
        setPurchaseOrders(sanitizePurchaseOrders(poList));
        
        // COA
        const cList = [];
        coaSnap.forEach((d) => cList.push({ id: d.id, ...d.data() }));
        // setAccounts(cList);
        setLoading(false);
      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
           console.warn('Quota exceeded while fetching FreightInTab data');
        } else {
           console.error('Error fetching data for FreightInTab:', err);
        }
      }
    };
    loadData();
  }, []);

  // Listen for search filter from Journal Tab and dismiss copy toast
  useEffect(() => {
    const filter = localStorage.getItem('search_freight_filter');
    if (filter && freightList.length > 0) {
      setSearchQuery(filter);
      setExpandedRows(prev => ({ ...prev, [filter]: true }));
      localStorage.removeItem('search_freight_filter');
    }
  }, [freightList]);

  useEffect(() => {
    if (showCopyToast) {
      const timer = setTimeout(() => setShowCopyToast(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showCopyToast]);

  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // 2. Action: Create manual Freight In record with journal entries auto-generation
  const handleCreateFreightIn = async (e: React.FormEvent) => {
    e.preventDefault();
    let codeToUse = newFreightCode.trim().toUpperCase();
    if (!codeToUse) {
      setAlertState({
        isOpen: true,
        title: 'Input Tidak Valid',
        message: 'Nomor Freight-In wajib diisi!',
        type: 'error'
      });
      return;
    }

    const kgNum = parseFloat(cleanCommas(newTotalKg));
    const costNum = parseFloat(cleanCommas(newTotalCost));

    if (isNaN(kgNum) || kgNum <= 0) {
      setAlertState({
        isOpen: true,
        title: 'Input Tidak Valid',
        message: 'Masukkan berat valid dalam Kg (> 0)!',
        type: 'error'
      });
      return;
    }
    if (isNaN(costNum) || costNum < 0) {
      setAlertState({
        isOpen: true,
        title: 'Input Tidak Valid',
        message: 'Masukkan total biaya valid (>= 0)!',
        type: 'error'
      });
      return;
    }

    setIsSavingFreight(true);
    try {
      let exchangeRate = FALLBACK_NTD_PER_IDR;
      try {
        const stored = localStorage.getItem('last_fetched_rates');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed.IDR === 'number') {
            exchangeRate = parsed.IDR;
          }
        }
      } catch (e) {
        console.error("Failed to parse last_fetched_rates for Freight-In:", e);
      }

      const ratePerKg = kgNum > 0 ? costNum / kgNum : 0;
      const selectedDateObj = newFreightDate ? new Date(`${newFreightDate}T12:00:00`) : new Date();
      const yy = String(selectedDateObj.getFullYear()).slice(-2);
      const mm = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(selectedDateObj.getDate()).padStart(2, '0');
      const dateStrYYMMDD = `${yy}${mm}${dd}`;
      const journalDateTimestamp = Timestamp.fromDate(selectedDateObj);

      // Helper to parse date
      const parseCreatedAtHelper = (createdAt: any): Date | null => {
        if (!createdAt) return null;
        if (typeof createdAt.toDate === 'function') return createdAt.toDate();
        if (typeof createdAt.seconds === 'number') return new Date(createdAt.seconds * 1000);
        if (createdAt instanceof Date) return createdAt;
        if (typeof createdAt === 'string') {
          const d = new Date(createdAt);
          if (!isNaN(d.getTime())) return d;
        }
        if (typeof createdAt === 'number') {
          const d = new Date(createdAt);
          if (!isNaN(d.getTime())) return d;
        }
        return null;
      };

      const formatDateToYYMMDDHelper = (date: Date): string => {
        const yy = String(date.getFullYear()).slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yy}${mm}${dd}`;
      };

      const sameDayCount = freightList.filter(f => {
        const d = parseCreatedAtHelper(f.createdAt);
        return d && formatDateToYYMMDDHelper(d) === dateStrYYMMDD;
      }).length;

      const nextSeq = sameDayCount + 1;
      const newDocNo = `FI${dateStrYYMMDD}${String(nextSeq).padStart(2, '0')}`;

      const totalHargaPengiriman = costNum;
      const totalHargaPengirimanNTD = costNum * exchangeRate;
      
      const amountNTDCents = Math.round(totalHargaPengirimanNTD * 100);
      const amountIDR = Math.round(totalHargaPengiriman);

      // Nomor jurnal HARUS lewat generator bersama: ia menaikkan penghitung
      // counters/JURNAL_YYMMDD di dalam transaksi, jadi formatnya dijamin
      // JU+YYMMDD+4 digit dan aman dari dua user yang menyimpan bersamaan.
      // Versi lama menebak nomor urut dengan memindai state React lalu memakai
      // padStart(2) - itu sumber ID pendek seperti JU26080701 sekaligus penyebab
      // error "Nomor Jurnal sudah terpakai" yang membuat freight gagal dijurnalkan.
      const journalId = await getNextJournalId(selectedDateObj.toISOString());

      const freightRef = doc(db, 'freightIn', codeToUse);
      const journalRef = doc(db, 'journalEntries', journalId);

      await runTransaction(db, async (transaction) => {
        const existingFreightSnap = await transaction.get(freightRef);
        if (existingFreightSnap.exists()) {
          throw new Error(`Kode Freight-In "${codeToUse}" sudah terdaftar!`);
        }

        const existingJournalSnap = await transaction.get(journalRef);
        if (existingJournalSnap.exists()) {
          throw new Error(`Nomor jurnal ${journalId} ternyata sudah dipakai. Ini tidak seharusnya terjadi karena nomor diambil dari penghitung bersama - coba simpan ulang, dan laporkan kalau berulang.`);
        }

        // WRITE PHASE
        transaction.set(freightRef, {
          id: codeToUse,
          freightCode: codeToUse,
          ratePerKg: ratePerKg,
          totalKg: kgNum,
          exchangeRate: exchangeRate,
          docNo: newDocNo,
          createdAt: journalDateTimestamp,
          status: 'sudah_dijurnal',
          totalHargaPengiriman: totalHargaPengiriman,
          totalHargaPengirimanNTD: totalHargaPengirimanNTD,
          sudahDijurnal: true,
          journalId: journalId
        });

        transaction.set(journalRef, {
          id: journalId,
          date: journalDateTimestamp,
          description: `${newDocNo} - Pembayaran Freight-in`,
          refType: 'System',
          refId: codeToUse,
          freightCode: codeToUse,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: 'Freight-in Dalam Kapitalisasi',
              accountCode: '1120',
              debit: amountNTDCents,
              credit: 0,
              originalCurrency: 'IDR',
              originalDebitIDR: amountIDR,
              originalCreditIDR: 0
            },
            {
              account: 'Cash Rupiah',
              accountCode: '1102',
              debit: 0,
              credit: amountNTDCents,
              originalCurrency: 'IDR',
              originalDebitIDR: 0,
              originalCreditIDR: amountIDR
            }
          ]
        });
      });

      // Clear state and close modal
      setNewFreightCode('');
      setNewFreightDate(getTodayDateString());
      setNewTotalKg('');
      setNewTotalCost('');
      setIsAddFreightOpen(false);
      
      setSuccessToast(`Freight-In & Auto-Jurnal ${newDocNo} berhasil dibuat!`);
    } catch (err: any) {
      setAlertState({
        isOpen: true,
        title: 'Gagal Membuat',
        message: 'Gagal membuat Freight-In: ' + err.message,
        type: 'error'
      });
    } finally {
      setIsSavingFreight(false);
    }
  };

  const handleOpenEditModal = (rec: FreightInRecord) => {
    setEditingFreight(rec);
    setEditFreightDate(parseToDateString(rec.createdAt));
    setEditFreightCode(rec.freightCode);
    setEditTotalKg(rec.totalKg ? String(rec.totalKg) : '');
    const cost = rec.totalHargaPengiriman 
      ? rec.totalHargaPengiriman 
      : (rec.ratePerKg && rec.totalKg ? Math.round(rec.ratePerKg * rec.totalKg) : 0);
    setEditTotalCost(cost ? formatInputWithCommas(String(cost)) : '');
    setIsEditFreightOpen(true);
  };

  const handleSaveEditFreight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFreight) return;

    const codeToUse = editFreightCode.trim().toUpperCase();
    if (!codeToUse) {
      setAlertState({
        isOpen: true,
        title: 'Input Tidak Valid',
        message: 'Nomor Freight-In wajib diisi!',
        type: 'error'
      });
      return;
    }

    const kgNum = parseFloat(cleanCommas(editTotalKg));
    const costNum = parseFloat(cleanCommas(editTotalCost));

    if (isNaN(kgNum) || kgNum <= 0) {
      setAlertState({
        isOpen: true,
        title: 'Input Tidak Valid',
        message: 'Masukkan berat valid dalam Kg (> 0)!',
        type: 'error'
      });
      return;
    }
    if (isNaN(costNum) || costNum < 0) {
      setAlertState({
        isOpen: true,
        title: 'Input Tidak Valid',
        message: 'Masukkan total biaya valid (>= 0)!',
        type: 'error'
      });
      return;
    }

    setIsSavingFreight(true);
    try {
      const ratePerKg = kgNum > 0 ? costNum / kgNum : 0;
      const selectedDateObj = editFreightDate ? new Date(`${editFreightDate}T12:00:00`) : new Date();
      const journalDateTimestamp = Timestamp.fromDate(selectedDateObj);

      let exchangeRate = editingFreight.exchangeRate || FALLBACK_NTD_PER_IDR;
      const totalHargaPengiriman = costNum;
      const totalHargaPengirimanNTD = costNum * exchangeRate;
      const amountNTDCents = Math.round(totalHargaPengirimanNTD * 100);
      const amountIDR = Math.round(totalHargaPengiriman);

      const oldFreightCode = editingFreight.freightCode;
      const oldDocId = editingFreight.id;
      const isCodeChanged = oldFreightCode !== codeToUse || oldDocId !== codeToUse;

      const oldFreightDocRef = doc(db, 'freightIn', oldDocId);
      const newFreightDocRef = isCodeChanged ? doc(db, 'freightIn', codeToUse) : oldFreightDocRef;

      // Find Payment Journal
      const paymentJournalId = editingFreight.journalId || journalEntries.find(j => 
        (j.freightCode === oldFreightCode || j.refId === oldFreightCode) && 
        (j.description || '').toLowerCase().includes('pembayaran')
      )?.id;

      // Find Capitalization Journal
      const capitalizationJournalId = editingFreight.capitalizationJournalId || journalEntries.find(j => 
        (j.freightCode === oldFreightCode || j.refId === oldFreightCode) && 
        (j.description || '').toLowerCase().includes('kapitalisasi')
      )?.id;

      // Other journals referencing oldFreightCode
      const otherMatchingJournals = isCodeChanged ? journalEntries.filter(j => 
        (j.freightCode === oldFreightCode || j.refId === oldFreightCode) &&
        j.id !== paymentJournalId &&
        j.id !== capitalizationJournalId
      ) : [];

      await runTransaction(db, async (transaction) => {
        // READ PHASE (Must be strictly before any writes)
        if (isCodeChanged) {
          const newFreightSnap = await transaction.get(newFreightDocRef);
          if (newFreightSnap.exists()) {
            throw new Error(`Kode Freight-In "${codeToUse}" sudah terdaftar!`);
          }
        }

        const oldFreightSnap = await transaction.get(oldFreightDocRef);
        if (!oldFreightSnap.exists()) {
          throw new Error(`Dokumen Freight-In "${oldFreightCode}" tidak ditemukan!`);
        }
        const existingFreightData = oldFreightSnap.data() || {};

        let paymentJournalSnap = null;
        let paymentJournalRef = null;
        if (paymentJournalId) {
          paymentJournalRef = doc(db, 'journalEntries', paymentJournalId);
          paymentJournalSnap = await transaction.get(paymentJournalRef);
        }

        let capitalizationJournalSnap = null;
        let capitalizationJournalRef = null;
        if (capitalizationJournalId) {
          capitalizationJournalRef = doc(db, 'journalEntries', capitalizationJournalId);
          capitalizationJournalSnap = await transaction.get(capitalizationJournalRef);
        }

        // WRITE PHASE

        // 1. Update/Move freightIn document
        const updatedFreightPayload = {
          ...existingFreightData,
          id: codeToUse,
          freightCode: codeToUse,
          ratePerKg: ratePerKg,
          totalKg: kgNum,
          totalHargaPengiriman: totalHargaPengiriman,
          totalHargaPengirimanNTD: totalHargaPengirimanNTD,
          createdAt: journalDateTimestamp,
          journalId: paymentJournalId || existingFreightData.journalId || '',
          capitalizationJournalId: capitalizationJournalId || existingFreightData.capitalizationJournalId || ''
        };

        if (isCodeChanged) {
          transaction.set(newFreightDocRef, updatedFreightPayload);
          transaction.delete(oldFreightDocRef);
        } else {
          transaction.update(oldFreightDocRef, updatedFreightPayload);
        }

        // 2. Update linked POs if freightCode changed
        if (isCodeChanged) {
          const linkedPos = purchaseOrders.filter(p => {
            const pCodes = getPoFreightCodes(p);
            return pCodes.includes(oldFreightCode.toUpperCase());
          });
          linkedPos.forEach(po => {
            const poRef = doc(db, 'purchaseOrders', po.id);
            const oldCodes = getPoFreightCodes(po);
            const newCodes = oldCodes.map(c => c === oldFreightCode ? codeToUse : c);
            const updatedReceipts = (po.receipts || []).map((rx: any) => {
              if (rx.kodeEkspedisi && rx.kodeEkspedisi.toUpperCase().trim() === oldFreightCode) {
                return { ...rx, kodeEkspedisi: codeToUse };
              }
              return rx;
            });
            transaction.update(poRef, {
              kodeEkspedisi: newCodes[0] || codeToUse,
              freightCodes: newCodes,
              receipts: updatedReceipts
            });
          });
        }

        // 3. Update Payment Journal Entry
        if (paymentJournalSnap && paymentJournalSnap.exists() && paymentJournalRef) {
          const docNoDisplay = existingFreightData.docNo || editingFreight.docNo || 'FI';
          transaction.update(paymentJournalRef, {
            date: journalDateTimestamp,
            refId: codeToUse,
            freightCode: codeToUse,
            description: `${docNoDisplay} - Pembayaran Freight-in`,
            lines: [
              {
                account: 'Freight-in Dalam Kapitalisasi',
                accountCode: '1120',
                debit: amountNTDCents,
                credit: 0,
                originalCurrency: 'IDR',
                originalDebitIDR: amountIDR,
                originalCreditIDR: 0
              },
              {
                account: 'Cash Rupiah',
                accountCode: '1102',
                debit: 0,
                credit: amountNTDCents,
                originalCurrency: 'IDR',
                originalDebitIDR: 0,
                originalCreditIDR: amountIDR
              }
            ]
          });
        }

        // 4. Update Capitalization Journal Entry (if Freight-In is capitalized)
        if (capitalizationJournalSnap && capitalizationJournalSnap.exists() && capitalizationJournalRef) {
          transaction.update(capitalizationJournalRef, {
            date: journalDateTimestamp,
            refId: codeToUse,
            freightCode: codeToUse,
            description: `${codeToUse} - Kapitalisasi Freight-in`,
            lines: [
              {
                account: 'Inventory On Hand',
                accountCode: '1201',
                debit: amountNTDCents,
                credit: 0
              },
              {
                account: 'Freight-in Dalam Kapitalisasi',
                accountCode: '1120',
                debit: 0,
                credit: amountNTDCents
              }
            ]
          });
        }

        // 5. Update any other matching journal entries if freight code changed
        if (isCodeChanged && otherMatchingJournals.length > 0) {
          otherMatchingJournals.forEach(j => {
            const jRef = doc(db, 'journalEntries', j.id);
            const updatedDescription = j.description ? j.description.replace(new RegExp(oldFreightCode, 'g'), codeToUse) : j.description;
            transaction.update(jRef, {
              freightCode: codeToUse,
              refId: j.refId === oldFreightCode ? codeToUse : j.refId,
              description: updatedDescription
            });
          });
        }
      });

      setIsEditFreightOpen(false);
      setEditingFreight(null);
      setSuccessToast(`Freight-In "${codeToUse}" berhasil diperbarui!`);
    } catch (err: any) {
      setAlertState({
        isOpen: true,
        title: 'Gagal Memperbarui',
        message: 'Gagal memperbarui Freight-In: ' + err.message,
        type: 'error'
      });
    } finally {
      setIsSavingFreight(false);
    }
  };

  const getPoTotalItemsReceived = (po: any): number => {
    let count = 0;
    if (po.items && po.items.length > 0) {
      po.items.forEach((item: any) => {
        count += (item.qtyReceived || 0);
      });
    } else {
      count += (po.qtyReceived || 0);
    }
    return count;
  };

  const getPoFreightIDRValue = (po: any, targetFreightCode: string, isLinking: boolean) => {
    let freightCode = targetFreightCode;
    if (!isLinking) {
      freightCode = '';
    }

    if (!freightCode) return 0;

    const cleanCode = freightCode.trim().toUpperCase();
    const freightRec = freightList.find(f => f.freightCode?.toUpperCase() === cleanCode);
    if (!freightRec || freightRec.totalKg === undefined || freightRec.totalKg === null) {
      return 0;
    }

    let allLinkedPos = purchaseOrders.filter(p => {
      const pCodes = getPoFreightCodes(p);
      const contains = pCodes.includes(cleanCode);
      if (p.id === po.id) {
        return isLinking;
      }
      return contains;
    }).map(p => p.id === po.id ? po : p);

    let totalItems = 0;
    allLinkedPos.forEach(p => {
      totalItems += getPoTotalItemsReceivedForFreight(p, cleanCode);
    });

    if (totalItems === 0) return 0;

    const poItems = getPoTotalItemsReceivedForFreight(po, cleanCode);
    const totalShipPriceIDR = (freightRec.totalKg || 0) * (freightRec.ratePerKg || 0);
    return (poItems / totalItems) * totalShipPriceIDR;
  };

  // Action: Unlink single purchase order (Clear freight code link only)
  const executeUnlinkPo = async (poId: string, freightCode: string) => {
    try {
      const poRef = doc(db, 'purchaseOrders', poId);
      const poSnap = await getDoc(poRef);
      if (!poSnap.exists()) {
        throw new Error("Dokumen Purchase Order tidak ditemukan di database.");
      }
      const po = poSnap.data();

      const updatedReceipts = (po.receipts || []).map((r: any) => {
        const copy = { ...r };
        if (copy.kodeEkspedisi && copy.kodeEkspedisi.toUpperCase() === freightCode.toUpperCase()) {
          delete copy.kodeEkspedisi;
        }
        if (copy.notes) {
          const escapedCode = freightCode.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regexes = [
            new RegExp(`Freight-in:\\s*${escapedCode}`, 'gi'),
            new RegExp(`Resi:\\s*${escapedCode}`, 'gi'),
            new RegExp(`\\[Kode\\s+Freight-in:\\s*${escapedCode}\\]`, 'gi'),
            new RegExp(`\\[Kode\\s+Ekspedisi:\\s*${escapedCode}\\]`, 'gi'),
            new RegExp(`\\.?\\s*Freight-in:\\s*${escapedCode}`, 'gi'),
            new RegExp(`\\.?\\s*Resi:\\s*${escapedCode}`, 'gi')
          ];
          let notesStr = copy.notes;
          regexes.forEach((re) => {
            notesStr = notesStr.replace(re, '');
          });
          copy.notes = notesStr.trim();
        }
        return copy;
      });

      const batch = writeBatch(db);
      const updatedPo = {
        ...po,
        kodeEkspedisi: '',
        receipts: updatedReceipts
      };

      batch.update(poRef, {
        kodeEkspedisi: '',
        receipts: updatedReceipts,
        updatedAt: Timestamp.now()
      });

      // Regenerate receiving journals if status is received
      if (po.status === 'received') {
        const poCode = po.purchaseCode || po.id;
        generateReceivingJournals(updatedPo, poCode, 0, batch, 'received', undefined, journalEntries, purchaseOrders);
      }

      // Uncapitalize associated Freight-In record if it was capitalized
      const freightRef = doc(db, 'freightIn', freightCode);
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

      await batch.commit();

      setSuccessToast(`PO #${po.purchaseCode || poId} berhasil dilepas dari Freight-In!`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      console.error("Gagal membatalkan link PO:", err);
      setAlertState({
        isOpen: true,
        title: 'Error Melepas Link',
        message: "Gagal membatalkan link PO: " + err.message,
        type: 'error'
      });
    }
  };

  // 5. Action: Delete Freight-In Code and its manual journals
  const handleDeleteFreightCode = (freightCode: string) => {
    setDeletingFreightCode(freightCode);
  };

  const executeDeleteFreightCode = async (freightCode: string) => {
    try {
      const batch = writeBatch(db);
      const cleanCode = freightCode.toUpperCase().trim();
      const rec = freightList.find(f => f.freightCode?.toUpperCase() === cleanCode);

      batch.delete(doc(db, 'freightIn', cleanCode));
      batch.delete(doc(db, 'journalEntries', `JU-FR-${cleanCode}-payment`));
      batch.delete(doc(db, 'journalEntries', `JU-FR-${cleanCode}-capitalize`));

      if (rec && (rec as any).journalId) {
        batch.delete(doc(db, 'journalEntries', (rec as any).journalId));
      }

      if (rec && (rec as any).capitalizationJournalId) {
        batch.delete(doc(db, 'journalEntries', (rec as any).capitalizationJournalId));
      }

      await batch.commit();
      setDeletingFreightCode(null);
    } catch (err: any) {
      console.error("Gagal menghapus Nomor Freight-In: " + err.message);
    }
  };

  const handleCapitalizeFreightIn = async (rec: FreightInRecord) => {
    try {
      const totalNTD = rec.totalHargaPengirimanNTD || (rec.totalKg * (rec.ratePerKg || 0) * (rec.exchangeRate || FALLBACK_NTD_PER_IDR));
      if (totalNTD <= 0) {
        setAlertState({
          isOpen: true,
          title: 'Gagal Menjurnal',
          message: 'Total harga pengiriman NT$ harus lebih besar dari 0 untuk dikapitalisasi.',
          type: 'error'
        });
        return;
      }
      const amountNTDCents = Math.round(totalNTD * 100);

      // Kapitalisasi terjadi sekarang, jadi nomor jurnalnya memakai tanggal hari ini.
      // Lihat catatan di handleSaveFreightIn soal kenapa generator bersama ini wajib.
      const today = new Date();
      const journalId = await getNextJournalId(today.toISOString());

      const freightRef = doc(db, 'freightIn', rec.freightCode);
      const journalRef = doc(db, 'journalEntries', journalId);

      await runTransaction(db, async (transaction) => {
        const freightSnap = await transaction.get(freightRef);
        if (!freightSnap.exists()) {
          throw new Error('Dokumen Freight-In tidak ditemukan.');
        }

        const journalSnap = await transaction.get(journalRef);
        if (journalSnap.exists()) {
          throw new Error(`Nomor jurnal ${journalId} ternyata sudah dipakai. Ini tidak seharusnya terjadi karena nomor diambil dari penghitung bersama - coba kapitalisasi ulang, dan laporkan kalau berulang.`);
        }

        // WRITE PHASE
        transaction.update(freightRef, {
          isCapitalized: true,
          capitalizationJournalId: journalId
        });

        transaction.set(journalRef, {
          id: journalId,
          date: Timestamp.now(),
          description: `${rec.freightCode} - Kapitalisasi Freight-in`,
          refType: 'System',
          refId: rec.freightCode,
          freightCode: rec.freightCode,
          createdAt: Timestamp.now(),
          lines: [
            {
              account: 'Inventory On Hand',
              accountCode: '1201',
              debit: amountNTDCents,
              credit: 0
            },
            {
              account: 'Freight-in Dalam Kapitalisasi',
              accountCode: '1120',
              debit: 0,
              credit: amountNTDCents
            }
          ]
        });
      });

      setFreightList(prev => prev.map(f => 
        f.freightCode === rec.freightCode 
          ? { ...f, isCapitalized: true, capitalizationJournalId: journalId }
          : f
      ));

      setSuccessToast(`Berhasil menjurnal kapitalisasi Freight-In ${rec.freightCode}!`);
    } catch (err: any) {
      setAlertState({
        isOpen: true,
        title: 'Gagal Menjurnal',
        message: 'Gagal melakukan jurnal kapitalisasi: ' + err.message,
        type: 'error'
      });
    }
  };

  const handleReverseCapitalizeFreightIn = async (rec: FreightInRecord) => {
    try {
      const journalId = (rec as any).capitalizationJournalId;
      if (!journalId) {
        setAlertState({
          isOpen: true,
          title: 'Gagal Revers',
          message: 'ID Jurnal Kapitalisasi tidak ditemukan pada dokumen Freight-In.',
          type: 'error'
        });
        return;
      }

      const freightRef = doc(db, 'freightIn', rec.freightCode);
      const journalRef = doc(db, 'journalEntries', journalId);

      await runTransaction(db, async (transaction) => {
        const freightSnap = await transaction.get(freightRef);
        if (!freightSnap.exists()) {
          throw new Error('Dokumen Freight-In tidak ditemukan.');
        }

        // WRITE PHASE
        transaction.update(freightRef, {
          isCapitalized: false,
          capitalizationJournalId: ''
        });

        transaction.delete(journalRef);
      });

      setFreightList(prev => prev.map(f => 
        f.freightCode === rec.freightCode 
          ? { ...f, isCapitalized: false, capitalizationJournalId: '' }
          : f
      ));

      setSuccessToast(`Berhasil merevers jurnal kapitalisasi ${rec.freightCode}!`);
    } catch (err: any) {
      setAlertState({
        isOpen: true,
        title: 'Gagal Revers',
        message: 'Gagal merevers jurnal: ' + err.message,
        type: 'error'
      });
    }
  };

  const toggleRowExpanded = (code: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-500 font-medium space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        <p className="text-sm">Memuat modul Freight In...</p>
      </div>
    );
  }

  const enrichedFreightList = getEnrichedFreightList(freightList);

  const filteredFreightList = enrichedFreightList.filter((f) =>
    (f.freightCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.docNo || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  filteredFreightList.sort((a, b) => {
    const getTime = (ca: any) => {
      if (!ca) return 0;
      if (typeof ca.toDate === 'function') return ca.toDate().getTime();
      if (typeof ca.seconds === 'number') return ca.seconds * 1000;
      if (ca instanceof Date) return ca.getTime();
      if (typeof ca === 'string' || typeof ca === 'number') {
        const d = new Date(ca);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      }
      return 0;
    };
    const timeA = getTime(a.createdAt);
    const timeB = getTime(b.createdAt);
    if (timeA !== timeB) return timeB - timeA;
    return b.freightCode.localeCompare(a.freightCode);
  });

  const freightPerPage = 50;
  const totalFreightPages = Math.ceil(filteredFreightList.length / freightPerPage) || 1;
  const currentFreightPage = Math.min(Math.max(1, freightPage), totalFreightPages);
  const paginatedFreightList = filteredFreightList.slice((currentFreightPage - 1) * freightPerPage, currentFreightPage * freightPerPage);

  return (
    <div className="space-y-6 select-text animate-fade-in" id="freight-in-root">
      
      {/* Title Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <Truck className="h-5 w-5 text-indigo-500" /> Freight In
          </h2>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsFreightScannerOpen(true)}
            className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 font-text font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 select-none cursor-pointer border border-neutral-200 dark:border-neutral-700 shadow-xs"
          >
            <QrCode className="h-4 w-4 text-orange-500" />
            <span>Scan Barcode / QR</span>
          </button>
          <button
            onClick={() => setIsAddFreightOpen(true)}
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-text font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition select-none cursor-pointer"
          >
            + Tambah Freight In
          </button>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl overflow-hidden shadow-sm">
        
        {/* Search bar inside table container */}
        {freightList.length > 0 && (
          <div className="p-5 border-b border-neutral-100 dark:border-neutral-850 bg-neutral-50/20 dark:bg-neutral-950/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                placeholder="Cari Nomor Freight-In..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                className="w-full pl-9 pr-4 py-2 border border-neutral-200 dark:border-neutral-750 bg-white dark:bg-neutral-900 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-250 focus:outline-none focus:ring-2 focus:ring-orange-500/20 placeholder-neutral-400 font-text uppercase"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 select-none">
                🔍
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-[10px] font-bold"
                >
                  Clear
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="text-[10px] uppercase font-black tracking-wider text-orange-500 bg-orange-500/5 px-2.5 py-1 rounded border border-orange-500/10">
                Menampilkan hasil untuk: "{searchQuery}"
              </span>
            )}
          </div>
        )}

        {freightList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-400 font-medium space-y-3.5 py-20">
            <HelpCircle className="h-10 w-10 text-neutral-300 stroke-1" />
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Belum Ada Histori Freight-In</div>
            <p className="text-[10.5px] text-neutral-450 max-w-xs leading-relaxed font-semibold">
              Belum ada pencatatan shipping logistik untuk cargo ini. Lakukan proses "Tambah Freight In" manual untuk memulai pendataan logistik.
            </p>
          </div>
        ) : filteredFreightList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-400 font-medium space-y-3.5 py-20">
            <HelpCircle className="h-10 w-10 text-neutral-300 stroke-1" />
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Tidak Ada Hasil Cocok</div>
            <p className="text-[10.5px] text-neutral-450 max-w-xs leading-relaxed font-semibold">
              Tidak menemukan Nomor Freight-In yang cocok dengan "{searchQuery}".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50/50 dark:bg-neutral-950/20 border-b border-neutral-150 dark:border-neutral-850 text-neutral-450 dark:text-neutral-400 font-black uppercase tracking-wider text-[10px] whitespace-nowrap">
                  <th className="py-4 px-5 w-8"></th>
                  <th className="py-4 px-3">NO. DOC</th>
                  <th className="py-4 px-3">Tanggal</th>
                  <th className="py-4 px-3">Nomor Freight-In</th>
                  <th className="py-4 px-3 text-center">Status</th>
                  <th className="py-4 px-3 text-right">Harga Per Kg (Auto)</th>
                  <th className="py-4 px-3 text-right">Total Kg</th>
                  <th className="py-4 px-3 text-right">Total Harga Pengiriman</th>
                  <th className="py-4 px-3 text-center">Jumlah Paket Linked</th>
                  <th className="py-4 px-3 text-center">Jumlah Barang</th>
                  <th className="py-4 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {paginatedFreightList.map((rec) => {
                  const isExpanded = !!expandedRows[rec.freightCode];
                  
                  // Read associated POs
                  const linkedPos = purchaseOrders.filter(p => {
                    const pCodes = getPoFreightCodes(p);
                    return pCodes.includes(rec.freightCode.toUpperCase());
                  });

                  const jumlahPaket = linkedPos.length;
                  
                  let jumlahBarang = 0;
                  linkedPos.forEach(po => {
                    jumlahBarang += getPoTotalItemsReceivedForFreight(po, rec.freightCode);
                  });

                  const totalShipPrice = rec.totalKg * rec.ratePerKg;
                  const isCompleted = false;

                  // Filter POs that are pending and not already linked to ANY freightCode
                  const availablePos = purchaseOrders.filter(p => {
                    const isPending = p.status === 'pending';
                    const pCodes = getPoFreightCodes(p);
                    return isPending && pCodes.length === 0;
                  });

                  return (
                    <React.Fragment key={rec.id}>
                      <tr 
                        onClick={() => toggleRowExpanded(rec.freightCode)}
                        className="hover:bg-neutral-50/50 dark:hover:bg-neutral-950/20 transition cursor-pointer select-none"
                      >
                        <td className="py-3.5 px-5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpanded(rec.freightCode);
                            }}
                            className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-indigo-500"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-3">
                          <span 
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await navigator.clipboard.writeText(rec.docNo);
                                setCopiedDocNo(rec.docNo);
                                setTimeout(() => setCopiedDocNo(null), 1000);
                              } catch (err) {
                                console.error("Failed to copy docNo: ", err);
                              }
                            }}
                            className="inline-block text-blue-600 dark:text-blue-400 font-extrabold hover:underline cursor-pointer text-center relative select-text"
                            title="Klik untuk menyalin"
                          >
                            {rec.docNo}
                            {copiedDocNo === rec.docNo && (
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white bg-neutral-900 dark:bg-neutral-850 rounded-md shadow-lg select-none pointer-events-none z-50 whitespace-nowrap border border-neutral-700/30">
                                copy!
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-numeric font-semibold text-neutral-600 dark:text-neutral-350 whitespace-nowrap">
                          {formatFreightDateDisplay(rec.createdAt)}
                        </td>
                        <td className="py-3.5 px-3">
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(rec.freightCode);
                              setShowCopyToast(true);
                            }}
                            title="Klik untuk menyalin"
                            className="inline-flex items-center gap-1 font-numeric font-black text-indigo-500 bg-indigo-500/5 px-2 py-1 rounded border border-indigo-500/10 hover:bg-indigo-500/15 cursor-pointer transition select-none active:scale-95 group"
                          >
                            {rec.freightCode}
                            <Copy className="h-3 w-3 opacity-60 group-hover:opacity-100 transition" />
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {getFreightStatus(rec.freightCode) === 'Terpakai' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-black tracking-wider text-green-600 bg-green-50 dark:bg-green-950/20 px-2 py-0.5 rounded-full border border-green-250 dark:border-green-800/30">
                              ● Terpakai
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-black tracking-wider text-amber-500 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded-full border border-amber-250 dark:border-amber-800/30">
                              ● Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-numeric font-bold text-neutral-600 dark:text-neutral-350">
                          {formatIDR(rec.ratePerKg)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-numeric font-extrabold text-neutral-800 dark:text-neutral-200">
                          {rec.totalKg} Kg
                        </td>
                        <td className="py-3.5 px-3 text-right font-numeric font-black text-rose-500">
                          {formatIDR(Math.round(totalShipPrice))}
                        </td>
                        <td className="py-3.5 px-3 text-center font-numeric font-medium text-neutral-500">
                          {jumlahPaket}
                        </td>
                        <td className="py-3.5 px-3 text-center font-numeric font-medium text-neutral-500">
                          {formatNumber(jumlahBarang)}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {/* Jurnalkan / Reverse Button */}
                            {getFreightStatus(rec.freightCode) === 'Terpakai' ? (
                              rec.isCapitalized ? (
                                <button
                                  onClick={() => handleReverseCapitalizeFreightIn(rec)}
                                  title="Batalkan Jurnal Kapitalisasi"
                                  className="inline-flex items-center justify-center p-2 border border-amber-300 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-950/20 text-amber-500 rounded-xl transition cursor-pointer"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleCapitalizeFreightIn(rec)}
                                  title="Jurnalkan Kapitalisasi"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-indigo-500 bg-indigo-50 hover:bg-indigo-500 hover:text-white dark:bg-indigo-950/20 dark:text-indigo-400 dark:hover:bg-indigo-900 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer"
                                >
                                  <Notebook className="h-3.5 w-3.5" />
                                  Jurnalkan
                                </button>
                              )
                            ) : (
                              <button
                                disabled
                                title="Hubungkan PO terlebih dahulu"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-neutral-200 dark:border-neutral-800 text-neutral-400 bg-neutral-50 dark:bg-neutral-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-not-allowed"
                              >
                                <Notebook className="h-3.5 w-3.5" />
                                Jurnalkan
                              </button>
                            )}

                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEditModal(rec)}
                              title="Edit Freight-In"
                              className="inline-flex items-center justify-center p-2 border border-neutral-250 dark:border-neutral-750 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-xl transition cursor-pointer"
                            >
                              <Edit className="h-4 w-4" />
                            </button>

                            {/* Delete Button */}
                            <button
                              disabled={jumlahPaket > 0}
                              onClick={() => handleDeleteFreightCode(rec.freightCode)}
                              title={jumlahPaket > 0 ? `Tidak bisa dihapus, masih ada ${jumlahPaket} paket terkait. Lepas dulu hubungannya.` : "Delete"}
                              className={`inline-flex items-center justify-center p-2 border rounded-xl transition ${
                                jumlahPaket > 0
                                  ? "border-neutral-200 dark:border-neutral-800 text-neutral-400 bg-neutral-50 dark:bg-neutral-900 cursor-not-allowed"
                                  : "border-rose-350 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-950/20 text-rose-500 cursor-pointer"
                              }`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable row detail container listing linked PO packages */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={11} className="bg-neutral-50/50 dark:bg-neutral-950/30 p-5 border-l-4 border-l-orange-500 animate-fade-in">
                            <div className="space-y-4 font-text">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-black text-neutral-450 tracking-wider">
                                  Daftar Paket Terkait ({linkedPos.length})
                                </span>
                              </div>

                              {linkedPos.length === 0 ? (
                                <p className="text-[11px] text-neutral-400 italic py-1">Tidak ada paket terhubung ke freight ini.</p>
                              ) : (
                                <div className="border border-neutral-200/60 dark:border-neutral-800/80 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-neutral-900/40">
                                  <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                      <tr className="bg-neutral-100/50 dark:bg-neutral-900/60 border-b text-neutral-450 dark:text-neutral-400 text-[9px] font-bold uppercase tracking-wider">
                                        <th className="py-2 px-4">Nomor PO</th>
                                        <th className="py-2 px-4">Supplier / Platform</th>
                                        <th className="py-2 px-4 text-center">Jumlah Barang Received</th>
                                        <th className="py-2 px-4 text-right">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                      {linkedPos.map((po) => {
                                        const itemsQtyReceived = getPoTotalItemsReceivedForFreight(po, rec.freightCode);

                                        return (
                                          <tr key={po.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-950/20 transition">
                                            <td className="py-2.5 px-4">
                                              <div className="font-numeric font-black text-neutral-700 dark:text-neutral-300">
                                                {po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '')}
                                              </div>
                                              {(po.supplierOrderNumber || po.supplierTrackingNumber) && (
                                                <div className="font-text text-[9px] text-neutral-400 mt-0.5">
                                                  {po.supplierOrderNumber && <span>Order: <span className="font-numeric font-bold text-indigo-600 dark:text-indigo-400">{po.supplierOrderNumber}</span></span>}
                                                  {po.supplierOrderNumber && po.supplierTrackingNumber && <span className="mx-0.5">;</span>}
                                                  {po.supplierTrackingNumber && <span>Resi: <span className="font-numeric font-bold text-orange-600 dark:text-orange-400">{po.supplierTrackingNumber}</span></span>}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-4 font-bold text-neutral-850 dark:text-neutral-200">
                                              {po.supplierName}
                                            </td>
                                            <td className="py-2.5 px-4 text-center font-numeric font-bold text-neutral-600 dark:text-neutral-350">
                                              {formatNumber(itemsQtyReceived)} items
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                              {!isCompleted && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setUnlinkingPo({
                                                      poId: po.id,
                                                      purchaseCode: po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '') || po.id,
                                                      freightCode: rec.freightCode
                                                    });
                                                  }}
                                                  className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 py-1 px-2 border border-neutral-150 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-850 transition cursor-pointer"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                  Remove Link
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalFreightPages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 pt-4 mt-6 font-text">
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
              Menampilkan <span className="font-bold text-neutral-800 dark:text-neutral-200">{((currentFreightPage - 1) * freightPerPage) + 1}</span> - <span className="font-bold text-neutral-800 dark:text-neutral-200">{Math.min(currentFreightPage * freightPerPage, filteredFreightList.length)}</span> dari <span className="font-bold text-neutral-800 dark:text-neutral-200">{filteredFreightList.length}</span> transaksi
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentFreightPage === 1}
                onClick={() => setFreightPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              
              {Array.from({ length: totalFreightPages }).map((_, i) => {
                const pageNum = i + 1;
                if (totalFreightPages > 5 && Math.abs(pageNum - currentFreightPage) > 1 && pageNum !== 1 && pageNum !== totalFreightPages) {
                  if (pageNum === 2 || pageNum === totalFreightPages - 1) {
                    return <span key={pageNum} className="text-xs text-neutral-400 px-1 select-none">...</span>;
                  }
                  return null;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setFreightPage(pageNum)}
                    className={`h-6 w-6 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                      currentFreightPage === pageNum
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                disabled={currentFreightPage === totalFreightPages}
                onClick={() => setFreightPage((p) => Math.min(totalFreightPages, p + 1))}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Create Freight In Modal */}
      {isAddFreightOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h4 className="text-sm font-black uppercase tracking-wider text-orange-600 font-text">
              Tambah Freight In Manual
            </h4>
            <form onSubmit={handleCreateFreightIn} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                  Tanggal *
                </label>
                <input
                  type="date"
                  required
                  value={newFreightDate}
                  onChange={(e) => setNewFreightDate(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                  Nomor Freight-In *
                </label>
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Ex: AX2607BTZXL"
                    value={newFreightCode}
                    onChange={(e) => setNewFreightCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => setIsFreightScannerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/20 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer select-none"
                    title="Scan Barcode / QR Code"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>Scan</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                    Berat Cargo (Kg) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 2"
                    value={newTotalKg}
                    onChange={(e) => setNewTotalKg(formatInputWithCommas(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                    Total Biaya (IDR) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 170,000"
                    value={newTotalCost}
                    onChange={(e) => setNewTotalCost(formatInputWithCommas(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  disabled={isSavingFreight}
                  onClick={() => {
                    setNewFreightCode('');
                    setNewFreightDate(getTodayDateString());
                    setNewTotalKg('');
                    setNewTotalCost('');
                    setIsAddFreightOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingFreight}
                  className="px-4 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-lg shadow-orange-500/10 transition disabled:opacity-50"
                >
                  {isSavingFreight ? 'Memproses...' : 'Simpan Freight-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Edit Freight-In Modal */}
      {isEditFreightOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200 font-text">
                Edit Freight-In
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsEditFreightOpen(false);
                  setEditingFreight(null);
                }}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditFreight} className="space-y-4 font-text">
              <div>
                <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                  Tanggal *
                </label>
                <input
                  type="date"
                  required
                  value={editFreightDate}
                  onChange={(e) => setEditFreightDate(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                  Nomor Freight-In *
                </label>
                <input
                  type="text"
                  required
                  value={editFreightCode}
                  onChange={(e) => setEditFreightCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                    Berat Cargo (KG) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 2"
                    value={editTotalKg}
                    onChange={(e) => setEditTotalKg(formatInputWithCommas(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-black text-neutral-400 mb-1">
                    Total Biaya (IDR) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 170,000"
                    value={editTotalCost}
                    onChange={(e) => setEditTotalCost(formatInputWithCommas(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-750 bg-transparent rounded-xl font-numeric text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-neutral-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  disabled={isSavingFreight}
                  onClick={() => {
                    setIsEditFreightOpen(false);
                    setEditingFreight(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingFreight}
                  className="px-4 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-lg shadow-orange-500/10 transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingFreight ? 'Memproses...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal for Delete Freight-In Code */}
      {deletingFreightCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h4 className="text-sm font-black uppercase tracking-wider text-rose-500 font-text">
              Konfirmasi Hapus
            </h4>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 font-semibold leading-relaxed">
              Hapus Nomor Freight-In <span className="font-numeric font-bold text-indigo-500 bg-indigo-500/5 px-1.5 py-0.5 rounded">{deletingFreightCode}</span> beserta jurnal terkait? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingFreightCode(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={() => executeDeleteFreightCode(deletingFreightCode)}
                className="px-4 py-2 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/10 transition"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instant copy toast */}
      {showCopyToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce text-xs font-text font-black uppercase tracking-wider border border-neutral-700/20">
          <Check className="h-4 w-4 text-green-500" />
          Copy!
        </div>
      )}

      {/* Success non-blocking toast */}
      {successToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-bounce text-xs font-text font-black uppercase tracking-wider border border-emerald-500/30">
          <Check className="h-4 w-4 text-emerald-500 animate-pulse" />
          <span>{successToast}</span>
        </div>
      )}



      {/* Custom Confirmation Modal for Unlinking PO */}
      {unlinkingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h4 className="text-sm font-black uppercase tracking-wider text-rose-500 font-text">
              Konfirmasi Lepas Hubungan PO
            </h4>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 font-semibold leading-relaxed">
              Apakah Anda yakin ingin melepas hubungan PO <span className="font-numeric font-bold text-indigo-500 bg-indigo-500/5 px-1.5 py-0.5 rounded">#{unlinkingPo.purchaseCode}</span> dari Freight-In <span className="font-numeric font-bold text-orange-500 bg-orange-500/5 px-1.5 py-0.5 rounded">{unlinkingPo.freightCode}</span>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setUnlinkingPo(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  executeUnlinkPo(unlinkingPo.poId, unlinkingPo.freightCode);
                  setUnlinkingPo(null);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/10 transition"
              >
                Ya, Lepas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal (replacing alert()) */}
      {alertState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h4 className={`text-sm font-black uppercase tracking-wider font-text ${
              alertState.type === 'error' ? 'text-rose-500' : 'text-emerald-600'
            }`}>
              {alertState.title}
            </h4>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 font-semibold leading-relaxed">
              {alertState.message}
            </p>
            <div className="flex items-center justify-end pt-1">
              <button
                onClick={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-lg transition cursor-pointer ${
                  alertState.type === 'error' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/10' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10'
                }`}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode & QR Code Camera Scanner Modal */}
      {isFreightScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-100 font-bold">
                <Camera className="h-5 w-5 text-orange-500" />
                <h3 className="text-base font-black tracking-tight font-text">Scan Barcode / QR Code Freight-In</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleFreightCameraFacingMode}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                  title="Balik Kamera Depan / Belakang"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-orange-500" />
                  <span className="hidden sm:inline">{freightCameraFacingMode === 'environment' ? 'Belakang' : 'Depan'}</span>
                </button>
                <button
                  type="button"
                  onClick={closeFreightScanner}
                  className="p-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed font-text">
              Arahkan kamera ke Barcode atau QR Code resi/pengiriman untuk membaca Nomor Freight-IN secara otomatis.
            </p>

            <div className="relative w-full rounded-2xl overflow-hidden bg-black min-h-[280px] flex items-center justify-center border border-neutral-800">
              <div id="freight-qr-reader" className={`w-full h-full ${freightCameraFacingMode === 'user' ? 'video-mirror-user' : 'video-mirror-environment'}`} />
              
              <div className="absolute top-2.5 right-2.5 z-20">
                <button
                  type="button"
                  onClick={toggleFreightCameraFacingMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-black/65 hover:bg-black/85 backdrop-blur-md text-white rounded-full text-xs font-medium border border-white/20 shadow-md transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
                  <span>Kamera {freightCameraFacingMode === 'environment' ? 'Belakang' : 'Depan'}</span>
                </button>
              </div>
              
              {scannerError && (
                <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-neutral-950/90 text-rose-400 font-medium text-xs space-y-2">
                  <span className="text-2xl">⚠️</span>
                  <p className="max-w-xs font-text">{scannerError}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-neutral-400 italic font-text">
                Mendukung Barcode 1D (Code 128, Code 39, EAN) & 2D QR Code.
              </span>
              <button
                type="button"
                onClick={closeFreightScanner}
                className="px-4 py-2 text-xs font-bold bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl transition cursor-pointer font-text"
              >
                Tutup Kamera
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
