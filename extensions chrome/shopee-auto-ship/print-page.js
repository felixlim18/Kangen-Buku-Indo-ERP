// Halaman cetak label: Shopee /awbprint (蝦皮店到店), 7-11 交貨便服務單 (Shopee 7-ELEVEN),
// iOPEN st711_c2c_od_print.php. Dijalankan di document_start supaya cetak otomatis dari halaman ikut terdeteksi.
// Tombol "Print" di dialog cetak Chrome tetap ditekan user (extension tidak bisa menekannya).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

let printStarted = false;
let printEnded = false;
window.addEventListener('beforeprint', () => { printStarted = true; });
window.addEventListener('afterprint', () => { printEnded = true; });

async function waitFor(fn, timeoutMs, intervalMs = 300) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(intervalMs);
  }
  return null;
}

const focusTab = () => chrome.runtime.sendMessage({ type: 'PRINT_FOCUS' });

// Shopee /awbprint: PDF label di iframe, dicetak lewat tombol 列印出貨文件
async function printShopeeAwb() {
  const button = await waitFor(() => {
    const done = [...document.querySelectorAll('li, p, div')].some((e) => text(e).startsWith('出貨文件已下載完成'));
    const b = [...document.querySelectorAll('button')].find((x) => text(x).includes('列印出貨文件') && !x.disabled);
    return done && document.querySelector('iframe') ? b : null;
  }, 60000);
  if (!button) throw new Error('Dokumen label Shopee tidak selesai dimuat.');
  await focusTab();
  await sleep(500);
  button.click();
  // Dialog cetak (dari iframe PDF) membuat halaman kehilangan fokus; selesai saat fokus kembali
  const opened = await waitFor(() => !document.hasFocus(), 8000, 200);
  if (opened) await waitFor(() => document.hasFocus(), 10 * 60000, 500);
}

// Halaman label HTML (7-11 / iOPEN): cetak seperti Ctrl+P setelah label selesai dirender
async function printHtmlPage() {
  if (document.readyState !== 'complete') await new Promise((r) => window.addEventListener('load', r, { once: true }));
  await document.fonts?.ready;
  await sleep(2500); // tata letak label berubah sesaat setelah dimuat
  await focusTab();
  if (printStarted) {
    // Halaman sudah membuka dialog cetak sendiri
    await waitFor(() => printEnded, 10 * 60000, 500);
    return;
  }
  window.print(); // menunggu sampai dialog ditutup (Print / Cancel)
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'PRINT_STEP') return;
  const run = location.pathname.startsWith('/awbprint') ? printShopeeAwb : printHtmlPage;
  run()
    // Tab label HTML ditutup setelah dialog selesai; tab PDF Shopee dibiarkan (selesainya dialog tidak pasti)
    .then(() => chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: true, closeTab: run === printHtmlPage }))
    .catch((err) => chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: false, error: err.message }));
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => chrome.runtime.sendMessage({ type: 'READY' }), { once: true });
} else {
  chrome.runtime.sendMessage({ type: 'READY' });
}
