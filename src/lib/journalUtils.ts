import { doc, runTransaction } from 'firebase/firestore';
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
