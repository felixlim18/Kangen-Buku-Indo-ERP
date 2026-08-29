import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSidebar } from '../../lib/sidebar-context';
import { useModalEsc, MODAL_TIERS } from '../../lib/use-modal-esc';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
}

export function ImagePreviewModal({ isOpen, onClose, imageUrl, title }: ImagePreviewModalProps) {
  const [show, setShow] = useState(false);
  const { sidebarHidden } = useSidebar();

  useModalEsc(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setShow(true);
    } else {
      setShow(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`kbi-lightbox fixed inset-0 ${MODAL_TIERS.LIGHTBOX} bg-black/90 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 transition-opacity duration-200 ${show ? 'opacity-100' : 'opacity-0'} left-0 right-0 top-0 bottom-0`}
      onClick={onClose}
    >
      {/* Top Header Bar with Title and 44px Touch Target Close Button */}
      <div
        className="w-full flex items-center justify-between z-50 pt-[calc(env(safe-area-inset-top,0px)+8px)] px-1 sm:px-3 pb-2 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white font-medium text-xs sm:text-sm truncate max-w-[70%] drop-shadow-md">
          {title || 'Pratinjau Foto'}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pratinjau"
          className="w-11 h-11 rounded-full bg-white/20 hover:bg-white/35 active:bg-white/50 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-lg shrink-0 border border-white/20"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Centered Image Container - tapping the backdrop area closes the modal */}
      <div
        className="flex-1 flex items-center justify-center p-2 min-h-0 cursor-pointer overflow-hidden"
        onClick={onClose}
      >
        <div
          className={`relative max-w-4xl max-h-full flex items-center justify-center transition-transform duration-300 ${show ? 'scale-100' : 'scale-95'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageUrl}
            alt={title || 'Preview'}
            className="max-w-full max-h-[72vh] sm:max-h-[76vh] object-contain rounded-2xl shadow-2xl bg-black/40"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Bottom Dismiss Bar */}
      <div
        className="w-full flex items-center justify-center pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 text-white text-xs font-semibold backdrop-blur-md transition-all active:scale-95 cursor-pointer border border-white/20 shadow-md flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          <span>Tutup Pratinjau</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
