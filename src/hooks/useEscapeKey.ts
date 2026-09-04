'use client';

// useEscapeKey — dismiss an open dialog/panel with the Escape key.
//
// The town's overlays are touch-first (iPad), but they all carry
// role="dialog" and WCAG expects a keyboard dismiss to match the backdrop
// tap. One listener per open dialog; passing `enabled: false` (e.g. while a
// POST is pending) suspends it without unmounting.

import { useEffect } from 'react';

export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, enabled]);
}
