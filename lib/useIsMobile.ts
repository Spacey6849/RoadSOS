'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `true` when the viewport is narrower than `breakpoint` px.
 *
 * SSR-safe: starts as `false` on the server and on the very first client
 * render (so the markup matches), then re-runs on mount to read the real
 * width. Components should treat the first render as "desktop-ish" and let
 * the post-mount update reveal the mobile layout.
 *
 * Uses `matchMedia` change events instead of polling resize, so there is
 * one listener per call site regardless of how often the user resizes.
 */
export function useIsMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
