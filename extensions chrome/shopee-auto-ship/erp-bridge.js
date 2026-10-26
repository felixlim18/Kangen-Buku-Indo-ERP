// Jembatan antara halaman ERP (window.postMessage) dan service worker extension.
document.documentElement.dataset.kbiAutoShipExt = '3'; // versi protokol: 3 = PRINT_LABELS per bagian, AUTO_SHIP satu per satu (4 = paralel, saat ini tidak dipakai)

document.documentElement.dataset.kbiShopeePayment = '1'; // cek pelunasan Shopee (款項已完成轉帳 + 原始訂單進帳) tersedia
document.documentElement.dataset.kbiIopenPayment = '1'; // cek pelunasan iOPEN Mall (對帳單 匯款成功 + 撥款金額) tersedia
document.documentElement.dataset.kbiFamilymartPayment = '1'; // cek pelunasan FamilyMart (匯款成功 + 金額, per nomor resi) tersedia

document.documentElement.dataset.kbiShopeeImport = '2'; // tarik order 待出貨 Shopee ke Sales Orders (2 = progres + Batal)

const FORWARDED = ['AUTO_SHIP', 'PRINT_LABELS', 'SHOPEE_PAYMENT', 'IOPEN_PAYMENT', 'FAMILYMART_PAYMENT', 'SHOPEE_IMPORT', 'SHOPEE_IMPORT_CANCEL'];

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== 'kbi-erp' || !FORWARDED.includes(msg.type)) return;
  const { source, ...payload } = msg;
  chrome.runtime.sendMessage(payload).catch((err) => {
    window.postMessage({ source: 'kbi-ext', type: 'KBI_RESULT', id: msg.id, ok: false, error: `Extension error: ${err.message}` }, '*');
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PROGRESS') {
    window.postMessage({ source: 'kbi-ext', type: 'KBI_PROGRESS', id: msg.id, text: msg.text }, '*');
    return;
  }
  if (msg?.type !== 'RESULT') return;
  const { type, ...result } = msg;
  window.postMessage({ source: 'kbi-ext', type: 'KBI_RESULT', ...result }, '*');
});
