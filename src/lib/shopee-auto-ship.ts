// Komunikasi dengan Chrome extension "KBI Shopee Auto 安排出貨" (folder "extensions chrome/shopee-auto-ship").
// Extension menandai <html data-kbi-shopee-ext="1"> dan menjawab lewat window.postMessage.

const TIMEOUT_MS = 90000;

export const isShopeeExtensionInstalled = (): boolean =>
  document.documentElement.dataset.kbiShopeeExt === '1';

export const isShopeePlatform = (platform: string): boolean =>
  platform.toLowerCase().includes('shopee');

/** Jalankan 安排出貨 di Shopee Seller Center dan kembalikan nomor resinya. */
export const requestShopeeTrackingNumber = (orderNo: string): Promise<string> => {
  if (!isShopeeExtensionInstalled()) {
    return Promise.reject(new Error('Extension Shopee Auto 安排出貨 belum terpasang di Chrome'));
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (event.source !== window || msg?.source !== 'kbi-ext' || msg.type !== 'SHOPEE_ARRANGE_RESULT' || msg.id !== id) return;
      cleanup();
      if (msg.ok && msg.resi) resolve(msg.resi);
      else reject(new Error(msg.error || 'Gagal mengambil nomor resi dari Shopee'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout menunggu Shopee'));
    }, TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'kbi-erp', type: 'SHOPEE_ARRANGE', id, orderNo }, '*');
  });
};
