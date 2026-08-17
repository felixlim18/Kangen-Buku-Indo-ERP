---
name: superpowers
description: Framework metodologi pengembangan perangkat lunak berbasis agen (Superpowers oleh Jesse Vincent @obra). Gunakan skill ini untuk menerapkan TDD (Test-Driven Development), pembuatan spesifikasi mendalam (Brainstorming & Spec), Implementation Planning, dan Systematic Review sebelum menulis atau mengubah kode.
---

# Superpowers Skill Framework

Skill ini menerapkan metodologi pengembangan perangkat lunak **Superpowers** (oleh Jesse Vincent `@obra`) untuk memastikan setiap pengerjaan fitur/fitur baru dilakukan dengan disiplin *Senior Software Engineer*.

---

## Prinsip Utama (Superpowers Workflow)

```
[1. Brainstorm & Spec] ──> [2. Implementation Plan] ──> [3. Test-Driven Dev (TDD)] ──> [4. Systematic Review]
```

### 1. Brainstorming & Specification
- **Lakukan klarifikasi mendalam** sebelum mulai menulis kode.
- Evaluasi semua batasan teknis, arsitektur yang ada, edge cases, dan dependensi.
- Jangan terburu-buru membuat implementasi tanpa rencana spesifikasi yang jelas.

### 2. Implementation Planning
- Pecah tugas kompleks menjadi langkah-langkah kecil (*sub-tasks*) yang atomic dan independen.
- Tentukan kriteria sukses (*definition of done*) untuk setiap langkah.

### 3. Test-Driven Development (TDD)
- **TDD First**: Tulis atau persiapkan automated tests yang gagal (*red phase*) terlebih dahulu untuk mendefinisikan ekspektasi perilaku.
- Tulis kode implementasi seminimal mungkin agar unit test berhasil (*green phase*).
- Lakukan refactoring tanpa merusak kelulusan test.

### 4. Systematic Review & Verification
- Verifikasi hasil akhir secara menyeluruh (jalankan linter, typecheck, build, dan test suite).
- Pastikan tidak ada *side-effects* atau *breaking changes* pada modul lain.

---

## Panduan Penggunaan Skill Ini dalam Tugas Coding

Setiap kali skill `superpowers` ini diaktifkan untuk tugas pengembangan:
1. Agen harus membuat `implementation_plan.md` terlebih dahulu jika fitur bersifat kompleks.
2. Agen wajib memverifikasi setiap perubahan dengan menjalankan automated tests (`npm test` atau `npm run build`).
3. Jangan menganggap tugas selesai sebelum semua pengujian berhasil dan terverifikasi secara konkret.
