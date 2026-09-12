'use client';

// "Visit Gamecakes City" entry pill on /map. Same visual as the
// surrounding amber pills, but a button instead of a Link so the
// click handler can request fullscreen *inside the user-gesture
// frame* (browsers reject requestFullscreen calls outside a gesture).
//
// Pattern lifted from GameLauncher's Play button — kids landing on
// /town from /map get the same "feels-like-an-app" fullscreen polish
// the games already have, without an extra "tap to enter" wall on
// the town page itself.

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function TownEntryButton(): React.ReactElement {
  const router = useRouter();

  const handleEnter = useCallback(() => {
    // Best-effort fullscreen — same shape as GameLauncher's Play
    // handler. Swallow errors: if the browser denies (PWA standalone,
    // older iPad, ESC pressed mid-flight), navigation still proceeds.
    try {
      const root = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (!document.fullscreenElement) {
        if (root.requestFullscreen) {
          root.requestFullscreen().catch(() => {
            /* user denied or unsupported */
          });
        } else if (root.webkitRequestFullscreen) {
          root.webkitRequestFullscreen();
        }
      }
    } catch {
      // Fullscreen is a nice-to-have — town still works without it.
    }
    router.push('/town');
  }, [router]);

  return (
    <button
      type="button"
      onClick={handleEnter}
      className="flex items-center gap-2 rounded-full bg-amber-100 px-6 py-2.5 text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-200 hover:scale-105 active:scale-95 dark:bg-amber-900/40 dark:text-amber-100"
      style={{ minHeight: 'var(--min-tap-target)' }}
    >
      ✨ Visit Gamecakes City (new!)
    </button>
  );
}
