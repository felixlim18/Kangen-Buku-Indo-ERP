// Auto Order iOPEN: langkah per halaman di tab kerja extension (lihat iopen-order-bg.js untuk urutannya).
// Berjalan di mall.iopenmall.tw/050497 dan peta 7-11 (emap.unipcsc.com.tw). Di tab lain skrip ini diam:
// background hanya memberi job ke tab kerjanya sendiri.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const money = (s) => Number(String(s).replace(/[^\d]/g, ''));

async function waitFor(fn, timeoutMs, intervalMs = 300) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(intervalMs);
  }
  return null;
}

const step = (phase, data) => chrome.runtime.sendMessage({ type: 'IO_STEP', phase, ...data });
const progress = (t) => chrome.runtime.sendMessage({ type: 'IO_PROGRESS', text: t }).catch(() => {});

// Pesan alert/confirm yang ditangkap iopen-order-main.js
const capturedAlerts = () => {
  try {
    return JSON.parse(document.documentElement.dataset.kbiAlerts || '[]');
  } catch {
    return [];
  }
};

// Klik elemen. Link javascript: diklik lewat iopen-order-main.js (dunia halaman) di frame tempat elemen itu berada.
function pageClick(el) {
  if (!/^\s*javascript:/i.test(el.getAttribute?.('href') || '')) return el.click();
  el.setAttribute('data-kbi-click', '1');
  (el.ownerDocument.defaultView || window).dispatchEvent(new Event('kbi-page-click'));
}

function setValue(el, value) {
  el.focus();
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.value = value;
  for (const t of ['input', 'change', 'keyup']) el.dispatchEvent(new Event(t, { bubbles: true }));
  el.blur();
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

(async () => {
  const res = await chrome.runtime.sendMessage({ type: 'IO_READY' }).catch(() => null);
  const job = res?.job;
  if (!job) return;
  try {
    sessionStorage.setItem('kbiIopenOrder', '1'); // iopen-order-main.js menangkap alert hanya di tab kerja
  } catch {}
  try {
    if (location.hostname === 'emap.unipcsc.com.tw') await runEmap(job);
    else await runMall(job);
  } catch (err) {
    await step(job.phase, { ok: false, error: err.message });
  }
})();

// ---------------- mall.iopenmall.tw ----------------
const pageAction = () => new URL(location.href).searchParams.get('action') || 'index';
// Header situs (會員中心 / 登出 / 購物車(n)) dibuat skrip setelah halaman dimuat dan kadang tidak muncul di tab
// latar belakang, jadi status login & isi keranjang ditanyakan langsung ke server.
async function isLoggedIn() {
  const r = await fetch(`${location.origin}/member/index.php?action=member_account`, { credentials: 'include' });
  return r.ok && new URL(r.url).searchParams.get('action') === 'member_account';
}
// Jumlah satu produk di keranjang menurut halaman keranjang server
async function serverCartQty(prodNo) {
  const html = await (await fetch(`${location.origin}/050497/index.php?action=shopping_cart`, { credentials: 'include' })).text();
  const d = new DOMParser().parseFromString(html, 'text/html');
  let qty = 0;
  for (const cb of d.querySelectorAll('input[name="check_product[]"]')) {
    const tr = cb.closest('tr');
    if (tr?.innerHTML.match(/P\d{13}/)?.[0] !== prodNo) continue;
    qty += Number(tr.querySelector('.i_setP_quantity input:not([type=button])')?.value || 0);
  }
  return qty;
}
const headerCartCount = () => {
  const m = (document.body?.innerText || '').match(/購物車\s*\(\s*(\d+)\s*\)/);
  return m ? Number(m[1]) : null;
};
const cartRows = () => [...document.querySelectorAll('input[name="check_product[]"]')];

async function runMall(job) {
  await waitFor(() => document.body, 10000);
  // 請選擇取貨門市 mengirim form ke halaman checkout yang sama, yang langsung meneruskan ke peta 7-11
  // (tanpa header situs). Halaman perantara ini dibiarkan berjalan sendiri.
  if (job.phase === 'emap') return;
  if (job.phase === 'catalog' && !(await isLoggedIn())) throw new Error('Akun pembeli iOPEN Mall belum login di Chrome ini.');
  const action = pageAction();
  const expect = {
    catalog: ['index'],
    clear: ['shopping_cart'],
    cleanup: ['shopping_cart'],
    add: ['product_detail'],
    cart: ['shopping_cart'],
    store: ['shopping_checkout_2'],
    fill: ['shopping_checkout_2'],
    result: ['shopping_checkout_ok', 'shopping_checkout_2'],
  }[job.phase];
  // Setelah 前往結帳 iOPEN bisa lewat halaman lain dulu (mis. shopping_checkout_3) sebelum 完成訂購. Order mungkin
  // sudah terbuat: tunggu halaman pindah sendiri; kalau tidak, pastikan lewat 我的訂單 (bukan dianggap error).
  if (job.phase === 'result' && !expect.includes(action)) {
    await sleep(20000);
    return settleByOrderList(job, `Berhenti di halaman iOPEN action=${action} setelah 前往結帳`);
  }
  if (!expect || !expect.includes(action)) throw new Error(`Halaman iOPEN tidak terduga di langkah "${job.phase}": action=${action}`);

  if (job.phase === 'catalog') return runCatalog(job);
  if (job.phase === 'clear' || job.phase === 'cleanup') return runClear(job);
  if (job.phase === 'add') return runAdd(job);
  if (job.phase === 'cart') return runCart(job);
  if (job.phase === 'store') return runStore(job);
  if (job.phase === 'fill') return runFill(job);
  if (job.phase === 'result') return runResult(job);
}

async function runCatalog(job) {
  const tok = document.documentElement.outerHTML.match(/myAct:\s*'MORE_PRODUCT'[\s\S]{0,300}?_token:\s*'([^']+)'/)?.[1];
  if (!tok) throw new Error('Daftar produk toko iOPEN tidak terbaca (token MORE_PRODUCT tidak ada).');
  const byNo = new Map();
  for (let start = 0; start < 50; start++) {
    const r = await fetch(`${location.origin}/050497/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams({ myAct: 'MORE_PRODUCT', start: String(start), _token: tok }),
    });
    const j = await r.json();
    if (!Array.isArray(j.data) || !j.data.length) break;
    for (const v of j.data) {
      const max = Number(v.Maximum_purchase);
      let stock = String(v.has_stock) === '1' ? Number(v.prod_stock) || 0 : 0;
      if (max > 0) stock = Math.min(stock, max);
      byNo.set(v.prod_no, { no: v.prod_no, name: String(v.prod_name || '').trim(), price: Number(v.selling_price), stock });
    }
  }
  const products = [...byNo.values()];
  if (!products.length) throw new Error('Daftar produk toko iOPEN kosong.');
  const plan = planIopenItems(products, job.amount);
  if (!plan) throw new Error(`Tidak ada kombinasi produk iOPEN (yang stoknya ada) dengan total tepat NT$${job.amount}.`);
  await step('catalog', { ok: true, plan });
}

async function runClear(job) {
  const loaded = await waitFor(() => cartRows().length > 0 || /購物車中沒有商品/.test(document.body.innerText), 15000);
  if (!loaded) throw new Error('Halaman keranjang iOPEN tidak termuat.');
  const rows = cartRows();
  if (rows.length) {
    const del = rows[0].closest('tr')?.querySelector('a.scart_icon_delete');
    if (!del) throw new Error('Tombol hapus (刪除) di keranjang tidak ditemukan.');
    del.click();
    const gone = await waitFor(() => !document.contains(rows[0]) || /購物車中沒有商品/.test(document.body.innerText), 15000);
    if (!gone) throw new Error('Produk di keranjang tidak terhapus.');
    await sleep(800);
    await step(job.phase, { ok: true, more: true });
    return;
  }
  const count = headerCartCount();
  if (count) throw new Error(`Keranjang masih berisi ${count} produk di tab lain (冷凍/冷藏). Kosongkan manual dulu.`);
  await step(job.phase, { ok: true, more: false });
}

async function runAdd(job) {
  const item = job.plan[job.addIndex];
  const no = new URL(location.href).searchParams.get('prod_no');
  if (!item || no !== item.no) throw new Error(`Halaman produk salah: ${no} (seharusnya ${item?.no})`);
  const btn = await waitFor(() => document.getElementById('add_cart'), 15000);
  const qty = document.querySelector('input[name="scar_count[]"]');
  if (!btn || !qty) throw new Error(`Tombol 加入購物車 / kolom jumlah tidak ada di halaman ${item.name}.`);
  // Jangan dikosongkan dulu (setValue): kolom kosong langsung memunculkan 最低購買數量為1 dan menghentikan langkah ini
  if (qty.value !== String(item.qty)) {
    qty.value = String(item.qty);
    for (const t of ['input', 'change', 'blur']) qty.dispatchEvent(new Event(t, { bubbles: true }));
  }
  if (qty.value !== String(item.qty)) throw new Error(`Jumlah ${item.name} tidak bisa diisi ${item.qty} (terbaca ${qty.value}).`);
  const before = headerCartCount();
  const beforeQty = await serverCartQty(item.no);
  pageClick(btn);
  // Masuk keranjang: angka 購物車(n) di header berubah, atau (header tidak tampil) jumlah di keranjang server bertambah
  // (iOPEN membalas "系統忙碌中 (W01)" kalau sesi terlalu sering meminta halaman: cek server paling sering tiap 3 detik)
  let added = false;
  let lastServerCheck = Date.now();
  for (const end = Date.now() + 20000; !added && Date.now() < end; ) {
    await sleep(700);
    const extra = document.getElementById('box_button'); // "不需優惠，直接加入購物車" kalau muncul
    if (visible(extra)) pageClick(extra);
    const now = headerCartCount();
    if (before != null && now != null) added = now !== before;
    else if (Date.now() - lastServerCheck >= 3000) {
      lastServerCheck = Date.now();
      added = (await serverCartQty(item.no)) > beforeQty;
    }
  }
  if (!added) {
    const alerts = capturedAlerts();
    throw new Error(`${item.name} tidak masuk keranjang${alerts.length ? `: ${alerts.join(' | ')}` : ''}.`);
  }
  await step('add', { ok: true });
}

async function runCart(job) {
  const loaded = await waitFor(() => cartRows().length > 0 || /購物車中沒有商品/.test(document.body.innerText), 15000);
  if (!loaded) throw new Error('Halaman keranjang iOPEN tidak termuat.');
  await sleep(1000);
  const found = new Map();
  const problems = [];
  for (const cb of cartRows()) {
    const tr = cb.closest('tr');
    const no = tr?.innerHTML.match(/P\d{13}/)?.[0];
    const qtyInput = tr?.querySelector('.i_setP_quantity input:not([type=button])');
    if (!no || !qtyInput) {
      problems.push('baris keranjang tidak terbaca');
      continue;
    }
    if (!cb.checked) problems.push(`${no} tidak tercentang`);
    found.set(no, (found.get(no) || 0) + Number(qtyInput.value));
  }
  for (const it of job.plan) {
    if (found.get(it.no) !== it.qty) problems.push(`${it.name}: ${found.get(it.no) || 0} (seharusnya ${it.qty})`);
    found.delete(it.no);
  }
  for (const no of found.keys()) problems.push(`produk lain di keranjang: ${no}`);
  const total = money(document.body.innerText.match(/總金額\s*[:：]?\s*\$\s*([\d,]+)/)?.[1] ?? '');
  if (total !== job.amount) problems.push(`總金額 $${total} (seharusnya $${job.amount})`);
  if (problems.length) {
    await step('cart', { ok: true, mismatch: problems.join('; ') });
    return;
  }
  const go = [...document.querySelectorAll('input[type=button], input[type=submit], button')].find(
    (b) => visible(b) && (b.value || b.textContent).trim() === '前往結帳'
  );
  if (!go) throw new Error('Tombol 前往結帳 di keranjang tidak ditemukan.');
  const r = await step('cart', { ok: true });
  if (r?.proceed) pageClick(go);
}

async function runStore(job) {
  const link = await waitFor(() => [...document.querySelectorAll('a')].find((a) => /seven_type/.test(a.getAttribute('href') || '')), 15000);
  if (!link) throw new Error('Link 請選擇取貨門市 tidak ditemukan di checkout.');
  if (!/常溫7-ELEVEN店到店取貨付款/.test(document.body.innerText)) throw new Error('Pengiriman 常溫7-ELEVEN店到店取貨付款 tidak tersedia di checkout.');
  const r = await step('store', { ok: true });
  if (r?.proceed) pageClick(link);
}

// Nilai uang di teks halaman checkout, mis. semua "總金額 $ 570"
const amountsOf = (re) => [...document.body.innerText.matchAll(re)].map((m) => money(m[1]));

async function runFill(job) {
  const g = (id) => document.getElementById(id);
  const ready = await waitFor(() => g('store_no') && g('order_addressee') && g('order_telcellphone') && g('btn_submit'), 15000);
  if (!ready) throw new Error('Form checkout iOPEN tidak lengkap.');
  const picked = job.picked;
  const storeNo = g('store_no').value.trim();
  const storeName = g('store_name')?.value.trim() || '';
  if (!picked || storeNo !== picked.id || storeName !== picked.name) {
    throw new Error(`Toko di checkout (${storeNo} ${storeName}) tidak sama dengan toko yang dipilih (${picked?.id} ${picked?.name}).`);
  }

  // Data order sebelumnya selalu terisi: kosongkan dulu, lalu isi data SO
  setValue(g('order_addressee'), job.name);
  setValue(g('order_telcellphone'), job.phone);

  const op = document.querySelector('input[name="discount_option"]');
  if (op?.checked) {
    op.click();
    await sleep(1500);
  }
  if (op?.checked) throw new Error('OPENPOINT 折抵 tidak bisa dimatikan.');
  const opInput = g('input_open_point');
  if (opInput && Number(opInput.value || 0) > 0) setValue(opInput, '');

  const terms = [...document.querySelectorAll('input#terms_ck, input[name="check"]')].find(visible);
  if (!terms) throw new Error('Checkbox persetujuan (我同意iOPEN Mall 網站服務條款) tidak ditemukan.');
  if (!terms.checked) terms.click();
  if (!terms.checked) throw new Error('Checkbox persetujuan tidak bisa dicentang.');

  const remarks = g('order_remarks');
  if (!remarks) throw new Error('Kolom 備註事項 tidak ditemukan.');
  setValue(remarks, job.soCode);

  // Tunggu ringkasan biaya diperbarui (OPENPOINT), lalu semua angka harus cocok
  let problems = [];
  const checkTotals = () => {
    problems = [];
    const totals = amountsOf(/總金額\s*[:：]?\s*\$\s*([\d,]+)/g);
    if (!totals.length || totals.some((t) => t !== job.amount)) problems.push(`總金額 ${totals.join('/') || '-'} (seharusnya ${job.amount})`);
    const cod = amountsOf(/7-ELEVEN\s*貨到付款\s*\$\s*([\d,]+)/g);
    if (cod.length !== 1 || cod[0] !== job.amount) problems.push(`7-ELEVEN 貨到付款 ${cod.join('/') || '-'} (seharusnya ${job.amount})`);
    const fees = amountsOf(/運費(?:小計)?\s*\$\s*([\d,]+)/g);
    if (fees.some((f) => f !== 0)) problems.push(`運費 ${fees.join('/')}`);
    for (const [label, re] of [['優惠共折抵', /優惠共折抵\s*\$\s*([\d,]+)/g], ['OPENPOINT共折抵', /OPENPOINT共折抵\s*\$\s*([\d,]+)/g]]) {
      const v = amountsOf(re);
      if (v.some((x) => x !== 0)) problems.push(`${label} ${v.join('/')}`);
    }
    const ori = g('ori_total');
    if (ori && money(ori.value) !== job.amount) problems.push(`ori_total ${ori.value}`);
    return problems.length === 0;
  };
  if (!(await waitFor(checkTotals, 10000, 500))) throw new Error(`Total di checkout tidak sesuai: ${problems.join('; ')}`);

  // Teks pilihan bayar yang tercentang: label-nya, atau induk terdekat yang hanya memuat radio itu
  const pay = document.querySelector('input[name="webpay_uid_set"]:checked');
  let payBox = pay && document.querySelector(`label[for="${pay.id}"]`);
  for (let el = pay; !payBox && el && el !== document.body; el = el.parentElement) {
    if (el.querySelectorAll('input[name="webpay_uid_set"]').length > 1) break;
    if (/貨到付款|付款/.test(text(el))) payBox = el;
  }
  const payText = text(payBox);
  if (!pay || !/7-ELEVEN\s*貨到付款/.test(payText)) throw new Error(`Metode bayar terpilih bukan 7-ELEVEN 貨到付款 (${payText || '-'}).`);
  if (!/常溫7-ELEVEN店到店取貨付款/.test(document.body.innerText)) throw new Error('Pengiriman bukan 常溫7-ELEVEN店到店取貨付款.');
  const pageText = document.body.innerText;
  const missing = job.plan.filter((it) => !pageText.includes(it.name));
  if (missing.length) throw new Error(`Produk tidak tampil di checkout: ${missing.map((it) => it.name).join(', ')}`);

  // Baca ulang: yang terkirim harus persis data SO
  const readback = { name: g('order_addressee').value, phone: g('order_telcellphone').value, remarks: remarks.value };
  if (readback.name !== job.name || readback.phone !== job.phone || readback.remarks !== job.soCode) {
    throw new Error(`Isian tidak tersimpan benar: nama "${readback.name}", HP "${readback.phone}", 備註 "${readback.remarks}".`);
  }
  if (capturedAlerts().length) throw new Error(`iOPEN menampilkan pesan: ${capturedAlerts().join(' | ')}`);

  const preview = {
    name: readback.name,
    phone: readback.phone,
    store: `${storeNo} ${storeName}`,
    address: g('store_address')?.value || '',
    remarks: readback.remarks,
    total: job.amount,
    payment: '7-ELEVEN 貨到付款',
    openpoint: 'tidak dipakai',
  };
  const r = await step('fill', { ok: true, preview });
  if (!r?.proceed) return; // latihan: berhenti sebelum 前往結帳

  document.documentElement.dataset.kbiAlerts = '[]';
  document.documentElement.dataset.kbiAllowConfirm = '1';
  pageClick(g('btn_submit'));
  // Kalau berhasil, halaman pindah ke 完成訂購 (skrip ini berhenti). Kalau masih di sini -> ditolak / macet.
  const alerts = await waitFor(() => (capturedAlerts().length ? capturedAlerts() : null), 30000, 500);
  // sco_submit mengunci tombol (請稍候, tanpa onclick) tepat sebelum form dikirim. Pesan validasi + tombol
  // masih utuh = form ditolak sebelum dikirim, jadi pasti tidak ada order.
  const btn = g('btn_submit');
  const rejected = !!alerts && !!btn?.getAttribute('onclick') && !/請稍候/.test(btn.value || btn.textContent || '');
  const error = alerts ? `iOPEN menolak saat 前往結帳: ${alerts.join(' | ')}` : 'Halaman tidak berpindah setelah 前往結帳 ditekan.';
  if (rejected) await step('result', { ok: false, rejected, error });
  else await settleByOrderList(job, error);
}

// Cari order di 我的訂單 yang 備註-nya kode SO dan dibuat dalam 15 menit terakhir (3 order terbaru).
// Dipakai kalau halaman setelah 前往結帳 tidak menampilkan 訂單編號 (mis. 系統忙碌中 W01).
async function findOrderBySo(soCode) {
  const parse = async (url) => new DOMParser().parseFromString(await (await fetch(url, { credentials: 'include' })).text(), 'text/html');
  const list = await parse(`${location.origin}/member/index.php?action=order_inquiry`);
  const links = [...new Set([...list.querySelectorAll('a[href*="action=order_detail"]')].map((a) => a.href))].slice(0, 3);
  if (!links.length) throw new Error('Daftar 我的訂單 tidak terbaca');
  for (const url of links) {
    await sleep(1500);
    const t = (await parse(url)).body.textContent.replace(/\s+/g, ' ');
    const no = t.match(/訂單編號 (\d{6,12})/)?.[1];
    const at = t.match(/(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)/)?.[1];
    const remark = t.match(/備註 (\S+) 發票是否捐贈/)?.[1];
    if (!no || !at) continue;
    if (Date.now() - new Date(at.replace(' ', 'T')).getTime() > 15 * 60000) break;
    if (remark === soCode) return no;
  }
  return null;
}

// Hasil tidak jelas setelah 前往結帳: tanya 我的訂單. Ada order dengan 備註 kode SO = berhasil; tidak ada = pasti gagal.
async function settleByOrderList(job, reason) {
  await sleep(4000);
  let orderNo;
  try {
    orderNo = await findOrderBySo(job.soCode);
  } catch (err) {
    await step('result', { ok: false, error: `${reason}; 我的訂單 tidak bisa dicek (${err.message})` });
    return;
  }
  if (orderNo) await step('result', { ok: true, orderNo });
  else await step('result', { ok: false, rejected: true, error: `${reason}; tidak ada order dengan 備註 ${job.soCode} di 我的訂單` });
}

async function runResult(job) {
  const alerts = () => (capturedAlerts().length ? `: ${capturedAlerts().join(' | ')}` : '');
  if (pageAction() !== 'shopping_checkout_ok') return settleByOrderList(job, `Kembali ke checkout setelah 前往結帳${alerts()}`);
  const m = await waitFor(() => document.body.innerText.match(/訂單編號\s*[:：]\s*(\d{6,12})/), 15000);
  if (!m) return settleByOrderList(job, `Halaman 完成訂購 tanpa 訂單編號${alerts()}`);
  await step('result', { ok: true, orderNo: m[1] });
}

// ---------------- emap.unipcsc.com.tw (peta 7-11) ----------------
const frameDoc = () => {
  try {
    return document.getElementById('frmMain')?.contentDocument || null;
  } catch {
    return null;
  }
};

const popupInfo = () => {
  const btn = document.getElementById('sevenDataBtn');
  if (!visible(btn)) return null;
  const t = (btn.closest('div')?.parentElement?.innerText || '').replace(/\s+/g, ' ');
  const id = t.match(/門市店號\s*[:：]\s*(\d{6})/)?.[1];
  const name = t.match(/門市店名\s*[:：]\s*(\S+)/)?.[1];
  const address = t.match(/門市地址\s*[:：]\s*(.+?)\s*營業時間/)?.[1] || '';
  const delivery = t.match(/配送時間\s*[:：]\s*(\S+)/)?.[1] || '';
  return id && name ? { id, name, address, delivery } : null;
};

async function searchStore(tabId, inputId, keyword) {
  // Tab pencarian memuat ulang iframe frmMain (byID.aspx / byName.aspx), jadi hasil lama ikut hilang
  const tab = document.getElementById(tabId);
  if (tab) pageClick(tab);
  await sleep(1200);
  const input = await waitFor(() => {
    const d = frameDoc();
    return d?.readyState === 'complete' ? d.getElementById(inputId) : null;
  }, 15000);
  if (!input) throw new Error(`Kolom pencarian 7-11 (${inputId}) tidak muncul.`);
  const d = frameDoc();
  setValue(input, keyword);
  const send = d.getElementById('send');
  if (send) pageClick(send);
  await sleep(500);
  const done = await waitFor(() => {
    const fd = frameDoc();
    const lis = fd ? [...fd.querySelectorAll('#ol_stores li')] : [];
    if (lis.length) return lis;
    return capturedAlerts().length ? 'ALERT' : null;
  }, 15000);
  if (!done || done === 'ALERT') return [];
  return done.map((li) => ({
    li,
    id: (li.getAttribute('onclick') || '').match(/(\d{6})/)?.[1],
    name: text(li.querySelector('p')),
    usable: li.className !== 'useless' && /showMap\(\d{6}\)/.test(li.getAttribute('onclick') || ''),
  }));
}

async function runEmap(job) {
  if (job.phase !== 'emap') throw new Error(`Halaman peta 7-11 terbuka di langkah "${job.phase}".`);
  progress('peta 7-11 terbuka');
  await waitFor(() => document.getElementById('frmMain') || document.getElementById('submit_butn'), 15000);

  // Halaman konfirmasi terakhir (取貨地點確認): pastikan tokonya sama, lalu 確認
  const confirmStage = async () => {
    const box = await waitFor(() => (visible(document.getElementById('submit_butn')) ? document.getElementById('checkSeven') || document.body : null), 15000);
    if (!box) throw new Error('Halaman 取貨地點確認 tidak muncul.');
    if (!job.picked || !text(box).includes(job.picked.id)) throw new Error(`Halaman 取貨地點確認 bukan toko ${job.picked?.id}: ${text(box).slice(0, 80)}`);
    const r = await step('emap', { ok: true });
    if (r?.proceed) pageClick(document.getElementById('submit_butn'));
  };
  const acceptStage = async () => {
    const accept = await waitFor(() => (visible(document.getElementById('AcceptBtn')) ? document.getElementById('AcceptBtn') : null), 15000);
    if (!accept) throw new Error('Tombol 同意 di peta 7-11 tidak muncul.');
    pageClick(accept);
    await confirmStage();
  };
  if (visible(document.getElementById('submit_butn'))) return confirmStage();
  if (visible(document.getElementById('AcceptBtn'))) {
    if (!job.picked) throw new Error('Halaman 同意 muncul sebelum toko dipilih.');
    return acceptStage();
  }

  // Cari toko
  let match = null;
  if (job.store.id) {
    progress(`cari 門市店號 ${job.store.id}`);
    const found = await searchStore('byID', 'storeIDKey', job.store.id);
    match = found.find((s) => s.id === job.store.id);
    if (!match) throw new Error(`Toko 7-11 nomor ${job.store.id} tidak ditemukan.`);
    if (!match.usable) throw new Error(`Toko 7-11 ${job.store.id} ${match.name} tidak melayani pengambilan (灰底).`);
    if (job.store.names.length && !job.store.names.some((n) => match.name.startsWith(n))) {
      throw new Error(`Nomor toko ${job.store.id} adalah ${match.name}, tidak cocok dengan nama di SO (${job.store.names[0]}).`);
    }
  } else {
    for (const key of job.store.names) {
      progress(`cari 門市名稱 ${key}`);
      const found = await searchStore('byName', 'storeNameKey', key);
      const exact = found.filter((s) => s.name === `${key}門市`);
      if (exact.length > 1) throw new Error(`Ada ${exact.length} toko bernama ${key}門市.`);
      if (exact.length === 1) {
        match = exact[0];
        break;
      }
    }
    if (!match) throw new Error(`Toko 7-11 bernama ${job.store.names.map((n) => `${n}門市`).join(' / ')} tidak ditemukan (harus sama persis).`);
    if (!match.usable) throw new Error(`Toko 7-11 ${match.name} tidak melayani pengambilan (灰底).`);
  }

  pageClick(match.li);
  let info = await waitFor(popupInfo, 12000);
  if (!info) {
    // Peta kadang tidak dirender di tab latar belakang: tampilkan tab sebentar lalu coba lagi
    await chrome.runtime.sendMessage({ type: 'IO_SHOW_TAB' }).catch(() => null);
    pageClick(match.li);
    info = await waitFor(popupInfo, 12000);
  }
  if (!info) throw new Error('Info toko di peta 7-11 tidak muncul.');
  if (info.id !== match.id || info.name !== match.name) throw new Error(`Info toko di peta (${info.id} ${info.name}) beda dengan hasil cari (${match.id} ${match.name}).`);
  if (/暫停|停止|不/.test(info.delivery)) throw new Error(`Toko ${info.name}: 配送時間 ${info.delivery}.`);

  const r = await step('emap', { ok: true, picked: { id: info.id, name: info.name, address: info.address } });
  if (!r?.proceed) return;
  job.picked = { id: info.id, name: info.name, address: info.address };
  pageClick(document.getElementById('sevenDataBtn'));
  await acceptStage();
}
