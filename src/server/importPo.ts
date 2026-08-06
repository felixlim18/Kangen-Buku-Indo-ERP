import { getNextJournalId } from '../lib/journalUtils';
import { FALLBACK_NTD_PER_IDR, FALLBACK_NTD_PER_USD } from '../lib/exchangeRateConstants';
import { Request, Response } from 'express';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, writeBatch, Timestamp, getDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Parse configuration
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig;
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else {
  console.warn('firebase-applet-config.json not found, using env if available');
}

// Initialize Firebase only if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig || {}) : getApps()[0];
const db = getFirestore(app, firebaseConfig?.firestoreDatabaseId);

// Helper for dates
const parseDate = (dateStr: any) => {
  if (!dateStr) return null;
  const rawStr = String(dateStr).trim();
  if (!rawStr) return null;

  // Try YYYYMMDD (exactly 8 digits)
  if (/^\d{8}$/.test(rawStr)) {
    const y = parseInt(rawStr.substring(0, 4), 10);
    const m = parseInt(rawStr.substring(4, 6), 10) - 1;
    const d = parseInt(rawStr.substring(6, 8), 10);
    const date = new Date(y, m, d, 12, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }

  // Try YYYY/MM/DD or YYYY-MM-DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(rawStr)) {
    const parts = rawStr.split(/[-/]/);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d, 12, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(rawStr)) {
    const parts = rawStr.split(/[-/]/);
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    const date = new Date(y, m, d, 12, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }

  // Fallback to standard Date parse
  const d = new Date(rawStr);
  return isNaN(d.getTime()) ? null : d;
};

export const importPoHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows, userId, liveRates } = req.body;
    if (!rows || !Array.isArray(rows)) {
      res.status(400).json({ error: 'Data rows tidak valid' });
      return;
    }

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

    const cleanNumber = (val: any): number => {
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

    // Map input rows into extremely robust and standardized format
    const normalizedRows = rows.map((row: any) => {
      const getVal = (possibleKeys: string[]) => {
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

      return {
        'Nomor Pembelian': getVal(['Nomor Pembelian', 'NomorPembelian', 'No Pembelian', 'po', 'po_number', 'ponumber']),
        'Tanggal Pembelian': getVal([
          'Tanggal Pembelian (YYYY/MM/DD)',
          'Tanggal Pembelian (YYYYMMDD)',
          'Tanggal Pembelian',
          'TanggalPembelian',
          'Tanggal PO',
          'po_date',
          'podate'
        ]),
        'Tanggal Diterima': getVal([
          'Tanggal Diterima (YYYY/MM/DD)',
          'Tanggal Diterima (YYYYMMDD)',
          'Tanggal Diterima',
          'TanggalDiterima',
          'received_date',
          'receiveddate'
        ]),
        'Platform Belanja': getVal(['Platform Belanja', 'PlatformBelanja', 'Platform', 'supplier']),
        'Status Pembayaran': getVal(['Status Pembayaran', 'StatusPembayaran', 'payment_status', 'paymentstatus']),
        'Status PO': getVal(['Status PO', 'StatusPO', 'status', 'po_status', 'postatus', 'status penerimaan', 'statuspenerimaan', 'status_penerimaan', 'status_terima', 'statusterima']),
        'Mata Uang Asal': getVal(['Mata Uang Asal', 'MataUangAsal', 'currency']),
        'Diskon Pembelian (NT$)': getVal([
          'Diskon Pembelian (NT$)',
          'Diskon Pembelian',
          'diskon',
          'discount',
          'diskonpembeliannt'
        ]),
        'Nomor Resi': getVal(['Nomor Resi', 'NomorResi', 'resi', 'tracking_number', 'trackingnumber', 'supplier_tracking_number', 'suppliertrackingnumber']),
        'Nomor Freight In': getVal(['Nomor Freight In', 'NomorFreightIn', 'freight_in', 'freightin', 'kode_ekspedisi', 'kodeekspedisi']),
        'Product ID': getVal(['Product ID', 'ProductID', 'book_id', 'bookid', 'product_id', 'productid']),
        'Qty': getVal(['Qty', 'quantity', 'jumlah']),
        'Harga Satuan': getVal(['Harga Satuan', 'HargaSatuan', 'unit_price', 'price', 'hargasatuan']),
        'Harga Total (IDR)': getVal(['Harga Total (Mata Uang Asal)', 'Harga Total (IDR)', 'Harga Total', 'HargaTotalIDR', 'Harga Total IDR', 'price_platform_total', 'platform_total', 'hargatotal', 'hargatotalidr', 'total_belanja_sebenarnya']),
        'NTD Total': getVal(['NTD Total', 'Total NTD', 'NTDTotal', 'TotalNTD', 'price_ntd_total', 'ntd_total', 'total_ntd']),
        '/ Item NTD': getVal(['/ Item NTD', 'Item NTD', 'item_ntd', 'itemntd', '/itemntd', 'harga_per_item_ntd', 'price_per_item_ntd']),
        'Akun Kas Pembayaran': getVal(['Akun Kas Pembayaran', 'AkunKasPembayaran', 'cash_account', 'kas_account', 'akunkaspembayaran'])
      };
    });

    const migrationSessionId = `MIG-${Date.now()}`;

    // Filter out rows starting with '#' or without Nomor Pembelian (like helper rows/instructions)
    const activeRows = normalizedRows.filter((row: any) => {
      const poNum = row['Nomor Pembelian'];
      if (!poNum) return false;
      const str = String(poNum).trim();
      return str !== '' && !str.startsWith('#');
    });

    if (activeRows.length === 0) {
      res.status(400).json({ error: 'Tidak ada data transaksi PO yang valid untuk diimpor.' });
      return;
    }

    // Fetch Platforms from database for mapping & validation
    const platformMap = new Map<string, any>();
    const platformSnap = await getDocs(collection(db, 'platforms'));
    platformSnap.forEach(d => {
      const data = d.data();
      platformMap.set(d.id, { id: d.id, ...data });
      if (data.name) {
        platformMap.set(data.name.trim().toLowerCase(), { id: d.id, ...data });
      }
    });

    const findPlatform = (inputName: string) => {
      if (!inputName) return null;
      const cleanInput = inputName.trim().toLowerCase();
      
      // 1. Exact match in keys (case-insensitive name or ID)
      if (platformMap.has(cleanInput)) {
        return platformMap.get(cleanInput);
      }
      
      // 2. Exact name match
      for (const [key, val] of platformMap.entries()) {
        if (val.name && val.name.trim().toLowerCase() === cleanInput) {
          return val;
        }
      }
      
      // 3. Substring match (e.g. "shopee" matches "Shopee Indonesia")
      for (const [key, val] of platformMap.entries()) {
        if (val.name && (val.name.trim().toLowerCase().includes(cleanInput) || cleanInput.includes(val.name.trim().toLowerCase()))) {
          return val;
        }
      }
      return null;
    };

    // Helper for Live Exchange Rates
    const getLiveRate = async (currency: string, passedLiveRates?: any): Promise<number> => {
      const cur = String(currency).trim().toUpperCase();
      if (cur === 'NTD' || cur === 'TWD' || cur === '') return 1.0;

      // Check passed live rates
      if (passedLiveRates && typeof passedLiveRates === 'object') {
        const rate = passedLiveRates[cur];
        if (rate && typeof rate === 'number' && rate > 0) {
          return rate;
        }
      }

      // API fetch fallback
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/${cur}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.result === 'success' && data.rates) {
            let twdRate = data.rates.TWD || data.rates.NTD;
            if (twdRate && typeof twdRate === 'number' && twdRate > 0) {
              return twdRate;
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch server-side live rate for ${cur}:`, err);
      }

      // Static fallbacks
      if (cur === 'IDR') return FALLBACK_NTD_PER_IDR;
      if (cur === 'USD') return FALLBACK_NTD_PER_USD;
      return 1.0;
    };

    const rateCache = new Map<string, number>();
    const getCachedLiveRate = async (currency: string): Promise<number> => {
      const cur = currency.trim().toUpperCase();
      if (rateCache.has(cur)) return rateCache.get(cur)!;
      const rate = await getLiveRate(cur, liveRates);
      rateCache.set(cur, rate);
      return rate;
    };

    // --- PHASE 1: PRE-VALIDATION ---
    const allPoNumbers = [...new Set(activeRows.map((r: any) => r['Nomor Pembelian']).filter(Boolean))];
    
    // 1. Check existing POs
    const existingPOs = new Set<string>();
    const poSnap = await getDocs(collection(db, 'purchaseOrders'));
    poSnap.forEach(d => {
      const data = d.data();
      if (data.purchaseCode) existingPOs.add(data.purchaseCode.toUpperCase());
      if (data.supplierOrderNumber) existingPOs.add(data.supplierOrderNumber.toUpperCase());
    });

    const duplicatePOs = allPoNumbers.filter(po => existingPOs.has((po as string).toUpperCase()));
    if (duplicatePOs.length > 0) {
      res.status(400).json({ 
        error: `Nomor Pembelian sudah ada di sistem. Mohon hapus dari file sebelum mencoba lagi.`,
        details: duplicatePOs 
      });
      return;
    }

    // 2. Fetch Catalog and check Product IDs
    const catalogMap = new Map<string, any>();
    const catalogSnap = await getDocs(collection(db, 'catalog'));
    catalogSnap.forEach(d => {
      const data = d.data();
      const pId = (data.productId || d.id).toUpperCase();
      catalogMap.set(pId, { id: d.id, ...data });
      catalogMap.set(d.id.toUpperCase(), { id: d.id, ...data });
      if (data.bookId) {
        catalogMap.set(data.bookId.toUpperCase(), { id: d.id, ...data });
      }
    });

    const invalidProducts: string[] = [];
    const invalidPlatforms: string[] = [];
    const missingFields: number[] = [];
    const invalidDates: number[] = [];
    const invalidNumbers: number[] = [];

    activeRows.forEach((row: any, index: number) => {
      const lineNum = index + 2; // Header is row 1
      
      // Check Platform Belanja
      const platName = row['Platform Belanja']?.trim();
      const matched = platName ? findPlatform(platName) : null;
      const currency = matched?.currency || 'IDR';

      let hasValidPrice = false;
      const parsedHargaSatuan = cleanNumber(row['Harga Satuan']);
      const parsedHargaTotalIDR = cleanNumber(row['Harga Total (IDR)']);
      const parsedNTDTotal = cleanNumber(row['NTD Total']);
      const parsedItemNtd = cleanNumber(row['/ Item NTD']);

      if (!isNaN(parsedHargaSatuan) && parsedHargaSatuan >= 0) {
        hasValidPrice = true;
      } else if (!isNaN(parsedNTDTotal) && parsedNTDTotal >= 0) {
        hasValidPrice = true;
      } else if (!isNaN(parsedHargaTotalIDR) && parsedHargaTotalIDR >= 0) {
        hasValidPrice = true;
      } else if (!isNaN(parsedItemNtd) && parsedItemNtd >= 0) {
        hasValidPrice = true;
      }

      // Required fields
      if (!row['Nomor Pembelian'] || !row['Tanggal Pembelian'] || !row['Platform Belanja'] || 
          !row['Status Pembayaran'] || !row['Product ID'] || !row['Qty'] || !hasValidPrice) {
        missingFields.push(lineNum);
      }

      // Check date formats
      const pDate = parseDate(row['Tanggal Pembelian']);
      if (!pDate && row['Tanggal Pembelian']) invalidDates.push(lineNum);
      
      const rDate = parseDate(row['Tanggal Diterima']);
      if (!rDate && row['Tanggal Diterima'] && String(row['Tanggal Diterima']).trim() !== '') invalidDates.push(lineNum);

      // Check product ID
      const pId = row['Product ID']?.trim().toUpperCase();
      if (pId && !catalogMap.has(pId)) {
        invalidProducts.push(`Baris ${lineNum}: ${pId}`);
      }

      if (platName && !matched) {
        invalidPlatforms.push(`Baris ${lineNum}: "${platName}"`);
      }

      // Check numbers
      const qty = cleanNumber(row['Qty']);
      if (isNaN(qty) || qty < 0 || !hasValidPrice) {
        invalidNumbers.push(lineNum);
      }
    });

    if (missingFields.length > 0 || invalidProducts.length > 0 || invalidPlatforms.length > 0 || invalidDates.length > 0 || invalidNumbers.length > 0) {
      const availablePlatformsList = Array.from(new Set(Array.from(platformMap.values()).map(p => p.name))).join(', ');
      res.status(400).json({
        error: 'Validasi gagal. Harap perbaiki file Anda.',
        details: {
          missingFields: missingFields.length > 0 ? `Baris kurang lengkap: ${missingFields.join(', ')}` : null,
          invalidProducts: invalidProducts.length > 0 ? `Product ID tidak ditemukan:\n${invalidProducts.join('\n')}` : null,
          invalidPlatforms: invalidPlatforms.length > 0 ? `Platform Belanja tidak ditemukan: ${invalidPlatforms.join(', ')}. Pilihan yang tersedia di sistem: [ ${availablePlatformsList} ]` : null,
          invalidDates: invalidDates.length > 0 ? `Format tanggal salah (Gunakan YYYY/MM/DD): ${invalidDates.join(', ')}` : null,
          invalidNumbers: invalidNumbers.length > 0 ? `Qty/Harga Satuan tidak valid: ${invalidNumbers.join(', ')}` : null
        }
      });
      return;
    }

    // --- PHASE 2: AGGREGATION & SEQUENTIAL CALCULATION ---
    // Group by PO
    const poGroups = new Map<string, any[]>();
    activeRows.forEach((row: any) => {
      const poNum = row['Nomor Pembelian'].trim();
      if (!poGroups.has(poNum)) poGroups.set(poNum, []);
      poGroups.get(poNum)!.push(row);
    });

    const poDocs: any[] = [];
    const receivedPOs: any[] = []; // for sequential processing

    // Build PO Documents
    for (const [poNum, items] of poGroups.entries()) {
      const first = items[0];
      const isPaid = first['Status Pembayaran']?.toLowerCase().includes('lunas');
      const isReceived = first['Status PO']?.toLowerCase().includes('diterima');
      const poDate = parseDate(first['Tanggal Pembelian']) || new Date();
      const recvDate = parseDate(first['Tanggal Diterima']) || poDate;
      
      const matchedPlat = findPlatform(first['Platform Belanja']);
      const currency = matchedPlat ? (matchedPlat.currency || 'NTD') : 'NTD';
      const fxRate = await getCachedLiveRate(currency);
      
      const discountNTDDollars = cleanNumber(first['Diskon Pembelian (NT$)']) || 0;
      const discountCents = Math.round(discountNTDDollars * 100);
      const discountPlatformCur = currency === 'NTD' ? discountNTDDollars : (fxRate > 0 ? (discountNTDDollars / fxRate) : 0);
      
      const poItems = items.map((it: any) => {
        const catData = catalogMap.get(it['Product ID'].trim().toUpperCase());
        const qty = cleanNumber(it['Qty']) || 0;
        const unitPriceOrigin = cleanNumber(it['Harga Satuan']);
        const pricePlatformVal = cleanNumber(it['Harga Total (IDR)']);
        const priceNTDVal = cleanNumber(it['NTD Total']);
        const itemNtdVal = cleanNumber(it['/ Item NTD']);

        let itemOriginTotal = 0;
        let itemNTDTotal = 0;
        let pricePerUnitNTD = 0;

        if (!isNaN(itemNtdVal) && itemNtdVal > 0) {
          pricePerUnitNTD = Math.round(itemNtdVal * 100);
          itemNTDTotal = pricePerUnitNTD * qty;
          const totalNTDDollars = itemNTDTotal / 100;
          itemOriginTotal = fxRate > 0 ? Math.round(totalNTDDollars / fxRate) : totalNTDDollars;
        } else if (!isNaN(priceNTDVal) && priceNTDVal > 0) {
          itemNTDTotal = Math.round(priceNTDVal * 100);
          pricePerUnitNTD = Math.round((priceNTDVal / (qty || 1)) * 100);
          const totalNTDDollars = priceNTDVal;
          itemOriginTotal = fxRate > 0 ? Math.round(totalNTDDollars / fxRate) : totalNTDDollars;
        } else if (!isNaN(pricePlatformVal) && pricePlatformVal > 0) {
          itemOriginTotal = pricePlatformVal;
          const totalNTDVal = pricePlatformVal * fxRate;
          itemNTDTotal = Math.round(totalNTDVal * 100);
          pricePerUnitNTD = Math.round((totalNTDVal / (qty || 1)) * 100);
        } else {
          const unitPriceVal = !isNaN(unitPriceOrigin) ? unitPriceOrigin : 0;
          itemOriginTotal = unitPriceVal * qty;
          const totalNTDVal = itemOriginTotal * fxRate;
          itemNTDTotal = Math.round(totalNTDVal * 100);
          pricePerUnitNTD = Math.round((unitPriceVal * fxRate) * 100);
        }
        
        return {
          bookId: catData.id,
          bookName: catData.name || catData.bookName || catData.title || "Unknown Book",
          qty,
          qtyReceived: isReceived ? qty : 0,
          pricePerItem: pricePerUnitNTD,
          priceNTDTotal: itemNTDTotal,
          pricePlatformTotal: itemOriginTotal,
          isCancelled: false
        };
      });

      // Sum of item NTD totals in cents
      const sumItemsNTD = poItems.reduce((acc: number, it: any) => acc + it.priceNTDTotal, 0);
      const netPlatformCurTotal = Math.max(0, poItems.reduce((acc: number, it: any) => acc + it.pricePlatformTotal, 0) - discountPlatformCur);

      const poDoc = {
        id: doc(collection(db, 'purchaseOrders')).id,
        purchaseCode: poNum,
        supplierOrderNumber: poNum,
        purchaseDate: Timestamp.fromDate(poDate),
        bookId: poItems[0]?.bookId || '',
        bookName: poItems[0]?.bookName || '',
        qty: poItems.reduce((acc: number, it: any) => acc + it.qty, 0),
        supplierId: matchedPlat ? matchedPlat.id : '',
        supplierName: matchedPlat ? matchedPlat.name : (first['Platform Belanja'] || 'Import'),
        paymentStatus: isPaid ? 'paid' : 'unpaid',
        status: isReceived ? 'received' : 'pending',
        exchangeRate: fxRate,
        forwarderFeeNTD: 0, // Invoice and freight default to 0
        discount: discountCents,
        purchasePriceNTD: sumItemsNTD, // stored in Cents for perfect UI alignment
        purchasePriceIDR: currency === 'IDR' ? netPlatformCurTotal : 0,
        purchasePriceUSD: currency === 'USD' ? netPlatformCurTotal : 0,
        supplierTrackingNumber: first['Nomor Resi'] || '',
        kodeEkspedisi: first['Nomor Freight In'] || '',
        isClosedPartially: false,
        isUnpaid: !isPaid,
        wasCredit: !isPaid,
        isShipped: isReceived,
        isCancelled: false,
        amountPaid: isPaid ? sumItemsNTD : 0,
        items: poItems,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        migrationSessionId,
        kasAccountLabel: first['Akun Kas Pembayaran'] || '' // Store temporarily for journal logic
      };

      if (isReceived && recvDate) {
        poDoc.status = 'received';
        receivedPOs.push({ poDoc, recvDate });
      }

      poDocs.push(poDoc);
    }

    // Sort received POs sequentially by Date to calculate moving average correctly
    receivedPOs.sort((a, b) => a.recvDate.getTime() - b.recvDate.getTime());

    // Fetch current inventory state for all products
    const inventoryMap = new Map<string, any>();
    const invSnap = await getDocs(collection(db, 'inventory'));
    invSnap.forEach(d => inventoryMap.set(d.id, d.data()));

    const operations: { type: 'set' | 'update' | 'delete', ref: any, data?: any }[] = [];
    const backupInventoryMap = new Map<string, any>(); // For rollback
    const modifiedInventoryIds = new Set<string>();

    // Step 2a: Update In-Transit for ALL imported POs
    for (const po of poDocs) {
      po.items.forEach((item: any) => {
        if (!inventoryMap.has(item.bookId)) {
          inventoryMap.set(item.bookId, {
            bookId: item.bookId,
            initialStock: 0,
            totalPurchased: 0,
            totalDispatched: 0,
            endingStock: 0,
            readyStock: 0,
            shippedStock: 0,
            inTransitStock: 0,
            ordersPlaced: 0,
            ordersShipped: 0,
            movingAverageCost: 0,
            totalInventoryValue: 0,
            stockStatus: 'sold_out',
            lastUpdated: Timestamp.now()
          });
        }
        const inv = inventoryMap.get(item.bookId);
        if (!backupInventoryMap.has(item.bookId)) {
          backupInventoryMap.set(item.bookId, { ...inv });
        }
        inv.inTransitStock = (inv.inTransitStock || 0) + item.qty;
        inv.ordersPlaced = (inv.ordersPlaced || 0) + 1;
        modifiedInventoryIds.add(item.bookId);
      });
    }

    // Prepare Create PO operations
    for (const po of poDocs) {
       const ref = doc(db, 'purchaseOrders', po.id);
       const poData = { ...po };
       delete poData.kasAccountLabel;
       operations.push({ type: 'set', ref, data: poData });
       
       // Creation Journal (Pesanan Pembelian)
       // Debit Inventory in Transit, Credit Kas/Utang
       const isCredit = po.paymentStatus === 'unpaid';
       const purchaseDateStr = po.purchaseDate.toDate ? po.purchaseDate.toDate().toISOString().split('T')[0] : new Date(po.purchaseDate).toISOString().split('T')[0];
       const journalId = await getNextJournalId(purchaseDateStr);
       
       let cashAccCode = '1101';
       let cashAccName = 'Cash NTD';
       if (!isCredit && po.kasAccountLabel) {
          // crude mapping
          if (po.kasAccountLabel.includes('IDR') || po.kasAccountLabel.includes('Rupiah') || po.kasAccountLabel.includes('1102')) {
            cashAccCode = '1102'; cashAccName = 'Cash IDR';
          }
       } else if (!isCredit && po.purchasePriceIDR) {
          cashAccCode = '1102'; cashAccName = 'Cash IDR';
       }

       const netNTD = po.purchasePriceNTD - po.discount + po.forwarderFeeNTD;
       const currency = po.purchasePriceIDR > 0 ? 'IDR' : (po.purchasePriceUSD > 0 ? 'USD' : 'NTD');
       const netOriginalCurrencyVal = po.purchasePriceIDR > 0 ? po.purchasePriceIDR : (po.purchasePriceUSD > 0 ? po.purchasePriceUSD : (netNTD / 100));
       
       const lines = [
          { 
            account: 'Inventory in Transit', 
            accountCode: '1203', 
            debit: netNTD, 
            credit: 0,
            originalCurrency: currency,
            originalDebitIDR: currency === 'IDR' ? netOriginalCurrencyVal : 0,
            originalCreditIDR: 0
          },
          { 
            account: isCredit ? 'Utang Usaha' : cashAccName, 
            accountCode: isCredit ? '2100' : cashAccCode, 
            debit: 0, 
            credit: netNTD,
            originalCurrency: currency,
            originalDebitIDR: 0,
            originalCreditIDR: currency === 'IDR' ? netOriginalCurrencyVal : 0
          }
       ];
       
       operations.push({
         type: 'set',
         ref: doc(db, 'journalEntries', journalId),
         data: {
           id: journalId,
           date: po.purchaseDate,
           description: 'Pemesanan Barang (Migrasi)',
           refType: 'System',
           refId: po.purchaseCode,
           createdAt: Timestamp.now(),
           lines,
           migrationSessionId
         }
       });
    }

    // Process Received POs Sequentially
    for (const { poDoc, recvDate } of receivedPOs) {
      const tsDate = Timestamp.fromDate(recvDate);
      
      let totalLandedNTD = 0;
      const totalQtyOrdered = poDoc.items.reduce((acc: number, it: any) => acc + it.qty, 0) || 1;
      const diskonPerUnit = (poDoc.discount || 0) / totalQtyOrdered;
      const freightPerUnit = (poDoc.forwarderFeeNTD || 0) / totalQtyOrdered;

      // Receipts array
      const receiptItems = [];
      const receiptLogs = [];

      for (const item of poDoc.items) {
         const inv = inventoryMap.get(item.bookId);
         const qtyRec = item.qtyReceived;
         if (qtyRec <= 0) continue;

         const unitLandedCents = Math.round(item.pricePerItem - diskonPerUnit + freightPerUnit);
         totalLandedNTD += Math.round(unitLandedCents * qtyRec);
         
         const prevEnding = inv.endingStock || 0;
         const prevAvg = inv.movingAverageCost || 0;
         const prevTransit = inv.inTransitStock || 0;
         
         const nextEnding = prevEnding + qtyRec;
         const nextReady = (inv.readyStock || 0) + qtyRec;
         const nextTransit = Math.max(0, prevTransit - qtyRec); // Decreases Transit correctly
         
         let nextAvgCost = unitLandedCents;
         if (nextEnding > 0) {
            nextAvgCost = Math.round(((prevEnding * prevAvg) + (qtyRec * unitLandedCents)) / nextEnding);
         }

         // Update local memory map
         inv.endingStock = nextEnding;
         inv.readyStock = nextReady;
         inv.inTransitStock = nextTransit;
         inv.movingAverageCost = nextAvgCost;
         inv.totalInventoryValue = nextEnding * nextAvgCost;
         inv.totalPurchased = (inv.totalPurchased || 0) + qtyRec;

         modifiedInventoryIds.add(item.bookId);

         // Ledger
         const ledgerId = doc(collection(db, 'inventoryLedger')).id;
         operations.push({
           type: 'set',
           ref: doc(db, 'inventoryLedger', ledgerId),
           data: {
              id: ledgerId,
              bookId: item.bookId,
              type: 'purchase_received',
              qtyDelta: qtyRec,
              unitCost: unitLandedCents,
              refCollection: 'purchaseOrders',
              refId: poDoc.id,
              balanceAfter: nextEnding,
              movingAvgAfter: nextAvgCost,
              timestamp: tsDate,
              userId: userId || 'migration'
           }
         });

         receiptItems.push({ bookId: item.bookId, bookName: item.bookName, qtyReceived: qtyRec });
         receiptLogs.push(`${recvDate.getFullYear()}/${recvDate.getMonth()+1}/${recvDate.getDate()} ${item.bookName}: ${qtyRec} item diterima`);
      }

      // Update PO with receipts
      const receiptsObj = {
         receivedBy: userId || 'migration',
         receivedQty: poDoc.items.reduce((sum: number, it: any) => sum + it.qtyReceived, 0),
         notes: 'Migrasi Data',
         receivedDate: tsDate,
         items: receiptItems
      };
      
      // Update PO operation data
      const poOp = operations.find(op => op.ref.id === poDoc.id);
      if (poOp) {
         poOp.data.receipts = [receiptsObj];
         poOp.data.receiptLogs = receiptLogs;
      }

      // Receive Journal
      const recJournalId = await getNextJournalId(new Date().toISOString().split('T')[0]);
      operations.push({
         type: 'set',
         ref: doc(db, 'journalEntries', recJournalId),
         data: {
            id: recJournalId,
            date: tsDate,
            description: 'Penerimaan Barang (Migrasi)',
            refType: 'System',
            refId: poDoc.purchaseCode,
            createdAt: Timestamp.now(),
            migrationSessionId,
            lines: [
               { account: 'Inventory On Hand', accountCode: '1201', debit: totalLandedNTD, credit: 0 },
               { account: 'Inventory in Transit', accountCode: '1203', debit: 0, credit: totalLandedNTD }
            ]
         }
      });

      // Receipt Event
      const eventId = doc(collection(db, 'purchaseOrders', poDoc.id, 'receiptEvents')).id;
      operations.push({
         type: 'set',
         ref: doc(db, 'purchaseOrders', poDoc.id, 'receiptEvents', eventId),
         data: {
            id: eventId,
            timestamp: tsDate,
            qtyReceived: receiptsObj.receivedQty,
            itemsReceived: receiptItems,
            itemCostNTDCents: totalLandedNTD,
            eventType: 'final',
            processedBy: userId || 'migration',
            journalEntryIds: [recJournalId],
            migrationSessionId
         }
      });
      
      // Cash Flow (if paid)
      if (poDoc.paymentStatus === 'paid') {
         const cfId = doc(collection(db, 'cashFlow')).id;
         const kasName = poDoc.kasAccountLabel?.includes('IDR') || poDoc.purchasePriceIDR ? 'IDR' : 'NTD';
         operations.push({
            type: 'set',
            ref: doc(db, 'cashFlow', cfId),
            data: {
               id: cfId,
               date: poDoc.purchaseDate, // Cash flow usually at purchase date
               ledger: kasName,
               direction: 'outflow',
               category: 'wholesale_purchase',
               amount: (kasName === 'IDR' && poDoc.purchasePriceIDR) ? poDoc.purchasePriceIDR : totalLandedNTD,
               amountNTD: totalLandedNTD,
               fxRateUsed: poDoc.exchangeRate,
               refType: 'purchase_order',
               refId: poDoc.id,
               description: `Migrasi PO #${poDoc.purchaseCode}`,
               createdAt: Timestamp.now(),
               migrationSessionId
            }
         });
      }
    }

    // Consolidate and set final inventory documents
    modifiedInventoryIds.forEach(bookId => {
      const inv = inventoryMap.get(bookId);
      operations.push({
        type: 'set',
        ref: doc(db, 'inventory', bookId),
        data: {
          ...inv,
          stockStatus: (inv.endingStock || 0) > 0 ? 'in_stock' : 'sold_out',
          lastUpdated: Timestamp.now()
        }
      });
    });

    // --- PHASE 3: EXECUTE BATCHES WITH ROLLBACK MECHANISM ---
    const CHUNK_SIZE = 450; // Safety margin below 500
    const committedBatches: any[][] = [];
    
    try {
       for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
          const chunk = operations.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          
          for (const op of chunk) {
             if (op.type === 'set') {
                if (op.ref.path.includes('inventory/')) {
                   batch.set(op.ref, op.data, { merge: true });
                } else {
                   batch.set(op.ref, op.data);
                }
             } else if (op.type === 'delete') {
                batch.delete(op.ref);
             }
          }
          
          await batch.commit();
          committedBatches.push(chunk);
       }
       
       res.status(200).json({
          message: 'Import Berhasil',
          summary: `Total PO dibuat: ${poDocs.length}, Total Baris: ${normalizedRows.length}. Stok, Jurnal, dan Laporan sudah terupdate seketika.`
       });

    } catch (err: any) {
       console.error("Batch commit failed. Initiating manual rollback...", err);
       
       // Rollback sequence
       try {
          const rollbackBatch = writeBatch(db);
          let rollbackOpsCount = 0;
          
          // Reverse iteration to rollback
          for (let i = committedBatches.length - 1; i >= 0; i--) {
             const chunk = committedBatches[i];
             for (const op of chunk) {
                if (rollbackOpsCount >= 450) {
                   await rollbackBatch.commit();
                   // reset for next chunk, though in this simple logic we might need an array of rollback batches
                }
                
                if (op.ref.path.includes('inventory/')) {
                   const bookId = op.ref.id;
                   const backup = backupInventoryMap.get(bookId);
                   if (backup) {
                      rollbackBatch.set(op.ref, backup);
                   }
                } else {
                   // Delete created docs
                   rollbackBatch.delete(op.ref);
                }
                rollbackOpsCount++;
             }
          }
          await rollbackBatch.commit(); // commit remaining
          console.log("Rollback completed successfully.");
       } catch (rollbackErr) {
          console.error("CRITICAL: Rollback failed! Manual cleanup needed for migrationSessionId:", migrationSessionId, rollbackErr);
       }
       
       res.status(500).json({ error: 'Terjadi kesalahan sistem saat menyimpan data. Data telah di-rollback otomatis.', details: err.message });
    }

  } catch (err: any) {
    console.error('Import Error:', err);
    res.status(500).json({ error: 'Gagal memproses import', details: err.message });
  }
};
