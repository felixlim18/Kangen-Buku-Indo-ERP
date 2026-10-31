// Membuat buku baru di katalog + record inventory awalnya. Dipakai form Katalog (CatalogTab) dan
// tombol "Tambah ke katalog" di draft Tarik Shopee (SalesTab), supaya bentuk dokumennya sama.
import { doc, collection, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Book } from '../types';

// Product ID KB-YYMMDD-NNNN: urutan berikutnya untuk hari ini.
const nextProductId = (books: Book[]): string => {
  const now = new Date();
  const dateStr = now.getFullYear().toString().slice(-2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');
  const prefix = `KB-${dateStr}-`;
  let maxSeq = 0;
  for (const b of books) {
    if (b.productId && b.productId.startsWith(prefix)) {
      const parts = b.productId.split('-');
      const n = parts.length === 3 ? parseInt(parts[2], 10) : NaN;
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
  }
  return `${prefix}${(maxSeq + 1).toString().padStart(4, '0')}`;
};

export async function createCatalogBook(
  payload: Omit<Book, 'id' | 'productId' | 'createdAt'>,
  existingBooks: Book[],
): Promise<Book> {
  const bookId = doc(collection(db, 'catalog')).id;
  const book = { ...payload, id: bookId, productId: nextProductId(existingBooks), createdAt: Timestamp.now() } as Book;
  await setDoc(doc(db, 'catalog', bookId), book);
  await setDoc(doc(db, 'inventory', bookId), {
    bookId,
    initialStock: 0,
    totalPurchased: 0,
    totalDispatched: 0,
    endingStock: 0,
    readyStock: 0,
    shippedStock: 0,
    inTransitStock: 0,
    ordersPlaced: 0,
    ordersShipped: 0,
    movingAverageCost: 0,
    totalInventoryValue: 0,
    stockStatus: 'sold_out',
    lastUpdated: Timestamp.now()
  });
  return book;
}
