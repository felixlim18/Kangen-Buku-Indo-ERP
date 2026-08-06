import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSidebar } from '../../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../../lib/use-modal-esc';

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
      /* Opted out of the sheet treatment (4th arg): a lightbox is a dark
         viewer, not a card on a scrim, so the full-screen paper panel the
         mobile stylesheet applies would be wrong here. It gets kbi-lightbox
         instead and is styled on its own terms. */
      className={`kbi-lightbox ${getModalOverlayClass(sidebarHidden, 'z-[9999]', '', false)}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
      onClick={onClose}
    >
      <div
        className={`kbi-lightbox__frame relative flex flex-col items-center justify-center max-w-4xl max-h-full transition-all duration-300 transform ${show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Tutup pratinjau"
          className="kbi-lightbox__close absolute -top-10 right-0 sm:-right-10 sm:top-0 p-2 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors backdrop-blur-sm"
        >
          <X className="w-6 h-6" />
        </button>
        
        <div className="rounded-xl overflow-hidden shadow-2xl bg-black flex items-center justify-center relative">
          <img 
            src={imageUrl} 
            alt={title || 'Preview'} 
            className="max-w-full max-h-[75vh] object-contain rounded-xl"
            referrerPolicy="no-referrer"
          />
        </div>
        
        {title && (
          <div className="mt-4 px-4 py-2 bg-neutral-900/90 backdrop-blur-md rounded-lg shadow-lg border border-white/10 max-w-full text-center">
            <p className="text-white font-medium text-sm sm:text-base break-words">
              {title}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
