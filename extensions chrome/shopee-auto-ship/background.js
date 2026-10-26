// Dua jenis job:
// - ship : (action 'ship') ambil nomor resi satu order, atau (action 'payment') cek pelunasan satu order:
//          Shopee (款項已完成轉帳 + 原始訂單進帳 di halaman detail order) / iOPEN Mall (對帳單 匯款成功 + 撥款金額) /
//          FamilyMart 店到店取貨付款 (訂單／匯款查詢: 匯款成功(tanggal) + 金額, dicari lewat nomor resi).
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
  familymart: { label: 'FamilyMart 取貨付款匯款查詢' },
};

// iOPEN: cek pelunasan dimulai dari 帳務管理 → 對帳單 (iopen.js mengisi pencarian 訂單編號)
const IOPEN_STATEMENT_URL = `${IOPEN_ADMWEB}?action=account_statement_pic`;
// FamilyMart: halaman ini memuat iframe www.fami.life/C2C (familymart.js) dengan sesi login
const FAMILYMART_QUERY_URL = 'https://fmec.famiport.com.tw/FP_Entrance/QueryPay';
const jobUrl = (job) => {
  if (job.platform === 'familymart') return FAMILYMART_QUERY_URL;
  if (job.platform === 'iopen' && job.action === 'payment') return IOPEN_STATEMENT_URL;
  return SHIP_URL[job.platform](job.orderNo);
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
const workerTabs = { shopee: null, iopen: null, familymart: null }; // platform -> tabId tab kerja
const shipQueue = [];
let shipCurrent = null; // job ship yang sedang berjalan
let workerIdleTimer = null;

const printQueue = [];
let current = null; // job print yang sedang berjalan

// Tarik order Shopee (SHOPEE_IMPORT): satu job dalam satu waktu, di tab latar belakang sendiri
// 待出貨 → 待處理, urutan 訂單確認時間 (最新到最舊)
const IMPORT_LIST_URL = 'https://seller.shopee.tw/portal/sale/order?type=toship&source=to_process&sort_by=confirmed_date_desc';
const IMPORT_PAGE_TIMEOUT_MS = 40000; // halaman daftar / detail sampai skrip siap
const IMPORT_JOB_TIMEOUT_MS = 20 * 60000;
const importQueue = [];
let importCurrent = null;
const importWaiters = new Map(); // tabId -> { page, resolve }

// Chrome mematikan service worker yang menganggur ~30 detik, sehingga status job hilang (mis. saat user
// lama di dialog cetak). Selama ada job, panggil API extension berkala supaya service worker tetap hidup.
let keepAlive = null;
// Tetap hidup juga selama tab kerja menunggu ditutup (timer idle hilang kalau service worker dimatikan)
const hasWorkerTab = () => Object.values(workerTabs).some((t) => t != null);
const syncKeepAlive = () => setKeepAlive(Boolean(current) || Boolean(shipCurrent) || shipQueue.length > 0 || hasWorkerTab() || Boolean(importCurrent) || importQueue.length > 0);
const shipJobOfTab = (tabId) => (shipCurrent && shipCurrent.tabId === tabId ? shipCurrent : null);
function setKeepAlive(on) {
  if (on && !keepAlive) keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  if (!on && keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

const PAYMENT_PLATFORM = { SHOPEE_PAYMENT: 'shopee', IOPEN_PAYMENT: 'iopen', FAMILYMART_PAYMENT: 'familymart' };

const stepOfTab = (tabId) => (current?.kind === 'print' ? current.steps.find((s) => s.tabId === tabId && !s.result) : null);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'SHOPEE_IMPORT') {
    importQueue.push({ id: msg.id, skip: new Set(msg.skip || []), erpTabId: tabId, erpWindowId: sender.tab.windowId });
    pumpImport();
    return;
  }
  if (msg.type === 'SHOPEE_IMPORT_CANCEL') {
    // Batal dari ERP: order yang sudah terbaca tetap dikirim; job yang masih mengantre dibuang
    const queued = importQueue.findIndex((j) => j.id === msg.id);
    if (queued >= 0) {
      const [job] = importQueue.splice(queued, 1);
      sendResult(job, { ok: true, cancelled: true, orders: [], errors: [], listed: 0, skipped: 0, expected: null });
    } else if (importCurrent && importCurrent.id === msg.id) {
      importCurrent.cancelled = true;
      importWaiters.get(importCurrent.tabId)?.reject(new ImportCancelled());
    }
    return;
  }
  if (msg.type === 'IMPORT_PROGRESS') {
    if (importCurrent && importCurrent.tabId === tabId) sendImportProgress(importCurrent, msg.text);
    return;
  }
  if (msg.type === 'IMPORT_READY') {
    const w = importWaiters.get(tabId);
    if (w && w.page === msg.page) w.resolve();
    return;
  }
  if (msg.type === 'IMPORT_SHOW_TAB') {
    if (importCurrent && importCurrent.tabId === tabId) {
      importCurrent.shownTab = true;
      showTab(tabId).then(() => setTimeout(() => sendResponse(true), 500), () => sendResponse(false));
      return true;
    }
    return;
  }

  if (msg.type === 'AUTO_SHIP' || PAYMENT_PLATFORM[msg.type]) {
    const isPayment = msg.type !== 'AUTO_SHIP';
    shipQueue.push({
      kind: 'ship',
      action: isPayment ? 'payment' : 'ship',
      id: msg.id,
      platform: PAYMENT_PLATFORM[msg.type] || msg.platform,
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
  if (importCurrent && importCurrent.tabId === tabId) {
    // Tab Shopee ditutup user = batal (order yang sudah terbaca tetap disimpan)
    importCurrent.cancelled = true;
    importWaiters.get(tabId)?.reject(new ImportCancelled());
    return;
  }
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
      finishShip(job, { ok: false, error: `Halaman ${SITES[job.platform].label} tidak terbuka. Pastikan sudah login di Chrome ini.` });
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
  return chrome.tabs.update(job.tabId, { url: jobUrl(job) });
}

async function startShip(job) {
  shipCurrent = job;
  clearTimeout(workerIdleTimer);
  syncKeepAlive();
  if (!SITES[job.platform] || (job.platform === 'familymart' && job.action !== 'payment')) {
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
    if (job.platform === 'shopee' || job.platform === 'familymart') {
      // Halaman order Shopee / daftar FamilyMart yang sudah terbuka dipakai langsung, tanpa refresh
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


// ----- tarik order Shopee: daftar 待處理 -> detail tiap order (satu per satu, satu tab) -----
// Shopee lambat: tiap halaman dicoba ulang sekali (dimuat ulang) sebelum dianggap gagal.
// Detail yang tetap gagal dicatat dan dilewati (tidak disimpan ERP, ikut ditarik lagi lain kali);
// daftar yang gagal menghentikan job, karena tanpa daftar lengkap order bisa terlewat.
class ImportCancelled extends Error {
  constructor() {
    super('Dibatalkan');
  }
}

function pumpImport() {
  if (!importCurrent && importQueue.length > 0) runImport(importQueue.shift());
  syncKeepAlive();
}

function sendImportProgress(job, text) {
  chrome.tabs.sendMessage(job.erpTabId, { type: 'PROGRESS', id: job.id, text }).catch(() => {});
}

// Daftarkan penunggu SEBELUM halaman dimuat supaya IMPORT_READY pertama tidak terlewat
function expectImportPage(tabId, page) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      importWaiters.delete(tabId);
      reject(new Error('timeout'));
    }, IMPORT_PAGE_TIMEOUT_MS);
    importWaiters.set(tabId, {
      page,
      resolve: () => { clearTimeout(timer); importWaiters.delete(tabId); resolve(); },
      reject: (e) => { clearTimeout(timer); importWaiters.delete(tabId); reject(e); },
    });
  });
}

// Halaman tidak siap: belum login (dialihkan ke halaman masuk / domain lain) atau Shopee lambat
async function pageFailReason(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const url = tab?.url || '';
  if (!url.startsWith('https://seller.shopee.tw/') || /signin|login|verify|captcha/i.test(url)) {
    return 'Belum login Shopee Seller Center di Chrome ini (halaman masuk muncul). Login dulu lalu tekan Tarik Shopee lagi.';
  }
  return 'Shopee lambat merespons (halaman tidak termuat setelah dicoba ulang). Coba lagi beberapa saat lagi.';
}

// Muat `url` lalu kirim `command`; kalau halaman / perintah gagal, muat ulang sekali dan coba lagi
async function loadAndRun(job, url, page, command) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (job.cancelled) throw new ImportCancelled();
    try {
      const ready = expectImportPage(job.tabId, page);
      await chrome.tabs.update(job.tabId, { url });
      await ready;
    } catch (err) {
      if (err instanceof ImportCancelled || job.cancelled) throw new ImportCancelled();
      if (err.closed) throw err;
      lastError = new Error(await pageFailReason(job.tabId));
      continue;
    }
    const res = await chrome.tabs.sendMessage(job.tabId, command).catch((e) => ({ ok: false, error: e.message }));
    if (job.cancelled) throw new ImportCancelled();
    if (res?.ok) return res;
    lastError = new Error(res?.error || 'Tidak ada jawaban dari halaman Shopee');
  }
  throw lastError;
}

async function runImport(job) {
  importCurrent = job;
  syncKeepAlive();
  const orders = [];
  const errors = [];
  let listed = 0;
  let expected = null;
  let skipped = 0;
  const overall = setTimeout(() => {
    job.timedOut = true;
    job.cancelled = true;
    importWaiters.get(job.tabId)?.reject(new ImportCancelled());
  }, IMPORT_JOB_TIMEOUT_MS);
  const partial = () => ({ orders, errors, listed, expected, skipped });
  try {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: job.erpWindowId });
    job.tabId = tab.id;

    sendImportProgress(job, 'Membuka Shopee…');
    const list = await loadAndRun(job, IMPORT_LIST_URL, 'list', { type: 'IMPORT_LIST' });
    listed = list.orders.length;
    expected = list.expected;
    const todo = list.orders.filter((o) => !job.skip.has(o.sn));
    skipped = listed - todo.length;

    for (let i = 0; i < todo.length; i++) {
      const o = todo[i];
      sendImportProgress(job, `Detail ${i + 1}/${todo.length} · ${o.sn}`);
      try {
        const d = await loadAndRun(job, o.url, 'detail', { type: 'IMPORT_DETAIL', sn: o.sn });
        orders.push({ ...o, ...d.detail });
      } catch (err) {
        if (err instanceof ImportCancelled || err.closed) throw err;
        errors.push({ sn: o.sn, error: err.message });
      }
    }
    finishImport(job, overall, { ok: true, ...partial() });
  } catch (err) {
    if (err instanceof ImportCancelled) {
      // Order yang sudah terbaca tetap disimpan ERP
      finishImport(job, overall, {
        ok: true,
        cancelled: true,
        note: job.timedOut ? 'Waktu habis (20 menit)' : 'Dibatalkan',
        ...partial(),
      });
    } else {
      finishImport(job, overall, { ok: false, error: err.message, ...partial() });
    }
  }
}

function finishImport(job, overall, result) {
  clearTimeout(overall);
  if (importCurrent !== job) return;
  importCurrent = null;
  importWaiters.delete(job.tabId);
  if (job.tabId != null) chrome.tabs.remove(job.tabId).catch(() => {});
  if (job.shownTab) {
    chrome.tabs
      .update(job.erpTabId, { active: true })
      .then((tab) => chrome.windows.update(tab.windowId, { focused: true }))
      .catch(() => {});
  }
  sendResult(job, result);
  pumpImport();
}
