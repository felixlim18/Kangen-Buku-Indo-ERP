// Berjalan di "MAIN world" halaman (bukan isolated world) supaya bisa membungkus window.open & form.submit.
// Selama extension sedang mencetak (data-kbi-same-tab="1"), halaman cetak dibuka di tab yang sama,
// sehingga tidak terkena popup blocker dan tetap berada di tab kerja extension.
(() => {
  const active = () => document.documentElement.dataset.kbiSameTab === '1';

  const origOpen = window.open;
  window.open = function (url, ...rest) {
    if (active() && url) {
      location.href = new URL(url, location.href).href;
      return window;
    }
    return origOpen.call(this, url, ...rest);
  };

  const origSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (active() && this.target && this.target !== '_self') this.target = '_self';
    return origSubmit.call(this);
  };
})();
