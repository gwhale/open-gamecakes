'use client';

// React hook: "should the layout render in full-bleed mode?"
//
// Two separate signals get conflated here on purpose, because the layout
// answer is the same for both:
//
//   1. Browser Fullscreen API — set by FullscreenToggle / requestFullscreen,
//      fires `fullscreenchange` + `webkitfullscreenchange`.
//   2. PWA standalone mode — when a kid launches Gamecakes from the
//      iPad home-screen icon, iOS launches it without Safari chrome.
//      `Element.requestFullscreen()` is essentially a no-op in this mode
//      (the app is ALREADY screen-filling and there's no fullscreen API
//      surface to change), so no fullscreenchange event ever fires.
//      Without checking display-mode here, the host kept rendering the
//      canvas in its `max-w-lg` card layout even though the kid was
//      looking at a chromeless full-screen app.
//
// Returning `true` for either signal lets PhaserGameHost drop the card
// chrome and let the canvas fill the viewport in both contexts.

import { useEffect, useState } from 'react';

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
};

function read(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FullscreenDoc;
  if (document.fullscreenElement || d.webkitFullscreenElement) return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // Older iOS exposes navigator.standalone instead of the modern
    // display-mode media query. Both mean "launched from home screen".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window.navigator as any).standalone === true) return true;
  }
  return false;
}

export function useIsFullscreen(): boolean {
  const [isFs, setIsFs] = useState<boolean>(false);

  useEffect(() => {
    setIsFs(read());
    const sync = () => setIsFs(read());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    // display-mode can flip if the user installs/uninstalls mid-session,
    // though that's exotic. Subscribing keeps the layout honest.
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (mq) {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', sync);
      } else if (typeof mq.addListener === 'function') {
        // Safari < 14 used the older addListener API.
        mq.addListener(sync);
      }
    }
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      if (mq) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', sync);
        } else if (typeof mq.removeListener === 'function') {
          mq.removeListener(sync);
        }
      }
    };
  }, []);

  return isFs;
}
