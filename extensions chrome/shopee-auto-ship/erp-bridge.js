// Jembatan antara halaman ERP (window.postMessage) dan service worker extension.
document.documentElement.dataset.kbiAutoShipExt = '3'; // versi protokol: 3 = PRINT_LABELS per bagian

const FORWARDED = ['AUTO_SHIP', 'PRINT_LABELS'];

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
  if (msg?.type !== 'RESULT') return;
  const { type, ...result } = msg;
  window.postMessage({ source: 'kbi-ext', type: 'KBI_RESULT', ...result }, '*');
});
