// Komunikasi dengan Chrome extension "KBI Auto 出貨" (folder "extensions chrome/shopee-auto-ship").
// Extension menandai <html data-kbi-auto-ship-ext="<versi protokol>"> dan menjawab lewat window.postMessage.

const SHIP_TIMEOUT_MS = 90000;
// Cetak menunggu user menekan Print di beberapa dialog cetak
const PRINT_TIMEOUT_MS = 30 * 60000;
const PROTOCOL_VERSION = 3;

export type AutoShipPlatform = 'shopee' | 'iopen';

export const AUTO_SHIP_LABELS: Record<AutoShipPlatform, { site: string; action: string }> = {
  shopee: { site: 'Shopee', action: '安排出貨' },
  iopen: { site: 'iOPEN Mall', action: '取寄件編號' },
};

export const isAutoShipExtensionInstalled = (): boolean =>
  Number(document.documentElement.dataset.kbiAutoShipExt) >= PROTOCOL_VERSION;

/**
 * Jumlah order yang boleh diproses bersamaan oleh "Action Semua". Extension protokol 4 membuka satu tab
 * per order secara paralel (MAX_PARALLEL_SHIP di background.js - samakan angkanya); versi lama memproses
 * satu per satu, jadi permintaan yang dikirim sekaligus akan kena timeout saat mengantre.
 */
export const AUTO_SHIP_PARALLEL = 5;
export const autoShipConcurrency = (): number =>
  Number(document.documentElement.dataset.kbiAutoShipExt) >= 4 ? AUTO_SHIP_PARALLEL : 1;

export interface PrintStepResult {
  label: string;
  ok: boolean;
  printed: number;
  error?: string;
}

/** Bagian cetak label: Shopee 蝦皮店到店, Shopee 7-ELEVEN, iOPEN Mall */
export type PrintSection = 'shopee-store' | 'shopee-711' | 'iopen';

export const PRINT_SECTION_LABELS: Record<PrintSection, string> = {
  'shopee-store': 'Shopee 蝦皮店到店',
  'shopee-711': 'Shopee 7-ELEVEN',
  iopen: 'iOPEN Mall',
};

export interface PrintLabelsResult {
  steps: PrintStepResult[];
  /** Order modal yang tidak ditemukan di halaman cetak situsnya */
  missing: string[];
}

// Kirim permintaan ke extension dan tunggu balasan KBI_RESULT dengan id yang sama
const callExtension = (
  type: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  timeoutMessage: string,
  opts: { id?: string; onProgress?: (text: string) => void } = {}
): Promise<any> => {
  if (!isAutoShipExtensionInstalled()) {
    return Promise.reject(new Error('Extension KBI Auto 出貨 belum terpasang / perlu di-reload di Chrome'));
  }

  const id = opts.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (event.source !== window || msg?.source !== 'kbi-ext' || msg.id !== id) return;
      if (msg.type === 'KBI_PROGRESS') {
        opts.onProgress?.(msg.text);
        return;
      }
      if (msg.type !== 'KBI_RESULT') return;
      cleanup();
      resolve(msg);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'kbi-erp', type, id, ...payload }, '*');
  });
};

/**
 * Tentukan situs dari format nomor order (bukan dari kolom platform, yang bisa tercatat 7-Eleven dll.):
 * - Shopee: 14 karakter, diawali tanggal YYMMDD, mis. 260922PH3B4R6P
 * - iOPEN Mall: 9 angka, mis. 503397944
 */
export const getAutoShipPlatform = (orderNo: string): AutoShipPlatform | null => {
  const no = orderNo.trim().toUpperCase();
  if (/^\d{6}[A-Z0-9]{8}$/.test(no)) return 'shopee';
  if (/^\d{9}$/.test(no)) return 'iopen';
  return null;
};

/** Ambil nomor resi lewat extension (Shopee: 安排出貨, iOPEN Mall: 取寄件編號). */
export const requestTrackingNumber = async (platform: AutoShipPlatform, orderNo: string): Promise<string> => {
  const site = AUTO_SHIP_LABELS[platform].site;
  const msg = await callExtension('AUTO_SHIP', { platform, orderNo }, SHIP_TIMEOUT_MS, `Timeout menunggu ${site}`);
  if (msg.ok && msg.resi) return msg.resi;
  throw new Error(msg.error || `Gagal mengambil nomor resi dari ${site}`);
};

/**
 * Bagian cetak untuk satu order, atau null kalau labelnya tidak dicetak lewat extension.
 * iOPEN dari nomor order; Shopee dari nomor resi: TW…/SPX… = 蝦皮店到店, 1 huruf + 11 angka = 7-ELEVEN
 * (全家, 萊爾富, dll. tidak dicetak).
 */
export const getPrintSection = (orderNo: string, resi: string): PrintSection | null => {
  const cleanResi = resi.replace(/[\s\-_.]+/g, '').toUpperCase();
  if (!cleanResi) return null;
  const platform = getAutoShipPlatform(orderNo);
  if (platform === 'iopen') return 'iopen';
  if (platform !== 'shopee') return null;
  if (/^(TW|SPX)/.test(cleanResi)) return 'shopee-store';
  if (/^[A-Z]\d{11}$/.test(cleanResi)) return 'shopee-711';
  return null;
};

/** Cetak label untuk order-order ini; tiap bagian berjalan bersamaan di tab sendiri. */
export const requestPrintLabels = async (orders: { orderNo: string; section: PrintSection }[]): Promise<PrintLabelsResult> => {
  const sections: Record<PrintSection, string[]> = { 'shopee-store': [], 'shopee-711': [], iopen: [] };
  for (const o of orders) sections[o.section].push(o.orderNo.trim().toUpperCase());
  const msg = await callExtension('PRINT_LABELS', { sections }, PRINT_TIMEOUT_MS, 'Timeout menunggu proses cetak');
  if (!msg.ok) throw new Error(msg.error || 'Gagal mencetak label');
  return { steps: msg.results || [], missing: msg.missing || [] };
};

/** Ringkasan hasil cetak untuk ditampilkan ke user. */
export const formatPrintResult = ({ steps, missing }: PrintLabelsResult): { text: string; ok: boolean } => {
  const parts = steps.map(r => (r.ok ? `${r.label}: ${r.printed}` : `${r.label}: gagal (${r.error})`));
  return {
    text: (parts.length ? parts.join(' · ') : 'Tidak ada label untuk dicetak') + (missing.length ? ` · tidak ditemukan: ${missing.join(', ')}` : ''),
    ok: steps.every(r => r.ok) && missing.length === 0,
  };
};

/** Platform yang pelunasannya bisa dicek lewat extension (dataset diset erp-bridge.js) */
export type PaymentPlatform = AutoShipPlatform | 'familymart';

export const PAYMENT_PLATFORM_LABELS: Record<PaymentPlatform, string> = {
  shopee: 'Shopee',
  iopen: 'iOPEN Mall',
  familymart: 'FamilyMart',
};
const PAYMENT_DATASET: Record<PaymentPlatform, string> = { shopee: 'kbiShopeePayment', iopen: 'kbiIopenPayment', familymart: 'kbiFamilymartPayment' };
const PAYMENT_MESSAGE: Record<PaymentPlatform, string> = { shopee: 'SHOPEE_PAYMENT', iopen: 'IOPEN_PAYMENT', familymart: 'FAMILYMART_PAYMENT' };

export const isPaymentCheckAvailable = (platform: PaymentPlatform): boolean =>
  isAutoShipExtensionInstalled() && document.documentElement.dataset[PAYMENT_DATASET[platform]] === '1';

export interface PlatformPaymentInfo {
  /** Shopee: 訂單歷史 berisi 款項已完成轉帳 · iOPEN: 對帳單 berstatus 匯款成功 · FamilyMart: 匯款狀態 匯款成功 */
  transferred: boolean;
  /** Tanggal 款項已完成轉帳 / 匯款時間 / 匯款成功(…), YYYY-MM-DD */
  paidDate?: string;
  /** Shopee 原始訂單進帳 / iOPEN 撥款金額 / FamilyMart 金額 (NT$, bukan sen) */
  amount?: number;
  /** Status di situs kalau belum lunas (mis. 匯款中) */
  status?: string;
}

/**
 * Cek pelunasan order lewat extension. Shopee: detail order (訂單歷史 + 原始訂單進帳).
 * iOPEN Mall: 對帳單 yang memuat order, berstatus 匯款成功 → 對帳單詳情 → 撥款金額.
 * FamilyMart: `orderNo` = nomor resi (寄件編號) → 訂單／匯款查詢 → 匯款狀態 + 金額.
 */
export const requestPlatformPayment = async (platform: PaymentPlatform, orderNo: string): Promise<PlatformPaymentInfo> => {
  const site = PAYMENT_PLATFORM_LABELS[platform];
  const msg = await callExtension(PAYMENT_MESSAGE[platform], { orderNo: orderNo.trim().toUpperCase() }, SHIP_TIMEOUT_MS, `Timeout menunggu ${site}`);
  if (msg.ok && msg.payment) return msg.payment;
  throw new Error(msg.error || `Gagal membaca pelunasan ${site}`);
};

export const isShopeeImportAvailable = (): boolean =>
  isAutoShipExtensionInstalled() && Number(document.documentElement.dataset.kbiShopeeImport) >= 2; // 2 = progres + Batal

export interface ShopeeImportResult {
  /** Order 待處理 yang detailnya terbaca (order di `skip` tidak dibuka) */
  orders: import('./shopee-import').ShopeeImportOrder[];
  /** Order yang detailnya gagal dibaca (tidak disimpan; ikut ditarik lagi lain kali) */
  errors: { sn: string; error: string }[];
  /** Jumlah order di daftar Shopee, dan jumlah yang dilewati karena sudah ada di ERP */
  listed: number;
  skipped: number;
  /** Jumlah 待處理 menurut Shopee (untuk memastikan semua halaman terbaca) */
  expected: number | null;
  /** Dihentikan sebelum selesai (Batal / tab Shopee ditutup / waktu habis); `orders` berisi yang sudah terbaca */
  cancelled?: string;
}

const IMPORT_TIMEOUT_MS = 25 * 60000;
let currentImportId: string | null = null;

/**
 * Buka Seller Center di tab latar belakang dan baca semua order 待出貨 (待處理).
 * `skip` = nomor order yang sudah ada di ERP (detailnya tidak dibuka). `onProgress` menerima teks progres.
 */
export const requestShopeeOrders = async (skip: string[], onProgress?: (text: string) => void): Promise<ShopeeImportResult> => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  currentImportId = id;
  try {
    const msg = await callExtension('SHOPEE_IMPORT', { skip }, IMPORT_TIMEOUT_MS, 'Timeout menarik order Shopee', { id, onProgress });
    if (!msg.ok) throw new Error(msg.error || 'Gagal menarik order Shopee');
    return {
      orders: msg.orders || [],
      errors: msg.errors || [],
      listed: msg.listed || 0,
      skipped: msg.skipped || 0,
      expected: msg.expected ?? null,
      cancelled: msg.cancelled ? msg.note || 'Dibatalkan' : undefined,
    };
  } finally {
    if (currentImportId === id) currentImportId = null;
  }
};

/** Hentikan penarikan yang sedang berjalan; order yang sudah terbaca tetap dikembalikan ke requestShopeeOrders. */
export const cancelShopeeImport = (): void => {
  if (currentImportId) window.postMessage({ source: 'kbi-erp', type: 'SHOPEE_IMPORT_CANCEL', id: currentImportId }, '*');
};
