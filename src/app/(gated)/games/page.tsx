// `/games` — the "All Games" menu.
//
// The 3D city at /town is the main hub, but reaching a game there means
// walking the avatar to its building. This flat menu is the escape hatch:
// every LIVE game in one tap-list so a kid (or a parent setting up a
// session) can jump straight into any game without exploring the town.
//
// Source of truth is GAME_REGISTRY — list a game there and it shows up
// here automatically. Unlike the town, this menu intentionally ignores
// unlock/discovery state: the point is "play ANY game if they want."
//
// Server component: no data fetching needed (the registry is static), so
// this renders instantly. It lives in the (gated) group, so the parent
// login + active-kid chrome already wraps it.

import type { Metadata } from 'next';
import Link from 'next/link';
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
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

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
  return (
    <main className="relative flex flex-1 flex-col items-center overflow-hidden p-4 sm:p-6">
      {/* Soft brand wash behind the cards — same palette as /ba. */}
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

      {/* Header — logo + title on the left, back-to-town + menu on the right. */}
      <header className="flex w-full max-w-3xl items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={40} />
          <div>
            <div className="text-xs uppercase tracking-wider text-rose-500">
              Gamecakes
            </div>
            <h1 className="text-2xl font-bold">All Games</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChromeNavLink href="/town" size="sm" className="shrink-0">
            ← Town
          </ChromeNavLink>
          <MapMenu showWallet={false} />
        </div>
      </header>

      <p className="mt-3 w-full max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
        Pick any game to play right now — no exploring required.
      </p>

      {/* One section per subject. Sections with no games are skipped so an
          empty subject never renders a lonely heading. */}
      <div className="mt-6 flex w-full max-w-3xl flex-col gap-8">
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
            <section key={section.subject}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                <span aria-hidden>{section.emoji} </span>
                {section.title}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {games.map((g) => (
                  <GameCard key={g.slug} game={g} locked={isGameLocked(g.slug, unlocked)} />
                ))}
              </div>
            </section>
          );
        })}

        {/* Graveyard — retired games. Rendered last, dimmed, and only when
            something is actually retired so the section never sits empty. */}
        {retiredGames.length > 0 && (
          <section aria-label="Retired games">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              <span aria-hidden>🪦 </span>
              Graveyard
            </h2>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Old games we&rsquo;ve put to rest. Still playable for now.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {retiredGames.map((g) => (
                <GameCard key={g.slug} game={g} retired />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/** A single tap-to-play card linking into the game's own launcher.
 *  `retired` cards are dimmed and badged so the Graveyard reads as an
 *  archive, not just another shelf of games — but they stay tappable. */
function GameCard({
  game,
  retired = false,
  locked = false,
}: {
  game: GameInfo;
  retired?: boolean;
  /** Priced game this kid hasn't bought yet — badge it, but still link through:
   *  the game's page shows the unlock card, so tapping it is how you buy it. */
  locked?: boolean;
}): React.ReactElement {
  return (
    <Link
      // `?from=games` tells the game's back button to return here instead
      // of /town (see lib/games/back-nav.ts).
      href={`/games/${game.slug}?from=${FROM_GAMES_MENU}`}
      className={
        'relative flex flex-col items-center gap-2 rounded-3xl bg-white/90 p-4 text-center shadow-lg backdrop-blur-sm transition-all hover:scale-[1.03] hover:shadow-xl active:scale-[0.97] dark:bg-zinc-900/90' +
        (retired ? ' opacity-60 grayscale hover:opacity-100' : '')
      }
      style={{ minHeight: 'var(--min-tap-target)' }}
      data-locked={locked || undefined}
      aria-label={
        retired
          ? `Play ${game.label} (retired)`
          : locked
            ? `Unlock ${game.label} for ${gameUnlockCost(game.slug)} Sugar Tokens`
            : `Play ${game.label}`
      }
    >
      {retired && (
        <span className="absolute right-2 top-2 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          Retired
        </span>
      )}
      {locked && !retired && (
        <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          <span aria-hidden>🔒</span>
          <SugarTokenIcon />
          {gameUnlockCost(game.slug)}
        </span>
      )}
      <span className="text-5xl" aria-hidden>
        {game.glyph}
      </span>
      <span className="font-display text-sm font-bold leading-tight sm:text-base">
        {game.label}
      </span>
    </Link>
  );
}
