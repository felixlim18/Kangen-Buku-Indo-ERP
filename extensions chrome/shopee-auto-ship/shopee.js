// Otomatisasi di halaman 我的銷售 (全部): cari 訂單編號 -> 安排出貨 -> ambil nomor resi (寄件編號).
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

const openModals = () =>
  [...document.querySelectorAll('.eds-modal')].filter(
    (m) => m.querySelector('.eds-modal__box') && getComputedStyle(m).display !== 'none'
  );

const orderCards = () => [...document.querySelectorAll('a.order-card')];
const cardOrderNo = (card) => text(card.querySelector('.order-sn')).replace(/^訂單編號\s*/, '');

async function searchOrder(orderNo) {
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

async function getTrackingNumber(orderNo) {
  let card = await searchOrder(orderNo);

  // Kondisi normal: 安排出貨. Kalau sudah pernah diatur, nomor resi bisa dilihat lewat 查看物流.
  const arrange = findButton(card, '安排出貨');
  const view = findButton(card, '查看物流');
  if (arrange) arrange.click();
  else if (view) view.click();
  else {
    const labels = [...card.querySelectorAll('.order-actions button')].map(text).join(', ');
    throw new Error(`Tombol 安排出貨 tidak ada di order ini (aksi tersedia: ${labels || '-'}).`);
  }

  const clicked = new WeakSet();
  let lastActionAt = Date.now();
  let viewClicks = 0;
  const end = Date.now() + 40000;

  while (Date.now() < end) {
    const modals = openModals();
    for (const m of modals) {
      // Kondisi 1 / hasil akhir: dialog 查看寄件編號 dengan nomor resi (gambar 5)
      const tn = text(m.querySelector('.tracking-number')).replace(/\s+/g, '');
      if (/^[A-Z0-9]{6,}$/i.test(tn)) {
        m.querySelector('.eds-modal__close')?.click();
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
      const v = findButton(card, '查看物流');
      if (v) {
        viewClicks++;
        v.click();
        lastActionAt = Date.now();
      }
    }
    await sleep(400);
  }

  const titles = openModals().map((m) => text(m.querySelector('.eds-modal__title'))).filter(Boolean);
  throw new Error(`Nomor resi tidak muncul dalam 40 detik${titles.length ? ` (dialog: ${titles.join(', ')})` : ''}.`);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'RUN') return;
  getTrackingNumber(msg.orderNo)
    .then((resi) => chrome.runtime.sendMessage({ type: 'DONE', ok: true, resi }))
    .catch((err) => chrome.runtime.sendMessage({ type: 'DONE', ok: false, error: err.message }));
});

chrome.runtime.sendMessage({ type: 'READY' });
