// Tab "CS AI" (khusus owner): melatih agent AI LINE OA "Kangenbukuindo CS" (src/server/csAgent.ts).
// - Latihan: owner chat sebagai pelanggan; AI menjawab lewat /api/cs/chat (prompt & Claude yang sama dengan bot asli,
//   tanpa LINE, tanpa riwayat, tanpa SO). Tombol "Perbaiki" menyimpan pelajaran yang langsung dipakai AI.
// - Pengetahuan toko: settings/csAgent (info per topik, ON/OFF, mode auto/draft).
// - Pelajaran: csAgentLessons (aktif / usulan harian / ditolak / nonaktif).
// - Percakapan: lineCsChats (chat pelanggan asli), jeda AI per pelanggan, perbaiki balasan AI.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { Bot, Send, RotateCcw, Wrench, Trash2, Pause, Play, Check, X, Sparkles, MessageSquare, BookOpen, Settings2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { apiFetch } from '../lib/api-fetch';
import { CS_INFO_FIELDS } from '../lib/cs-agent-info';

type Turn = { from: 'pelanggan' | 'toko'; text: string; meta?: any };
type Lesson = { id: string; situasi: string; jawaban: string; catatan?: string; status: string; sumber?: string; createdAt?: any };

const PAUSE_HOURS = 4;
const card = 'rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900';
const input = 'w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50';
const btnPrimary = `${btn} bg-emerald-600 text-white hover:bg-emerald-700`;
const btnGhost = `${btn} border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800`;
const ntd = (cents: number) => `NT$ ${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const tsMs = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : 0);
const fmtTime = (v: any) => (tsMs(v) ? new Date(tsMs(v)).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-');

const STATUS_LABEL: Record<string, string> = {
  aktif: 'Aktif', usulan: 'Usulan', ditolak: 'Ditolak', nonaktif: 'Nonaktif', kedaluwarsa: 'Kedaluwarsa',
};
const STATUS_CLASS: Record<string, string> = {
  aktif: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  usulan: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

// Form pelajaran (dipakai di Latihan & Percakapan).
function LessonForm({ situasi, jawaban, sumber, onDone }: { situasi: string; jawaban: string; sumber: string; onDone: () => void }) {
  const { user } = useAuth();
  const [s, setS] = useState(situasi);
  const [j, setJ] = useState(jawaban);
  const [c, setC] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!s.trim() || !j.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(collection(db, 'csAgentLessons')), {
        situasi: s.trim(), jawaban: j.trim(), catatan: c.trim(), status: 'aktif', sumber,
        createdAt: Timestamp.now(), createdBy: user?.email || '',
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-sm">
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Situasi (kapan aturan ini dipakai)</label>
      <input className={input} value={s} onChange={(e) => setS(e.target.value)} />
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Jawaban yang benar (pisahkan bubble dengan baris "---")</label>
      <textarea className={input} rows={5} value={j} onChange={(e) => setJ(e.target.value)} />
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Catatan / alasan (opsional)</label>
      <input className={input} value={c} onChange={(e) => setC(e.target.value)} placeholder="Mis. jangan pernah janji tanggal tiba" />
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={saving || !s.trim() || !j.trim()} onClick={save}><Check className="h-4 w-4" /> Simpan pelajaran</button>
        <button className={btnGhost} onClick={onDone}>Batal</button>
      </div>
    </div>
  );
}

const ChatBubble: React.FC<{ turn: Turn; children?: React.ReactNode }> = ({ turn, children }) => {
  const mine = turn.from === 'pelanggan';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine
          ? 'bg-emerald-500 text-white rounded-br-sm'
          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-bl-sm'}`}>
          {turn.text}
        </div>
        {children}
      </div>
    </div>
  );
};

// ---- Latihan ----------------------------------------------------------------------------------

function PracticePanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fixIdx, setFixIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  // scrollIntoView mengembalikan Promise di Chrome terbaru: jangan dijadikan nilai kembali effect.
  useEffect(() => { void endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  const ask = async (history: Turn[]) => {
    if (busy) return;
    setTurns(history);   // pesan pelanggan langsung tampil selagi AI mengetik
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/cs/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: history.map(({ from, text }) => ({ from, text })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Satu balasan bisa beberapa bubble; info (buku, pesanan, tombol) ditempel di bubble terakhir.
      const bubbles: string[] = data.balasan || [];
      const customerText = [...history].reverse().find((h) => h.from === 'pelanggan')?.text || '';
      setTurns([...history, ...bubbles.map((b, k) => ({
        from: 'toko' as const, text: b, meta: k === bubbles.length - 1 ? { ...data, customerText } : undefined,
      }))]);
    } catch (e: any) {
      setTurns(history);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const t = draft.trim();
    if (!t || busy) return;
    setDraft('');
    setSaved('');
    void ask([...turns, { from: 'pelanggan', text: t }]);
  };
  const retry = () => {
    let end = turns.length;
    while (end > 0 && turns[end - 1].from === 'toko') end--;
    if (end < turns.length) void ask(turns.slice(0, end));
  };

  return (
    <div className={`${card} flex flex-col h-[70vh] min-h-[420px]`}>
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-4 py-2">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Anda = pelanggan. Jawaban AI memakai katalog, stok, pengetahuan toko & pelajaran yang sama dengan bot LINE. Tidak ada yang terkirim ke LINE dan tidak ada SO yang dibuat.
        </div>
        <button className={btnGhost} onClick={() => { setTurns([]); setError(''); setFixIdx(null); setSaved(''); }}><RotateCcw className="h-4 w-4" /> Chat baru</button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {!turns.length && (
          <div className="text-center text-sm text-neutral-500 mt-10">Mulai dengan pesan seperti pelanggan, mis. "Kak, buku Laut Bercerita ada?"</div>
        )}
        {turns.map((t, i) => (
          <ChatBubble key={i} turn={t}>
            {t.from === 'toko' && t.meta && (
              <div className="mt-1 space-y-1 text-xs text-neutral-500">
                {t.meta.buku?.length > 0 && (
                  <div>📚 {t.meta.buku.map((b: any) => `${b.judul} (${b.harga}, ${b.stok})`).join(' · ')}</div>
                )}
                {t.meta.perluOwner && <div className="text-amber-600">⚠️ Owner akan dikabari: {t.meta.catatanOwner || 'perlu dicek'}</div>}
                {t.meta.pesanan && (
                  <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 p-2 text-sky-800 dark:text-sky-200">
                    🧾 Pratinjau pesanan {t.meta.pesanan.lengkap ? '(lengkap → bot asli akan membuat SO Draft)' : '(belum lengkap/belum dikonfirmasi)'}:<br />
                    {t.meta.pesanan.items.map((it: any) => `${it.bookName} x${it.qty} = ${ntd(it.lineTotal)}`).join(', ') || 'buku belum cocok dengan katalog'}
                    {t.meta.pesanan.items.length > 0 && ` · total ${ntd(t.meta.pesanan.total)}`}
                    <br />{[t.meta.pesanan.nama, t.meta.pesanan.hp, t.meta.pesanan.logistik, t.meta.pesanan.tokoTujuan, t.meta.pesanan.bayar].filter(Boolean).join(' · ') || 'data pengiriman belum ada'}
                  </div>
                )}
                {i === turns.length - 1 && fixIdx !== i && (
                  <div className="flex gap-2 pt-1">
                    <button className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1" onClick={() => setFixIdx(i)}><Wrench className="h-3 w-3" /> Perbaiki</button>
                    <button className="hover:underline inline-flex items-center gap-1" disabled={busy} onClick={retry}><RotateCcw className="h-3 w-3" /> Ulangi jawaban</button>
                  </div>
                )}
                {fixIdx === i && (
                  <LessonForm
                    situasi={`Pelanggan bertanya: "${t.meta.customerText}"`}
                    jawaban={(t.meta.balasan || [t.text]).join('\n---\n')}
                    sumber="latihan"
                    onDone={() => { setFixIdx(null); setSaved('Pelajaran tersimpan & langsung dipakai. Tekan "Ulangi jawaban" untuk mencoba lagi.'); }}
                  />
                )}
              </div>
            )}
          </ChatBubble>
        ))}
        {busy && <div className="text-xs text-neutral-500">AI sedang mengetik…</div>}
        {error && <div className="text-sm text-rose-600">⚠️ {error}</div>}
        {saved && <div className="text-sm text-emerald-600">✅ {saved}</div>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t border-neutral-200 dark:border-neutral-800 p-3">
        <input
          className={input}
          value={draft}
          placeholder="Ketik sebagai pelanggan…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className={btnPrimary} disabled={busy || !draft.trim()} onClick={send}><Send className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// ---- Pengetahuan toko -------------------------------------------------------------------------

function KnowledgePanel({ settings }: { settings: any }) {
  const [info, setInfo] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<'auto' | 'draft'>('auto');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const loaded = useRef(false);
  useEffect(() => {
    if (!settings || loaded.current) return;
    loaded.current = true;
    const base = { ...(settings.info || {}) };
    // Info toko versi lama (teks bebas) dipindah ke "Lain-lain" supaya tidak hilang.
    if (settings.storeInfo && !base.lainnya) base.lainnya = settings.storeInfo;
    setInfo(base);
    setEnabled(settings.enabled !== false);
    setMode(settings.mode === 'draft' ? 'draft' : 'auto');
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'csAgent'), { info, enabled, mode, storeInfo: '', updatedAt: Timestamp.now() }, { merge: true });
      setSavedAt(new Date().toLocaleTimeString('id-ID'));
    } finally {
      setSaving(false);
    }
  };
  const filled = CS_INFO_FIELDS.filter((f) => String(info[f.key] || '').trim()).length;

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex flex-wrap items-center gap-4`}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          AI aktif membalas chat LINE CS
        </label>
        <label className="flex items-center gap-2 text-sm">
          Mode:
          <select className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="auto">Auto balas</option>
            <option value="draft">Draft (owner setujui dulu)</option>
          </select>
        </label>
        <span className="text-sm text-neutral-500">{filled}/{CS_INFO_FIELDS.length} topik terisi. Makin lengkap, makin jarang AI menjawab "admin cek dulu".</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {CS_INFO_FIELDS.map((f) => (
          <div key={f.key} className={`${card} p-3`}>
            <label className="block text-sm font-semibold mb-1">{f.label}</label>
            <textarea
              className={input}
              rows={4}
              placeholder={f.hint}
              value={info[f.key] || ''}
              onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} disabled={saving} onClick={save}><Check className="h-4 w-4" /> Simpan pengetahuan</button>
        {savedAt && <span className="text-sm text-emerald-600">Tersimpan {savedAt}. Langsung dipakai AI.</span>}
      </div>
    </div>
  );
}

// ---- Pelajaran --------------------------------------------------------------------------------

function LessonsPanel({ lessons }: { lessons: Lesson[] }) {
  const [filter, setFilter] = useState<'aktif' | 'usulan' | 'lainnya'>('aktif');
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState({ situasi: '', jawaban: '', catatan: '' });
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const shown = lessons.filter((l) => (filter === 'lainnya' ? !['aktif', 'usulan'].includes(l.status) : l.status === filter));
  const count = (s: string) => lessons.filter((l) => l.status === s).length;

  const runSuggestions = async () => {
    setRunning(true);
    setRunMsg('');
    try {
      const res = await apiFetch('/api/cs/daily-lessons', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRunMsg(data.count ? `${data.count} usulan baru (juga dikirim ke bot ERP).` : 'Tidak ada usulan baru dari chat 24 jam terakhir.');
      if (data.count) setFilter('usulan');
    } catch (e: any) {
      setRunMsg(`⚠️ ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['aktif', 'usulan', 'lainnya'] as const).map((f) => (
          <button key={f} className={filter === f ? btnPrimary : btnGhost} onClick={() => setFilter(f)}>
            {f === 'aktif' ? `Aktif (${count('aktif')})` : f === 'usulan' ? `Usulan (${count('usulan')})` : 'Ditolak / nonaktif'}
          </button>
        ))}
        <div className="flex-1" />
        <button className={btnGhost} disabled={running} onClick={runSuggestions}><Sparkles className="h-4 w-4" /> {running ? 'Membaca chat…' : 'Buat usulan dari chat hari ini'}</button>
      </div>
      {runMsg && <div className="text-sm text-neutral-600 dark:text-neutral-400">{runMsg}</div>}
      <div className="text-xs text-neutral-500">Usulan otomatis dibuat tiap malam 21:00 dari chat pelanggan. Hanya pelajaran Aktif yang dipakai AI.</div>
      {!shown.length && <div className={`${card} p-6 text-center text-sm text-neutral-500`}>Belum ada.</div>}
      {shown.map((l) => (
        <div key={l.id} className={`${card} p-3 text-sm`}>
          {editId === l.id ? (
            <div className="space-y-2">
              <input className={input} value={editVal.situasi} onChange={(e) => setEditVal({ ...editVal, situasi: e.target.value })} />
              <textarea className={input} rows={3} value={editVal.jawaban} onChange={(e) => setEditVal({ ...editVal, jawaban: e.target.value })} />
              <input className={input} value={editVal.catatan} placeholder="Catatan" onChange={(e) => setEditVal({ ...editVal, catatan: e.target.value })} />
              <div className="flex gap-2">
                <button className={btnPrimary} onClick={async () => {
                  await updateDoc(doc(db, 'csAgentLessons', l.id), { ...editVal, status: 'aktif', updatedAt: Timestamp.now() });
                  setEditId(null);
                }}><Check className="h-4 w-4" /> Simpan & aktifkan</button>
                <button className={btnGhost} onClick={() => setEditId(null)}>Batal</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[l.status] || 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>{STATUS_LABEL[l.status] || l.status}</span>
                <div className="flex-1">
                  <div className="font-medium">{l.situasi}</div>
                  <div className="mt-1 whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">→ {l.jawaban}</div>
                  {l.catatan && <div className="mt-1 text-xs text-neutral-500">📝 {l.catatan}</div>}
                  <div className="mt-1 text-xs text-neutral-400">{l.sumber || '-'} · {fmtTime(l.createdAt)}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {l.status === 'usulan' && (
                  <>
                    <button className={btnPrimary} onClick={() => updateDoc(doc(db, 'csAgentLessons', l.id), { status: 'aktif', decidedAt: Timestamp.now() })}><Check className="h-4 w-4" /> Setujui</button>
                    <button className={btnGhost} onClick={() => updateDoc(doc(db, 'csAgentLessons', l.id), { status: 'ditolak', decidedAt: Timestamp.now() })}><X className="h-4 w-4" /> Tolak</button>
                  </>
                )}
                <button className={btnGhost} onClick={() => { setEditId(l.id); setEditVal({ situasi: l.situasi, jawaban: l.jawaban, catatan: l.catatan || '' }); }}><Wrench className="h-4 w-4" /> Ubah</button>
                {l.status === 'aktif' && (
                  <button className={btnGhost} onClick={() => updateDoc(doc(db, 'csAgentLessons', l.id), { status: 'nonaktif' })}><Pause className="h-4 w-4" /> Nonaktifkan</button>
                )}
                {['nonaktif', 'ditolak', 'kedaluwarsa'].includes(l.status) && (
                  <button className={btnGhost} onClick={() => updateDoc(doc(db, 'csAgentLessons', l.id), { status: 'aktif' })}><Play className="h-4 w-4" /> Aktifkan</button>
                )}
                <button className={`${btnGhost} text-rose-600`} onClick={() => { if (window.confirm('Hapus pelajaran ini?')) void deleteDoc(doc(db, 'csAgentLessons', l.id)); }}><Trash2 className="h-4 w-4" /> Hapus</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Percakapan asli --------------------------------------------------------------------------

function ConversationsPanel({ chats }: { chats: any[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [fixIdx, setFixIdx] = useState<number | null>(null);
  const open = chats.find((c) => c.id === openId);
  const paused = (c: any) => tsMs(c.pausedUntil) > Date.now();
  const setPause = (id: string, on: boolean) => updateDoc(doc(db, 'lineCsChats', id), {
    pausedUntil: on ? Timestamp.fromMillis(Date.now() + PAUSE_HOURS * 3600_000) : null,
  });

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className={`${card} divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[70vh] overflow-y-auto`}>
        {!chats.length && <div className="p-4 text-sm text-neutral-500">Belum ada chat pelanggan.</div>}
        {chats.map((c) => {
          const last = (c.history || [])[c.history?.length - 1];
          return (
            <button key={c.id} onClick={() => { setOpenId(c.id); setFixIdx(null); }} className={`w-full text-left p-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${openId === c.id ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="font-medium truncate flex-1">{c.customerName || 'Pelanggan'}</span>
                {paused(c) && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-700">dijeda</span>}
              </div>
              <div className="truncate text-xs text-neutral-500">{last ? `${last.from === 'toko' ? 'AI: ' : ''}${last.text}` : '-'}</div>
              <div className="text-xs text-neutral-400">{fmtTime(c.updatedAt)}</div>
            </button>
          );
        })}
      </div>
      <div className={`${card} flex flex-col max-h-[70vh]`}>
        {!open ? (
          <div className="p-6 text-sm text-neutral-500">Pilih percakapan.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 px-4 py-2">
              <div className="font-medium flex-1">{open.customerName}</div>
              {open.lastOrderId && <span className="text-xs text-sky-700">🧾 Ada SO Draft dari AI</span>}
              {paused(open)
                ? <button className={btnGhost} onClick={() => setPause(open.id, false)}><Play className="h-4 w-4" /> Aktifkan AI (dijeda s/d {new Date(tsMs(open.pausedUntil)).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})</button>
                : <button className={btnGhost} onClick={() => setPause(open.id, true)}><Pause className="h-4 w-4" /> Ambil alih {PAUSE_HOURS} jam</button>}
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 p-4">
              <div className="text-xs text-neutral-500">Hanya {12} pesan terakhir yang disimpan. Balasan manual dari aplikasi LINE OA tidak tercatat di sini.</div>
              {(open.history || []).map((t: Turn, i: number) => (
                <ChatBubble key={i} turn={t}>
                  {t.from === 'toko' && (fixIdx === i ? (
                    <LessonForm
                      situasi={`Pelanggan bertanya: "${open.history[i - 1]?.text || ''}"`}
                      jawaban={t.text}
                      sumber="percakapan"
                      onDone={() => setFixIdx(null)}
                    />
                  ) : (
                    <button className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1" onClick={() => setFixIdx(i)}><Wrench className="h-3 w-3" /> Perbaiki</button>
                  ))}
                </ChatBubble>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Tab ----------------------------------------------------------------------------------------

export function CsAiTab() {
  const [section, setSection] = useState<'latihan' | 'pengetahuan' | 'pelajaran' | 'percakapan'>('latihan');
  const [settings, setSettings] = useState<any>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [chats, setChats] = useState<any[]>([]);

  useEffect(() => onSnapshot(doc(db, 'settings', 'csAgent'), (s) => setSettings(s.data() || {})), []);
  useEffect(() => onSnapshot(collection(db, 'csAgentLessons'), (snap) =>
    setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)))), []);
  useEffect(() => onSnapshot(collection(db, 'lineCsChats'), (snap) =>
    setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => tsMs(b.updatedAt) - tsMs(a.updatedAt)))), []);

  const usulan = useMemo(() => lessons.filter((l) => l.status === 'usulan').length, [lessons]);
  const sections = [
    { id: 'latihan', label: 'Latihan', icon: MessageSquare },
    { id: 'pengetahuan', label: 'Pengetahuan toko', icon: Settings2 },
    { id: 'pelajaran', label: `Pelajaran${usulan ? ` (${usulan} usulan)` : ''}`, icon: BookOpen },
    { id: 'percakapan', label: 'Percakapan', icon: Bot },
  ] as const;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold">CS AI · LINE Kangenbukuindo CS</h1>
          <p className="text-sm text-neutral-500">
            {settings?.enabled === false ? 'AI nonaktif' : settings?.mode === 'draft' ? 'Mode draft' : 'Auto balas'} · Claude Sonnet 5.5 · {lessons.filter((l) => l.status === 'aktif').length} pelajaran aktif
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button key={s.id} className={section === s.id ? btnPrimary : btnGhost} onClick={() => setSection(s.id)}>
            <s.icon className="h-4 w-4" /> {s.label}
          </button>
        ))}
      </div>
      {section === 'latihan' && <PracticePanel />}
      {section === 'pengetahuan' && <KnowledgePanel settings={settings} />}
      {section === 'pelajaran' && <LessonsPanel lessons={lessons} />}
      {section === 'percakapan' && <ConversationsPanel chats={chats} />}
    </div>
  );
}
