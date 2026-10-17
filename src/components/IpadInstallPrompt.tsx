'use client';

// Install prompt for first-time iPad visitors.
//
// iOS Safari doesn't support the `beforeinstallprompt` event that
// Android Chrome uses for one-tap installs. Instead, the kid (or
// parent) has to know to tap Share → Add to Home Screen. This
// overlay teaches them once.
//
// Suppressed:
//   - When already in standalone mode (matchMedia('(display-mode: standalone)'))
//   - When the user has dismissed it (localStorage flag)
//   - On non-iPad / non-iPhone user agents (Android Chrome handles
//     install via its own UI; desktop browsers don't need it)
//
// Mounted at the root layout so it shows over any page on first visit.

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'gamecakes:install-prompt-dismissed-v1';

function isIosSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPad on iOS 13+ reports as Mac in user agent; check touch points instead.
  const isIPad = /iPad/.test(ua) || (
    /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  );
  const isIPhone = /iPhone|iPod/.test(ua);
  if (!isIPad && !isIPhone) return false;
  // Exclude in-app browsers (Instagram, FB, etc.) where Add to Home Screen
  // doesn't apply — they don't have the iOS share sheet.
  if (/(FBAN|FBAV|Instagram|Line|Twitter)/i.test(ua)) return false;
  return true;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // matchMedia is the modern signal; navigator.standalone is the iOS-specific
  // legacy flag. Either being true means "launched from home screen."
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navAny = window.navigator as any;
  if (navAny.standalone === true) return true;
  return false;
}

export default function IpadInstallPrompt(): React.ReactElement | null {
  // Render gate: only show for iOS Safari, only when not already standalone,
  // only when not previously dismissed. All checks happen in useEffect so
  // SSR doesn't render the prompt and immediately hide it on hydration.
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!isIosSafariBrowser()) return;
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // localStorage might throw in private mode — fail open, show the prompt.
    }
    // Slight delay so the prompt doesn't pop the moment the page paints —
    // gives the kid (or parent) a beat to see what they landed on first.
    const t = window.setTimeout(() => setShouldShow(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = (): void => {
    setShouldShow(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  if (!shouldShow) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Gamecakes to your home screen"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-3xl bg-white/95 p-5 shadow-2xl backdrop-blur-md dark:bg-zinc-900/95"
      style={{
        // Tuck above the iOS home-bar inset.
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-3xl shadow-md"
          style={{
            background:
              'linear-gradient(135deg, #fecdd3 0%, #fde68a 60%, #bbf7d0 100%)',
          }}
        >
          🍰
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Add Gamecakes to your home screen
          </p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Tap{' '}
            <span aria-hidden className="inline-block align-middle">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="inline">
                <path
                  d="M9 12V3M9 3L5 7M9 3l4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 11v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>{' '}
            in Safari, then{' '}
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
              Add to Home Screen
            </span>
            . Then play from the icon — no Safari, just games.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 active:scale-95 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
