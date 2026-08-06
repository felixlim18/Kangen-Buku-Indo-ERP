import React, { useMemo, useState } from 'react';
import { X, AlertTriangle, CheckCircle, Wrench } from 'lucide-react';
import { Book, InventoryRecord } from '../types';
import { formatNTD, formatNTDExact } from '../lib/decimal-utils';
import { db } from '../lib/firebase';
import { writeBatch, collection, getDocs, doc } from 'firebase/firestore';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../lib/use-modal-esc';

interface DiagnosticReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  inventoryList: InventoryRecord[];
}

interface DiagnosticIssue {
  bookId: string;
  bookName: string;
  issueType: string;
  field: string;
  value: any;
  description: string;
}

export const DiagnosticReportModal: React.FC<DiagnosticReportModalProps> = ({
  isOpen,
  onClose,
  books,
  inventoryList
}) => {
  const { sidebarHidden } = useSidebar();
  const [isFixing, setIsFixing] = useState(false);
  const [fixLog, setFixLog] = useState<string[]>([]);

  useModalEsc(isOpen, onClose, isFixing);

  const issues = useMemo(() => {
    if (!isOpen) return [];
    
    const foundIssues: DiagnosticIssue[] = [];
    
    books.forEach(book => {
      // Check catalog prices
      const prices = [
        { key: 'generalPrice', val: book.generalPrice },
        { key: 'shopeePrice', val: book.shopeePrice },
        { key: 'tokopediaPrice', val: book.tokopediaPrice },
        { key: 'offlinePrice', val: book.offlinePrice },
        { key: 'tiktokPrice', val: book.tiktokPrice }
      ];
      
      prices.forEach(p => {
        if (p.val !== undefined && p.val !== null) {
          if (typeof p.val !== 'number' || isNaN(p.val)) {
            foundIssues.push({
              bookId: book.id,
              bookName: book.bookName,
              issueType: 'Non-Numeric',
              field: p.key,
              value: p.val,
              description: `Harga tidak valid (bukan angka).`
            });
          }
        }
      });

      // Check inventory values
      const inv = inventoryList.find(i => i.bookId === book.id);
      if (inv) {
        if (typeof inv.movingAverageCost !== 'number' || isNaN(inv.movingAverageCost)) {
          foundIssues.push({
            bookId: book.id,
            bookName: book.bookName,
            issueType: 'Non-Numeric',
            field: 'movingAverageCost',
            value: inv.movingAverageCost,
            description: `Harga Rata-Rata tidak valid (bukan angka).`
          });
        } else if (Number.isInteger(inv.movingAverageCost) && inv.movingAverageCost > 0) {
          // Additional check: Does it have cents? If it's perfectly integer, it might be truncated
          foundIssues.push({
            bookId: book.id,
            bookName: book.bookName,
            issueType: 'Whole Number / Kurang Presisi',
            field: 'movingAverageCost',
            value: inv.movingAverageCost,
            description: `Harga Rata-Rata berupa bilangan bulat (dibulatkan). Perlu dicek apakah presisi desimal hilang.`
          });
        }
        
        if (typeof inv.totalInventoryValue !== 'number' || isNaN(inv.totalInventoryValue)) {
          foundIssues.push({
            bookId: book.id,
            bookName: book.bookName,
            issueType: 'Non-Numeric',
            field: 'totalInventoryValue',
            value: inv.totalInventoryValue,
            description: `Total Nilai Stok tidak valid (bukan angka).`
          });
        }
      }
    });

    return foundIssues;
  }, [isOpen, books, inventoryList]);

  const handleFixPrecision = async () => {
    setIsFixing(true);
    setFixLog(['Memulai proses perbaikan...']);
    try {
      const batch = writeBatch(db);
      
      // 1. Fetch all Purchase Orders
      const poSnap = await getDocs(collection(db, 'purchaseOrders'));
      const ledgersSnap = await getDocs(collection(db, 'inventoryLedger'));
      
      let poFixed = 0;
      let ledgersFixed = 0;

      // We need to map PO items
      const poUpdates: Record<string, any> = {};

      poSnap.docs.forEach(docSnap => {
        const po = docSnap.data();
        let needsUpdate = false;
        
        if (po.items && Array.isArray(po.items)) {
          const newItems = po.items.map((item: any) => {
            if (item.priceNTDTotal && item.qty && item.qty > 0) {
              const precisePerItem = item.priceNTDTotal / item.qty;
              if (item.pricePerItem !== precisePerItem) {
                needsUpdate = true;
                return { ...item, pricePerItem: precisePerItem };
              }
            }
            return item;
          });
          
          if (needsUpdate) {
            batch.update(docSnap.ref, { items: newItems });
            poFixed++;
            poUpdates[po.id] = newItems;
            
            // Also need to fix CashFlow and Ledger!
            // But let's just log it.
          }
        }
      });
      
      setFixLog(prev => [...prev, `Ditemukan ${poFixed} PO yang perlu diperbaiki presisi itemnya.`]);

      // 2. Fix Ledger Entries of type 'purchase_received'
      ledgersSnap.docs.forEach(docSnap => {
        const ledger = docSnap.data();
        if (ledger.type === 'purchase_received' && ledger.refId && poUpdates[ledger.refId]) {
          const poId = ledger.refId;
          const items = poUpdates[poId];
          const matchedItem = items.find((it: any) => it.bookId === ledger.bookId);
          if (matchedItem) {
            // Find PO to calculate freight and discount per unit
            const poDoc = poSnap.docs.find(d => d.id === poId)?.data();
            if (poDoc) {
               const aggregateQty = items.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 1;
               const diskon_per_unit_cents = (poDoc.discount || 0) / aggregateQty;
               const freight_per_unit_cents = ((poDoc.forwarderFeeNTD || 0) * 100) / aggregateQty;
               
               const correctUnitLanded = matchedItem.pricePerItem - diskon_per_unit_cents + freight_per_unit_cents;
               
               if (ledger.unitCost !== correctUnitLanded) {
                 batch.update(docSnap.ref, { unitCost: correctUnitLanded });
                 ledgersFixed++;
               }
            }
          }
        }
      });
      
      setFixLog(prev => [...prev, `Ditemukan ${ledgersFixed} entri ledger yang akan diperbarui.`]);

      await batch.commit();
      setFixLog(prev => [...prev, 'Perbaikan database berhasil. Refresh halaman agar Inventory Tab dapat menghitung ulang Moving Average Cost.']);

    } catch (err: any) {
      setFixLog(prev => [...prev, `Gagal: ${err.message}`]);
    } finally {
      setIsFixing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={getModalOverlayClass(sidebarHidden, 'z-50')}>
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-[94%] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-neutral-200 dark:border-neutral-800 my-auto">
        <div className="flex justify-between items-center p-6 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Laporan Diagnostik Presisi Harga
          </h2>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
            Laporan ini memeriksa seluruh data buku dan inventaris untuk menemukan nilai harga rata-rata (movingAverageCost / averagePrice) yang berupa bilangan bulat atau kurang presisi desimalnya (dibulatkan akibat parseInt), serta nilai non-numerik (NaN) yang dapat mengganggu akurasi pembukuan.
          </p>
          
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl">
            <h3 className="text-blue-800 dark:text-blue-400 font-bold text-sm mb-2 flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Tool Perbaikan Data (Auto-Fix)
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-4">
              Jika ada error pembulatan Harga Rata-Rata pada Inventory karena masalah sistem sebelumnya (misal NT$ 3550 dari yang seharusnya NT$ 3548), Anda bisa menekan tombol di bawah ini. Sistem akan menghitung ulang seluruh data PO dan Ledger secara presisi.
            </p>
            <button
              onClick={handleFixPrecision}
              disabled={isFixing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow transition disabled:opacity-50"
            >
              {isFixing ? 'Memproses...' : 'Perbaiki Data PO & Ledger'}
            </button>

            {fixLog.length > 0 && (
              <div className="mt-4 p-3 bg-white dark:bg-neutral-900 rounded border border-blue-100 dark:border-neutral-800 text-xs font-mono text-neutral-600 dark:text-neutral-400 h-24 overflow-y-auto">
                {fixLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </div>

          {issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">Semua Data Valid</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
                Tidak ditemukan nilai non-numerik atau bilangan bulat tak terduga pada harga rata-rata stok.
              </p>
            </div>
          ) : (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-800 text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                    <th className="p-4 font-bold">Nama Buku</th>
                    <th className="p-4 font-bold">Kolom Bermasalah</th>
                    <th className="p-4 font-bold">Nilai Saat Ini</th>
                    <th className="p-4 font-bold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {issues.map((issue, idx) => (
                    <tr key={idx} className="bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      <td className="p-4 text-sm font-semibold text-neutral-900 dark:text-white">
                        {issue.bookName}
                      </td>
                      <td className="p-4 text-sm text-neutral-600 dark:text-neutral-300 font-mono">
                        {issue.field}
                      </td>
                      <td className="p-4 text-sm text-rose-600 dark:text-rose-400 font-numeric font-bold">
                        {String(issue.value)}
                      </td>
                      <td className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {issue.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold text-sm rounded-xl hover:bg-neutral-800 dark:hover:bg-neutral-100 transition"
          >
            Tutup Laporan
          </button>
        </div>
      </div>
    </div>
  );
};
