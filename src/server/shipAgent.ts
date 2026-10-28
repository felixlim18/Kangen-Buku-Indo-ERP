// Agent LINE untuk SO yang siap dikirim.
//
// Alur: jadwal (Cloud Function notifyReadyToShip) mencari SO Pending yang stoknya cukup, sudah
// waktunya dikirim, dan (kalau Transfer) sudah lunas -> owner menerima card per SO. Dari card:
// "Kirim nomor order" / "Kirim nomor resi" -> owner mengetik nomornya di chat -> card konfirmasi
// -> "Send" menjalankan Konfirmasi Kirim yang sama dengan tombol di SalesTab.tsx
// (confirmSalesOrderTransaction + status shipped): stok, ledger, jurnal Barang Dikirim.
//
// Card dikirim begitu SO baru jadi Pending dan siap (trigger notifyReadyToShipOnWrite), plus
// jadwal tiap 30 menit untuk SO yang baru siap belakangan (stok masuk, tanggal tiba, lunas).
// Tiap SO paling banyak sekali per hari (tanggal Taipei): dicatat di lineShipNotices/{orderId}_{tanggal},
// bukan di dokumen SO, supaya tidak memicu trigger salesOrders. Satu sesi input per user di lineShipSessions/{lineUserId}.

import type { Transaction } from 'firebase-admin/firestore';
import { Decimal } from 'decimal.js';
import { getDb, getNextJournalId, Timestamp } from './firestore-admin';
import { getPhysicalOnHandStockForBook } from '../lib/inventory-utils';
import { getMovingAverageLandedCost } from '../lib/landed-cost';
import { sanitizeResiNumber, detectLogisticsFromResi } from '../lib/sales-logistics-utils';

type LineMessage = { type: string; [key: string]: any };

const db = () => getDb();

const todayTaipei = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const fmtNTD = (cents: number) => `NT$ ${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const tsMs = (v: any): number | null => {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'number') return v;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
};
const fmtDate = (v: any) => {
  const ms = tsMs(v);
  return ms ? new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }).replace(/-/g, '/') : '-';
};

// Sama dengan isUnpaidTransferOrder di db-helpers.ts (modul itu memakai SDK klien).
const isUnpaidTransfer = (o: any) =>
  o.paymentMethod === 'Transfer' && o.paymentStatus !== 'paid' && (o.amountPaid || 0) < (o.totalPrice || 0) - 5;

// Sama dengan isShippingDateFuture di SalesTab.tsx, dibandingkan dengan tanggal Taipei.
const isShipDateFuture = (s?: string) => {
  if (!s) return false;
  const m = String(s).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return false;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return iso > todayTaipei();
};

const isMarketplace = (o: any) => o.buyerType === 'marketplace' || o.orderType === 'Marketplace';
const isPending = (o: any) => (!o.status || o.status === 'draft') && !o.isDraft;
const activeItems = (o: any) => (o.items || []).filter((it: any) => !it.markedTertinggal && !it.markedRefund);

// Umur order sejak tanggal order, sama dengan getOverdueDays di SalesTab.tsx.
const ageDays = (o: any) => {
  const ms = tsMs(o.orderDate) ?? tsMs(o.createdAt);
  return ms ? Math.max(0, Math.floor((Date.now() - ms) / 86400000)) : 0;
};

// Card SO siap kirim hanya untuk owner (settings/line.ownerUserId).
export async function isShipAgentUser(lineUserId: string): Promise<boolean> {
  const s = (await db().doc('settings/line').get()).data() || {};
  return !!s.ownerUserId && String(s.ownerUserId).trim() === lineUserId;
}

// ---- Deteksi SO siap kirim ----------------------------------------------------

const noticeRef = (orderId: string) => db().doc(`lineShipNotices/${orderId}_${todayTaipei()}`);

export const isShipCandidate = (o: any) =>
  isPending(o) && activeItems(o).length > 0 && !isShipDateFuture(o.estimatedShippingDate) && !isUnpaidTransfer(o);

export async function findReadyToShipOrders(opts: { onlyUnnotifiedToday?: boolean; orderId?: string } = {}): Promise<any[]> {
  const pendingDocs = opts.orderId
    ? [await db().doc(`salesOrders/${opts.orderId}`).get()].filter((d) => d.exists)
    : (await db().collection('salesOrders').where('status', '==', 'draft').get()).docs;
  let candidates = pendingDocs.map((d) => ({ id: d.id, ...d.data() } as any)).filter(isShipCandidate);
  if (opts.onlyUnnotifiedToday && candidates.length) {
    const notices = await db().getAll(...candidates.map((o) => noticeRef(o.id)));
    const done = new Set(notices.filter((s) => s.exists).map((s) => s.ref.path));
    candidates = candidates.filter((o) => !done.has(noticeRef(o.id).path));
  }
  if (!candidates.length) return [];

  // Stok fisik dihitung persis seperti badge "Stok Siap" (checkIsReadyStock di SalesTab.tsx).
  const [inv, ledger, pos, sos, damaged] = await Promise.all(
    ['inventory', 'inventoryLedger', 'purchaseOrders', 'salesOrders', 'damagedStock'].map((c) => db().collection(c).get()),
  );
  const invList = inv.docs.map((d) => d.data());
  const ledgerList = ledger.docs.map((d) => d.data());
  const poList = pos.docs.map((d) => ({ id: d.id, ...d.data() }));
  const soList = sos.docs.map((d) => d.data());
  const damagedList = damaged.docs.map((d) => d.data());

  return candidates
    .filter((o) => activeItems(o).every((it: any) =>
      getPhysicalOnHandStockForBook(it.bookId, invList, ledgerList, poList, soList, damagedList) >= (it.qty || 1)))
    .sort((a, b) => (tsMs(a.orderDate) || 0) - (tsMs(b.orderDate) || 0));
}

// ---- Flex message ------------------------------------------------------------

const C = { muted: '#8C8C8C', label: '#6B6B6B', red: '#D93025', accent: '#2F6FDB', warnBg: '#FDF1DC', warn: '#9A5B00', line: '#E6E6E6' };

// Label lebar tetap supaya kolom nilai sejajar; "Copy" berupa teks ber-action (tombol Flex terlalu
// lebar dan terpotong jadi "...", juga membuat tinggi baris tidak rata).
const infoRow = (label: string, value: string, opts: { copy?: boolean; color?: string } = {}) => ({
  type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
  contents: [
    { type: 'box', layout: 'vertical', width: '84px', contents: [{ type: 'text', text: label, size: 'sm', color: C.label }] },
    { type: 'text', text: value || '-', size: 'sm', wrap: true, flex: 1, color: opts.color || (value ? '#111111' : C.muted) },
    ...(opts.copy && value
      ? [{ type: 'text', text: 'Copy', size: 'sm', weight: 'bold', color: C.accent, flex: 0, action: { type: 'clipboard', label: 'Copy', clipboardText: value } }]
      : []),
  ],
});

const titleOf = (o: any) => isMarketplace(o)
  ? (o.platformChannel || o.platformOrder || 'Marketplace')
  : (o.customerName || o.customerPlatformName || 'Pembeli');
const buyerOf = (o: any) => o.customerPlatformName || o.customerName || '';
const payOf = (o: any) => `${o.paymentMethod || '-'} · ${fmtNTD(o.totalPrice || 0)}`;

// LINE hanya bisa menampilkan gambar https (JPEG/PNG). Cover base64 lama & gambar default Unsplash dilewati.
const coverUrl = (u: any) => (typeof u === 'string' && /^https:\/\//.test(u) && !u.includes('images.unsplash.com') ? u : '');

// SO menyimpan bookCover kosong (dibuang saat simpan, lihat SalesTab.tsx); cover diambil dari catalog/{bookId}.
export async function withCovers(orders: any[]): Promise<any[]> {
  const ids = [...new Set(orders.flatMap((o) => (o.items || []).filter((it: any) => !coverUrl(it.bookCover) && it.bookId).map((it: any) => String(it.bookId))))];
  if (!ids.length) return orders;
  const snaps = await db().getAll(...ids.map((id) => db().doc(`catalog/${id}`)));
  const covers = new Map(snaps.filter((d) => d.exists).map((d) => [d.id, d.data()?.cover]));
  return orders.map((o) => ({ ...o, items: (o.items || []).map((it: any) => coverUrl(it.bookCover) ? it : { ...it, bookCover: covers.get(String(it.bookId)) || '' }) }));
}

const bookRow = (it: any) => {
  const qty = it.qty || 1;
  const cover = coverUrl(it.bookCover);
  return {
    type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', paddingTop: '6px',
    contents: [
      cover
        ? { type: 'image', url: cover, size: '40px', aspectRatio: '2:3', aspectMode: 'cover', flex: 0 }
        : { type: 'box', layout: 'vertical', contents: [], width: '40px', height: '60px', backgroundColor: '#E8E3D6', cornerRadius: '3px', flex: 0 },
      { type: 'text', text: it.bookName || 'Buku', size: 'sm', wrap: true, flex: 1 },
      { type: 'text', text: `x${qty}`, size: qty > 1 ? 'lg' : 'sm', weight: qty > 1 ? 'bold' : 'regular', color: qty > 1 ? C.red : '#111111', flex: 0 },
    ],
  };
};

export function readyOrderBubble(o: any) {
  const age = ageDays(o);
  const items = activeItems(o);
  const shown = items.slice(0, 10);
  const meta = [o.orderCode ? `#${String(o.orderCode).replace(/^#/, '')}` : '', fmtDate(o.orderDate), isMarketplace(o) ? '' : o.platformChannel]
    .filter(Boolean).join(' · ');
  const footer: any[] = [];
  if (!o.orderNumber) {
    footer.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'Kirim nomor order', data: `ship:ordno:${o.id}`, displayText: 'Kirim nomor order' } });
  }
  footer.push({ type: 'button', style: 'primary', height: 'sm', color: C.accent, action: { type: 'postback', label: 'Kirim nomor resi', data: `ship:resi:${o.id}`, displayText: 'Kirim nomor resi' } });

  return {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'horizontal', backgroundColor: C.warnBg, paddingAll: '12px',
      contents: [
        { type: 'text', text: '🚚 SO siap dikirim', size: 'sm', weight: 'bold', color: C.warn, flex: 1 },
        { type: 'text', text: age > 0 ? `telat ${age} hari` : 'hari ini', size: 'sm', color: C.warn, align: 'end', flex: 0 },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'xs',
      contents: [
        { type: 'text', text: meta, size: 'xs', color: C.muted },
        { type: 'text', text: titleOf(o), size: 'xl', weight: 'bold', wrap: true },
        ...(isMarketplace(o) && buyerOf(o) ? [{ type: 'text', text: `👤 ${buyerOf(o)}`, size: 'sm', color: C.label, wrap: true }] : []),
        { type: 'separator', margin: 'md', color: C.line },
        { type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', contents: [
          o.orderNumber ? infoRow('No. order', o.orderNumber) : infoRow('No. order', 'Belum ada', { color: C.red }),
          infoRow('Telepon', o.phoneNumber || '', { copy: true }),
          infoRow('Kode toko', o.pickupDetails || '', { copy: true }),
          infoRow('Pengiriman', o.pickupLogistics || '-'),
          infoRow('Bayar', payOf(o)),
          infoRow('Note', o.customerNote || ''),
        ] },
        { type: 'separator', margin: 'md', color: C.line },
        ...shown.map(bookRow),
        ...(items.length > shown.length ? [{ type: 'text', text: `...dan ${items.length - shown.length} buku lainnya`, size: 'xs', color: C.muted, margin: 'sm' }] : []),
      ],
    },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer },
  };
}

function confirmBubble(o: any, resi: string, logistics: string, rev: number) {
  return {
    type: 'bubble', size: 'mega',
    body: {
      type: 'box', layout: 'vertical', spacing: 'xs',
      contents: [
        { type: 'text', text: 'Konfirmasi kirim', size: 'xs', color: C.muted },
        { type: 'text', text: `#${String(o.orderCode || '').replace(/^#/, '')} · ${titleOf(o)}`, size: 'lg', weight: 'bold', wrap: true },
        { type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', contents: [
          infoRow('Nama', buyerOf(o)),
          infoRow('No. order', o.orderNumber || '-'),
          infoRow('Bayar', payOf(o)),
          infoRow('Resi', resi),
          infoRow('Terdeteksi', logistics),
          infoRow('Tgl kirim', todayTaipei().replace(/-/g, '/')),
        ] },
      ],
    },
    footer: {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'Batal', data: 'ship:cancel', displayText: 'Batal' } },
        { type: 'button', style: 'primary', height: 'sm', color: C.accent, action: { type: 'postback', label: 'Send', data: `ship:send:${o.id}:${rev}`, displayText: 'Send' } },
      ],
    },
  };
}

const flex = (altText: string, contents: any): LineMessage => ({ type: 'flex', altText: altText.slice(0, 400), contents });

// Satu pesan carousel maksimal 12 bubble; satu push/reply maksimal 5 pesan.
export function readyOrdersMessages(orders: any[]): LineMessage[] {
  const msgs: LineMessage[] = [];
  for (let i = 0; i < orders.length && msgs.length < 5; i += 12) {
    const chunk = orders.slice(i, i + 12);
    const alt = `🚚 ${orders.length} SO siap dikirim: ${chunk.map((o) => o.orderCode).join(', ')}`;
    msgs.push(flex(alt, chunk.length === 1 ? readyOrderBubble(chunk[0]) : { type: 'carousel', contents: chunk.map(readyOrderBubble) }));
  }
  return msgs;
}

// ---- Jadwal: kabari owner SO siap kirim yang belum dikabari --------------------

async function pushLine(token: string, to: string, messages: LineMessage[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
    body: JSON.stringify({ to: to.trim(), messages }),
  });
  if (!res.ok) throw new Error(`Gagal push LINE (${res.status}): ${await res.text()}`);
}

// Tanpa orderId: semua SO siap yang belum dikabari hari ini (jadwal). Dengan orderId: SO itu saja (trigger).
export async function notifyReadyToShip(opts: { orderId?: string } = {}): Promise<{ sent: number }> {
  const s = (await db().doc('settings/line').get()).data() || {};
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || s.channelAccessToken;
  if (!s.enabled || s.notifyReadyToShip === false || !s.ownerUserId || !token) return { sent: 0 };

  const ready = (await findReadyToShipOrders({ onlyUnnotifiedToday: true, orderId: opts.orderId })).slice(0, 60);
  // Klaim dulu (create gagal kalau sudah ada), supaya trigger & jadwal yang jalan bersamaan tidak kirim dobel.
  const orders: any[] = [];
  for (const o of ready) {
    try {
      await noticeRef(o.id).create({ orderId: o.id, orderCode: o.orderCode || '', date: todayTaipei(), notifiedAt: Timestamp.now() });
      orders.push(o);
    } catch { /* sudah dikabari hari ini */ }
  }
  if (!orders.length) return { sent: 0 };
  try {
    await pushLine(token, s.ownerUserId, readyOrdersMessages(await withCovers(orders)));
  } catch (e) {
    await Promise.all(orders.map((o) => noticeRef(o.id).delete()));
    throw e;
  }
  return { sent: orders.length };
}

// ---- Konfirmasi Kirim (port confirmSalesOrderTransaction + update status shipped) ---

export async function shipSalesOrder(orderId: string, resi: string, lineUserId: string): Promise<string> {
  const orderRef = db().doc(`salesOrders/${orderId}`);
  const first = (await orderRef.get()).data() as any;
  if (!first) return 'SO tidak ditemukan.';
  if (first.status && first.status !== 'draft' && first.status !== 'packed') return `SO ${first.orderCode} sudah diproses (status: ${first.status}).`;
  if (!first.orderNumber) return 'Nomor order belum diisi. Tekan "Kirim nomor order" dulu.';

  // Data untuk HPP moving average, sama dengan fase 0 di confirmSalesOrderTransaction.
  const [poSnap, journalSnap, ledgerSnap, soSnap, freightSnap] = await Promise.all([
    db().collection('purchaseOrders').where('status', '==', 'received').get(),
    db().collection('journalEntries').get(),
    db().collection('inventoryLedger').get(),
    db().collection('salesOrders').get(),
    db().collection('freightIn').get(),
  ]);
  const allPos = poSnap.docs.map((d) => d.data());
  const allJournals = journalSnap.docs.map((d) => d.data());
  const allLedgers = ledgerSnap.docs.map((d) => d.data());
  const allSalesOrders = soSnap.docs.map((d) => d.data());
  const allFreights = freightSnap.docs.map((d) => d.data());
  if (allJournals.some((j: any) => (j.refId === orderId && j.refType === 'sales_order_shipped') || (j.soId === orderId && j.type === 'BARANG_DIKIRIM'))) {
    return `Jurnal Barang Dikirim untuk ${first.orderCode} sudah ada.`;
  }

  const today = todayTaipei();
  const journalId = await getNextJournalId(today);
  const journalRef = db().doc(`journalEntries/${journalId}`);
  const source = { createdVia: 'line_agent', lineUserId };

  try {
    await db().runTransaction(async (t: Transaction) => {
      const live = (await t.get(orderRef)).data() as any;
      if (!live) throw new Error('SO tidak ditemukan.');
      if (live.status && live.status !== 'draft' && live.status !== 'packed') throw new Error('SO sudah dikonfirmasi atau diproses.');
      if ((await t.get(journalRef)).exists) throw new Error(`Nomor jurnal ${journalId} sudah dipakai, coba Send lagi.`);
      const wasAlreadyPacked = live.status === 'packed';

      const invSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const item of live.items || []) {
        if (!invSnaps.has(item.bookId)) invSnaps.set(item.bookId, await t.get(db().doc(`inventory/${item.bookId}`)));
      }

      const cogs: number[] = [];
      for (const item of live.items || []) {
        if (item.markedTertinggal || item.markedRefund) { cogs.push(0); continue; }
        const invSnap = invSnaps.get(item.bookId)!;
        if (!invSnap.exists) throw new Error(`Data inventory tidak ada untuk buku: ${item.bookName}.`);
        const inv = invSnap.data() as any;
        const endingStock = inv.endingStock || 0;
        if (!wasAlreadyPacked && endingStock < item.qty) {
          throw new Error(`Stok tidak cukup untuk ${item.bookName}. Tersedia: ${endingStock}, dibutuhkan: ${item.qty}`);
        }
        const landed = getMovingAverageLandedCost(item.bookId, allPos, allJournals, allLedgers, allSalesOrders, allFreights, inv.initialStock || 0, inv.movingAverageCost || 0);
        const movingCost = landed > 0 ? landed : (inv.movingAverageCost || 0);
        const nextEndingStock = wasAlreadyPacked ? endingStock : endingStock - item.qty;
        t.update(invSnap.ref, {
          endingStock: nextEndingStock,
          readyStock: wasAlreadyPacked ? (inv.readyStock || 0) : Math.max(0, (inv.readyStock || 0) - item.qty),
          shippedStock: (inv.shippedStock || 0) + item.qty,
          totalDispatched: wasAlreadyPacked ? (inv.totalDispatched || 0) : (inv.totalDispatched || 0) + item.qty,
          ordersShipped: (inv.ordersShipped || 0) + 1,
          movingAverageCost: Math.round(movingCost),
          totalInventoryValue: Math.round(new Decimal(nextEndingStock).mul(movingCost).toNumber()),
          stockStatus: nextEndingStock > 0 ? 'in_stock' : 'sold_out',
          lastUpdated: Timestamp.now(),
        });
        const ledgerRef = db().collection('inventoryLedger').doc();
        t.set(ledgerRef, {
          id: ledgerRef.id, bookId: item.bookId, type: 'DISPATCHED', qtyDelta: -item.qty, unitCost: movingCost,
          refCollection: 'salesOrders', refId: orderId, balanceAfter: nextEndingStock, movingAvgAfter: movingCost,
          timestamp: Timestamp.now(), userId: `line:${lineUserId}`,
        });
        cogs.push(movingCost);
      }

      const items = (live.items || []).map((it: any, i: number) => ({ ...it, cogsSnapshot: cogs[i] }));
      const totalCOGS = items.reduce((acc: number, it: any) =>
        (it.markedTertinggal || it.markedRefund) ? acc : new Decimal(acc).plus(new Decimal(it.cogsSnapshot || 0).mul(it.qty)).toNumber(), 0);

      // SalesTab menulis 'confirmed' lalu langsung 'shipped' + shipment; di sini sekaligus.
      t.update(orderRef, {
        status: 'shipped', items, shippedAt: Timestamp.now(), orderNumber: live.orderNumber || '',
        shipment: {
          orderNumber: live.orderNumber || '', shippingNumber: resi,
          shippingDate: Timestamp.fromDate(new Date(today)), arrangedAt: Timestamp.now(),
        },
        updatedAt: Timestamp.now(), shippedVia: 'line_agent',
      });
      t.set(journalRef, {
        id: journalId, date: Timestamp.now(), description: `Sales Order ${live.orderCode} - Barang Dikirim`,
        lines: [
          { account: 'Inventory in Delivery', accountCode: '1202', debit: Math.round(totalCOGS), credit: 0 },
          { account: 'Inventory On Hand', accountCode: '1201', debit: 0, credit: Math.round(totalCOGS) },
        ],
        refType: 'sales_order_shipped', refId: orderId, isAuto: true, createdAt: Timestamp.now(), ...source,
      });
    });
  } catch (e: any) {
    return `Gagal mengirim: ${e.message}`;
  }
  return `✅ ${first.orderCode} sudah Dikirim.\nResi: ${resi}\nStok dipotong, jurnal ${journalId} dibuat.`;
}

// ---- Percakapan ---------------------------------------------------------------

const CANCEL_WORDS = /^(batal|cancel)[.!]*$/i;
const LIST_WORDS = /^(siap kirim|kirim|so siap kirim|ready)[.!?]*$/i;
const SESSION_TTL_MS = 30 * 60000;

const sessionRef = (lineUserId: string) => db().doc(`lineShipSessions/${lineUserId}`);
const text = (t: string, extra: Record<string, any> = {}): LineMessage => ({ type: 'text', text: t, ...extra });

async function loadOrder(orderId: string) {
  const snap = await db().doc(`salesOrders/${orderId}`).get();
  return snap.exists ? { id: snap.id, ...snap.data() } as any : null;
}

const notShippable = (o: any) => !o
  ? 'SO tidak ditemukan.'
  : (o.status && o.status !== 'draft' && o.status !== 'packed') ? `SO ${o.orderCode} sudah diproses (status: ${o.status}).` : '';

async function startInput(lineUserId: string, orderId: string, awaiting: 'resi' | 'orderNumber'): Promise<LineMessage[]> {
  const o = await loadOrder(orderId);
  const err = notShippable(o);
  if (err) return [text(err)];
  const prev = (await sessionRef(lineUserId).get()).data();
  await sessionRef(lineUserId).set({
    orderId, awaiting, rev: (prev?.rev || 0) + 1, updatedAt: Timestamp.now(),
    resi: prev?.orderId === orderId ? prev?.resi || '' : '',
  });
  const label = `#${String(o.orderCode || '').replace(/^#/, '')} (${titleOf(o)})`;
  return [text(awaiting === 'resi'
    ? `Kirim nomor resi untuk ${label}. Bisa ketik atau tempel.\nKetik "batal" untuk membatalkan.`
    : `Kirim nomor order untuk ${label}.\nKetik "batal" untuk membatalkan.`)];
}

async function showConfirm(lineUserId: string, o: any, resi: string): Promise<LineMessage[]> {
  const ref = sessionRef(lineUserId);
  const rev = ((await ref.get()).data()?.rev || 0) + 1;
  const logistics = detectLogisticsFromResi(resi);
  await ref.set({ orderId: o.id, awaiting: 'confirm', resi, rev, updatedAt: Timestamp.now() });
  return [flex(`Konfirmasi kirim ${o.orderCode}`, confirmBubble(o, resi, logistics === 'Unknown' ? 'Tidak dikenali' : logistics, rev))];
}

async function receiveOrderNumber(lineUserId: string, session: any, raw: string): Promise<LineMessage[]> {
  const orderNumber = raw.trim().replace(/\s+/g, '');
  if (!orderNumber) return [text('Nomor order kosong. Kirim lagi, atau ketik "batal".')];
  const dup = await db().collection('salesOrders').where('orderNumber', '==', orderNumber).get();
  const other = dup.docs.find((d) => d.id !== session.orderId);
  if (other) return [text(`Nomor order ${orderNumber} sudah dipakai ${other.data().orderCode}. Kirim nomor lain, atau ketik "batal".`)];
  const o = await loadOrder(session.orderId);
  const err = notShippable(o);
  if (err) { await sessionRef(lineUserId).delete(); return [text(err)]; }
  await db().doc(`salesOrders/${o.id}`).update({ orderNumber, updatedAt: Timestamp.now() });
  o.orderNumber = orderNumber;
  if (session.resi) return [text(`✅ Nomor order ${orderNumber} tersimpan.`), ...(await showConfirm(lineUserId, o, session.resi))];
  await sessionRef(lineUserId).delete();
  return [text(`✅ Nomor order ${orderNumber} tersimpan.`), flex(`SO ${o.orderCode} siap dikirim`, readyOrderBubble((await withCovers([o]))[0]))];
}

async function receiveResi(lineUserId: string, session: any, raw: string): Promise<LineMessage[]> {
  const resi = sanitizeResiNumber(raw);
  if (!resi) return [text('Nomor resi kosong. Kirim lagi, atau ketik "batal".')];
  const o = await loadOrder(session.orderId);
  const err = notShippable(o);
  if (err) { await sessionRef(lineUserId).delete(); return [text(err)]; }
  const dup = await db().collection('salesOrders').where('shipment.shippingNumber', '==', resi).get();
  const other = dup.docs.find((d) => d.id !== o.id);
  const warn = other ? [text(`⚠️ Resi ${resi} juga tercatat di ${other.data().orderCode}. Pastikan tidak salah.`)] : [];
  if (!o.orderNumber) {
    await sessionRef(lineUserId).set({ orderId: o.id, awaiting: 'orderNumber', resi, rev: (session.rev || 0) + 1, updatedAt: Timestamp.now() });
    return [...warn, text(`Resi ${resi} dicatat. Nomor order ${o.orderCode} belum ada, kirim nomor ordernya dulu sebelum Send.`)];
  }
  return [...warn, ...(await showConfirm(lineUserId, o, resi))];
}

// Mengembalikan null kalau event bukan urusan agent ini (lanjut ke agent pencatat biaya).
export async function handleShipAgentEvent(event: any): Promise<LineMessage[] | null> {
  const lineUserId: string = event.source.userId;

  if (event.type === 'postback') {
    const data = String(event.postback?.data || '');
    if (!data.startsWith('ship:')) return null;
    const [, action, orderId, rev] = data.split(':');
    if (action === 'resi') return startInput(lineUserId, orderId, 'resi');
    if (action === 'ordno') return startInput(lineUserId, orderId, 'orderNumber');
    if (action === 'cancel') { await sessionRef(lineUserId).delete(); return [text('Dibatalkan. SO tetap Pending.')]; }
    if (action === 'send') {
      const session = (await sessionRef(lineUserId).get()).data();
      if (!session || session.awaiting !== 'confirm' || session.orderId !== orderId || String(session.rev) !== rev) {
        return [text('Konfirmasi ini sudah kedaluwarsa. Tekan "Kirim nomor resi" lagi di card SO.')];
      }
      await sessionRef(lineUserId).delete();
      return [text(await shipSalesOrder(orderId, session.resi, lineUserId))];
    }
    return [];
  }

  if (event.type !== 'message' || event.message?.type !== 'text') return null;
  const msg = String(event.message.text || '').trim();

  if (LIST_WORDS.test(msg)) {
    const orders = await findReadyToShipOrders();
    return orders.length ? readyOrdersMessages(await withCovers(orders)) : [text('Belum ada SO yang siap dikirim.')];
  }

  const session = (await sessionRef(lineUserId).get()).data();
  // Sesi lama diabaikan supaya pesan biasa (mis. catatan biaya) tidak terbaca sebagai resi.
  if (!session || Date.now() - (tsMs(session.updatedAt) || 0) > SESSION_TTL_MS) return null;
  if (CANCEL_WORDS.test(msg)) { await sessionRef(lineUserId).delete(); return [text('Dibatalkan. SO tetap Pending.')]; }
  if (session.awaiting === 'orderNumber') return receiveOrderNumber(lineUserId, session, msg);
  // Teks saat card konfirmasi terbuka dianggap koreksi resi.
  return receiveResi(lineUserId, session, msg);
}
