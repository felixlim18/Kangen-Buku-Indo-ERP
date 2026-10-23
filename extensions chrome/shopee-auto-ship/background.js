// Dua jenis job:
// - ship : (action 'ship') ambil nomor resi satu order, atau (action 'payment') cek pelunasan Shopee satu order
//          (款項已完成轉帳 + 原始訂單進帳 di halaman detail order).
//          Ambil nomor resi (Shopee 安排出貨 / iOPEN Mall 取寄件編號), SATU PER SATU, di satu tab
//          kerja per platform yang dipakai bergantian. Shopee: order berikutnya dicari langsung di halaman yang
//          sudah terbuka TANPA refresh (refresh hanya kalau halaman belum siap / pencarian di tempat gagal).
//          Tab kerja ditutup setelah 1 menit tidak dipakai.
// - print: cetak label order dari modal ERP, satu job cetak dalam satu waktu. Di dalamnya Shopee 蝦皮店到店,
//          Shopee 7-ELEVEN, dan iOPEN Mall berjalan bersamaan, masing-masing di tab sendiri di jendela ERP.
//          Job cetak tidak menunggu job ship (dan sebaliknya).
const IOPEN_ADMWEB = 'https://sales.iopenmall.tw/050497/admweb/admweb.main.php';
const SHIP_TIMEOUT_MS = 60000; // per order, juga untuk cek pelunasan Shopee
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

// Satu order dalam satu waktu (erp-bridge.js mengumumkan protokol 3, ERP juga mengirim satu per satu).
const WORKER_IDLE_CLOSE_MS = 60000;
const LOGIN_CHECK_MS = 6000; // halaman selesai dimuat tapi skrip tidak aktif -> kemungkinan halaman login
const workerTabs = { shopee: null, iopen: null }; // platform -> tabId tab kerja
const shipQueue = [];
let shipCurrent = null; // job ship yang sedang berjalan
let workerIdleTimer = null;

const printQueue = [];
let current = null; // job print yang sedang berjalan

// Chrome mematikan service worker yang menganggur ~30 detik, sehingga status job hilang (mis. saat user
// lama di dialog cetak). Selama ada job, panggil API extension berkala supaya service worker tetap hidup.
let keepAlive = null;
// Tetap hidup juga selama tab kerja menunggu ditutup (timer idle hilang kalau service worker dimatikan)
const hasWorkerTab = () => Object.values(workerTabs).some((t) => t != null);
const syncKeepAlive = () => setKeepAlive(Boolean(current) || Boolean(shipCurrent) || shipQueue.length > 0 || hasWorkerTab());
const shipJobOfTab = (tabId) => (shipCurrent && shipCurrent.tabId === tabId ? shipCurrent : null);
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

  if (msg.type === 'AUTO_SHIP' || msg.type === 'SHOPEE_PAYMENT') {
    const isPayment = msg.type === 'SHOPEE_PAYMENT';
    shipQueue.push({
      kind: 'ship',
      action: isPayment ? 'payment' : 'ship',
      id: msg.id,
      platform: isPayment ? 'shopee' : msg.platform,
      orderNo: msg.orderNo,
      erpTabId: tabId,
      erpWindowId: sender.tab.windowId,
    });
    pumpShip();
    return;
  }
  if (msg.type === 'PRINT_LABELS') {
    printQueue.push({ kind: 'print', id: msg.id, sections: msg.sections || {}, erpTabId: tabId, erpWindowId: sender.tab.windowId, erpIndex: sender.tab.index });
    runNextPrint();
    return;
  }

  // ----- ship -----
  const shipJob = shipJobOfTab(tabId);
  if (shipJob) {
    if (msg.type === 'READY') {
      shipJob.loading = false;
      if (!shipJob.pageLoadedAt) shipJob.pageLoadedAt = Date.now();
      chrome.tabs.sendMessage(tabId, { type: 'RUN', action: shipJob.action, platform: shipJob.platform, orderNo: shipJob.orderNo });
    } else if (msg.type === 'SHOW_TAB') {
      // Konten lazy-load (mis. 進帳資訊 Shopee) tidak dimuat di tab latar belakang: tampilkan tab kerja sebentar
      shipJob.shownTab = true;
      showTab(tabId).then(() => setTimeout(() => sendResponse(true), 500), () => sendResponse(false));
      return true;
    } else if (msg.type === 'DONE') {
      if (!msg.ok && shipJob.inPlace && !shipJob.retried) {
        // Pencarian di halaman yang dipakai ulang gagal -> refresh sekali lalu coba lagi
        shipJob.retried = true;
        navigateWorker(shipJob);
        return;
      }
      finishShip(shipJob, { ok: msg.ok, resi: msg.resi, payment: msg.payment, error: msg.error });
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

// Tab ditutup user sebelum selesai
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const p of Object.keys(workerTabs)) if (workerTabs[p] === tabId) workerTabs[p] = null;
  syncKeepAlive();
  const shipJob = shipJobOfTab(tabId);
  if (shipJob) {
    finishShip(shipJob, { ok: false, error: 'Tab ditutup sebelum resi didapat' });
    return;
  }
  const step = stepOfTab(tabId);
  if (step) completeStep(step, { ok: false, error: 'Tab cetak ditutup sebelum selesai' });
});

async function showTab(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

// ----- ship: satu per satu, tab kerja per platform dipakai ulang -----
// Halaman selesai dimuat tapi skrip extension tidak mengirim READY -> bukan halaman order (mis. halaman login)
chrome.tabs.onUpdated.addListener((tabId, info) => {
  const job = shipJobOfTab(tabId);
  if (!job || info.status !== 'complete' || !job.loading) return;
  setTimeout(() => {
    if (shipCurrent === job && job.loading) {
      finishShip(job, { ok: false, error: `Halaman ${SITES[job.platform].label} tidak terbuka di daftar order. Pastikan sudah login di Chrome ini.` });
    }
  }, LOGIN_CHECK_MS);
});

function pumpShip() {
  if (!shipCurrent && shipQueue.length > 0) startShip(shipQueue.shift());
  syncKeepAlive();
}

async function workerTab(job) {
  const existing = workerTabs[job.platform];
  if (existing != null) {
    try {
      await chrome.tabs.get(existing);
      return existing;
    } catch {
      workerTabs[job.platform] = null;
    }
  }
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: job.erpWindowId });
  workerTabs[job.platform] = tab.id;
  return tab.id;
}

function navigateWorker(job) {
  job.inPlace = false;
  job.loading = true;
  job.navigations = (job.navigations || 0) + 1;
  return chrome.tabs.update(job.tabId, { url: SHIP_URL[job.platform](job.orderNo) });
}

async function startShip(job) {
  shipCurrent = job;
  clearTimeout(workerIdleTimer);
  syncKeepAlive();
  if (!SHIP_URL[job.platform]) {
    finishShip(job, { ok: false, error: `Platform tidak didukung: ${job.platform}` });
    return;
  }
  job.startedAt = Date.now();
  job.timer = setTimeout(
    () => finishShip(job, { ok: false, error: `Timeout. Pastikan ${SITES[job.platform].label} sudah login di Chrome ini.` }),
    SHIP_TIMEOUT_MS
  );
  try {
    job.tabId = await workerTab(job);
    if (job.platform === 'shopee') {
      // Halaman order Shopee yang sudah terbuka dipakai langsung, tanpa refresh
      const ping = await chrome.tabs.sendMessage(job.tabId, { type: 'PING' }).catch(() => null);
      if (shipCurrent === job && ping?.ready) {
        job.inPlace = true;
        chrome.tabs.sendMessage(job.tabId, { type: 'RUN', action: job.action, platform: job.platform, orderNo: job.orderNo });
        return;
      }
    }
    await navigateWorker(job);
  } catch (err) {
    finishShip(job, { ok: false, error: `Gagal membuka tab ${SITES[job.platform].label}: ${err.message}` });
  }
}

function finishShip(job, result) {
  if (shipCurrent !== job) return; // sudah selesai (mis. timeout lalu DONE datang terlambat)
  clearTimeout(job.timer);
  shipCurrent = null;
  if (job.shownTab) {
    // Kembali ke tab ERP setelah tab kerja ditampilkan
    chrome.tabs
      .update(job.erpTabId, { active: true })
      .then((tab) => chrome.windows.update(tab.windowId, { focused: true }))
      .catch(() => {});
  }
  if (!result.ok && job.startedAt) {
    const secs = Math.round((Date.now() - job.startedAt) / 1000);
    const how = job.navigations ? `halaman dimuat ${job.navigations}x` : 'tanpa refresh';
    result = { ...result, error: `${result.error} [${secs} dtk, ${how}]` };
  }
  sendResult(job, result);
  // Tab kerja dibiarkan terbuka untuk order berikutnya; ditutup kalau 1 menit tidak dipakai
  clearTimeout(workerIdleTimer);
  workerIdleTimer = setTimeout(() => {
    if (shipCurrent || shipQueue.length) return;
    for (const p of Object.keys(workerTabs)) {
      if (workerTabs[p] != null) chrome.tabs.remove(workerTabs[p]).catch(() => {});
      workerTabs[p] = null;
    }
    syncKeepAlive();
  }, WORKER_IDLE_CLOSE_MS);
  pumpShip();
}

function sendResult(job, result) {
  chrome.tabs.sendMessage(job.erpTabId, { type: 'RESULT', id: job.id, ...result }).catch(() => {});
}

// ----- print: satu job cetak dalam satu waktu -----
function runNextPrint() {
  if (current || printQueue.length === 0) {
    syncKeepAlive();
    return;
  }
  current = printQueue.shift();
  syncKeepAlive();
  startPrint();
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
  sendResult(job, result);
  runNextPrint();
}
