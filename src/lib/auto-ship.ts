// Komunikasi dengan Chrome extension "KBI Auto 出貨" (folder "extensions chrome/shopee-auto-ship").
// Extension menandai <html data-kbi-auto-ship-ext="1"> dan menjawab lewat window.postMessage.

const TIMEOUT_MS = 90000;

export type AutoShipPlatform = 'shopee' | 'iopen';

export const AUTO_SHIP_LABELS: Record<AutoShipPlatform, { site: string; action: string }> = {
  shopee: { site: 'Shopee', action: '安排出貨' },
  iopen: { site: 'iOPEN Mall', action: '取寄件編號' },
};

export const isAutoShipExtensionInstalled = (): boolean =>
  document.documentElement.dataset.kbiAutoShipExt === '1';

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
export const requestTrackingNumber = (platform: AutoShipPlatform, orderNo: string): Promise<string> => {
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
      if (event.source !== window || msg?.source !== 'kbi-ext' || msg.type !== 'AUTO_SHIP_RESULT' || msg.id !== id) return;
      cleanup();
      if (msg.ok && msg.resi) resolve(msg.resi);
      else reject(new Error(msg.error || `Gagal mengambil nomor resi dari ${AUTO_SHIP_LABELS[platform].site}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout menunggu ${AUTO_SHIP_LABELS[platform].site}`));
    }, TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'kbi-erp', type: 'AUTO_SHIP', id, platform, orderNo }, '*');
  });
};
