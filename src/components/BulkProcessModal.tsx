import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, Undo2, Send, Copy, ExternalLink } from 'lucide-react';
import { SalesOrder } from '../types';
import { confirmSalesOrderTransaction } from '../lib/db-helpers';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useSidebar } from '../lib/sidebar-context';
import { ImagePreviewModal } from './ui/ImagePreviewModal';
import { useModalEsc, MODAL_TIERS } from '../lib/use-modal-esc';

interface BulkProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  menungguOrders: SalesOrder[];
  inventories: any[];
  ledgerEntries: any[];
  purchaseOrders: any[];
  salesOrders: any[];
  damagedRecords: any[];
  books: any[];
}

interface RowData {
  orderId: string;
  orderNo: string;
  resi: string;
  customerNote: string;
  status: 'idle' | 'success' | 'error';
  deskripsi: string;
  deskripsiType: '' | 'ok' | 'warn';
  order: SalesOrder;
}

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function parseDateRobust(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  const ymd = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 0, 0, 0, 0);
  }

  const dmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10), 0, 0, 0, 0);
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

function formatIndoDate(isoStr: string) {
  const d = parseDateRobust(isoStr);
  if (!d) return isoStr;
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function isNotYetDue(isoStr: string) {
  const requested = parseDateRobust(isoStr);
  if (!requested) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return requested.getTime() > today.getTime();
}

export const BulkProcessModal: React.FC<BulkProcessModalProps> = ({
  isOpen,
  onClose,
  menungguOrders,
  salesOrders,
  books
}) => {
  const { user } = useAuth();
  const { sidebarHidden } = useSidebar();

  const formatPhoneNumber = (phone?: string) => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };
  
  const [rows, setRows] = useState<RowData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<{ success: number; warn: number; fail: number } | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ url: string, x: number, y: number, width: number, align?: 'center' | 'right' } | null>(null);
  const [expandedItems, setExpandedItems] = useState<{ [key: string]: boolean }>({});
  const timeoutRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useModalEsc(isOpen, onClose, isProcessing);
  
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Filter orders with status 'packed' (Dikemas)
      const allOrders = salesOrders && salesOrders.length > 0 ? salesOrders : menungguOrders;
      const dikemasOrders = (allOrders || []).filter(o => o.status === 'packed');
      
      const platformOrderMap: { [key: string]: number } = {
        'shopee': 1,
        'iopenmall': 2,
        'post office': 3,
        'familymart': 4,
        '7-eleven': 5,
      };

      dikemasOrders.sort((a, b) => {
        const pA = (a.platformOrder || '').toLowerCase();
        const pB = (b.platformOrder || '').toLowerCase();
        const scoreA = platformOrderMap[pA] || 999;
        const scoreB = platformOrderMap[pB] || 999;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return pA.localeCompare(pB);
      });
      
      setRows(dikemasOrders.map(order => ({
        orderId: order.id,
        orderNo: order.orderNumber || order.orderCode || '',
        resi: order.shipment?.shippingNumber || '',
        customerNote: order.customerNote?.trim() || '-',
        status: 'idle',
        deskripsi: '',
        deskripsiType: '',
        order: order
      })));
      setSummary(null);
    }
  }, [isOpen, salesOrders, menungguOrders]);

  if (!isOpen) return null;

  const handleInputChange = (r: number, value: string) => {
    const newRows = [...rows];
    newRows[r].resi = value.toUpperCase().replace(/\s/g, '');
    if (newRows[r].status === 'error') newRows[r].status = 'idle';
    newRows[r].deskripsi = 'Menyimpan...';
    newRows[r].deskripsiType = 'warn';
    setRows(newRows);

    const orderId = newRows[r].orderId;
    if (timeoutRefs.current[orderId]) {
      clearTimeout(timeoutRefs.current[orderId]);
    }
    timeoutRefs.current[orderId] = setTimeout(async () => {
      try {
        const orderRef = doc(db, 'salesOrders', orderId);
        await updateDoc(orderRef, {
          'shipment.shippingNumber': newRows[r].resi,
          updatedAt: Timestamp.now()
        });
        setRows(prev => {
          const next = [...prev];
          const idx = next.findIndex(x => x.orderId === orderId);
          if (idx !== -1) {
             next[idx].deskripsi = 'Tersimpan';
             next[idx].deskripsiType = 'ok';
          }
          return next;
        });
      } catch (err) {
        console.error('Failed to auto-save resi', err);
      }
    }, 1000);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT') return;

    const clipboard = e.clipboardData.getData('text');
    if (!clipboard) return;

    e.preventDefault();

    const startRow = parseInt(target.dataset.row || '0', 10);
    const lines = clipboard.replace(/\r/g, '').split('\n').filter(l => l.length > 0);
    
    const newRows = [...rows];

    lines.forEach((line, i) => {
      const rowIndex = startRow + i;
      if (rowIndex < newRows.length && newRows[rowIndex].status !== 'success') {
        const cells = line.split('\t');
        newRows[rowIndex].resi = (cells[0] || line).toUpperCase().replace(/\s/g, '');
        newRows[rowIndex].status = 'idle';
        newRows[rowIndex].deskripsi = '';
        newRows[rowIndex].deskripsiType = '';
      }
    });

    setRows(newRows);
  };

  const handleRowProcess = async (rowIndex: number) => {
    const newRows = [...rows];
    const row = newRows[rowIndex];
    const orderNo = row.orderNo.trim();
    const resi = row.resi.trim();
    if (!orderNo || !resi || row.status === 'success') return;

    try {
      await confirmSalesOrderTransaction(row.order.id, user?.uid || 'anonymous');
      const orderRef = doc(db, 'salesOrders', row.order.id);
      const finalOrderNo = row.order.orderNumber || row.order.orderCode || '';
      await updateDoc(orderRef, {
        status: 'shipped',
        shippedAt: Timestamp.now(),
        orderNumber: finalOrderNo,
        shipment: {
          orderNumber: finalOrderNo,
          shippingNumber: resi,
          shippingDate: Timestamp.fromDate(new Date()),
          arrangedAt: Timestamp.now()
        },
        updatedAt: Timestamp.now()
      });
      row.status = 'success';
      row.deskripsi = 'Berhasil dikirim';
      row.deskripsiType = 'ok';
      setSummary(prev => prev ? { ...prev, success: prev.success + 1 } : { success: 1, warn: 0, fail: 0 });
    } catch (err: any) {
      row.status = 'error';
      row.deskripsi = err.message || 'Gagal memproses';
      setSummary(prev => prev ? { ...prev, fail: prev.fail + 1 } : { success: 0, warn: 0, fail: 1 });
    }
    setRows(newRows);
  };

  const handleRowRevert = async (rowIndex: number) => {
    const row = rows[rowIndex];
    try {
      const orderRef = doc(db, 'salesOrders', row.order.id);
      await updateDoc(orderRef, {
        status: 'confirmed',
        updatedAt: Timestamp.now()
      });
      setRows(prev => prev.filter((_, i) => i !== rowIndex));
    } catch (err: any) {
      console.error('Revert failed:', err);
    }
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    let notYetDueCount = 0;

    const newRows = [...rows];
    const sourceOrders = salesOrders && salesOrders.length > 0 ? salesOrders : menungguOrders;

    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i];
      const orderNo = row.orderNo.trim();
      const resi = row.resi.trim();
      
      if (!orderNo || !resi || row.status === 'success') continue;

      const order = sourceOrders.find(o => o.id === row.orderId || o.orderNumber === orderNo || o.orderCode === orderNo);

      if (!order) {
        row.status = 'error';
        row.deskripsi = 'Order tidak ditemukan';
        errorCount++;
        continue;
      }

      try {
        await confirmSalesOrderTransaction(order.id, user?.uid || 'anonymous');
        
        const orderRef = doc(db, 'salesOrders', order.id);
        const finalOrderNo = order.orderNumber || order.orderCode || '';
        await updateDoc(orderRef, {
          status: 'shipped',
          shippedAt: Timestamp.now(),
          orderNumber: finalOrderNo,
          shipment: {
            orderNumber: finalOrderNo,
            shippingNumber: resi,
            shippingDate: Timestamp.fromDate(new Date()),
            arrangedAt: Timestamp.now()
          },
          updatedAt: Timestamp.now()
        });

        row.status = 'success';
        successCount++;

        if (order.estimatedShippingDate && isNotYetDue(order.estimatedShippingDate)) {
          row.deskripsi = `Belum Waktunya Dikirim, Diminta Kirim Tanggal ${formatIndoDate(order.estimatedShippingDate)}`;
          row.deskripsiType = 'warn';
          notYetDueCount++;
        } else {
          row.deskripsi = 'Siap Diproses';
          row.deskripsiType = 'ok';
        }
      } catch (err: any) {
        row.status = 'error';
        row.deskripsi = err.message || 'Gagal memproses (Cek stok)';
        errorCount++;
      }
    }

    setRows(newRows);
    setSummary({ success: successCount, warn: notYetDueCount, fail: errorCount });
    setIsProcessing(false);
  };

  const filledCount = rows.filter(r => r.resi.trim()).length;

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 transition-all duration-300 ease-in-out bg-neutral-950/70 backdrop-blur-xs ${MODAL_TIERS.DIALOG} flex items-center justify-center p-4 sm:p-8 overflow-y-auto`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-[96%] max-w-[1400px] h-[92vh] shadow-2xl overflow-hidden flex flex-col my-auto" style={{ filter: 'drop-shadow(0 30px 80px rgba(6,14,30,0.55))' }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#173a6b] via-[#2b5a9e] to-[#3d6eb0] text-white px-6 pt-5 pb-0">
          <div className="flex items-start justify-between gap-3 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 font-['Space_Grotesk'] text-[10.5px] font-semibold tracking-[1.4px] uppercase text-white/65 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7fd9b8]"></span>
                Pemrosesan Batch
              </div>
              <h2 className="font-['Space_Grotesk'] text-xl font-bold m-0 tracking-[-0.2px]">Proses Massal Pesanan Dikemas</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-end gap-[2px] h-3 px-0.5 opacity-55">
            {Array.from({ length: 90 }).map((_, i) => (
              <span key={i} className="block bg-white/80 w-[2px]" style={{ height: `${[40, 60, 100, 75][Math.floor(Math.random() * 4)]}%` }}></span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 pb-3 flex flex-col flex-1 min-h-0">
          {summary && (
            <div className="flex flex-wrap gap-4 px-4 py-3 bg-[#f3f7fc] border border-[#e5edf9] rounded-lg text-[12.5px] mb-3 items-center">
              {summary.success > 0 && <span className="text-[#12876b] font-medium inline-flex items-center gap-1">✓ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.success}</span> order berhasil diproses</span>}
              {summary.warn > 0 && <span className="text-[#a9711f] font-medium inline-flex items-center gap-1">⚠ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.warn}</span> belum waktunya dikirim</span>}
              {summary.fail > 0 && <span className="text-[#b8433a] font-medium inline-flex items-center gap-1">✕ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.fail}</span> gagal diproses</span>}
            </div>
          )}

          <div className="border border-[#dde4f0] rounded-lg overflow-hidden bg-white flex flex-col flex-1 min-h-0">
            <div className="overflow-x-auto relative flex flex-col flex-1 min-h-0">
              <div className="grid grid-cols-[1.2fr_1.5fr_1fr_2.5fr_60px_1.5fr_70px] gap-0 min-w-[1100px] bg-[#f1f6fc] border-b border-[#dde4f0] flex-none">
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-4">Nomor Order</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-4 border-l border-[#dde4f0]">Nomor Resi</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-4 border-l border-[#dde4f0]">Platform Order</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-4 border-l border-[#dde4f0]">Nama Barang</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-center text-center p-2.5 flex items-center border-l border-[#dde4f0]">Qty</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start text-left p-2.5 flex items-center pl-4 border-l border-[#dde4f0]">Note Customer</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-center text-center p-2.5 flex items-center border-l border-[#dde4f0]">Aksi</span>
              </div>
              <div 
                className="flex-1 overflow-y-auto" 
                ref={gridRef}
                onPaste={handlePaste}
              >
                {rows.length === 0 ? (
                  <div className="p-8 text-center text-[#525c6d] font-['Inter'] text-sm">
                    Tidak ada orderan berstatus Dikemas saat ini.
                  </div>
                ) : (
                  rows.map((row, i) => {
                    return (
                    <React.Fragment key={row.orderId || i}>
                      <div className={`grid grid-cols-[1.2fr_1.5fr_1fr_2.5fr_60px_1.5fr_70px] gap-0 min-w-[1100px] border-b border-[#dde4f0] transition-colors items-stretch
                        ${row.status === 'success' ? 'bg-[#e5f5f0] shadow-[inset_3px_0_0_#12876b]' : row.status === 'error' ? 'bg-[#fbebea] shadow-[inset_3px_0_0_#b8433a]' : i % 2 !== 0 ? 'bg-[#f3f7fc]' : 'bg-white'}
                      `}>
                      
                      {/* Nomor Order */}
                      <div className="flex items-center px-4 py-2 border-r border-[#dde4f0] relative h-full">
                        <div className="flex flex-col justify-center">
                          <span className="font-['IBM_Plex_Mono'] text-[13.5px] font-semibold text-[#173a6b]">
                            {row.orderNo}
                          </span>
                        </div>
                        <div 
                          className="ml-auto text-neutral-400 hover:text-brand-500 cursor-pointer"
                          onClick={() => setActiveTooltip(activeTooltip === row.orderId ? null : row.orderId)}
                        >
                          <Eye className="w-4.5 h-4.5" />
                        </div>
                        {activeTooltip === row.orderId && (
                           <div className="absolute top-[60%] mt-2 left-4 w-[320px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.12)] border border-[#e5e7eb] rounded-xl p-4 z-50 text-left cursor-default flex flex-col" onClick={e => e.stopPropagation()}>
                             <div className="flex justify-between items-center mb-3">
                               <span className="font-semibold text-[13px] text-neutral-800 tracking-tight">Detail Pesanan</span>
                               <X className="w-3.5 h-3.5 cursor-pointer text-neutral-400 hover:text-neutral-600 shrink-0" onClick={() => setActiveTooltip(null)} />
                             </div>
                             
                             <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
                               {/* Nama Pembeli */}
                               <div className="flex flex-col group items-start">
                                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Nama</span>
                                 <div className="flex items-center gap-1.5">
                                   <span className="text-[11.5px] text-neutral-800 font-medium truncate" title={row.order.customerName}>{row.order.customerName || '-'}</span>
                                   {row.order.customerName && (
                                      <button onClick={() => navigator.clipboard.writeText(row.order.customerName || '')} className="text-neutral-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100" title="Copy">
                                        <Copy className="w-3 h-3" />
                                      </button>
                                   )}
                                 </div>
                               </div>

                               {/* No Handphone */}
                               <div className="flex flex-col group items-start">
                                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">No. HP</span>
                                 <div className="flex items-center gap-1.5">
                                   <span className="text-[11.5px] text-neutral-800 font-medium truncate font-['Inter']">{formatPhoneNumber(row.order.phoneNumber)}</span>
                                   {row.order.phoneNumber && (
                                      <button onClick={() => navigator.clipboard.writeText(row.order.phoneNumber || '')} className="text-neutral-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100" title="Copy">
                                        <Copy className="w-3 h-3" />
                                      </button>
                                   )}
                                 </div>
                               </div>

                               {/* Opsi Pengiriman */}
                               <div className="flex flex-col">
                                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Pengiriman</span>
                                 <span className="text-[11.5px] text-neutral-800 font-medium truncate">{row.order.pickupLogistics || '-'}</span>
                               </div>

                               {/* Total Belanja */}
                               <div className="flex flex-col">
                                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Total</span>
                                 <span className="text-[11.5px] font-bold text-[#173a6b]">NT$ {((row.order.totalPrice || 0) / 100).toLocaleString()}</span>
                               </div>
                             </div>

                             {/* Kode / Alamat */}
                             <div className="flex flex-col bg-neutral-50 rounded-lg p-2.5 mb-3 border border-neutral-100 group">
                               <div className="flex items-center gap-2 mb-1">
                                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Kode / Alamat</span>
                                 <div className="flex gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {row.order.addressPhotoUrl && (
                                      <div className="relative flex">
                                        <div 
                                          className="text-neutral-400 hover:text-brand-600 transition-colors flex items-center gap-1 bg-white border border-neutral-200 px-1.5 py-0.5 rounded shadow-sm cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewImage(row.order.addressPhotoUrl);
                                            setHoverPreview(null);
                                          }}
                                          onMouseEnter={(e) => {
                                            if (!row.order.addressPhotoUrl) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setHoverPreview({ url: row.order.addressPhotoUrl, x: rect.right, y: rect.top, width: 220, align: 'right' });
                                          }}
                                          onMouseLeave={() => setHoverPreview(null)}
                                        >
                                          <Eye className="w-3 h-3" />
                                          <span className="text-[8px] font-bold uppercase tracking-wider">View</span>
                                        </div>
                                      </div>
                                    )}
                                    {row.order.pickupDetails && (
                                      <button onClick={() => navigator.clipboard.writeText(row.order.pickupDetails || '')} className="text-neutral-400 hover:text-brand-600 transition-colors" title="Copy Alamat">
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                 </div>
                               </div>
                               <span className="text-[11px] text-neutral-700 font-medium line-clamp-2 leading-relaxed" title={row.order.pickupDetails}>{row.order.pickupDetails || '-'}</span>
                             </div>
                           </div>
                        )}

                      </div>

                      {/* No Resi (Editable input) */}
                      <div className="border-r border-[#dde4f0] h-full flex items-center">
                        <input 
                          type="text" 
                          className="w-full h-full border-none bg-transparent px-4 py-2 font-['IBM_Plex_Mono'] text-[13.5px] tracking-[0.2px] text-[#101826] text-left focus:outline-2 focus:-outline-offset-2 focus:outline-[#2b5a9e] focus:bg-white placeholder:font-['Inter'] placeholder:text-[#98a1b0] disabled:text-[#525c6d]"
                          value={row.resi}
                          placeholder="Ketik / Paste No Resi"
                          disabled={row.status === 'success'}
                          data-row={i}
                          onChange={e => handleInputChange(i, e.target.value)}
                        />
                      </div>

                      {/* Platform Order */}
                      <div className="flex flex-col justify-center px-4 py-2 border-r border-[#dde4f0] h-full">
                        <span className="font-['Inter'] text-[12.5px] font-medium text-neutral-800">
                          {row.order.platformOrder || '-'}
                        </span>
                        {row.order.platformChannel && (
                          <span className="font-['Inter'] text-[10px] text-neutral-500 mt-0.5">
                            {row.order.platformChannel}
                          </span>
                        )}
                      </div>

                      {/* Nama Barang & QTY */}
                      <div className="col-span-2 flex flex-col h-full border-r border-[#dde4f0]">
                        {row.order.items?.map((item, idx) => {
                          const coverUrl = item.bookCover || books?.find(b => b.id === item.bookId)?.cover;
                          return (
                            <div key={idx} className={`grid grid-cols-[1fr_60px] flex-1 ${idx !== 0 ? 'border-t border-[#dde4f0]' : ''}`}>
                               {/* Nama Barang */}
                               <div className="flex items-center gap-3 px-3 py-2">
                                 <div 
                                    className="relative rounded shrink-0 overflow-visible border border-neutral-200 cursor-pointer bg-neutral-100"
                                    onClick={(e) => {
                                       e.stopPropagation();
                                       if (coverUrl) setPreviewImage(coverUrl);
                                       setHoverPreview(null);
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!coverUrl) return;
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setHoverPreview({ url: coverUrl, x: rect.left + rect.width / 2, y: rect.top, width: 112, align: 'center' });
                                    }}
                                    onMouseLeave={() => setHoverPreview(null)}
                                 >
                                    {coverUrl ? (
                                      <img src={coverUrl} alt="cover" referrerPolicy="no-referrer" className="w-[32px] h-[44px] object-cover rounded-sm" />
                                    ) : (
                                      <div className="w-[32px] h-[44px] flex items-center justify-center text-[6px] text-neutral-400">No Img</div>
                                    )}
                                 </div>
                                 <span className="text-[12.5px] font-medium text-neutral-800 line-clamp-2 leading-[1.3]">{item.bookName || '-'}</span>
                               </div>
                               {/* Qty */}
                               <div className="flex items-center justify-center font-bold text-[13.5px] text-neutral-900 border-l border-[#dde4f0]">
                                 {item.qty} <span className="text-[10px] ml-0.5 font-normal text-neutral-500">pcs</span>
                               </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Note Dari Customer */}
                      <div className="flex flex-col justify-center px-4 py-2 font-['Inter'] text-[12.5px] leading-[1.35] text-[#374151] border-r border-[#dde4f0] h-full">
                        <div className={`font-medium ${row.customerNote === '-' ? 'text-[#9ca3af] italic' : 'text-[#1f2937]'}`}>
                          {row.customerNote}
                        </div>
                        {row.deskripsi && (
                          <div className={`text-[10.5px] font-semibold mt-1 inline-flex items-center gap-1 ${row.deskripsiType === 'ok' ? 'text-[#12876b]' : row.deskripsiType === 'warn' ? 'text-[#a9711f]' : 'text-[#b8433a]'}`}>
                            {row.deskripsiType === 'ok' ? '✓ ' : row.deskripsiType === 'warn' ? '⚠ ' : '✕ '}
                            {row.deskripsi}
                          </div>
                        )}
                      </div>

                      {/* Aksi */}
                      <div className="px-2 py-2 flex items-center justify-center gap-2 h-full">
                        <button
                          onClick={() => handleRowRevert(i)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded transition"
                          title="Kembalikan ke status Confirmed"
                        >
                          <Undo2 className="w-4.5 h-4.5" />
                        </button>
                        <button
                          onClick={() => handleRowProcess(i)}
                          disabled={row.status === 'success' || !row.resi.trim()}
                          className="p-1.5 text-brand-600 hover:bg-brand-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Proses Kirim (Baris ini)"
                        >
                          <Send className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2.5 px-6 py-4 border-t border-[#dde4f0] bg-[#e9edf5]">
          <span className="font-['IBM_Plex_Mono'] text-[11.5px] text-[#525c6d]">{filledCount} / {rows.length} resi terisi</span>
          <div className="flex gap-2.5">
            <button onClick={onClose} className="bg-white hover:bg-[#f3f7fc] text-[#525c6d] border border-[#dde4f0] font-['Space_Grotesk'] font-semibold text-[13px] px-4.5 py-2 rounded-lg transition-colors cursor-pointer">
              Batal
            </button>
            <button 
              onClick={handleProcess} 
              disabled={isProcessing || rows.length === 0} 
              className="bg-[#2b5a9e] hover:bg-[#173a6b] text-white border-none font-['Space_Grotesk'] font-bold text-[13px] tracking-[0.2px] px-5.5 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Memproses...' : 'Proses'}
            </button>
          </div>
        </div>
      </div>

      {previewImage && (
        <ImagePreviewModal
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage}
          title="Pratinjau"
        />
      )}

      {hoverPreview && !previewImage && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed z-[9999] bg-white p-1.5 rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.2)] border border-neutral-200 pointer-events-none"
          style={{ 
            left: hoverPreview.x, 
            top: hoverPreview.y - 8, 
            transform: hoverPreview.align === 'center' ? 'translate(-50%, -100%)' : 'translate(-100%, -100%)',
            width: `${hoverPreview.width}px`
          }}
        >
          <img src={hoverPreview.url} alt="Preview" className="w-full h-auto max-h-[280px] object-contain rounded-md shadow-sm" />
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
};
