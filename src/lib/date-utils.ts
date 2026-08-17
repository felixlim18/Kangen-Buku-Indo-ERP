/**
 * Date Utility Module for Kangen Buku Indo ERP
 * Standardizes date formatting to YYYY/MM/DD across all tabs, modals, popups, tables, and exports.
 */

/**
 * Safely parses any date value (Firebase Timestamp, Date object, string, number) to a JS Date object.
 */
export const parseToDate = (dateVal: any): Date | null => {
  if (dateVal === null || dateVal === undefined || dateVal === '') return null;
  
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }
  
  // Firebase Timestamp object with toDate() function
  if (typeof dateVal === 'object' && typeof dateVal.toDate === 'function') {
    const d = dateVal.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  
  // Firebase Timestamp object with seconds property
  if (typeof dateVal === 'object' && typeof dateVal.seconds === 'number') {
    const d = new Date(dateVal.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // Unix timestamp in milliseconds or seconds
  if (typeof dateVal === 'number') {
    // If seconds instead of milliseconds
    const ms = dateVal < 10000000000 ? dateVal * 1000 : dateVal;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // String format (e.g. YYYY-MM-DD, YYYY/MM/DD, ISO string)
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;
    
    // Check YYYY-MM-DD or YYYY/MM/DD format without time zone shift
    if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(trimmed)) {
      const parts = trimmed.split(/[-/]/);
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
};

/**
 * Formats a date value into YYYY/MM/DD format.
 * Returns defaultFallback (default '-') if invalid or empty.
 */
export const formatDate = (dateVal: any, fallback = '-'): string => {
  const d = parseToDate(dateVal);
  if (!d) return fallback;
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}/${month}/${day}`;
};

/**
 * Formats a date value into YYYY/MM/DD HH:mm format.
 * Returns defaultFallback (default '-') if invalid or empty.
 */
export const formatDateTime = (dateVal: any, fallback = '-'): string => {
  const d = parseToDate(dateVal);
  if (!d) return fallback;
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

/**
 * Formats a date value into ISO YYYY-MM-DD for HTML <input type="date"> binding.
 */
export const formatDateForInput = (dateVal: any): string => {
  const d = parseToDate(dateVal);
  if (!d) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Indonesian Month names array (0-indexed)
 */
export const MONTHS_INDO = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Formats a month and year into YYYY/MM or Month Year for headers where month name is appropriate.
 */
export const formatMonthYear = (dateVal: any): string => {
  const d = parseToDate(dateVal);
  if (!d) return '-';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
};
