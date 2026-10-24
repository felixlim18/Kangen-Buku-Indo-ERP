import { useRef } from 'react';

/**
 * Kunci klik ganda untuk aksi yang menulis jurnal. State React (setSubmitting) baru menonaktifkan tombol
 * setelah render ulang, jadi dua klik cepat sempat menjalankan aksi dua kali (insiden PO & pelunasan ganda
 * 2026). Pembungkus ini menolak panggilan kedua dengan kunci yang sama selama panggilan pertama masih
 * berjalan, termasuk saat aksinya keluar lebih awal atau melempar error.
 *
 *   const lock = useSubmitLock();
 *   const handleSave = lock('save', async (e) => { ... });
 */
export function useSubmitLock() {
  const running = useRef<Set<string>>(new Set());
  return function lock<A extends unknown[], R>(key: string, fn: (...args: A) => Promise<R>) {
    return async (...args: A): Promise<R | undefined> => {
      if (running.current.has(key)) return undefined;
      running.current.add(key);
      try {
        return await fn(...args);
      } finally {
        running.current.delete(key);
      }
    };
  };
}
