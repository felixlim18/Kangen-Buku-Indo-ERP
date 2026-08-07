// Cache sesi untuk koleksi Firestore yang diambil sekali-jalan (getDocs).
//
// Kenapa perlu: tab seperti InventoryTab mengambil 9 koleksi penuh (~11 MB) di
// useEffect dengan deps []. Karena App.tsx me-render tab secara kondisional,
// pindah tab lalu kembali akan meng-unmount dan me-mount ulang komponennya,
// sehingga seluruh 11 MB diunduh ulang setiap kali.
//
// persistentLocalCache di src/lib/firebase.ts TIDAK menolong di sini: getDocs
// sekali-jalan dikompilasi jadi RPC runQuery yang selalu mengembalikan seluruh
// hasil. Tidak ada jalur delta/resume-token seperti onSnapshot. Cache ini duduk
// di atasnya dan menghilangkan round trip sekaligus materialisasi protobuf->JS.
//
// Ini store level-modul, bukan React context: context akan me-render ulang semua
// consumer setiap kali ada tulisan, dan memaksa keputusan penempatan provider.

type Entry = {
  promise: Promise<any[]>;
  data?: any[];
  fetchedAt: number;
  failed?: boolean;
};

const store = new Map<string, Entry>();
const listeners = new Set<() => void>();

/** Data dianggap basi setelah ini. Jaring pengaman untuk tulisan dari tab lain
 *  (SalesTab/PurchasesTab/FreightInTab/JournalTab juga menulis koleksi yang sama)
 *  yang tidak memanggil invalidateCollections. */
export const DEFAULT_TTL_MS = 5 * 60_000;

/**
 * Kunci cache mengandung deskripsi bound-nya, bukan cuma nama koleksi, supaya
 * hasil query berbatas dan tak-berbatas tidak pernah saling menimpa.
 */
export function cacheKey(collectionName: string, bounds?: string): string {
  return bounds ? `${collectionName}|${bounds}` : collectionName;
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* listener tidak boleh menjatuhkan yang lain */ }
  });
}

/**
 * Kembalikan data yang di-cache kalau masih segar, selain itu jalankan fetcher.
 *
 * Yang disimpan adalah Promise-nya, bukan cuma hasilnya, sehingga dua pemanggil
 * bersamaan (mis. double-effect StrictMode di dev) berbagi satu round trip.
 */
export function getCached<T = any>(
  key: string,
  fetcher: () => Promise<T[]>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T[]> {
  const hit = store.get(key);
  if (hit && !hit.failed && Date.now() - hit.fetchedAt < ttlMs) {
    return hit.promise as Promise<T[]>;
  }

  const entry: Entry = { promise: null as any, fetchedAt: Date.now() };
  entry.promise = fetcher()
    .then((data) => {
      entry.data = data;
      notify();
      return data;
    })
    .catch((err) => {
      // Jangan simpan kegagalan sebagai hasil valid - percobaan berikutnya harus
      // benar-benar mencoba lagi, bukan mengembalikan error yang sama selama 5 menit.
      entry.failed = true;
      store.delete(key);
      throw err;
    });

  store.set(key, entry);
  return entry.promise as Promise<T[]>;
}

/** Baca isi cache tanpa memicu fetch. Mengembalikan undefined kalau belum ada
 *  atau fetch-nya belum selesai. */
export function peek<T = any>(key: string): { data: T[]; fetchedAt: number } | undefined {
  const hit = store.get(key);
  if (!hit || hit.data === undefined) return undefined;
  return { data: hit.data as T[], fetchedAt: hit.fetchedAt };
}

/** Buang entri tertentu berdasarkan kunci persisnya. */
export function invalidate(...keys: string[]): void {
  keys.forEach((k) => store.delete(k));
  notify();
}

/**
 * Buang semua entri milik koleksi-koleksi ini, apa pun bound-nya.
 * Panggil ini setelah menulis supaya pembacaan berikutnya melihat data baru.
 */
export function invalidateCollections(...collectionNames: string[]): void {
  const names = new Set(collectionNames);
  for (const key of [...store.keys()]) {
    if (names.has(key.split('|')[0])) store.delete(key);
  }
  notify();
}

export function invalidateAll(): void {
  store.clear();
  notify();
}

/** Untuk indikator "data basi" di masa depan. Belum ada yang memakai. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
