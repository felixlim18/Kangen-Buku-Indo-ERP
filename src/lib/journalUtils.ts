import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

export async function getNextJournalId(selectedDateIso: string): Promise<string> {
  const d = new Date(selectedDateIso);
  if (isNaN(d.getTime())) return `JU2606210001`; // fallback
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
  } catch(e) { console.error(e); nextValue = Math.floor(Math.random()*9999); }
  return `JU${dateStr}${String(nextValue).padStart(4, '0')}`;
}
