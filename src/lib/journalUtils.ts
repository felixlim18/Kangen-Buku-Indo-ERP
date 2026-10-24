import { doc, runTransaction, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from './firebase';

export async function getNextJournalId(selectedDateIso: string): Promise<string> {
  // Tanggal tidak valid -> nomor urut hari ini. JANGAN kembali ke ID tetap: dulu fallback ini selalu
  // menghasilkan JU2606210001, sehingga setiap pemanggil dengan tanggal rusak menimpa jurnal yang sama
  // (insiden Amortisasi 18/10/2026: jurnal perolehan tertimpa jurnal amortisasi bulanan).
  const parsed = new Date(selectedDateIso);
  const d = isNaN(parsed.getTime()) ? new Date() : parsed;
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;
  const counterId = `JURNAL_${dateStr}`;
  let nextValue = 1;
  const counterRef = doc(db, 'counters', counterId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      if (snap.exists()) {
        nextValue = snap.data().value + 1;
      }
      transaction.set(counterRef, { value: nextValue }, { merge: true });
    });
  } catch (e) {
    // Nomor acak bisa bentrok dengan jurnal yang sudah ada dan menimpanya -> gagalkan saja
    console.error(e);
    throw new Error('Gagal mengambil nomor jurnal berikutnya. Coba lagi.');
  }
  return `JU${dateStr}${String(nextValue).padStart(4, '0')}`;
}

/**
 * Cari jurnal milik sebuah dokumen sumber (iklan, prive, dll). `journalId` yang tersimpan di dokumen
 * bisa basi (contoh: adsPurchases menyimpan "JU-AD-..." / prive "JU-PRIVE-..." padahal jurnalnya
 * sudah dinomori ulang ke JU...). Urutan: id tersimpan kalau dokumennya ada -> jurnal dengan
 * refId/sourceId = id dokumen sumber. Mengembalikan null kalau tidak ditemukan.
 */
export async function resolveLinkedJournalId(storedJournalId: string | undefined | null, sourceDocId: string): Promise<string | null> {
  if (storedJournalId) {
    const snap = await getDoc(doc(db, 'journalEntries', storedJournalId));
    if (snap.exists()) return storedJournalId;
  }
  for (const field of ['refId', 'sourceId']) {
    const res = await getDocs(query(collection(db, 'journalEntries'), where(field, '==', sourceDocId)));
    if (!res.empty) return res.docs[0].id;
  }
  return null;
}
