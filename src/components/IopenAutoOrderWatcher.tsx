// Pemantau Auto Order iOPEN: selama ERP terbuka (owner, Chrome dengan extension KBI), SO baru yang
// Direct Order + 7-Eleven + COD + Nomor Order kosong langsung dibuatkan order di iOPEN Mall, satu per satu.
// Saklar & batas waktu di settings/iopenAutoOrder (diatur dari tab Sales Orders).
import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isIopenOrderAvailable, fetchPendingIopenResults } from '../lib/auto-ship';
import { applyIopenResult, isAutoIopenTarget, runIopenOrder, IOPEN_AUTO_SETTINGS_DOC, IopenOrderBlocked, type IopenAutoSettings } from '../lib/iopen-auto-order';

export const IopenAutoOrderWatcher: React.FC = () => {
  const [settings, setSettings] = useState<IopenAutoSettings | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [status, setStatus] = useState<string>('');
  const [extReady, setExtReady] = useState(false);
  const queued = useRef(new Set<string>());
  const running = useRef(false);
  const queue = useRef<any[]>([]);

  // Extension menandai <html> sedikit setelah halaman dimuat
  useEffect(() => {
    if (isIopenOrderAvailable()) {
      setExtReady(true);
      return;
    }
    const t = setInterval(() => {
      if (isIopenOrderAvailable()) {
        setExtReady(true);
        clearInterval(t);
      }
    }, 1000);
    const stop = setTimeout(() => clearInterval(t), 15000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, []);

  useEffect(() => onSnapshot(doc(db, 'settings', IOPEN_AUTO_SETTINGS_DOC), (s) => setSettings(s.exists() ? (s.data() as IopenAutoSettings) : null)), []);

  useEffect(() => {
    if (!extReady || !settings?.enabled) return;
    return onSnapshot(query(collection(db, 'salesOrders'), where('status', '==', 'draft')), (snap) =>
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [extReady, settings?.enabled]);

  // Hasil order yang selesai saat ERP tertutup / timeout: catat ke SO
  useEffect(() => {
    if (!extReady) return;
    fetchPendingIopenResults()
      .then(async ({ results }) => {
        for (const [soId, r] of Object.entries(results)) {
          try {
            await applyIopenResult(soId, r);
          } catch (err) {
            console.warn('Gagal mencatat hasil Auto Order iOPEN', soId, err);
          }
        }
      })
      .catch((err) => console.warn('Hasil Auto Order iOPEN tidak terbaca:', err));
  }, [extReady]);

  useEffect(() => {
    if (!extReady || !settings?.enabled) return;
    for (const o of orders) {
      if (queued.current.has(o.id) || !isAutoIopenTarget(o, settings)) continue;
      queued.current.add(o.id);
      queue.current.push(o);
    }
    void pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, settings, extReady]);

  const pump = async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const o = queue.current.shift();
        const code = o.orderCode || o.id;
        setStatus(`${code}: mulai`);
        try {
          const r = await runIopenOrder(o, { trigger: 'auto', onProgress: (t) => setStatus(t) });
          setStatus(r.state === 'done' ? `${code}: order iOPEN ${r.orderNo}` : `${code}: ${r.state === 'unknown' ? 'perlu dicek' : 'gagal'} – ${r.error}`);
        } catch (err: any) {
          // Diambil tab/komputer lain atau sudah tidak memenuhi syarat: lewati
          if (!(err instanceof IopenOrderBlocked)) setStatus(`${code}: ${err.message}`);
        }
      }
    } finally {
      running.current = false;
      setTimeout(() => setStatus((s) => (running.current ? s : '')), 15000);
    }
  };

  if (!status) return null;
  return (
    <div
      role="status"
      className="fixed bottom-24 md:bottom-4 right-4 z-[60] max-w-sm rounded-xl border border-orange-200 bg-white/95 px-3 py-2 text-xs text-neutral-700 shadow-lg dark:border-orange-900 dark:bg-neutral-900/95 dark:text-neutral-200"
    >
      <span className="font-semibold text-orange-600">Auto Order iOPEN</span> · {status}
    </div>
  );
};
