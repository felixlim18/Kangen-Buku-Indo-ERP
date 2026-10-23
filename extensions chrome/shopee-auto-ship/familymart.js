// Cek pelunasan FamilyMart 店到店取貨付款: berjalan di iframe www.fami.life/C2C di dalam halaman
// fmec.famiport.com.tw/FP_Entrance/QueryPay. 訂單／匯款查詢 → 多筆查詢 訂單成立日 90 hari terakhir (batas situs)
// → kartu dengan 寄件編號 = nomor resi → 匯款狀態 "匯款成功(YYYY/MM/DD)" + 金額 di 明細.
// Daftar yang tampil saat halaman dibuka adalah hasil pencarian terakhir di sesi itu, jadi selalu cari sendiri;
// hasilnya dipakai ulang beberapa menit supaya "Cek Semua" tidak mencari ulang untuk setiap order.
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

const SEARCH_KEY = 'kbiFamilymartSearchedAt';
const SEARCH_REUSE_MS = 5 * 60000;
const SEARCH_DAYS = 89; // 查詢區間不得超過90天
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const isListPage = () => /\/C2C\/Order\/OrderDetailPage/i.test(location.pathname);
const listBlocks = () => [...document.querySelectorAll('.g-option-block.payment-list-bg')];

// Semua pasangan .key / .value di satu kartu (termasuk 明細 yang terlipat)
const blockFields = (block) => {
  const fields = {};
  for (const k of block.querySelectorAll('.key')) fields[text(k)] = text(k.nextElementSibling);
  return fields;
};

// 多筆查詢 訂單成立日 SEARCH_DAYS hari terakhir. Hasil dimuat lewat AJAX menggantikan kartu lama.
async function search() {
  const multi = document.getElementById('multiple');
  if (multi?.classList.contains('inactive-check-order-btn')) {
    multi.click();
    await sleep(500);
  }
  const type = document.getElementById('ddlDateType');
  const start = document.getElementById('inputSearchDateS');
  const end = document.getElementById('inputSearchDateE');
  const button = document.getElementById('submit');
  if (!type || !start || !end || !button) throw new Error('Form 多筆查詢 FamilyMart tidak ditemukan.');
  const from = new Date();
  from.setDate(from.getDate() - SEARCH_DAYS);
  type.value = 'OD';
  start.value = isoDate(from);
  end.value = isoDate(new Date());
  for (const el of [type, start, end]) el.dispatchEvent(new Event('change', { bubbles: true }));

  for (const b of listBlocks()) b.dataset.kbiOld = '1';
  const t0 = Date.now();
  button.click();
  const result = await waitFor(() => {
    const all = listBlocks();
    if (all.some((b) => !b.dataset.kbiOld)) return 'NEW';
    // Tidak ada kartu sama sekali cukup lama (pencarian biasanya ~6 detik) -> memang tidak ada hasil
    if (all.length === 0 && Date.now() - t0 > 12000) return 'EMPTY';
    return null;
  }, 30000);
  if (!result) throw new Error('Hasil 多筆查詢 FamilyMart tidak termuat (timeout).');
  if (result === 'NEW') await sleep(500); // biarkan semua kartu selesai dirender
  sessionStorage.setItem(SEARCH_KEY, String(Date.now()));
}

async function readPayment(resi) {
  if (!isListPage()) {
    // Halaman awal (最新消息): buka tab 訂單／匯款查詢, RUN berikutnya datang dari halaman daftar
    const tab = await waitFor(() => [...document.querySelectorAll('a.tab')].find((a) => text(a) === '訂單／匯款查詢'), 15000);
    if (!tab) throw new Error('Tab 訂單／匯款查詢 FamilyMart tidak ditemukan. Pastikan sudah login.');
    tab.click();
    return null;
  }

  const searchedAt = Number(sessionStorage.getItem(SEARCH_KEY)) || 0;
  if (Date.now() - searchedAt > SEARCH_REUSE_MS || listBlocks().length === 0) await search();
  const blocks = listBlocks();
  if (blocks.length === 0) return { transferred: false, status: 'Tidak ada kiriman FamilyMart 90 hari terakhir' };

  const card = blocks.map(blockFields).find((f) => (f['寄件編號'] || '').replace(/\s/g, '') === resi);
  if (!card) return { transferred: false, status: 'Tidak ada di daftar FamilyMart (訂單成立日 90 hari terakhir)' };

  const status = card['匯款狀態'] || '';
  const m = status.match(/匯款成功\s*\(\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s*\)/);
  if (!m) return { transferred: false, status: `匯款狀態 ${status || '?'}` };
  const amount = Number((card['金額'] || '').replace(/[^\d.-]/g, ''));
  if (!card['金額'] || Number.isNaN(amount)) throw new Error('金額 di 明細 FamilyMart tidak terbaca.');
  return { transferred: true, paidDate: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, amount };
}

let running = false;
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Halaman daftar yang sudah terbuka dipakai langsung untuk order berikutnya (tanpa refresh)
  if (msg?.type === 'PING') {
    if (isListPage()) sendResponse({ ready: !running });
    return;
  }
  if (msg?.type !== 'RUN' || msg.platform !== 'familymart') return;
  running = true;
  readPayment(msg.orderNo)
    .then((payment) => {
      if (payment) chrome.runtime.sendMessage({ type: 'DONE', ok: true, payment });
    })
    .catch((err) => chrome.runtime.sendMessage({ type: 'DONE', ok: false, error: err.message }))
    .finally(() => {
      running = false;
    });
});

chrome.runtime.sendMessage({ type: 'READY' });
