import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SalesOrder } from '../types';
import { confirmSalesOrderTransaction } from '../lib/db-helpers';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc } from '../lib/use-modal-esc';

interface BulkProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  menungguOrders: SalesOrder[];
  inventories: any[];
  ledgerEntries: any[];
  purchaseOrders: any[];
  salesOrders: any[];
  damagedRecords: any[];
}

interface RowData {
  orderId: string;
  orderNo: string;
  resi: string;
  customerNote: string;
  status: 'idle' | 'success' | 'error';
  deskripsi: string;
  deskripsiType: '' | 'ok' | 'warn';
}

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatIndoDate(isoStr: string) {
  const d = new Date(isoStr + 'T00:00:00');
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isNotYetDue(isoStr: string) {
  if (!isoStr) return false;
  const requested = startOfDay(new Date(isoStr + 'T00:00:00'));
  const today = startOfDay(new Date());
  return requested.getTime() > today.getTime();
}

export const BulkProcessModal: React.FC<BulkProcessModalProps> = ({
  isOpen,
  onClose,
  menungguOrders,
  salesOrders
}) => {
  const { user } = useAuth();
  const { sidebarHidden } = useSidebar();
  
  const [rows, setRows] = useState<RowData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<{ success: number; warn: number; fail: number } | null>(null);

  useModalEsc(isOpen, onClose, isProcessing);
  
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Filter orders with status 'packed' (Dikemas)
      const allOrders = salesOrders && salesOrders.length > 0 ? salesOrders : menungguOrders;
      const dikemasOrders = (allOrders || []).filter(o => o.status === 'packed');
      
      setRows(dikemasOrders.map(order => ({
        orderId: order.id,
        orderNo: order.orderNumber || order.orderCode || '',
        resi: order.shipment?.shippingNumber || '',
        customerNote: order.customerNote?.trim() || '-',
        status: 'idle',
        deskripsi: '',
        deskripsiType: ''
      })));
      setSummary(null);
    }
  }, [isOpen, salesOrders, menungguOrders]);

  if (!isOpen) return null;

  const handleInputChange = (r: number, value: string) => {
    const newRows = [...rows];
    newRows[r].resi = value;
    if (newRows[r].status === 'error') newRows[r].status = 'idle';
    newRows[r].deskripsi = '';
    newRows[r].deskripsiType = '';
    setRows(newRows);
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
        newRows[rowIndex].resi = cells[0]?.trim() || line.trim();
        newRows[rowIndex].status = 'idle';
        newRows[rowIndex].deskripsi = '';
        newRows[rowIndex].deskripsiType = '';
      }
    });

    setRows(newRows);
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

  return (
    <div
      /* Overlay string left exactly as it was so desktop is untouched; only
         kbi-modal-backdrop is added, which is what earns the mobile sheet
         treatment. Deliberately NOT routed through getModalOverlayClass: this
         overlay wants a darker scrim and roomier padding than the default, and
         expressing those as `!`-prefixed overrides would break the sheet —
         layer order reverses for !important, so a layered Tailwind `!p-4`
         outranks the unlayered `padding: 0 !important` in mobile.css. */
      className={`kbi-modal-backdrop fixed top-0 bottom-0 right-0 ${
        sidebarHidden ? 'left-16' : 'left-16 sm:left-56'
      } transition-all duration-300 ease-in-out bg-neutral-950/60 backdrop-blur-xs z-40 flex items-center justify-center p-4 sm:p-8 overflow-y-auto`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-[92%] max-w-[920px] shadow-2xl overflow-hidden flex flex-col my-auto" style={{ filter: 'drop-shadow(0 30px 80px rgba(6,14,30,0.55))' }}>
        
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
        <div className="p-5 pb-3">
          {summary && (
            <div className="flex flex-wrap gap-4 px-4 py-3 bg-[#f3f7fc] border border-[#e5edf9] rounded-lg text-[12.5px] mb-3 items-center">
              {summary.success > 0 && <span className="text-[#12876b] font-medium inline-flex items-center gap-1">✓ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.success}</span> order berhasil diproses</span>}
              {summary.warn > 0 && <span className="text-[#a9711f] font-medium inline-flex items-center gap-1">⚠ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.warn}</span> belum waktunya dikirim</span>}
              {summary.fail > 0 && <span className="text-[#b8433a] font-medium inline-flex items-center gap-1">✕ <span className="font-['IBM_Plex_Mono'] font-bold">{summary.fail}</span> gagal diproses</span>}
            </div>
          )}

          <div className="border border-[#dde4f0] rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto relative">
              <div className="grid grid-cols-[40px_1.2fr_1.5fr_2fr] gap-0 min-w-[680px] bg-[#f1f6fc] border-b border-[#dde4f0]">
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-center text-center p-2.5 flex items-center">#</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-center text-center p-2.5 flex items-center">Nomor Order</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-center text-center p-2.5 flex items-center">No Resi</span>
                <span className="font-['Space_Grotesk'] text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5f6b7d] justify-start p-2.5 flex items-center pl-4">Note Dari Customer</span>
              </div>
              <div 
                className="max-h-[400px] overflow-y-auto" 
                ref={gridRef}
                onPaste={handlePaste}
              >
                {rows.length === 0 ? (
                  <div className="p-8 text-center text-[#525c6d] font-['Inter'] text-sm">
                    Tidak ada orderan berstatus Dikemas saat ini.
                  </div>
                ) : (
                  rows.map((row, i) => (
                    <div key={row.orderId || i} className={`grid grid-cols-[40px_1.2fr_1.5fr_2fr] gap-0 min-w-[680px] border-b border-[#dde4f0] transition-colors items-center
                      ${row.status === 'success' ? 'bg-[#e5f5f0] shadow-[inset_3px_0_0_#12876b]' : row.status === 'error' ? 'bg-[#fbebea] shadow-[inset_3px_0_0_#b8433a]' : i % 2 !== 0 ? 'bg-[#f3f7fc]' : 'bg-white'}
                    `}>
                      <div className="flex items-center justify-center text-[11px] text-[#98a1b0] font-['IBM_Plex_Mono'] border-r border-[#dde4f0] py-2.5">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      
                      {/* Nomor Order (Disabled / Read-only) */}
                      <div className="flex items-center justify-center px-2.5 py-2 border-r border-[#dde4f0]">
                        <span className="font-['IBM_Plex_Mono'] text-[12.5px] font-semibold text-[#173a6b]">
                          {row.orderNo}
                        </span>
                      </div>

                      {/* No Resi (Editable input) */}
                      <div className="border-r border-[#dde4f0] h-full flex items-center">
                        <input 
                          type="text" 
                          className="w-full h-full border-none bg-transparent px-2.5 py-2 font-['IBM_Plex_Mono'] text-[12.5px] tracking-[0.2px] text-[#101826] text-center focus:outline-2 focus:-outline-offset-2 focus:outline-[#2b5a9e] focus:bg-white placeholder:font-['Inter'] placeholder:text-[#98a1b0] disabled:text-[#525c6d]"
                          value={row.resi}
                          placeholder="Ketik / Paste No Resi"
                          disabled={row.status === 'success'}
                          data-row={i}
                          onChange={e => handleInputChange(i, e.target.value)}
                        />
                      </div>

                      {/* Note Dari Customer */}
                      <div className="px-4 py-2 font-['Inter'] text-[11.5px] leading-[1.35] text-[#374151]">
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
                    </div>
                  ))
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
    </div>
  );
};
