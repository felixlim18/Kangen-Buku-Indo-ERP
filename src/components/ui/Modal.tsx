import React, { useEffect, useId } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { useSidebar } from '../../lib/sidebar-context';
import { registerModal, unregisterModal, updateModalLoading } from '../../lib/modal-stack';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  isLoading?: boolean;
  closeOnBackdropClick?: boolean;
  children: React.ReactNode;
  className?: string;
  backdropClassName?: string;
  zIndexClass?: string;
  hideHeader?: boolean;
  headerExtra?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'lg',
  isLoading = false,
  closeOnBackdropClick = true,
  children,
  className = '',
  backdropClassName = '',
  zIndexClass = 'z-40',
  hideHeader = false,
  headerExtra
}) => {
  const { sidebarHidden } = useSidebar();
  const id = useId();

  // Register in modal stack for Esc key
  useEffect(() => {
    if (isOpen) {
      registerModal({ id, onClose, isLoading });
      return () => {
        unregisterModal(id);
      };
    }
  }, [isOpen, id, onClose]);

  // Update loading state in stack
  useEffect(() => {
    if (isOpen) {
      updateModalLoading(id, isLoading);
    }
  }, [isOpen, id, isLoading]);

  if (!isOpen) return null;

  // Size mapping
  let sizeClass = 'max-w-5xl w-[94%]';
  switch (size) {
    case 'sm':
      sizeClass = 'max-w-md w-[90%]';
      break;
    case 'md':
      sizeClass = 'max-w-2xl w-[92%]';
      break;
    case 'lg':
      sizeClass = 'max-w-5xl w-[94%]';
      break;
    case 'xl':
      sizeClass = 'max-w-7xl w-[95%]';
      break;
    case 'full':
      sizeClass = 'max-w-[96%] w-[96%] h-[92vh]';
      break;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnBackdropClick && !isLoading) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className={`kbi-modal-backdrop fixed top-0 bottom-0 right-0 ${
        sidebarHidden ? 'left-16' : 'left-16 sm:left-56'
      } transition-all duration-300 ease-in-out flex items-center justify-center p-3 sm:p-5 lg:p-7 bg-black/60 backdrop-blur-xs ${zIndexClass} overflow-y-auto ${backdropClassName}`}
    >
      <div
        className={`kbi-modal-panel bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl shadow-2xl flex flex-col my-auto transition-all duration-300 overflow-hidden max-h-[92vh] ${sizeClass} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile: a sheet must always offer a way back, even when the desktop
            header is suppressed. Same handler as Close — navigation only. */}
        {hideHeader && (
          <div className="kbi-sheet-backbar md:hidden">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="kbi-sheet-back"
              aria-label="Kembali"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              <span>Kembali</span>
            </button>
          </div>
        )}

        {!hideHeader && (title || subtitle || !isLoading) && (
          <div className="kbi-modal-head px-6 py-4 border-b border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-900/50">
            {/* Mobile-only back affordance; hidden from desktop entirely. */}
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="kbi-sheet-back md:hidden"
              aria-label="Kembali"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <div>
              {title && (
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {headerExtra}
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Tutup (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className="kbi-modal-body flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
};
