import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, addDoc, doc, updateDoc, deleteDoc, Timestamp, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { JournalEntry, JournalEntryLine } from '../types';
import { formatNumber, cleanCommas } from '../lib/decimal-utils';
import { AUTO_ACCOUNTS, ensureAutoAccountExists, getLiveAutoAccounts, AutoAccount } from '../lib/journalAuto';
import { Receipt, X, Trash2, Edit2, Search, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { isPeriodClosed } from '../lib/period-closing-utils';

// Categories mapping for UI
const CATEGORIES = {
  admin:   { id: 'admin', label: 'Biaya Admin Bank', color: '#3F5875', tint: '#EAEFF5', darkTint: 'rgba(63, 88, 117, 0.2)' },
  csr:     { id: 'csr', label: 'Sumbangan & CSR', color: '#C15A42', tint: '#F9EAE4', darkTint: 'rgba(193, 90, 66, 0.2)' },
  piutang: { id: 'piutang', label: 'Kerugian Piutang Tak Tertagih', color: '#A9503B', tint: '#F6E8E4', darkTint: 'rgba(169, 80, 59, 0.2)' },
  pajak:   { id: 'pajak', label: 'Pajak & Retribusi', color: '#0F8F7A', tint: '#E3F4F0', darkTint: 'rgba(15, 143, 122, 0.2)' },
  lain:    { id: 'lain', label: 'Lain-lain', color: '#B4790C', tint: '#FBF0DA', darkTint: 'rgba(180, 121, 12, 0.2)' },
};

interface BebanLainnyaEntry {
  id: string;
  tanggal: string;
  kategori: string;
  keterangan: string;
  dibayarViaCode: string;
  dibayarViaName: string;
  currency: 'NTD' | 'IDR';
  amount: number;
  amountNTD: number; // cents
  exchangeRate: number;
  journalId: string;
  createdAt: any;
}

const formatNTD = (cents: number) => `NT$ ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatIDR = (val: number) => `Rp ${Math.round(val).toLocaleString('en-US')}`;

const BebanLainnyaTab: React.FC = () => {
  const [entries, setEntries] = useState<BebanLainnyaEntry[]>([]);
  const [closedPeriods, setClosedPeriods] = useState<string[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<{ code: string; name: string }[]>([]);
  
  // Date/Month
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  
  // UI States
  const [activeFilter, setActiveFilter] = useState('semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string, journalId: string, desc: string} | null>(null);

  // Form States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTanggal, setFormTanggal] = useState('');
  const [formKategori, setFormKategori] = useState('admin');
  const [formKeterangan, setFormKeterangan] = useState('');
  const [formDibayarVia, setFormDibayarVia] = useState('');
  const [formCurrency, setFormCurrency] = useState<'NTD' | 'IDR'>('NTD');
  const [formAmountRaw, setFormAmountRaw] = useState('');
  const [formFxRateRaw, setFormFxRateRaw] = useState('561');

  // Load Data
  useEffect(() => {
    const y = currentDate.getFullYear();
    const m = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const startStr = `${y}-${m}-01`;
    const endStr = `${y}-${m}-31`;

    const unsub = onSnapshot(collection(db, 'bebanLainnya'), (snap) => {
      const data: BebanLainnyaEntry[] = [];
      snap.forEach(d => {
        const item = { id: d.id, ...d.data() } as BebanLainnyaEntry;
        if (item.tanggal >= startStr && item.tanggal <= endStr) {
          data.push(item);
        }
      });
      data.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setEntries(data);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    return () => unsub();
  }, [currentDate]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodClosings'), (snap) => {
      setClosedPeriods(snap.docs.map(d => d.id));
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Fetch Kas/Bank + Piutang Usaha
    const fetchCoa = async () => {
      const snap = await getDocs(collection(db, 'coa'));
      const accs: { code: string; name: string }[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.code && data.name) {
          if ((data.code.startsWith('110') && data.code !== '1100') || data.code === '1110' || data.type === 'Kas & Bank' || data.name.toLowerCase().includes('bank')) {
            accs.push({ code: data.code, name: data.name });
          }
        }
      });
      accs.sort((a, b) => a.code.localeCompare(b.code));
      setCoaAccounts(accs);
    };
    fetchCoa();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // Auto-calculated NTD preview
  const formNtdPreview = useMemo(() => {
    const amountVal = parseFloat(cleanCommas(formAmountRaw)) || 0;
    if (formCurrency === 'NTD') return amountVal;
    const rate = parseFloat(cleanCommas(formFxRateRaw)) || 561;
    return rate > 0 ? amountVal / rate : 0;
  }, [formAmountRaw, formCurrency, formFxRateRaw]);

  const handleOpenAdd = () => {
    const today = new Date().toISOString().slice(0, 10);
    setFormTanggal(today);
    setFormKategori('admin');
    setFormKeterangan('');
    setFormDibayarVia(coaAccounts.length > 0 ? `${coaAccounts[0].code} - ${coaAccounts[0].name}` : '1101 - Cash: NTD');
    setFormCurrency('NTD');
    setFormAmountRaw('');
    setFormFxRateRaw('561');
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (entry: BebanLainnyaEntry) => {
    setFormTanggal(entry.tanggal);
    setFormKategori(entry.kategori);
    setFormKeterangan(entry.keterangan);
    setFormDibayarVia(`${entry.dibayarViaCode} - ${entry.dibayarViaName}`);
    setFormCurrency(entry.currency);
    setFormAmountRaw(String(entry.amount));
    if (entry.currency === 'IDR') {
      const rate = entry.exchangeRate > 0 ? Math.round(1 / entry.exchangeRate) : 561;
      setFormFxRateRaw(String(rate));
    } else {
      setFormFxRateRaw('561');
    }
    setEditingId(entry.id);
    setIsModalOpen(true);
  };

  const formatInputWithCommas = (val: string) => {
    const cleaned = val.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    let intPart = parts[0].replace(/^0+(?=\d)/, '');
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? `${intPart}.${parts.slice(1).join('').slice(0, 2)}` : intPart;
  };

  const handleSubmit = async () => {
    if (!formTanggal || !formKeterangan.trim() || !formDibayarVia) {
      alert("Harap lengkapi semua field yang wajib.");
      return;
    }
    
    if (isPeriodClosed(formTanggal, closedPeriods)) {
      alert(`Periode untuk tanggal ${formTanggal} sudah ditutup. Tidak dapat mengubah jurnal.`);
      return;
    }

    const amountVal = parseFloat(cleanCommas(formAmountRaw));
    if (!amountVal || amountVal <= 0) {
      alert("Nominal harus lebih dari 0.");
      return;
    }

    let rateToNtd = 1;
    let amountNTDCents = Math.round(amountVal * 100);

    if (formCurrency === 'IDR') {
      const rateRpPerNtd = parseFloat(cleanCommas(formFxRateRaw));
      if (!rateRpPerNtd || rateRpPerNtd <= 0) {
        alert("Kurs Rp/NTD tidak valid.");
        return;
      }
      rateToNtd = 1 / rateRpPerNtd;
      amountNTDCents = Math.round((amountVal / rateRpPerNtd) * 100);
    }

    setIsSubmitting(true);
    try {
      await ensureAutoAccountExists(AUTO_ACCOUNTS.BEBAN_LAIN_LAIN);
      const [accCode, ...accNameParts] = formDibayarVia.split(' - ');
      const accName = accNameParts.join(' - ') || 'Account';

      const batch = writeBatch(db);
      
      const line2: JournalEntryLine = {
        account: accName,
        accountCode: accCode,
        debit: 0,
        credit: amountNTDCents
      };
      
      if (formCurrency === 'IDR') {
        line2.originalCurrency = 'IDR';
        line2.originalCreditIDR = amountVal;
      }

      const journalLines: JournalEntryLine[] = [
        {
          account: AUTO_ACCOUNTS.BEBAN_LAIN_LAIN.name,
          accountCode: AUTO_ACCOUNTS.BEBAN_LAIN_LAIN.code,
          debit: amountNTDCents,
          credit: 0
        },
        line2
      ];

      const journalData = {
        date: formTanggal,
        description: `Beban Lain-lain (${CATEGORIES[formKategori as keyof typeof CATEGORIES].label}): ${formKeterangan}`,
        lines: journalLines,
        refType: 'beban_lainnya',
        updatedAt: Timestamp.now()
      };

      if (editingId) {
        // Find existing to get journalId
        const existingEntry = entries.find(e => e.id === editingId);
        if (!existingEntry) throw new Error("Data tidak ditemukan");
        
        if (isPeriodClosed(existingEntry.tanggal, closedPeriods)) {
          alert(`Periode awal data ini sudah ditutup. Tidak dapat diubah.`);
          setIsSubmitting(false);
          return;
        }

        const journalRef = doc(db, 'journalEntries', existingEntry.journalId);
        batch.update(journalRef, journalData);

        const bebanRef = doc(db, 'bebanLainnya', editingId);
        batch.update(bebanRef, {
          tanggal: formTanggal,
          kategori: formKategori,
          keterangan: formKeterangan,
          dibayarViaCode: accCode,
          dibayarViaName: accName,
          currency: formCurrency,
          amount: amountVal,
          amountNTD: amountNTDCents,
          exchangeRate: rateToNtd,
          updatedAt: Timestamp.now()
        });
        
        await batch.commit();
        showToast("Beban berhasil diperbarui.");
      } else {
        const journalRef = doc(collection(db, 'journalEntries'));
        batch.set(journalRef, {
          ...journalData,
          id: journalRef.id,
          refId: 'pending', // Will update below
          createdAt: Timestamp.now()
        });

        const bebanRef = doc(collection(db, 'bebanLainnya'));
        batch.set(bebanRef, {
          tanggal: formTanggal,
          kategori: formKategori,
          keterangan: formKeterangan,
          dibayarViaCode: accCode,
          dibayarViaName: accName,
          currency: formCurrency,
          amount: amountVal,
          amountNTD: amountNTDCents,
          exchangeRate: rateToNtd,
          journalId: journalRef.id,
          createdAt: Timestamp.now()
        });

        // Update refId
        batch.update(journalRef, { refId: bebanRef.id });
        await batch.commit();
        showToast("Beban berhasil dicatat.");
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      alert("Terjadi kesalahan: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const entry = entries.find(e => e.id === deleteConfirm.id);
    if (!entry) return;

    if (isPeriodClosed(entry.tanggal, closedPeriods)) {
      alert(`Periode untuk tanggal ${entry.tanggal} sudah ditutup. Tidak dapat dihapus.`);
      setDeleteConfirm(null);
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'bebanLainnya', entry.id));
      batch.delete(doc(db, 'journalEntries', entry.journalId));
      await batch.commit();
      
      showToast("Data beban telah dihapus.");
    } catch (err: any) {
      console.error(err);
      alert("Gagal menghapus data.");
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Compute filtered list
  const filteredList = useMemo(() => {
    let list = [...entries];
    if (activeFilter !== 'semua') {
      list = list.filter(e => e.kategori === activeFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => e.keterangan.toLowerCase().includes(q) || e.dibayarViaName.toLowerCase().includes(q));
    }
    return list;
  }, [entries, activeFilter, searchQuery]);

  // Compute totals
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.keys(CATEGORIES).forEach(k => totals[k] = 0);
    entries.forEach(e => {
      if (totals[e.kategori] !== undefined) totals[e.kategori] += e.amountNTD;
    });
    return totals;
  }, [entries]);

  const grandTotal = (Object.values(categoryTotals) as number[]).reduce((a, b) => a + b, 0);
  const filteredTotal = filteredList.reduce((a, b) => a + b.amountNTD, 0);
  const monthName = currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-neutral-900 dark:text-white m-0">Beban Lainnya</h1>
            <p className="text-[11px] md:text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Pencatatan beban di luar kategori operasional utama</p>
          </div>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="bg-orange-600 hover:bg-orange-700 text-white border-none py-2 px-4 rounded-full font-bold text-xs md:text-sm transition flex items-center justify-center gap-2"
        >
          <span>+ Tambah Beban</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm p-6">
          <div className="text-[10px] md:text-[11px] tracking-wider uppercase text-neutral-500 font-bold mb-4">Total Beban Lainnya · {monthName}</div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white font-numeric">{formatNTD(grandTotal)}</span>
          </div>
          <div className="text-xs text-neutral-500">{entries.length} transaksi tercatat</div>
        </div>
        
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm p-6">
          <div className="text-[10px] md:text-[11px] tracking-wider uppercase text-neutral-500 font-bold mb-4">Distribusi per Kategori</div>
          <div className="flex h-2.5 rounded-full overflow-hidden mb-4 bg-neutral-100 dark:bg-neutral-800">
            {Object.entries(CATEGORIES).map(([k, c]) => {
              const pct = grandTotal > 0 ? (categoryTotals[k] / grandTotal * 100) : 0;
              return pct > 0 ? <span key={k} style={{ width: `${pct}%`, background: c.color, transition: '0.3s ease' }}></span> : null;
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <div key={k} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }}></span>
                <span>{c.label}</span>
                <span className="font-bold text-neutral-900 dark:text-white ml-0.5 font-numeric">{formatNTD(categoryTotals[k])}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* List Card */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white m-0 mb-1">Riwayat Beban Lainnya</h2>
            <p className="text-[11px] md:text-xs text-neutral-500 dark:text-neutral-400 m-0">Semua entri beban lainnya yang sudah tercatat di jurnal.</p>
          </div>
          <div className="flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-full px-3 py-1.5 shrink-0 border border-neutral-200 dark:border-neutral-800">
            <button onClick={handlePrevMonth} className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[11px] md:text-xs font-bold text-neutral-700 dark:text-neutral-200 min-w-[100px] text-center">{monthName}</span>
            <button onClick={handleNextMonth} className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5 md:mx-0 md:px-0">
          <button 
            onClick={() => setActiveFilter('semua')}
            className={`whitespace-nowrap px-3.5 py-2 rounded-full font-bold text-[11px] border transition ${activeFilter === 'semua' ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white' : 'bg-white dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-800'}`}
          >
            Semua
          </button>
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <button 
              key={k}
              onClick={() => setActiveFilter(k)}
              className={`whitespace-nowrap flex items-center gap-2 px-3.5 py-2 rounded-full font-bold text-[11px] border transition ${activeFilter === k ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white' : 'bg-white dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-800'}`}
            >
              {activeFilter !== k && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }}></span>}
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl px-3.5 py-2.5 mb-2 border border-neutral-200 dark:border-neutral-800 transition-colors focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500/20">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input 
            type="text" 
            placeholder="Cari berdasarkan keterangan atau akun bayar..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="border-none bg-transparent outline-none flex-1 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400"
          />
        </div>
        
        <div className="text-[10px] md:text-[11px] text-neutral-500 mb-4 px-1">
          Menampilkan <b className="text-neutral-900 dark:text-white">{filteredList.length}</b> transaksi senilai <b className="text-neutral-900 dark:text-white font-numeric">{formatNTD(filteredTotal)}</b>
        </div>

        <div className="space-y-2.5">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 text-[11px] md:text-xs">
              Tidak ada transaksi yang cocok.
            </div>
          ) : (
            filteredList.map((entry) => {
              const cat = CATEGORIES[entry.kategori as keyof typeof CATEGORIES] || CATEGORIES.lain;
              const dt = new Date(entry.tanggal + 'T00:00:00');
              const d = dt.getDate().toString().padStart(2, '0');
              const m = dt.toLocaleString('id-ID', { month: 'short' });
              const y = dt.getFullYear();
              
              return (
                <div key={entry.id} className="relative flex items-center gap-3 md:gap-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-3 md:p-4 overflow-hidden group">
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: cat.color }}></div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ml-1 bg-neutral-100 dark:bg-neutral-800 text-lg">
                    🧾
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] md:text-[11px] text-neutral-400 mb-0.5">{d} {m} {y}</div>
                    <div className="text-xs md:text-[13px] font-bold text-neutral-900 dark:text-white mb-1.5 truncate" title={entry.keterangan}>{entry.keterangan}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold" style={{ background: cat.tint, color: cat.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color }}></span>
                        {cat.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-1.5 truncate">Dibayar via {entry.dibayarViaCode} - {entry.dibayarViaName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {entry.currency === 'IDR' && (
                      <div className="text-[10px] md:text-[11px] text-neutral-400 mb-0.5 font-numeric">{formatIDR(entry.amount)}</div>
                    )}
                    <div className="text-[13px] md:text-[15px] font-bold text-neutral-900 dark:text-white font-numeric">{formatNTD(entry.amountNTD)}</div>
                  </div>
                  <div className="hidden md:flex flex-col gap-1.5 shrink-0 ml-2">
                    <button onClick={() => handleEdit(entry)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white transition">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteConfirm({ id: entry.id, journalId: entry.journalId, desc: entry.keterangan })} className="w-7 h-7 flex items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Mobile Actions */}
                  <div className="md:hidden flex flex-col gap-1 shrink-0 ml-1">
                    <button onClick={() => handleEdit(entry)} className="p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/60 dark:bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-[440px] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[17px] font-bold text-neutral-900 dark:text-white m-0">
                  {editingId ? 'Edit Beban Lainnya' : '+ Tambah Beban Lainnya'}
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">Entri ini akan langsung dijurnal ke akun beban terkait (5500).</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Tanggal</label>
                <input 
                  type="date" 
                  value={formTanggal}
                  onChange={e => setFormTanggal(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-[13px] rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:border-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Kategori UI</label>
                <select 
                  value={formKategori}
                  onChange={e => setFormKategori(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-[13px] rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:border-orange-500 appearance-none"
                >
                  {Object.entries(CATEGORIES).map(([k, c]) => (
                    <option key={k} value={k}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Keterangan</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Biaya materai dokumen kontrak"
                  value={formKeterangan}
                  onChange={e => setFormKeterangan(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-[13px] rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Dibayar Via (Akun Kredit)</label>
                <select 
                  value={formDibayarVia}
                  onChange={e => setFormDibayarVia(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-[13px] rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:border-orange-500 appearance-none"
                >
                  {coaAccounts.map(acc => (
                    <option key={acc.code} value={`${acc.code} - ${acc.name}`}>{acc.code} - {acc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Currency</label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
                  <button type="button" onClick={() => setFormCurrency('NTD')} className={`py-2 text-[11px] font-bold rounded-lg transition ${formCurrency === 'NTD' ? 'bg-orange-600 text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200'}`}>NT$ (Cash NTD)</button>
                  <button type="button" onClick={() => setFormCurrency('IDR')} className={`py-2 text-[11px] font-bold rounded-lg transition ${formCurrency === 'IDR' ? 'bg-orange-600 text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200'}`}>Rp (Cash Rupiah)</button>
                </div>
              </div>

              {formCurrency === 'IDR' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Kurs Rp per 1 NT$</label>
                  <input 
                    type="text" 
                    value={formFxRateRaw}
                    onChange={e => setFormFxRateRaw(formatInputWithCommas(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-[13px] rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:border-orange-500 font-numeric"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Nominal ({formCurrency === 'IDR' ? 'Rupiah' : 'NT$'})</label>
                <input 
                  type="text" 
                  placeholder="0"
                  value={formAmountRaw}
                  onChange={e => setFormAmountRaw(formatInputWithCommas(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-[13px] rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:border-orange-500 font-numeric"
                />
                {formCurrency === 'IDR' && formNtdPreview > 0 && (
                  <p className="text-[10px] text-neutral-500 mt-1 font-numeric">Ekuivalen dengan {formatNTD(Math.round(formNtdPreview * 100))}</p>
                )}
              </div>
            </div>
            
            <div className="p-5 border-t border-neutral-100 dark:border-neutral-800 flex gap-3 shrink-0">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-bold text-[13px] rounded-xl transition"
              >
                Batal
              </button>
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-[13px] rounded-xl transition disabled:opacity-50"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan & Jurnal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-neutral-900/60 dark:bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-[360px] shadow-2xl p-6 text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-[17px] font-bold text-neutral-900 dark:text-white mb-2">Hapus Beban Lainnya?</h3>
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mb-6">
              Anda yakin ingin menghapus <b>{deleteConfirm.desc}</b>? Jurnal terkait (ID: {deleteConfirm.journalId.slice(-5)}) akan ikut dihapus permanen.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-bold text-[13px] rounded-xl">Batal</button>
              <button onClick={handleDeleteConfirm} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] rounded-xl">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-5 py-3 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl transition-all duration-300 z-50 ${toastMsg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
        <span className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
        {toastMsg}
      </div>

    </div>
  );
};

export default BebanLainnyaTab;
