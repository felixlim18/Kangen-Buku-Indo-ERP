import { collection, getDocs, doc, getDoc, setDoc, writeBatch, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { FALLBACK_IDR_PER_NTD } from './exchangeRateConstants';

import { formatDate } from './date-utils';

export interface PeriodClosing {
  id: string; // YYYY-MM
  period: string; // e.g. "Juni 2026"
  status: 'Terbuka' | 'Ditutup';
  totalEntries: number;
  closedAt?: any;
  closedBy?: string;
  fxJournalId?: string;
}

/**
 * Parses any date format (Timestamp, Date, String) into Date object
 */
export function parseToDate(dateInput: any): Date {
  if (!dateInput) return new Date();
  if (dateInput.seconds !== undefined) {
    return new Date(dateInput.seconds * 1000);
  }
  if (dateInput instanceof Date) {
    return dateInput;
  }
  return new Date(dateInput);
}

/**
 * Formats a month and year to Indonesian string (e.g. "Juni 2026")
 */
export function formatPeriodName(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
}

/**
 * Returns YYYY-MM string for a given date
 */
export function getYearMonth(dateInput: any): string {
  const dateObj = parseToDate(dateInput);
  if (isNaN(dateObj.getTime())) return '';
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/**
 * Checks if a given transaction date falls in a closed period
 */
export function isPeriodClosed(dateInput: any, closedPeriods: string[]): boolean {
  if (!dateInput) return false;
  const periodId = getYearMonth(dateInput);
  return closedPeriods.includes(periodId);
}

/**
 * Adjusts an auto-generated journal entry payload if the target period is closed
 */
export function adjustJournalPayloadIfPeriodClosed(payload: any, closedPeriods: string[]): any {
  if (!payload || !payload.date) return payload;
  const periodId = getYearMonth(payload.date);
  
  if (closedPeriods.includes(periodId)) {
    const originalDate = parseToDate(payload.date);
    const dateStr = formatDate(originalDate);
    
    // Modify description and post today (current open period)
    const adjustedDescription = `${payload.description || ''} (tertunda dari periode tertutup ${dateStr})`;
    return {
      ...payload,
      date: Timestamp.now(),
      description: adjustedDescription
    };
  }
  
  return payload;
}

/**
 * Kurs resmi bulanan (IDR per 1 NTD), disimpan di koleksi `fxRates` dengan doc id
 * "YYYY-MM". Kalau dokumen bulan berjalan sudah ada, dipakai langsung (tidak fetch API
 * lagi - rate konsisten sepanjang bulan, sesuai kebutuhan "auto-update bulanan").
 * Kalau belum ada, fetch live API lalu simpan sebagai kurs resmi bulan ini.
 * Kalau fetch gagal, pakai dokumen bulan terakhir yang tersedia (stale) sebagai
 * fallback, dan sebagai upaya terakhir pakai FALLBACK_IDR_PER_NTD.
 */
export async function fetchCurrentExchangeRate(): Promise<number> {
  const monthKey = getYearMonth(new Date());
  const monthDocRef = doc(db, 'fxRates', monthKey);

  try {
    const monthSnap = await getDoc(monthDocRef);
    if (monthSnap.exists()) {
      const rate = monthSnap.data().rateIdrPerNtd;
      if (typeof rate === 'number' && rate > 0) return rate;
    }
  } catch (err) {
    console.error('Failed to read cached monthly exchange rate:', err);
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/TWD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates.IDR === 'number') {
        const rate = data.rates.IDR;
        setDoc(monthDocRef, { rateIdrPerNtd: rate, updatedAt: Timestamp.now(), source: 'live' }).catch(err =>
          console.error('Failed to cache monthly exchange rate:', err)
        );
        return rate;
      }
    }
  } catch (err) {
    console.error('Failed to fetch exchange rate in period closing:', err);
  }

  try {
    const staleSnap = await getDocs(query(collection(db, 'fxRates'), orderBy('__name__', 'desc'), limit(1)));
    if (!staleSnap.empty) {
      const rate = staleSnap.docs[0].data().rateIdrPerNtd;
      if (typeof rate === 'number' && rate > 0) return rate;
    }
  } catch (err) {
    console.error('Failed to read stale fallback exchange rate:', err);
  }

  return FALLBACK_IDR_PER_NTD;
}

/**
 * Scan all journal entries up to the end of the period and calculate FX adjustments.
 * PeriodId: YYYY-MM
 */
export function calculateFxRevaluations(
  journalEntries: any[],
  latestExchangeRate: number,
  periodId: string
) {
  // 1. Filter entries up to the end of the period
  // We include any entries that fall in or before the closing month.
  // We EXCLUDE the current period's FX revaluation entry if it exists, to avoid circular calculations.
  const targetPeriodEndStr = `${periodId}-31T23:59:59.999Z`; // simple boundary for string comparisons or date parsing
  const targetYearMonthVal = periodId; // "YYYY-MM"
  
  const filteredEntries = journalEntries.filter(entry => {
    const entryPeriodId = getYearMonth(entry.date);
    // Include if entry's month/year is <= the target periodId
    if (entryPeriodId > targetYearMonthVal) return false;
    // Exclude the current month's FX entry
    if (entry.id === `JU-FX-${periodId}`) return false;
    return true;
  });

  // 2. Compute running NT$ book balance and underlying IDR balance per account
  const accountBalances: Record<string, {
    account: string;
    accountCode: string;
    totalNTDDebit: number;
    totalNTDCredit: number;
    totalNTDFromIDRDebit: number;
    totalNTDFromIDRCredit: number;
    totalIDRDebit: number;
    totalIDRCredit: number;
    hasIdrPostings: boolean;
  }> = {};

  filteredEntries.forEach(entry => {
    if (!entry.lines) return;
    entry.lines.forEach((line: any) => {
      const accName = line.account;
      if (!accountBalances[accName]) {
        accountBalances[accName] = {
          account: accName,
          accountCode: line.accountCode || '',
          totalNTDDebit: 0,
          totalNTDCredit: 0,
          totalNTDFromIDRDebit: 0,
          totalNTDFromIDRCredit: 0,
          totalIDRDebit: 0,
          totalIDRCredit: 0,
          hasIdrPostings: false
        };
      }
      
      const b = accountBalances[accName];
      b.totalNTDDebit += line.debit || 0;
      b.totalNTDCredit += line.credit || 0;
      
      if (line.originalCurrency === 'IDR') {
        b.hasIdrPostings = true;
        b.totalIDRDebit += line.originalDebitIDR || 0;
        b.totalIDRCredit += line.originalCreditIDR || 0;
        b.totalNTDFromIDRDebit += line.debit || 0;
        b.totalNTDFromIDRCredit += line.credit || 0;
      }
    });
  });

  // 3. For all in-scope accounts (has IDR postings), calculate FX adjustment
  const adjustments: {
    account: string;
    accountCode: string;
    currentNTDCents: number;
    netIDR: number;
    revaluedNTDCents: number;
    adjustmentCents: number;
  }[] = [];

  Object.values(accountBalances).forEach(b => {
    if (!b.hasIdrPostings) return;
    
    // Net Debit in NTD cents for the entire account
    const currentNTDCents = b.totalNTDDebit - b.totalNTDCredit;
    // Net Debit in NTD cents for the IDR portion
    const netNTDFromIDRCents = b.totalNTDFromIDRDebit - b.totalNTDFromIDRCredit;
    // Net Debit in IDR
    const netIDR = b.totalIDRDebit - b.totalIDRCredit;
    // Revalued IDR portion Net Debit in NTD cents
    const revaluedNTDFromIDRCents = Math.round((netIDR / latestExchangeRate) * 100);
    // Adjustment to apply to debit side (revalued IDR portion - historical recorded IDR portion)
    const adjustmentCents = revaluedNTDFromIDRCents - netNTDFromIDRCents;
    // New total balance for the entire account
    const revaluedNTDCents = currentNTDCents + adjustmentCents;
    
    if (adjustmentCents !== 0) {
      adjustments.push({
        account: b.account,
        accountCode: b.accountCode,
        currentNTDCents,
        netIDR,
        revaluedNTDCents,
        adjustmentCents
      });
    }
  });

  return adjustments;
}
