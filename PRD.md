# Product Requirements Document (PRD) & Standard Operating Procedure (SOP)
## Kangen Buku Indo ERP

---

## Standard Permission & Tab Management Policy

### 1. Overview
Akses terhadap modul, tab, sub-tab, dan fitur pada Kangen Buku Indo ERP dikontrol secara terpusat melalui modul **Manajemen User** (`UserManagementTab.tsx`).

### 2. Aturan Wajib Pembuatan Tab / Modul Baru
Setiap pengembang (human maupun AI Agent) yang membuat atau menambahkan tab/modul/fitur baru **WAJIB** mematuhi ketentuan berikut:

1. **Registrasi Modul di User Management**:
   - Seluruh tab baru, sub-tab baru, maupun tombol/fitur sensitif baru **WAJIB** terdaftar pada daftar `MODULES` di [UserManagementTab.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/UserManagementTab.tsx).

2. **Default State = HIDE (Disabled / `false`)**:
   - Setiap tab/modul baru secara default **HARUS TERSEMBUNYI (HIDE)** untuk seluruh pengguna non-owner.
   - Tab/modul baru **TIDAK BOLEH** langsung muncul di Sidebar/Navigasi pengguna sebelum diizinkan (centang aktif) oleh Owner melalui Manajemen User.

3. **Role Owner Bypass**:
   - Pengguna dengan role `owner` secara otomatis mendapatkan akses penuh ke seluruh tab dan fitur tanpa terpengaruh batasan permission.

4. **Pengecekan Akses Strict di Navigasi**:
   - Pengecekan pada [Sidebar.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/Sidebar.tsx) dan [MobileNav.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/MobileNav.tsx) wajib mengevaluasi permission secara positif (`!!profile?.permissions?.[tabKey]`).
   - Tidak diperbolehkan menggunakan default-open fallback seperti `!== false` untuk modul baru.

---

### 3. Checklist Implementasi Tab Baru
- [ ] Daftarkan key & label di `MODULES` ([UserManagementTab.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/UserManagementTab.tsx))
- [ ] Tambahkan helper permission check di [Sidebar.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/Sidebar.tsx) & [MobileNav.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/MobileNav.tsx)
- [ ] Uji akses dengan akun non-owner (pastikan tab default-nya tersembunyi/HIDE)
- [ ] Aktifkan via Manajemen User dan pastikan tab muncul sesuai harapan
