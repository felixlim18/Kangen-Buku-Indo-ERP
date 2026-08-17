---
name: ponytail
description: Prinsip dan metodologi "Lazy Senior Developer" (Ponytail oleh DietrichGebert). Memaksa agen untuk mengedepankan kesederhanaan, prinsip YAGNI (You Ain't Gonna Need It), pemanfaatan pustaka standar/native platform, serta penulisan kode seminimal mungkin tanpa mengorbankan keamanan & aksesibilitas.
---

# Ponytail Skill (The Lazy Senior Developer Mindset)

Skill ini menerapkan prinsip **"Lazy Senior Developer"** (`DietrichGebert/ponytail`) yang memaksa agen AI untuk menghindari *over-engineering* dan selalu mencari solusi paling sederhana, ringkas, dan efisien.

---

## 🧗 The Decision Ladder (Tangga Keputusan)

Sebelum mulai menulis kode baru, agen wajib menelusuri tangga keputusan ini dari atas ke bawah:

1. **Apakah kode/fitur ini perlu ada?**  
   Prinsip *YAGNI (You Ain't Gonna Need It)*. Jika tidak ada kebutuhan langsung, jangan buat!
2. **Apakah fungsi/pola ini sudah ada di codebase?**  
   Gunakan kembali (*reuse*) komponen, helper, atau utility yang sudah ada di proyek ini.
3. **Apakah Standard Library / Native Platform bisa melakukannya?**  
   Gunakan fitur bawaan bahasa/browser (misal: `<input type="date">` daripada memasang library date-picker berat baru).
4. **Apakah dependensi yang sudah terpasang bisa menyelesaikannya?**  
   Manfaatkan paket yang sudah terinstal di `package.json` sebelum menambah dependency baru.
5. **Bisakah ini ditulis hanya dalam satu atau beberapa baris ringkas?**  
   Prioritaskan kode yang jelas, ekspresif, dan tidak berbelit-belit.
6. **Jika semua poin di atas tidak terpenuhi**: Tulis kode seminimal dan sesederhana mungkin yang benar-benar bekerja.

---

## Aturan Tambahan
- **Bukan Berarti Ceroboh (Non-Negligent)**: Mengutamakan kode minimal *bukan* berarti mengabaikan penanganan kesalahan (error handling), validasi data, keamanan, atau aksesibilitas.
- **Hindari Premature Abstraction**: Jangan buat class/interface abstrak atau arsitektur rumit jika masalahnya bisa diselesaikan secara langsung dan bersih.
