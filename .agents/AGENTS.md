# Aturan Pengembangan Kangen Buku Indo ERP (Project Rules)

## 1. Manajemen Tab Baru & Permission Standard (SANGAT KRITIS)

Setiap kali ada **Tab Baru, Sub-tab Baru, atau Fitur Sensitif Baru** yang ditambahkan ke aplikasi ERP ini:

### A. Wajib Terdaftar di Manajemen User (`UserManagementTab.tsx`)
- Tab, sub-tab, atau fitur baru tersebut **HARUS** didaftarkan ke dalam konstanta `MODULES` pada [UserManagementTab.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/UserManagementTab.tsx).
- Berikan `key` yang unik (contoh: `'beban-lainnya'` atau `'dashboard.grafik'`) serta `label` deskriptif.

### B. Default Permission Status = HIDE (`false`)
- Status permission default untuk semua tab / sub-tab / fitur baru bagi user non-owner adalah **HIDDEN / HIDE (`false`)**.
- Tab/fitur **TIDAK BOLEH** muncul secara otomatis (default open) untuk user biasa tanpa izin tertulis yang diberikan oleh Owner melalui Manajemen User.
- Role `owner` selalu memiliki akses penuh (bypass permission check).

### C. Pengecekan Akses UI Strict
- Pengecekan permission pada [Sidebar.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/Sidebar.tsx), [MobileNav.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/MobileNav.tsx), serta komponen Tab terkait **WAJIB** menggunakan pengecekan boolean eksplisit `!!profile?.permissions?.[tabKey]` (default `false`).
- **DILARANG** menggunakan logika `!== false` (default visible) untuk tab atau fitur baru.

---

## 2. Checklist Wajib Sebelum Menyelesaikan Task Pembuatan Tab Baru
- [ ] Mendaftarkan `key` & `label` tab baru di `MODULES` pada [UserManagementTab.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/UserManagementTab.tsx).
- [ ] Menambahkan logika filter/pengecekan hak akses di [Sidebar.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/Sidebar.tsx) dan [MobileNav.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/MobileNav.tsx).
- [ ] Verifikasi bahwa user biasa (non-owner) secara default **TIDAK BISA** melihat/mengakses tab tersebut sampai diaktifkan di Manajemen User.
