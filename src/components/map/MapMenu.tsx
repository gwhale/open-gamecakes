'use client';

// Shared header menu for /town, /games, and the (retired) /map pages.
//
// Desktop (≥lg, 1024px): renders the actions as pills inline
// (Fullscreen, All Games, What's Baking (Story Oven), Parent, Switch kid).
//
// Tablet/Mobile (<lg): collapses into a hamburger that opens a slide-in
// drawer. The breakpoint sits at lg (not sm/md) because iPad portrait
// is exactly 768px = Tailwind's md, and the inline pill row plus the
// title + Math/Vocab Land sub-pill on /map/math and /map/vocab can't
// fit there. A kid filed a ticket on Apr 22 ("top nav breaks into
// multiple lines on my iPad") that this breakpoint shift resolves.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import FullscreenToggle from '@/components/FullscreenToggle';
import CoinBadge from '@/components/wallet/CoinBadge';
import { ChromeNavLink, ChromeNavButton } from '@/components/ui/ChromeNavLink';

export default function MapMenu({
  showWallet = true,
}: {
  /** /town renders its own live-updating BalancePill (engine unlocks
   *  mutate it), so it opts out of the menu's CoinBadge to avoid two
   *  wallets in one header. Map pages keep the default. */
  showWallet?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      {/* Wallet badge — visible at both breakpoints so kids can see
          their balance grow without opening the hamburger. */}
      {showWallet ? <CoinBadge /> : null}

      {/* ---- Desktop cluster ----
       *  All chrome here is ChromeNavLink / ChromeNavButton. These used to be
       *  six hand-rolled copies of the dark pill that had drifted from the
       *  shared one (border-white/20 vs /15, font-medium vs bold, no focus
       *  ring). The dark treatment itself is load-bearing: the original
       *  bg-white/30 pills inherited their text colour from the page and, on
       *  the /map sky-amber-rose gradient, produced a translucent-on-
       *  translucent contrast failure. */}
      <div className="hidden flex-shrink-0 items-center gap-2 lg:flex">
        <FullscreenToggle size="sm" />
        <ChromeNavLink
          href="/kids/customize"
          variant="dark"
          ariaLabel="Cakey Store"
        >
          🧁 Cakey Store
        </ChromeNavLink>
        <ChromeNavLink
          href="/games"
          variant="dark"
          ariaLabel="All games"
        >
          🎮 All Games
        </ChromeNavLink>
        <ChromeNavLink
          href="/tickets"
          variant="dark"
          ariaLabel="My Story Oven"
        >
          🧁 What&rsquo;s Baking
        </ChromeNavLink>
        <ChromeNavLink
          href="/whats-new"
          variant="dark"
          ariaLabel="What's new"
        >
          ✨ What&rsquo;s New
        </ChromeNavLink>
        <ChromeNavLink
          href="/grownups"
          variant="dark"
        >
          🔒 Grown-ups
        </ChromeNavLink>
        <form action="/api/kids/select" method="post">
          <input type="hidden" name="kidId" value="" />
          <ChromeNavButton type="submit" variant="dark">
            Switch
          </ChromeNavButton>
        </form>
      </div>

      {/* ---- Mobile hamburger trigger ---- */}
      <ChromeNavButton
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        variant="dark"
        className="h-11 w-11 !px-0 text-lg lg:hidden"
      >
        ☰
      </ChromeNavButton>

      {/* ---- Mobile drawer ---- */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 lg:hidden"
        >
          {/* Backdrop — tap to close */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />

          {/* Panel */}
          <div className="absolute right-0 top-0 flex h-full w-[min(85vw,320px)] flex-col gap-3 rounded-l-3xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                // 44px, not 36 — this is a real tap target on the iPad, and it
                // sits close enough to the drawer edge that a miss scrolls the
                // page instead.
                className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-lg text-zinc-700 transition-transform duration-100 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:bg-zinc-800 dark:text-zinc-200"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                ✕
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <Link
                href="/kids/customize"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-base font-semibold text-zinc-900 active:scale-95 dark:bg-zinc-800 dark:text-zinc-100"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl" aria-hidden>🧁</span>
                <span className="flex flex-col leading-tight">
                  <span>Cakey Store</span>
                  <span className="text-[11px] font-normal text-zinc-500">
                    Spend Sugar Tokens on your treat
                  </span>
                </span>
              </Link>

              <Link
                href="/games"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-base font-semibold text-zinc-900 active:scale-95 dark:bg-zinc-800 dark:text-zinc-100"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl" aria-hidden>🎮</span>
                <span className="flex flex-col leading-tight">
                  <span>All Games</span>
                  <span className="text-[11px] font-normal text-zinc-500">
                    Play any game directly
                  </span>
                </span>
              </Link>

              <Link
                href="/tickets"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-base font-semibold text-zinc-900 active:scale-95 dark:bg-zinc-800 dark:text-zinc-100"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl" aria-hidden>🧁</span>
                What&rsquo;s Baking
              </Link>

              <Link
                href="/whats-new"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-base font-semibold text-zinc-900 active:scale-95 dark:bg-zinc-800 dark:text-zinc-100"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl" aria-hidden>✨</span>
                <span className="flex flex-col leading-tight">
                  <span>What&rsquo;s New</span>
                  <span className="text-[11px] font-normal text-zinc-500">
                    The latest updates
                  </span>
                </span>
              </Link>

              <Link
                href="/grownups"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-base font-semibold text-zinc-900 active:scale-95 dark:bg-zinc-800 dark:text-zinc-100"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl" aria-hidden>🔒</span>
                <span className="flex flex-col leading-tight">
                  <span>Grown-ups</span>
                  <span className="text-[11px] font-normal text-zinc-500">
                    Reports · homework · tickets
                  </span>
                </span>
              </Link>

              {/* Fullscreen gets a wrapping row so it reads like the other items. */}
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-base font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                <span className="text-xl" aria-hidden>⛶</span>
                <span className="flex-1">Fullscreen</span>
                <FullscreenToggle size="sm" />
              </div>

              <form
                action="/api/kids/select"
                method="post"
                className="flex"
              >
                <input type="hidden" name="kidId" value="" />
                {/* NO onClick close here — setOpen(false) unmounts the
                    drawer (and this form) before the browser processes
                    the submission, which cancels it: "Switch kid" did
                    nothing on every <lg device. The form POST navigates
                    away, so the drawer doesn't need closing. */}
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-left text-base font-semibold text-zinc-900 active:scale-95 dark:bg-zinc-800 dark:text-zinc-100"
                  style={{ minHeight: 'var(--min-tap-target)' }}
                >
                  <span className="text-xl" aria-hidden>🔄</span>
                  <span className="flex flex-col leading-tight">
                    <span>Switch kid</span>
                    <span className="text-[11px] font-normal text-zinc-500">
                      Back to the who&rsquo;s-playing picker
                    </span>
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
