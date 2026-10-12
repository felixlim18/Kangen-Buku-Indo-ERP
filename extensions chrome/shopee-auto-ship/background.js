// Antrian job, diproses satu per satu di tab kerja milik extension (satu tab per platform).
// - ship : ambil nomor resi satu order (Shopee 安排出貨 / iOPEN Mall 取寄件編號)
// - print: cetak label semua order dari modal ERP (Shopee 蝦皮店到店, Shopee 7-ELEVEN, iOPEN Mall)
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fromWorker = current && sender.tab?.id === current.workerTabId;

  if (msg.type === 'AUTO_SHIP') {
    queue.push({ kind: 'ship', id: msg.id, platform: msg.platform, orderNo: msg.orderNo, erpTabId: sender.tab.id });
    runNext();
  } else if (msg.type === 'PRINT_LABELS') {
    queue.push({ kind: 'print', id: msg.id, shopee: msg.shopeeOrders || [], iopen: msg.iopenOrders || [], erpTabId: sender.tab.id });
    runNext();
  } else if (msg.type === 'READY' && fromWorker) {
    // Halaman di tab kerja selesai dimuat -> lanjutkan (alurnya bisa melewati beberapa halaman)
    if (current.kind === 'ship') {
      chrome.tabs.sendMessage(current.workerTabId, { type: 'RUN', platform: current.platform, orderNo: current.orderNo });
    } else {
      chrome.tabs.sendMessage(current.workerTabId, { type: 'PRINT_STEP', step: current.step });
    }
  } else if (msg.type === 'DONE' && fromWorker && current.kind === 'ship') {
    finish({ ok: msg.ok, resi: msg.resi, error: msg.error });
  } else if (msg.type === 'STEP_PROGRESS' && fromWorker && current.kind === 'print') {
    current.step.selectedOrders = msg.selectedOrders || [];
    armTimer(PRINT_STEP_TIMEOUT_MS);
  } else if (msg.type === 'PRINT_FOCUS' && fromWorker && current.kind === 'print') {
    // Dialog cetak hanya muncul di tab yang sedang tampil. Tab ini dilepas dari tab kerja supaya langkah
    // berikutnya dibuka di tab baru dan tidak menutup dialog cetak yang mungkin masih terbuka.
    armTimer(PRINT_DIALOG_TIMEOUT_MS);
    chrome.storage.session.remove(`workerTab_${current.step.site}`);
    chrome.tabs
      .update(current.workerTabId, { active: true })
      .then((tab) => chrome.windows.update(tab.windowId, { focused: true }))
      .then(() => sendResponse(true), () => sendResponse(false));
    return true;
  } else if (msg.type === 'STEP_DONE' && fromWorker && current.kind === 'print') {
    current.results.push({
      label: current.step.label,
      ok: msg.ok,
      site: current.step.site,
      orders: current.step.orders,
      selectedOrders: current.step.selectedOrders || [],
      printed: msg.ok ? msg.printed ?? current.step.selectedOrders?.length ?? 0 : 0,
      error: msg.error,
    });
    if (msg.closeTab) chrome.tabs.remove(sender.tab.id).catch(() => {});
    nextPrintStep();
  }
});

// Kalau situs tetap membuka tab baru untuk halaman cetak, ikuti tab tersebut sebagai tab kerja
chrome.tabs.onCreated.addListener((tab) => {
  if (current?.kind === 'print' && tab.openerTabId === current.workerTabId) current.workerTabId = tab.id;
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

function armTimer(ms) {
  clearTimeout(current.timer);
  const label = current.kind === 'ship' ? SITES[current.platform]?.label : current.step?.label;
  current.timer = setTimeout(() => {
    if (current.kind === 'ship') {
      finish({ ok: false, error: `Timeout. Pastikan ${label} sudah login di Chrome ini.` });
    } else {
      current.results.push({ label, site: current.step.site, orders: current.step.orders, selectedOrders: [], ok: false, printed: 0, error: 'Timeout (pastikan sudah login)' });
      nextPrintStep();
    }
  }, ms);
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
    current.results = [];
    current.steps = [
      { site: 'shopee', method: '30015', label: 'Shopee 蝦皮店到店', orders: current.shopee },
      { site: 'shopee', method: '7', label: 'Shopee 7-ELEVEN', orders: current.shopee },
      { site: 'iopen', label: 'iOPEN Mall', orders: current.iopen },
    ].filter((s) => s.orders.length > 0);
    nextPrintStep();
    return;
  }

  if (!SHIP_URL[current.platform]) {
    finish({ ok: false, error: `Platform tidak didukung: ${current.platform}` });
    return;
  }
  armTimer(SHIP_TIMEOUT_MS);
  try {
    // Selalu muat ulang halaman supaya tidak ada dialog/pencarian sisa dari order sebelumnya
    current.workerTabId = await openWorkerTab(current.platform, SHIP_URL[current.platform](current.orderNo));
  } catch (err) {
    finish({ ok: false, error: `Gagal membuka tab ${SITES[current.platform].label}: ${err.message}` });
  }
}

async function nextPrintStep() {
  current.step = current.steps.shift();
  if (!current.step) {
    chrome.tabs.update(current.erpTabId, { active: true }).catch(() => {});
    finish({ ok: true, results: current.results.map(({ label, ok, printed, error }) => ({ label, ok, printed, error })), missing: missingOrders(current.results) });
    return;
  }
  armTimer(PRINT_STEP_TIMEOUT_MS);
  const url = current.step.site === 'shopee' ? shopeeMassUrl(current.step.method) : `${IOPEN_ADMWEB}?action=order_control_batch_pic&order_status=21#tab21`;
  try {
    current.workerTabId = await openWorkerTab(current.step.site, url);
    // Tampilkan tab kerja: Shopee tidak memperbarui pilihan centang di tab yang tersembunyi
    const tab = await chrome.tabs.update(current.workerTabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (err) {
    current.results.push({ label: current.step.label, site: current.step.site, orders: current.step.orders, selectedOrders: [], ok: false, printed: 0, error: err.message });
    nextPrintStep();
  }
}

// Order yang tidak ketemu di langkah mana pun untuk situsnya (Shopee punya 2 langkah: 店到店 & 7-11).
// Situs yang salah satu langkahnya gagal tidak dihitung, karena belum tentu ordernya memang tidak ada.
function missingOrders(results) {
  const missing = [];
  for (const site of new Set(results.map((r) => r.site))) {
    const steps = results.filter((r) => r.site === site);
    if (steps.some((r) => !r.ok)) continue;
    const found = new Set(steps.flatMap((r) => r.selectedOrders));
    missing.push(...steps[0].orders.filter((o) => !found.has(o)));
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
