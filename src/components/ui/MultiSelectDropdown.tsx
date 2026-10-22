import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface MultiSelectGroup {
  label?: string;
  options: string[];
}

interface MultiSelectDropdownProps {
  /** Teks saat belum ada yang dipilih, mis. "Semua Sumber Order" */
  placeholder: string;
  groups: MultiSelectGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  ariaLabel?: string;
}

/** Dropdown dengan checkbox: bisa memilih lebih dari satu nilai. Kosong = semua. */
export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ placeholder, groups, selected, onChange, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const all = groups.flatMap((g) => g.options);
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((v) => v !== name) : [...selected, name]);

  const summary =
    selected.length === 0 ? placeholder : selected.length <= 2 ? selected.join(', ') : `${selected.length} dipilih`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border rounded-lg text-left focus:outline-none cursor-pointer ${
          selected.length ? 'border-[#2b5a9e] text-neutral-900 dark:text-white font-semibold' : 'border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-white'
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 mt-1 w-full min-w-[200px] max-h-72 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg py-1"
        >
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] border-b border-neutral-100 dark:border-neutral-800">
            <button type="button" onClick={() => onChange(all)} className="text-[#2b5a9e] dark:text-blue-400 font-semibold hover:underline cursor-pointer">
              Pilih semua
            </button>
            <button type="button" onClick={() => onChange([])} className="text-neutral-500 hover:underline cursor-pointer">
              Kosongkan
            </button>
          </div>
          {groups.map((g, gi) =>
            g.options.length === 0 ? null : (
              <div key={g.label || gi}>
                {g.label && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{g.label}</div>
                )}
                {g.options.map((name) => {
                  const checked = selected.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(name)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      <span
                        className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                          checked ? 'bg-[#2b5a9e] border-[#2b5a9e]' : 'border-neutral-300 dark:border-neutral-600'
                        }`}
                      >
                        {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{name}</span>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
