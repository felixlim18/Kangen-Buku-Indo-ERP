import { SalesOrder } from '../types';

export type DetectedLogisticsKey = '7-Eleven' | 'Hi-Life' | 'FamilyMart' | 'Shopee Xpress' | 'Post Office' | 'Unknown';

/**
 * Detect logistics provider based on tracking number (resi) pattern
 */
export const detectLogisticsFromResi = (resiStr?: string | null): DetectedLogisticsKey => {
  if (!resiStr) return 'Unknown';
  // Strip all whitespace, spaces, tabs, dashes, hyphens, and underscores
  const clean = resiStr.replace(/[\s\-_]+/g, '').trim().toUpperCase();
  if (!clean) return 'Unknown';

  // 1. Shopee Xpress: Diawali "TW" diikuti 13-15 digit angka
  if (/^TW\d{13,15}$/i.test(clean)) {
    return 'Shopee Xpress';
  }

  // 2. Post Office: Tepat 14 digit angka murni tanpa huruf
  if (/^\d{14}$/.test(clean)) {
    return 'Post Office';
  }

  // 3. 7-Eleven: Tepat 12 karakter. Diawali 1 huruf kapital diikuti 11 digit angka
  if (/^[A-Z]\d{11}$/.test(clean)) {
    return '7-Eleven';
  }

  // 4. FamilyMart: Tepat 11 digit angka murni tanpa huruf
  if (/^\d{11}$/.test(clean)) {
    return 'FamilyMart';
  }

  // 5. Hi-Life: 11 atau 12 karakter alfanumerik dengan huruf kapital di tengah-tengah angka (bukan di awal & bukan di akhir)
  if (/^\d+[A-Z]+\d+$/.test(clean) && (clean.length === 11 || clean.length === 12)) {
    return 'Hi-Life';
  }

  return 'Unknown';
};

/**
 * Resolve detected logistics name against Master Data Logistik
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
      if (detectedKey === '7-Eleven' && (name.includes('7-11') || name.includes('7-eleven') || name.includes('7 eleven') || name.includes('seven'))) {
        return true;
      }
      if (detectedKey === 'FamilyMart' && (name.includes('family') || name.includes('familymart') || name.includes('fami') || name.includes('全家'))) {
        return true;
      }
      if (detectedKey === 'Hi-Life' && (name.includes('hi-life') || name.includes('hilife') || name.includes('hi life') || name.includes('萊爾富'))) {
        return true;
      }
      if (detectedKey === 'Shopee Xpress' && (name.includes('shopee') || name.includes('spx') || name.includes('xpress') || name.includes('express') || name.includes('蝦皮'))) {
        return true;
      }
      if (detectedKey === 'Post Office' && (name.includes('post') || name.includes('pos') || name.includes('kantor pos') || name.includes('chunghwa') || name.includes('郵局'))) {
        return true;
      }
      return name === detectedKey.toLowerCase();
    });

    if (found) return found.name;
  }

  // Map English key to Indonesian/Standard name if not matched in master
  if (detectedKey === 'Post Office') return 'Kantor Pos';
  return detectedKey;
};

/**
 * Get effective logistics name for a Sales Order:
 * - If order.pickupLogistics is already populated, returns it.
 * - Otherwise, if resi exists, automatically detects and resolves the courier name.
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
  const resi = (order.shipment?.shippingNumber || (order as any)?.shippingNumber || '').trim();
  if (!resi) return fallback;

  // 3. Auto-detect from resi
  const detectedKey = detectLogisticsFromResi(resi);
  if (detectedKey === 'Unknown') return fallback;

  return resolveLogisticsNameFromDataMaster(detectedKey, availableLogistics, fallback);
};
