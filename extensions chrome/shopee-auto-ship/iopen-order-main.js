// Auto Order iOPEN, "MAIN world": catat pesan alert/confirm di tab kerja extension supaya tidak memblokir
// halaman dan bisa dilaporkan (iopen-order.js membaca <html data-kbi-alerts>). Tab kerja ditandai
// sessionStorage kbiIopenOrder=1; di tab lain alert/confirm berjalan seperti biasa.
(() => {
  const active = () => {
    try {
      return sessionStorage.getItem('kbiIopenOrder') === '1';
    } catch {
      return false;
    }
  };
  // Pesan dari iframe peta 7-11 dicatat di dokumen atas (asal yang sama)
  const root = () => {
    try {
      return window.top.document.documentElement;
    } catch {
      return document.documentElement;
    }
  };
  const record = (kind, msg) => {
    const el = root();
    let list = [];
    try {
      list = JSON.parse(el.dataset.kbiAlerts || '[]');
    } catch {}
    list.push(`${kind}: ${String(msg ?? '').replace(/\s+/g, ' ').trim()}`);
    el.dataset.kbiAlerts = JSON.stringify(list.slice(-10));
  };
  // jQuery-style alert(...).done(cb) dipakai iOPEN; kembalikan objek yang sama bentuknya
  const thenable = { done(cb) { if (typeof cb === 'function') cb(); return thenable; }, then(cb) { if (typeof cb === 'function') cb(); return thenable; } };

  // Situs bisa mengganti window.alert dengan modal sendiri; tetap dibungkus lewat setter
  const wrap = (name, nativeFn, onNative) => {
    let impl = window[name];
    const wrapped = function (msg) {
      if (!active()) return impl.apply(this, arguments);
      record(name, msg);
      return impl === nativeFn ? onNative() : impl.apply(this, arguments);
    };
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => wrapped,
      set: (v) => {
        impl = v;
      },
    });
  };
  wrap('alert', window.alert, () => thenable);

  // Link "javascript:..." (mis. 請選擇取貨門市 = javascript: seven_type(1)) tidak jalan kalau diklik dari skrip
  // extension, jadi iopen-order.js menandai elemennya dan klik dilakukan di sini, di dunia halaman.
  window.addEventListener('kbi-page-click', () => {
    if (!active()) return;
    const el = document.querySelector('[data-kbi-click]');
    if (!el) return;
    el.removeAttribute('data-kbi-click');
    el.click();
  });
  wrap('confirm', window.confirm, () => root().dataset.kbiAllowConfirm === '1');
})();
