# Arsip Script Sekali-Pakai

Isi folder ini sebelumnya berserakan di root project. Semuanya adalah script
one-off yang dibuat selama sesi debugging/audit — **bukan** bagian dari aplikasi.
Tidak ada satu pun yang di-import oleh `src/`, `server.ts`, atau `package.json`.

Diarsipkan supaya root project bersih, tapi tidak dihapus karena beberapa berguna
sebagai riwayat/rujukan perbaikan data.

## `firestore/` (45 file)

Script yang terhubung langsung ke Firestore (`firebase-admin`) — audit, diagnosa,
dan migrasi data. Ini bagian paling berharga di arsip: dokumentasi perbaikan data
yang pernah dijalankan di database produksi.

Yang paling relevan (sesi audit rekonsiliasi & piutang/utang, Agustus 2026):

| Script | Fungsi |
| --- | --- |
| `fix_migration_journal_dates.cjs` | Perbaiki tanggal jurnal migrasi stok awal |
| `fix_16_misdated_journals.cjs` | Perbaiki 16 jurnal dengan tanggal salah |
| `fix_duplicate_ledger_and_stale_adjustment.cjs` | Hapus entri ledger duplikat dari scan barcode |
| `fix_missing_receipt_journals.cjs` | Buat jurnal penerimaan barang yang hilang |
| `fix_migrate_2100_children.cjs` | Konsolidasi akun anak `2100-XXX` ke induk `2100 Utang Usaha` |
| `diagnose_reconciliation.cjs` | Diagnosa selisih rekonsiliasi stok vs nilai persediaan |

Pola umum: jalankan tanpa argumen = **dry-run** (tidak menulis apa pun), tambah
`--apply` untuk benar-benar menulis. Semua butuh service account key di
`~/gen-lang-client-0501656267-firebase-adminsdk-*.json` dan menargetkan named
database `ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7`.

> Sebagian besar sudah tidak relevan — masalah yang mereka perbaiki sudah selesai,
> dan menjalankan ulang bisa berbahaya. Baca isinya dulu sebelum menjalankan apa pun.

## `codemods/` (224 file)

Script Python/Node/shell yang mengedit file source (`fix-*.cjs`, `patch_*.py`,
`update_*.py`, `test-*.ts`, dst). Ditulis untuk satu perubahan spesifik di satu
titik waktu dan sudah usang — file target sudah banyak berubah sejak itu.
Praktis tidak ada nilai pakai ulang; disimpan hanya untuk jejak riwayat.

## `misc/` (8 file)

Dump data (`coa.json`, `journals.json`, `db_status.json`), screenshot, dan file
HTML percobaan.

---

**Ke depan:** script sekali-pakai sebaiknya langsung ditulis ke `scripts/archive/firestore/`
(kalau menyentuh data) alih-alih ke root, supaya tidak menumpuk lagi.
