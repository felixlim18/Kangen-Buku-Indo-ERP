// 批次出貨 → 下載出貨文件 (已處理, 全部, satu 物流方式 dari URL): centang order dari modal ERP,
// pilih 寄件單 (+ 熱感列印 untuk 蝦皮店到店), lalu 下載所選文件. Halaman cetaknya dibuka di tab yang sama.
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

const rowOrderNo = (row) => text(row.querySelector('.order-id-wrapper a'));
const docCheckbox = (name) => [...document.querySelectorAll('label.eds-checkbox')].find((l) => text(l) === name);

async function selectAndDownload(step) {
  // "無資料" sudah tampil sebelum data dimuat, jadi pakai angka di filter 物流方式 yang aktif, mis. "7-ELEVEN (10)",
  // lalu tunggu sampai semua barisnya dirender (klik saat masih memuat akan ter-reset)
  const counted = await waitFor(() => {
    const label = [...document.querySelectorAll('label.eds-radio-button.checked')].map(text).find((x) => /^(蝦皮店到店|7-ELEVEN) \(\d+\)$/.test(x));
    return label ? { n: Number(label.match(/\((\d+)\)/)[1]) } : null;
  }, 20000);
  if (!counted) throw new Error('Daftar 批次出貨 tidak termuat. Pastikan sudah login Shopee.');
  if (counted.n === 0) return 0;
  const rendered = await waitFor(() => document.querySelectorAll('.mass-ship-row').length >= Math.min(counted.n, 50), 20000);
  if (!rendered) throw new Error('Baris order 批次出貨 tidak termuat.');
  await sleep(800);

  const wanted = new Set(step.orders);
  const rows = [...document.querySelectorAll('.mass-ship-row')].filter((r) => wanted.has(rowOrderNo(r)));
  if (rows.length === 0) return 0;

  const checkRows = () => {
    for (const row of rows) {
      const input = row.querySelector('label.eds-checkbox input');
      if (input && !input.checked) row.querySelector('label.eds-checkbox').click();
    }
  };
  const awbEnabled = () => {
    const l = docCheckbox('寄件單');
    return l && !l.classList.contains('disabled') ? l : null;
  };
  checkRows();
  await sleep(500);
  let awb = await waitFor(awbEnabled, 10000);
  if (!awb) {
    // Centangan kadang ter-reset saat daftar dirender ulang: centang lagi sekali
    checkRows();
    awb = await waitFor(awbEnabled, 10000);
  }
  if (!awb) throw new Error(`Pilihan 寄件單 tidak aktif (${document.querySelectorAll('.mass-ship-row input:checked').length} order tercentang).`);
  if (!awb.querySelector('input').checked) awb.click();
  await sleep(400);

  if (step.method === '30015') {
    const thermal = [...document.querySelectorAll('.normal-and-thermal-shipping-label label.eds-radio')].find((l) => text(l) === '熱感列印');
    if (!thermal) throw new Error('Pilihan 熱感列印 tidak ditemukan.');
    if (!thermal.querySelector('input').checked) thermal.click();
    await sleep(400);
  }

  const download = [...document.querySelectorAll('button')].find((b) => text(b).includes('下載所選文件') && !b.disabled);
  if (!download) throw new Error('Tombol 下載所選文件 tidak aktif.');

  chrome.runtime.sendMessage({ type: 'STEP_PROGRESS', selectedOrders: rows.map(rowOrderNo) });
  document.documentElement.dataset.kbiSameTab = '1';
  download.click();
  return rows.length;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'PRINT_STEP' || msg.step?.site !== 'shopee') return;
  selectAndDownload(msg.step)
    .then(async (count) => {
      if (count === 0) {
        chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: true, printed: 0 });
        return;
      }
      // Normalnya halaman pindah ke halaman cetak. Kalau masih di sini, unduhan gagal.
      await sleep(30000);
      chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: false, error: 'Halaman cetak Shopee tidak terbuka setelah 下載所選文件.' });
    })
    .catch((err) => chrome.runtime.sendMessage({ type: 'STEP_DONE', ok: false, error: err.message }));
});

chrome.runtime.sendMessage({ type: 'READY' });
