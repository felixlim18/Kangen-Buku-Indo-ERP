import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TruncatedTooltipProps {
  children: React.ReactNode;
  content: string;
  className?: string;
}

export function TruncatedTooltip({ children, content, className = '' }: TruncatedTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const textRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleMouseEnter = () => {
    if (textRef.current) {
      // Check if text is actually truncated
      const isTruncated = textRef.current.scrollWidth > textRef.current.clientWidth;
      
      if (isTruncated) {
        timeoutRef.current = setTimeout(() => {
          const rect = textRef.current!.getBoundingClientRect();
          setCoords({
            top: rect.top - 8,
            left: rect.left + (rect.width / 2)
          });
          setIsVisible(true);
        }, 300); // Short delay before showing
      }
    }
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    const handleScroll = () => {
      if (isVisible) setIsVisible(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      clearTimeout(timeoutRef.current);
    };
  }, [isVisible]);

  return (
    <>
      <div 
        ref={textRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`truncate ${className}`}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div 
          className="fixed z-[9999] pointer-events-none px-3 py-2 bg-neutral-800 text-white text-xs rounded-lg shadow-xl max-w-xs break-words text-center transform -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-200"
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800"></div>
        </div>,
        document.body
      )}
    </>
  );
}
