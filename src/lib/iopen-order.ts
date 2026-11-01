// Auto Order iOPEN: SO Direct Order + 7-Eleven + COD yang Nomor Order-nya kosong dibuatkan order
// di toko iOPEN Mall sendiri (mall.iopenmall.tw/050497) lewat extension KBI, lalu 訂單編號 diisi ke SO.
// Modul ini murni (tanpa Firebase) supaya aturan data bisa diuji: scripts/test-iopen-order.ts.

export interface IopenOrderStore {
  /** 6 digit 門市店號, kalau ada di Kode Toko / Alamat */
  id?: string;
  /** Kata kunci 門市名稱 tanpa akhiran 門市/店, urut dari yang paling mungkin (mis. ['新店', '新']) */
  names: string[];
}

export interface IopenOrderRequest {
  soCode: string;
  /** NT$ utuh = subtotal - diskon */
  amount: number;
  name: string;
  phone: string;
  store: IopenOrderStore;
}

/** Status proses di dokumen SO (field iopenAutoOrder) */
export type IopenAutoOrderState = 'running' | 'done' | 'failed' | 'unknown';

export interface IopenAutoOrderInfo {
  state: IopenAutoOrderState;
  startedAt?: any;
  finishedAt?: any;
  orderNo?: string;
  error?: string;
  /** Produk iOPEN yang dibeli, mis. "Bumi Manusia x1" */
  items?: string[];
  /** manual = tombol, auto = pemantau otomatis */
  trigger?: 'auto' | 'manual';
  /** Nomor Order lama yang diganti order baru dari tombol manual */
  replacedOrderNo?: string;
}

const CJK = /[㐀-鿿豈-﫿]/;

const logisticsKey = (v: unknown) => {
  const k = String(v ?? '').toLowerCase().replace(/[\s\-_.()]+/g, '');
  return k === '711' || k === 'seveneleven' || k === '統一超商' ? '7eleven' : k;
};

/** Syarat data SO (tanpa syarat waktu/aktif fitur): Direct Order, 7-Eleven, COD, Nomor Order kosong, Draft/Pending. */
export const isIopenOrderCandidate = (o: any): boolean =>
  !!o &&
  o.buyerType === 'langsung' &&
  logisticsKey(o.pickupLogistics) === '7eleven' &&
  o.paymentMethod === 'COD' &&
  !String(o.orderNumber ?? '').trim() &&
  (!o.status || o.status === 'draft');

/** Tombol manual "Buat Order iOPEN": syarat sama, tapi Nomor Order boleh sudah terisi (diganti nomor baru). */
export const isIopenManualCandidate = (o: any): boolean => !!o && isIopenOrderCandidate({ ...o, orderNumber: '' });

/** Alasan SO Direct Order tidak bisa dibuatkan order iOPEN lewat tombol (null = bisa). Untuk keterangan tombol di kartu SO. */
export const iopenOrderBlockReason = (o: any): string | null => {
  if (!o || o.buyerType !== 'langsung') return 'Bukan Direct Order';
  if (logisticsKey(o.pickupLogistics) !== '7eleven') return 'Pengiriman bukan 7-Eleven';
  if (o.paymentMethod !== 'COD') return 'Pembayaran bukan COD';
  if (o.status && o.status !== 'draft') return 'Status SO bukan Draft/Pending';
  return null;
};

/**
 * Nama penerima: nama depan (singkatan seperti "M." dilewati), huruf besar, minimal 4 huruf
 * (huruf terakhir diulang: ANA -> ANAA). Nama Mandarin dipakai utuh tanpa spasi (minimal 1 karakter).
 */
export const iopenReceiverName = (raw: unknown): string => {
  const full = String(raw ?? '').trim();
  if (!full) throw new Error('Nama pembeli kosong');
  if (CJK.test(full)) {
    if (/[a-z]/i.test(full)) throw new Error(`Nama campuran huruf Latin & Mandarin: ${full}`);
    const zh = full.replace(/[^㐀-鿿豈-﫿]/g, '');
    if (!zh) throw new Error(`Nama tidak terbaca: ${full}`);
    return zh;
  }
  const words = full.split(/\s+/).filter((w) => !w.endsWith('.')).map((w) => w.replace(/[^a-z]/gi, ''));
  let name = (words.find((w) => w.length >= 2) || '').toUpperCase();
  if (!name) throw new Error(`Nama depan tidak terbaca: ${full}`);
  while (name.length < 4) name += name[name.length - 1];
  return name;
};

/** Nomor HP Taiwan 10 digit 09xxxxxxxx (+886 / 886 / tanpa 0 / spasi / strip dirapikan). */
export const iopenPhone = (raw: unknown): string => {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('886')) d = d.slice(3);
  if (d.length === 9 && d.startsWith('9')) d = `0${d}`;
  if (!/^09\d{8}$/.test(d)) throw new Error(`Nomor HP tidak valid: ${String(raw ?? '').trim() || '(kosong)'}`);
  return d;
};

/**
 * Kode Toko / Alamat: "268659", "彌海門市", "彌海店", "268659 彌海門市", "彌海店 268659", ...
 * Angka 6 digit = 門市店號; teks Mandarin = nama toko tanpa akhiran 門市 / 店.
 */
export const iopenStore = (raw: unknown): IopenOrderStore => {
  const s = String(raw ?? '').trim();
  const ids = s.match(/(?<!\d)\d{6}(?!\d)/g) || [];
  if (ids.length > 1 && new Set(ids).size > 1) throw new Error(`Lebih dari satu nomor toko: ${s}`);
  const zh = (s.match(/[㐀-鿿豈-﫿]+/g) || []).join('');
  const names: string[] = [];
  if (zh) {
    const noMenshi = zh.replace(/門市$/, '');
    if (noMenshi !== zh) names.push(noMenshi);
    else {
      names.push(zh); // mis. "新店" bisa berarti 新店門市
      if (zh.endsWith('店') && zh.length > 1) names.push(zh.slice(0, -1));
    }
  }
  const store = { id: ids[0], names: names.filter(Boolean) };
  if (!store.id && !store.names.length) throw new Error(`Kode Toko / Alamat tidak berisi nomor atau nama toko 7-11: ${s || '(kosong)'}`);
  return store;
};

/** Total yang dibayar customer (NT$ utuh) = subtotal - diskon, keduanya dalam sen. */
export const iopenAmount = (o: any): number => {
  const cents = Math.round(Number(o.subtotal || 0) - Number(o.discount || 0));
  if (cents <= 0) throw new Error('Total (subtotal - diskon) harus lebih dari 0');
  if (cents % 100 !== 0) throw new Error(`Total bukan angka NT$ bulat: ${cents / 100}`);
  return cents / 100;
};

/** Semua data order iOPEN dari SO; melempar Error dengan alasan yang bisa dibaca kalau ada yang tidak valid. */
export const buildIopenOrderRequest = (o: any): IopenOrderRequest => ({
  soCode: String(o.orderCode || '').replace(/^#/, ''),
  amount: iopenAmount(o),
  name: iopenReceiverName(o.customerName),
  phone: iopenPhone(o.phoneNumber),
  store: iopenStore(o.pickupDetails),
});
