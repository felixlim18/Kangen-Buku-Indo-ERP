import { useEffect, useId } from 'react';
import { registerModal, unregisterModal, updateModalLoading } from './modal-stack';

export function useModalEsc(isOpen: boolean, onClose: () => void, isLoading: boolean = false) {
  const id = useId();

  useEffect(() => {
    if (isOpen) {
      registerModal({ id, onClose, isLoading });
      return () => {
        unregisterModal(id);
      };
    }
  }, [isOpen, id, onClose]);

  useEffect(() => {
    if (isOpen) {
      updateModalLoading(id, isLoading);
    }
  }, [isOpen, id, isLoading]);
}

export const MODAL_TIERS = {
  BASE: 'z-40',
  DRAWER: 'z-[10000]',
  DIALOG: 'z-[10020]',
  LIGHTBOX: 'z-[10050]',
} as const;

/**
 * Builds the backdrop class for a dialog.
 *
 * `kbi-modal-backdrop` is what lets the mobile stylesheet turn a centred
 * desktop dialog into a full-screen sheet below 768px. It carries no styling
 * of its own and no rule outside the mobile media block selects it, so adding
 * it is inert on tablet and desktop.
 *
 * Pass `sheet: false` for overlays that are not a card on a scrim — a
 * lightbox, for instance, where a full-bleed paper-coloured panel would be
 * wrong.
 */
export function getModalOverlayClass(
  sidebarHidden: boolean,
  zIndexClass: string = 'z-40',
  extraClasses: string = '',
  sheet: boolean = true,
) {
  return `${sheet ? 'kbi-modal-backdrop ' : ''}fixed inset-0 transition-all duration-300 ease-in-out flex items-center justify-center p-3 sm:p-5 lg:p-7 bg-black/60 backdrop-blur-xs ${zIndexClass} overflow-y-auto ${extraClasses}`;
}
