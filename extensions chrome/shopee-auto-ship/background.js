// Antrian job: satu order diproses sekali jalan, di tab khusus per platform (tab latar belakang).
const IOPEN_ORDER_PAGE = 'https://sales.iopenmall.tw/050497/admweb/admweb.main.php';
const JOB_TIMEOUT_MS = 60000;

const PLATFORMS = {
  shopee: {
    label: 'Shopee Seller Center',
    startUrl: () => 'https://seller.shopee.tw/portal/sale/order',
  },
  iopen: {
    label: 'iOPEN Mall 賣家中心',
    // 新訂單 (待出貨, order_status=11) dengan pencarian 訂單編號
    startUrl: (orderNo) =>
      `${IOPEN_ORDER_PAGE}?action=order_control_pic&order_status=11&search_type=order_uid&s_data=${encodeURIComponent(orderNo)}#tab11`,
  },
};

const queue = [];
let current = null; // { id, platform, orderNo, erpTabId, workerTabId, timer }

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'AUTO_SHIP') {
    queue.push({ id: msg.id, platform: msg.platform, orderNo: msg.orderNo, erpTabId: sender.tab.id });
    runNext();
  } else if (msg.type === 'READY' && current && sender.tab.id === current.workerTabId) {
    // Halaman di tab kerja selesai dimuat -> lanjutkan otomatisasi (iOPEN bisa beberapa kali pindah halaman)
    chrome.tabs.sendMessage(current.workerTabId, { type: 'RUN', platform: current.platform, orderNo: current.orderNo });
  } else if (msg.type === 'DONE' && current && sender.tab.id === current.workerTabId) {
    finish({ ok: msg.ok, resi: msg.resi, error: msg.error });
  }
});

// Pakai tab khusus milik extension, jangan mengambil alih tab yang sedang dipakai user
async function openWorkerTab(platform, url) {
  const key = `workerTab_${platform}`;
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
  if (current || queue.length === 0) return;
  current = queue.shift();
  const platform = PLATFORMS[current.platform];
  if (!platform) {
    finish({ ok: false, error: `Platform tidak didukung: ${current.platform}` });
    return;
  }
  current.timer = setTimeout(
    () => finish({ ok: false, error: `Timeout 60 detik. Pastikan ${platform.label} sudah login di Chrome ini.` }),
    JOB_TIMEOUT_MS
  );
  try {
    // Selalu muat ulang halaman supaya tidak ada dialog/pencarian sisa dari order sebelumnya
    current.workerTabId = await openWorkerTab(current.platform, platform.startUrl(current.orderNo));
  } catch (err) {
    finish({ ok: false, error: `Gagal membuka tab ${platform.label}: ${err.message}` });
  }
}

function finish(result) {
  const job = current;
  if (!job) return;
  clearTimeout(job.timer);
  current = null;
  chrome.tabs.sendMessage(job.erpTabId, { type: 'RESULT', id: job.id, ...result }).catch(() => {});
  runNext();
}
