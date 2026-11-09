// `/ba` — BA Kinder Ed Games: a standalone, password-unlocked arcade.
//
// Lives OUTSIDE the (gated) route group on purpose: no family login, no
// kid profile. Anyone with the shared password (BA_PASSWORD env var, see
// src/lib/ba/access.ts) can play. Progress is NOT saved — games here are
// pure play, no /api/attempts, no adaptive engine.
//
// The gate check is per-page (not a layout) because the unlock form needs
// `searchParams.error` from the failed-POST redirect, and layouts don't
// receive searchParams. Game pages under /ba redirect here when locked.

import type { Metadata } from 'next';
import Link from 'next/link';
import GamecakesLogo from '@/components/GamecakesLogo';
import { hasBaAccess } from '@/lib/ba/access';

export const metadata: Metadata = {
  title: 'BA Kinder Ed Games',
  // Shared-password page — keep it out of search engines.
  robots: { index: false, follow: false },
};

const GAME_CARDS = [
  {
    href: '/ba/word-memory',
    glyph: '🎴',
    label: 'Word Memory',
    blurb: 'Flip the cards, find the matching sight words',
  },
  {
    href: '/ba/flappy-math',
    glyph: '🐦',
    label: 'Flappy Math',
    blurb: 'Tap to flap — make 10 at the math gates!',
  },
] as const;

export default async function BaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const unlocked = await hasBaAccess();

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 dark:opacity-30"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 20% 20%, #fecdd3 0%, transparent 60%), ' +
            'radial-gradient(ellipse 60% 40% at 80% 30%, #fde68a 0%, transparent 60%), ' +
            'radial-gradient(ellipse 70% 50% at 50% 90%, #bbf7d0 0%, transparent 60%)',
        }}
      />

      <div className="flex flex-col items-center text-center">
        <GamecakesLogo size={96} />
        <h1 className="font-display mt-4 text-4xl font-bold tracking-tight">
          BA Kinder Ed Games
        </h1>
        <p className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-400">
          Gamecakes
        </p>
      </div>

      {unlocked ? (
        <section className="w-full max-w-md">
          <div className="grid grid-cols-1 gap-4">
            {GAME_CARDS.map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="flex items-center gap-4 rounded-3xl bg-white/90 p-5 shadow-xl backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98] dark:bg-zinc-900/90"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-5xl" aria-hidden>{g.glyph}</span>
                <span>
                  <span className="font-display block text-xl font-bold">
                    {g.label}
                  </span>
                  <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                    {g.blurb}
                  </span>
                </span>
              </Link>
            ))}

            {/* Placeholder so the page doesn't read as "one lonely game" —
                and so adding the next game is a one-entry change above. */}
            <div className="flex items-center gap-4 rounded-3xl border-2 border-dashed border-zinc-300 p-5 text-zinc-400 dark:border-zinc-700 dark:text-zinc-600">
              <span className="text-5xl" aria-hidden>🎁</span>
              <span className="font-display text-lg font-semibold">
                More games coming soon…
              </span>
            </div>
          </div>
        </section>
      ) : (
        <form
          action="/api/ba/unlock"
          method="post"
          className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white/90 p-6 shadow-xl backdrop-blur-sm dark:bg-zinc-900/90"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              🔐 Who&rsquo;s our favorite teacher?
            </span>
            <input
              type="password"
              name="password"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
              className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              style={{ minHeight: 'var(--min-tap-target)' }}
            />
          </label>

          {error ? (
            <p
              className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
              role="alert"
            >
              {decodeURIComponent(error)}
            </p>
          ) : null}

          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-rose-400 to-rose-500 px-6 py-3 text-lg font-semibold text-white shadow-md hover:from-rose-500 hover:to-rose-600 active:scale-[0.98]"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Enter
          </button>
        </form>
      )}
    </main>
  );
}
