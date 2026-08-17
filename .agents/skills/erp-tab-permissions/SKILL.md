---
name: erp-tab-permissions
description: Panduan dan aturan wajib pembuatan tab/sub-tab baru di Kangen Buku Indo ERP. Memastikan setiap tab baru didaftarkan di Manajemen User dan status default-nya tersembunyi (HIDE).
---

# ERP Tab & Permission Management Skill

Gunakan skill ini setiap kali menambahkan atau mengedit Tab, Sub-tab, Navigasi, atau Fitur Modul baru di Kangen Buku Indo ERP.

## Aturan Utama (Strict Rules)

1. **Registrasi Wajib di Manajemen User**:
   Setiap tab, sub-tab, atau fitur sensitif baru wajib ditambahkan ke dalam array `MODULES` di [UserManagementTab.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/UserManagementTab.tsx).

2. **Default State: HIDE (`false`)**:
   Status awal (default) untuk semua tab/sub-tab baru bagi pengguna non-owner adalah **HIDE / Off (`false`)**. Tidak boleh default visible/open.

3. **Role Owner Bypass**:
   Role `owner` mendapatkan akses otomatis ke seluruh tab tanpa terkecuali.

4. **Navigasi Check**:
   Gunakan pengecekan boolean strict di [Sidebar.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/Sidebar.tsx) dan [MobileNav.tsx](file:///Users/Felixsalim/antigravity/Kangen-Buku-Indo-ERP/src/components/MobileNav.tsx):
   `!!profile?.permissions?.[tabKey]`
