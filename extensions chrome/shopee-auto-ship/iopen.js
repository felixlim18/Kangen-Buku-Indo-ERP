// Otomatisasi iOPEN Mall 賣家中心: 新訂單 (待出貨) -> cari 訂單編號 -> 取寄件編號 -> baca nomor resi.
// Background membuka daftar 待出貨 yang sudah difilter 訂單編號. Setiap kali halaman di tab kerja
// selesai dimuat, background mengirim RUN lagi, jadi skrip ini menangani halaman mana pun yang sedang tampil.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const RESI_RE = /^[A-Z0-9]{8,20}$/;

async function waitFor(fn, timeoutMs, intervalMs = 300) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(intervalMs);
  }
  return null;
}

// Halaman hasil setelah 取寄件編號: "已成功產生寄件編號" + nomor resi
async function readCreatedCaseNo(orderNo) {
  const label = await waitFor(
    () => [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && text(e) === '已成功產生寄件編號'),
    10000
  );
  if (!label) {
    const main = text(document.querySelector('#pic-content') || document.body).slice(0, 120);
    throw new Error(`iOPEN tidak menampilkan nomor resi. Pesan halaman: ${main || '-'}`);
  }
  if (!text(document.body).includes(orderNo)) {
    throw new Error(`Halaman hasil iOPEN bukan untuk order ${orderNo}.`);
  }
  // Nomor resi ada di elemen setelah label, cukup cari teks berbentuk resi di blok yang sama
  let box = label.parentElement;
  for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
    const resi = [...box.querySelectorAll('*')].map(text).find((t) => RESI_RE.test(t) && t !== orderNo);
    if (resi) return resi;
  }
  throw new Error('Nomor resi di halaman hasil iOPEN tidak terbaca.');
}

// Daftar order (待出貨 / 出貨中) hasil pencarian 訂單編號
async function handleOrderList(orderNo, status) {
  const card = await waitFor(() => {
    const found = [...document.querySelectorAll('li.admweb-v2-orderlist__card')].find((c) =>
      [...c.querySelectorAll('.admweb-v2-orderlist--order_no')].some((a) => text(a) === orderNo)
    );
    if (found) return found;
    // Kartu & placeholder "目前無訂單資料" sama-sama baru dirender setelah data AJAX diterima
    return document.querySelector('#pic-content .admweb-v2-NoData') ? 'EMPTY' : null;
  }, 15000);
  if (!card) throw new Error('Daftar order iOPEN tidak termuat.');

  if (card === 'EMPTY') {
    if (status === '11') {
      // Tidak ada di 待出貨: mungkin nomor resinya sudah pernah diambil -> cek tab 出貨中
      const url = new URL(location.href);
      url.searchParams.set('order_status', '21');
      url.hash = 'tab21';
      location.href = url.toString();
      return null;
    }
    throw new Error(`Order ${orderNo} tidak ditemukan di 待出貨 maupun 出貨中 iOPEN Mall.`);
  }

  // Sudah punya nomor resi (kolom 配送方式)
  const existing = text(card.querySelector('.admweb-v2-orderlist-delivery_no'));
  if (RESI_RE.test(existing)) return existing;

  const btn = [...card.querySelectorAll('button.admweb-v2-orderlist__card-actions--btn')].find(
    (b) => b.dataset.order_uid === orderNo && text(b).includes('取寄件編號')
  );
  if (!btn) {
    const labels = [...card.querySelectorAll('button')].map(text).join(', ');
    throw new Error(`Tombol 取寄件編號 tidak ada di order ini (aksi tersedia: ${labels || '-'}).`);
  }
  btn.click();

  // Normalnya halaman langsung pindah ke hasil 產生寄件編號. Kalau masih di sini, iOPEN menampilkan pesan error.
  await sleep(20000);
  const alertBox = [...document.querySelectorAll('.modal, [class*="alert"], [class*="Alert"]')].map(text).find(Boolean);
  throw new Error(`取寄件編號 gagal${alertBox ? `: ${alertBox.slice(0, 120)}` : ''}.`);
}

async function run(orderNo) {
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  if (action === 'create_delivery_case_no_pic') return readCreatedCaseNo(orderNo);
  if (action === 'order_control_pic') return handleOrderList(orderNo, params.get('order_status'));
  throw new Error('Halaman iOPEN Mall tidak dikenali. Pastikan sudah login 賣家中心.');
}

// ===== Cetak label: 訂單批次作業 (出貨中) → centang order → 列印超商標籤 → 列印寄件標籤(單排) =====
async function printLabels(step) {
  const action = new URLSearchParams(location.search).get('action');
  document.documentElement.dataset.kbiSameTab = '1'; // halaman cetak dibuka di tab ini (lihat kbi-main.js)

  if (action === 'order_delivery_print_pic') {
    const single = await waitFor(() => [...document.querySelectorAll('button')].find((b) => text(b) === '列印寄件標籤(單排)'), 10000);
    if (!single) throw new Error('Tombol 列印寄件標籤(單排) tidak ditemukan.');
    single.click();
    return null; // pindah ke halaman label
  }

  if (action !== 'order_control_batch_pic') throw new Error('Halaman iOPEN Mall tidak dikenali. Pastikan sudah login 賣家中心.');

  const loaded = await waitFor(
    () => document.querySelector('li.admweb-v2-orderlist__card') || document.querySelector('#pic-content .admweb-v2-NoData'),
    15000
  );
  if (!loaded) throw new Error('Daftar 訂單批次作業 tidak termuat.');

  const found = [];
  for (const orderNo of step.orders) {
    const cb = document.getElementById(orderNo);
    if (cb?.classList.contains('js-admweb-v2--order-checkbox')) {
      cb.checked = true;
      found.push(orderNo);
    }
  }
  if (found.length === 0) return 0;
  chrome.runtime.sendMessage({ type: 'STEP_PROGRESS', selectedOrders: found });

  const button = [...document.querySelectorAll('button')].find((b) => text(b) === '列印超商標籤');
  if (!button) throw new Error('Tombol 列印超商標籤 tidak ditemukan.');
  button.click();
  return null; // pindah ke 多筆列印超商標籤
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'PRINT_STEP' || msg.step?.site !== 'iopen') return;
  printLabels(msg.step)
    .then(async (count) => {
      if (count === 0) {
        chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: true, printed: 0 });
        return;
      }
      // Normalnya halaman pindah. Kalau masih di sini, iOPEN menampilkan pesan error (mis. 溫層 berbeda).
      await sleep(20000);
      const alertText = [...document.querySelectorAll('.modal, [class*="alert"], [class*="Alert"]')].map(text).find(Boolean);
      chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: false, error: `iOPEN tidak membuka halaman cetak${alertText ? `: ${alertText.slice(0, 120)}` : ''}.` });
    })
    .catch((err) => chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: false, error: err.message }));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'RUN' || msg.platform !== 'iopen') return;
  run(msg.orderNo)
    .then((resi) => {
      // null = halaman sedang pindah, RUN berikutnya datang dari halaman baru
      if (resi) chrome.runtime.sendMessage({ type: 'DONE', ok: true, resi: resi.toUpperCase() });
    })
    .catch((err) => chrome.runtime.sendMessage({ type: 'DONE', ok: false, error: err.message }));
});

chrome.runtime.sendMessage({ type: 'READY' });
