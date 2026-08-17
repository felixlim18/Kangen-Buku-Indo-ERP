---
name: claude-mem
description: Panduan dan integrasi plugin claude-mem untuk persistent memory (memori jangka panjang) yang menyimpan keputusan arsitektur, histori perbaikan bug, dan konteks penting proyek antar sesi.
---

# Claude-Mem Persistent Memory Skill

Skill ini memberikan panduan integrasi dan penggunaan plugin **`claude-mem`** (oleh Alex Newman / `thedotmack`).

## Fungsi Utama
- **Persistent Long-Term Memory**: Menyimpan riwayat percakapan, arsitektur yang disepakati, serta keputusan perbaikan bug ke dalam SQLite/Chroma DB agar tidak hilang saat sesi baru dimulai.
- **Context Injection**: Otomatis mengingat keputusan penting dari sesi sebelumnya sehingga tidak perlu mengulang instruksi yang sama.
- **Prompt Compression**: Mengompresi riwayat sehingga efisien dalam penggunaan token.

---

## Cara Mengaktifkan / Menginstal CLI Worker

Jika Anda ingin menjalankan layanan background memory worker `claude-mem`:

```bash
# Jalankan installer via npx di terminal Anda
npx claude-mem install
```

Atau jika menggunakan Claude Code CLI:
```bash
claude plugin install thedotmack/claude-mem
```

---

## Praktik Penyimpanan Konteks Memori di Proyek Ini

Jika Anda ingin agen menyimpan catatan arsitektur atau keputusan fitur penting secara manual, agen akan mencatatnya ke dalam Knowledge Items (KI) atau file `.agents/` proyek ini.
