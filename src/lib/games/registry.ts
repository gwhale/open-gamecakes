// Registry of live Gamecakes games.
//
// Single source of truth for UI that needs to enumerate "what games exist."
// Today this powers the feedback modal's game-picker (so a kid filing a
// ticket from /map or /tickets can attach it to a specific game). If you
// add a new game, add its entry here so tickets can reference it.
//
// NOTE: this intentionally lists only LIVE, playable games — not "coming
// soon" placeholders — because the picker would be confusing if kids could
// pick a game that doesn't exist yet. The map pages still render their
// own placeholder tiles (see /map/math and /map/vocab GAME_CARDS arrays).

// PRICED GAMES. Cakey Stacks and Cakey Crane are the first two games to carry a
// price, which is what the unlock_cost field, unlock-gate.ts, /api/games/unlock
// and migration 0037 were all built for and have been waiting on. Both sit on
// Town Square — the free starter land every kid begins on — so a brand-new
// player can WALK to them on day one and see what their tokens are for, instead
// of the price being hidden three lands deep behind a land purchase.
//
// Never hardcode the number: it comes from the GAME tier in the one price
// ladder, lib/tokens/economy.
import { GAME } from '@/lib/tokens/economy';
// This deployment's own games. Upstream never edits that file, so a family's
// games and an upstream release cannot collide. See docs/UPDATING.md.
import { LOCAL_GAMES } from './registry.local';

export type GameSubject = 'math' | 'reading' | 'logic';

export interface GameInfo {
  /** URL slug — matches the folder under src/app/(gated)/games/. */
  slug: string;
  /** Display name shown to kids. */
  label: string;
  /** Emoji glyph used as the visual identifier. */
  glyph: string;
  /** Which land (map page) this game belongs to. */
  subject: GameSubject;
  /** Sugar Tokens to unlock this game, one time and forever. OMIT for free.
   *
   *  Games have always come free with their land, and every game that existed
   *  before this field stays that way — re-gating something a kid already plays
   *  would be taking it away. Only games added from here on carry a price, from
   *  the GAME tier in @/lib/tokens/economy. Enforced by /api/games/unlock and
   *  the booth/menu gates; a storm re-locking the LAND is the only thing that
   *  takes an unlocked game back. */
  unlock_cost?: number;
  /** This game's launcher offers the Math / Words toggle, so it can be played
   *  entirely as a reading game.
   *
   *  DELIBERATELY SEPARATE FROM `subject`, which decides which town LAND the
   *  game sits on — flipping a game's subject to 'reading' would physically
   *  move its booth off Math Land. This flag only affects menu *sections*, so
   *  a Words-capable game lists under both Math Games and Word Games.
   *
   *  Set on the 16 games whose shell calls verbalSkillFor(). Without it the
   *  Word Games section showed a single game while sixteen others quietly
   *  taught reading under a Math heading. */
  wordsMode?: boolean;
  /** Retired game. Still here (and still playable by slug) so back-nav,
   *  deep links, and the ticket picker keep resolving — but it's pulled
   *  off the town map and out of the active menu sections, surfacing only
   *  in the All Games "Graveyard". Omit (undefined) for live games. */
  retired?: boolean;
}

/** Upstream's games. A self-hosting family should NOT add to this array —
 *  every upstream release that adds a game would collide with theirs, mid-array.
 *  ./registry.local.ts exists for that, and upstream never edits it. */
/** Exported so tests can assert what UPSTREAM ships, independent of whatever
 *  a fork has added in registry.local.ts. */
export const UPSTREAM_GAMES: readonly GameInfo[] = [
  // Math Land
  // Kid-designed game #1 — a hand-drawn maze by one of the founding kids.
  // Slug is a legacy identifier (see the slug notes in town/regions.ts).
  { slug: 'sharks-minnows',  label: 'Sharks & Minnows', glyph: '🦈', subject: 'math', wordsMode: true },
  // "Flappy Cake" — renamed from "Flappy Math"; the games now carry word content
  // too, so the subject-specific name no longer fits. Slug kept stable so URLs,
  // saved data, and existing tickets keep resolving.
  { slug: 'flappy-math',     label: 'Flappy Cake',      glyph: '🐦', subject: 'math', wordsMode: true },
  // Kid-designed game #2 — the grid fishing game. Slug is legacy (as above).
  { slug: 'math-asteroids',  label: 'Math Asteroids',   glyph: '☄️', subject: 'math', wordsMode: true },
  { slug: 'marble-maze',     label: 'Marble Math',      glyph: '🎱', subject: 'math', wordsMode: true },
  // Retired: superseded by the 3D water-balloon game (sandcastle-siege).
  // Lives in the All Games "Graveyard" section, off the town map.
  { slug: 'pacman-cakey',    label: 'Cakey Chase',      glyph: '🧁', subject: 'math', wordsMode: true },
  { slug: 'sandcastle-siege', label: 'Sandcastle Siege', glyph: '🏖️', subject: 'math', wordsMode: true },
  { slug: 'frosting-fighter', label: "Cakey's Frosting Fighter", glyph: '✈️', subject: 'math', wordsMode: true },
  { slug: 'ski-free',        label: 'Meringue Downhill', glyph: '⛷️', subject: 'math', wordsMode: true },
  { slug: 'castle-crumble',  label: 'Castle Crumble',   glyph: '🏰', subject: 'math', wordsMode: true },
  { slug: 'cakey-tower',     label: 'Cakey Tower',      glyph: '🍡', subject: 'math', wordsMode: true },
  // Falling cake slices. Ships with TWO renderers over one rule set — a 3D cake
  // pan and a flat 2D classic board — picked on the launcher; see
  // lib/games/stacks/.
  //
  // PRICED. Unlike every game before it this one is not bundled with a land: it
  // stands alone on Town Square and is bought outright, once and forever. That
  // is only fair because the land it sits on is free and every kid starts there
  // — nobody is billed twice for one trip, the complaint PR #215 exists to kill.
  { slug: 'cakey-stacks',    label: 'Cakey Stacks',     glyph: '🍰', subject: 'math', wordsMode: true, unlock_cost: GAME.STANDARD },
  // Crane-drop layer-cake stacker: time the drop, lose the overhang. The
  // offcuts fall under real cannon-es physics; see lib/games/three/crane/.
  // PRICED and standalone on Town Square, same as Cakey Stacks above.
  //
  // ⚠️ Glyph is 🎂, NOT the 🏗️ crane it earns its name from: the town's
  // owner-only "Grow my land" kiosk already carries 🏗️, and two booths with the
  // same glyph on one screen is exactly the kind of seam a kid taps twice.
  { slug: 'cakey-crane',     label: 'Cakey Crane',      glyph: '🎂', subject: 'math', wordsMode: true, unlock_cost: GAME.STANDARD },
  { slug: 'cakey-road',      label: 'Cakey Road',       glyph: '🧁', subject: 'math', wordsMode: true },
  { slug: 'castle-jump',     label: 'Cakey Castle Jump', glyph: '🪜', subject: 'math', wordsMode: true },
  // Race Island's two booths. Both FREE, for the reason chess-challenge and
  // checkers are free: an island is ONE purchase (economy.ts LAND.ISLAND, and
  // PR #215 "An island is ONE unlock: one payment opens all its lands and all
  // of their games"). Arriving at Pit Row already costs FARE + LAND.ISLAND.
  //
  // These two carried GAME.STANDARD from #226/#231 until then — so seeing one
  // island cost a kid 🪙126 instead of the 🪙76 the ladder advertises, and a kid
  // who had already bought Race Island was asked to buy its booths again at the
  // door. That is the same "billed twice for the same trip" complaint #215 was
  // written to kill; it just came back one layer down, at the game instead of
  // the land. The Race Island "precedent" the chess comments below argue
  // against no longer exists — every island booth is now free.
  //
  // Race Island's first game — the lap racer Victory Lane shipped scenic for
  // (see docs/race-island-plan.md §6 Phase 4).
  { slug: 'cakey-racer',     label: 'Cakey Racer',      glyph: '🏎️', subject: 'math', wordsMode: true },
  // Race Island's second game — the Pit Row slot from docs/race-island-plan.md §6.
  { slug: 'pit-stop',        label: 'Cakey Pit Stop',   glyph: '🔧', subject: 'math', wordsMode: true },
  // Logic Land — no arithmetic; tracked against its own 'logic' skill.
  { slug: 'chess-puzzles',   label: 'Chess Puzzles',    glyph: '♟️', subject: 'logic' },
  // Chess Island's second booth. FREE: the island already costs LAND.ISLAND via
  // the ferry, and charging again would put the arena the island was just
  // doubled for behind ~3 more days of saving. (This booth argued its way to
  // free against Race Island's then-priced booths; those have since been
  // corrected to match it, so every island booth is free.)
  // Shares the chess-puzzles SKILL — see the route's page.tsx.
  { slug: 'chess-challenge', label: 'Chess Challenge',  glyph: '♞', subject: 'logic' },
  // Chess Island's third booth, and the first thing on it that is not chess.
  // FREE for the same reason chess-challenge is, only more so: it is the third
  // booth on a land the kid already paid FARE + LAND.ISLAND to reach, and
  // pricing it would make two of three booths on one island free and one not.
  //
  // Unlike chess-challenge it gets its OWN logic/checkers skill (migration
  // 0040) — checkers is a genuinely different game, and sharing would let a
  // checkers tier decide which Cakey a kid faces at CHESS. See the route.
  //
  // ⚠️ Glyph: 🔴, NOT the Unicode draughts men ⛀⛁⛂⛃ (U+26C0-C3). Those are not
  // RGI emoji and are absent from Apple Color Emoji, so on iPadOS —
  // the platform this has to be smooth on — makeEmojiSprite renders them as a
  // hairline outline or as tofu on its 128px canvas. At beacon size that is a
  // blank sign, and it would fail silently on the exact device the kids use.
  { slug: 'cakey-checkers',  label: 'Cakey Checkers',   glyph: '🔴', subject: 'logic' },
  // Vocab Land
  // Retired: the math games now carry word content too, so a dedicated word
  // "Flappy" is redundant. Kept (retired) so deep links + existing tickets still
  // resolve; surfaces only in the All Games "Graveyard", off the town map.
  { slug: 'word-memory',     label: 'Word Memory',      glyph: '🎴', subject: 'reading' },
];

/** Every game this deployment knows about: upstream's, then this family's.
 *
 *  Local games come last so an upstream release appending to UPSTREAM_GAMES and
 *  a family appending to LOCAL_GAMES are edits to different files, and a merge
 *  has nothing to reconcile.
 *
 *  A duplicate slug would silently shadow an upstream game — findGame returns
 *  the first match — so it fails loudly in development instead. Not in
 *  production: a stale local entry should never take down a kid's game. */
export const GAME_REGISTRY: readonly GameInfo[] = [...UPSTREAM_GAMES, ...LOCAL_GAMES];

if (process.env.NODE_ENV !== 'production') {
  const upstream = new Set(UPSTREAM_GAMES.map((g) => g.slug));
  const clashes = LOCAL_GAMES.filter((g) => upstream.has(g.slug)).map((g) => g.slug);
  if (clashes.length > 0) {
    throw new Error(
      `registry.local.ts reuses upstream game slug(s): ${clashes.join(', ')}. ` +
        `Rename yours — a duplicate slug shadows the upstream game everywhere.`,
    );
  }
}

/** Look up a game by its URL slug. Returns undefined for unknown slugs.
 *  Resolves retired games too — callers that need only live games should
 *  filter on `retired` themselves (see getLiveGames). */
/** What this game costs to unlock. 0 (free) unless it opted in. */
export function gameUnlockCost(slug: string): number {
  return findGame(slug)?.unlock_cost ?? 0;
}

/** Does this game need buying before it can be played?
 *
 *  Takes a Set rather than a Set|Array union: neither `instanceof Set` nor
 *  `Array.isArray` narrows a READONLY union cleanly, and the contortions to
 *  make it type-check are worse than asking callers for one shape. */
export function isGameLocked(slug: string, unlocked: ReadonlySet<string>): boolean {
  const cost = gameUnlockCost(slug);
  if (cost <= 0) return false;
  return !unlocked.has(slug);
}

export function findGame(slug: string): GameInfo | undefined {
  return GAME_REGISTRY.find((g) => g.slug === slug);
}

/** Live (non-retired) games — what the town map and active menu sections
 *  should show. The town placement invariant in lib/town/regions.ts only
 *  requires these to be placed in a region. */
export function getLiveGames(): GameInfo[] {
  return GAME_REGISTRY.filter((g) => !g.retired);
}

/** Retired games — surfaced only in the All Games "Graveyard" section. */
export function getRetiredGames(): GameInfo[] {
  return GAME_REGISTRY.filter((g) => g.retired);
}
