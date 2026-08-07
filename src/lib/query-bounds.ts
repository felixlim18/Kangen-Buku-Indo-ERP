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
 * Koleksi yang boleh dibatasi. SENGAJA KOSONG sampai Gate 2 lulus.
 *
 * Tidak akan pernah boleh dibatasi, apa pun hasil Gate 2:
 *  - catalog, inventory  : tidak punya dimensi tanggal (master produk)
 *  - salesOrders         : bengkaknya dari foto base64 di 14 dokumen, bukan jumlah
 *                          baris; replay juga butuh semua SO completed sejak awal
 *  - purchaseOrders      : orderDate tipenya sudah bermasalah - memfilternya akan
 *                          membuang baris diam-diam dan merusak netUnitCostByPoBook
 *
 * Kandidat setelah Gate 2 lulus: inventoryLedger (timestamp), journalEntries (date).
 */
export const BOUNDS: Partial<Record<string, QueryBound>> = {};
