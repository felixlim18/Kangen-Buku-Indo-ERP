import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  Timestamp, 
  writeBatch 
} from 'firebase/firestore';
import { 
  ShoppingCart, 
  Package, 
  Megaphone, 
  Plus, 
  Pencil, 
  Trash2, 
  Check, 
  X, 
  Palette, 
  DollarSign,
  GripVertical,
  AlertTriangle,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Link2
} from 'lucide-react';

export interface MasterItem {
  id: string;
  name: string;
  color?: string;
  currency?: 'IDR' | 'NTD' | 'USD';
  orderCategory?: 'Marketplace' | 'Direct Order' | 'Reseller';
  position?: number;
  ongkosKirim?: boolean;
  isCod?: boolean;
  isTransfer?: boolean;
  platforms?: string[];
  adminFee?: number;
}

export const COLOR_PRESETS = [
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#10B981', name: 'Emerald' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#F59E0B', name: 'Amber' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#8B5CF6', name: 'Purple' },
  { hex: '#6366F1', name: 'Indigo' },
  { hex: '#06B6D4', name: 'Cyan' },
  { hex: '#14B8A6', name: 'Teal' },
  { hex: '#64748B', name: 'Slate' },
  { hex: '#1E293B', name: 'Dark' }
];

export const DataMasterManager: React.FC = () => {
  // Main Sub-Tab State
  const [activeMainTab, setActiveMainTab] = useState<'sales' | 'purchase' | 'iklan'>('sales');

  // Category State per Sub-Tab
  const [salesCategory, setSalesCategory] = useState<'channel' | 'platform' | 'campaign' | 'logistik' | 'payment'>('channel');
  const [poCategory, setPoCategory] = useState<'platform_belanja'>('platform_belanja');
  const [iklanCategory, setIklanCategory] = useState<'campaign'>('campaign');

  // Master Data Lists from Firestore
  const [sumberOrderan, setSumberOrderan] = useState<MasterItem[]>([]);
  const [platformOrder, setPlatformOrder] = useState<MasterItem[]>([]);
  const [sumberCampaign, setSumberCampaign] = useState<MasterItem[]>([]);
  const [opsiPengiriman, setOpsiPengiriman] = useState<MasterItem[]>([]);
  const [metodeBayar, setMetodeBayar] = useState<MasterItem[]>([]);
  const [platformBelanja, setPlatformBelanja] = useState<MasterItem[]>([]);

  // Platform Auto Ongkir Config
  const [platformAutoConfig, setPlatformAutoConfig] = useState<Record<string, { enabled: boolean; enabledAt?: string }>>({});

  const [loading, setLoading] = useState(true);

  // Add Item State
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemColor, setNewItemColor] = useState('#3B82F6');
  const [newItemCurrency, setNewItemCurrency] = useState<'IDR' | 'NTD' | 'USD'>('IDR');
  const [newItemOrderCategory, setNewItemOrderCategory] = useState<'Marketplace' | 'Direct Order' | 'Reseller'>('Direct Order');
  const [newItemOngkosKirim, setNewItemOngkosKirim] = useState<boolean>(false);
  const [newItemIsCod, setNewItemIsCod] = useState<boolean>(true);
  const [newItemIsTransfer, setNewItemIsTransfer] = useState<boolean>(true);
  const [newItemPlatforms, setNewItemPlatforms] = useState<string[]>([]);
  const [newItemAdminFee, setNewItemAdminFee] = useState<string>('0');

  // Drag & Drop / Reordering State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Edit Item State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#3B82F6');
  const [editCurrency, setEditCurrency] = useState<'IDR' | 'NTD' | 'USD'>('IDR');
  const [editOrderCategory, setEditOrderCategory] = useState<'Marketplace' | 'Direct Order' | 'Reseller'>('Direct Order');
  const [editAdminFee, setEditAdminFee] = useState<string>('0');

  // Delete Confirm State
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string; collectionName: string } | null>(null);

  // Toast Success State
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // 1. Real-time Subscription to Firestore categories & platforms collections
  useEffect(() => {
    setLoading(true);

    // Subscribe to `categories` collection for SO & Iklan categories
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      const channels: MasterItem[] = [];
      const platformsSO: MasterItem[] = [];
      const campaigns: MasterItem[] = [];
      const logistics: MasterItem[] = [];
      const payments: MasterItem[] = [];

      snap.forEach((docSnap) => {
        const id = docSnap.id;
        const data = docSnap.data();
        if (id === 'config_initialized' || id.startsWith('coa_')) return;

        const nameLower = (data.name || '').toLowerCase();
        const fallbackCategory: 'Marketplace' | 'Direct Order' | 'Reseller' = 
          nameLower.includes('shopee') || nameLower.includes('tokopedia') || nameLower.includes('tiktok') || nameLower.includes('lazada') ? 'Marketplace' :
          (nameLower.includes('reseller') ? 'Reseller' : 'Direct Order');

        const item: MasterItem = {
          id: docSnap.id,
          name: data.name || '',
          color: data.color || '#3B82F6',
          currency: data.currency,
          orderCategory: data.orderCategory || fallbackCategory,
          position: typeof data.position === 'number' ? data.position : 999,
          ongkosKirim: data.ongkosKirim,
          isCod: data.isCod !== false,
          isTransfer: data.isTransfer !== false,
          platforms: Array.isArray(data.platforms) ? data.platforms : [],
          adminFee: typeof data.adminFee === 'number' ? data.adminFee : (parseFloat(data.adminFee) || 0)
        };

        if (id.startsWith('config_channel_')) channels.push(item);
        else if (id.startsWith('config_platform_')) platformsSO.push(item);
        else if (id.startsWith('config_type_')) campaigns.push(item);
        else if (id.startsWith('config_logistik_')) logistics.push(item);
        else if (id.startsWith('config_payment_')) payments.push(item);
      });

      const sortByPos = (a: MasterItem, b: MasterItem) => (a.position ?? 999) - (b.position ?? 999);

      setSumberOrderan(channels.sort(sortByPos));
      setPlatformOrder(platformsSO.sort(sortByPos));
      setSumberCampaign(campaigns.sort(sortByPos));
      setOpsiPengiriman(logistics.sort(sortByPos));
      setMetodeBayar(payments.sort(sortByPos));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'categories');
      setLoading(false);
    });

    // Subscribe to `platforms` collection for PO Platform Belanja
    const unsubPlatforms = onSnapshot(collection(db, 'platforms'), (snap) => {
      const list: MasterItem[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name || '',
          color: data.color || '#3B82F6',
          currency: data.currency || 'IDR',
          position: typeof data.position === 'number' ? data.position : 999
        });
      });
      setPlatformBelanja(list.sort((a, b) => (a.position ?? 999) - (b.position ?? 999)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'platforms');
    });

    // Subscribe to platform auto config for Ongkos Kirim
    const unsubOngkirConfig = onSnapshot(doc(db, 'settings', 'ongkir_platform_config'), (snap) => {
      if (snap.exists()) {
        setPlatformAutoConfig(snap.data()?.platforms || {});
      } else {
        setPlatformAutoConfig({});
      }
    }, err => {
      if (String(err).includes("Quota") || String(err).includes("quota")) {
        console.warn("Firebase quota exceeded (snapshot)");
      } else {
        console.error("Snapshot error:", err);
      }
    });

    return () => {
      unsubCategories();
      unsubPlatforms();
      unsubOngkirConfig();
    };
  }, []);

  // Handler for toggling Ongkos Kirim on Platform Order items
  const handleToggleOngkosKirim = async (item: MasterItem) => {
    const isCurrentlyEnabled = item.ongkosKirim ?? platformAutoConfig[item.name]?.enabled ?? false;
    const newEnabled = !isCurrentlyEnabled;

    try {
      if (item.id) {
        await updateDoc(doc(db, 'categories', item.id), {
          ongkosKirim: newEnabled
        });
      }

      const updatedPlatforms = {
        ...platformAutoConfig,
        [item.name]: {
          enabled: newEnabled,
          enabledAt: newEnabled ? new Date().toISOString() : (platformAutoConfig[item.name]?.enabledAt || new Date().toISOString())
        }
      };
      await setDoc(doc(db, 'settings', 'ongkir_platform_config'), { platforms: updatedPlatforms }, { merge: true });

      showToast(`Ongkos Kirim untuk "${item.name}" diubah ke ${newEnabled ? 'ON' : 'OFF'}`);
    } catch (err) {
      console.error("Error toggling Ongkos Kirim:", err);
      showToast("Gagal mengubah status Ongkos Kirim");
    }
  };

  // Handler for toggling COD on Platform Order items
  const handleToggleCod = async (item: MasterItem) => {
    const isCurrentlyEnabled = item.isCod !== false;
    const newEnabled = !isCurrentlyEnabled;
    try {
      if (item.id) {
        await updateDoc(doc(db, 'categories', item.id), {
          isCod: newEnabled
        });
        showToast(`Fitur COD untuk "${item.name}" diubah ke ${newEnabled ? 'ON' : 'OFF'}`);
      }
    } catch (err) {
      console.error("Error toggling COD:", err);
      showToast("Gagal mengubah status COD");
    }
  };

  // Handler for toggling Transfer on Platform Order items
  const handleToggleTransfer = async (item: MasterItem) => {
    const isCurrentlyEnabled = item.isTransfer !== false;
    const newEnabled = !isCurrentlyEnabled;
    try {
      if (item.id) {
        await updateDoc(doc(db, 'categories', item.id), {
          isTransfer: newEnabled
        });
        showToast(`Fitur Transfer untuk "${item.name}" diubah ke ${newEnabled ? 'ON' : 'OFF'}`);
      }
    } catch (err) {
      console.error("Error toggling Transfer:", err);
      showToast("Gagal mengubah status Transfer");
    }
  };

  // Handler for toggling Platform Order link on Opsi Pengiriman items
  const handleToggleLogisticsPlatform = async (item: MasterItem, platformName: string) => {
    const currentPlatforms = item.platforms || [];
    const isLinked = currentPlatforms.includes(platformName);
    const updatedPlatforms = isLinked
      ? currentPlatforms.filter(p => p !== platformName)
      : [...currentPlatforms, platformName];

    try {
      if (item.id) {
        await updateDoc(doc(db, 'categories', item.id), {
          platforms: updatedPlatforms
        });
        showToast(`Relasi Opsi Pengiriman "${item.name}" diperbarui`);
      }
    } catch (err) {
      console.error("Error updating logistics platforms:", err);
      showToast("Gagal memperbarui relasi platform");
    }
  };

  // Reorder list functions (Batch write positions)
  const handleReorderItems = async (newOrderedList: MasterItem[]) => {
    try {
      const batch = writeBatch(db);
      newOrderedList.forEach((item, idx) => {
        const docRef = doc(db, collectionName, item.id);
        batch.update(docRef, { position: idx });
      });
      await batch.commit();
      showToast(`Urutan ${label} berhasil diperbarui!`);
    } catch (err) {
      console.error("Error reordering items:", err);
      showToast("Gagal memperbarui urutan");
    }
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newList = [...activeList];
    const temp = newList[index];
    newList[index] = newList[index - 1];
    newList[index - 1] = temp;
    handleReorderItems(newList);
  };

  const handleMoveDown = (index: number) => {
    if (index >= activeList.length - 1) return;
    const newList = [...activeList];
    const temp = newList[index];
    newList[index] = newList[index + 1];
    newList[index + 1] = temp;
    handleReorderItems(newList);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const newList = [...activeList];
    const [movedItem] = newList.splice(draggedIndex, 1);
    newList.splice(dropIndex, 0, movedItem);
    setDraggedIndex(null);
    setDragOverIndex(null);
    handleReorderItems(newList);
  };

  // Determine current active list and target Firestore collection / prefix
  const getCurrentCategoryContext = () => {
    if (activeMainTab === 'sales') {
      switch (salesCategory) {
        case 'channel':
          return { list: sumberOrderan, collectionName: 'categories', prefix: 'config_channel_', label: 'Sumber Orderan', isPO: false };
        case 'platform':
          return { list: platformOrder, collectionName: 'categories', prefix: 'config_platform_', label: 'Platform Order', isPO: false };
        case 'campaign':
          return { list: sumberCampaign, collectionName: 'categories', prefix: 'config_type_', label: 'Sumber Campaign', isPO: false };
        case 'logistik':
          return { list: opsiPengiriman, collectionName: 'categories', prefix: 'config_logistik_', label: 'Opsi Pengiriman', isPO: false };
        case 'payment':
          return { list: metodeBayar, collectionName: 'categories', prefix: 'config_payment_', label: 'Metode Bayar', isPO: false };
      }
    } else if (activeMainTab === 'purchase') {
      return { list: platformBelanja, collectionName: 'platforms', prefix: '', label: 'Platform Belanja', isPO: true };
    } else {
      return { list: sumberCampaign, collectionName: 'categories', prefix: 'config_type_', label: 'Sumber Campaign', isPO: false };
    }
  };

  const { list: activeList, collectionName, prefix, label, isPO } = getCurrentCategoryContext();

  // Handle Add Item
  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    const name = newItemName.trim();
    const color = newItemColor || '#3B82F6';
    const currency = isPO ? newItemCurrency : undefined;

    try {
      if (collectionName === 'platforms') {
        const newDocRef = doc(collection(db, 'platforms'));
        await setDoc(newDocRef, {
          name,
          currency,
          color,
          position: activeList.length,
          createdAt: Timestamp.now()
        });
      } else {
        const docId = `${prefix}${Date.now()}`;
        const payload: any = {
          name,
          color,
          position: activeList.length,
          createdAt: Timestamp.now()
        };
        if (prefix === 'config_channel_') {
          payload.orderCategory = newItemOrderCategory;
        }
        if (prefix === 'config_platform_') {
          payload.ongkosKirim = newItemOngkosKirim;
          payload.isCod = newItemIsCod;
          payload.isTransfer = newItemIsTransfer;
        }
        if (prefix === 'config_logistik_') {
          payload.platforms = newItemPlatforms;
        }
        if (prefix === 'config_platform_') {
          payload.adminFee = parseFloat(newItemAdminFee) || 0;
        }
        await setDoc(doc(db, 'categories', docId), payload);

        if (prefix === 'config_platform_') {
          const updatedPlatforms = {
            ...platformAutoConfig,
            [name]: {
              enabled: newItemOngkosKirim,
              enabledAt: new Date().toISOString()
            }
          };
          await setDoc(doc(db, 'settings', 'ongkir_platform_config'), { platforms: updatedPlatforms }, { merge: true });
        }
      }

      setNewItemName('');
      setNewItemOngkosKirim(false);
      setNewItemPlatforms([]);
      setNewItemAdminFee('0');
      setIsAddFormOpen(false);
      showToast(`Item "${name}" berhasil ditambahkan!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${collectionName}`);
    }
  };

  // Handle Edit Item Start
  const handleStartEdit = (item: MasterItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditColor(item.color || '#3B82F6');
    setEditCurrency(item.currency || 'IDR');
    setEditOrderCategory(item.orderCategory || 'Direct Order');
    setEditAdminFee(item.adminFee !== undefined ? String(item.adminFee) : '0');
  };

  // Handle Save Edit
  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const name = editName.trim();
    const color = editColor || '#3B82F6';

    try {
      if (collectionName === 'platforms') {
        await updateDoc(doc(db, 'platforms', editingId), {
          name,
          color,
          currency: editCurrency
        });
      } else {
        const updateData: any = {
          name,
          color
        };
        if (prefix === 'config_channel_') {
          updateData.orderCategory = editOrderCategory;
        }
        if (prefix === 'config_platform_') {
          updateData.adminFee = parseFloat(editAdminFee) || 0;
        }
        await updateDoc(doc(db, 'categories', editingId), updateData);
      }

      setEditingId(null);
      showToast(`Perubahan "${name}" berhasil disimpan!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${editingId}`);
    }
  };

  // Handle Delete Item
  const handleDeleteItem = async () => {
    if (!deleteConfirmItem) return;
    const { id, name, collectionName: col } = deleteConfirmItem;
    try {
      if (col === 'platforms') {
        await deleteDoc(doc(db, 'platforms', id));
      } else {
        await deleteDoc(doc(db, 'categories', id));
      }
      setDeleteConfirmItem(null);
      showToast(`Item "${name}" telah dihapus.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${col}/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="p-3.5 px-4 bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 animate-fadeIn transition">
          <Check className="h-4 w-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Sub-Tab Bar (Sales Order, Purchase Order, Iklan) */}
      <div className="flex items-center gap-1.5 p-1 bg-neutral-100/80 dark:bg-neutral-900/50 rounded-2xl border border-neutral-200/50 dark:border-neutral-800/50 flex-wrap shadow-inner mb-2 w-fit">
        <button
          onClick={() => setActiveMainTab('sales')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeMainTab === 'sales'
              ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm ring-1 ring-neutral-200/50 dark:ring-neutral-700'
              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Sales Order</span>
        </button>

        <button
          onClick={() => setActiveMainTab('purchase')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeMainTab === 'purchase'
              ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm ring-1 ring-neutral-200/50 dark:ring-neutral-700'
              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <Package className="h-4 w-4" />
          <span>Purchase Order</span>
        </button>

        <button
          onClick={() => setActiveMainTab('iklan')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeMainTab === 'iklan'
              ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm ring-1 ring-neutral-200/50 dark:ring-neutral-700'
              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <Megaphone className="h-4 w-4" />
          <span>Iklan</span>
        </button>
      </div>

      {/* Category Pills based on active Sub-Tab */}
      {activeMainTab === 'sales' && (
        <div className="flex items-center gap-2 flex-wrap bg-neutral-50/80 dark:bg-neutral-950/40 p-2 rounded-2xl border border-neutral-200/70 dark:border-neutral-800">
          <button
            onClick={() => { setSalesCategory('channel'); setEditingId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              salesCategory === 'channel'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            1. Sumber Orderan
          </button>

          <button
            onClick={() => { setSalesCategory('platform'); setEditingId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              salesCategory === 'platform'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            2. Platform Order
          </button>

          <button
            onClick={() => { setSalesCategory('campaign'); setEditingId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              salesCategory === 'campaign'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            3. Sumber Campaign
          </button>

          <button
            onClick={() => { setSalesCategory('logistik'); setEditingId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              salesCategory === 'logistik'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            4. Opsi Pengiriman
          </button>

          <button
            onClick={() => { setSalesCategory('payment'); setEditingId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              salesCategory === 'payment'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            5. Metode Bayar
          </button>
        </div>
      )}

      {activeMainTab === 'purchase' && (
        <div className="flex items-center gap-2 bg-neutral-50/80 dark:bg-neutral-950/40 p-2 rounded-2xl border border-neutral-200/70 dark:border-neutral-800">
          <button
            onClick={() => { setPoCategory('platform_belanja'); setEditingId(null); }}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white shadow-2xs"
          >
            1. Platform Belanja
          </button>
        </div>
      )}

      {activeMainTab === 'iklan' && (
        <div className="flex items-center gap-2 bg-neutral-50/80 dark:bg-neutral-950/40 p-2 rounded-2xl border border-neutral-200/70 dark:border-neutral-800">
          <button
            onClick={() => { setIklanCategory('campaign'); setEditingId(null); }}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white shadow-2xs"
          >
            1. Sumber Campaign
          </button>
        </div>
      )}

      {/* Main Data Master Container */}
      <div className="bg-neutral-50/30 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden flex flex-col">
        
        {/* Container Header */}
        <div className="p-5 px-6 border-b border-neutral-150/60 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/40 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <span>{label}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                {activeList.length} item
              </span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {isPO 
                ? 'Kelola opsi platform belanja untuk PO beserta mata uang & warna label.' 
                : `Daftar opsi pilihan master untuk kategori ${label}.`}
            </p>
          </div>
        </div>

        {/* List of Registered Items */}
        <div className="p-4 px-6 overflow-y-auto min-h-[300px] max-h-[60vh] space-y-3">
          {activeList.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 font-medium">
              Belum ada data master terdaftar di kategori ini.
            </div>
          ) : (
            activeList.map((item, idx) => {
              const isEditing = editingId === item.id;

              return (
                <div 
                  key={item.id} 
                  draggable={!isEditing}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  className={`p-4 px-5 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/70 dark:border-neutral-800 shadow-sm flex flex-col md:flex-row md:flex-wrap items-start md:items-center justify-between gap-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                    dragOverIndex === idx ? 'ring-2 ring-brand-500 scale-[1.02]' : ''
                  }`}
                >
                  {isEditing ? (
                    /* EDIT FORM ROW */
                    (<div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 w-full py-1">
                      <div className="flex items-center gap-2 flex-1 w-full">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="Nama Item"
                          autoFocus
                        />

                        {isPO && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[11px] font-bold text-neutral-500">Mata Uang:</span>
                            <select
                              value={editCurrency}
                              onChange={(e) => setEditCurrency(e.target.value as any)}
                              className="px-2.5 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200"
                            >
                              <option value="IDR">IDR (Rupiah)</option>
                              <option value="NTD">NTD (NT$)</option>
                              <option value="USD">USD ($)</option>
                            </select>
                          </div>
                        )}

                        {prefix === 'config_channel_' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[11px] font-bold text-neutral-500">Kategori Order:</span>
                            <select
                              value={editOrderCategory}
                              onChange={(e) => setEditOrderCategory(e.target.value as any)}
                              className="px-2.5 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200"
                            >
                              <option value="Marketplace">Marketplace</option>
                              <option value="Direct Order">Direct Order</option>
                              <option value="Reseller">Reseller</option>
                            </select>
                          </div>
                        )}
                        {prefix === 'config_platform_' && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <span className="text-[11px] font-bold text-neutral-500">Biaya Admin (TWD):</span>
                            <input
                              type="number"
                              step="any"
                              value={editAdminFee}
                              onChange={(e) => setEditAdminFee(e.target.value)}
                              className="w-16 px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-numeric text-neutral-800 dark:text-neutral-200"
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>

                      {/* Color Palette Picker during Edit */}
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <span className="text-[11px] font-bold text-neutral-500 mr-1">Warna:</span>
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => setEditColor(c.hex)}
                            style={{ 
                              backgroundColor: c.hex,
                              boxShadow: editColor === c.hex ? `0 0 12px ${c.hex}80` : 'none'
                            }}
                            className={`h-6 w-6 rounded-full transition-all cursor-pointer shrink-0 border-2 ${
                              editColor === c.hex ? 'border-white dark:border-neutral-900 scale-110' : 'border-transparent opacity-80 hover:opacity-100 hover:scale-110'
                            }`}
                            title={c.name}
                          />
                        ))}
                      </div>

                      {/* Save / Cancel buttons */}
                      <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" /> Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs rounded-lg transition hover:bg-neutral-300 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    </div>)
                  ) : (
                    /* NORMAL VIEW ROW */
                    (<>
                      <div className="flex items-center gap-3 min-w-[200px] flex-1">
                        {/* Drag and Reorder Controls */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <GripVertical className="h-4 w-4 text-neutral-400 dark:text-neutral-600 shrink-0 cursor-grab hover:text-neutral-600 dark:hover:text-neutral-300" title="Geser untuk mengatur urutan" />
                          <button
                            type="button"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-20 cursor-pointer"
                            title="Pindah ke Atas"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === activeList.length - 1}
                            className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-20 cursor-pointer"
                            title="Pindah ke Bawah"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        
                        {/* Color Badge Dot */}
                        <div
                          style={{ backgroundColor: item.color || '#3B82F6' }}
                          className="h-3.5 w-3.5 rounded-full shrink-0 shadow-2xs border border-white/20 ml-1"
                          title={`Color Label: ${item.color || '#3B82F6'}`}
                        />

                        <span className="font-bold text-[13px] text-neutral-800 dark:text-neutral-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] md:max-w-none md:whitespace-normal md:break-words">
                          {item.name}
                        </span>

                        {isPO && item.currency && (
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wider uppercase border shrink-0 ${
                            item.currency === 'IDR'
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : item.currency === 'NTD'
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                          }`}>
                            {item.currency}
                          </span>
                        )}

                        {prefix === 'config_channel_' && (
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full tracking-wider uppercase border shrink-0 ${
                            item.orderCategory === 'Marketplace'
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : item.orderCategory === 'Reseller'
                              ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          }`}>
                            {item.orderCategory || 'Direct Order'}
                          </span>
                        )}
                      </div>

                      {/* Linked Platform Orders for Sales Order -> Opsi Pengiriman */}
                      {activeMainTab === 'sales' && salesCategory === 'logistik' && (
                        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                          <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                            <Link2 className="h-3 w-3 text-brand-500" /> Platform:
                          </span>
                          {platformOrder.length === 0 ? (
                            <span className="text-[10px] text-neutral-400 font-medium">(Belum ada platform)</span>
                          ) : (
                            platformOrder.map((po) => {
                              const isLinked = (item.platforms || []).includes(po.name);
                              return (
                                <button
                                  key={po.id || po.name}
                                  type="button"
                                  onClick={() => handleToggleLogisticsPlatform(item, po.name)}
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition cursor-pointer border ${
                                    isLinked
                                      ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border-brand-300 dark:border-brand-700 shadow-2xs'
                                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300'
                                  }`}
                                  title={`${isLinked ? 'Putuskan' : 'Hubungkan'} dengan Platform ${po.name}`}
                                >
                                  {isLinked ? '✓ ' : ''}{po.name}
                                </button>
                              );
                            })
                          )}
                          {(!item.platforms || item.platforms.length === 0) && (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800" title="Berlaku untuk semua Platform Order">
                              Semua Platform
                            </span>
                          )}
                        </div>
                      )}

                      {/* Toggles (COD, Transfer, Ongkos Kirim) for Sales Order -> Sub-tab "2. Platform Order" */}
                      {activeMainTab === 'sales' && salesCategory === 'platform' && (() => {
                        const isOngkirEnabled = item.ongkosKirim ?? platformAutoConfig[item.name]?.enabled ?? false;
                        const isCodEnabled = item.isCod !== false;
                        const isTransferEnabled = item.isTransfer !== false;
                        return (
                          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto xl:ml-auto">
                            <div className="flex items-center gap-1.5 mr-2">
                              <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                                Biaya Admin:
                              </span>
                              <span className="text-[11px] font-numeric font-bold text-neutral-800 dark:text-neutral-200">
                                NT$ {item.adminFee || 0}
                              </span>
                            </div>
                            {/* COD Toggle */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                                COD:
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleCod(item)}
                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  isCodEnabled ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700'
                                }`}
                                title={`COD untuk ${item.name}: ${isCodEnabled ? 'ON' : 'OFF'}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                    isCodEnabled ? 'translate-x-3' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                isCodEnabled
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                              }`}>
                                {isCodEnabled ? 'ON' : 'OFF'}
                              </span>
                            </div>

                            {/* Transfer Toggle */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                                Transfer:
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleTransfer(item)}
                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  isTransferEnabled ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'
                                }`}
                                title={`Transfer untuk ${item.name}: ${isTransferEnabled ? 'ON' : 'OFF'}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                    isTransferEnabled ? 'translate-x-3' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                isTransferEnabled
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                              }`}>
                                {isTransferEnabled ? 'ON' : 'OFF'}
                              </span>
                            </div>

                            {/* Ongkos Kirim Toggle */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                                Ongkir:
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleOngkosKirim(item)}
                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  isOngkirEnabled ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700'
                                }`}
                                title={`Ongkos Kirim untuk ${item.name}: ${isOngkirEnabled ? 'ON' : 'OFF'}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                    isOngkirEnabled ? 'translate-x-3' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                isOngkirEnabled
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                              }`}>
                                {isOngkirEnabled ? 'ON' : 'OFF'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Action buttons (Edit & Delete) */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition cursor-pointer"
                          title="Edit Item"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmItem({ id: item.id, name: item.name, collectionName })}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                          title="Hapus Item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>)
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ADD NEW ITEM FORM FOOTER */}
        <div className="border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900/50">
          {!isAddFormOpen ? (
            <button
              type="button"
              onClick={() => setIsAddFormOpen(true)}
              className="w-full p-4 px-6 flex items-center justify-center gap-2 text-sm font-bold text-brand-600 hover:bg-brand-50/50 dark:hover:bg-brand-950/20 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Item Baru ke {label}</span>
            </button>
          ) : (
            <div className="p-5 px-6 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-brand-500" />
                  Tambah Item Baru
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition"
                  title="Tutup Form"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                {/* Item Name Input */}
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
                  placeholder={`Contoh: ${label} baru...`}
                  className="flex-1 w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-sm font-bold text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-inner"
                />

                {/* Currency selector for Purchase Order Platform Belanja */}
                {isPO && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Mata Uang:</span>
                    <select
                      value={newItemCurrency}
                      onChange={(e) => setNewItemCurrency(e.target.value as any)}
                      className="px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="IDR">IDR (Shopee Indo, Tokopedia, dst)</option>
                      <option value="NTD">NTD (博客來, IopenMall, dst)</option>
                      <option value="USD">USD (Supplier Global)</option>
                    </select>
                  </div>
                )}

                {/* Kategori Order selector for Sales Order Sumber Orderan */}
                {prefix === 'config_channel_' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Kategori Order:</span>
                    <select
                      value={newItemOrderCategory}
                      onChange={(e) => setNewItemOrderCategory(e.target.value as any)}
                      className="px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="Marketplace">Marketplace</option>
                      <option value="Direct Order">Direct Order</option>
                      <option value="Reseller">Reseller</option>
                    </select>
                  </div>
                )}

                {/* Platform Order - Admin Fee */}
                {prefix === 'config_platform_' && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Biaya Admin (TWD):</span>
                    <input
                      type="number"
                      step="any"
                      value={newItemAdminFee}
                      onChange={(e) => setNewItemAdminFee(e.target.value)}
                      className="w-20 text-xs bg-transparent border-b border-neutral-300 dark:border-neutral-700 focus:outline-none focus:border-brand-500 pb-0.5"
                      placeholder="0"
                    />
                  </div>
                )}

                {/* Toggles selector (COD, Transfer, Ongkos Kirim) for Platform Order */}
                {prefix === 'config_platform_' && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                    {/* COD */}
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">COD:</span>
                    <button
                      type="button"
                      onClick={() => setNewItemIsCod(!newItemIsCod)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        newItemIsCod ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700'
                      }`}
                      title={`Toggle COD: ${newItemIsCod ? 'ON' : 'OFF'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          newItemIsCod ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded mr-2 ${
                      newItemIsCod
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                    }`}>
                      {newItemIsCod ? 'ON' : 'OFF'}
                    </span>

                    {/* Transfer */}
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Transfer:</span>
                    <button
                      type="button"
                      onClick={() => setNewItemIsTransfer(!newItemIsTransfer)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        newItemIsTransfer ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'
                      }`}
                      title={`Toggle Transfer: ${newItemIsTransfer ? 'ON' : 'OFF'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          newItemIsTransfer ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded mr-2 ${
                      newItemIsTransfer
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                    }`}>
                      {newItemIsTransfer ? 'ON' : 'OFF'}
                    </span>

                    {/* Ongkos Kirim */}
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Ongkir:</span>
                    <button
                      type="button"
                      onClick={() => setNewItemOngkosKirim(!newItemOngkosKirim)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        newItemOngkosKirim ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700'
                      }`}
                      title={`Toggle Ongkos Kirim: ${newItemOngkosKirim ? 'ON' : 'OFF'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          newItemOngkosKirim ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                      newItemOngkosKirim
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700'
                    }`}>
                      {newItemOngkosKirim ? 'ON' : 'OFF'}
                    </span>
                  </div>
                )}

                {/* Platform Order selector for Opsi Pengiriman */}
                {prefix === 'config_logistik_' && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5 text-brand-500" /> Platform Order:
                    </span>
                    {platformOrder.length === 0 ? (
                      <span className="text-xs text-neutral-400 font-medium">(Belum ada platform)</span>
                    ) : (
                      platformOrder.map((po) => {
                        const isSelected = newItemPlatforms.includes(po.name);
                        return (
                          <button
                            key={po.id || po.name}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setNewItemPlatforms(newItemPlatforms.filter(p => p !== po.name));
                              } else {
                                setNewItemPlatforms([...newItemPlatforms, po.name]);
                              }
                            }}
                            className={`px-2 py-0.5 text-xs font-bold rounded-lg transition cursor-pointer border ${
                              isSelected
                                ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                                : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'
                            }`}
                          >
                            {isSelected ? '✓ ' : ''}{po.name}
                          </button>
                        );
                      })
                    )}
                    {newItemPlatforms.length === 0 && (
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                        Semua Platform
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-t border-neutral-100 dark:border-neutral-800 pt-4">
                {/* Color Palette Selector for New Item */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400 mr-2 flex items-center gap-1">
                    <Palette className="h-3.5 w-3.5" /> Warna:
                  </span>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewItemColor(c.hex)}
                      style={{ 
                        backgroundColor: c.hex,
                        boxShadow: newItemColor === c.hex ? `0 0 12px ${c.hex}80` : 'none'
                      }}
                      className={`h-6 w-6 rounded-full transition-all cursor-pointer shrink-0 border-2 ${
                        newItemColor === c.hex ? 'border-white dark:border-neutral-900 scale-110' : 'border-transparent opacity-80 hover:opacity-100 hover:scale-110'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!newItemName.trim()}
                  className="w-full lg:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl transition disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2 shadow-sm shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>Simpan Item</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="h-10 w-10 rounded-2xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Konfirmasi Hapus Data Master</h4>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-medium">
              Apakah Anda yakin ingin menghapus <strong className="text-neutral-900 dark:text-white font-black">{deleteConfirmItem.name}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-700 dark:text-neutral-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteItem}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus Permanent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
