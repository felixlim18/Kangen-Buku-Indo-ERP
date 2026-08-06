import { getNextJournalId } from '../lib/journalUtils';
import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  onSnapshot,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  setDoc,
  Timestamp
} from 'firebase/firestore';
import { SalesOrder, BusinessPartner, PaymentBatch, JournalEntry, CoaAccount } from '../types';
import { formatNTD, formatIDR } from '../lib/decimal-utils';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Wallet,
  X,
  Undo2,
  Download,
  Plus,
  Users
} from 'lucide-react';
import { loadJsPDF } from '../lib/lazy-libs';
import { useAuth } from '../lib/auth-context';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../lib/use-modal-esc';

export const BusinessPartnerTab: React.FC = () => {
  const { sidebarHidden } = useSidebar();
  const { profile } = useAuth();
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [paymentBatches, setPaymentBatches] = useState<PaymentBatch[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  
  // Modals
  const [isAddPartnerOpen, setIsAddPartnerOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  useModalEsc(isAddPartnerOpen, () => setIsAddPartnerOpen(false));
  useModalEsc(isPaymentModalOpen, () => setIsPaymentModalOpen(false));
  
  // Add partner state
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerRate, setNewPartnerRate] = useState('');
  const [addPartnerError, setAddPartnerError] = useState('');
  
  // Payment modal state
  const [bulkMode, setBulkMode] = useState<'persen' | 'nominal'>('persen');
  const [bulkInput, setBulkInput] = useState('');
  const [modalChecked, setModalChecked] = useState<Set<string>>(new Set());
  const [modalOverrides, setModalOverrides] = useState<Map<string, { mode: 'persen' | 'nominal', value: number }>>(new Map());
  const [selectedAkun, setSelectedAkun] = useState('Cash: NTD');

  useEffect(() => {
    const unsubPartners = onSnapshot(collection(db, 'partners'), (snap) => {
      const list: BusinessPartner[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as BusinessPartner));
      setPartners(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    const unsubOrders = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const list: SalesOrder[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as SalesOrder));
      setSalesOrders(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    const unsubBatches = onSnapshot(collection(db, 'paymentBatches'), (snap) => {
      const list: PaymentBatch[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as PaymentBatch));
      setPaymentBatches(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    const unsubCoa = onSnapshot(collection(db, 'coa'), (snap) => {
      const list: CoaAccount[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as CoaAccount));
      setCoaAccounts(list);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    return () => {
      unsubPartners();
      unsubOrders();
      unsubBatches();
      unsubCoa();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const AVATAR_COLORS = ["#6B4C9A", "#2B5A9E", "#3D7A4F", "#B67F2A", "#B5502F", "#52397A"];
  const avatarColor = (name: string) => {
    let s = 0; 
    for (let i=0; i<name.length; i++) s += name.charCodeAt(i); 
    return AVATAR_COLORS[s % AVATAR_COLORS.length]; 
  };
  const initials = (name: string) => name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  const soFor = (pid: string) => salesOrders.filter(s => s.partnerId === pid);
  const komisiOf = (so: SalesOrder) => {
    if (so.paidKomisi !== undefined) return so.paidKomisi;
    const val = so.komisiValue || 0;
    return so.komisiMode === 'nominal' ? val : (so.totalPrice * (val / 100));
  };
  const komisiLabel = (mode?: string, val?: number) => {
    if (!val && val !== 0) return '-';
    return mode === 'nominal' ? `${formatNTD(val)} (flat)` : `${val}%`;
  };

  const siapDibayar = (pid: string) => soFor(pid).filter(s => s.status === 'completed' && !s.dibayar);
  const dalamProses = (pid: string) => soFor(pid).filter(s => s.status === 'shipped' || (s.status !== 'completed' && s.status !== 'cancelled' && s.status !== 'returned' && s.status !== 'draft'));
  const batchesFor = (pid: string) => paymentBatches.filter(b => b.partnerId === pid);

  const totalBukuTerjual = (pid: string) => soFor(pid).filter(s => s.status === 'completed').reduce((s, o) => s + (o.items?.reduce((a,b)=>a+b.qty,0)||0), 0);
  const totalOmzet = (pid: string) => soFor(pid).filter(s => s.status === 'completed').reduce((s, o) => s + o.totalPrice, 0);
  const komisiBelumDibayar = (pid: string) => siapDibayar(pid).reduce((s, o) => s + komisiOf(o), 0);
  const komisiSudahDibayar = (pid: string) => batchesFor(pid).reduce((s, b) => s + b.totalKomisi, 0);

  const statusClass = (st: string) => {
    if (st === 'completed') return 'bg-emerald-100 text-emerald-700';
    if (st === 'shipped') return 'bg-blue-100 text-blue-700';
    return 'bg-amber-100 text-amber-700';
  };

  const sortedPartners = useMemo(() => {
    return [...partners].sort((a, b) => komisiBelumDibayar(b.id) - komisiBelumDibayar(a.id));
  }, [partners, salesOrders]);

  const activePartner = partners.find(p => p.id === activePartnerId);

  // ---------- Action Handlers ----------
  const handleAddPartner = async () => {
    if (!newPartnerName.trim()) { setAddPartnerError("Nama partner wajib diisi."); return; }
    if (partners.some(p => p.name.toLowerCase() === newPartnerName.trim().toLowerCase())) {
      setAddPartnerError("Partner dengan nama ini sudah terdaftar."); return;
    }
    const val = 0;

    const id = doc(collection(db, 'partners')).id;
    try {
      await setDoc(doc(db, 'partners', id), {
        id,
        name: newPartnerName.trim(),
        komisiMode: 'persen',
        komisiValue: val,
        profitSharePercent: val // legacy compat
      });
      setIsAddPartnerOpen(false);
      showToast(`Partner "${newPartnerName}" berhasil ditambahkan.`);
    } catch (e) {
      console.error(e);
      setAddPartnerError("Terjadi kesalahan.");
    }
  };

  const getOverride = (so: SalesOrder) => {
    const o = modalOverrides.get(so.id);
    if (o) return o;
    return { mode: so.komisiMode || activePartner?.komisiMode || 'persen', value: so.komisiValue || activePartner?.komisiValue || 0 };
  };
  
  const effectiveKomisi = (so: SalesOrder) => {
    const o = getOverride(so);
    return o.mode === 'persen' ? so.totalPrice * (o.value / 100) : o.value;
  };

  const handleBulkApply = () => {
    const val = parseFloat(bulkInput);
    if (!isFinite(val) || val < 0) { showToast("Isi angka komisi yang valid dulu."); return; }
    const siap = siapDibayar(activePartnerId!);
    const newOverrides = new Map(modalOverrides);
    siap.forEach(so => newOverrides.set(so.id, { mode: bulkMode, value: val }));
    setModalOverrides(newOverrides);
    showToast(`Komisi ${bulkMode === "persen" ? val + "%" : formatNTD(val)} diterapkan ke ${siap.length} SO.`);
  };

  const handleModalCheckAll = (checked: boolean) => {
    const siap = siapDibayar(activePartnerId!);
    setModalChecked(checked ? new Set(siap.map(s => s.id)) : new Set());
  };

  const toggleModalItem = (soId: string, checked: boolean) => {
    const newChecked = new Set(modalChecked);
    if (checked) newChecked.add(soId);
    else newChecked.delete(soId);
    setModalChecked(newChecked);
  };

  const updateModalOverride = (soId: string, mode: 'persen'|'nominal', inputVal?: string) => {
    const so = salesOrders.find(s => s.id === soId)!;
    const current = getOverride(so);
    let newVal = current.value;
    
    if (inputVal !== undefined) {
      newVal = parseFloat(inputVal) || 0;
    } else {
      if (mode !== current.mode) {
        newVal = mode === "nominal"
          ? Number(effectiveKomisi(so).toFixed(2))
          : (so.komisiMode === "persen" ? (so.komisiValue||0) : Number((((so.komisiValue||0) / so.totalPrice) * 100).toFixed(2)));
      }
    }
    const newOverrides = new Map(modalOverrides);
    newOverrides.set(soId, { mode, value: newVal });
    setModalOverrides(newOverrides);
  };

  const modalTotal = [...modalChecked].reduce((s, id) => {
    const so = salesOrders.find(x => x.id === id);
    return s + (so ? effectiveKomisi(so) : 0);
  }, 0);

  const handleConfirmPayment = async () => {
    if (!activePartner || modalChecked.size === 0) return;
    const soIds = [...modalChecked];
    const total = modalTotal;
    
    // Generate PB doc num
    const today = new Date();
    const dateStr = today.getFullYear().toString().slice(-2) + 
                    (today.getMonth() + 1).toString().padStart(2, '0') + 
                    today.getDate().toString().padStart(2, '0');
    
    const todaysBatches = paymentBatches.filter(b => b.tanggal === today.toISOString().slice(0, 10));
    const seq = String(todaysBatches.length + 1).padStart(2, '0');
    const batchId = `PB${dateStr}${seq}`;
    const dateOnly = today.toISOString().slice(0, 10);

    const batch = writeBatch(db);
    
    // 1. Update SOs
    soIds.forEach(id => {
      const so = salesOrders.find(x => x.id === id)!;
      const ek = effectiveKomisi(so);
      const o = getOverride(so);
      batch.update(doc(db, 'salesOrders', id), {
        dibayar: true,
        batchId,
        paidKomisi: Number(ek.toFixed(2)),
        komisiMode: o.mode,
        komisiValue: o.value
      });
    });

    // 2. Create Payment Batch
    const batchDocRef = doc(collection(db, 'paymentBatches'));
    batch.set(batchDocRef, {
      id: batchId,
      partnerId: activePartner.id,
      tanggal: dateOnly,
      soIds,
      totalKomisi: total,
      akun: selectedAkun,
      createdAt: Timestamp.now()
    });

    // 3. Create Journal
    const isIDR = selectedAkun.includes('Rupiah');
    const creditAcc = isIDR ? '1102' : '1101'; // 1102 Rupiah, 1101 NTD
    const creditName = isIDR ? 'Cash:IDR' : 'Cash:NTD';
    // Debit Beban Komisi Penjualan (assuming 5320, we can use name Beban Komisi Penjualan)
    // Find account by name or just use text if code doesn't exist
    
    const jId = await getNextJournalId(new Date().toISOString().split('T')[0]);
    batch.set(doc(db, 'journalEntries', jId), {
      id: jId,
      date: Timestamp.now(),
      description: `[${batchId}] Pembayar Komisi ke ${activePartner.name}`,
      lines: [
        { account: 'Beban Komisi Penjualan', accountCode: '5320', debit: total, credit: 0 },
        { account: creditName, accountCode: creditAcc, debit: 0, credit: total }
      ],
      refType: 'partner_payment',
      refId: batchId,
      isAuto: true
    });

    try {
      await batch.commit();
      setIsPaymentModalOpen(false);
      showToast(`Komisi ${formatNTD(total)} berhasil dibayar ke ${activePartner.name}.`);
    } catch (e) {
      console.error(e);
      showToast('Gagal memproses pembayaran.');
    }
  };

  const handleReverseBatch = async (batchId: string) => {
    if (!confirm("Batalkan seluruh pembayaran di batch ini? Semua SO di dalamnya akan kembali ke status Siap Dibayar dan jurnal akan dihapus.")) return;
    const batchData = paymentBatches.find(b => b.id === batchId);
    if (!batchData) return;

    try {
      const firestoreBatch = writeBatch(db);
      
      // Revert SOs
      batchData.soIds.forEach(id => {
        firestoreBatch.update(doc(db, 'salesOrders', id), {
          dibayar: false,
          batchId: null
        });
      });

      // Delete Batch
      firestoreBatch.delete(doc(db, 'paymentBatches', batchId));

      // Fetch and delete Journal
      const journalQ = query(collection(db, 'journalEntries'), where('refId', '==', batchId), where('refType', '==', 'partner_payment'));
      const journalSnap = await getDocs(journalQ);
      journalSnap.forEach(d => {
        firestoreBatch.delete(doc(db, 'journalEntries', d.id));
      });

      await firestoreBatch.commit();
      showToast(`Pembayaran batch ${batchId} berhasil dibatalkan.`);
    } catch (e) {
      console.error(e);
      showToast('Gagal membatalkan pembayaran.');
    }
  };

  const printReceipt = async (batchId: string) => {
    const batchData = paymentBatches.find(b => b.id === batchId);
    if (!batchData) return;
    const p = partners.find(x => x.id === batchData.partnerId);
    if (!p) return;

    const jsPDF = await loadJsPDF();
    const docPDF = new jsPDF({ unit: "mm", format: "a5" });
    const pageW = 148, marginX = 16;
    let y = 20;

    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(16);
    docPDF.setTextColor(107, 76, 154);
    docPDF.text("Bukti Pembayaran Komisi", pageW / 2, y, { align: "center" });
    y += 6;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(9.5);
    docPDF.setTextColor(114, 108, 130);
    docPDF.text("KangenBukuIndo", pageW / 2, y, { align: "center" });
    y += 10;

    docPDF.setDrawColor(228, 225, 236);
    docPDF.line(marginX, y, pageW - marginX, y);
    y += 8;

    docPDF.setFontSize(10);
    docPDF.setTextColor(32, 28, 41);
    docPDF.setFont("helvetica", "bold");
    docPDF.text("Partner:", marginX, y);
    docPDF.setFont("helvetica", "normal");
    docPDF.text(p.name, marginX + 22, y);
    y += 6;
    docPDF.setFont("helvetica", "bold");
    docPDF.text("No. Batch:", marginX, y);
    docPDF.setFont("helvetica", "normal");
    docPDF.text(batchData.id, marginX + 22, y);
    y += 6;
    docPDF.setFont("helvetica", "bold");
    docPDF.text("Tanggal:", marginX, y);
    docPDF.setFont("helvetica", "normal");
    docPDF.text(batchData.tanggal, marginX + 22, y);
    y += 6;
    docPDF.setFont("helvetica", "bold");
    docPDF.text("Dibayar dari:", marginX, y);
    docPDF.setFont("helvetica", "normal");
    docPDF.text(batchData.akun, marginX + 22, y);
    y += 10;

    docPDF.setFillColor(237, 229, 245);
    docPDF.rect(marginX, y, pageW - marginX * 2, 8, "F");
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(9);
    docPDF.text("NO. SO", marginX + 2, y + 5.5);
    docPDF.text("KOMISI", pageW - marginX - 2, y + 5.5, { align: "right" });
    y += 8;

    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(9.5);
    batchData.soIds.forEach((id) => {
      const so = salesOrders.find(s => s.id === id);
      const kom = so?.paidKomisi || 0;
      docPDF.text(so?.orderCode || id, marginX + 2, y + 6);
      docPDF.text(`NT$ ${kom.toFixed(2)}`, pageW - marginX - 2, y + 6, { align: "right" });
      y += 8;
      docPDF.setDrawColor(228, 225, 236);
      docPDF.line(marginX, y, pageW - marginX, y);
    });

    y += 8;
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(12);
    docPDF.setTextColor(107, 76, 154);
    docPDF.text("Total Komisi:", marginX, y);
    docPDF.text(`NT$ ${batchData.totalKomisi.toFixed(2)}`, pageW - marginX, y, { align: "right" });

    docPDF.save(`Bukti-Komisi-${p.name.replace(/\s+/g, "")}-${batchData.id}.pdf`);
  };

  // UI rendering
  return (
    <div className="max-w-6xl mx-auto pb-20 font-sans" style={{ fontFamily: "'Lexend', sans-serif" }}>
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-5 py-3 rounded-xl text-sm shadow-2xl z-50 transition-all duration-300">
          {toastMsg}
        </div>
      )}

      {view === 'list' && (
        <div>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex flex-wrap gap-5 items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-500" /> Business Partners / Reseller
              </h2>
            </div>
            <div className="flex gap-8 flex-wrap">
              <div>
                <span className="block text-[10px] font-semibold tracking-widest uppercase text-neutral-400 mb-1">Total Partner</span>
                <span className="block font-bold text-lg">{partners.length}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold tracking-widest uppercase text-neutral-400 mb-1">Komisi Belum Dibayar</span>
                <span className="block font-bold text-lg text-[#6B4C9A] font-mono">{formatNTD(partners.reduce((s,p) => s + komisiBelumDibayar(p.id), 0))}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold tracking-widest uppercase text-neutral-400 mb-1">Komisi Sudah Dibayar</span>
                <span className="block font-bold text-lg font-mono">{formatNTD(partners.reduce((s,p) => s + komisiSudahDibayar(p.id), 0))}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <span className="text-xs text-neutral-400">Diurutkan berdasarkan komisi belum dibayar terbesar</span>
            <button 
              onClick={() => {
                setNewPartnerName(''); setNewPartnerRate(''); setAddPartnerError('');
                setIsAddPartnerOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-[#6B4C9A] hover:bg-[#52397A] text-white border-none py-3 px-5 rounded-xl text-sm font-bold cursor-pointer whitespace-nowrap transition"
            >
              <Plus className="w-4 h-4" /> Tambah Partner
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {sortedPartners.map(p => (
              <div 
                key={p.id} 
                onClick={() => { setActivePartnerId(p.id); setView('detail'); }}
                className="flex items-center gap-3.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[13px] p-3.5 px-4 cursor-pointer hover:border-[#6B4C9A] hover:shadow-lg hover:shadow-[#6B4C9A]/10 transition"
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{backgroundColor: avatarColor(p.name)}}>
                  {initials(p.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold">{p.name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5 font-mono">{totalBukuTerjual(p.id)} buku terjual · Omzet {formatNTD(totalOmzet(p.id))}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[17px] font-bold text-[#6B4C9A] font-mono">{formatNTD(komisiBelumDibayar(p.id))}</div>
                  <div className="text-[11px] text-neutral-400 mt-0.5 font-mono">Sudah dibayar: {formatNTD(komisiSudahDibayar(p.id))}</div>
                </div>
                <ChevronRight className="text-neutral-400 w-5 h-5 shrink-0 ml-1" />
              </div>
            ))}
            {sortedPartners.length === 0 && (
              <div className="text-center py-10 text-neutral-400 text-sm border border-dashed border-neutral-300 dark:border-neutral-800 rounded-xl">
                Belum ada partner terdaftar.
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'detail' && activePartner && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <button 
              onClick={() => setView('list')}
              className="inline-flex items-center gap-1.5 bg-transparent border-none text-neutral-500 hover:text-[#6B4C9A] text-sm font-semibold cursor-pointer p-2 -ml-2"
            >
              <ChevronLeft className="w-4 h-4" /> Kembali ke Daftar Partner
            </button>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 px-6 flex items-center justify-between gap-4 mb-5 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0" style={{backgroundColor: avatarColor(activePartner.name)}}>
                {initials(activePartner.name)}
              </div>
              <div>
                <div className="text-lg font-bold">{activePartner.name}</div>
                <span className="inline-flex items-center gap-1 bg-[#EDE5F5] text-[#52397A] dark:bg-[#52397A]/30 dark:text-[#6B4C9A] text-[11px] font-bold px-2.5 py-0.5 rounded-full mt-1 font-mono">
                  Komisi {komisiLabel(activePartner.komisiMode, activePartner.komisiValue || activePartner.profitSharePercent)}
                </span>
              </div>
            </div>
            <div className="flex gap-6">
              <div><span className="block text-[10px] font-semibold tracking-widest uppercase text-neutral-400 mb-1">Buku Terjual</span><span className="block font-bold text-lg font-mono">{totalBukuTerjual(activePartner.id)}</span></div>
              <div><span className="block text-[10px] font-semibold tracking-widest uppercase text-neutral-400 mb-1">Omzet</span><span className="block font-bold text-lg font-mono">{formatNTD(totalOmzet(activePartner.id))}</span></div>
              <div><span className="block text-[10px] font-semibold tracking-widest uppercase text-neutral-400 mb-1">Komisi Belum Dibayar</span><span className="block font-bold text-lg text-[#6B4C9A] font-mono">{formatNTD(komisiBelumDibayar(activePartner.id))}</span></div>
            </div>
            <button 
              disabled={siapDibayar(activePartner.id).length === 0}
              onClick={() => {
                setModalChecked(new Set());
                setModalOverrides(new Map());
                setBulkMode('persen');
                setBulkInput('');
                setIsPaymentModalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-[#6B4C9A] hover:bg-[#52397A] disabled:bg-neutral-200 disabled:text-neutral-400 text-white border-none py-3 px-5 rounded-xl text-sm font-bold cursor-pointer whitespace-nowrap transition"
            >
              <Wallet className="w-4 h-4" /> Bayar Komisi
            </button>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden mb-4">
            <div className="flex items-center gap-2.5 p-3.5 px-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
              <h3 className="m-0 text-sm font-bold">Siap Dibayar</h3>
              <span className="text-[11px] text-neutral-400">{siapDibayar(activePartner.id).length} SO</span>
            </div>
            <div>
              {siapDibayar(activePartner.id).length === 0 ? (
                <div className="p-6 text-center text-neutral-400 text-sm">Belum ada SO Selesai yang siap dibayar.</div>
              ) : siapDibayar(activePartner.id).map((s, i) => (
                <div key={s.id} className={`grid grid-cols-5 gap-2.5 items-center p-3 px-5 text-sm ${i > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                  <div className="text-[#6B4C9A] font-semibold font-mono">{s.orderCode || s.id}</div>
                  <div className="font-mono text-neutral-600">{new Date(s.createdAt?.seconds * 1000).toISOString().slice(0,10)}</div>
                  <div className="font-mono text-neutral-600">{s.items?.reduce((a,b)=>a+b.qty,0)||0} pcs</div>
                  <div className="font-mono text-neutral-600">{formatNTD(s.totalPrice)}</div>
                  <div className="font-mono font-bold">{formatNTD(komisiOf(s))} <span className="text-neutral-400 font-normal">({komisiLabel(s.komisiMode || activePartner.komisiMode, s.komisiValue || activePartner.komisiValue)})</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden mb-4">
            <div className="flex items-center gap-2.5 p-3.5 px-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
              <h3 className="m-0 text-sm font-bold">Dalam Proses</h3>
              <span className="text-[11px] text-neutral-400">{dalamProses(activePartner.id).length} SO</span>
            </div>
            <div>
              {dalamProses(activePartner.id).length === 0 ? (
                <div className="p-6 text-center text-neutral-400 text-sm">Tidak ada SO dalam proses.</div>
              ) : dalamProses(activePartner.id).map((s, i) => (
                <div key={s.id} className={`grid grid-cols-5 gap-2.5 items-center p-3 px-5 text-sm ${i > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                  <div className="text-[#6B4C9A] font-semibold font-mono">{s.orderCode || s.id}</div>
                  <div className="font-mono text-neutral-600">{new Date(s.createdAt?.seconds * 1000).toISOString().slice(0,10)}</div>
                  <div className="font-mono text-neutral-600">{s.items?.reduce((a,b)=>a+b.qty,0)||0} pcs</div>
                  <div className="font-mono text-neutral-600">{formatNTD(s.totalPrice)}</div>
                  <div><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${statusClass(s.status)}`}><span className="w-1.5 h-1.5 rounded-full bg-current"></span>{s.status}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden mb-4">
            <div className="flex items-center gap-2.5 p-3.5 px-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
              <h3 className="m-0 text-sm font-bold">Sudah Dibayar</h3>
              <span className="text-[11px] text-neutral-400">{batchesFor(activePartner.id).length} batch</span>
            </div>
            <div>
              {batchesFor(activePartner.id).length === 0 ? (
                <div className="p-6 text-center text-neutral-400 text-sm">Belum ada histori pembayaran.</div>
              ) : batchesFor(activePartner.id).sort((a,b) => b.tanggal.localeCompare(a.tanggal)).map((b, i) => (
                <div key={b.id} className={`p-3.5 px-5 ${i > 0 ? 'border-t border-neutral-200 dark:border-neutral-800' : ''}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <span className="text-xs text-neutral-400 font-mono">{b.id} · {b.tanggal} · {b.akun}</span>
                    <span className="text-[15px] font-bold text-[#6B4C9A] font-mono">{formatNTD(b.totalKomisi)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {b.soIds.map(id => {
                      const soc = salesOrders.find(x => x.id === id);
                      return <span key={id} className="text-[11px] bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 rounded-full text-neutral-500 font-mono">{soc?.orderCode || id}</span>
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => printReceipt(b.id)} className="inline-flex items-center gap-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-[#6B4C9A] hover:text-[#6B4C9A] px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition">
                      <Download className="w-3.5 h-3.5" /> Cetak Bukti
                    </button>
                    <button onClick={() => handleReverseBatch(b.id)} className="inline-flex items-center gap-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-red-500 hover:border-red-600 hover:text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition">
                      <Undo2 className="w-3.5 h-3.5" /> Batalkan Pembayaran
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Partner Modal */}
      {isAddPartnerOpen && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-50')}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-[90%] max-w-sm flex flex-col overflow-hidden my-auto">
            <div className="flex items-center justify-between p-4 px-5 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="m-0 text-base font-bold">Tambah Partner Baru</h3>
              <button onClick={() => setIsAddPartnerOpen(false)} className="bg-transparent border-none text-neutral-400 hover:bg-red-50 hover:text-red-600 p-1.5 rounded-lg cursor-pointer transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="mb-3">
                <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Nama Partner *</label>
                <input 
                  value={newPartnerName} onChange={e=>setNewPartnerName(e.target.value)}
                  className="w-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#6B4C9A] focus:ring-2 focus:ring-[#6B4C9A]/20" 
                  placeholder="Contoh: Daniel Tanali" 
                />
              </div>

            </div>
            <div className="p-4 px-5 border-t border-neutral-200 dark:border-neutral-800">
              {addPartnerError && <p className="text-red-500 text-xs m-0 mb-2.5">{addPartnerError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsAddPartnerOpen(false)} className="bg-transparent border-none px-4 py-2 rounded-lg text-sm font-semibold text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer">Batal</button>
                <button onClick={handleAddPartner} className="bg-[#6B4C9A] hover:bg-[#52397A] text-white border-none px-4 py-2 rounded-lg text-sm font-bold cursor-pointer">Simpan Partner</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && activePartner && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-50')}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-[92%] max-w-lg max-h-[88vh] flex flex-col overflow-hidden my-auto">
            <div className="flex items-center justify-between p-4 px-5 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="m-0 text-base font-bold">Bayar Komisi — {activePartner.name}</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="bg-transparent border-none text-neutral-400 hover:bg-red-50 hover:text-red-600 p-1.5 rounded-lg cursor-pointer transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 px-5 overflow-y-auto flex-1">
              <div className="flex flex-col gap-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 border-l-[3px] border-l-[#6B4C9A] rounded-xl p-4 mb-4">
                <span className="text-[13.5px] font-bold">Terapkan komisi yang sama ke semua SO:</span>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg">
                    <button onClick={() => setBulkMode('persen')} className={`border-none text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer transition ${bulkMode==='persen'?'bg-white dark:bg-neutral-700 shadow text-[#6B4C9A]':'bg-transparent text-neutral-500'}`}>%</button>
                    <button onClick={() => setBulkMode('nominal')} className={`border-none text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer transition ${bulkMode==='nominal'?'bg-white dark:bg-neutral-700 shadow text-[#6B4C9A]':'bg-transparent text-neutral-500'}`}>NTD</button>
                  </div>
                  <input 
                    value={bulkInput} onChange={e=>setBulkInput(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-[108px] text-center font-bold text-lg p-2 border-2 border-[#6B4C9A] bg-[#EDE5F5] text-[#52397A] rounded-lg focus:outline-none focus:border-[#6B4C9A] font-mono"
                    placeholder="10" 
                  />
                  <button onClick={handleBulkApply} className="bg-[#6B4C9A] hover:bg-[#52397A] text-white border-none py-2.5 px-4 rounded-lg text-[13px] font-bold cursor-pointer whitespace-nowrap">Terapkan ke Semua</button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-neutral-500 mb-2.5">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 accent-[#6B4C9A] cursor-pointer"
                  checked={modalChecked.size > 0 && modalChecked.size === siapDibayar(activePartner.id).length}
                  onChange={(e) => handleModalCheckAll(e.target.checked)}
                /> Pilih Semua
              </div>
              
              <div>
                {siapDibayar(activePartner.id).map((s, i) => {
                  const o = getOverride(s);
                  return (
                    <div key={s.id} className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 accent-[#6B4C9A] cursor-pointer"
                        checked={modalChecked.has(s.id)}
                        onChange={(e) => toggleModalItem(s.id, e.target.checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#6B4C9A] font-semibold font-mono">{s.orderCode || s.id}</div>
                        <div className="text-[11.5px] text-neutral-400 font-mono">{new Date(s.createdAt?.seconds * 1000).toISOString().slice(0,10)} · {s.items?.reduce((a,b)=>a+b.qty,0)||0} pcs · {formatNTD(s.totalPrice)}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg">
                          <button onClick={() => updateModalOverride(s.id, 'persen')} className={`border-none text-[11px] font-semibold px-2.5 py-1 rounded-md cursor-pointer transition ${o.mode==='persen'?'bg-white dark:bg-neutral-700 shadow text-[#6B4C9A]':'bg-transparent text-neutral-500'}`}>%</button>
                          <button onClick={() => updateModalOverride(s.id, 'nominal')} className={`border-none text-[11px] font-semibold px-2.5 py-1 rounded-md cursor-pointer transition ${o.mode==='nominal'?'bg-white dark:bg-neutral-700 shadow text-[#6B4C9A]':'bg-transparent text-neutral-500'}`}>NTD</button>
                        </div>
                        <input 
                          value={o.value} 
                          onChange={(e) => updateModalOverride(s.id, o.mode, e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-16 text-center text-[12.5px] p-1.5 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-[#6B4C9A] font-semibold font-mono bg-white dark:bg-neutral-900"
                        />
                      </div>
                      <div className="w-20 text-right text-[13px] font-bold font-mono shrink-0">{formatNTD(effectiveKomisi(s))}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-4 px-5 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-xs text-neutral-500 font-semibold">Total Komisi Dipilih</span>
                <span className="text-[20px] font-bold text-[#6B4C9A] font-mono">{formatNTD(modalTotal)}</span>
              </div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Bayar Dari Akun</label>
              <div className="relative mb-3">
                <select 
                  value={selectedAkun} onChange={e=>setSelectedAkun(e.target.value)}
                  className="w-full appearance-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 rounded-lg p-2 px-3 text-[13px] focus:outline-none focus:border-[#6B4C9A] cursor-pointer"
                >
                  <option>Cash: NTD</option>
                  <option>Cash: Rupiah</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsPaymentModalOpen(false)} className="bg-transparent border-none px-4 py-2 rounded-lg text-[13px] font-semibold text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer">Batal</button>
                <button disabled={modalChecked.size === 0} onClick={handleConfirmPayment} className="bg-[#6B4C9A] hover:bg-[#52397A] disabled:bg-neutral-200 disabled:text-neutral-400 text-white border-none px-4 py-2 rounded-lg text-[13px] font-bold cursor-pointer transition">Konfirmasi Pembayaran</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BusinessPartnerTab;
