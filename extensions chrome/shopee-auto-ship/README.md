# KBI Auto 出貨 (Shopee & iOPEN Mall)

Extension Chrome untuk tombol **Action**, **Action Semua**, dan **Print Resi** di modal *Proses Massal Pesanan Dikemas*
(baris platform **Shopee** dan **IopenMall**). Nomor resi yang didapat otomatis masuk kolom Nomor Resi dan tersimpan.

## Action Semua: paralel, 1 tab per order
Setiap nomor order dikerjakan di **tab latar belakangnya sendiri** dan berjalan **bersamaan** (maks 5 tab sekaligus;
begitu satu selesai, order berikutnya langsung dimulai). Tab ditutup otomatis setelah nomor resi didapat.
Batas 5 diatur di `MAX_PARALLEL_SHIP` (background.js) dan `AUTO_SHIP_PARALLEL` (ERP `src/lib/auto-ship.ts`) — ubah keduanya bersamaan.

## Shopee (seller.shopee.tw)
1. Buka tab baru 我的銷售 → 全部 di latar belakang (satu tab per order).
2. Isi 訂單編號 di kolom pencarian, klik hasil di dropdown.
3. Klik 安排出貨 (atau 查看物流 kalau sudah pernah diatur).
4. Kalau muncul dialog 申請寄件編號 → klik tombol itu (lalu 確認 bila ada).
5. Ambil nomor resi dari dialog 查看寄件編號.

## iOPEN Mall (sales.iopenmall.tw, toko 050497)
1. Buka 新訂單 (tab 待出貨) dengan pencarian 訂單編號 = nomor order.
2. Klik 取寄件編號 → halaman 已成功產生寄件編號 → ambil nomor resinya.
3. Kalau order sudah tidak ada di 待出貨 (nomor sudah pernah diambil), nomor resi dibaca dari tab 出貨中.

## Print Resi (tombol di header modal)
Mencetak label untuk order di modal yang Nomor Resi-nya sudah terisi. Dialog cetak Chrome tetap muncul:
tekan **Print / Enter** di setiap dialog (extension tidak bisa menekan tombol itu).
1. Shopee 蝦皮店到店: 批次出貨 → 下載出貨文件 → 已處理 · 出貨天數 全部 → centang order modal →
   寄件單 + 熱感列印 → 下載所選文件 → 列印出貨文件.
2. Shopee 7-ELEVEN: sama, tanpa 熱感列印 → halaman 7-11 交貨便服務單 → cetak.
3. iOPEN Mall: 訂單批次作業 → 出貨中 → centang order modal → 列印超商標籤 → 列印寄件標籤(單排) → cetak.

Ketiganya berjalan **bersamaan** di tab latar belakang di sebelah tab ERP (tidak saling menunggu).
Tab yang dialog cetaknya siap ditampilkan; kalau ada dialog lain yang masih terbuka, tab berikutnya
ditampilkan setelah dialog itu selesai. Halaman cetak dibuka di tab itu (bukan popup), jadi tidak perlu
mengizinkan pop-up. Tab label 7-11 & iOPEN tertutup sendiri setelah dialog cetak selesai.

## Pasang / update
1. Buka `chrome://extensions`, aktifkan **Developer mode**.
2. **Load unpacked** → pilih folder `extensions chrome/shopee-auto-ship`
   (kalau sudah terpasang: klik tombol reload ↻ di kartu extension).
3. Pastikan sudah login Shopee Seller Center dan iOPEN Mall 賣家中心 di Chrome yang sama.
4. Refresh halaman ERP.

## Domain ERP
Extension aktif di `localhost`, `127.0.0.1`, `gen-lang-client-0501656267.web.app`, dan `.firebaseapp.com`.
Kalau ERP dibuka dari domain lain, tambahkan domain itu ke `content_scripts[0].matches` di `manifest.json`, lalu reload extension.
