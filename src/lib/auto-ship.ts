// Komunikasi dengan Chrome extension "KBI Auto 出貨" (folder "extensions chrome/shopee-auto-ship").
// Extension menandai <html data-kbi-auto-ship-ext="<versi protokol>"> dan menjawab lewat window.postMessage.

const SHIP_TIMEOUT_MS = 90000;
// Cetak menunggu user menekan Print di beberapa dialog cetak
const PRINT_TIMEOUT_MS = 30 * 60000;
const PROTOCOL_VERSION = 2;

export type AutoShipPlatform = 'shopee' | 'iopen';

export const AUTO_SHIP_LABELS: Record<AutoShipPlatform, { site: string; action: string }> = {
  shopee: { site: 'Shopee', action: '安排出貨' },
  iopen: { site: 'iOPEN Mall', action: '取寄件編號' },
};

export const isAutoShipExtensionInstalled = (): boolean =>
  Number(document.documentElement.dataset.kbiAutoShipExt) >= PROTOCOL_VERSION;

export interface PrintStepResult {
  label: string;
  ok: boolean;
  printed: number;
  missing: string[];
  error?: string;
}

// Kirim permintaan ke extension dan tunggu balasan KBI_RESULT dengan id yang sama
const callExtension = (type: string, payload: Record<string, unknown>, timeoutMs: number, timeoutMessage: string): Promise<any> => {
  if (!isAutoShipExtensionInstalled()) {
    return Promise.reject(new Error('Extension KBI Auto 出貨 belum terpasang / perlu di-reload di Chrome'));
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (event.source !== window || msg?.source !== 'kbi-ext' || msg.type !== 'KBI_RESULT' || msg.id !== id) return;
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

/** Cetak label (Shopee 蝦皮店到店 & 7-ELEVEN, iOPEN Mall) untuk order-order ini. */
export const requestPrintLabels = async (shopeeOrders: string[], iopenOrders: string[]): Promise<PrintStepResult[]> => {
  const msg = await callExtension('PRINT_LABELS', { shopeeOrders, iopenOrders }, PRINT_TIMEOUT_MS, 'Timeout menunggu proses cetak');
  if (!msg.ok) throw new Error(msg.error || 'Gagal mencetak label');
  return msg.results || [];
};
