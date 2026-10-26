// Order Shopee (dibaca extension KBI Auto 出貨 dari Seller Center 待出貨) -> draft Sales Order kategori Marketplace.
// Bentuk dokumen sama dengan Orderan Baru kategori Marketplace (SalesTab handleSaveOrder), tetapi isDraft = true
// supaya Felix mengecek dulu sebelum Konfirmasi Order.
import { Timestamp } from 'firebase/firestore';
import { Book, SalesOrder, SalesOrderItem } from '../types';

/** Satu order dari extension (nominal dalam NT$ utuh, bukan sen) */
export interface ShopeeImportOrder {
  sn: string;
  buyer: string;
  /** YYYY-MM-DD (tanggal 新訂單 di 訂單歷史) */
  orderDate: string;
  items: { name: string; variation?: string; unit: number; qty: number; subtotal: number; itemId?: string; modelId?: string; sku?: string }[];
  /** Pesan pembeli (Shopee `note`) */
  buyerNote?: string;
  /** 預估訂單進帳 (setelah fee Shopee) */
  netIncome: number | null;
  /** 訂單金額 (sebelum fee) */
  orderAmount: number | null;
}

// Awalan/akhiran judul listing yang tidak ada di nama katalog
const NOISE_WORDS = new Set(['buku', 'original', 'ori', 'ready', 'stock', 'stok', 'promo', 'new', 'baru']);

export const normalizeTitle = (raw: string): string =>
  String(raw || '')
    .toLowerCase()
    .replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !NOISE_WORDS.has(w))
    .join(' ');

const tokens = (s: string) => new Set(s.split(' ').filter((w) => w.length > 1));

export interface BookMatch {
  book: Book;
  how: 'shopeeId' | 'exact' | 'contains' | 'similar';
}

const cleanId = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Cocokkan lewat kolom Shopee ID di katalog. Nilainya boleh item_id, model_id, atau SKU Shopee
 * (mana yang Anda isi); hanya dipakai kalau tepat satu buku yang cocok.
 */
export const matchBookByShopeeId = (ids: (string | undefined)[], books: Book[]): Book | null => {
  const wanted = new Set(ids.map(cleanId).filter(Boolean));
  if (!wanted.size) return null;
  const hits = books.filter((b) => b.isActive !== false && cleanId(b.shopeeId) && wanted.has(cleanId(b.shopeeId)));
  return hits.length === 1 ? hits[0] : null;
};

/**
 * Cocokkan judul listing Shopee ke katalog. Hanya mengembalikan hasil yang yakin (unik);
 * selebihnya null supaya order ditandai "perlu cek", bukan salah buku.
 */
export const matchBook = (title: string, books: Book[]): BookMatch | null => {
  const t = normalizeTitle(title);
  if (!t) return null;
  const pool = books.filter((b) => b.isActive !== false);
  const norm = pool.map((b) => ({ book: b, n: normalizeTitle(b.bookName) }));

  const exact = norm.filter((x) => x.n === t);
  if (exact.length === 1) return { book: exact[0].book, how: 'exact' };
  if (exact.length > 1) return null;

  const contains = norm.filter((x) => x.n.length >= 12 && (t.includes(x.n) || x.n.includes(t)) && Math.min(x.n.length, t.length) >= 12);
  if (contains.length === 1) return { book: contains[0].book, how: 'contains' };
  if (contains.length > 1) return null;

  const tt = tokens(t);
  const scored = norm
    .map((x) => {
      const xt = tokens(x.n);
      const inter = [...tt].filter((w) => xt.has(w)).length;
      const union = new Set([...tt, ...xt]).size;
      return { book: x.book, score: union ? inter / union : 0 };
    })
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 0.8 && (!scored[1] || scored[0].score - scored[1].score >= 0.1)) {
    return { book: scored[0].book, how: 'similar' };
  }
  return null;
};

export interface ShopeeDraft {
  /** Field dokumen salesOrders (tanpa id, orderCode, createdAt/updatedAt/createdBy) */
  fields: Omit<SalesOrder, 'id' | 'orderCode'> & { isDraft: boolean };
  /** Hal yang perlu dicek Felix; kosong = rapi */
  issues: string[];
}

const cents = (ntd: number) => Math.round(ntd * 100);

export const buildShopeeDraft = (
  o: ShopeeImportOrder,
  books: Book[],
  cogsOf: (bookId: string) => number
): ShopeeDraft => {
  const issues: string[] = [];

  // Harga mengikuti katalog (shopeePrice) seperti input manual
  let items: SalesOrderItem[] = o.items.map((it) => {
    const byId = matchBookByShopeeId([it.modelId, it.itemId, it.sku], books);
    const m: BookMatch | null = byId ? { book: byId, how: 'shopeeId' } : matchBook(it.name, books);
    if (!m) {
      issues.push(`Buku belum cocok: "${it.name}" (item ${it.itemId || '?'}, model ${it.modelId || '?'}, sku ${it.sku || '-'})`);
      const unitPrice = cents(it.unit);
      return { bookId: 'unknown', bookName: it.name, bookCover: '', unitPrice, qty: it.qty, lineTotal: unitPrice * it.qty, cogsSnapshot: 0, isFree: false };
    }
    const unitPrice = m.book.shopeePrice || m.book.generalPrice || cents(it.unit);
    return {
      bookId: m.book.id,
      bookName: m.book.bookName,
      bookCover: m.book.cover || '',
      unitPrice,
      qty: it.qty,
      lineTotal: unitPrice * it.qty,
      cogsSnapshot: cogsOf(m.book.id),
      isFree: false,
    };
  });

  // Grand Total = 進帳 (setelah fee Shopee); selisih dari subtotal dicatat sebagai Diskon Potongan
  const total = o.netIncome != null ? cents(o.netIncome) : o.orderAmount != null ? cents(o.orderAmount) : null;
  let subtotal = items.reduce((a, it) => a + it.lineTotal, 0);
  if (total == null) {
    issues.push('Nominal 進帳 tidak terbaca');
  } else if (total > subtotal) {
    // Form tidak mengizinkan total > subtotal; pakai harga asli Shopee supaya subtotal tidak lebih kecil dari total
    items = items.map((it, i) => ({ ...it, unitPrice: cents(o.items[i].unit), lineTotal: cents(o.items[i].unit) * it.qty }));
    subtotal = items.reduce((a, it) => a + it.lineTotal, 0);
    issues.push('Harga katalog lebih rendah dari Shopee; memakai harga Shopee');
  }
  const totalPrice = total == null ? subtotal : Math.min(total, subtotal);
  if (!o.orderDate) issues.push('Tanggal order tidak terbaca; memakai hari ini');

  const orderDate = o.orderDate ? Timestamp.fromDate(new Date(`${o.orderDate}T12:00:00`)) : Timestamp.now();
  return {
    issues,
    fields: {
      orderDate,
      customerName: '',
      customerPlatformName: o.buyer || 'Shopee',
      platformChannel: 'Shopee',
      platformOrder: '',
      orderType: '',
      paymentMethod: '' as any,
      phoneNumber: '',
      pickupLogistics: '',
      pickupDetails: '',
      customerNote: [o.buyerNote || '', issues.length ? `[Import Shopee] ${issues.join('; ')}` : ''].filter(Boolean).join('\n'),
      orderNumber: o.sn,
      estimatedShippingDate: '',
      perluKonfirmasiSebelumKirim: false,
      buyerType: 'marketplace',
      partnerId: '',
      partnerName: '',
      addressPhotoUrl: '',
      isDraft: true,
      items,
      subtotal,
      discount: Math.max(0, subtotal - totalPrice),
      platformFee: 0,
      totalPrice,
      status: 'draft',
      partnerProfitShare: 0,
    } as any,
  };
};
