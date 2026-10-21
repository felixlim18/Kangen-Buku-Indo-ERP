// Otomatisasi di halaman 我的銷售: klik tab 全部 -> cari 訂單編號 -> 安排出貨 -> ambil nomor resi (寄件編號).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

async function waitFor(fn, timeoutMs, intervalMs = 300) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(intervalMs);
  }
  return null;
}

const findButton = (root, label) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label && !b.disabled);

// Hanya dialog yang benar-benar tampil. Shopee menyimpan beberapa dialog (mis. 匯出所選日期範圍內的所有訂單)
// tetap di DOM dalam keadaan tersembunyi; dulu ikut terhitung "terbuka".
// JANGAN pakai opacity: dialog Shopee fade-in dari opacity 0 dan animasinya berhenti di tab latar belakang,
// sehingga dialog yang sudah muncul (mis. 申請寄件編號) tetap ber-opacity 0 dan tombolnya tidak ditekan.
const isShown = (el) => {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
// Dialog yang tampil. Tidak semua dialog Shopee berbentuk .eds-modal (dialog 申請寄件編號 tidak terdeteksi
// sebagai .eds-modal), jadi kenali juga [role=dialog] / class berisi "modal" yang memuat tombol atau resi.
const openModals = () => {
  const found = [...document.querySelectorAll('.eds-modal, [role="dialog"], [class*="modal"]')].filter(
    (m) => isShown(m) && (m.querySelector('button') || m.querySelector('.tracking-number'))
  );
  // Buang yang bersarang di dalam kandidat lain (ambil yang terluar)
  return found.filter((m) => !found.some((o) => o !== m && o.contains(m)));
};
const modalTitle = (m) =>
  text(m.querySelector('.eds-modal__title, [class*="title"], h1, h2, h3')) || text(m).slice(0, 20);

// Tombol bertuliskan persis `label` yang tampil di mana pun di halaman (tidak bergantung jenis dialog)
const findVisibleButton = (label) =>
  [...document.querySelectorAll('button')].find((b) => text(b) === label && !b.disabled && isShown(b));

const orderCards = () => [...document.querySelectorAll('a.order-card')];
const cardOrderNo = (card) => text(card.querySelector('.order-sn')).replace(/^訂單編號\s*/, '');
// Nomor resi yang sudah ada, tampil di bawah 全家 / 7-ELEVEN / dll. di kolom 物流方式
const cardTrackingNumber = (card) => {
  const tn = text(card.querySelector('.order-fulfilment-info .tracking-number')).replace(/\s+/g, '');
  return /^[A-Z0-9]{6,}$/i.test(tn) ? tn.toUpperCase() : null;
};

// Tab status 全部 (bukan 待出貨 / 運送中 / dll.) harus dipilih dulu sebelum mengisi 訂單編號.
// Dicari elemen terdalam bertuliskan persis "全部" di deretan tab, lalu diklik.
async function selectAllTab() {
  const leafAll = (els) =>
    els.find((el) => text(el) === '全部' && isShown(el) && ![...el.children].some((c) => text(c) === '全部'));
  const tab = await waitFor(
    () =>
      leafAll([...document.querySelectorAll('[role="tab"], [class*="tabs"] *')]) ||
      // cadangan kalau class deretan tab Shopee berubah
      leafAll([...document.querySelectorAll('.portal-content *, main *, body *')]),
    20000
  );
  if (!tab) throw new Error('Tab 全部 tidak ditemukan. Pastikan sudah login Shopee Seller Center.');
  tab.click();
  await sleep(800); // beri waktu daftar order memuat ulang untuk tab 全部
}

async function searchOrder(orderNo) {
  await selectAllTab();
  const input = await waitFor(() => document.querySelector('.order-search-input input'), 20000);
  if (!input) throw new Error('Kolom pencarian 訂單編號 tidak ditemukan. Pastikan sudah login Shopee Seller Center.');

  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, orderNo);
  input.dispatchEvent(new Event('input', { bubbles: true }));

  // Tunggu dropdown hasil (gambar 3) lalu klik pilihannya
  const hint = await waitFor(() => {
    const item = [...document.querySelectorAll('.order-sn-result-item')].find((el) => text(el).includes(orderNo));
    if (item) return item;
    const count = document.querySelector('.order-hints-count-content');
    if (count && /沒有找到|共\s*0\s*個結果/.test(text(count))) return 'NONE';
    return null;
  }, 10000);
  if (!hint) throw new Error('Dropdown hasil pencarian tidak muncul. Pastikan pilihan pencarian = 訂單編號.');
  if (hint === 'NONE') throw new Error(`Order ${orderNo} tidak ditemukan di Shopee.`);
  hint.click();

  // Tunggu daftar order terfilter hanya ke order ini
  const card = await waitFor(() => {
    const cards = orderCards();
    return cards.length > 0 && cards.every((c) => cardOrderNo(c) === orderNo) ? cards[0] : null;
  }, 15000);
  if (!card) throw new Error(`Kartu order ${orderNo} tidak muncul setelah pencarian.`);
  return card;
}

// Dipakai ulang untuk order berikutnya tanpa memuat ulang halaman: tutup dialog sisa order sebelumnya.
function closeLeftoverModals() {
  for (const m of openModals()) m.querySelector('.eds-modal__close')?.click();
}

async function getTrackingNumber(orderNo) {
  closeLeftoverModals();
  let card = await searchOrder(orderNo);

  // Tombol aksi & nomor resi baru dirender beberapa saat setelah kartu muncul (awalnya hanya 查看詳情).
  // - Nomor resi sudah ada di kolom 物流方式 -> langsung pakai
  // - 安排出貨 -> klik (kondisi normal)
  // - hanya 查看物流 -> buka dialognya untuk membaca nomor resi
  const next = await waitFor(() => {
    card = orderCards().find((c) => cardOrderNo(c) === orderNo) || card;
    const existing = cardTrackingNumber(card);
    if (existing) return { resi: existing };
    const arrange = findButton(card, '安排出貨');
    if (arrange) return { button: arrange };
    return null;
  }, 8000);
  if (next?.resi) return next.resi;
  const button = next?.button || findButton(card, '查看物流');
  if (!button) {
    const labels = [...card.querySelectorAll('.order-actions button')].map(text).join(', ');
    throw new Error(`Tombol 安排出貨 tidak ada di order ini (aksi tersedia: ${labels || '-'}).`);
  }
  button.click();

  const clicked = new WeakSet();
  let lastActionAt = Date.now();
  let viewClicks = 0;
  const end = Date.now() + 40000;

  while (Date.now() < end) {
    // Pop-up 申請寄件編號 (isi 寄件人真實姓名 sudah terisi Shopee): HANYA kalau muncul, tekan tombolnya sekali
    const applyAnywhere = findVisibleButton('申請寄件編號');
    if (applyAnywhere && !clicked.has(applyAnywhere)) {
      clicked.add(applyAnywhere);
      applyAnywhere.click();
      lastActionAt = Date.now();
      await sleep(400);
      continue;
    }

    const modals = openModals();
    for (const m of modals) {
      // Kondisi 1 / hasil akhir: dialog 查看寄件編號 dengan nomor resi (gambar 5)
      const tn = text(m.querySelector('.tracking-number')).replace(/\s+/g, '');
      if (/^[A-Z0-9]{6,}$/i.test(tn)) {
        (m.querySelector('.eds-modal__close') || m.querySelector('[class*="close"]'))?.click();
        return tn.toUpperCase();
      }

      // Kondisi 2: dialog 申請寄件編號 (gambar 6) -> tekan tombol apply
      const apply = findButton(m, '申請寄件編號');
      if (apply && !clicked.has(apply)) {
        clicked.add(apply);
        apply.click();
        lastActionAt = Date.now();
        continue;
      }

      // Konfirmasi lanjutan (確認), tapi jangan tutup dialog yang masih "申請中"
      const confirm = findButton(m, '確認');
      if (confirm && !clicked.has(confirm) && !m.querySelector('.tracking-number') && !text(m).includes('申請中')) {
        clicked.add(confirm);
        confirm.click();
        lastActionAt = Date.now();
      }
    }

    // Dialog tertutup tanpa nomor resi -> buka 查看物流 untuk membaca nomornya
    if (modals.length === 0 && Date.now() - lastActionAt > 3000 && viewClicks < 2) {
      card = orderCards().find((c) => cardOrderNo(c) === orderNo) || card;
      const shown = cardTrackingNumber(card);
      if (shown) return shown;
      const v = findButton(card, '查看物流');
      if (v) {
        viewClicks++;
        v.click();
        lastActionAt = Date.now();
      }
    }
    await sleep(400);
  }

  const dialogs = openModals().map((m) => {
    const buttons = [...m.querySelectorAll('button')].filter(isShown).map(text).filter(Boolean).slice(0, 4);
    return `${modalTitle(m)}${buttons.length ? ` [${buttons.join('/')}]` : ''}`;
  });
  throw new Error(`Nomor resi tidak muncul dalam 40 detik${dialogs.length ? ` (dialog: ${dialogs.join(', ')})` : ''}.`);
}

let running = false;
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Background bertanya: apakah halaman ini bisa langsung dipakai untuk order berikutnya (tanpa refresh)?
  if (msg?.type === 'PING') {
    sendResponse({ ready: !running && location.pathname.startsWith('/portal/sale/order') });
    return;
  }
  if (msg?.type !== 'RUN' || msg.platform !== 'shopee') return;
  running = true;
  getTrackingNumber(msg.orderNo)
    .then((resi) => chrome.runtime.sendMessage({ type: 'DONE', ok: true, resi }))
    .catch((err) => chrome.runtime.sendMessage({ type: 'DONE', ok: false, error: err.message }))
    .finally(() => { running = false; });
});

chrome.runtime.sendMessage({ type: 'READY' });
