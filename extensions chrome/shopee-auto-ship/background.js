// Antrian job, diproses satu per satu.
// - ship : ambil nomor resi satu order (Shopee 安排出貨 / iOPEN Mall 取寄件編號) di tab kerja per platform
// - print: cetak label order dari modal ERP. Shopee 蝦皮店到店, Shopee 7-ELEVEN, dan iOPEN Mall berjalan
//          bersamaan, masing-masing di jendela sendiri (Shopee hanya memproses centang di halaman yang tampil).
const IOPEN_ADMWEB = 'https://sales.iopenmall.tw/050497/admweb/admweb.main.php';
const SHIP_TIMEOUT_MS = 60000;
const PRINT_STEP_TIMEOUT_MS = 90000; // sampai dialog cetak muncul
const PRINT_DIALOG_TIMEOUT_MS = 10 * 60000; // menunggu user menekan Print / Cancel
const WINDOW_OFFSET = 60; // jendela cetak bertumpuk bergeser, supaya tiap jendela tetap terlihat

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
    queue.push({ kind: 'print', id: msg.id, shopee: msg.shopeeOrders || [], iopen: msg.iopenOrders || [], screen: msg.screen, erpTabId: tabId });
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
  } else if (msg.type === 'PRINT_FOCUS') {
    // Dialog cetak segera muncul: bawa jendelanya ke depan
    armStepTimer(step, PRINT_DIALOG_TIMEOUT_MS);
    chrome.windows.update(step.windowId, { focused: true }).then(() => sendResponse(true), () => sendResponse(false));
    return true;
  } else if (msg.type === 'STEP_DONE') {
    completeStep(step, { ok: msg.ok, printed: msg.printed, error: msg.error });
    // Jendela label HTML ditutup; jendela PDF Shopee dibiarkan (selesainya dialog PDF tidak pasti)
    if (msg.closeTab) chrome.windows.remove(step.windowId).catch(() => {});
  }
});

// Kalau situs tetap membuka tab baru untuk halaman cetak, ikuti tab tersebut
chrome.tabs.onCreated.addListener((tab) => {
  const step = tab.openerTabId != null && stepOfTab(tab.openerTabId);
  if (step) step.tabId = tab.id;
});

// Jendela langkah ditutup user sebelum selesai
chrome.tabs.onRemoved.addListener((tabId) => {
  const step = stepOfTab(tabId);
  if (step) completeStep(step, { ok: false, error: 'Jendela cetak ditutup sebelum selesai' });
});

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
  job.steps = [
    { site: 'shopee', method: '30015', label: 'Shopee 蝦皮店到店', orders: job.shopee, url: shopeeMassUrl('30015') },
    { site: 'shopee', method: '7', label: 'Shopee 7-ELEVEN', orders: job.shopee, url: shopeeMassUrl('7') },
    { site: 'iopen', label: 'iOPEN Mall', orders: job.iopen, url: IOPEN_BATCH_URL },
  ].filter((s) => s.orders.length > 0);
  if (job.steps.length === 0) {
    finishPrint();
    return;
  }

  // Jendela bertumpuk sedikit bergeser di area layar ERP
  const scr = job.screen || { left: 0, top: 0, width: 1440, height: 900 };
  const n = job.steps.length;
  const width = Math.max(800, Math.round(scr.width - WINDOW_OFFSET * (n - 1)));
  const height = Math.max(600, Math.round(scr.height - WINDOW_OFFSET * (n - 1)));

  await Promise.all(
    job.steps.map(async (step, i) => {
      step.selectedOrders = [];
      armStepTimer(step, PRINT_STEP_TIMEOUT_MS);
      try {
        // Buka kosong dulu, catat id-nya, baru muat halaman (supaya pesan READY pertama sudah dikenali)
        const win = await chrome.windows.create({
          url: 'about:blank',
          left: Math.round(scr.left + WINDOW_OFFSET * i),
          top: Math.round(scr.top + WINDOW_OFFSET * i),
          width,
          height,
          focused: i === n - 1,
        });
        step.windowId = win.id;
        step.tabId = win.tabs[0].id;
        await chrome.tabs.update(step.tabId, { url: step.url });
      } catch (err) {
        completeStep(step, { ok: false, error: `Gagal membuka jendela: ${err.message}` });
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

  // Bawa jendela cetak berikutnya yang dialognya masih terbuka ke depan
  const pending = current.steps.filter((s) => !s.result);
  if (pending.length > 0) {
    chrome.windows.update(pending[pending.length - 1].windowId, { focused: true }).catch(() => {});
  } else {
    finishPrint();
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

// Order yang tidak ketemu di langkah mana pun untuk situsnya (Shopee punya 2 langkah: 店到店 & 7-11).
// Situs yang salah satu langkahnya gagal tidak dihitung, karena belum tentu ordernya memang tidak ada.
function missingOrders(steps) {
  const missing = [];
  for (const site of new Set(steps.map((s) => s.site))) {
    const siteSteps = steps.filter((s) => s.site === site);
    if (siteSteps.some((s) => !s.result?.ok)) continue;
    const found = new Set(siteSteps.flatMap((s) => s.selectedOrders));
    missing.push(...siteSteps[0].orders.filter((o) => !found.has(o)));
  }
  return missing;
}

function finish(result) {
  const job = current;
  if (!job) return;
  clearTimeout(job.timer);
  current = null;
  chrome.tabs.sendMessage(job.erpTabId, { type: 'RESULT', id: job.id, ...result }).catch(() => {});
  runNext();
}
