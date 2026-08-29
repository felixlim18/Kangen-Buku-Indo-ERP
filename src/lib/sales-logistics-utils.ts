import { SalesOrder } from '../types';

export type DetectedLogisticsKey = '7-11' | 'FamilyMart' | 'OK Mart' | 'Shopee Express' | 'Post Office' | 'Unknown';

/**
 * Sanitize raw tracking number:
 * Removes all whitespace (spaces, tabs, newlines), dashes/hyphens (-), dots (.), and underscores (_)
 */
export const sanitizeResiNumber = (resiStr?: string | null): string => {
  if (!resiStr) return '';
  return resiStr.replace(/[\s\-_.\t\r\n]+/g, '').trim().toUpperCase();
};

/**
 * Detect logistics provider based on tracking number (resi) pattern.
 * Strictly limited to the 5 options in Data Master:
 * 1. 7-11 (7-Eleven)
 * 2. Shopee Express (SPX)
 * 3. FamilyMart
 * 4. OK Mart
 * 5. Post Office
 */
export const detectLogisticsFromResi = (resiStr?: string | null): DetectedLogisticsKey => {
  if (!resiStr) return 'Unknown';
  const clean = sanitizeResiNumber(resiStr);
  if (!clean) return 'Unknown';

  // 1. Shopee Express: Diawali "TW" diikuti digit angka atau diawali "SPX"
  if (/^TW\d{10,18}$/i.test(clean) || /^SPX[A-Z0-9]{8,20}$/i.test(clean)) {
    return 'Shopee Express';
  }

  // 2. Post Office: Tepat 14 digit angka murni tanpa huruf, atau diawali "PO" / "POST"
  if (/^\d{14}$/.test(clean) || /^POST?\d{8,16}$/i.test(clean)) {
    return 'Post Office';
  }

  // 3. 7-11 (7-Eleven): Tepat 12 karakter (1 huruf kapital diikuti 11 digit angka, contoh: E85208963980)
  if (/^[A-Z]\d{11}$/.test(clean)) {
    return '7-11';
  }

  // 4. FamilyMart: Tepat 11 digit angka murni tanpa huruf, atau diawali "FM"
  if (/^\d{11}$/.test(clean) || /^FM\d{9,11}$/i.test(clean)) {
    return 'FamilyMart';
  }

  // 5. OK Mart: Diawali "OK"
  if (/^OK[A-Z0-9]{6,16}$/i.test(clean)) {
    return 'OK Mart';
  }

  return 'Unknown';
};

/**
 * Resolve detected logistics name against Master Data Logistik (7-11, shopee express, familymart, ok mart, Post office)
 */
export const resolveLogisticsNameFromDataMaster = (
  detectedKey: DetectedLogisticsKey,
  availableLogistics?: Array<{ id?: string; name: string }>,
  fallbackCurrent: string = ''
): string => {
  if (detectedKey === 'Unknown') return fallbackCurrent;

  if (availableLogistics && availableLogistics.length > 0) {
    const found = availableLogistics.find((l) => {
      const name = (l.name || '').toLowerCase().trim();
      if (detectedKey === '7-11' && (name.includes('7-11') || name.includes('7-eleven') || name.includes('7 eleven') || name.includes('seven'))) {
        return true;
      }
      if (detectedKey === 'Shopee Express' && (name.includes('shopee') || name.includes('spx') || name.includes('xpress') || name.includes('express') || name.includes('蝦皮'))) {
        return true;
      }
      if (detectedKey === 'FamilyMart' && (name.includes('family') || name.includes('familymart') || name.includes('fami') || name.includes('全家'))) {
        return true;
      }
      if (detectedKey === 'OK Mart' && (name.includes('ok') || name.includes('ok mart') || name.includes('okmart') || name.includes('ok超商'))) {
        return true;
      }
      if (detectedKey === 'Post Office' && (name.includes('post') || name.includes('pos') || name.includes('kantor pos') || name.includes('chunghwa') || name.includes('郵局'))) {
        return true;
      }
      return name === detectedKey.toLowerCase();
    });

    if (found) return found.name;
  }

  return detectedKey;
};

/**
 * Get effective logistics name for a Sales Order:
 * - If order.pickupLogistics is already populated, returns it.
 * - Otherwise, if resi exists, automatically detects and resolves the courier name against Data Master.
 * - If no resi or unknown, returns fallback (empty string by default).
 */
export const getEffectiveOrderLogistics = (
  order: Partial<SalesOrder> | null | undefined,
  availableLogistics?: Array<{ id?: string; name: string }>,
  fallback: string = ''
): string => {
  if (!order) return fallback;

  // 1. Direct/Reseller often have explicit pickupLogistics
  if (order.pickupLogistics && order.pickupLogistics.trim()) {
    return order.pickupLogistics.trim();
  }

  // 2. Extract tracking number / resi
  const rawResi = order.shipment?.shippingNumber || (order as any)?.shippingNumber || '';
  const resi = sanitizeResiNumber(rawResi);
  if (!resi) return fallback;

  // 3. Auto-detect from resi
  const detectedKey = detectLogisticsFromResi(resi);
  if (detectedKey === 'Unknown') return fallback;

  return resolveLogisticsNameFromDataMaster(detectedKey, availableLogistics, fallback);
};
