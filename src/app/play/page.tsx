// `/play` — the public arcade. No account, no password, nothing saved.
//
// Lives OUTSIDE the (gated) route group, like /ba: no Supabase session, no
// family, no kid. The difference from /ba is that this one has no password at
// all, and offers every upstream game rather than two hand-written ones.
//
// Laid out as the same bakery as the gated All Games menu, so a family that
// signs up later walks into a shop they already know: the showroom turntable
// up top, the recipe books on oak shelves below. Shared chrome lives in
// components/games/Bakery.tsx; this page only decides what goes on it.
//
// noindex on purpose. Open to anyone with the link, but it spreads by being
// shared rather than found — which keeps the bandwidth on this Vercel account
// proportional to how many people George actually tells.
//
// The colours are fixed, because a bakery wall does not go dark with the
// visitor's system setting.

import type { Metadata } from 'next';
import Link from 'next/link';
import GamecakesLogo from '@/components/GamecakesLogo';
import GamecakesMascot from '@/components/GamecakesMascot';
import { BakeryWall, Shelf } from '@/components/games/Bakery';
import RecipeBook from '@/components/games/RecipeBook';
import Showroom from '@/components/games/Showroom';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
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
    <BakeryWall className="text-[#3b2415]">
      {/* Header — the same logo and shop sign as All Games, the way in on the right. */}
      <header className="mt-2 flex w-full max-w-5xl items-start justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={40} />
          <div>
            <div className="whitespace-nowrap text-xs uppercase tracking-wider text-rose-500">Gamecakes Bakery</div>
            <h1 className="font-display text-2xl font-bold text-amber-950">Play Gamecakes</h1>
          </div>
        </div>
        <ChromeNavLink href="/about" variant="light" size="sm" className="shrink-0">
          What is this?
        </ChromeNavLink>
      </header>

      {/* Cakey at the counter. Golden Cream Tint ground: the speech-bubble surface. */}
      <div className="mt-4 w-full max-w-5xl px-4 sm:px-6">
        <div className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <GamecakesMascot mood="happy" size={48} />
          <p className="text-[15px] leading-snug text-amber-950">
            No account needed and nothing is saved. Pick a game and have a go!
          </p>
        </div>
      </div>

      {/* Today's special: the showroom turntable, every guest game taking a turn. */}
      <section aria-labelledby="specials" className="mt-4 w-full max-w-5xl px-4 sm:px-6">
        <h2 id="specials" className="mb-3 font-display text-lg font-bold text-amber-950">
          <span aria-hidden>✨ </span>Today&rsquo;s special
        </h2>
        <Showroom
          games={games.map((g) => ({
            slug: g.slug,
            label: g.label,
            glyph: g.glyph,
            subject: g.subject,
            href: `/play/${g.slug}`,
          }))}
        />
      </section>

      {/* The shelf: every guest game as a recipe book. One shelf, not one per
          subject — there are too few guest games to split, and a stranger does
          not yet know what Math Land or Puzzle Island mean. */}
      <div className="mt-2 flex w-full max-w-5xl flex-col gap-8 px-4 sm:px-6">
        <Shelf title="Try a game" emoji="🧁">
          {games.map((g) => (
            <RecipeBook
              key={g.slug}
              slug={g.slug}
              label={g.label}
              glyph={g.glyph}
              href={`/play/${g.slug}`}
              size="sm"
            />
          ))}
        </Shelf>
      </div>

      <section className="mx-4 mt-12 w-[calc(100%-2rem)] max-w-2xl rounded-md bg-[#fffdf8] p-6 text-center shadow-[0_10px_20px_-8px_rgba(60,30,10,0.5)]">
        <h2 className="font-display text-xl font-bold">Want the whole town?</h2>
        <p className="mx-auto mt-2 max-w-md">
          Get a town to explore and a cupcake of your own. All we need is an email and a
          nickname.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="flex items-center rounded-md bg-[#9f1d48] px-5 font-semibold text-white hover:bg-[#861a3d] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#9f1d48]"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Make an account
          </Link>
          <Link
            href="/about"
            className="flex items-center rounded-md border border-[#8a5a33] px-5 font-semibold hover:bg-[#f6ecd9] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#9f1d48]"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            What is this?
          </Link>
        </div>
      </section>
    </BakeryWall>
  );
}
