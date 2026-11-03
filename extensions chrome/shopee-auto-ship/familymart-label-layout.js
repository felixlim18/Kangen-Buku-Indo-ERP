// Halaman Shopee 全家店到店寄件單: labelnya bitmap di <canvas> yang jauh lebih lebar dari kertas.
// Label dipotong dari garis potong, dipaskan ke kertas 4x6 in tanpa atur scale, dan QR digambar ulang sebagai vektor.
// Halaman membuka dialog cetak sendiri setelah semua label digambar, jadi penyusunan dilakukan di beforeprint.
(() => {
  const PAGE_W = '4in';
  const PAGE_H = '6in';
  const PAGE_PAD = '2mm';
  const QR_MAX_SCALE = 1.3; // batas pembesaran QR; dikurangi otomatis kalau menabrak teks
  const EDGE = 0.985; // garis potong ada di tepi canvas dan kadang tampak utuh; bingkai label selalu di dalam batas ini

  // Kelompok indeks yang lolos test, dipisah jarak kosong minimal `gap`
  function runs(from, to, test, gap) {
    const out = [];
    for (let i = from; i < to; i++) {
      if (!test(i)) continue;
      const last = out[out.length - 1];
      if (last && i - last[1] <= gap) last[1] = i;
      else out.push([i, i]);
    }
    return out;
  }

  function reader(canvas) {
    const { width: W, height: H } = canvas;
    const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    const dark = (x, y) => {
      const i = (y * W + x) * 4;
      return d[i] + d[i + 1] + d[i + 2] < 384;
    };
    const rowCount = (y, x0 = 0, x1 = W) => {
      let n = 0;
      for (let x = x0; x < x1; x++) if (dark(x, y)) n++;
      return n;
    };
    const colCount = (x, y0 = 0, y1 = H) => {
      let n = 0;
      for (let y = y0; y < y1; y++) if (dark(x, y)) n++;
      return n;
    };
    return { W, H, dark, rowCount, colCount };
  }

  // Bingkai label = garis utuh terluar, di luar area garis potong
  function findFrame(px) {
    const rows = runs(0, Math.floor(px.H * EDGE), (y) => px.rowCount(y) > px.W * 0.8, 1);
    const cols = runs(0, Math.floor(px.W * EDGE), (x) => px.colCount(x) > px.H * 0.8, 1);
    if (rows.length < 2 || cols.length < 2) return null;
    return { l: cols[0][0], t: rows[0][0], r: cols[cols.length - 1][1], b: rows[rows.length - 1][1] };
  }

  // QR ada di kanan atas: blok paling tinggi di area itu, kolom paling kanan
  function findQr(px, f) {
    const w = f.r - f.l;
    const h = f.b - f.t;
    const x0 = f.l + Math.round(w * 0.55);
    const x1 = f.r - 8;
    const y0 = f.t + 20;
    const y1 = f.t + Math.round(h * 0.35);
    const tallest = runs(y0, y1, (y) => px.rowCount(y, x0, x1) > 0, 11).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
    if (!tallest) return null;
    const col = runs(x0, x1, (x) => px.colCount(x, tallest[0], tallest[1] + 1) > 0, 11).pop();
    if (!col) return null;
    const row = runs(tallest[0], tallest[1] + 1, (y) => px.rowCount(y, col[0], col[1] + 1) > 0, 11)[0];
    const size = col[1] - col[0] + 1;
    if (size < 100 || Math.abs(row[1] - row[0] + 1 - size) > 6) return null;
    return { x: col[0], y: row[0], size };
  }

  // Baca QR per modul. Hanya dipakai kalau polanya jelas; selain itu QR asli dibiarkan (kode salah lebih parah dari buram).
  function readModules(px, qr) {
    let run = 0;
    while (run < qr.size && px.dark(qr.x + run, qr.y + 2)) run++;
    const n = Math.round(qr.size / (run / 7));
    if ((n - 17) % 4 !== 0 || n < 21) return null;
    const m = qr.size / n;
    const inset = Math.max(1, Math.floor(m * 0.25));
    const modules = [];
    let unclear = 0;
    for (let r = 0; r < n; r++) {
      const line = [];
      for (let c = 0; c < n; c++) {
        const cx0 = Math.round(qr.x + c * m) + inset;
        const cy0 = Math.round(qr.y + r * m) + inset;
        const cx1 = Math.round(qr.x + (c + 1) * m) - inset;
        const cy1 = Math.round(qr.y + (r + 1) * m) - inset;
        let on = 0;
        let all = 0;
        for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) { all++; if (px.dark(x, y)) on++; }
        const ratio = all ? on / all : 0;
        if (ratio > 0.1 && ratio < 0.9) unclear++;
        line.push(ratio >= 0.5);
      }
      modules.push(line);
    }
    if (unclear > n * n * 0.02) return null;
    const finderOk = (r0, c0) => {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (modules[r0 + r][c0 + c] !== (ring || core)) return false;
      }
      return true;
    };
    if (!finderOk(0, 0) || !finderOk(0, n - 7) || !finderOk(n - 7, 0)) return null;
    return { n, m, modules };
  }

  // Ukuran terbesar yang area barunya (plus quiet zone) tidak menyentuh teks atau garis di sekitarnya
  function growQr(px, qr, grid) {
    const quiet = Math.ceil(grid.m * 2);
    const right = qr.x + qr.size;
    const midY = qr.y + qr.size / 2;
    for (let s = QR_MAX_SCALE; s > 1; s -= 0.02) {
      const side = Math.round(qr.size * s);
      const X = right - side;
      const Y = Math.round(midY - side / 2);
      let clear = true;
      for (let y = Y - quiet; clear && y < Y + side + quiet; y++) {
        for (let x = X - quiet; x < right; x++) {
          const inOld = x >= qr.x && y >= qr.y && y < qr.y + qr.size;
          if (!inOld && px.dark(x, y)) { clear = false; break; }
        }
      }
      if (clear) return { x: X, y: Y, side };
    }
    return { x: qr.x, y: qr.y, side: qr.size };
  }

  function qrSvg(grid, box, frame, frameW, frameH) {
    const path = grid.modules.flatMap((line, r) => {
      const parts = [];
      line.forEach((on, c) => { if (on) parts.push(`M${c} ${r}h1v1h-1z`); });
      return parts;
    }).join('');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${grid.n} ${grid.n}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.style.cssText = `position:absolute;left:${((box.x - frame.l) / frameW) * 100}%;top:${((box.y - frame.t) / frameH) * 100}%;width:${(box.side / frameW) * 100}%;height:${(box.side / frameH) * 100}%`;
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    shape.setAttribute('fill', '#000');
    svg.append(shape);
    return svg;
  }

  function buildPage(source) {
    const page = document.createElement('div');
    page.className = 'kbi-page';
    const label = document.createElement('div');
    label.className = 'kbi-label';
    page.append(label);

    let px = null;
    try { px = reader(source); } catch { /* canvas tidak bisa dibaca: pakai apa adanya */ }
    const frame = px && findFrame(px);
    if (!frame) {
      label.style.aspectRatio = `${source.width} / ${source.height}`;
      label.append(source);
      return page;
    }
    const pad = 2;
    const f = {
      l: Math.max(0, frame.l - pad),
      t: Math.max(0, frame.t - pad),
      r: Math.min(px.W - 1, frame.r + pad),
      b: Math.min(px.H - 1, frame.b + pad),
    };
    const w = f.r - f.l + 1;
    const h = f.b - f.t + 1;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(source, f.l, f.t, w, h, 0, 0, w, h);
    label.style.aspectRatio = `${w} / ${h}`;
    label.append(out);

    const qr = findQr(px, frame);
    const grid = qr && readModules(px, qr);
    if (grid) {
      const box = growQr(px, qr, grid);
      ctx.fillStyle = '#fff';
      ctx.fillRect(qr.x - f.l, qr.y - f.t, qr.size, qr.size);
      label.append(qrSvg(grid, box, f, w, h));
    }
    return page;
  }

  function apply() {
    const pages = [...document.querySelectorAll('body > canvas')].map(buildPage);
    document.querySelectorAll('body > canvas').forEach((c) => c.remove());
    document.body.append(...pages);

    const style = document.createElement('style');
    style.textContent = `
      @page { size: ${PAGE_W} ${PAGE_H}; margin: 0; }
      /* Tinggi dikurangi sedikit: tepat setinggi kertas bisa menghasilkan halaman kosong karena pembulatan */
      .kbi-page {
        width: ${PAGE_W}; height: calc(${PAGE_H} - 0.5mm); overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        break-after: page;
      }
      .kbi-page:last-child { break-after: auto; }
      .kbi-label { position: relative; height: calc(${PAGE_H} - 2 * ${PAGE_PAD}); flex: none; }
      .kbi-label canvas { display: block; width: 100% !important; height: 100% !important; }
      @media screen {
        body { background: #eee; }
        .kbi-page { background: #fff; margin: 12px auto; }
      }
    `;
    document.head.append(style);
  }

  window.addEventListener('beforeprint', apply, { once: true });
})();
