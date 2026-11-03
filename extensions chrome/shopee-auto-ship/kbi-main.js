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

  // 下載所選文件 mengirim daftar order lewat create_sd_jobs, dan Shopee membuat label sesuai urutan daftar itu:
  // susun mengikuti urutan modal ERP (data-kbi-ship-order, diisi shopee-print.js). Order di luar modal ke belakang.
  const packageToOrder = new Map();

  const rememberPackages = (responseText) => {
    const cards = JSON.parse(responseText)?.data?.card_list || [];
    for (const { package_group_card: group } of cards) {
      const orderNo = group?.package_card_list?.[0]?.order_info?.order_sn;
      if (orderNo) packageToOrder.set(group.primary_package_number, orderNo);
    }
  };

  const sortJobBody = (body) => {
    const rank = new Map(JSON.parse(document.documentElement.dataset.kbiShipOrder || '[]').map((no, i) => [no, i]));
    const job = JSON.parse(body);
    if (rank.size === 0 || !Array.isArray(job.group_list)) return body;
    const rankOf = (group) => rank.get(packageToOrder.get(group.primary_package_number)) ?? Number.MAX_SAFE_INTEGER;
    job.group_list.sort((a, b) => rankOf(a) - rankOf(b));
    return JSON.stringify(job);
  };

  const origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.kbiUrl = String(url);
    if (this.kbiUrl.includes('/get_mass_shipment_card_list')) {
      this.addEventListener('load', () => {
        try { rememberPackages(this.responseText); } catch { /* urutan label saja, jangan ganggu halaman */ }
      });
    }
    return origXhrOpen.call(this, method, url, ...rest);
  };

  const origXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (this.kbiUrl?.includes('/create_sd_jobs') && typeof body === 'string') {
      try { body = sortJobBody(body); } catch { /* kirim apa adanya */ }
    }
    return origXhrSend.call(this, body);
  };
})();
