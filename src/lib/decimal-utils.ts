import { Decimal } from 'decimal.js';
import { CoaAccount, JournalEntry } from '../types';

// Configure decimal.js for safe financial math
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Grouping and parent checking helpers identical to JournalTab
export function isParentAccount(acc: CoaAccount, allAccs: CoaAccount[]): boolean {
  return allAccs.some(other => {
    if (!other.parentAccount) return false;
    const cleanParent = other.parentAccount.trim().toLowerCase();
    return (
      cleanParent === acc.name.trim().toLowerCase() ||
      cleanParent === `${acc.code} - ${acc.name}`.trim().toLowerCase() ||
      cleanParent === acc.id.trim().toLowerCase() ||
      cleanParent === acc.code.trim().toLowerCase()
    );
  });
}

export function findParentOf(acc: CoaAccount, allAccs: CoaAccount[]): CoaAccount | null {
  if (!acc.parentAccount) return null;
  const cleanParent = acc.parentAccount.trim().toLowerCase();
  return allAccs.find(p => 
    p.name.trim().toLowerCase() === cleanParent ||
    `${p.code} - ${p.name}`.trim().toLowerCase() === cleanParent ||
    p.id.trim().toLowerCase() === cleanParent ||
    p.code.trim().toLowerCase() === cleanParent
  );
}

// Check if acc is a descendant of parent
export function isDescendantOf(acc: CoaAccount, parent: CoaAccount, allAccs: CoaAccount[]): boolean {
  let curr = acc;
  while (curr) {
    const p = findParentOf(curr, allAccs);
    if (!p) return false;
    if (p.id === parent.id || p.code === parent.code || p.name.trim().toLowerCase() === parent.name.trim().toLowerCase()) return true;
    curr = p;
  }
  return false;
}

/**
 * Shared, single source of truth for dynamic debit/credit calculation per period
 */
export function getAccountDebitCreditForPeriod(
  account: CoaAccount,
  allAccounts: CoaAccount[],
  journals: JournalEntry[],
  startDate?: string | Date | null,
  endDate?: string | Date | null
): { debitCents: number; creditCents: number } {
  // Check if parent account
  const isParent = isParentAccount(account, allAccounts);
  if (isParent) {
    let totalDebit = 0;
    let totalCredit = 0;
    allAccounts.forEach(leaf => {
      // Find descendants that are leaf accounts
      if (!isParentAccount(leaf, allAccounts) && isDescendantOf(leaf, account, allAccounts)) {
        const vals = getAccountDebitCreditForPeriod(leaf, allAccounts, journals, startDate, endDate);
        totalDebit += vals.debitCents;
        totalCredit += vals.creditCents;
      }
    });
    return { debitCents: totalDebit, creditCents: totalCredit };
  }

  // Leaf account: process filtered journals
  const filteredJournals = journals.filter(entry => {
    if (!entry.date) return true;
    const entryDate = entry.date.seconds 
      ? new Date(entry.date.seconds * 1000) 
      : new Date(entry.date);
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (entryDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (entryDate > end) return false;
    }
    return true;
  });

  let debitCents = 0;
  let creditCents = 0;

  filteredJournals.forEach(entry => {
    if (!entry.lines) return;
    entry.lines.forEach(line => {
      const lineAccountName = line.account ? line.account.trim().toLowerCase() : '';
      const lineAccountCode = line.accountCode ? line.accountCode.trim().toLowerCase() : '';
      
      const matchName = lineAccountName === account.name.trim().toLowerCase();
      const matchCode = lineAccountCode && lineAccountCode === account.code.trim().toLowerCase();

      if (matchName || matchCode) {
        debitCents += line.debit || 0;
        creditCents += line.credit || 0;
      }
    });
  });

  return { debitCents, creditCents };
}

/**
 * Shared, single source of truth for dynamic balance calculation per period
 */
export function getAccountBalanceForPeriod(
  account: CoaAccount,
  allAccounts: CoaAccount[],
  journals: JournalEntry[],
  startDate?: string | Date | null,
  endDate?: string | Date | null
): number {
  const { debitCents, creditCents } = getAccountDebitCreditForPeriod(account, allAccounts, journals, startDate, endDate);
  const debitVal = debitCents / 100;
  const creditVal = creditCents / 100;

  if (account.type === 'Assets' || account.type === 'Expenses') {
    return debitVal - creditVal;
  } else {
    return creditVal - debitVal;
  }
}

/**
 * Checks if there are any postings (journal lines) associated with this account or its descendants
 */
export function hasAccountPostings(
  account: CoaAccount,
  allAccounts: CoaAccount[],
  journals: JournalEntry[]
): boolean {
  const isParent = isParentAccount(account, allAccounts);
  if (isParent) {
    return allAccounts.some(leaf => 
      !isParentAccount(leaf, allAccounts) && 
      isDescendantOf(leaf, account, allAccounts) && 
      hasAccountPostings(leaf, allAccounts, journals)
    );
  }

  return journals.some(entry => 
    entry.lines && entry.lines.some(line => {
      const lineAccountName = line.account ? line.account.trim().toLowerCase() : '';
      const lineAccountCode = line.accountCode ? line.accountCode.trim().toLowerCase() : '';
      return (
        lineAccountName === account.name.trim().toLowerCase() ||
        (lineAccountCode && lineAccountCode === account.code.trim().toLowerCase())
      );
    })
  );
}

/**
 * Calculates Line Total: unitPrice (cents) * qty
 */
export function calculateLineTotal(unitPriceCents: number, qty: number): number {
  return new Decimal(unitPriceCents).mul(qty).toNumber();
}

/**
 * Applies discount: subtotalCents - discountCents
 */
export function applyDiscount(subtotalCents: number, discountCents: number): number {
  return Math.max(0, new Decimal(subtotalCents).sub(discountCents).toNumber());
}

/**
 * Calculates Landed Cost per unit: (purchasePriceNTDCents + forwarderFeeNTDCents) / qty
 * Returns in NTD cents.
 */
export function calculateLandedCost(purchasePriceNTDCents: number, forwarderFeeNTDCents: number, qty: number): number {
  if (qty <= 0) return 0;
  return new Decimal(purchasePriceNTDCents)
    .plus(forwarderFeeNTDCents)
    .div(qty)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Calculates Recalculated Moving Average Cost:
 * ((oldQty * oldAvg) + (newReceivedQty * newLandedCost)) / (oldQty + newReceivedQty)
 * Returns in NTD cents.
 */
export function calculateMovingAverageCost(
  oldQty: number,
  oldAvgCents: number,
  newReceivedQty: number,
  newLandedCostCents: number
): number {
  const totalQty = oldQty + newReceivedQty;
  if (totalQty <= 0) return 0;
  const oldValue = new Decimal(oldQty).mul(oldAvgCents);
  const newValue = new Decimal(newReceivedQty).mul(newLandedCostCents);
  return oldValue.plus(newValue)
    .div(totalQty)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * FX Conversion: Converts IDR (whole rupiah) to NTD (cents).
 * Formula: IDR * (idrToNtdRate / 1e8)
 * Wait, why /1e8? The user specified "scaled x1e8 for precision" in schemas for "idrToNtd".
 * If rate is direct (e.g. 0.0021 NTD/IDR, stored scaled by 1e8, i.e., 210,000), TWD cents = IDR * (rate / 1e8) * 100?
 * Wait! Let's be smart. Let's make sure the conversion is correct.
 * Let's calculate: 1 NTD is approx 500 IDR (approx 1 IDR = 0.002 NTD).
 * If 1 IDR = 0.0020 NTD, then in cents, 1 IDR = 0.20 NTD cents.
 * If the rate idrToNtd is stored scaled by 1e8, let's say rate is direct IDR to NTD cents.
 * Wait, let's write a standard clean converter where the exchange rate is: "How many NTD cents is 1 IDR?"
 * 1 IDR is approx 0.002 TWD, which is 0.2 TWD cents (0.2).
 * If we scale TWD cents per IDR by 1e8, then the stored rate for 0.2 is 20,000,000.
 * To convert: IDR Amount * (Rate / 1e8). This represents NTD Cents perfectly!
 * Let's check: 100,000 IDR * (20,000,000 / 1e8) = 100,000 * 0.2 = 20,000 cents ($200 NTD).
 * That is exactly correct and matches the scale! Let's implement that.
 */
export function convertIdrToNtdCents(amountIDR: number, rateScaled: number): number {
  return new Decimal(amountIDR)
    .mul(rateScaled)
    .div(100000000)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Calculates NTD cents from IDR amount and FX rate.
 * Supports both IDR per NTD rate (e.g. 500 IDR/NT$) and NTD per IDR rate (e.g. 0.002 NT$/IDR).
 */
export function calculateNtdCentsFromIdr(amountIDR: number, fxRate: number): number {
  if (!amountIDR || amountIDR <= 0 || !fxRate || fxRate <= 0) return 0;
  if (fxRate >= 1) {
    // fxRate is IDR per NTD (e.g. 500 IDR = 1 NTD)
    return new Decimal(amountIDR)
      .div(fxRate)
      .mul(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
  } else {
    // fxRate is NTD per IDR (e.g. 0.002 NTD = 1 IDR)
    return new Decimal(amountIDR)
      .mul(fxRate)
      .mul(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
  }
}

/**
 * Calculates Profit Margin: (revenue - cogs) / revenue
 * Returns decimal percentage (e.g., 0.25 for 25%).
 */
export function calculateProfitMargin(revenueCents: number, cogsCents: number): number {
  if (revenueCents <= 0) return 0;
  return new Decimal(revenueCents)
    .sub(cogsCents)
    .div(revenueCents)
    .toNumber();
}

/**
 * Calculates Partner Share: lineProfit * partnerPercent / 100
 * Returns NTD cents.
 */
export function calculatePartnerShare(lineProfitCents: number, partnerPercent: number): number {
  if (partnerPercent <= 0) return 0;
  return new Decimal(lineProfitCents)
    .mul(partnerPercent)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Utility to format NTD cents to pretty NTD dollars with comma separator and 2 decimal places
 */
export function formatNTD(cents: number): string {
  if (isNaN(cents) || cents === undefined || cents === null) cents = 0;
  const value = new Decimal(cents).div(100).toNumber();
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(absValue);
  return isNegative ? `-NT$ ${formatted}` : `NT$ ${formatted}`;
}

export function formatNTDExact(cents: number): string {
  if (isNaN(cents) || cents === undefined || cents === null) cents = 0;
  const value = new Decimal(cents).div(100).toNumber();
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(absValue);
  return isNegative ? `-NT$ ${formatted}` : `NT$ ${formatted}`;
}

/**
 * Utility to format NTD standard (dollar) amount with comma separator and 2 decimal places
 */
export function formatNTDAmount(val: number): string {
  if (isNaN(val) || val === undefined || val === null) val = 0;
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(absVal);
  return isNegative ? `-NT$ ${formatted}` : `NT$ ${formatted}`;
}

/**
 * Utility to format IDR to pretty cash format with comma separator and no decimals
 */
export function formatIDR(rupiah: number): string {
  if (isNaN(rupiah) || rupiah === undefined || rupiah === null) rupiah = 0;
  const rounded = Math.round(rupiah);
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(rounded);
  return `Rp ${formatted}`;
}

/**
 * Utility to format generic numbers with comma separator and no decimals
 */
export function formatNumber(val: number): string {
  if (isNaN(val) || val === undefined || val === null) val = 0;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(val));
}

/**
 * Sorts a list of accounts hierarchically by code, ensuring each parent account
 * is immediately followed by its direct children sorted by code.
 * Uses allAccounts for parent/child relationship checks.
 */
export function sortAccountsHierarchical(accounts: CoaAccount[], allAccounts: CoaAccount[]): CoaAccount[] {
  // Separate root accounts (accounts whose parent is not in the list or has no parent)
  const rootAccs = accounts.filter(acc => !findParentOf(acc, allAccounts));
  rootAccs.sort((a, b) => a.code.localeCompare(b.code));

  const sortedList: CoaAccount[] = [];

  rootAccs.forEach(rootAcc => {
    sortedList.push(rootAcc);

    // Find direct children under this root account
    const children = accounts.filter(child => {
      const p = findParentOf(child, allAccounts);
      return p && p.code === rootAcc.code;
    });
    children.sort((a, b) => a.code.localeCompare(b.code));

    children.forEach(childAcc => {
      sortedList.push(childAcc);
    });
  });

  // Just in case there are accounts that have a parent (but the parent is active/inactive/not a root), 
  // or any other missed accounts, we append them sorted by code.
  accounts.forEach(acc => {
    if (!sortedList.some(s => s.id === acc.id)) {
      sortedList.push(acc);
    }
  });

  return sortedList;
}

/**
 * Shared dynamic account lookup based on role with fallback for robust handling.
 */
export function findAccountByRole(
  accounts: CoaAccount[],
  role: 'prive' | 'setoran_modal' | 'modal_awal' | 'beban_gaji'
): CoaAccount | undefined {
  const byRole = accounts.find(a => a.accountRole === role);
  if (byRole) return byRole;

  if (role === 'prive') {
    return accounts.find(a => a.code === '3102' || a.name.toLowerCase().includes('prive'));
  } else if (role === 'setoran_modal') {
    return accounts.find(a => a.code === '3101' || a.name.toLowerCase().includes('setoran modal') || a.name.toLowerCase().includes('setoran tambahan'));
  } else if (role === 'modal_awal') {
    return accounts.find(a => a.code === '3100' || a.name.toLowerCase().includes('modal awal'));
  } else if (role === 'beban_gaji') {
    return accounts.find(a => a.code === '5120' || a.code === '5400' || a.name.toLowerCase().includes('beban gaji'));
  }
  return undefined;
}

/**
 * Shared calculation function to calculate equity modal components as of a given date.
 */
export function calculateEquityModalAtDate(
  date: Date,
  coaAccounts: CoaAccount[],
  journals: JournalEntry[]
): {
  modalAwal: number;
  setoranTambahan: number;
  priveBalance: number;
  netIncome: number;
  modalEkuitas: number;
} {
  const acc3100 = findAccountByRole(coaAccounts, 'modal_awal');
  const acc3101 = findAccountByRole(coaAccounts, 'setoran_modal');
  const acc3102 = findAccountByRole(coaAccounts, 'prive');

  const modalAwal = acc3100 ? getAccountBalanceForPeriod(acc3100, coaAccounts, journals, null, date) : 0;
  const setoranTambahan = acc3101 ? getAccountBalanceForPeriod(acc3101, coaAccounts, journals, null, date) : 0;
  
  // Prive balance calculation (Debit-normal of 3102)
  let priveBalance = 0;
  if (acc3102) {
    const { debitCents, creditCents } = getAccountDebitCreditForPeriod(acc3102, coaAccounts, journals, null, date);
    priveBalance = (debitCents - creditCents) / 100;
  }

  // Laba Bersih = Revenue - Expenses from inception up to date
  const revenueAccounts = coaAccounts.filter(a => (a.type === 'Revenue' || a.code?.startsWith('4')) && !isParentAccount(a, coaAccounts));
  const expenseAccounts = coaAccounts.filter(a => (a.type === 'Expenses' || a.code?.startsWith('5')) && !isParentAccount(a, coaAccounts));

  const totalRevenue = revenueAccounts.reduce((sum, a) => sum + getAccountBalanceForPeriod(a, coaAccounts, journals, null, date), 0);
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + getAccountBalanceForPeriod(a, coaAccounts, journals, null, date), 0);
  const netIncome = totalRevenue - totalExpenses;

  const modalEkuitas = modalAwal + setoranTambahan + netIncome - priveBalance;

  return {
    modalAwal,
    setoranTambahan,
    priveBalance,
    netIncome,
    modalEkuitas
  };
}

/**
 * Formats a raw input string to include thousands separators dynamically
 */
export function formatInputWithCommas(value: string): string {
  if (value === undefined || value === null) return '';
  
  // Strip everything except digits, negative sign, and dot
  let clean = value.replace(/[^\d.-]/g, '');
  
  // Handle multiple decimal points by keeping only the first one
  const firstDotIdx = clean.indexOf('.');
  if (firstDotIdx !== -1) {
    clean = clean.substring(0, firstDotIdx + 1) + clean.substring(firstDotIdx + 1).replace(/\./g, '');
  }
  
  // Handle multiple negative signs by keeping only the first one at the beginning
  const isNegative = clean.startsWith('-');
  clean = clean.replace(/-/g, '');
  if (isNegative) {
    clean = '-' + clean;
  }
  
  if (clean === '' || clean === '-') {
    return clean;
  }
  
  const parts = clean.split('.');
  // Add commas to the integer part
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  if (parts.length > 1) {
    return `${integerPart}.${parts[1]}`;
  }
  return integerPart;
}

/**
 * Parses a formatted input string back to a clean numeric string or number
 */
export function cleanCommas(value: string): string {
  if (!value) return '';
  return value.replace(/,/g, '');
}

export function parseNumberFromFormatted(value: string): number {
  const clean = cleanCommas(value);
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}


