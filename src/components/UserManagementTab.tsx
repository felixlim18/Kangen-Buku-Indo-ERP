import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../lib/use-modal-esc';
import { ShieldCheck, UserPlus, Settings2, Trash2, Power, X } from 'lucide-react';

// Define Modules and sub-features matching Sidebar/App tabs
const MODULES = [
  { key: 'dashboard', label: 'Dashboard', sub: [
      { key: 'dashboard.omset', label: 'Tab "Omset"' },
      { key: 'dashboard.peringatan', label: 'Tab "Peringatan"' },
      { key: 'dashboard.catatan', label: 'Tab "Catatan"' },
      { key: 'dashboard.harga', label: 'Tab "Harga Jual"' }
    ]
  },
  { key: 'daily-report', label: 'Laporan Harian', sub: [] },
  { key: 'catalog', label: 'Katalog Buku', sub: [
      { key: 'catalog.export', label: 'Tombol "Ekspor (CSV)"' },
      { key: 'catalog.import', label: 'Tombol "Impor (CSV)"' }
    ] 
  },
  { key: 'sales', label: 'Sales Orders', sub: [
      { key: 'sales.viewAmount', label: 'Lihat Nilai Penjualan', sensitive: true },
      { key: 'sales.proses', label: 'Tombol "Proses"', sensitive: true },
      { key: 'sales.prosesMassal', label: 'Fitur "Proses Massal"', sensitive: true },
      { key: 'sales.reverse', label: 'Tombol "Reverse"', sensitive: true }
    ]
  },
  { key: 'purchases', label: 'Purchase Orders', sub: [
      { key: 'purchases.viewAmount', label: 'Lihat Nilai Pembelian', sensitive: true },
      { key: 'purchases.import', label: 'Tombol "Import Excel / CSV"' },
      { key: 'purchases.receive', label: 'Tombol "Terima Barang"' }
    ] 
  },
  { key: 'freight-in', label: 'Freight In', sub: [] },
  { key: 'inventory', label: 'Stok & Value', sub: [
      { key: 'inventory.kontrol', label: 'Tab "Kontrol Stok"' },
      { key: 'inventory.laporan', label: 'Tab "Laporan Bulanan"', sensitive: true }
    ]
  },
  { key: 'bank-kas', label: 'Bank & Kas', sub: [
      { key: 'bank-kas.revaluasi', label: 'Revaluasi Kurs IDR', sensitive: true }
    ]
  },
  { key: 'income', label: 'Penerimaan Transfer', sub: [] },
  { key: 'piutang', label: 'Piutang Usaha (A/R)', sub: [
      { key: 'piutang.reverse', label: 'Tombol "Reverse"', sensitive: true }
    ]
  },
  { key: 'fixed-assets', label: 'Aset Tetap', sub: [] },
  { key: 'financial', label: 'Accounting Suite', sub: [
      { key: 'financial.payroll', label: 'Gaji & Payroll', sensitive: true }
    ]
  },
  { key: 'expenses', label: 'Expenses', sub: [
      { key: 'perlengkapan', label: 'Perlengkapan', sensitive: true },
      { key: 'iklan', label: 'Iklan', sensitive: true },
      { key: 'ongkir', label: 'Ongkos Kirim', sensitive: true },
      { key: 'financial.partners', label: 'Business Partners / Reseller', sensitive: true }
  ] },
  { key: 'double-entry', label: 'Double Entry System', sub: [
      { key: 'coa', label: 'Bagan Akun (CoA)', sensitive: true },
      { key: 'journal', label: 'Akun Jurnal', sensitive: true },
      { key: 'ledger-summary', label: 'Ledger Summary', sensitive: true },
      { key: 'trial-balance', label: 'Trial Balance', sensitive: true },
      { key: 'closing', label: 'Tutup Periode', sensitive: true }
    ]
  },
  { key: 'report-sales-detail', label: 'Laporan Rincian Penjualan', sub: [] },
  { key: 'report-user-activity', label: 'Laporan Kegiatan User', sub: [] }
];

function emptyPermissions() {
  const p: Record<string, boolean> = {};
  MODULES.forEach(m => {
    p[m.key] = false;
    m.sub.forEach(s => { p[s.key] = false; });
  });
  return p;
}

function fullPermissions() {
  const p: Record<string, boolean> = {};
  MODULES.forEach(m => {
    p[m.key] = true;
    m.sub.forEach(s => { p[s.key] = true; });
  });
  return p;
}

function countActive(permissions: Record<string, boolean>) {
  if (!permissions) return 0;
  return MODULES.filter(m => permissions[m.key]).length;
}

export const UserManagementTab: React.FC = () => {
  const { profile } = useAuth();
  const { sidebarHidden } = useSidebar();
  const [users, setUsers] = useState<any[]>([]);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeUserEmail, setActiveUserEmail] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Record<string, boolean>>({});

  // Add staff modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');

  useModalEsc(isModalOpen, () => setIsModalOpen(false));
  useModalEsc(isAddModalOpen, () => setIsAddModalOpen(false));
  
  useEffect(() => {
    if (profile?.role !== 'owner') return;

    const unsub = onSnapshot(collection(db, 'authorizedUsers'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(data);
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    return () => unsub();
  }, [profile?.role]);

  if (profile?.role !== 'owner') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ShieldCheck className="h-12 w-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Akses Ditolak</h2>
        <p className="text-neutral-500 dark:text-neutral-400">Hanya Owner yang dapat mengakses halaman ini.</p>
      </div>
    );
  }

  const handleAddStaffClick = () => {
    setNewStaffName('');
    setNewStaffEmail('');
    setIsAddModalOpen(true);
  };

  const handleSaveNewStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail || !newStaffEmail.includes('@')) {
      alert('Email tidak valid.');
      return;
    }
    
    const emailLower = newStaffEmail.toLowerCase().trim();
    if (users.find(u => u.email === emailLower)) {
      alert('Email sudah terdaftar.');
      return;
    }

    const name = newStaffName.trim() || emailLower.split('@')[0];
    
    try {
      await setDoc(doc(db, 'authorizedUsers', emailLower), {
        email: emailLower,
        displayName: name,
        role: 'staff',
        status: 'aktif',
        permissions: emptyPermissions(),
        createdAt: Timestamp.now()
      });
      setIsAddModalOpen(false);
      
      // Auto open modal for new user
      setActiveUserEmail(emailLower);
      setDraftPermissions(emptyPermissions());
      setIsModalOpen(true);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menambah staff: ' + err.message);
    }
  };

  const handleToggleStatus = async (userEmail: string, currentStatus: string, userName: string) => {
    try {
      const newStatus = currentStatus === 'aktif' ? 'nonaktif' : 'aktif';
      await setDoc(doc(db, 'authorizedUsers', userEmail), { status: newStatus }, { merge: true });
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengubah status: ' + err.message);
    }
  };

  const handleDeleteUser = async (userEmail: string, userName: string) => {
    if (!window.confirm(`Hapus akses untuk ${userName} (${userEmail})? Tindakan ini tidak bisa dibatalkan.`)) return;
    
    try {
      await deleteDoc(doc(db, 'authorizedUsers', userEmail));
    } catch (err: any) {
      console.error(err);
      alert('Gagal menghapus user: ' + err.message);
    }
  };

  const openPermissionsModal = (u: any) => {
    setActiveUserEmail(u.email);
    setDraftPermissions(u.permissions || emptyPermissions());
    setIsModalOpen(true);
  };

  const handleSavePermissions = async () => {
    if (!activeUserEmail) return;
    try {
      await setDoc(doc(db, 'authorizedUsers', activeUserEmail), { permissions: draftPermissions }, { merge: true });
      setIsModalOpen(false);
      setActiveUserEmail(null);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan permissions: ' + err.message);
    }
  };

  const activeUser = users.find(u => u.email === activeUserEmail);

  return (
    <div className="font-['Lexend'] text-[#1c2431] max-w-6xl mx-auto pb-20">
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm mb-6">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-500" /> Manajemen User
          </h2>
        </div>
        
        <button 
          onClick={handleAddStaffClick}
          className="inline-flex items-center gap-2 bg-[#363a42] hover:bg-[#22252b] text-white px-5 py-2.5 rounded-[9px] font-semibold text-[13.5px] transition-colors flex-none cursor-pointer"
        >
          <UserPlus size={16} />
          Tambah Staff
        </button>
      </div>

      <div className="bg-white border border-[#e4e9f1] rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 pb-3.5 border-b border-[#e4e9f1]">
          <h2 className="text-[15px] font-semibold mb-1">Daftar User</h2>
          <p className="text-[12px] text-[#5f6b7d]">Gmail yang diizinkan login dan hak aksesnya.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[880px] border-collapse">
            <thead>
              <tr>
                <th className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5f6b7d] bg-[#f4f5f6] px-4 py-3 border-b border-[#e4e9f1]">Nama / Email</th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5f6b7d] bg-[#f4f5f6] px-4 py-3 border-b border-[#e4e9f1]">Role</th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5f6b7d] bg-[#f4f5f6] px-4 py-3 border-b border-[#e4e9f1]">Status</th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5f6b7d] bg-[#f4f5f6] px-4 py-3 border-b border-[#e4e9f1]">Akses Menu</th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5f6b7d] bg-[#f4f5f6] px-4 py-3 border-b border-[#e4e9f1] text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isOwner = u.role === 'owner';
                const activeCount = countActive(u.permissions);
                const initials = (u.displayName || u.email).substring(0, 2).toUpperCase();
                
                return (
                  <tr key={u.email} className="hover:bg-[#f4f5f6] border-b border-[#e4e9f1] last:border-b-0">
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-[#e7e8ea] text-[#22252b] flex items-center justify-center font-['Inter'] font-bold text-[11.5px] mr-3 flex-none">
                          {initials}
                        </div>
                        <div>
                          <div className="font-semibold text-[13px]">{u.displayName || '-'}</div>
                          <div className="text-[11px] text-[#5f6b7d] mt-0.5 font-['Inter']">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      {isOwner ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#efe9f7] text-[#6c4fa0]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#6c4fa0]"></span> Owner
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#e7e8ea] text-[#363a42]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#363a42]"></span> Staff
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      {u.status === 'aktif' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#e7f4ee] text-[#1e7f5c]">
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#e4e9f1] text-[#9aa4b2]">
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <span className="font-['Inter'] text-[12.5px] text-[#5f6b7d]">
                        <b className="text-[#1c2431] font-bold">{activeCount}</b> dari {MODULES.length} modul
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-middle text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          disabled={isOwner}
                          onClick={() => openPermissionsModal(u)}
                          className="px-3 py-1.5 bg-white border border-[#e4e9f1] text-[#5f6b7d] text-[11.5px] font-semibold rounded-[7px] hover:bg-[#f4f5f6] hover:text-[#22252b] hover:border-[#e7e8ea] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Atur Akses
                        </button>
                        <button 
                          disabled={isOwner}
                          onClick={() => handleToggleStatus(u.email, u.status || 'aktif', u.displayName)}
                          className="px-3 py-1.5 bg-white border border-[#e4e9f1] text-[#5f6b7d] text-[11.5px] font-semibold rounded-[7px] hover:bg-[#f4f5f6] hover:text-[#22252b] hover:border-[#e7e8ea] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {(u.status || 'aktif') === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button 
                          disabled={isOwner}
                          onClick={() => handleDeleteUser(u.email, u.displayName)}
                          className="px-3 py-1.5 bg-white border border-[#e4e9f1] text-[#5f6b7d] text-[11.5px] font-semibold rounded-[7px] hover:bg-[#faedec] hover:text-[#b0473d] hover:border-[#f2d2ce] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* OVERLAY & MODAL: ATUR AKSES */}
      {isModalOpen && activeUser && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-50')} onMouseDown={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div className="bg-white rounded-[18px] w-[92%] max-w-[640px] shadow-2xl overflow-hidden my-auto" onMouseDown={e => e.stopPropagation()}>
            
            <div className="bg-gradient-to-br from-[#14161a] to-[#363a42] text-white px-6 py-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-['Inter'] font-bold text-[13px]">
                  {(activeUser.displayName || activeUser.email).substring(0,2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-[15px] font-bold m-0 leading-tight">{activeUser.displayName}</h2>
                  <p className="text-[11.5px] font-['Inter'] text-white/75 m-0 mt-0.5">{activeUser.email}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer flex-none"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#e4e9f1] gap-2">
              <span className="text-[11.5px] text-[#5f6b7d]">Centang menu yang boleh diakses user ini.</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDraftPermissions(fullPermissions())}
                  className="px-2.5 py-1.5 bg-[#f4f5f6] hover:bg-[#e7e8ea] text-[#22252b] border border-[#e7e8ea] rounded-[7px] text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Pilih Semua
                </button>
                <button 
                  onClick={() => setDraftPermissions(emptyPermissions())}
                  className="px-2.5 py-1.5 bg-[#f4f5f6] hover:bg-[#e7e8ea] text-[#22252b] border border-[#e7e8ea] rounded-[7px] text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Kosongkan Semua
                </button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-6 py-2">
              {MODULES.map((m) => {
                const isMainChecked = !!draftPermissions[m.key];
                
                return (
                  <div key={m.key} className="py-3 border-b border-[#e4e9f1] last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-[#f4f5f6] text-[#363a42] flex items-center justify-center flex-none">
                          <Settings2 size={14} />
                        </div>
                        <span className="text-[13.5px] font-semibold text-[#1c2431]">{m.label}</span>
                      </div>
                      
                      <label className="relative flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={isMainChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const newPerms = { ...draftPermissions, [m.key]: checked };
                            m.sub.forEach(s => { newPerms[s.key] = checked; });
                            setDraftPermissions(newPerms);
                          }}
                        />
                        <div className={`w-10 h-[22px] rounded-full transition-colors ${isMainChecked ? 'bg-[#363a42]' : 'bg-[#e4e9f1]'}`}></div>
                        <div className={`absolute left-0.5 top-0.5 bg-white w-[18px] h-[18px] rounded-full transition-transform shadow-[0_1px_3px_rgba(0,0,0,0.25)] ${isMainChecked ? 'translate-x-[18px]' : 'translate-x-0'}`}></div>
                      </label>
                    </div>

                    {m.sub.length > 0 && (
                      <div className="ml-10 mt-2.5 flex flex-col gap-2.5">
                        {m.sub.map(s => {
                          const isSubChecked = !!draftPermissions[s.key];
                          return (
                            <div key={s.key} className="flex items-center justify-between gap-2.5">
                              <span className={`text-[12.5px] font-['Inter'] flex items-center ${isMainChecked ? 'text-[#5f6b7d]' : 'text-[#9aa4b2]'}`}>
                                {s.label}
                                {s.sensitive && (
                                  <span className="ml-2 text-[9.5px] font-bold tracking-wide uppercase text-[#b0473d] bg-[#faedec] px-1.5 py-0.5 rounded-[5px] font-['Lexend']">
                                    Sensitif
                                  </span>
                                )}
                              </span>
                              
                              <label className="relative flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer"
                                  checked={isSubChecked}
                                  disabled={!isMainChecked}
                                  onChange={(e) => setDraftPermissions({ ...draftPermissions, [s.key]: e.target.checked })}
                                />
                                <div className={`w-[34px] h-[19px] rounded-full transition-colors ${!isMainChecked ? 'bg-[#e4e9f1] opacity-60' : isSubChecked ? 'bg-[#363a42]' : 'bg-[#e4e9f1]'}`}></div>
                                <div className={`absolute left-0.5 top-0.5 bg-white w-[15px] h-[15px] rounded-full transition-transform shadow-[0_1px_3px_rgba(0,0,0,0.25)] ${isSubChecked ? 'translate-x-[15px]' : 'translate-x-0'}`}></div>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#e4e9f1] bg-[#f6f8fb]">
              <span className="font-['Inter'] text-[11.5px] text-[#5f6b7d]">
                <b className="text-[#363a42] font-bold">{countActive(draftPermissions)}</b> dari {MODULES.length} modul diaktifkan
              </span>
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white border border-[#e4e9f1] text-[#5f6b7d] text-[13px] font-semibold rounded-[9px] hover:bg-[#f4f5f6] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSavePermissions}
                  className="px-5 py-2 bg-[#363a42] hover:bg-[#22252b] text-white text-[13px] font-bold rounded-[9px] transition-colors cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* MODAL: TAMBAH STAFF */}
      {isAddModalOpen && (
        <div className={getModalOverlayClass(sidebarHidden, 'z-50')} onMouseDown={(e) => { if (e.target === e.currentTarget) setIsAddModalOpen(false); }}>
          <div className="bg-white rounded-[18px] w-[90%] max-w-[400px] shadow-2xl overflow-hidden my-auto" onMouseDown={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-[#14161a] to-[#363a42] text-white px-6 py-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-['Inter'] font-bold text-[13px]">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold m-0 leading-tight">Tambah Staff Baru</h2>
                  <p className="text-[11.5px] font-['Inter'] text-white/75 m-0 mt-0.5">Berikan akses untuk staff baru</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer flex-none"
              >
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSaveNewStaff}>
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#1c2431] mb-1.5">Nama Lengkap</label>
                  <input 
                    type="text" 
                    value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value)}
                    className="w-full border border-[#e4e9f1] rounded-[9px] px-3.5 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#363a42]/20 focus:border-[#363a42] transition-shadow"
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#1c2431] mb-1.5">Alamat Email (Gmail)</label>
                  <input 
                    type="email" 
                    value={newStaffEmail}
                    onChange={e => setNewStaffEmail(e.target.value)}
                    className="w-full border border-[#e4e9f1] rounded-[9px] px-3.5 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#363a42]/20 focus:border-[#363a42] transition-shadow"
                    placeholder="nama@gmail.com"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#e4e9f1] bg-[#f6f8fb]">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-white border border-[#e4e9f1] text-[#5f6b7d] text-[13px] font-semibold rounded-[9px] hover:bg-[#f4f5f6] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-[#363a42] hover:bg-[#22252b] text-white text-[13px] font-bold rounded-[9px] transition-colors cursor-pointer"
                >
                  Tambahkan Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};