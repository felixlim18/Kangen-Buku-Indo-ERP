import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ClipboardCheck, PackagePlus, PackageX, RotateCcw, Search, Scale } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';
import { formatNTD } from '../../lib/decimal-utils';
import { isPeriodClosed } from '../../lib/period-closing-utils';
import { postStockAdjustment, buildAdjustmentJournalLines } from '../../lib/stock-adjustment';

// Angka fisik yang sedang diketik disimpan per-browser supaya refresh tidak
// menghapus hitungan. Yang tercatat ke database hanya penyesuaian yang diproses.
const DRAFT_KEY = 'kbi-stock-opname-draft';
const PAGE_SIZE = 50;

const loadDraft = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type RowState = 'belum' | 'cocok' | 'lebih' | 'kurang';
type FilterKey = 'semua' | RowState;

interface OpnameRow {
  id: string;
  bookName: string;
  cover?: string;
  system: number;
  physical: number | null;
  diff: number;
  unitCost: number;
  state: RowState;
}

interface StockOpnamePanelProps {
  booksWithStock: any[];
  inventoryList: any[];
  closedPeriods: string[];
  userEmail: string;
  canProcess: boolean;
  getCurrentReady: (bookId: string) => number;
  onPosted: () => Promise<void>;
  showAlert: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const StockOpnamePanel: React.FC<StockOpnamePanelProps> = ({
  booksWithStock,
  inventoryList,
  closedPeriods,
  userEmail,
  canProcess,
  getCurrentReady,
  onPosted,
  showAlert
}) => {
  const [draft, setDraft] = useState<Record<string, string>>(loadDraft);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterKey>('semua');
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [page, setPage] = useState(1);
  const [coverPreview, setCoverPreview] = useState<{ url: string; title: string } | null>(null);

  // Konfirmasi: satu baris (rowIds.length === 1) atau massal
  const [confirmRowIds, setConfirmRowIds] = useState<string[] | null>(null);
  const [confirmDate, setConfirmDate] = useState(todayIso);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postProgress, setPostProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage diblokir: hitungan tetap jalan, hanya tidak bertahan saat refresh
    }
  }, [draft]);

  const costByBookId = useMemo(
    () => new Map<string, number>(inventoryList.map((i: any) => [i.bookId, i.movingAverageCost > 0 ? i.movingAverageCost : 0])),
    [inventoryList]
  );

  const allRows: OpnameRow[] = useMemo(() => {
    return booksWithStock
      .filter((b) => showZeroStock || b.stokDigudang !== 0 || draft[b.id] !== undefined)
      .map((b) => {
        const system = b.stokDigudang || 0;
        const raw = draft[b.id];
        const physical = raw === undefined || raw === '' ? null : Number(raw);
        const diff = physical === null ? 0 : physical - system;
        const state: RowState = physical === null ? 'belum' : diff === 0 ? 'cocok' : diff > 0 ? 'lebih' : 'kurang';
        return {
          id: b.id,
          bookName: b.bookName || '',
          cover: b.cover,
          system,
          physical,
          diff,
          unitCost: costByBookId.get(b.id) || 0,
          state
        };
      })
      .sort((a, b) => a.bookName.localeCompare(b.bookName));
  }, [booksWithStock, draft, showZeroStock, costByBookId]);

  const counts = useMemo(() => {
    const c = { semua: allRows.length, belum: 0, cocok: 0, lebih: 0, kurang: 0 };
    for (const r of allRows) c[r.state]++;
    return c;
  }, [allRows]);

  const summary = useMemo(() => {
    let lebihQty = 0, lebihValue = 0, kurangQty = 0, kurangValue = 0;
    for (const r of allRows) {
      if (r.state === 'lebih') { lebihQty += r.diff; lebihValue += r.diff * r.unitCost; }
      if (r.state === 'kurang') { kurangQty += -r.diff; kurangValue += -r.diff * r.unitCost; }
    }
    return { lebihQty, lebihValue, kurangQty, kurangValue, net: lebihValue - kurangValue };
  }, [allRows]);

  const visibleRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allRows.filter((r) => (filter === 'semua' || r.state === filter) && (!q || r.bookName.toLowerCase().includes(q)));
  }, [allRows, filter, searchTerm]);

  useEffect(() => setPage(1), [filter, searchTerm, showZeroStock]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const countedCount = counts.semua - counts.belum;
  const progressPct = counts.semua ? Math.round((countedCount / counts.semua) * 100) : 0;
  const diffRows = allRows.filter((r) => r.state === 'lebih' || r.state === 'kurang');

  const setPhysical = (bookId: string, value: string) => {
    const clean = value.replace(/[^\d]/g, '');
    setDraft((prev) => {
      const next = { ...prev };
      if (clean === '') delete next[bookId];
      else next[bookId] = clean;
      return next;
    });
  };

  const clearRows = (ids: string[]) => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  };

  const handleResetDraft = () => {
    if (!countedCount) return;
    if (window.confirm(`Hapus semua hitungan fisik (${countedCount} buku) yang belum diproses?`)) setDraft({});
  };

  const openConfirm = (ids: string[]) => {
    setConfirmRowIds(ids);
    setConfirmDate(todayIso());
    setConfirmNotes('');
    setConfirmError('');
  };

  const confirmRows = confirmRowIds ? allRows.filter((r) => confirmRowIds.includes(r.id) && r.diff !== 0) : [];

  const handleProcess = async () => {
    if (!confirmRows.length) return;
    if (!confirmDate) {
      setConfirmError('Silakan pilih tanggal.');
      return;
    }
    if (isPeriodClosed(confirmDate, closedPeriods)) {
      setConfirmError(`Periode ${confirmDate.substring(0, 7)} telah ditutup dan dikunci.`);
      return;
    }

    setIsPosting(true);
    setConfirmError('');
    setPostProgress({ done: 0, total: confirmRows.length });

    const succeeded: string[] = [];
    const failed: { id: string; name: string }[] = [];
    const notes = confirmNotes.trim() ? `Stock Opname - ${confirmNotes.trim()}` : 'Stock Opname';

    // Berurutan, satu batch per buku: kalau satu gagal, yang lain tetap tercatat utuh.
    for (const row of confirmRows) {
      try {
        await postStockAdjustment({
          bookId: row.id,
          bookName: row.bookName,
          bookInventory: inventoryList.find((i: any) => i.bookId === row.id) || null,
          movingAverageCost: row.unitCost,
          currentReady: getCurrentReady(row.id),
          adjustmentType: row.diff > 0 ? 'Barang Lebih' : 'Barang Kurang',
          qty: Math.abs(row.diff),
          date: confirmDate,
          notes,
          userEmail,
          source: 'opname'
        });
        succeeded.push(row.id);
      } catch (err) {
        console.error('Stock opname adjustment failed:', row.bookName, err);
        failed.push({ id: row.id, name: row.bookName });
      }
      setPostProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    clearRows(succeeded);
    await onPosted();
    setIsPosting(false);

    if (failed.length) {
      // Modal tetap terbuka berisi buku yang gagal saja, supaya bisa dicoba lagi.
      setConfirmRowIds(failed.map((f) => f.id));
      setConfirmError(`Gagal memproses: ${failed.map((f) => f.name).join(', ')}. ${succeeded.length} buku berhasil.`);
      showAlert('Sebagian Gagal', `${succeeded.length} berhasil, ${failed.length} gagal diproses.`, 'error');
    } else {
      setConfirmRowIds(null);
      showAlert('Stock Opname Diproses', `${succeeded.length} penyesuaian tercatat di tab Penyesuaian dan jurnal terposting.`, 'success');
    }
  };

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'belum', label: 'Belum dihitung' },
    { key: 'cocok', label: 'Cocok' },
    { key: 'lebih', label: 'Lebih' },
    { key: 'kurang', label: 'Kurang' }
  ];

  const confirmTotals = confirmRows.reduce(
    (acc, r) => {
      const v = Math.abs(r.diff) * r.unitCost;
      if (r.diff > 0) acc.lebih += v; else acc.kurang += v;
      return acc;
    },
    { lebih: 0, kurang: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> Progres Hitung
          </span>
          <div className="text-xl font-bold font-numeric text-neutral-900 dark:text-white mt-1">
            {countedCount} <span className="text-sm text-neutral-400">/ {counts.semua} buku</span>
          </div>
          <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block">{progressPct}% · {counts.cocok} cocok</span>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-emerald-200/80 dark:border-emerald-900/50 p-4 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <PackagePlus className="h-3.5 w-3.5" /> Barang Lebih
          </span>
          <div className="text-xl font-bold font-numeric text-emerald-600 dark:text-emerald-400 mt-1">
            {counts.lebih} <span className="text-sm">buku</span>
          </div>
          <span className="text-[11px] text-neutral-500 block">+{summary.lebihQty} pcs · {formatNTD(summary.lebihValue)}</span>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-orange-200/80 dark:border-orange-900/50 p-4 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
            <PackageX className="h-3.5 w-3.5" /> Barang Kurang
          </span>
          <div className="text-xl font-bold font-numeric text-orange-600 dark:text-orange-400 mt-1">
            {counts.kurang} <span className="text-sm">buku</span>
          </div>
          <span className="text-[11px] text-neutral-500 block">−{summary.kurangQty} pcs · {formatNTD(summary.kurangValue)}</span>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5" /> Selisih Bersih
          </span>
          <div className={`text-xl font-bold font-numeric mt-1 ${summary.net > 0 ? 'text-emerald-600' : summary.net < 0 ? 'text-orange-600' : 'text-neutral-900 dark:text-white'}`}>
            {summary.net > 0 ? '+' : summary.net < 0 ? '−' : ''}{formatNTD(Math.abs(summary.net))}
          </div>
          <span className="text-[11px] text-neutral-500 block">Nilai di moving average cost</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl text-xs font-semibold">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-lg transition ${filter === f.key ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500'}`}
              >
                {f.label} ({counts[f.key]})
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300 cursor-pointer select-none">
            <input type="checkbox" checked={showZeroStock} onChange={(e) => setShowZeroStock(e.target.checked)} className="accent-indigo-600" />
            Tampilkan stok 0
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDraft}
            disabled={!countedCount}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset hitungan
          </button>
          {canProcess && (
            <button
              onClick={() => openConfirm(diffRows.map((r) => r.id))}
              disabled={!diffRows.length}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-40"
            >
              <ClipboardCheck className="h-4 w-4" /> Proses semua selisih ({diffRows.length})
            </button>
          )}
        </div>
      </div>

      {/* Pencarian */}
      <div className="relative w-full sm:max-w-sm">
        <input
          type="text"
          placeholder="Cari buku..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-neutral-800 dark:text-neutral-200"
        />
        <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
      </div>

      {/* Tabel */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase border-b border-neutral-200 dark:border-neutral-800">
                <th className="p-3 text-left">Buku</th>
                <th className="p-3 text-center">Stok Sistem</th>
                <th className="p-3 text-center">Stok Fisik</th>
                <th className="p-3 text-center">Selisih</th>
                <th className="p-3 text-right">Nilai Selisih</th>
                <th className="p-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs text-neutral-700 dark:text-neutral-300">
              {pagedRows.map((r) => (
                <tr
                  key={r.id}
                  className={`transition ${
                    r.state === 'lebih' ? 'bg-emerald-50/40 dark:bg-emerald-950/10'
                    : r.state === 'kurang' ? 'bg-orange-50/40 dark:bg-orange-950/10'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/25'
                  }`}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3 min-w-[220px]">
                      {r.cover ? (
                        <button
                          type="button"
                          onClick={() => setCoverPreview({ url: r.cover!, title: r.bookName })}
                          className="shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-zoom-in"
                          title="Lihat cover"
                        >
                          <img src={r.cover} alt={`Cover ${r.bookName}`} referrerPolicy="no-referrer" className="h-11 w-8 rounded object-cover bg-neutral-100 dark:bg-neutral-800 hover:opacity-80 transition" />
                        </button>
                      ) : (
                        <div className="h-11 w-8 rounded bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                      )}
                      <span className="font-semibold text-neutral-900 dark:text-white line-clamp-2">{r.bookName}</span>
                    </div>
                  </td>
                  <td className="p-3 text-center font-numeric font-bold whitespace-nowrap">{r.system} pcs</td>
                  <td className="p-3 text-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draft[r.id] ?? ''}
                      onChange={(e) => setPhysical(r.id, e.target.value)}
                      placeholder="—"
                      aria-label={`Stok fisik ${r.bookName}`}
                      className="w-20 px-2 py-1.5 text-center text-sm font-numeric font-bold rounded-lg bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-900 dark:text-white"
                    />
                  </td>
                  <td className={`p-3 text-center font-numeric font-bold whitespace-nowrap ${r.diff > 0 ? 'text-emerald-600' : r.diff < 0 ? 'text-orange-600' : 'text-neutral-400'}`}>
                    {r.physical === null ? '—' : r.diff > 0 ? `+${r.diff}` : r.diff < 0 ? `−${-r.diff}` : '0'}
                  </td>
                  <td className="p-3 text-right font-numeric font-bold whitespace-nowrap">
                    {r.diff !== 0 ? formatNTD(Math.abs(r.diff) * r.unitCost) : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {r.state === 'belum' && (
                      <button
                        onClick={() => setPhysical(r.id, String(Math.max(0, r.system)))}
                        className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        title="Isi stok fisik sama dengan stok sistem"
                      >
                        = Sistem
                      </button>
                    )}
                    {r.state === 'cocok' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        <CheckCircle className="h-3 w-3 text-emerald-600" /> Cocok
                      </span>
                    )}
                    {r.state === 'lebih' && canProcess && (
                      <button
                        onClick={() => openConfirm([r.id])}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-xs"
                      >
                        <PackagePlus className="h-3.5 w-3.5" /> Proses Lebih +{r.diff}
                      </button>
                    )}
                    {r.state === 'kurang' && canProcess && (
                      <button
                        onClick={() => openConfirm([r.id])}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold transition shadow-xs"
                      >
                        <PackageX className="h-3.5 w-3.5" /> Proses Kurang −{-r.diff}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pagedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-neutral-400 text-sm">
                    Tidak ada buku yang cocok dengan filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
            <div className="text-sm text-neutral-500">
              Menampilkan {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, visibleRows.length)} dari {visibleRows.length} buku
            </div>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300">Prev</button>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300">Next</button>
            </div>
          </div>
        )}
      </div>

      <ImagePreviewModal
        isOpen={coverPreview !== null}
        onClose={() => setCoverPreview(null)}
        imageUrl={coverPreview?.url || ''}
        title={coverPreview?.title}
      />

      {/* Modal konfirmasi */}
      <Modal
        isOpen={confirmRowIds !== null}
        onClose={() => !isPosting && setConfirmRowIds(null)}
        isLoading={isPosting}
        size="md"
        title={confirmRows.length === 1 ? 'Proses Penyesuaian Stock Opname' : `Proses ${confirmRows.length} Selisih Stock Opname`}
        subtitle="Penyesuaian akan tercatat di tab Penyesuaian dan jurnal terposting otomatis."
      >
        <div className="space-y-4 text-xs">
          {confirmError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-semibold">
              {confirmError}
            </div>
          )}

          <div className="max-h-60 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800">
            {confirmRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">{r.bookName}</span>
                <span className="shrink-0 font-numeric text-neutral-500">
                  {r.system} → {r.physical}{' '}
                  <strong className={r.diff > 0 ? 'text-emerald-600' : 'text-orange-600'}>
                    ({r.diff > 0 ? `Lebih +${r.diff}` : `Kurang −${-r.diff}`})
                  </strong>
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 space-y-1 font-numeric">
            <div className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] mb-1">Pratinjau Jurnal</div>
            {confirmTotals.lebih > 0 && buildAdjustmentJournalLines('Barang Lebih', confirmTotals.lebih).map((l, i) => (
              <div key={`l${i}`} className="flex justify-between"><span>{l.accountCode} {l.account}</span><span>{l.debit ? `D ${formatNTD(l.debit)}` : `K ${formatNTD(l.credit)}`}</span></div>
            ))}
            {confirmTotals.kurang > 0 && buildAdjustmentJournalLines('Barang Kurang', confirmTotals.kurang).map((l, i) => (
              <div key={`k${i}`} className="flex justify-between"><span>{l.accountCode} {l.account}</span><span>{l.debit ? `D ${formatNTD(l.debit)}` : `K ${formatNTD(l.credit)}`}</span></div>
            ))}
            {confirmRows.length > 1 && <div className="text-[10px] text-neutral-400 pt-1">Satu jurnal per buku; ditampilkan sebagai total.</div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Tanggal Opname *</label>
              <input
                type="date"
                value={confirmDate}
                onChange={(e) => setConfirmDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Catatan / Alasan</label>
              <input
                type="text"
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="mis. hitung ulang rak A"
                className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setConfirmRowIds(null)}
              disabled={isPosting}
              className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-bold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={handleProcess}
              disabled={isPosting || !confirmRows.length}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
            >
              {isPosting ? `Memproses ${postProgress.done}/${postProgress.total}...` : 'Proses Penyesuaian'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
