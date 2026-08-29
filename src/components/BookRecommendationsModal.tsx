import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Lightbulb } from 'lucide-react';
import { Book, InventoryRecord } from '../types';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass, MODAL_TIERS } from '../lib/use-modal-esc';

interface BookRecommendationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  referenceBookIds: string[];
  referenceCategories: string[];
  books: Book[];
  inventories: InventoryRecord[];
}

export const BookRecommendationsModal: React.FC<BookRecommendationsModalProps> = ({
  isOpen,
  onClose,
  referenceBookIds,
  referenceCategories,
  books,
  inventories
}) => {
  const { sidebarHidden } = useSidebar();
  useModalEsc(isOpen, onClose);

  if (!isOpen) return null;

  // Find recommendations
  const READY_STOCK_COUNT = 10;
  const BESTSELLER_COUNT = 15;

  // Helper to interleave books by category
  const interleaveBooks = (booksList: any[]) => {
    const groups: Record<string, any[]> = {};
    referenceCategories.forEach(c => groups[c] = []);
    
    booksList.forEach(b => {
      const catArray = Array.isArray(b.category) ? b.category : [b.category];
      const matchedCategory = referenceCategories.find(c => catArray.includes(c));
      if (matchedCategory && groups[matchedCategory]) {
        groups[matchedCategory].push(b);
      }
    });

    const interleaved: any[] = [];
    let added = true;
    let idx = 0;
    while (added) {
      added = false;
      for (const cat of referenceCategories) {
        if (groups[cat] && groups[cat].length > idx) {
          interleaved.push(groups[cat][idx]);
          added = true;
        }
      }
      idx++;
    }
    return interleaved;
  };

  // Filter books by category, excluding reference books
  const candidates = books.filter(b => {
    const catArray = Array.isArray(b.category) ? b.category : [b.category];
    const isMatch = catArray.some(c => referenceCategories.includes(c));
    return isMatch && !referenceBookIds.includes(b.id);
  });

  // Calculate soldQty from inventory
  const candidatesWithStats = candidates.map(b => {
    const inv = inventories.find(i => i.bookId === b.id);
    const readyStock = inv?.endingStock || 0;
    const soldQty = inv?.totalDispatched || 0;
    return { ...b, readyStock, soldQty };
  });

  // Best sellers: sort by soldQty desc, then interleave
  const sortedBySold = [...candidatesWithStats].sort((a, b) => b.soldQty - a.soldQty);
  const bestSellers = interleaveBooks(sortedBySold).slice(0, BESTSELLER_COUNT);

  // Ready stock: sort by ready stock popularity, then interleave
  const sortedReadyStock = [...candidatesWithStats]
    .filter(b => b.readyStock > 0)
    .sort((a, b) => b.soldQty - a.soldQty);
  const finalReadyStockList = interleaveBooks(sortedReadyStock).slice(0, READY_STOCK_COUNT);

  const formatPrice = (priceCents: number) => {
    return 'NT$ ' + (priceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const copyBookInfo = async (book: any) => {
    const textParts = [
      book.bookName,
      '',
      'Deskripsi:',
      book.description || '-',
      '',
      `Harga Umum: ${formatPrice(book.generalPrice)}`
    ];
    
    if (book.cover) {
      textParts.push('', `Gambar: ${book.cover}`);
    }
    const text = textParts.join('\n');

    try {
      if (book.cover && navigator.clipboard && (window as any).ClipboardItem) {
        const res = await fetch(book.cover);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
            'text/plain': new Blob([text], { type: 'text/plain' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch (err) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        alert('Gagal menyalin ke clipboard. Coba lagi.');
      }
    }
  };

  const RecoCard: React.FC<{ book: any, type: 'ready' | 'hot' }> = ({ book, type }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      await copyBookInfo(book);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };

    return (
      <div className="flex-none w-[140px] border border-[#dde6f4] rounded-xl p-2.5 bg-white flex flex-col gap-2">
        <div className="w-full aspect-square rounded-lg bg-[#eaf1fb] text-[#2b5a9e] flex items-center justify-center overflow-hidden">
          {book.cover ? (
            <img src={book.cover} alt={book.bookName} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center opacity-50">
              <Lightbulb className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="text-[12.5px] font-medium text-[#1f2937] leading-snug line-clamp-2 min-h-[32px]">
          {book.bookName}
        </div>
        <div>
          {type === 'ready' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold font-lexend px-2 py-0.5 rounded-full bg-[#eaf2e8] text-[#5f7a5a]">
              Stok Aman
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold font-lexend px-2 py-0.5 rounded-full bg-[#fdf1e9] text-[#a8632f]">
              🔥 {book.soldQty} terjual
            </span>
          )}
        </div>
        <div className="font-numeric font-bold text-[13px] text-[#1f2937]">
          {formatPrice(book.generalPrice)}
        </div>
        <button
          onClick={handleCopy}
          className={`mt-0.5 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg font-lexend font-semibold text-[11.5px] transition-colors ${copied ? 'bg-[#2b5a9e] text-white' : 'bg-[#8fae87] hover:bg-[#5f7a5a] text-white'}`}
        >
          {copied ? 'Tersalin!' : 'Copy'}
        </button>
      </div>
    );
  };

  return createPortal(
    <div 
      className={getModalOverlayClass(sidebarHidden, MODAL_TIERS.DIALOG)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-2xl w-[92%] max-w-xl animate-scaleIn flex flex-col max-h-[90vh] my-auto border border-neutral-200 dark:border-neutral-800" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#8fae87] p-4 flex items-start justify-between">
          <div>
            <h2 className="text-[20px] font-bold text-white font-lexend m-0">Rekomendasi Buku</h2>
          </div>
          <button onClick={onClose} aria-label="Tutup rekomendasi" className="text-white/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto font-text flex flex-col gap-5">
          {finalReadyStockList.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="font-lexend text-[13px] font-semibold text-[#1f2937] dark:text-neutral-200">Ready Stok</span>
                <span className="font-text text-[10.5px] font-semibold text-[#67707d] dark:text-neutral-400 bg-[#f4f8fd] dark:bg-neutral-800 border border-[#dde6f4] dark:border-neutral-700 px-2 py-0.5 rounded-full">
                  {finalReadyStockList.length} buku
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x">
                {finalReadyStockList.map(b => <RecoCard key={b.id} book={b} type="ready" />)}
              </div>
            </div>
          )}

          {bestSellers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="font-lexend text-[13px] font-semibold text-[#1f2937] dark:text-neutral-200">Buku Terlaris</span>
                <span className="font-text text-[10.5px] font-semibold text-[#67707d] dark:text-neutral-400 bg-[#f4f8fd] dark:bg-neutral-800 border border-[#dde6f4] dark:border-neutral-700 px-2 py-0.5 rounded-full">
                  {bestSellers.length} buku
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x">
                {bestSellers.map(b => <RecoCard key={b.id} book={b} type="hot" />)}
              </div>
            </div>
          )}
          
          {finalReadyStockList.length === 0 && bestSellers.length === 0 && (
            <div className="text-center py-8 text-neutral-500 text-sm">
              Tidak ada rekomendasi buku untuk kategori ini.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
