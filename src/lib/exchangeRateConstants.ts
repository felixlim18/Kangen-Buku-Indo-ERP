// Satu-satunya sumber nilai fallback kurs di seluruh aplikasi. Dipakai HANYA saat
// live API gagal DAN tidak ada rate historis tersimpan pada dokumen terkait
// (misal freightIn.exchangeRate kosong) - bukan untuk transaksi baru, yang mana
// harus selalu memakai getCachedExchangeRate() dari exchangeRate.ts.

// NTD per 1 IDR (kebalikan dari IDR per NTD).
export const FALLBACK_NTD_PER_IDR = 0.0017801;

// IDR per 1 NTD (kebalikan dari NTD per IDR di atas).
export const FALLBACK_IDR_PER_NTD = 500;

// NTD per 1 USD.
export const FALLBACK_NTD_PER_USD = 32.5;
