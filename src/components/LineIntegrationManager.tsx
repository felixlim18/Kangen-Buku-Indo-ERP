import React, { useState, useEffect } from 'react';
import { useSettings, LineSettings } from '../lib/use-settings';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { 
  MessageSquare, 
  Send, 
  Copy, 
  Check, 
  RefreshCw, 
  ShieldCheck, 
  UserCheck, 
  Bell, 
  Key, 
  ExternalLink, 
  HelpCircle,
  AlertCircle,
  Smartphone,
  Users,
  Info
} from 'lucide-react';

export const LineIntegrationManager: React.FC = () => {
  const { lineSettings, saveLineSettings } = useSettings();

  const [channelAccessToken, setChannelAccessToken] = useState(lineSettings.channelAccessToken || '');
  const [channelSecret, setChannelSecret] = useState(lineSettings.channelSecret || '');
  const [ownerUserId, setOwnerUserId] = useState(lineSettings.ownerUserId || '');
  const [resellerUserId, setResellerUserId] = useState(lineSettings.resellerUserId || '');
  const [notifyOwnerNewOrder, setNotifyOwnerNewOrder] = useState(lineSettings.notifyOwnerNewOrder ?? true);
  const [notifyResellerNewOrder, setNotifyResellerNewOrder] = useState(lineSettings.notifyResellerNewOrder ?? true);
  const [enabled, setEnabled] = useState(lineSettings.enabled ?? true);

  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test message states
  const [testingOwner, setTestingOwner] = useState(false);
  const [testingReseller, setTestingReseller] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Recent detected users from Webhook
  const [recentUsers, setRecentUsers] = useState<Array<{ userId: string; timestamp: string; eventType: string; messageText?: string }>>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Sync state when loaded
  useEffect(() => {
    setChannelAccessToken(lineSettings.channelAccessToken || '');
    setChannelSecret(lineSettings.channelSecret || '');
    setOwnerUserId(lineSettings.ownerUserId || '');
    setResellerUserId(lineSettings.resellerUserId || '');
    setNotifyOwnerNewOrder(lineSettings.notifyOwnerNewOrder ?? true);
    setNotifyResellerNewOrder(lineSettings.notifyResellerNewOrder ?? true);
    setEnabled(lineSettings.enabled ?? true);
  }, [lineSettings]);

  // Construct Webhook URL (forcing https to prevent HTTP -> HTTPS 302 redirects by Cloud Run / Nginx)
  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin.replace(/^http:/, 'https:')}/api/line/webhook` 
    : '/api/line/webhook';

  const fetchRecentUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch('/api/line/recent-users');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setRecentUsers(data.recentUsers || []);
      }
    } catch (err) {
      console.error('Error fetching recent users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchRecentUsers();

    // Subscribe to realtime Firestore updates for lineUsers
    let unsubscribe = () => {};
    try {
      const q = query(collection(db, 'lineUsers'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const users: Array<{ userId: string; timestamp: string; eventType: string; messageText?: string }> = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.userId) {
            users.push({
              userId: data.userId,
              timestamp: data.timestamp || new Date().toISOString(),
              eventType: data.eventType || 'message',
              messageText: data.messageText || ''
            });
          }
        });
        // Sort newest first
        users.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (users.length > 0) {
          setRecentUsers(users);
        }
      }, (err) => {
        console.warn('Firestore lineUsers snapshot error:', err);
      });
    } catch (e) {
      console.warn('Failed to subscribe to lineUsers snapshot:', e);
    }

    return () => unsubscribe();
  }, []);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const updated: LineSettings = {
      channelAccessToken: channelAccessToken.trim(),
      channelSecret: channelSecret.trim(),
      ownerUserId: ownerUserId.trim(),
      resellerUserId: resellerUserId.trim(),
      notifyOwnerNewOrder,
      notifyResellerNewOrder,
      enabled
    };

    await saveLineSettings(updated);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTestMessage = async (target: 'owner' | 'reseller') => {
    const targetUserId = target === 'owner' ? ownerUserId.trim() : resellerUserId.trim();
    const recipientName = target === 'owner' ? 'Owner (Anda)' : 'Reseller';

    if (!channelAccessToken.trim()) {
      setTestResult({
        type: 'error',
        message: 'Masukkan Channel Access Token terlebih dahulu.'
      });
      return;
    }

    if (!targetUserId) {
      setTestResult({
        type: 'error',
        message: `Masukkan User ID LINE untuk ${recipientName} terlebih dahulu.`
      });
      return;
    }

    if (target === 'owner') setTestingOwner(true);
    else setTestingReseller(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/line/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelAccessToken: channelAccessToken.trim(),
          targetUserId,
          recipientName
        })
      });

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success) {
          setTestResult({
            type: 'success',
            message: data.message || `Pesan tes berhasil dikirim ke ${recipientName}!`
          });
        } else {
          setTestResult({
            type: 'error',
            message: data.error || 'Gagal mengirim pesan tes.'
          });
        }
      } else {
        const text = await res.text();
        setTestResult({
          type: 'error',
          message: `Respon server tidak valid (${res.status}): ${text.substring(0, 100)}`
        });
      }
    } catch (err: any) {
      setTestResult({
        type: 'error',
        message: `Terjadi kesalahan koneksi: ${err.message || err}`
      });
    } finally {
      setTestingOwner(false);
      setTestingReseller(false);
    }
  };

  const isConnected = Boolean(channelAccessToken && ownerUserId);

  return (
    <div className="flex flex-col h-full flex-1">
      {/* Header */}
      <div className="p-6 border-b border-neutral-150 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Integrasi LINE Messaging API</h2>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border flex items-center gap-1 ${
              isConnected && enabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected && enabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {isConnected && enabled ? 'Terhubung & Aktif' : 'Belum Dikonfigurasi'}
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Kirim notifikasi otomatis ke LINE Anda (Owner) & Reseller saat Sales Order baru dibuat.
          </p>
        </div>

        {/* Master Toggle */}
        <label className="inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-hidden rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-neutral-600 peer-checked:bg-emerald-600 relative"></div>
          <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
            {enabled ? 'Aktif' : 'Nonaktif'}
          </span>
        </label>
      </div>

      {/* Main Form Content */}
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        
        {/* Banner Webhook URL */}
        <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              URL Webhook LINE Official Account
            </span>
            <span className="text-[11px] text-neutral-400 font-medium">Auto-capture User ID</span>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-neutral-700 dark:text-neutral-300 select-all"
            />
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
            >
              {copiedWebhook ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Tersalin!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Salin URL
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Tempel URL ini di <strong>LINE Developers Console</strong> → Channel Anda → <strong>Messaging API</strong> → <strong>Webhook URL</strong>, lalu aktifkan toggle <em>Use webhook</em>.
          </p>
          <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>PENTING jika tombol Verify error (302 Found):</strong> Pastikan Webhook URL diawali dengan <code>https://</code> (bukan <code>http://</code>), karena LINE menolak redirect otomatis HTTP ke HTTPS. Salin ulang URL persis seperti di atas.
            </span>
          </div>
        </div>

        {/* Section 1: Credentials */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5" /> 1. Kredensial LINE Messaging API
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Channel Access Token (Long-Lived)
              </label>
              <input
                type="password"
                value={channelAccessToken}
                onChange={(e) => setChannelAccessToken(e.target.value)}
                placeholder="Dapatkan dari LINE Developers Console..."
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3.5 py-2 text-xs font-mono text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Channel Secret <span className="text-neutral-400 font-normal">(opsional untuk verifikasi webhook)</span>
              </label>
              <input
                type="password"
                value={channelSecret}
                onChange={(e) => setChannelSecret(e.target.value)}
                placeholder="Channel Secret dari LINE Console..."
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3.5 py-2 text-xs font-mono text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Recipient Target Settings */}
        <div className="space-y-4 pt-2 border-t border-neutral-150 dark:border-neutral-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> 2. Penerima Notifikasi Orderan (Owner & Reseller)
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Owner Box */}
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                    👑
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">Owner (Saya Sendiri)</h4>
                    <p className="text-[10px] text-neutral-400 font-medium">Menerima semua Sales Order baru</p>
                  </div>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={notifyOwnerNewOrder}
                    onChange={(e) => setNotifyOwnerNewOrder(e.target.checked)}
                    className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                  />
                  <span>Notifikasi Aktif</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400">
                  LINE User ID Owner
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ownerUserId}
                    onChange={(e) => setOwnerUserId(e.target.value)}
                    placeholder="Contoh: U1234567890abcdef1234567890abcdef"
                    className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-1.5 text-xs font-mono text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestMessage('owner')}
                    disabled={testingOwner || !ownerUserId}
                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                  >
                    {testingOwner ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Tes Kirim
                  </button>
                </div>
              </div>
            </div>

            {/* Reseller Box */}
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs">
                    🤝
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">Reseller</h4>
                    <p className="text-[10px] text-neutral-400 font-medium">Khusus orderan berkategori Reseller</p>
                  </div>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={notifyResellerNewOrder}
                    onChange={(e) => setNotifyResellerNewOrder(e.target.checked)}
                    className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                  />
                  <span>Notifikasi Aktif</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400">
                  LINE User ID Reseller
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={resellerUserId}
                    onChange={(e) => setResellerUserId(e.target.value)}
                    placeholder="Contoh: U9876543210fedcba9876543210fedcba"
                    className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-1.5 text-xs font-mono text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestMessage('reseller')}
                    disabled={testingReseller || !resellerUserId}
                    className="px-3 py-1.5 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                  >
                    {testingReseller ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Tes Kirim
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Test Result Alert Banner */}
          {testResult && (
            <div className={`p-3.5 rounded-xl text-xs font-medium border flex items-center justify-between gap-3 ${
              testResult.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
            }`}>
              <div className="flex items-center gap-2">
                {testResult.type === 'success' ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
                <span>{testResult.message}</span>
              </div>
              <button 
                onClick={() => setTestResult(null)}
                className="text-[10px] font-bold uppercase hover:underline opacity-80"
              >
                Tutup
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Auto-Detected LINE Users from Webhook */}
        <div className="space-y-3 pt-2 border-t border-neutral-150 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" /> 3. Deteksi ID LINE Terbaru dari Chat / Webhook
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Minta Anda atau Reseller melakukan add friend / chat ke Akun LINE Official Anda. ID LINE akan otomatis muncul di sini untuk langsung dijadikan Owner/Reseller!
              </p>
            </div>

            <button
              type="button"
              onClick={fetchRecentUsers}
              disabled={isLoadingUsers}
              className="px-2.5 py-1.5 text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center gap-1 transition cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingUsers ? 'animate-spin' : ''}`} />
              Segarkan
            </button>
          </div>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900">
            {recentUsers.length > 0 ? (
              <div className="divide-y divide-neutral-150 dark:divide-neutral-800">
                {recentUsers.map((u, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-neutral-50/50 dark:hover:bg-neutral-950/50 transition">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200 text-xs select-all">
                          {u.userId}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 uppercase">
                          {u.eventType}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400 font-medium mt-0.5">
                        {new Date(u.timestamp).toLocaleString('id-ID')} {u.messageText ? `• Pesan: "${u.messageText}"` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setOwnerUserId(u.userId)}
                        className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-[11px] font-bold hover:bg-blue-100 cursor-pointer transition"
                      >
                        + Owner ID
                      </button>
                      <button
                        type="button"
                        onClick={() => setResellerUserId(u.userId)}
                        className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-[11px] font-bold hover:bg-purple-100 cursor-pointer transition"
                      >
                        + Reseller ID
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
                Belum ada interaksi chat / add friend baru. Cobalah mengirim pesan "Halo" ke Akun LINE Official Anda!
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Quick Guide & Troubleshooting */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/50 space-y-2 text-xs text-sky-900 dark:text-sky-200">
            <h4 className="font-bold flex items-center gap-1.5">
              <HelpCircle className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Langkah Penyiapan LINE Official Account:
            </h4>
            <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-sky-800 dark:text-sky-300">
              <li>Buka <a href="https://developers.line.biz/" target="_blank" rel="noreferrer" className="underline font-bold inline-flex items-center gap-0.5">LINE Developers Console <ExternalLink className="h-2.5 w-2.5" /></a> dan pilih Channel Messaging API Anda.</li>
              <li>Salin <strong>Channel Access Token</strong> dan <strong>Channel Secret</strong> lalu tempelkan di form di atas.</li>
              <li>Salin <strong>URL Webhook</strong> di bagian paling atas halaman ini, lalu simpan di menu Messaging API LINE Developers Console dan aktifkan <em>Use webhook</em>.</li>
              <li>Buka aplikasi LINE di HP Anda / Reseller, add bot tersebut, lalu kirim chat "Halo".</li>
              <li>Klik tombol <strong>Segarkan</strong> pada poin 3 di atas, lalu klik <strong>+ Owner ID</strong> atau <strong>+ Reseller ID</strong>!</li>
            </ol>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-2.5 text-xs text-amber-900 dark:text-amber-200">
            <h4 className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Mengapa Balasan Otomatis / User ID Tidak Muncul Saat Add Friend?
            </h4>
            <div className="space-y-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              <p>Jika saat Add Friend bot tidak membalas atau User ID tidak muncul di tabel deteksi, periksa 3 hal berikut di pengaturan LINE Anda:</p>
              <ul className="list-disc list-inside space-y-1 font-medium pl-1">
                <li>
                  <strong>1. Toggle "Use Webhook" Belum Aktif:</strong> Di LINE Developers Console → Messaging API → Webhook URL → pastikan sakelar <em>Use webhook</em> berwarna hijau (ON).
                </li>
                <li>
                  <strong>2. Mode Respon Masih "Auto-Reply" bawaan LINE:</strong> Buka <a href="https://manager.line.biz" target="_blank" rel="noreferrer" className="underline font-bold inline-flex items-center gap-0.5">manager.line.biz <ExternalLink className="h-2.5 w-2.5" /></a> → Pengaturan (Settings) → Response settings:
                  <div className="mt-1 ml-4 p-2 bg-amber-100/50 dark:bg-amber-950/50 rounded-lg text-[10px] space-y-0.5 border border-amber-200/50 dark:border-amber-800/50">
                    <div>• Response mode: <strong>Bot</strong></div>
                    <div>• Auto-reply messages: <strong>Disabled</strong> (agar tidak bentrok dengan webhook ERP)</div>
                    <div>• Webhooks: <strong>Enabled</strong></div>
                  </div>
                </li>
                <li>
                  <strong>3. Kirim Pesan Chat Manual "Halo":</strong> Jika Add Friend dilakukan sebelum Webhook diaktifkan, cukup buka ruang chat bot LINE tersebut lalu kirim pesan <strong>"Halo"</strong>. Bot akan langsung membalas dan menangkap User ID Anda!
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>

      {/* Footer Actions */}
      <div className="p-4 bg-neutral-50/80 dark:bg-neutral-950/50 border-t border-neutral-150 dark:border-neutral-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Pengaturan LINE berhasil disimpan!
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
        >
          {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Simpan Pengaturan LINE
        </button>
      </div>
    </div>
  );
};
