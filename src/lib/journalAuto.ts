import { getNextJournalId } from './journalUtils';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, Timestamp, collection, collectionGroup, getDocs, query, where , runTransaction } from 'firebase/firestore';
import { CoaAccount } from '../types';

export interface AutoAccount {
  code: string;
  name: string;
  type: 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses';
  subType: string;
  accountRole?: 'prive' | 'setoran_modal' | 'modal_awal' | 'beban_gaji';
  systemKey?: string;
}

// Map of 4-digit consolidated account keys
export const AUTO_ACCOUNTS_TEMPLATE: Record<string, AutoAccount> = {
  CASH_NTD: { code: '1101', name: 'Cash:NTD', type: 'Assets', subType: 'Aset Lancar', systemKey: 'cash_ntd' },
  CASH_RUPIAH: { code: '1102', name: 'Cash Rupiah', type: 'Assets', subType: 'Aset Lancar', systemKey: 'cash_idr' },
  CASH_COD: { code: '1103', name: 'Cash:COD', type: 'Assets', subType: 'Aset Lancar', systemKey: 'cash_cod' },
  AR_PLATFORM: { code: '1125', name: 'AR:Platform', type: 'Assets', subType: 'Aset Lancar', systemKey: 'ar_platform' },
  INVENTORY: { code: '1200', name: 'Inventory', type: 'Assets', subType: 'Aset Persediaan', systemKey: 'inventory_parent' },
  INVENTORY_ON_HAND: { code: '1201', name: 'Inventory On Hand', type: 'Assets', subType: 'Aset Persediaan', systemKey: 'inventory_on_hand' },
  INVENTORY_IN_DELIVERY: { code: '1202', name: 'Inventory in Delivery', type: 'Assets', subType: 'Aset Persediaan', systemKey: 'inventory_in_delivery' },
  INVENTORY_IN_TRANSIT: { code: '1203', name: 'Inventory in Transit', type: 'Assets', subType: 'Aset Persediaan', systemKey: 'inventory_in_transit' },
  AP_PARTNERS: { code: '2101', name: 'Hutang Komisi Reseller', type: 'Liabilities', subType: 'Kewajiban Lancar', systemKey: 'ap_partners' },
  ACCRUED_PAYROLL: { code: '2102', name: 'Accrued Payroll', type: 'Liabilities', subType: 'Kewajiban Lancar', systemKey: 'accrued_payroll' },
  MODAL_AWAL: { code: '3100', name: 'Modal Awal', type: 'Equity', subType: 'Ekuitas Pemilik', accountRole: 'modal_awal', systemKey: 'modal_awal' },
  PRIVE: { code: '3102', name: 'Prive', type: 'Equity', subType: 'Ekuitas Pemilik', accountRole: 'prive', systemKey: 'prive' },
  SETORAN_MODAL: { code: '3101', name: 'Setoran Modal Tambahan', type: 'Equity', subType: 'Ekuitas Pemilik', accountRole: 'setoran_modal', systemKey: 'setoran_modal' },
  REVENUE: { code: '4100', name: 'Revenue', type: 'Revenue', subType: 'Pendapatan Usaha', systemKey: 'revenue' },
  COGS: { code: '5100', name: 'COGS', type: 'Expenses', subType: 'Harga Pokok Penjualan', systemKey: 'cogs' },
  BEBAN_GAJI: { code: '5120', name: 'Beban Gaji', type: 'Expenses', subType: 'Beban Operasional', accountRole: 'beban_gaji', systemKey: 'beban_gaji' },
  PARTNER_PROFIT_SHARE: { code: '5130', name: 'Beban Komisi Reseller', type: 'Expenses', subType: 'Beban Kemitraan', systemKey: 'partner_profit_share' },
  FREIGHT_IN: { code: '1120', name: 'Freight-in Dalam Kapitalisasi', type: 'Assets', subType: 'Aset Lancar', systemKey: 'freight_in_capitalization' },
  BEBAN_HADIAH_PELANGGAN: { code: '5310', name: 'Beban Hadiah Pelanggan', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_hadiah_pelanggan' },
  BEBAN_PLATFORM: { code: '5320', name: 'Biaya Platform', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_platform' },
  BEBAN_IKLAN: { code: '5300', name: 'Beban Iklan', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_iklan' },
  BEBAN_ONGKIR: { code: '5230', name: 'Beban Ongkos Kirim', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_ongkir' },
  PIUTANG_USAHA: { code: '1110', name: 'Piutang Usaha', type: 'Assets', subType: 'Aset Lancar', systemKey: 'piutang_usaha' },
  PENDAPATAN_DITERIMA_DI_MUKA: { code: '2110', name: 'Pendapatan Diterima di Muka', type: 'Liabilities', subType: 'Kewajiban Lancar', systemKey: 'pendapatan_diterima_dimuka' },
  LABA_RUGI_SELISIH_KURS: { code: '4210', name: 'Laba/Rugi Selisih Kurs', type: 'Revenue', subType: 'Pendapatan Lain-lain', systemKey: 'laba_rugi_kurs' },
  BIAYA_DIBAYAR_DIMUKA: { code: '1400', name: 'Biaya Dibayar Dimuka', type: 'Assets', subType: 'Aset Lancar', systemKey: 'biaya_dibayar_dimuka' },
  BEBAN_AMORTISASI: { code: '5240', name: 'Beban Amortisasi', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_amortisasi' },
  BEBAN_LAIN_LAIN: { code: '5500', name: 'Beban Lain-lain', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_kerugian_pembelian' },
  PERLENGKAPAN: { code: '1130', name: 'Perlengkapan', type: 'Assets', subType: 'Aset Lancar', systemKey: 'perlengkapan' },
  BEBAN_PERLENGKAPAN: { code: '5220', name: 'Beban Perlengkapan Packing', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_perlengkapan' },
};

export const AUTO_ACCOUNTS = AUTO_ACCOUNTS_TEMPLATE;

export async function getLiveAutoAccounts(): Promise<Record<string, AutoAccount>> {
  const snap = await getDocs(collection(db, 'coa'));
  const allAccounts: AutoAccount[] = snap.docs.map(d => d.data() as AutoAccount);
  const resolved: Record<string, AutoAccount> = {};
  
  for (const [key, template] of Object.entries(AUTO_ACCOUNTS_TEMPLATE)) {
    const found = allAccounts.find(a => a.systemKey === template.systemKey) || allAccounts.find(a => a.code === template.code);
    if (found) {
      resolved[key] = found;
    } else {
      resolved[key] = template;
    }
  }
  return resolved;
}


/**
 * Returns the correct cash account code and name depending on currency.
 */
export function getCashAccount(currency: string): AutoAccount {
  const cleanCurrency = currency?.trim().toUpperCase();
  if (cleanCurrency === 'IDR' || cleanCurrency === 'RUPIAH') {
    return AUTO_ACCOUNTS.CASH_RUPIAH;
  }
  return AUTO_ACCOUNTS.CASH_NTD;
}

/**
 * Returns the inventory on-hand account.
 */
export function getInventoryAccount(): AutoAccount {
  return AUTO_ACCOUNTS.INVENTORY_ON_HAND;
}

/**
 * Returns the inventory in transit account.
 */
export function getInventoryInTransitAccount(): AutoAccount {
  return AUTO_ACCOUNTS.INVENTORY_IN_TRANSIT;
}

/**
 * Returns the freight-in account.
 */
export function getFreightInAccount(): AutoAccount {
  return AUTO_ACCOUNTS.FREIGHT_IN;
}

/**
 * Helper to dynamically ensure an automatic account exists in the CoA Firestore collection.
 */
const _autoAccountCache = new Set<string>();

/**
 * Helper to dynamically ensure an automatic account exists in the CoA Firestore collection.
 */
export async function ensureAutoAccountExists(acc: AutoAccount): Promise<void> {
  if (!acc.systemKey) return;
  if (_autoAccountCache.has(acc.systemKey)) return;

  const q = query(collection(db, 'coa'), where('systemKey', '==', acc.systemKey));
  try {
    const snap = await getDocs(q);
    if (snap.empty) {
      const qCode = query(collection(db, 'coa'), where('code', '==', acc.code));
      const snapCode = await getDocs(qCode);
      if (snapCode.empty) {
        const docRef = doc(collection(db, 'coa'));
        await setDoc(docRef, {
          id: docRef.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          subType: acc.subType,
          isActive: true,
          createdAt: Timestamp.now(),
          ...(acc.accountRole ? { accountRole: acc.accountRole } : {}),
          ...(acc.systemKey ? { systemKey: acc.systemKey } : {})
        });
      } else {
        await updateDoc(snapCode.docs[0].ref, {
          ...(acc.accountRole ? { accountRole: acc.accountRole } : {}),
          ...(acc.systemKey ? { systemKey: acc.systemKey } : {})
        });
      }
    } else {
      // update role if necessary (simplified here)
    }
    
    // Mark as ensured
    _autoAccountCache.add(acc.systemKey);
  } catch (err) {
    if (String(err).includes('Quota') || String(err).includes('quota')) {
      console.warn('Quota exceeded for ensuring auto account exists:', acc.name);
    } else {
      console.error('Error ensuring auto account exists:', err);
    }
    
  }
}

export async function prepareReceiptEventData(
  db: any,
  po: any,
  _freightCode: string | undefined,
  totalQtyReceived: number,
  overallStatus: string
) {
  const tglTerima = new Date();
  const yy = String(tglTerima.getFullYear()).slice(-2);
  const mm = String(tglTerima.getMonth() + 1).padStart(2, '0');
  const dd = String(tglTerima.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;
  const counterId = `JURNAL_${dateStr}`;
  let nextValue = 1;
  const counterRef = doc(db, 'counters', counterId);
  try {
    await runTransaction(db, async (transaction: any) => {
      const snap = await transaction.get(counterRef);
      if (!snap.exists()) {
        nextValue = 1;
      } else {
        nextValue = snap.data().value + 1;
      }
      transaction.set(counterRef, { value: nextValue }, { merge: true });
    });
  } catch(e) { console.error(e); nextValue = Math.floor(Math.random()*9999); }
  const nextJournalId = `JU${dateStr}${String(nextValue).padStart(4, '0')}`;

  return {
    nextJournalId
  };
}

export function writeReceiptEventAndJournal(
  batch: any,
  po: any,
  eventId: string,
  receiptEventData: any,
  totalReceivedThisRunSum: number,
  itemsReceivedThisTime: any[],
  freightCode: string | undefined,
  overallStatus: string,
  userEmail: string
) {
  const tglTerima = Timestamp.now();
  const dateStr = tglTerima.toDate().toISOString().split('T')[0];
  
  const journalId = receiptEventData.nextJournalId || doc(collection(db, 'journalEntries')).id;
  const autoAccounts = AUTO_ACCOUNTS;
  
  const totalQtyOrdered = po.items.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
  const diskon_per_unit_cents = (po.discount || 0) / totalQtyOrdered;
  const freight_per_unit_cents = ((po.forwarderFeeNTD || 0) * 100) / totalQtyOrdered;

  let totalPurchaseCents = 0;
  let totalFreightCents = 0;
  let totalLandedCents = 0;

  itemsReceivedThisTime.forEach(it => {
     const poItem = po.items.find((i: any) => i.bookId === it.bookId);
     if (poItem) {
        const pItemCents = (poItem.pricePerItem || poItem.pricePerUnitNTD || 0) - diskon_per_unit_cents;
        totalPurchaseCents += pItemCents * it.qtyReceived;
        totalFreightCents += freight_per_unit_cents * it.qtyReceived;
        totalLandedCents += (pItemCents + freight_per_unit_cents) * it.qtyReceived;
     }
  });

  const lines = [];
  
  // Debit: Inventory On Hand
  lines.push({
    accountCode: autoAccounts.INVENTORY_ON_HAND.code,
    account: autoAccounts.INVENTORY_ON_HAND.name,
    debit: Math.round(totalLandedCents),
    credit: 0
  });

  // Credit: Inventory in Transit (Purchase part)
  if (totalPurchaseCents > 0) {
    lines.push({
      accountCode: autoAccounts.INVENTORY_IN_TRANSIT.code,
      account: autoAccounts.INVENTORY_IN_TRANSIT.name,
      debit: 0,
      credit: Math.round(totalPurchaseCents)
    });
  }

  // Credit: Freight-in (Freight part)
  if (totalFreightCents > 0) {
    lines.push({
      accountCode: autoAccounts.FREIGHT_IN.code,
      account: autoAccounts.FREIGHT_IN.name,
      debit: 0,
      credit: Math.round(totalFreightCents)
    });
  }

  batch.set(doc(db, 'journalEntries', journalId), {
    id: journalId,
    date: dateStr,
    
    description: `PO #${po.purchaseCode?.replace(/^#?P(?!O)/, 'PO').replace(/^#/, '') || po.id}\n${overallStatus === 'partial' ? 'Penerimaan Barang Sebagian' : (po.receipts && po.receipts.length > 0) ? 'Penerimaan Barang Sisa' : 'Penerimaan Barang'}`,

    lines,
    sourceDocument: 'PO_RECEIPT',
    sourceId: po.id,
    receiptEventId: eventId,
    createdAt: tglTerima,
    createdBy: userEmail,
    isAutoGenerated: true
  });
}

export function generateReceivingJournals(
  po: any,
  poCode: string,
  poFreightIDR: number,
  batch: any,
  status?: string,
  freightExchangeRate?: number,
  journalEntries?: any[],
  purchaseOrders?: any[]
): void {
  // Deprecated. Handled granularly via prepareReceiptEventData & writeReceiptEventAndJournal
}

export function findAccountBySystemKey(coaAccounts: any[], systemKey: string) {
  return coaAccounts.find(a => a.systemKey === systemKey);
}

export function findAccountByRole(coaAccounts: any[], accountRole: string) {
  return coaAccounts.find(a => a.accountRole === accountRole);
}
