# KBI Auto 出貨 (Shopee & iOPEN Mall)

Extension Chrome untuk tombol **Action**, **Action Semua**, dan **Print Resi** di modal *Proses Massal Pesanan Dikemas*
(baris platform **Shopee** dan **IopenMall**). Nomor resi yang didapat otomatis masuk kolom Nomor Resi dan tersimpan.

## Action Semua: satu per satu, tanpa refresh
Order diproses **satu per satu** di **satu tab kerja per platform** (latar belakang) yang dipakai bergantian:
- **Shopee**: order berikutnya langsung dicari di halaman 我的銷售 yang sudah terbuka, **tanpa refresh**.
  Kalau pencarian di halaman itu gagal, halaman di-refresh sekali lalu dicoba lagi.
- **iOPEN Mall**: halaman dimuat ulang per order (pencariannya lewat URL), tapi tab-nya tetap sama.
- Kalau halaman selesai dimuat tapi bukan daftar order (mis. halaman login), order langsung dilaporkan gagal.
- Pesan gagal menyertakan lama proses, mis. `[34 dtk, halaman dimuat 1x]` / `[12 dtk, tanpa refresh]`.
- Tab kerja tertutup sendiri setelah 1 menit tidak dipakai.

## Shopee (seller.shopee.tw)
1. Buka 我的銷售 di tab kerja latar belakang (sekali; order berikutnya memakai halaman yang sama).
2. Klik tab **全部** dulu, lalu isi 訂單編號 di kolom pencarian, klik hasil di dropdown.
3. Klik 安排出貨 (atau 查看物流 kalau sudah pernah diatur).
4. Kalau muncul dialog 申請寄件編號 → klik tombol itu (lalu 確認 bila ada).
5. Ambil nomor resi dari dialog 查看寄件編號.

## Cek pelunasan Shopee (halaman Piutang Usaha)
Tombol **Cek Shopee** (per baris) dan **Cek Semua Shopee** (semua order Shopee berstatus *Belum Dibayar*):
1. Di tab kerja Shopee: 我的銷售 → 全部 → 訂單編號 = nomor order → buka detail order.
2. 訂單歷史 harus berisi **款項已完成轉帳**. Kalau belum ada → berhenti, baris ditandai "Belum 款項已完成轉帳".
3. Baca nominal **原始訂單進帳**. Kalau tidak sama dengan sisa outstanding ERP → tidak diposting, baris ditandai selisihnya.
4. Kalau sama → ERP langsung memposting pelunasan (akun 1101 Cash: NTD) dengan tanggal 款項已完成轉帳.
Order diproses satu per satu di tab kerja yang sama dengan Action (安排出貨).

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
