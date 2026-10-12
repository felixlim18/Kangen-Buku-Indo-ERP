# KBI Auto 出貨 (Shopee & iOPEN Mall)

Extension Chrome untuk tombol **Action** di modal *Proses Massal Pesanan Dikemas*
(baris platform **Shopee** dan **IopenMall**). Nomor resi yang didapat otomatis masuk kolom Nomor Resi dan tersimpan.

## Shopee (seller.shopee.tw)
1. Buka tab khusus 我的銷售 → 全部 di latar belakang.
2. Isi 訂單編號 di kolom pencarian, klik hasil di dropdown.
3. Klik 安排出貨 (atau 查看物流 kalau sudah pernah diatur).
4. Kalau muncul dialog 申請寄件編號 → klik tombol itu (lalu 確認 bila ada).
5. Ambil nomor resi dari dialog 查看寄件編號.

## iOPEN Mall (sales.iopenmall.tw, toko 050497)
1. Buka 新訂單 (tab 待出貨) dengan pencarian 訂單編號 = nomor order.
2. Klik 取寄件編號 → halaman 已成功產生寄件編號 → ambil nomor resinya.
3. Kalau order sudah tidak ada di 待出貨 (nomor sudah pernah diambil), nomor resi dibaca dari tab 出貨中.

## Pasang / update
1. Buka `chrome://extensions`, aktifkan **Developer mode**.
2. **Load unpacked** → pilih folder `extensions chrome/shopee-auto-ship`
   (kalau sudah terpasang: klik tombol reload ↻ di kartu extension).
3. Pastikan sudah login Shopee Seller Center dan iOPEN Mall 賣家中心 di Chrome yang sama.
4. Refresh halaman ERP.

## Domain ERP
Extension aktif di `localhost`, `127.0.0.1`, `gen-lang-client-0501656267.web.app`, dan `.firebaseapp.com`.
Kalau ERP dibuka dari domain lain, tambahkan domain itu ke `content_scripts[0].matches` di `manifest.json`, lalu reload extension.
