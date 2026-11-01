// Auto Order iOPEN (dimuat background.js lewat importScripts): buat order pembeli di toko iOPEN Mall sendiri
// (mall.iopenmall.tw/050497) untuk SO Direct Order 7-Eleven COD, lalu kembalikan 訂單編號 ke ERP.
// Satu order dalam satu waktu, di tab latar belakang baru (ditutup setelah selesai). Langkahnya per halaman
// (iopen-order.js menjalankan langkah halaman yang sedang tampil, lalu melapor IO_STEP):
//   catalog : halaman toko -> baca produk (harga, stok) -> pilih kombinasi yang totalnya = total SO
//   clear   : keranjang -> hapus semua produk
//   add     : halaman produk -> jumlah -> 加入購物車 (per produk)
//   cart    : keranjang -> cek produk, jumlah & 總金額 -> 前往結帳
//   store   : checkout -> 請選擇取貨門市
//   emap    : peta 7-11 -> cari 門市店號 / 門市名稱 -> 門市確認 -> 同意 -> 確認 (kembali ke checkout)
//   fill    : checkout -> nama, HP, OPENPOINT off, cek toko & total, centang setuju, 備註 = nomor SO
//             -> (latihan: berhenti di sini, keranjang dikosongkan) -> 前往結帳
//   result  : halaman 完成訂購 -> 訂單編號
// Setelah 前往結帳 terakhir ditekan, kegagalan apa pun dilaporkan sebagai "unknown" (order mungkin sudah
// terbuat) dan tidak pernah diulang otomatis. Hasil order sungguhan disimpan di chrome.storage.local sampai
// ERP mengonfirmasi (IOPEN_ORDER_ACK), jadi tidak hilang kalau tab ERP tertutup.
const IO_STORE_URL = 'https://mall.iopenmall.tw/050497/';
const IO_CART_URL = `${IO_STORE_URL}index.php?action=shopping_cart`;
const IO_PRODUCT_URL = (no) => `${IO_STORE_URL}index.php?action=product_detail&prod_no=${encodeURIComponent(no)}`;
const IO_PHASE_TIMEOUT_MS = 90000; // per langkah
const IO_PAGE_READY_MS = 10000; // halaman selesai dimuat tapi skrip tidak aktif -> halaman login / tak dikenal
const IO_MAX_CART_ATTEMPTS = 2;
const IO_RESULTS_KEY = 'iopenOrderResults';
const IO_INFLIGHT_KEY = 'iopenOrderInFlight';

const ioQueue = [];
let ioCurrent = null;
let ioKeepAlive = null;

const ioStorage = {
  async get(key) {
    return (await chrome.storage.local.get(key))[key];
  },
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
  remove: (key) => chrome.storage.local.remove(key),
};

async function ioSaveResult(soId, result) {
  const all = (await ioStorage.get(IO_RESULTS_KEY)) || {};
  all[soId] = { ...result, at: Date.now() };
  await ioStorage.set(IO_RESULTS_KEY, all);
}

// Service worker sempat mati setelah 前往結帳 ditekan: order mungkin sudah terbuat -> catat sebagai unknown
(async () => {
  const inFlight = await ioStorage.get(IO_INFLIGHT_KEY);
  if (!inFlight || ioCurrent) return;
  await ioSaveResult(inFlight.soId, {
    soCode: inFlight.soCode,
    ok: false,
    state: 'unknown',
    submitted: true,
    items: inFlight.items || [],
    error: 'Extension terhenti setelah tombol 前往結帳 ditekan. Cek di iOPEN apakah order sudah terbuat.',
  });
  await ioStorage.remove(IO_INFLIGHT_KEY);
})();

function ioSyncKeepAlive() {
  const on = Boolean(ioCurrent) || ioQueue.length > 0;
  if (on && !ioKeepAlive) ioKeepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  if (!on && ioKeepAlive) {
    clearInterval(ioKeepAlive);
    ioKeepAlive = null;
  }
}

const ioItemsText = (plan) => (plan || []).map((it) => `${it.name} x${it.qty} @${it.price}`);

// Data yang dikirim ke halaman (tanpa id tab dll.)
const ioJobView = (job) => ({
  phase: job.phase,
  soCode: job.req.soCode,
  amount: job.req.amount,
  name: job.req.name,
  phone: job.req.phone,
  store: job.req.store,
  dryRun: job.dryRun,
  plan: job.plan,
  addIndex: job.addIndex,
  picked: job.picked,
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  switch (msg?.type) {
    case 'IOPEN_ORDER':
      ioQueue.push({ id: msg.id, soId: msg.soId, req: msg.req, dryRun: !!msg.dryRun, erpTabId: tabId, erpWindowId: sender.tab.windowId });
      // Tanda terima: ERP menganggap permintaan hilang kalau tidak ada kabar dalam beberapa detik
      if (ioCurrent) ioProgress(ioQueue[ioQueue.length - 1], `menunggu order ${ioCurrent.req.soCode} selesai`);
      ioPump();
      return;
    case 'IOPEN_ORDER_PENDING':
      // ERP baru dibuka: kirim hasil order yang belum tercatat di SO
      ioStorage.get(IO_RESULTS_KEY).then((all) => {
        chrome.tabs.sendMessage(tabId, { type: 'RESULT', id: msg.id, ok: true, results: all || {}, busy: ioCurrent?.soId || null }).catch(() => {});
      });
      return;
    case 'IOPEN_ORDER_ACK':
      ioStorage.get(IO_RESULTS_KEY).then((all) => {
        if (!all || !all[msg.soId]) return;
        delete all[msg.soId];
        return ioStorage.set(IO_RESULTS_KEY, all);
      });
      return;
    case 'IO_READY': {
      const job = ioCurrent && ioCurrent.tabId === tabId ? ioCurrent : null;
      if (job) {
        job.pageReady = true;
        clearTimeout(job.readyTimer);
      }
      sendResponse({ job: job ? ioJobView(job) : null });
      return;
    }
    case 'IO_STEP': {
      const job = ioCurrent && ioCurrent.tabId === tabId ? ioCurrent : null;
      if (!job) {
        sendResponse({ proceed: false });
        return;
      }
      ioOnStep(job, msg).then(
        (r) => sendResponse(r || { proceed: true }),
        (err) => {
          sendResponse({ proceed: false });
          ioFinish(job, { ok: false, error: err.message });
        }
      );
      return true;
    }
    case 'IO_PROGRESS':
      if (ioCurrent && ioCurrent.tabId === tabId) ioProgress(ioCurrent, msg.text);
      return;
    case 'IO_SHOW_TAB':
      if (ioCurrent && ioCurrent.tabId === tabId) {
        ioCurrent.shownTab = true;
        showTab(tabId).then(() => setTimeout(() => sendResponse(true), 600), () => sendResponse(false));
        return true;
      }
      return;
  }
});

// Halaman baru harus melapor (IO_READY) dalam beberapa detik setelah selesai dimuat. IO_READY bisa datang
// sebelum status 'complete', jadi yang dicek tanda pageReady per halaman, bukan urutan kejadiannya.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  const job = ioCurrent && ioCurrent.tabId === tabId ? ioCurrent : null;
  if (!job) return;
  if (info.status === 'loading') {
    job.pageReady = false;
    clearTimeout(job.readyTimer);
    return;
  }
  if (info.status !== 'complete' || job.pageReady) return;
  clearTimeout(job.readyTimer);
  job.readyTimer = setTimeout(() => {
    if (ioCurrent !== job || job.pageReady) return;
    chrome.tabs.get(tabId).then(
      (tab) => ioFail(job, `Halaman tidak dikenal (${(tab.url || '').split('?')[0]}). Pastikan akun pembeli iOPEN Mall sudah login di Chrome ini.`),
      () => {}
    );
  }, IO_PAGE_READY_MS);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (ioCurrent && ioCurrent.tabId === tabId) ioFail(ioCurrent, 'Tab iOPEN ditutup sebelum selesai');
});

function ioProgress(job, text) {
  chrome.tabs.sendMessage(job.erpTabId, { type: 'PROGRESS', id: job.id, text: `${job.req.soCode}: ${text}` }).catch(() => {});
}

function ioArm(job, ms = IO_PHASE_TIMEOUT_MS) {
  clearTimeout(job.timer);
  job.timer = setTimeout(() => ioFail(job, `Timeout di langkah "${job.phase}"`), ms);
}

function ioGo(job, phase, url) {
  job.phase = phase;
  ioArm(job);
  return chrome.tabs.update(job.tabId, { url });
}

function ioPump() {
  if (!ioCurrent && ioQueue.length) ioStart(ioQueue.shift());
  ioSyncKeepAlive();
}

async function ioStart(job) {
  ioCurrent = job;
  job.cartAttempts = 0;
  job.addIndex = 0;
  ioSyncKeepAlive();
  try {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: job.erpWindowId });
    job.tabId = tab.id;
    ioProgress(job, 'membaca produk toko iOPEN');
    await ioGo(job, 'catalog', IO_STORE_URL);
  } catch (err) {
    ioFail(job, `Gagal membuka tab iOPEN: ${err.message}`);
  }
}

// Laporan langkah dari halaman. Nilai kembali dikirim ke halaman; { proceed: true } = lanjutkan klik berikutnya.
async function ioOnStep(job, msg) {
  if (msg.phase !== job.phase) return { proceed: false }; // laporan terlambat dari halaman sebelumnya
  if (!msg.ok) {
    ioFail(job, msg.error || `Gagal di langkah "${job.phase}"`);
    return { proceed: false };
  }
  switch (job.phase) {
    case 'catalog':
      job.plan = msg.plan;
      ioProgress(job, `produk: ${ioItemsText(job.plan).join(', ')}; mengosongkan keranjang`);
      await ioGo(job, 'clear', IO_CART_URL);
      return { proceed: false };
    case 'clear':
    case 'cleanup':
      if (msg.more) {
        await ioGo(job, job.phase, IO_CART_URL);
        return { proceed: false };
      }
      if (job.phase === 'cleanup') {
        ioFinish(job, { ok: true, dryRun: true, preview: job.preview, items: ioItemsText(job.plan) });
        return { proceed: false };
      }
      job.addIndex = 0;
      ioProgress(job, `memasukkan ${job.plan[0].name} x${job.plan[0].qty} ke keranjang`);
      await ioGo(job, 'add', IO_PRODUCT_URL(job.plan[0].no));
      return { proceed: false };
    case 'add':
      job.addIndex++;
      if (job.addIndex < job.plan.length) {
        const it = job.plan[job.addIndex];
        ioProgress(job, `memasukkan ${it.name} x${it.qty} ke keranjang`);
        await ioGo(job, 'add', IO_PRODUCT_URL(it.no));
      } else {
        ioProgress(job, 'memeriksa keranjang');
        await ioGo(job, 'cart', IO_CART_URL);
      }
      return { proceed: false };
    case 'cart':
      if (msg.mismatch) {
        job.cartAttempts++;
        if (job.cartAttempts >= IO_MAX_CART_ATTEMPTS) {
          ioFail(job, `Isi keranjang tetap tidak sesuai setelah ${job.cartAttempts}x: ${msg.mismatch}`);
          return { proceed: false };
        }
        ioProgress(job, `keranjang tidak sesuai (${msg.mismatch}); diulang`);
        await ioGo(job, 'clear', IO_CART_URL);
        return { proceed: false };
      }
      job.phase = 'store';
      ioArm(job);
      ioProgress(job, 'membuka checkout');
      return { proceed: true };
    case 'store':
      job.phase = 'emap';
      ioArm(job);
      ioProgress(job, 'memilih toko 7-11');
      return { proceed: true };
    case 'emap':
      if (msg.picked) {
        job.picked = msg.picked;
        ioArm(job);
        return { proceed: true };
      }
      if (!job.picked) throw new Error('Toko 7-11 belum dipilih');
      job.phase = 'fill';
      ioArm(job);
      ioProgress(job, `toko ${job.picked.id} ${job.picked.name}; mengisi data penerima`);
      return { proceed: true };
    case 'fill':
      job.preview = msg.preview;
      if (job.dryRun) {
        ioProgress(job, 'latihan selesai; mengosongkan keranjang');
        await ioGo(job, 'cleanup', IO_CART_URL);
        return { proceed: false };
      }
      // Titik tanpa kembali: catat dulu, baru halaman menekan 前往結帳
      await ioStorage.set(IO_INFLIGHT_KEY, { soId: job.soId, soCode: job.req.soCode, items: ioItemsText(job.plan), at: Date.now() });
      job.submitted = true;
      job.phase = 'result';
      ioArm(job);
      ioProgress(job, 'menekan 前往結帳');
      return { proceed: true };
    case 'result':
      ioFinish(job, { ok: true, orderNo: msg.orderNo, preview: job.preview, items: ioItemsText(job.plan) });
      return { proceed: false };
  }
  return { proceed: false };
}

function ioFail(job, error) {
  ioFinish(job, { ok: false, error });
}

async function ioFinish(job, result) {
  if (ioCurrent !== job) return;
  clearTimeout(job.timer);
  clearTimeout(job.readyTimer);
  ioCurrent = null;
  const final = {
    soCode: job.req.soCode,
    items: ioItemsText(job.plan),
    submitted: !!job.submitted,
    ...result,
    state: result.ok ? 'done' : job.submitted ? 'unknown' : 'failed',
  };
  if (final.state === 'unknown') final.error = `${final.error} (setelah 前往結帳 ditekan: cek di iOPEN apakah order sudah terbuat)`;
  if (!job.dryRun) {
    await ioSaveResult(job.soId, final);
    await ioStorage.remove(IO_INFLIGHT_KEY);
  }
  // Tab dibiarkan terbuka kalau order mungkin sudah terbuat, supaya bisa dicek
  if (final.state !== 'unknown' && job.tabId != null) chrome.tabs.remove(job.tabId).catch(() => {});
  if (job.shownTab) {
    chrome.tabs
      .update(job.erpTabId, { active: true })
      .then((tab) => chrome.windows.update(tab.windowId, { focused: true }))
      .catch(() => {});
  }
  chrome.tabs.sendMessage(job.erpTabId, { type: 'RESULT', id: job.id, soId: job.soId, ...final }).catch(() => {});
  ioPump();
}
