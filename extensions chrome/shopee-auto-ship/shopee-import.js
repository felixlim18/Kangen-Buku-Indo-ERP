// Tarik order 待出貨 (待處理) dari Shopee Seller Center ke ERP (tombol "Tarik Order Shopee" di Sales Orders).
// Dua halaman, dikendalikan background.js (job SHOPEE_IMPORT):
// - daftar order  : 'IMPORT_LIST'   -> semua order 待處理 (semua halaman), tanpa filter 建議出貨期限
// - detail order  : 'IMPORT_DETAIL' -> item (nama, harga, qty), tanggal 新訂單, 預估訂單進帳
// Hanya MEMBACA halaman; tidak ada tombol Shopee yang ditekan selain filter/halaman daftar.
(() => {
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

  const isShown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const DETAIL_PATH = /\/portal\/sale\/order\/\d+/;
  const isDetailPage = () => DETAIL_PATH.test(location.pathname);
  const cards = () => [...document.querySelectorAll('a.order-card')];
  const cardSn = (card) => text(card.querySelector('.order-sn')).replace(/^訂單編號\s*/, '');
  const money = (s) => {
    const m = String(s || '').match(/(-?)\s*NT\$\s*([\d,]+)/i) || String(s || '').match(/^(-?)([\d,]+)$/);
    return m ? (m[1] ? -1 : 1) * parseInt(m[2].replace(/,/g, ''), 10) : null;
  };

  // ----- daftar order -----
  // Filter 建議出貨期限 sering tertinggal di 建議今天內出貨 (0) -> daftar kosong. Pilih 全部 di baris itu.
  async function selectDeadlineAll() {
    const label = await waitFor(
      () => [...document.querySelectorAll('*')].find((el) => text(el) === '建議出貨期限' && !el.children.length && isShown(el)),
      20000
    );
    if (!label) throw new Error('Filter 建議出貨期限 tidak ditemukan. Pastikan sudah login Shopee Seller Center.');
    for (let row = label.parentElement, i = 0; row && i < 4; row = row.parentElement, i++) {
      const all = [...row.querySelectorAll('*')].find((el) => text(el) === '全部' && isShown(el) && ![...el.children].some((c) => text(c) === '全部'));
      if (all) {
        all.click();
        return;
      }
    }
    throw new Error('Pilihan 全部 pada 建議出貨期限 tidak ditemukan.');
  }

  const expectedCount = () => {
    const m = document.body.innerText.match(/待處理\s*\((\d+)\)/);
    return m ? parseInt(m[1], 10) : null;
  };

  const readCard = (card) => ({
    sn: cardSn(card),
    url: new URL(card.getAttribute('href').trim(), location.origin).href,
    buyer: text(card.querySelector('.buyer-username')),
    payment: text(card.querySelector('.payment-method')),
    logistics: text(card.querySelector('.fulfilment-channel-name')),
  });

  async function readList() {
    await selectDeadlineAll();
    const first = await waitFor(() => cards()[0], 20000);
    if (!first) {
      if (expectedCount() === 0) return { ok: true, orders: [], expected: 0 };
      throw new Error('Daftar order 待處理 tidak termuat.');
    }
    await sleep(800);
    const orders = new Map();
    for (let page = 0; page < 30; page++) {
      for (const c of cards()) {
        const o = readCard(c);
        if (o.sn) orders.set(o.sn, o);
      }
      const next = document.querySelector('.eds-pager__button-next');
      if (!next || next.disabled || next.classList.contains('eds-button--disabled') || next.getAttribute('disabled') != null) break;
      const before = cardSn(cards()[0]);
      next.click();
      const changed = await waitFor(() => cards()[0] && cardSn(cards()[0]) !== before, 15000);
      if (!changed) break;
      await sleep(500);
    }
    return { ok: true, orders: [...orders.values()], expected: expectedCount() };
  }

  // ----- detail order -----
  const TAG_LINES = new Set(['較長備貨', '預購', '預售']);

  function pageLines() {
    return document.body.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  // Tabel item: 編號 / 商品 / 單價 / 數量 / 小計, lalu baris per item: indeks, [tag], nama, [variasi], harga, qty, subtotal
  function parseItems(lines) {
    const h = lines.findIndex((l, i) => l === '編號' && lines[i + 1] === '商品' && lines[i + 2] === '單價');
    if (h < 0) return [];
    let i = h + 5; // lewati 編號 商品 單價 數量 小計
    const items = [];
    while (i < lines.length && lines[i] === String(items.length + 1)) {
      let j = i + 1;
      const block = [];
      const next = String(items.length + 2);
      while (j < lines.length && !(lines[j] === next && /^\d+$/.test(lines[j + 1] || '') === false) && !/^(隱藏入帳明細|訂單金額|顯示入帳明細)$/.test(lines[j])) {
        block.push(lines[j]);
        j++;
      }
      const nums = [];
      while (block.length && /^[\d,]+$/.test(block[block.length - 1]) && nums.length < 3) nums.unshift(parseInt(block.pop().replace(/,/g, ''), 10));
      const names = block.filter((l) => !TAG_LINES.has(l));
      if (nums.length === 3 && names.length) {
        items.push({ name: names[0], variation: names.slice(1).join(' / '), unit: nums[0], qty: nums[1], subtotal: nums[2] });
      }
      i = j;
    }
    return items;
  }

  const valueAfter = (lines, label, from = 0) => {
    const idx = lines.findIndex((l, i) => i >= from && l.replace(/\s+/g, '') === label);
    return idx < 0 ? null : lines[idx + 1];
  };

  async function readDetail(sn) {
    const ready = await waitFor(() => document.body.innerText.includes(sn) && document.body.innerText.includes('訂單歷史') && document.body.innerText.includes('小計'), 20000);
    if (!ready) throw new Error(`Halaman detail order ${sn} tidak termuat.`);
    await sleep(800);

    // 進帳資訊 (預估訂單進帳) tidak dirender di tab latar belakang -> tampilkan tab sebentar kalau belum ada
    let lines = pageLines();
    if (!lines.includes('預估訂單進帳') && !lines.includes('調整後訂單進帳')) {
      await chrome.runtime.sendMessage({ type: 'IMPORT_SHOW_TAB' }).catch(() => {});
      await waitFor(() => document.body.innerText.includes('預估訂單進帳') || document.body.innerText.includes('調整後訂單進帳'), 8000);
      lines = pageLines();
    }

    const items = parseItems(lines);
    if (!items.length) throw new Error(`Item order ${sn} tidak terbaca (tabel 編號/商品/單價 tidak ditemukan).`);

    // 訂單歷史: baris pertama (terbawah/terlama) 新訂單 + tanggal
    const histStart = lines.indexOf('訂單歷史');
    let orderDate = '';
    for (let k = histStart; k >= 0 && k < lines.length; k++) {
      if (lines[k] === '新訂單') {
        const m = (lines[k + 1] || '').match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (m) orderDate = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
    }

    const net = money(valueAfter(lines, '預估訂單進帳') ?? valueAfter(lines, '調整後訂單進帳'));
    return {
      ok: true,
      detail: {
        sn,
        items,
        orderDate,
        netIncome: net,
        orderAmount: money(valueAfter(lines, '訂單金額')),
        buyerPaid: money(valueAfter(lines, '買家總支付金額')),
        platformFee: money(valueAfter(lines, '成交&金流手續費')),
      },
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'IMPORT_LIST') {
      readList().then(sendResponse, (err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    if (msg?.type === 'IMPORT_DETAIL') {
      readDetail(msg.sn).then(sendResponse, (err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  });

  chrome.runtime.sendMessage({ type: 'IMPORT_READY', page: isDetailPage() ? 'detail' : 'list' }).catch(() => {});
})();
