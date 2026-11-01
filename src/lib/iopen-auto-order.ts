// Auto Order iOPEN sisi ERP: kunci SO, jalankan extension, catat hasil di SO (field iopenAutoOrder + orderNumber).
// Aturan data ada di iopen-order.ts; alur di situs iOPEN ada di extension (iopen-order-bg.js / iopen-order.js).
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { buildIopenOrderRequest, isIopenOrderCandidate, isIopenManualCandidate, type IopenAutoOrderInfo } from './iopen-order';
import { requestIopenOrder, ackIopenResult, ExtensionNoResponse, type IopenOrderResult } from './auto-ship';

/** settings/iopenAutoOrder: saklar otomatis. SO yang dibuat sebelum activeFrom tidak diproses otomatis. */
export const IOPEN_AUTO_SETTINGS_DOC = 'iopenAutoOrder';
export interface IopenAutoSettings {
  enabled?: boolean;
  activeFrom?: any;
}

const tsMs = (v: any): number | null => {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
};

/** SO yang boleh diproses pemantau otomatis: syarat data + dibuat setelah fitur aktif + belum pernah diproses. */
export const isAutoIopenTarget = (o: any, settings: IopenAutoSettings | null): boolean => {
  if (!settings?.enabled || !isIopenOrderCandidate(o) || o.iopenAutoOrder?.state) return false;
  const from = tsMs(settings.activeFrom);
  const created = tsMs(o.createdAt);
  return from != null && created != null && created >= from;
};

export class IopenOrderBlocked extends Error {}

/**
 * Kunci SO (transaksi) supaya pemantau otomatis hanya memproses satu SO sekali walaupun ERP terbuka di beberapa
 * tab/komputer. manual (tombol, sudah dikonfirmasi user): selalu dijalankan, juga kalau Nomor Order sudah terisi
 * atau SO pernah diproses - order baru dibuat dan Nomor Order diganti.
 */
async function claim(soId: string, trigger: 'auto' | 'manual'): Promise<any> {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'salesOrders', soId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new IopenOrderBlocked('SO tidak ditemukan');
    const o: any = { id: snap.id, ...snap.data() };
    if (trigger === 'manual') {
      if (!isIopenManualCandidate(o)) throw new IopenOrderBlocked('SO tidak memenuhi syarat (Direct Order, 7-Eleven, COD, Draft/Pending)');
    } else {
      if (!isIopenOrderCandidate(o)) throw new IopenOrderBlocked('SO tidak memenuhi syarat (Direct Order, 7-Eleven, COD, Nomor Order kosong, Draft/Pending)');
      if (o.iopenAutoOrder?.state) throw new IopenOrderBlocked(`SO sudah diproses Auto Order iOPEN (status: ${o.iopenAutoOrder.state})`);
    }
    const info: IopenAutoOrderInfo = { state: 'running', startedAt: Timestamp.now(), trigger };
    tx.update(ref, { iopenAutoOrder: info });
    return o;
  });
}

/** Catat hasil extension di SO. Otomatis: Nomor Order diisi hanya kalau masih kosong. Manual: Nomor Order diganti nomor baru. */
export async function applyIopenResult(soId: string, result: IopenOrderResult, trigger?: 'auto' | 'manual'): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'salesOrders', soId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const o: any = snap.data();
    const info: IopenAutoOrderInfo = {
      ...(o.iopenAutoOrder || {}),
      state: result.state,
      finishedAt: Timestamp.now(),
      items: result.items || [],
      ...(trigger ? { trigger } : {}),
    };
    const update: Record<string, any> = {};
    if (result.state === 'done' && result.orderNo) {
      info.orderNo = result.orderNo;
      delete info.error;
      delete info.replacedOrderNo;
      const current = String(o.orderNumber || '').trim();
      const manual = (trigger || o.iopenAutoOrder?.trigger) === 'manual';
      if (!current) update.orderNumber = result.orderNo;
      else if (current === result.orderNo) {
        // sudah tercatat
      } else if (manual) {
        update.orderNumber = result.orderNo;
        info.replacedOrderNo = current;
      } else info.error = `Nomor Order SO sudah terisi ${current} saat order iOPEN ${result.orderNo} selesai dibuat`;
    } else {
      info.error = result.error || 'Gagal tanpa keterangan';
    }
    update.iopenAutoOrder = info;
    tx.update(ref, update);
  });
  ackIopenResult(soId);
}

/**
 * Jalankan Auto Order iOPEN untuk satu SO. Data SO yang tidak valid (nama, HP, toko, total) langsung dicatat
 * gagal tanpa membuka iOPEN. `dryRun` tidak mengunci / menulis apa pun ke SO.
 */
export async function runIopenOrder(
  so: any,
  opts: { trigger: 'auto' | 'manual'; dryRun?: boolean; onProgress?: (t: string) => void }
): Promise<IopenOrderResult> {
  if (opts.dryRun) {
    const req = buildIopenOrderRequest(so);
    return requestIopenOrder(so.id, req, { dryRun: true, onProgress: opts.onProgress });
  }
  const fresh = await claim(so.id, opts.trigger);
  let req;
  try {
    req = buildIopenOrderRequest(fresh);
  } catch (err: any) {
    const result: IopenOrderResult = { ok: false, state: 'failed', error: `Data SO: ${err.message}` };
    await applyIopenResult(so.id, result, opts.trigger);
    return result;
  }
  let result: IopenOrderResult;
  try {
    result = await requestIopenOrder(so.id, req, { onProgress: opts.onProgress });
  } catch (err: any) {
    if (err instanceof ExtensionNoResponse) {
      result = { ok: false, state: 'failed', error: err.message };
      await applyIopenResult(so.id, result, opts.trigger);
      return result;
    }
    // Timeout di sisi ERP: extension mungkin masih berjalan dan menyimpan hasilnya (diambil saat ERP dibuka lagi)
    result = { ok: false, state: 'unknown', error: `${err.message}. Hasil akan diambil otomatis kalau extension sempat menyelesaikannya; cek iOPEN.` };
    await applyIopenResult(so.id, result, opts.trigger);
    return result;
  }
  await applyIopenResult(so.id, result, opts.trigger);
  return result;
}
