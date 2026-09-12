// `/play` — the public arcade. No account, no password, nothing saved.
//
// Lives OUTSIDE the (gated) route group, like /ba: no Supabase session, no
// family, no kid. The difference from /ba is that this one has no password at
// all, and offers every upstream game rather than two hand-written ones.
//
// noindex on purpose. Open to anyone with the link, but it spreads by being
// shared rather than found — which keeps the bandwidth on this Vercel account
// proportional to how many people George actually tells.

import type { Metadata } from 'next';
import Link from 'next/link';
import GamecakesLogo from '@/components/GamecakesLogo';
import GamecakesMascot from '@/components/GamecakesMascot';
import { guestPlayableGames } from '@/lib/games/guest-mounts';

export const metadata: Metadata = {
  title: 'Play Gamecakes',
  description: 'A few games from Gamecakes. No account, nothing saved.',
  // Shared by link, not found by search. See the header.
  robots: { index: false, follow: false },
};

export default function PlayPage() {
  const games = guestPlayableGames();

  return (
    <main className="flex flex-1 flex-col items-center p-4 sm:p-8">
      <header className="flex w-full max-w-3xl items-center gap-3">
        <GamecakesLogo size={40} />
        <div>
          <h1 className="text-2xl font-bold">Play Gamecakes</h1>
          <p className="text-xs text-zinc-500">
            No account needed. Nothing is saved — just have a go.
          </p>
        </div>
      </header>

      <div className="mt-6 flex w-full max-w-3xl items-center gap-3 rounded-3xl bg-sky-50 p-5 dark:bg-sky-950/40">
        <GamecakesMascot mood="happy" size={48} />
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Every game asks a maths question to get past something. Pick one.
        </p>
      </div>

      <ul className="mt-6 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
        {games.map((game) => (
          <li key={game.slug}>
            <Link
              href={`/play/${game.slug}`}
              className="flex h-full flex-col items-center gap-2 rounded-2xl bg-white p-5 text-center shadow-sm transition-all hover:shadow-md active:scale-95 dark:bg-zinc-900"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              <span className="text-4xl">{game.glyph}</span>
              <span className="text-sm font-semibold">{game.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                {game.subject}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10 w-full max-w-3xl rounded-3xl border border-zinc-200 p-6 text-center dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Want to keep going?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          With a free account there is a whole town to walk around, a cupcake to
          make your own, and questions that follow along as your kid gets
          better. We ask for your email and a nickname for them — not their real
          name, and nothing else.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Make an account
          </Link>
          <Link
            href="/open"
            className="rounded-2xl border border-zinc-300 px-5 py-3 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            What is this?
          </Link>
        </div>
      </section>
    </main>
  );
}
