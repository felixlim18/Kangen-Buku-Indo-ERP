// Antrian job: satu order diproses sekali jalan di satu tab Shopee (tab latar belakang).
const ORDER_LIST_URL = 'https://seller.shopee.tw/portal/sale/order';
const JOB_TIMEOUT_MS = 60000;

const queue = [];
let current = null; // { id, orderNo, erpTabId, shopeeTabId, timer }

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'ARRANGE') {
    queue.push({ id: msg.id, orderNo: msg.orderNo, erpTabId: sender.tab.id });
    runNext();
  } else if (msg.type === 'READY' && current && sender.tab.id === current.shopeeTabId && !current.started) {
    // Halaman daftar order Shopee selesai dimuat -> mulai otomatisasi
    current.started = true;
    chrome.tabs.sendMessage(current.shopeeTabId, { type: 'RUN', orderNo: current.orderNo });
  } else if (msg.type === 'DONE' && current && sender.tab.id === current.shopeeTabId) {
    finish({ ok: msg.ok, resi: msg.resi, error: msg.error });
  }
});

// Pakai tab khusus milik extension, jangan mengambil alih tab Shopee yang sedang dipakai user
async function getShopeeTab() {
  const { workerTabId } = await chrome.storage.session.get('workerTabId');
  if (workerTabId) {
    try {
      await chrome.tabs.update(workerTabId, { url: ORDER_LIST_URL });
      return workerTabId;
    } catch {
      // tab sudah ditutup user -> buat baru
    }
  }
  const tab = await chrome.tabs.create({ url: ORDER_LIST_URL, active: false });
  await chrome.storage.session.set({ workerTabId: tab.id });
  return tab.id;
}

async function runNext() {
  if (current || queue.length === 0) return;
  current = queue.shift();
  current.timer = setTimeout(() => finish({ ok: false, error: 'Timeout 60 detik. Pastikan Shopee Seller Center sudah login di Chrome ini.' }), JOB_TIMEOUT_MS);
  try {
    // Selalu muat ulang halaman supaya tidak ada dialog/pencarian sisa dari order sebelumnya
    current.shopeeTabId = await getShopeeTab();
  } catch (err) {
    finish({ ok: false, error: `Gagal membuka tab Shopee: ${err.message}` });
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
