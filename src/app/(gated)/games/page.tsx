// `/games` — the "All Games" menu, laid out as a bakery.
//
// The 3D city at /town is the main hub, but reaching a game there means
// walking the avatar to its building. This menu is the escape hatch: every
// LIVE game as a recipe book with its screenshot on the cover. Up top, the
// showroom turns one big book at a time under a spotlight for browsing (a
// kart-select screen, in cake); below, the same books stand on one oak shelf
// per subject for finding a particular game.
//
// Source of truth is GAME_REGISTRY — list a game there and it shows up
// here automatically. Unlike the town, this menu intentionally ignores
// unlock/discovery state: the point is "play ANY game if they want."
//
// Server component: no data fetching needed (the registry is static), so
// this renders instantly. It lives in the (gated) group, so the parent
// login + active-kid chrome already wraps it.

import type { Metadata } from 'next';
import GamecakesLogo from '@/components/GamecakesLogo';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import MapMenu from '@/components/map/MapMenu';
import {
  getLiveGames,
  getRetiredGames,
  type GameInfo,
  type GameSubject,
} from '@/lib/games/registry';
import { FROM_GAMES_MENU } from '@/lib/games/back-nav';
import { isGameLocked, gameUnlockCost } from '@/lib/games/registry';
import { unlockedGamesForKid } from '@/lib/games/unlock-gate';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import RecipeBook from '@/components/games/RecipeBook';
import Showroom from '@/components/games/Showroom';
import { BakeryWall, Shelf } from '@/components/games/Bakery';

export const metadata: Metadata = {
  title: 'All Games · Gamecakes',
};

interface MenuSection {
  /** Heading shown above the section's cards. */
  title: string;
  /** Emoji that fronts the heading. */
  emoji: string;
  /** Which registry subject this section collects. */
  subject: GameSubject;
}

// The menu is grouped by subject so it mirrors the "lands" kids already
// know from the town (Math vs Vocab). Order here = display order.
const SECTIONS: readonly MenuSection[] = [
  { title: 'Math Games', emoji: '🔢', subject: 'math' },
  { title: 'Word Games', emoji: '📖', subject: 'reading' },
  { title: 'Logic Games', emoji: '🧩', subject: 'logic' },
  { title: 'Music', emoji: '🎹', subject: 'music' },
];

export default async function AllGamesPage(): Promise<React.ReactElement> {
  // Which priced games this kid already owns. Presentation only — the real gate
  // is server-side on each game's own page (lib/games/unlock-gate.ts), so a
  // stale badge here can never let anyone into a game they have not bought.
  const kidId = await getActiveKid();
  const unlocked = await unlockedGamesForKid(supabaseServer(), kidId);
  // Live games drive the subject sections; retired games (if any) collect
  // in the Graveyard at the bottom — present but visibly archived.
  const liveGames = getLiveGames();
  const retiredGames = getRetiredGames();
  const book = (g: GameInfo, size: 'lg' | 'sm', retired = false): React.ReactElement => (
    <RecipeBook
      key={g.slug}
      slug={g.slug}
      label={g.label}
      glyph={g.glyph}
      // `?from=games` tells the game's back button to return here instead
      // of /town (see lib/games/back-nav.ts).
      href={`/games/${g.slug}?from=${FROM_GAMES_MENU}`}
      size={size}
      lockedCost={!retired && isGameLocked(g.slug, unlocked) ? gameUnlockCost(g.slug) : undefined}
      retired={retired}
    />
  );
  return (
    <BakeryWall>
      {/* Header — logo + shop sign on the left, back-to-town + menu on the right. */}
      <header className="mt-2 flex w-full max-w-5xl items-start justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={40} />
          <div>
            <div className="whitespace-nowrap text-xs uppercase tracking-wider text-rose-500">Gamecakes Bakery</div>
            <h1 className="font-display text-2xl font-bold text-amber-950">All Games</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChromeNavLink href="/town" size="sm" className="shrink-0">
            ← Town
          </ChromeNavLink>
          <MapMenu showWallet={false} />
        </div>
      </header>

      {/* Today's special: the showroom turntable. Every live game takes a turn
          under the spotlight; the kid spins to the one they want and taps Play. */}
      <section aria-labelledby="specials" className="mt-4 w-full max-w-5xl px-4 sm:px-6">
        <h2 id="specials" className="mb-3 font-display text-lg font-bold text-amber-950">
          <span aria-hidden>✨ </span>Today&rsquo;s special
        </h2>
        <Showroom
          games={liveGames.map((g) => ({
            slug: g.slug,
            label: g.label,
            glyph: g.glyph,
            subject: g.subject,
            href: `/games/${g.slug}?from=${FROM_GAMES_MENU}`,
            lockedCost: isGameLocked(g.slug, unlocked) ? gameUnlockCost(g.slug) : undefined,
          }))}
        />
      </section>

      {/* The shelves: one per subject, every book standing on a wooden plank.
          Sections with no games are skipped so an empty subject never shows a
          bare shelf. */}
      <div className="mt-2 flex w-full max-w-5xl flex-col gap-8 px-4 sm:px-6">
        {SECTIONS.map((section) => {
          // Word Games also lists every game that offers the Words toggle, not
          // just games whose LAND is reading. Sixteen math-land games can be
          // played entirely as reading games; filing them only under Math made
          // the reading library look like one game. A game deliberately appears
          // in both sections — `subject` still decides its town land.
          const games = liveGames.filter((g) =>
            section.subject === 'reading'
              ? g.subject === 'reading' || g.wordsMode
              : g.subject === section.subject,
          );
          if (games.length === 0) return null;
          return (
            <Shelf key={section.subject} title={section.title} emoji={section.emoji}>
              {games.map((g) => book(g, 'sm'))}
            </Shelf>
          );
        })}

        {/* Graveyard — retired games. Rendered last, dimmed, and only when
            something is actually retired so the shelf never sits empty. */}
        {retiredGames.length > 0 && (
          <Shelf title="Graveyard" emoji="🪦" note="Old games we’ve put to rest. Still playable for now.">
            {retiredGames.map((g) => book(g, 'sm', true))}
          </Shelf>
        )}
      </div>
    </BakeryWall>
  );
}

