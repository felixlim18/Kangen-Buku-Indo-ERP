# KBI Shopee Auto 安排出貨

Extension Chrome untuk tombol **Action** di modal *Proses Massal Pesanan Dikemas* (hanya baris platform Shopee).

Alur per order:
1. Buka tab khusus `seller.shopee.tw/portal/sale/order` (我的銷售 → 全部) di latar belakang.
2. Isi 訂單編號 di kolom pencarian, klik hasil di dropdown.
3. Klik 安排出貨 (atau 查看物流 kalau sudah pernah diatur).
4. Kalau muncul dialog 申請寄件編號 → klik tombol itu (lalu 確認 bila ada).
5. Ambil nomor resi dari dialog 查看寄件編號, kirim kembali ke ERP → otomatis masuk kolom Nomor Resi dan tersimpan.

## Pasang
1. Buka `chrome://extensions`, aktifkan **Developer mode**.
2. **Load unpacked** → pilih folder `extensions chrome/shopee-auto-ship`.
3. Pastikan sudah login Shopee Seller Center di Chrome yang sama.
4. Refresh halaman ERP.

## Domain ERP
Extension aktif di `localhost`, `127.0.0.1`, `gen-lang-client-0501656267.web.app`, dan `.firebaseapp.com`.
Kalau ERP dibuka dari domain lain, tambahkan domain itu ke `content_scripts[0].matches` di `manifest.json`, lalu klik reload di `chrome://extensions`.
