// Pilih produk toko iOPEN yang total harganya PERSIS sama dengan total SO, dengan jumlah barang paling
// sedikit dan tidak melebihi stok. Dipakai iopen-order.js; juga dimuat scripts/test-iopen-order.ts.
// products: [{ no, name, price, stock }] (harga & stok NT$ utuh). Hasil: [{ no, name, price, qty }] atau null.
(function (root) {
  function planIopenItems(products, amount) {
    if (!Number.isInteger(amount) || amount <= 0) return null;
    const usable = products.filter((p) => Number.isInteger(p.price) && p.price > 0 && p.price <= amount && p.stock > 0);
    // Bounded knapsack lewat pemecahan biner stok: tiap paket = (produk, jumlah) dipakai paling banyak sekali
    const packs = [];
    for (const p of usable) {
      let left = Math.min(p.stock, Math.floor(amount / p.price));
      for (let k = 1; left > 0; k *= 2) {
        const n = Math.min(k, left);
        packs.push({ p, n, cost: p.price * n });
        left -= n;
      }
    }
    const INF = 1e9;
    const best = new Int32Array(amount + 1).fill(INF); // jumlah barang paling sedikit untuk tiap total
    best[0] = 0;
    // Simpan pilihan per paket supaya rekonstruksi tidak memakai paket yang sama dua kali
    const choice = packs.map(() => null);
    packs.forEach((pk, i) => {
      const taken = new Uint8Array(amount + 1);
      for (let a = amount; a >= pk.cost; a--) {
        const cand = best[a - pk.cost] + pk.n;
        if (best[a - pk.cost] < INF && cand < best[a]) {
          best[a] = cand;
          taken[a] = 1;
        }
      }
      choice[i] = taken;
    });
    if (best[amount] >= INF) return null;
    // Rekonstruksi mundur: paket i diambil di total a kalau choice[i][a]
    const qty = new Map();
    let a = amount;
    for (let i = packs.length - 1; i >= 0 && a > 0; i--) {
      if (choice[i][a]) {
        const { p, n, cost } = packs[i];
        qty.set(p, (qty.get(p) || 0) + n);
        a -= cost;
      }
    }
    if (a !== 0) return null;
    return [...qty.entries()].map(([p, n]) => ({ no: p.no, name: p.name, price: p.price, qty: n }));
  }
  root.planIopenItems = planIopenItems;
})(typeof window !== 'undefined' ? window : globalThis);
