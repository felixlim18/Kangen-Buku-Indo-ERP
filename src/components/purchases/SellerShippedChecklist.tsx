import React, { useState } from 'react';
import { Check } from 'lucide-react';

// Penanda admin di kartu PO:
//   1. "Dikirim penjual"      -> isShipped / shippedAt
//   2. "Sampai di ekspedisi"  -> isArrivedAtForwarder / arrivedAtForwarderAt
//      (paket sudah sampai di gudang forwarder Indonesia; baru bisa dicentang
//      setelah "Dikirim penjual", dan ikut terhapus kalau "Dikirim penjual" dibatalkan)
// - Menunggu / Sebagian: bisa diklik; batal centang minta konfirmasi (inline, karena
//   window.confirm diblokir di dalam iframe/panel pratinjau dan selalu bernilai false).
// - Diterima / Cancel: hanya info kalau sudah ditandai, disembunyikan kalau belum.
// Terima/reverse PO tidak menyentuh field ini, jadi kondisi & tanggalnya kembali
// seperti semula saat penerimaan di-reverse.
export type PoShippingMark = 'shipped' | 'arrived';

interface SellerShippedChecklistProps {
  po: any;
  onChange: (po: any, mark: PoShippingMark, checked: boolean) => void;
  className?: string;
}

const toMs = (val: any): number | null => {
  if (!val) return null;
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  const ms = new Date(val).getTime();
  return isNaN(ms) ? null : ms;
};

// Selisih hari kalender (bukan 24 jam) dari tanggal itu sampai hari ini.
const daysSince = (val: any): number | null => {
  const ms = toMs(val);
  if (ms === null) return null;
  const from = new Date(ms); from.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - from.getTime()) / 86400000);
};

export const SHIP_ALERT_DAYS = 3;
export const ARRIVE_ALERT_DAYS = 4;

export type PoShippingAlert = { level: 'blue' | 'red'; days: number };

// Biru: PO Menunggu/Sebagian yang sudah >= 3 hari sejak tanggal beli belum ditandai
// dikirim penjual. Merah: sudah dikirim tapi >= 4 hari sejak tanggal dikirim belum
// ditandai sampai di ekspedisi. Biru didahulukan di urutan daftar.
export const getPoShippingAlert = (po: any): PoShippingAlert | null => {
  if (po.status !== 'pending' && po.status !== 'partial') return null;
  if (!po.isShipped) {
    const days = daysSince(po.purchaseDate);
    return days !== null && days >= SHIP_ALERT_DAYS ? { level: 'blue', days } : null;
  }
  if (!po.isArrivedAtForwarder) {
    const days = daysSince(po.shippedAt);
    return days !== null && days >= ARRIVE_ALERT_DAYS ? { level: 'red', days } : null;
  }
  return null;
};

export const getPoShippingAlertRank = (po: any): number => {
  const alert = getPoShippingAlert(po);
  return alert?.level === 'blue' ? 0 : alert?.level === 'red' ? 1 : 2;
};

// Kelas kartu untuk highlight (background + border) - dipakai kartu desktop & HP.
export const poShippingAlertCardClass = (po: any): string | null => {
  const alert = getPoShippingAlert(po);
  if (alert?.level === 'blue') return 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800';
  if (alert?.level === 'red') return 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800';
  return null;
};

const formatMarkDate = (val: any): string => {
  const ms = toMs(val);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

interface MarkButtonProps {
  checked: boolean;
  date: any;
  checkedLabel: string;
  uncheckedLabel: string;
  confirmLabel: string;
  editable: boolean;
  locked?: boolean;
  lockedTitle?: string;
  onSet: (checked: boolean) => void;
}

const MarkButton: React.FC<MarkButtonProps> = ({ checked, date, checkedLabel, uncheckedLabel, confirmLabel, editable, locked, lockedTitle, onSet }) => {
  const [confirmingUncheck, setConfirmingUncheck] = useState(false);
  if (!editable && !checked) return null;

  const dateLabel = formatMarkDate(date);
  const label = checked ? `${checkedLabel}${dateLabel ? ` · ${dateLabel}` : ''}` : uncheckedLabel;
  const clickable = editable && !locked;

  if (confirmingUncheck && clickable && checked) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-2 flex-wrap px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-[12px] font-text"
      >
        <span className="text-neutral-700 dark:text-neutral-200">{confirmLabel}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmingUncheck(false); }}
          className="px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700 font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
        >
          Tidak
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmingUncheck(false); onSet(false); }}
          className="px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 font-semibold text-red-700 dark:text-red-400 hover:bg-red-100 cursor-pointer"
        >
          Ya, batalkan
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!clickable) return;
        if (checked) setConfirmingUncheck(true);
        else onSet(true);
      }}
      disabled={!clickable}
      title={!editable ? 'PO sudah diterima/dibatalkan' : locked ? lockedTitle : undefined}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[12px] font-semibold font-text transition select-none ${
        checked
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400'
          : locked
            ? 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-400 dark:text-neutral-600'
            : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400'
      } ${clickable ? 'cursor-pointer' : locked ? 'cursor-not-allowed' : 'cursor-default border-dashed'}`}
    >
      <span className={`w-4 h-4 rounded flex items-center justify-center border-[1.5px] shrink-0 ${
        checked ? 'bg-emerald-600 border-emerald-600 text-white' : locked ? 'border-neutral-300 dark:border-neutral-700' : 'border-neutral-400 dark:border-neutral-500'
      }`}>
        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
};

export const SellerShippedChecklist: React.FC<SellerShippedChecklistProps> = ({ po, onChange, className = '' }) => {
  const editable = po.status === 'pending' || po.status === 'partial';
  const isShipped = !!po.isShipped;
  const isArrived = !!po.isArrivedAtForwarder;
  if (!editable && !isShipped && !isArrived) return null;
  const alert = getPoShippingAlert(po);

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {alert && (
        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold font-text ${
          alert.level === 'blue'
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
            : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
        }`}>
          {alert.level === 'blue' ? `${alert.days} hari belum dikirim penjual` : `${alert.days} hari belum sampai di ekspedisi`}
        </span>
      )}
      <MarkButton
        checked={isShipped}
        date={po.shippedAt}
        checkedLabel="Dikirim penjual"
        uncheckedLabel="Tandai dikirim penjual"
        confirmLabel={isArrived ? 'Batalkan dikirim penjual? Tanda sampai di ekspedisi ikut dihapus.' : 'Batalkan tanda dikirim penjual?'}
        editable={editable}
        onSet={(checked) => onChange(po, 'shipped', checked)}
      />
      <MarkButton
        checked={isArrived}
        date={po.arrivedAtForwarderAt}
        checkedLabel="Sampai di ekspedisi"
        uncheckedLabel="Tandai sampai di ekspedisi"
        confirmLabel="Batalkan tanda sampai di ekspedisi?"
        editable={editable}
        locked={!isShipped}
        lockedTitle='Centang "Dikirim penjual" dulu'
        onSet={(checked) => onChange(po, 'arrived', checked)}
      />
    </div>
  );
};
