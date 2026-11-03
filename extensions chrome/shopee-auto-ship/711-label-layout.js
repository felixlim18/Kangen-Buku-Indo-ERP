// Halaman 7-11 交貨便服務單: susun ulang grid 2 kolom menjadi 1 label per halaman (kertas thermal 100x150 mm).
(() => {
  const PAGE_W = '100mm';
  const PAGE_H = '150mm';
  const LABEL_ZOOM = 1.2; // label asli 306x454 px, diperbesar supaya memenuhi kertas

  const panel = document.getElementById('Panel1');
  const labels = [...document.querySelectorAll('.div_frame')].map((frame) => frame.parentElement);
  if (!panel || labels.length === 0) return; // struktur halaman berubah: biarkan apa adanya

  const pages = labels.map((label) => {
    const page = document.createElement('div');
    page.className = 'kbi-page';
    page.append(label);
    return page;
  });
  panel.replaceChildren(...pages);

  const style = document.createElement('style');
  style.textContent = `
    @page { size: ${PAGE_W} ${PAGE_H}; margin: 0; }
    /* Microsoft JhengHei di Mac bisa tampil sebagai karakter acak */
    .kbi-page .FontBold { font-family: "PingFang TC", "Heiti TC", sans-serif !important; }
    /* 149.5mm: tinggi tepat 150mm bisa menghasilkan halaman kosong karena pembulatan */
    .kbi-page {
      width: ${PAGE_W}; height: 149.5mm; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      break-after: page;
    }
    .kbi-page:last-child { break-after: auto; }
    .kbi-page > div { zoom: ${LABEL_ZOOM}; margin: 0 !important; height: auto !important; flex: none; }
    @media screen {
      body { background: #eee; }
      .kbi-page { background: #fff; margin: 12px auto; }
    }
  `;
  document.head.append(style);
})();
