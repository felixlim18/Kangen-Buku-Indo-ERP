type ModalCloseHandler = () => void;

interface ModalEntry {
  id: string;
  onClose: ModalCloseHandler;
  isLoading?: boolean;
}

const stack: ModalEntry[] = [];

const syncBodyScrollLock = () => {
  if (typeof document === 'undefined') return;
  if (stack.length > 0) {
    document.body.classList.add('overflow-hidden');
  } else {
    document.body.classList.remove('overflow-hidden');
  }
};

export const registerModal = (entry: ModalEntry) => {
  // Remove duplicate if exists before pushing to top
  const existingIndex = stack.findIndex(e => e.id === entry.id);
  if (existingIndex !== -1) {
    stack.splice(existingIndex, 1);
  }
  stack.push(entry);
  syncBodyScrollLock();
};

export const unregisterModal = (id: string) => {
  const index = stack.findIndex(e => e.id === id);
  if (index !== -1) {
    stack.splice(index, 1);
  }
  syncBodyScrollLock();
};

export const updateModalLoading = (id: string, isLoading: boolean) => {
  const entry = stack.find(e => e.id === id);
  if (entry) {
    entry.isLoading = isLoading;
  }
};

export const getActiveModalCount = () => stack.length;

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (stack.length === 0) return;
      const topModal = stack[stack.length - 1];
      if (topModal.isLoading) {
        // Prevent closing when in loading / submitting state
        return;
      }
      topModal.onClose();
    }
  });
}
