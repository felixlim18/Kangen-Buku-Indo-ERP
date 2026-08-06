import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export interface BrandingSettings {
  logoUrl: string;
  iconUrl?: string;
  namaUsaha: string;
  alamat: string;
  kontak: string;
}

export interface DataMasterItem {
  id: string;
  name: string;
  currency?: 'IDR' | 'NTD';
}

export interface DataMasterSettings {
  platforms: DataMasterItem[];
  shippingOptions: DataMasterItem[];
  paymentMethods: DataMasterItem[];
  orderChannels: DataMasterItem[];
}

export const DEFAULT_BRANDING: BrandingSettings = {
  logoUrl: '',
  iconUrl: '',
  namaUsaha: 'KangenBukuIndo',
  alamat: 'Taoyuan, Taiwan',
  kontak: '+886 9xx xxx xxx'
};

export const DEFAULT_DATA_MASTER: DataMasterSettings = {
  platforms: [
    { id: 'p1', name: 'Shopee Indonesia', currency: 'IDR' },
    { id: 'p2', name: '博客來', currency: 'NTD' },
    { id: 'p3', name: 'Tokopedia', currency: 'IDR' },
    { id: 'p4', name: 'IopenMall', currency: 'NTD' },
  ],
  shippingOptions: [
    { id: 's1', name: '7-Eleven' },
    { id: 's2', name: 'FamilyMart' },
    { id: 's3', name: 'Hi-Life' },
    { id: 's4', name: 'OK Mart' },
    { id: 's5', name: 'Home Delivery (T-Cat)' },
  ],
  paymentMethods: [
    { id: 'm1', name: 'Transfer Bank (BCA/Mandiri)' },
    { id: 'm2', name: 'COD (Bayar di Tempat)' },
    { id: 'm3', name: 'ShopeePay / E-Wallet' },
    { id: 'm4', name: 'Tunai / Cash' },
  ],
  orderChannels: [
    { id: 'c1', name: 'Direct WhatsApp' },
    { id: 'c2', name: 'Marketplace Shopee' },
    { id: 'c3', name: 'Marketplace Tokopedia' },
    { id: 'c4', name: 'Instagram DM' },
  ]
};

export interface LineSettings {
  channelAccessToken: string;
  channelSecret: string;
  ownerUserId: string;
  resellerUserId: string;
  notifyOwnerNewOrder: boolean;
  notifyResellerNewOrder: boolean;
  enabled: boolean;
}

export const DEFAULT_LINE_SETTINGS: LineSettings = {
  channelAccessToken: '',
  channelSecret: '',
  ownerUserId: '',
  resellerUserId: '',
  notifyOwnerNewOrder: true,
  notifyResellerNewOrder: true,
  enabled: true
};

const LOCAL_BRANDING_KEY = 'kbi_branding_settings_v1';
const LOCAL_DATA_MASTER_KEY = 'kbi_datamaster_settings_v1';
const LOCAL_LINE_SETTINGS_KEY = 'kbi_line_settings_v1';

export function getStoredLineSettings(): LineSettings {
  if (typeof window === 'undefined') return DEFAULT_LINE_SETTINGS;
  try {
    const raw = localStorage.getItem(LOCAL_LINE_SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_LINE_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to parse local line settings:', e);
  }
  return DEFAULT_LINE_SETTINGS;
}

export function getStoredBranding(): BrandingSettings {
  if (typeof window === 'undefined') return DEFAULT_BRANDING;
  try {
    const raw = localStorage.getItem(LOCAL_BRANDING_KEY);
    if (raw) {
      return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to parse local branding settings:', e);
  }
  return DEFAULT_BRANDING;
}

export function getStoredDataMaster(): DataMasterSettings {
  if (typeof window === 'undefined') return DEFAULT_DATA_MASTER;
  try {
    const raw = localStorage.getItem(LOCAL_DATA_MASTER_KEY);
    if (raw) {
      return { ...DEFAULT_DATA_MASTER, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to parse local datamaster settings:', e);
  }
  return DEFAULT_DATA_MASTER;
}

export function useSettings() {
  const [branding, setBranding] = useState<BrandingSettings>(getStoredBranding);
  const [dataMaster, setDataMaster] = useState<DataMasterSettings>(getStoredDataMaster);
  const [lineSettings, setLineSettings] = useState<LineSettings>(getStoredLineSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to Firestore branding
    const unsubBranding = onSnapshot(doc(db, 'settings', 'branding'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as BrandingSettings;
        const merged = { ...DEFAULT_BRANDING, ...data };
        setBranding(merged);
        localStorage.setItem(LOCAL_BRANDING_KEY, JSON.stringify(merged));
      } else {
        // First initialization
        setDoc(doc(db, 'settings', 'branding'), DEFAULT_BRANDING).catch(() => {});
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/branding');
      setLoading(false);
    });

    // Listen to Firestore data_master
    const unsubDataMaster = onSnapshot(doc(db, 'settings', 'data_master'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as DataMasterSettings;
        const merged = {
          platforms: data.platforms || DEFAULT_DATA_MASTER.platforms,
          shippingOptions: data.shippingOptions || DEFAULT_DATA_MASTER.shippingOptions,
          paymentMethods: data.paymentMethods || DEFAULT_DATA_MASTER.paymentMethods,
          orderChannels: data.orderChannels || DEFAULT_DATA_MASTER.orderChannels,
        };
        setDataMaster(merged);
        localStorage.setItem(LOCAL_DATA_MASTER_KEY, JSON.stringify(merged));
      } else {
        setDoc(doc(db, 'settings', 'data_master'), DEFAULT_DATA_MASTER).catch(() => {});
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/data_master');
    });

    // Listen to Firestore line_settings
    const unsubLine = onSnapshot(doc(db, 'settings', 'line'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LineSettings;
        const merged = { ...DEFAULT_LINE_SETTINGS, ...data };
        setLineSettings(merged);
        localStorage.setItem(LOCAL_LINE_SETTINGS_KEY, JSON.stringify(merged));
      } else {
        setDoc(doc(db, 'settings', 'line'), DEFAULT_LINE_SETTINGS).catch(() => {});
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/line');
    });

    return () => {
      unsubBranding();
      unsubDataMaster();
      unsubLine();
    };
  }, []);

  // Dynamically update browser favicon when iconUrl or logoUrl changes
  useEffect(() => {
    const iconToUse = branding.iconUrl || branding.logoUrl;
    if (iconToUse) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = iconToUse;
    }
  }, [branding.iconUrl, branding.logoUrl]);

  const saveBranding = async (newBranding: BrandingSettings) => {
    setBranding(newBranding);
    localStorage.setItem(LOCAL_BRANDING_KEY, JSON.stringify(newBranding));
    try {
      await setDoc(doc(db, 'settings', 'branding'), newBranding, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/branding');
    }
  };

  const saveDataMaster = async (newDataMaster: DataMasterSettings) => {
    setDataMaster(newDataMaster);
    localStorage.setItem(LOCAL_DATA_MASTER_KEY, JSON.stringify(newDataMaster));
    try {
      await setDoc(doc(db, 'settings', 'data_master'), newDataMaster, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/data_master');
    }
  };

  const saveLineSettings = async (newLineSettings: LineSettings) => {
    setLineSettings(newLineSettings);
    localStorage.setItem(LOCAL_LINE_SETTINGS_KEY, JSON.stringify(newLineSettings));
    try {
      await setDoc(doc(db, 'settings', 'line'), newLineSettings, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/line');
    }
  };

  return {
    branding,
    dataMaster,
    lineSettings,
    loading,
    saveBranding,
    saveDataMaster,
    saveLineSettings,
  };
}
