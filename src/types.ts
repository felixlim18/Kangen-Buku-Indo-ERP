export interface Book {
  id: string;
  productId?: string;
  cover: string;              // URL
  category: string | string[]; // Category name or ID, supports single or multi-select array
  bookName: string;           // Unique name
  bookNameLower: string;      // Lowercase name fuzzy search
  author: string;
  shopeePrice: number;        // NTD cents
  generalPrice: number;       // NTD cents
  resellerPrice?: number;      // NTD cents
  description: string;
  minOrder: number;           // Safety stock threshold
  websiteId?: string;
  shopeeId?: string;
  isActive: boolean;
  createdAt: any;             // Timestamp or Date
  updatedAt: any;             // Timestamp or Date
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  createdAt: any;
}

export interface Supplier {
  id: string;
  name: string;
  currency: 'IDR' | 'NTD';
  isArchived: boolean;
  createdAt: any;
}

export interface SalesOrderItem {
  bookId: string;
  bookName: string;           // snapshot
  bookCover: string;
  unitPrice: number;          // NTD cents
  qty: number;
  lineTotal: number;          // NTD cents
  cogsSnapshot: number;       // moving avg landed cost at sale (NTD cents)
  isFree?: boolean;
  markedRefund?: boolean;     // flag if marked as not shipped / refund
  markedTertinggal?: boolean; // flag if item was left behind / split to child SO
  // Skenario C: komisi per-item (diinput manual di BusinessPartner tab)
  itemKomisiMode?: 'persen' | 'nominal'; // 'persen' = % dari lineTotal, 'nominal' = NT$ per unit
  itemKomisiValue?: number;              // nilai komisi
}

export interface OrderTypeConfig {
  id: string;
  name: string;
  createdAt?: any;
}

export interface ChannelConfig {
  id: string;
  name: string;
  color?: string;
  orderCategory?: 'Marketplace' | 'Direct Order' | 'Reseller';
  createdAt?: any;
}

export interface PlatformOrderConfig {
  id: string;
  name: string;
  ongkosKirim?: boolean;
  adminFee?: number;
  createdAt?: any;
}

export interface LogisticsConfig {
  id: string;
  name: string;
  createdAt?: any;
}

export interface SalesOrder {
  id: string;
  orderCode: string;          // #S2606071
  orderDate: any;
  customerName: string;
  customerPlatformName: string;
  platformChannel?: string;
  orderType?: string;
  platformOrder?: string;
  paymentMethod: 'COD' | 'Transfer';
  phoneNumber: string;
  pickupLogistics: string;
  pickupDetails: string;
  items: SalesOrderItem[];
  subtotal: number;           // NTD cents
  discount: number;           // NTD cents
  platformFee?: number;       // NTD cents
  totalPrice: number;         // NTD cents
  status: 'draft' | 'confirmed' | 'packed' | 'shipped' | 'completed' | 'cancelled' | 'returned';
  precedingStatus?: 'draft' | 'confirmed' | 'packed' | 'shipped' | 'completed' | 'cancelled' | 'returned';
  packedAt?: any;
  isPinned?: boolean;
  pinnedAt?: any;
  paymentStatus?: 'paid' | 'unpaid' | 'partial';
  isUnpaid?: boolean;
  amountPaid?: number; // cents
  paymentTermsDays?: 30 | 60 | 90; // Umur piutang, hanya relevan untuk paymentMethod COD
  dueDate?: string; // YYYY-MM-DD, dihitung dari completedAt + paymentTermsDays saat SO diselesaikan
  customerNote?: string;
  orderNumber?: string;
  estimatedShippingDate?: string;
  buyerType?: 'langsung' | 'reseller' | 'marketplace';
  partnerId?: string;
  partnerName?: string;
  komisiMode?: 'persen' | 'nominal';
  komisiValue?: number;
  dibayar?: boolean;
  batchId?: string;
  paidKomisi?: number;
  addressPhotoUrl?: string;
  isDraft?: boolean;
  shipment?: {
    shippingNumber: string;
    shippingDate: any;
    arrangedAt: any;
  };
  partnerProfitShare?: number; // NTD cents
  parentOrderId?: string;     // Link to parent SO if this is a child SO for unfulfilled items
  parentOrderCode?: string;   // Document code of parent SO
  childOrderIds?: string[];   // Array of child SO IDs split from this SO
  childOrderCodes?: string[]; // Array of child SO document codes
  isMarketplaceRefunded?: boolean; // Flag if marketplace refund journal has been processed for missing item
  refundJournalId?: string;   // Linked journal ID for marketplace refund
  shippedAt?: any;
  returnedAt?: any;
  diambilAt?: any;
  cancelledAt?: any;
  completedAt?: any;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
}

export interface GoodsReceipt {
  receivedDate: any;
  receivedQty: number;
  status: 'kurang' | 'pas' | 'kelebihan';
  notes?: string;
  receivedBy: string;
}

export interface PurchaseOrder {
  id: string;
  purchaseCode: string;       // #P2606071
  purchaseDate: any;
  bookId: string;
  bookName: string;
  qty: number;
  supplierId: string;
  supplierName: string;
  purchasePriceIDR: number;   // IDR whole
  exchangeRate: number;       // TWD per TWD rate, stored as number (TWD = IDR * rate)
  purchasePriceNTD: number;   // NTD cents
  pricePerUnitNTD: number;    // NTD cents
  supplierOrderNumber: string;
  forwarderFeeNTD?: number;   // NTD cents proration
  status: 'pending' | 'partial' | 'received' | 'cancelled';
  receipts: GoodsReceipt[];
  createdAt: any;
  updatedAt: any;
}

export interface InventoryRecord {
  bookId: string;
  initialStock: number;
  totalPurchased: number;
  totalDispatched: number;
  endingStock: number;
  readyStock: number;         // in warehouse
  inTransitStock: number;     // ordered but not received
  shippedStock?: number;      // ordered and shipped, but not yet completed
  ordersPlaced: number;
  ordersShipped: number;
  movingAverageCost: number;  // NTD cents
  totalInventoryValue: number;// NTD cents
  stockStatus: 'in_stock' | 'sold_out' | 'perlu_dibeli' | 'tidak_dijual';
  lastUpdated: any;
}

export interface InventoryLedgerEntry {
  id: string;
  bookId: string;
  type: 'purchase_received' | 'sale_shipped' | 'DISPATCHED' | 'COMPLETED_SALE' | 'COMPLETED_SALE_REVERSED' | 'sale_cancelled' | 'sale_returned' | 'sale_reverted' | 'adjustment' | 'initial' | 'damaged_stock' | 'PACKED';
  qtyDelta: number;
  unitCost: number;           // NTD cents
  refCollection: 'purchaseOrders' | 'salesOrders' | 'manual' | 'damagedStock';
  refId: string;
  balanceAfter: number;
  movingAvgAfter: number;     // NTD cents
  timestamp: any;
  userId: string;
}

export interface FxRate {
  date: string;               // YYYY-MM-DD
  idrToNtd: number;           // TWD per 10,000 IDR or direct IDR -> NTD rate (stored scaled or as decimal)
  source: string;
  fetchedAt: any;
}

export interface CashFlowEntry {
  id: string;
  date: any;
  ledger: 'NTD' | 'IDR';
  direction: 'inflow' | 'outflow';
  category: string;           // shopee_settlement, wholesale_purchase, forwarder_fee, salary, partners, etc.
  amount: number;             // IDR whole or NTD cents
  amountNTD: number;          // snapshot NTD cents
  fxRateUsed: number;
  refType?: 'sales_order' | 'purchase_order' | 'payroll' | 'manual';
  refId?: string;
  description: string;
  createdAt: any;
}

export interface JournalEntryLine {
  account: string;            // Cash:NTD, Cash:IDR, Inventory, Revenue, COGS, Accounts Receivable, etc.
  accountCode?: string;       // 4-digit Chart of Accounts code reference for dynamic renaming
  debit: number;              // NTD cents
  credit: number;             // NTD cents
  originalCurrency?: 'NTD' | 'IDR';
  originalDebitIDR?: number;  // IDR value (in whole Rp or cents, let's store whole Rupiah since that's what's typed)
  originalCreditIDR?: number; // IDR value (in whole Rp or cents, let's store whole Rupiah since that's what's typed)
}

export interface JournalEntry {
  id: string;
  date: any;
  description: string;
  lines: JournalEntryLine[];
  refType: string;
  refId: string;
  createdAt: any;
  exchangeRate?: number;
  fxRateUsed?: number;
}

export interface Payroll {
  id: string;
  payee: string;
  period: string;             // YYYY-MM
  currency: 'NTD' | 'IDR';
  amount: number;             // in ledger currency
  paidAt: any;
  notes: string;
  journalId?: string;
  cashflowId?: string;
}

/**
 * Satu entri riwayat harga kesepakatan untuk Ko-Produksi.
 * Ketika harga diubah, entri baru ditambahkan — entri lama tetap ada
 * sehingga SO lama dihitung menggunakan harga yang berlaku saat itu.
 */
export interface AgreedPriceEntry {
  price: number;         // NT$ cents per unit
  effectiveFrom: string; // YYYY-MM-DD — tanggal mulai berlaku
}

/**
 * Ko-Produksi: Buku yang dibuat bareng dengan partner.
 * Komisi dihitung OTOMATIS:
 *   partnerKomisi = (agreedPriceForDate - item.cogsSnapshot) × sharePercent/100 × qty
 *
 * - agreedPriceForDate: harga kesepakatan yang berlaku di tanggal SO (dari riwayat)
 * - cogsSnapshot: moving avg COGS saat SO diproses (field existing di SalesOrderItem)
 * - sharePercent: persentase bagi hasil untuk partner
 *
 * Berlaku untuk SEMUA SO yang mengandung buku ini, tanpa filter kategori SO.
 */
export interface CoProducedBook {
  bookId: string;
  bookName: string;                       // snapshot nama buku
  sharePercent: number;                   // % bagi hasil untuk partner, mis. 50
  agreedPriceHistory: AgreedPriceEntry[]; // riwayat harga kesepakatan (tidak pernah dihapus)
}

export interface BusinessPartner {
  id: string;
  name: string;
  profitSharePercent?: number; // legacy
  bookLines?: string[];        // legacy
  payableBalance?: number;     // legacy

  // Skenario B: Reseller biasa — komisi per SO (sudah ada)
  komisiMode?: 'persen' | 'nominal';
  komisiValue?: number;

  // Skenario A: Ko-Produksi — buku yang dikerjakan bareng
  coProducedBooks?: CoProducedBook[];
}

export interface CoaAccount {
  id: string;
  code: string;
  name: string;
  type: 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses';
  subType: string;
  parentAccount?: string; // name or code or id of parent account
  isActive: boolean;
  description?: string;
  createdAt: any;
  balance?: number;
  accountRole?: 'prive' | 'setoran_modal' | 'modal_awal';
  systemKey?: string;
}

export interface DamagedStock {
  id: string;
  docNo?: string;
  adjustmentType?: 'Barang Rusak' | 'Barang Lebih';
  bookId: string;
  bookName: string;
  qty: number;
  date: string; // YYYY-MM-DD
  notes: string;
  unitCost: number; // NTD cents
  totalCost: number; // NTD cents
  journalId: string;
  createdAt: any;
  updatedAt?: any;
}

export interface FixedAssetDepreciation {
  period: string; // "YYYY-MM"
  amount: number; // NT$ cents
  journalId: string;
  postedAt: any;
}

export interface AmortizationPosting {
  period: string;       // "YYYY-MM"
  monthNumber: number;  // 1, 2, 3...
  amountNTD: number;    // NT$ cents
  journalId: string;
  postedAt: any;
}

export interface AmortizationItem {
  id: string;
  docCode: string;               // e.g. "AM26072601"
  name: string;
  nilaiPerolehanNTD: number;     // NT$ cents
  nilaiPerolehanRaw?: number;    // if currency was IDR
  currency: 'NTD' | 'IDR';
  fxRateUsed?: number;
  usefulLifeMonths: number;      // 3, 6, 12, 24, 36, etc.
  acquisitionDate: string;       // "YYYY-MM-DD"
  startDate: string;             // "YYYY-MM-DD"
  paidViaAccountCode: string;    // e.g. "1101" or "1102"
  prepaidAccountCode: string;    // e.g. "1400" or "1401"
  expenseAccountCode: string;    // e.g. "5240" or "5301"
  notes?: string;
  status: 'Berjalan' | 'Selesai' | 'Belum Dimulai';
  acquisitionJournalId?: string;
  postings: AmortizationPosting[];
  createdAt: any;
  createdBy?: string;
}

export interface FixedAsset {
  id: string;
  docCode: string;
  name: string;
  acquisitionValue: number; // NT$ cents
  salvageValue: number;     // NT$ cents
  acquisitionDate: string;  // "YYYY-MM-DD"
  depreciationStartDate: string; // "YYYY-MM-DD"
  notes: string;
  method: 'Garis Lurus';
  usefulLifeMonths: number;
  status: 'Berjalan' | 'Selesai' | 'Dinonaktifkan';
  assetAccountCode: string;
  accumulatedAccountCode: string;
  expenseAccountCode: string;
  paidViaAccountCode: string;
  acquisitionJournalId: string;
  postedDepreciations: FixedAssetDepreciation[];
  createdAt: any;
}

export interface Prive {
  id: string;
  date: any; // Timestamp or Date
  amount: number; // raw numeric input
  amountNTD: number; // TWD cents
  currency: 'NTD' | 'IDR';
  cashAccountCode: string; // CoA Code (1101 or 1102)
  fxRateUsed: number; // stored as raw rate (e.g. 0.00205)
  description: string;
  journalId: string;
  createdAt: any;
}

export interface SetoranModal {
  id: string;
  date: any; // Timestamp or Date
  amount: number; // raw numeric input
  amountNTD: number; // TWD cents
  currency: 'NTD' | 'IDR';
  cashAccountCode: string; // CoA Code (1101 or 1102)
  fxRateUsed: number; // stored as raw rate (e.g. 0.00205)
  description: string;
  journalId: string;
  createdAt: any;
}

export interface AuditLogEntry {
  id: string;
  timestamp: any; // Timestamp or Date
  userEmail: string;
  userDisplayName: string;
  action: 'EDIT' | 'DELETE' | 'STANDARDIZE_DESCRIPTIONS';
  journalId: string;
  before: JournalEntry | null;
  after: any;
}




export interface PaymentBatch {
  id: string;
  partnerId: string;
  tanggal: string; // YYYY-MM-DD
  soIds: string[];
  totalKomisi: number;
  akun: string;
  createdAt?: any;
}

export interface DashboardNote {
  id: string;
  txt: string;
  who: 'felix' | 'admin' | string;
  authorName: string;
  when: string;
  pin: boolean;
  read: boolean;
  createdAt?: any;
}

export interface DashboardTask {
  id: string;
  t: string;
  due: 'today' | 'week' | 'later';
  done: boolean;
  createdAt?: any;
}

export interface PricingTier {
  id?: string;
  from: number; // IDR lower bound
  to: number;   // IDR upper bound
  mkt: number;  // NTD marketplace price
  umum: number; // NTD general price
  createdAt?: any;
}

export interface BankAccount {
  id: string;
  bankName: string;         // e.g. "第一銀行 (First Bank)", "Cathay United Bank", "Bank Mandiri"
  accountNumber: string;    // e.g. "123-456-7890"
  accountHolder?: string;   // e.g. "KangenBukuIndo"
  currency: 'NTD' | 'IDR';
  linkedCoaCode: '1101' | '1102' | string; // "1101" or "1102"
  isActive: boolean;
  notes?: string;
  splitBalance?: number;    // saved physical balance for split calc
  lastSplitUpdate?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface BankReconciliation {
  id: string;
  reconciliationDate: string;  // YYYY-MM-DD
  bankAccountId?: string;       // link to BankAccount if chosen
  accountCode: '1101' | '1102'; // Cash account code
  bankName: string;
  currency: 'NTD' | 'IDR';
  
  // Statement vs Book
  bankStatementBalance: number;  // In original currency (NTD cents or IDR units)
  bookBalance: number;           // In original currency
  difference: number;            // bankStatementBalance - bookBalance
  
  status: 'Matched' | 'Discrepancy' | 'Adjusted';
  notes?: string;
  performedBy?: string;
  createdAt?: any;
}

export interface RevaluasiKursLog {
  id: string;
  period: string;               // YYYY-MM
  date: string;                 // YYYY-MM-DD
  closingRate: number;          // e.g. 545 IDR per NTD
  idrBalance: number;           // Rp 20,000,000
  prevNtdBookBalance: number;   // NTD cents
  newNtdAdjustedBalance: number;// NTD cents
  selisihNtdCents: number;      // NTD cents (gain > 0, loss < 0)
  journalId?: string;
  reversalJournalId?: string;
  hasAutoReversal?: boolean;
  postedAt?: any;
  postedBy?: string;
}

