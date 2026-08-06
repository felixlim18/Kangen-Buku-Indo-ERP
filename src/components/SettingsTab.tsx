import React, { useState, useEffect } from 'react';
import { useSettings, BrandingSettings } from '../lib/use-settings';
import { useAuth } from '../lib/auth-context';
import { DataMasterManager } from './DataMasterManager';
import { LineIntegrationManager } from './LineIntegrationManager';
import { 
  Settings, 
  Image as ImageIcon, 
  Layers, 
  Upload, 
  Trash2, 
  Check,
  User,
  MessageSquare
} from 'lucide-react';

export const SettingsTab: React.FC = () => {
  const { branding, saveBranding } = useSettings();
  const { profile, updateDisplayName } = useAuth();
  
  const [activeNav, setActiveNav] = useState<'branding' | 'datamaster' | 'line'>('branding');
  
  // Branding local state
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);
  const [iconUrl, setIconUrl] = useState(branding.iconUrl || '');
  const [namaUsaha, setNamaUsaha] = useState(branding.namaUsaha);
  const [namaAkun, setNamaAkun] = useState(profile?.displayName || '');
  const [alamat, setAlamat] = useState(branding.alamat);
  const [kontak, setKontak] = useState(branding.kontak);
  const [brandingSaved, setBrandingSaved] = useState(false);

  // Sync state when loaded
  useEffect(() => {
    setLogoUrl(branding.logoUrl);
    setIconUrl(branding.iconUrl || '');
    setNamaUsaha(branding.namaUsaha);
    setAlamat(branding.alamat);
    setKontak(branding.kontak);
  }, [branding]);

  useEffect(() => {
    if (profile?.displayName) {
      setNamaAkun(profile.displayName);
    }
  }, [profile?.displayName]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file gambar maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        // Compress image using canvas to ensure base64 remains compact
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/png', 0.85);
            setLogoUrl(compressed);
          } else {
            setLogoUrl(result);
          }
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file icon maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 256;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/png', 0.9);
            setIconUrl(compressed);
          } else {
            setIconUrl(result);
          }
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async () => {
    const updated: BrandingSettings = {
      logoUrl,
      iconUrl,
      namaUsaha: namaUsaha.trim() || 'KangenBukuIndo',
      alamat: alamat.trim() || 'Taoyuan, Taiwan',
      kontak: kontak.trim() || '+886 9xx xxx xxx'
    };
    await saveBranding(updated);
    if (namaAkun.trim()) {
      await updateDisplayName(namaAkun);
    }
    setBrandingSaved(true);
    setTimeout(() => setBrandingSaved(false), 2500);
  };

  const handleResetBranding = () => {
    setLogoUrl(branding.logoUrl);
    setIconUrl(branding.iconUrl || '');
    setNamaUsaha(branding.namaUsaha);
    setNamaAkun(profile?.displayName || '');
    setAlamat(branding.alamat);
    setKontak(branding.kontak);
  };

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3.5">
        <div className="h-10 w-10 rounded-xl bg-neutral-900 dark:bg-neutral-800 text-white flex items-center justify-center shrink-0 shadow-sm">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Pengaturan</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
            Konfigurasi yang berlaku di seluruh modul KangenBukuIndo ERP.
          </p>
        </div>
      </div>

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Sidebar */}
        <div className="md:col-span-4 lg:col-span-3 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-2.5 space-y-1 shadow-xs">
          {/* Tab 1: Branding */}
          <button
            onClick={() => setActiveNav('branding')}
            className={`w-full flex items-center gap-3.5 p-3 rounded-xl transition text-left cursor-pointer ${
              activeNav === 'branding'
                ? 'bg-[#111827] dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-sm'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50'
            }`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
              activeNav === 'branding'
                ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
            }`}>
              <ImageIcon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-tight">Branding</p>
              <p className={`text-[11px] font-medium truncate ${
                activeNav === 'branding'
                  ? 'text-neutral-300 dark:text-neutral-600'
                  : 'text-neutral-400'
              }`}>
                Logo & identitas usaha
              </p>
            </div>
          </button>

          {/* Tab 2: Data Master */}
          <button
            onClick={() => setActiveNav('datamaster')}
            className={`w-full flex items-center gap-3.5 p-3 rounded-xl transition text-left cursor-pointer ${
              activeNav === 'datamaster'
                ? 'bg-[#111827] dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-sm'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50'
            }`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
              activeNav === 'datamaster'
                ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
            }`}>
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-tight">Data Master</p>
              <p className={`text-[11px] font-medium truncate ${
                activeNav === 'datamaster'
                  ? 'text-neutral-300 dark:text-neutral-600'
                  : 'text-neutral-400'
              }`}>
                Platform, kurir, metode bayar
              </p>
            </div>
          </button>

          {/* Tab 3: Integrasi LINE */}
          <button
            onClick={() => setActiveNav('line')}
            className={`w-full flex items-center gap-3.5 p-3 rounded-xl transition text-left cursor-pointer ${
              activeNav === 'line'
                ? 'bg-[#111827] dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-sm'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50'
            }`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
              activeNav === 'line'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
            }`}>
              <MessageSquare className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                Integrasi LINE
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              </p>
              <p className={`text-[11px] font-medium truncate ${
                activeNav === 'line'
                  ? 'text-neutral-300 dark:text-neutral-600'
                  : 'text-neutral-400'
              }`}>
                Notifikasi Owner & Reseller
              </p>
            </div>
          </button>
        </div>

        {/* Right Settings Content Panel */}
        <div className="md:col-span-8 lg:col-span-9 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-[480px]">
          
          {/* BRANDING TAB */}
          {activeNav === 'branding' && (
            <div className="flex flex-col h-full flex-1">
              {/* Card Header */}
              <div className="p-6 border-b border-neutral-150 dark:border-neutral-800">
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Identitas Usaha</h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Muncul otomatis di kop semua laporan & dokumen yang diekspor (Neraca, Arus Kas, Invoice, dst).
                </p>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  
                  {/* Left Column: Form Fields */}
                  <div className="lg:col-span-7 space-y-5">
                    {/* Grid for Logo & Icon upload */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Logo Upload Field */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                          Logo Usaha
                        </label>

                        <div className="border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 bg-neutral-50/50 dark:bg-neutral-950/20 flex flex-col items-center justify-center text-center relative group transition hover:border-neutral-300 dark:hover:border-neutral-700 min-h-[140px]">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            title="Pilih file logo"
                          />

                          {logoUrl ? (
                            <div className="flex flex-col items-center space-y-2.5 z-0">
                              <div className="p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xs flex items-center justify-center max-h-20 max-w-[160px]">
                                <img src={logoUrl} alt="Logo Preview" className="max-h-16 max-w-full object-contain" />
                              </div>
                              <div className="flex items-center gap-2.5 relative z-20">
                                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer hover:underline">
                                  <Upload className="h-3 w-3" /> Ganti
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLogoUrl('');
                                  }}
                                  className="text-[11px] font-bold text-rose-500 flex items-center gap-1 cursor-pointer hover:underline"
                                >
                                  <Trash2 className="h-3 w-3" /> Hapus
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center pointer-events-none">
                              <div className="h-9 w-9 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center text-neutral-500 mb-2 shadow-2xs">
                                <Upload className="h-4 w-4" />
                              </div>
                              <p className="text-xs font-bold text-neutral-800 dark:text-neutral-100">
                                Unggah Logo
                              </p>
                              <p className="text-[10px] text-neutral-400 mt-0.5 font-medium">
                                Untuk kop dokumen/laporan
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Icon Upload Field */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                          <span>Icon</span>
                          <span className="text-[10px] text-neutral-400 font-normal">Favicon & Logo Sidebar</span>
                        </label>

                        <div className="border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 bg-neutral-50/50 dark:bg-neutral-950/20 flex flex-col items-center justify-center text-center relative group transition hover:border-neutral-300 dark:hover:border-neutral-700 min-h-[140px]">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleIconUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            title="Pilih file icon"
                          />

                          {iconUrl ? (
                            <div className="flex flex-col items-center space-y-2.5 z-0">
                              <div className="h-14 w-14 p-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xs flex items-center justify-center overflow-hidden">
                                <img src={iconUrl} alt="Icon Preview" className="h-full w-full object-contain" />
                              </div>
                              <div className="flex items-center gap-2.5 relative z-20">
                                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer hover:underline">
                                  <Upload className="h-3 w-3" /> Ganti
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIconUrl('');
                                  }}
                                  className="text-[11px] font-bold text-rose-500 flex items-center gap-1 cursor-pointer hover:underline"
                                >
                                  <Trash2 className="h-3 w-3" /> Hapus
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center pointer-events-none">
                              <div className="h-9 w-9 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center text-neutral-500 mb-2 shadow-2xs">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                              <p className="text-xs font-bold text-neutral-800 dark:text-neutral-100">
                                Unggah Icon
                              </p>
                              <p className="text-[10px] text-neutral-400 mt-0.5 font-medium">
                                Digunakan di favicon & sidebar
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Form Field: Nama Akun (Display Name User) */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                        <span>Nama Akun</span>
                        {profile?.email && (
                          <span className="text-[11px] font-normal text-neutral-400">({profile.email})</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={namaAkun}
                        onChange={(e) => setNamaAkun(e.target.value)}
                        placeholder="Nama Akun Anda"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                      />
                    </div>

                    {/* Form Field: Nama Usaha */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                        Nama Usaha
                      </label>
                      <input
                        type="text"
                        value={namaUsaha}
                        onChange={(e) => setNamaUsaha(e.target.value)}
                        placeholder="KangenBukuIndo"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                      />
                    </div>

                    {/* Form Fields: Alamat & Kontak */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                          Alamat
                        </label>
                        <input
                          type="text"
                          value={alamat}
                          onChange={(e) => setAlamat(e.target.value)}
                          placeholder="Taoyuan, Taiwan"
                          className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                          Kontak
                        </label>
                        <input
                          type="text"
                          value={kontak}
                          onChange={(e) => setKontak(e.target.value)}
                          placeholder="+886 9xx xxx xxx"
                          className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Live Previews */}
                  <div className="lg:col-span-5 space-y-4">
                    {/* Preview 1: Sidebar Logo & Favicon */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                        Pratinjau Sidebar & Favicon
                      </label>
                      <div className="bg-neutral-50/80 dark:bg-neutral-950/50 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-3.5 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-600 via-sky-500 to-indigo-650 flex items-center justify-center font-bold text-white shadow-xs overflow-hidden shrink-0">
                          {iconUrl ? (
                            <img src={iconUrl} alt="Icon Preview" className="h-full w-full object-contain p-0.5 bg-white/90 rounded-md" />
                          ) : logoUrl ? (
                            <img src={logoUrl} alt="Logo Preview" className="h-full w-full object-contain p-0.5 bg-white/90 rounded-md" />
                          ) : (
                            <span className="text-xs">KB</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                            {namaUsaha || 'KangenBukuIndo'}
                          </h4>
                          <p className="text-[10px] text-neutral-400 font-medium">Favicon website & logo sidebar</p>
                        </div>
                      </div>
                    </div>

                    {/* Preview 2: Kop Dokumen */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                        Pratinjau Kop Dokumen
                      </label>

                      <div className="bg-neutral-50/80 dark:bg-neutral-950/50 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 text-center space-y-2.5 flex flex-col items-center justify-center min-h-[150px]">
                        <div className="h-10 w-10 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center shadow-xs overflow-hidden p-1">
                          {logoUrl ? (
                            <img src={logoUrl} alt="Preview Logo" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">KB</span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-xs font-bold text-neutral-900 dark:text-white tracking-tight">
                            {namaUsaha || 'KangenBukuIndo'}
                          </h3>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                            {alamat || 'Taoyuan, Taiwan'}
                          </p>
                        </div>

                        <div className="h-0.5 w-8 bg-amber-400 rounded-full mx-auto"></div>

                        <p className="text-[9px] font-bold text-neutral-400 dark:text-neutral-500 tracking-wider uppercase">
                          LAPORAN NERACA · JULI 2026
                        </p>
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500 text-center font-medium">
                      Ini pratinjau langsung — berubah saat Anda mengetik atau mengunggah file.
                    </p>
                  </div>

                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 px-6 bg-neutral-50/50 dark:bg-neutral-950/40 border-t border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  {brandingSaved && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-fadeIn">
                      <Check className="h-3.5 w-3.5" /> Perubahan identitas berhasil disimpan!
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleResetBranding}
                    className="px-5 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBranding}
                    className="px-6 py-2.5 bg-[#111827] dark:bg-neutral-100 text-white dark:text-neutral-900 font-bold text-xs rounded-xl hover:opacity-90 shadow-sm transition cursor-pointer flex items-center gap-1.5"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DATA MASTER TAB */}
          {activeNav === 'datamaster' && (
            <DataMasterManager />
          )}

          {/* INTEGRASI LINE TAB */}
          {activeNav === 'line' && (
            <LineIntegrationManager />
          )}

        </div>
      </div>
    </div>
  );
};
