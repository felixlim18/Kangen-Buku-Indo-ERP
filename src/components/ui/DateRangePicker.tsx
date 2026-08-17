import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  ChevronDown,
  ArrowRight
} from 'lucide-react';

interface DateRangePickerProps {
  startDate: Date | string | null;
  endDate: Date | string | null;
  onChange: (start: Date | null, end: Date | null, presetLabel?: string) => void;
  presetLabel?: string;
  initialPresetLabel?: string;
}

const MONTHS_INDO = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday to Sunday

function ensureDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'object' && val.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  presetLabel,
  initialPresetLabel
}) => {
  const safeStart = ensureDate(startDate);
  const safeEnd = ensureDate(endDate);
  const activePreset = presetLabel || initialPresetLabel;

  // Panel dropdown open state
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Active month context for the month navigators (quick controls & calendar)
  // We track the base month for the left calendar. The right calendar will show baseMonth + 1 month.
  const [baseMonth, setBaseMonth] = useState<Date>(() => {
    if (safeStart) return new Date(safeStart.getFullYear(), safeStart.getMonth(), 1);
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Local/pending states for range selection inside the dropdown
  const [pendingStart, setPendingStart] = useState<Date | null>(safeStart);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(safeEnd);
  const [pendingPreset, setPendingPreset] = useState<string | undefined>(activePreset);

  // Track hover date for range preview during selection
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  // Alignment state (left-aligned or right-aligned relative to trigger)
  const [alignRight, setAlignRight] = useState(false);

  // For mobile view, track which calendar is actively shown ('start' or 'end' month)
  const [activeMobileCalendar, setActiveMobileCalendar] = useState<'start' | 'end'>('start');

  // Measure space to decide left vs right alignment in viewport
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.left;
      // If remaining space on the right of the trigger is less than 850px, align right to prevent truncation
      if (spaceRight < 850) {
        setAlignRight(true);
      } else {
        setAlignRight(false);
      }
      // Reset mobile calendar view back to start month
      setActiveMobileCalendar('start');
    }
  }, [isOpen]);

  // Sync internal pending states when external props change
  useEffect(() => {
    setPendingStart(safeStart);
    setPendingEnd(safeEnd);
    setPendingPreset(activePreset);
    if (safeStart) {
      setBaseMonth(new Date(safeStart.getFullYear(), safeStart.getMonth(), 1));
    }
  }, [startDate, endDate, presetLabel, initialPresetLabel]);

  // Handle click outside to close panel and discard pending changes
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleCancel();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, startDate, endDate, presetLabel, initialPresetLabel]);

  // Helper: Format Date to YYYY/MM/DD
  const formatDateString = (date: Date | null): string => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  };

  // Helper: Get range label for the trigger button
  const getRangeDisplayString = (): string => {
    if (!safeStart && !safeEnd) return 'Semua Tanggal';
    if (safeStart && !safeEnd) return `${formatDateString(safeStart)} - ...`;
    if (safeStart && safeEnd) return `${formatDateString(safeStart)} - ${formatDateString(safeEnd)}`;
    return '';
  };

  // Determine current active month label for the quick monthly control next to trigger
  const getActiveMonthLabel = (): string => {
    // Determine which month is active based on safeStart, or fallback to current month
    const targetDate = safeStart || new Date();
    const monthIndex = targetDate.getMonth();
    const year = targetDate.getFullYear();
    return `${MONTHS_INDO[monthIndex]} ${year}`;
  };

  // Quick Monthly Control: Click Middle Button (Filter to entire month e.g. "Juli 2026")
  const handleCurrentMonthQuick = () => {
    const referenceDate = safeStart || new Date();
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    onChange(start, end, 'Bulan Ini');
  };

  // Quick Daily Control: Click "Hari Ini" Button
  const handleTodayQuick = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    onChange(start, end, 'Hari Ini');
  };

  // Check if today is selected
  const isTodaySelected = (): boolean => {
    if (!safeStart || !safeEnd) return false;
    const today = new Date();
    return (
      safeStart.getFullYear() === today.getFullYear() &&
      safeStart.getMonth() === today.getMonth() &&
      safeStart.getDate() === today.getDate() &&
      safeEnd.getFullYear() === today.getFullYear() &&
      safeEnd.getMonth() === today.getMonth() &&
      safeEnd.getDate() === today.getDate()
    );
  };

  // Quick Monthly Control: Click "<" (Previous Month)
  const handlePrevMonthQuick = () => {
    const referenceDate = safeStart || new Date();
    const prevMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const lastDayOfPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
    
    // Check if shifting to previous month represents full month selection or just moving the slider
    onChange(prevMonth, lastDayOfPrevMonth, 'Bulan Ini');
  };

  // Quick Monthly Control: Click ">" (Next Month)
  const handleNextMonthQuick = () => {
    const referenceDate = safeStart || new Date();
    const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
    const lastDayOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
    
    onChange(nextMonth, lastDayOfNextMonth, 'Bulan Ini');
  };

  // Apply range handler
  const handleApply = () => {
    onChange(pendingStart, pendingEnd, pendingPreset);
    setIsOpen(false);
  };

  // Cancel/close handler
  const handleCancel = () => {
    setPendingStart(startDate);
    setPendingEnd(endDate);
    setPendingPreset(initialPresetLabel);
    setIsOpen(false);
  };

  // Quick Preset Selection
  const applyPreset = (preset: string) => {
    const today = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (preset === 'Hari Ini') {
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    } else if (preset === 'Minggu Ini') {
      // Minggu Ini: Monday of current week to today
      const day = today.getDay();
      const daysToSubtract = day === 0 ? 6 : day - 1;
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysToSubtract);
      end = new Date(today);
    } else if (preset === 'Bulan Ini') {
      // Bulan Ini: 1st of month to today
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today);
    } else if (preset === '3 Bulan Terakhir') {
      // 3 Bulan Terakhir: 1st of month 3 months ago to today
      start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      end = new Date(today);
    } else if (preset === 'Semua') {
      start = null;
      end = null;
    }

    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    // Set as pending and commit immediately for quick selections
    setPendingStart(start);
    setPendingEnd(end);
    setPendingPreset(preset);
    
    onChange(start, end, preset);
    setIsOpen(false);
  };

  // Calendar Day Clicks
  const handleDayClick = (date: Date) => {
    setPendingPreset('Custom');
    if (!pendingStart || (pendingStart && pendingEnd)) {
      // First click: reset and set start date
      setPendingStart(date);
      setPendingEnd(null);
    } else {
      // Second click: set end date
      let start = pendingStart;
      let end = date;
      
      // Auto-swap if end date is earlier than start date
      if (end.getTime() < start.getTime()) {
        const temp = start;
        start = end;
        end = temp;
      }
      
      setPendingStart(start);
      setPendingEnd(end);
    }
  };

  // Navigation handlers inside the calendar
  const adjustCalendarMonth = (offset: number) => {
    setBaseMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const adjustCalendarYear = (offset: number) => {
    setBaseMonth(prev => new Date(prev.getFullYear() + offset, prev.getMonth(), 1));
  };

  // Render a single month calendar grid
  const renderCalendar = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday, 6 is Saturday
    const startDayOfWeekMondayFirst = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    // Previous month details for trailing days
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    // Weeks calculation
    const gridCells = [];

    // 1. Add trailing days from previous month
    for (let i = startDayOfWeekMondayFirst - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, prevMonthLastDay - i);
      gridCells.push({ date: prevDate, isCurrentMonth: false });
    }

    // 2. Add current month days
    for (let i = 1; i <= daysInMonth; i++) {
      gridCells.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // 3. Add leading days for next month to complete 6-row grid (42 cells)
    const remainingCells = 42 - gridCells.length;
    for (let i = 1; i <= remainingCells; i++) {
      gridCells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    // Today's date reference
    const today = new Date();
    const isSameDay = (d1: Date, d2: Date) => 
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    // Helper: check if date is within selected/pending range
    const isSelectedStart = (d: Date) => pendingStart && isSameDay(d, pendingStart);
    const isSelectedEnd = (d: Date) => pendingEnd && isSameDay(d, pendingEnd);
    
    const isDateInRange = (d: Date) => {
      if (!pendingStart) return false;
      const time = d.getTime();
      const startTime = pendingStart.getTime();

      if (pendingEnd) {
        return time > startTime && time < pendingEnd.getTime();
      } else if (hoveredDate) {
        const hoverTime = hoveredDate.getTime();
        if (hoverTime > startTime) {
          return time > startTime && time < hoverTime;
        } else {
          return time > hoverTime && time < startTime;
        }
      }
      return false;
    };

    return (
      <div className="w-[280px]">
        {/* Calendar Grid Headers */}
        <div className="grid grid-cols-7 gap-y-1 text-center font-mono text-xs text-neutral-400 dark:text-neutral-500 font-medium mb-2 border-b border-neutral-100 dark:border-neutral-800/50 pb-1">
          {DAYS_SHORT.map((day, idx) => (
            <div key={idx} className="h-6 flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-1 text-center font-mono text-xs">
          {gridCells.map((cell, idx) => {
            const { date, isCurrentMonth } = cell;
            const isToday = isSameDay(date, today);
            const isStart = isSelectedStart(date);
            const isEnd = isSelectedEnd(date);
            const inRange = isDateInRange(date);

            let cellClass = "h-8 w-8 mx-auto flex items-center justify-center rounded-full transition-all duration-100 cursor-pointer relative select-none ";
            let wrapperClass = "py-0.5 relative ";

            if (isStart || isEnd) {
              cellClass += "bg-brand-600 text-white font-bold z-10 shadow-xs";
              if (isStart && pendingEnd) {
                wrapperClass += "rounded-l-full bg-brand-50 dark:bg-brand-500/30";
              } else if (isEnd && pendingStart) {
                wrapperClass += "rounded-r-full bg-brand-50 dark:bg-brand-500/30";
              }
            } else if (inRange) {
              cellClass += "text-brand-700 dark:text-white font-semibold";
              wrapperClass += "bg-brand-50 dark:bg-brand-500/30";
            } else if (isToday) {
              cellClass += "text-brand-600 font-bold border border-brand-500/30";
            } else if (!isCurrentMonth) {
              cellClass += "text-neutral-300 dark:text-neutral-700";
            } else {
              cellClass += "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800";
            }

            return (
              <div 
                key={idx} 
                className={wrapperClass}
                onMouseEnter={() => {
                  if (pendingStart && !pendingEnd && isCurrentMonth) {
                    setHoveredDate(date);
                  }
                }}
                onMouseLeave={() => setHoveredDate(null)}
                onClick={() => handleDayClick(date)}
              >
                <div className={cellClass}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Secondary month for the 2-month side-by-side display
  const nextMonthDate = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1);

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2" ref={containerRef}>
      {/* 1. MAIN TRIGGER BUTTON */}
      <div className="relative w-full md:w-auto">
        <button
          id="date-picker-trigger-btn"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 px-4 py-2.5 w-full md:w-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-850/80 transition shadow-xs select-none text-left cursor-pointer"
        >
          <Calendar className="h-4.5 w-4.5 text-neutral-400 dark:text-neutral-500 shrink-0" />
          <div className="flex flex-col min-w-[170px]">
            <span className="font-sans text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider leading-none">
              Pilih Tanggal:
            </span>
            <span className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-100 mt-1 leading-none">
              {getRangeDisplayString()}
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* DROPDOWN PANEL */}
        {isOpen && (
          <>
            {/* Mobile dark backdrop overlay */}
            <div 
              className="fixed inset-0 bg-neutral-950/40 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-150" 
              onClick={handleCancel}
            />
            
            <div 
              id="date-picker-dropdown-panel"
              className={`fixed bottom-2 left-1/2 -translate-x-1/2 md:absolute md:inset-auto md:top-full md:bottom-auto md:translate-x-0 md:mt-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden max-h-[calc(100vh-2rem)] md:max-h-none animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-top-2 duration-150 ${
                alignRight ? 'md:right-0 md:left-auto' : 'md:left-0 md:right-auto'
              }`}
              style={{ width: 'min(850px, calc(100vw - 1rem))' }}
            >
              {/* Top Area: 2-column layout (stacks on mobile) */}
              <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-neutral-100 dark:divide-neutral-800/80 flex-1 overflow-y-auto md:overflow-visible">
                {/* LEFT COLUMN: Quick Presets */}
                <div className="w-full md:w-[180px] p-4 flex flex-col gap-1.5 shrink-0 bg-neutral-25/50 dark:bg-neutral-950/20">
                  <span className="font-sans text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1 md:mb-2 px-1 md:px-2">
                    Pilihan Cepat
                  </span>
                  
                  <div className="flex flex-row flex-wrap md:flex-col gap-1.5">
                    {[
                      { id: 'Hari Ini', label: 'Hari Ini' },
                      { id: 'Minggu Ini', label: 'Minggu Ini' },
                      { id: 'Bulan Ini', label: 'Bulan Ini' },
                      { id: '3 Bulan Terakhir', label: '3 Bulan Terakhir' },
                      { id: 'Semua', label: 'Semua' }
                    ].map((item) => {
                      const isActive = pendingPreset === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => applyPreset(item.id)}
                          className={`font-sans text-left text-xs font-semibold px-3 py-1.5 md:py-2 rounded-lg transition-all cursor-pointer ${
                            isActive
                              ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold'
                              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-850'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                    
                    <div className="hidden md:block border-t border-neutral-100 dark:border-neutral-850 my-1"></div>

                    <button
                      type="button"
                      onClick={() => setPendingPreset('Custom')}
                      className={`font-sans text-left text-xs font-semibold px-3 py-1.5 md:py-2 rounded-lg flex items-center justify-between transition-all cursor-pointer ${
                        pendingPreset === 'Custom'
                          ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold'
                          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-850'
                      }`}
                    >
                      <span>Pilih Tanggal</span>
                      <ArrowRight className="h-3.5 w-3.5 text-neutral-400 hidden md:block" />
                    </button>
                  </div>
                </div>

                {/* RIGHT COLUMN: Calendar viewports */}
                <div className="flex-1 p-3 md:p-6 flex flex-col gap-4">
                  
                  {/* Mobile Segmented Toggle for Month Selection */}
                  <div className="flex md:hidden bg-neutral-100 dark:bg-neutral-800/80 p-1 rounded-xl mb-1 w-full">
                    <button
                      type="button"
                      onClick={() => setActiveMobileCalendar('start')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                        activeMobileCalendar === 'start'
                          ? 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 shadow-xs'
                          : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    >
                      Bulan Mulai
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMobileCalendar('end')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                        activeMobileCalendar === 'end'
                          ? 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 shadow-xs'
                          : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    >
                      Bulan Akhir
                    </button>
                  </div>

                  {/* Calendar Headers & Navigation */}
                  <div className="flex items-center justify-between mb-1 md:mb-2">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => adjustCalendarYear(-1)}
                        className="p-1 border border-neutral-100 dark:border-neutral-800 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-500 dark:text-neutral-400 cursor-pointer"
                        title="Mundur 1 Tahun"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustCalendarMonth(-1)}
                        className="p-1 border border-neutral-100 dark:border-neutral-800 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-500 dark:text-neutral-400 cursor-pointer"
                        title="Mundur 1 Bulan"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex-1 flex justify-around md:justify-between text-center select-none px-2 md:px-4">
                      {/* On mobile, show whichever calendar is active */}
                      <span className="font-sans font-bold text-xs md:text-sm text-neutral-800 dark:text-neutral-100 font-mono block md:hidden">
                        {activeMobileCalendar === 'start' 
                          ? `${MONTHS_INDO[baseMonth.getMonth()]} ${baseMonth.getFullYear()}`
                          : `${MONTHS_INDO[nextMonthDate.getMonth()]} ${nextMonthDate.getFullYear()}`
                        }
                      </span>
                      {/* On desktop, show both side-by-side as column headers */}
                      <span className="hidden md:inline font-sans font-bold text-xs md:text-sm text-neutral-800 dark:text-neutral-100 font-mono">
                        {MONTHS_INDO[baseMonth.getMonth()]} {baseMonth.getFullYear()}
                      </span>
                      <span className="hidden md:inline font-sans font-bold text-xs md:text-sm text-neutral-800 dark:text-neutral-100 font-mono">
                        {MONTHS_INDO[nextMonthDate.getMonth()]} {nextMonthDate.getFullYear()}
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => adjustCalendarMonth(1)}
                        className="p-1 border border-neutral-100 dark:border-neutral-800 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-500 dark:text-neutral-400 cursor-pointer"
                        title="Maju 1 Bulan"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustCalendarYear(1)}
                        className="p-1 border border-neutral-100 dark:border-neutral-800 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-500 dark:text-neutral-400 cursor-pointer"
                        title="Maju 1 Tahun"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Grid Container */}
                  <div className="flex gap-4 md:gap-8 justify-center items-center">
                    <div className="md:block hidden">
                      {renderCalendar(baseMonth)}
                    </div>
                    <div className="md:hidden block">
                      {activeMobileCalendar === 'start' ? renderCalendar(baseMonth) : renderCalendar(nextMonthDate)}
                    </div>
                    <div className="hidden md:block">
                      {renderCalendar(nextMonthDate)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Footer: Actions */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-neutral-25 dark:bg-neutral-950/30 border-t border-neutral-100 dark:border-neutral-800/80 shrink-0">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="font-sans px-4 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-850 rounded-lg transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="font-sans px-5 py-2 text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition shadow-xs shadow-brand-500/20 cursor-pointer"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 2. SEPARATE FAST MONTHLY NAVIGATION CONTROL & HARI INI BUTTON */}
      <div className="flex items-center gap-2 w-full md:w-auto">
        <div
          id="date-picker-quick-nav"
          className="flex items-center gap-1 px-2 py-2 md:px-3 md:py-2 bg-neutral-100/60 dark:bg-neutral-850/60 border border-neutral-200/50 dark:border-neutral-800/50 rounded-xl select-none overflow-x-auto flex-1 md:flex-initial min-w-0"
        >
          <button
            type="button"
            onClick={handlePrevMonthQuick}
            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 transition duration-150 cursor-pointer flex-shrink-0"
            title="Mundur 1 Bulan"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleCurrentMonthQuick}
            className="font-mono text-xs font-extrabold text-neutral-700 dark:text-neutral-300 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/80 px-1.5 md:px-2 py-1 rounded-md transition duration-150 cursor-pointer whitespace-nowrap text-center tracking-tight leading-none"
            title={`Filter ke ${getActiveMonthLabel()}`}
          >
            {getActiveMonthLabel()}
          </button>
          <button
            type="button"
            onClick={handleNextMonthQuick}
            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 transition duration-150 cursor-pointer flex-shrink-0"
            title="Maju 1 Bulan"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          id="date-picker-today-btn"
          onClick={handleTodayQuick}
          className={`px-3 md:px-3.5 py-2 text-xs font-bold rounded-xl border transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 select-none flex-shrink-0 ${
            initialPresetLabel === 'Hari Ini' || isTodaySelected()
              ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:border-brand-500 shadow-brand-500/20'
              : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
          }`}
          title="Filter Orderan Hari Ini"
        >
          <span>Hari Ini</span>
        </button>
      </div>
    </div>
  );
};
