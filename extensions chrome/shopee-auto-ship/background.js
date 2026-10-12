// Antrian job, diproses satu per satu.
// - ship : ambil nomor resi satu order (Shopee 安排出貨 / iOPEN Mall 取寄件編號) di tab kerja per platform
// - print: cetak label order dari modal ERP. Shopee 蝦皮店到店, Shopee 7-ELEVEN, dan iOPEN Mall berjalan
//          bersamaan, masing-masing di tab sendiri di jendela ERP (tidak saling menunggu).
const IOPEN_ADMWEB = 'https://sales.iopenmall.tw/050497/admweb/admweb.main.php';
const SHIP_TIMEOUT_MS = 60000;
const PRINT_STEP_TIMEOUT_MS = 90000; // sampai dialog cetak muncul
const PRINT_DIALOG_TIMEOUT_MS = 10 * 60000; // menunggu user menekan Print / Cancel

const SITES = {
  shopee: { label: 'Shopee Seller Center' },
  iopen: { label: 'iOPEN Mall 賣家中心' },
};

const SHIP_URL = {
  shopee: () => 'https://seller.shopee.tw/portal/sale/order',
  // 新訂單 (待出貨, order_status=11) dengan pencarian 訂單編號
  iopen: (orderNo) =>
    `${IOPEN_ADMWEB}?action=order_control_pic&order_status=11&search_type=order_uid&s_data=${encodeURIComponent(orderNo)}#tab11`,
};

// 批次出貨 → 下載出貨文件, 訂單狀態 已處理, 訂單出貨天數 全部, per 物流方式
const shopeeMassUrl = (method) =>
  `https://seller.shopee.tw/portal/sale/mass/ship?mass_shipment_tab=301&filter.shipping_method=${method}&filter.order_process_status=2&filter.pre_order=0`;
const IOPEN_BATCH_URL = `${IOPEN_ADMWEB}?action=order_control_batch_pic&order_status=21#tab21`;

const queue = [];
let current = null;

// Chrome mematikan service worker yang menganggur ~30 detik, sehingga status job hilang (mis. saat user
// lama di dialog cetak). Selama ada job, panggil API extension berkala supaya service worker tetap hidup.
let keepAlive = null;
function setKeepAlive(on) {
  if (on && !keepAlive) keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  if (!on && keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

const stepOfTab = (tabId) => (current?.kind === 'print' ? current.steps.find((s) => s.tabId === tabId && !s.result) : null);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'AUTO_SHIP') {
    queue.push({ kind: 'ship', id: msg.id, platform: msg.platform, orderNo: msg.orderNo, erpTabId: tabId });
    runNext();
    return;
  }
  if (msg.type === 'PRINT_LABELS') {
    queue.push({ kind: 'print', id: msg.id, sections: msg.sections || {}, erpTabId: tabId, erpWindowId: sender.tab.windowId, erpIndex: sender.tab.index });
    runNext();
    return;
  }

  // ----- ship -----
  if (current?.kind === 'ship' && tabId === current.workerTabId) {
    if (msg.type === 'READY') {
      chrome.tabs.sendMessage(tabId, { type: 'RUN', platform: current.platform, orderNo: current.orderNo });
    } else if (msg.type === 'DONE') {
      finish({ ok: msg.ok, resi: msg.resi, error: msg.error });
    }
    return;
  }

  // ----- print -----
  const step = stepOfTab(tabId);
  if (!step) return;
  if (msg.type === 'READY') {
    // Halaman di jendela langkah ini selesai dimuat -> lanjutkan (alurnya melewati beberapa halaman)
    chrome.tabs.sendMessage(tabId, { type: 'PRINT_STEP', step: { site: step.site, method: step.method, label: step.label, orders: step.orders } });
  } else if (msg.type === 'STEP_PROGRESS') {
    step.selectedOrders = msg.selectedOrders || [];
    armStepTimer(step, PRINT_STEP_TIMEOUT_MS);
  } else if (msg.type === 'NEED_VISIBLE') {
    // Cadangan: halaman perlu tampil sebentar (mis. Shopee belum memproses centang di tab latar belakang)
    showTab(step.tabId).then(() => setTimeout(() => sendResponse(true), 800), () => sendResponse(false));
    return true;
  } else if (msg.type === 'PRINT_FOCUS') {
    // Dialog cetak segera muncul: tampilkan tabnya (kecuali sedang ada dialog lain yang terbuka)
    armStepTimer(step, PRINT_DIALOG_TIMEOUT_MS);
    step.dialog = true;
    const busy = current.steps.some((s) => s !== step && s.dialog && !s.result && s.shown);
    if (!busy) step.shown = true;
    (busy ? Promise.resolve() : showTab(step.tabId)).then(() => sendResponse(true), () => sendResponse(false));
    return true;
  } else if (msg.type === 'STEP_DONE') {
    completeStep(step, { ok: msg.ok, printed: msg.printed, error: msg.error });
    // Tab label HTML ditutup; tab PDF Shopee dibiarkan (selesainya dialog PDF tidak pasti)
    if (msg.closeTab) chrome.tabs.remove(step.tabId).catch(() => {});
  }
});

// Kalau situs tetap membuka tab baru untuk halaman cetak, ikuti tab tersebut
chrome.tabs.onCreated.addListener((tab) => {
  const step = tab.openerTabId != null && stepOfTab(tab.openerTabId);
  if (step) step.tabId = tab.id;
});

// Tab langkah ditutup user sebelum selesai
chrome.tabs.onRemoved.addListener((tabId) => {
  const step = stepOfTab(tabId);
  if (step) completeStep(step, { ok: false, error: 'Tab cetak ditutup sebelum selesai' });
});

async function showTab(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

// Pakai tab khusus milik extension, jangan mengambil alih tab yang sedang dipakai user
async function openWorkerTab(site, url) {
  const key = `workerTab_${site}`;
  const { [key]: tabId } = await chrome.storage.session.get(key);
  if (tabId) {
    try {
      await chrome.tabs.update(tabId, { url });
      return tabId;
    } catch {
      // tab sudah ditutup user -> buat baru
    }
  }
  const tab = await chrome.tabs.create({ url, active: false });
  await chrome.storage.session.set({ [key]: tab.id });
  return tab.id;
}

async function runNext() {
  if (current) return;
  if (queue.length === 0) {
    setKeepAlive(false);
    return;
  }
  setKeepAlive(true);
  current = queue.shift();

  if (current.kind === 'print') {
    startPrint();
    return;
  }

  if (!SHIP_URL[current.platform]) {
    finish({ ok: false, error: `Platform tidak didukung: ${current.platform}` });
    return;
  }
  current.timer = setTimeout(
    () => finish({ ok: false, error: `Timeout. Pastikan ${SITES[current.platform].label} sudah login di Chrome ini.` }),
    SHIP_TIMEOUT_MS
  );
  try {
    // Selalu muat ulang halaman supaya tidak ada dialog/pencarian sisa dari order sebelumnya
    current.workerTabId = await openWorkerTab(current.platform, SHIP_URL[current.platform](current.orderNo));
  } catch (err) {
    finish({ ok: false, error: `Gagal membuka tab ${SITES[current.platform].label}: ${err.message}` });
  }
}

async function startPrint() {
  const job = current;
  // ERP sudah mengelompokkan order per bagian (Shopee per 物流方式 dari nomor resi)
  const sec = job.sections;
  job.steps = [
    { site: 'shopee', method: '30015', label: 'Shopee 蝦皮店到店', orders: sec['shopee-store'] || [], url: shopeeMassUrl('30015') },
    { site: 'shopee', method: '7', label: 'Shopee 7-ELEVEN', orders: sec['shopee-711'] || [], url: shopeeMassUrl('7') },
    { site: 'iopen', label: 'iOPEN Mall', orders: sec.iopen || [], url: IOPEN_BATCH_URL },
  ].filter((s) => s.orders.length > 0);
  if (job.steps.length === 0) {
    finishPrint();
    return;
  }

  // Semua langkah jalan bersamaan, tiap langkah di tab latar belakang sendiri di sebelah tab ERP
  await Promise.all(
    job.steps.map(async (step, i) => {
      step.selectedOrders = [];
      armStepTimer(step, PRINT_STEP_TIMEOUT_MS);
      try {
        // Buka kosong dulu, catat id-nya, baru muat halaman (supaya pesan READY pertama sudah dikenali)
        const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: job.erpWindowId, index: job.erpIndex + 1 + i });
        step.tabId = tab.id;
        await chrome.tabs.update(step.tabId, { url: step.url });
      } catch (err) {
        completeStep(step, { ok: false, error: `Gagal membuka tab: ${err.message}` });
      }
    })
  );
}

function armStepTimer(step, ms) {
  clearTimeout(step.timer);
  step.timer = setTimeout(() => completeStep(step, { ok: false, error: 'Timeout (pastikan sudah login)' }), ms);
}

function completeStep(step, { ok, printed, error }) {
  if (step.result || current?.kind !== 'print' || !current.steps.includes(step)) return;
  clearTimeout(step.timer);
  step.result = { ok, printed: ok ? printed ?? step.selectedOrders.length : 0, error };

  // Tampilkan tab berikutnya yang dialog cetaknya sudah menunggu
  const pending = current.steps.filter((s) => !s.result);
  if (pending.length === 0) {
    finishPrint();
    return;
  }
  const waiting = pending.find((s) => s.dialog);
  if (waiting && step.shown) {
    waiting.shown = true;
    showTab(waiting.tabId).catch(() => {});
  }
}

function finishPrint() {
  const steps = current.steps || [];
  chrome.tabs
    .update(current.erpTabId, { active: true })
    .then((tab) => chrome.windows.update(tab.windowId, { focused: true }))
    .catch(() => {});
  finish({
    ok: true,
    results: steps.map((s) => ({ label: s.label, ...s.result })),
    missing: missingOrders(steps),
  });
}

// Order yang tidak ketemu di halaman cetak bagiannya (langkah yang gagal tidak dihitung)
function missingOrders(steps) {
  return steps.filter((s) => s.result?.ok).flatMap((s) => s.orders.filter((o) => !s.selectedOrders.includes(o)));
}

function finish(result) {
  const job = current;
  if (!job) return;
  clearTimeout(job.timer);
  current = null;
  chrome.tabs.sendMessage(job.erpTabId, { type: 'RESULT', id: job.id, ...result }).catch(() => {});
  runNext();
}
