// Jembatan antara halaman ERP (window.postMessage) dan service worker extension.
document.documentElement.dataset.kbiAutoShipExt = '1';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== 'kbi-erp' || msg.type !== 'AUTO_SHIP') return;
  chrome.runtime.sendMessage({ type: 'AUTO_SHIP', id: msg.id, platform: msg.platform, orderNo: msg.orderNo }).catch((err) => {
    window.postMessage({ source: 'kbi-ext', type: 'AUTO_SHIP_RESULT', id: msg.id, ok: false, error: `Extension error: ${err.message}` }, '*');
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'RESULT') return;
  window.postMessage({ source: 'kbi-ext', type: 'AUTO_SHIP_RESULT', id: msg.id, ok: msg.ok, resi: msg.resi, error: msg.error }, '*');
});
