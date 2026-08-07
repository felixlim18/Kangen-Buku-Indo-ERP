// Batas rentang tanggal untuk query koleksi besar.
//
// Bentuknya "lantai epoch", bukan jendela bergulir 12 bulan. Alasannya:
// seluruh data hari ini berada di Des 2025 - Ags 2026, jadi batas apa pun yang
// lebih tua dari itu TERBUKTI tidak menyaring satu dokumen pun dan karena itu
// tidak mungkin mengubah angka. Yang kita dapat sekarang cuma bentuk query dan
// index komposit-nya; saat data sudah cukup tua, tinggal ubah satu konstanta.
//
// BAHAYA yang mendasari desain ini: filter inequality Firestore DIAM-DIAM
// membuang dokumen yang field-nya tidak ada atau berbeda tipe. Sudah terbukti
// purchaseOrders.orderDate tipenya tidak konsisten, dan adanya penanganan
// defensif di parseEventDate/isTimestampInMonth mengisyaratkan inventoryLedger
// .timestamp serta journalEntries.date juga campur. Karena itu sebuah koleksi
// hanya boleh masuk BOUNDS setelah scripts/verify-date-bounds.cjs menyatakan
// field-nya bersih (tidak ada yang hilang, semua bertipe Timestamp, dan
// count(field >= DATA_EPOCH) === total dokumen).

/** 11 bulan sebelum baris terlama yang diketahui (2025-12). */
export const DATA_EPOCH = new Date('2025-01-01T00:00:00Z');

export interface QueryBound {
  field: string;
  /** Ikut jadi bagian kunci cache supaya hasil berbatas dan tak-berbatas tidak beradu. */
  describe: string;
  value: Date;
}

/**
 * Koleksi yang boleh dibatasi. Isinya ditentukan oleh hasil
 * scripts/verify-date-bounds.ts (dijalankan 7 Agu 2026):
 *
 *   BOLEH  inventoryLedger.timestamp   764/764 Timestamp, 0 terbuang
 *   TOLAK  journalEntries.date         38 dari 1.219 dokumen bertipe string -
 *                                      filter tanggal akan MEMBUANGNYA DIAM-DIAM,
 *                                      merusak saldo rekonsiliasi 1201/1202
 *   TOLAK  purchaseOrders.orderDate    field-nya TIDAK ADA di ke-361 dokumen -
 *                                      filter akan membuang 100% PO
 *   BOLEH  salesOrders.orderDate       bersih, tapi sengaja tidak dibatasi:
 *                                      replay butuh semua SO completed sejak awal,
 *                                      dan bengkaknya dari foto base64 (bukan baris)
 *
 * catalog & inventory tidak punya dimensi tanggal sama sekali (master produk).
 *
 * PERINGATAN: jalankan ulang verify-date-bounds.ts sebelum menambah koleksi apa
 * pun ke sini, dan setelah perubahan yang menyentuh cara field tanggal ditulis.
 * Satu dokumen bertipe salah = satu baris hilang tanpa pesan error.
 */
export const BOUNDS: Partial<Record<string, QueryBound>> = {
  inventoryLedger: { field: 'timestamp', describe: 'ts>=2025-01', value: DATA_EPOCH },
};
