import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * Used for the one decision layout alone cannot express: whether a surface
 * should mount as a modal or as an inline pane. Everything else about the
 * responsive design stays in CSS, so there is no flash of the wrong layout on
 * first paint.
 *
 *   const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023.98px)');
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  };

  const getSnapshot = () =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false;

  /* Server snapshot is always false: the modal shell is the safe default,
     since it renders correctly at every width. */
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
