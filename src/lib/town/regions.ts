// Gamecakes City — region catalog.
//
// Single source of truth for the explorable Phaser town. Lives in TS
// (not the database) because layout, costs, and adjacency will iterate
// many times before the design settles, and code is faster to change
// than schema. The /api/town/discover route validates region_slug
// against this catalog before calling the discover RPC, so a typo in
// a slug here can't accidentally create orphan rows in
// kid_region_discoveries.
//
// World layout — 16 × 17 tiles at 64 px/tile = 1024 × 1088 px:
//
//   col0     col1      col2      col3
// ┌────────┬─────────┬─────────┬──────┐
// │ chess  ╎  chess  │ castle  │      │  tier 0 (y 0..2)   chess is 8×6 and
// │────────┼─────────┼─────────┼──────│                    spills over the two
// │tree hs │ club hs │mountain │      │  tier 1 (y 3..5)   lands below it — see
// │────────┼─────────┼─────────┼──────│                    the overlap note
// │library │ cookie  │frosting │shore │  tier 2 (y 6..8)
// │────────┼─────────┼─────────┼──────│
// │        │ square  │         │ cove │  tier 3 (y 9..11)
// ├────────┴─────────┴─────────┴──────┤
// │  pit row  │ victory ln │          │  RACE ISLAND (y 12..16)
// └───────────┴────────────┴──────────┘
//
// NOTE ON THE OFFSHORE ROWS: a region's TILE position is save-space bookkeeping
// only. Chess and Race are separate islands whose real placement is solved at
// runtime by islands.ts (pushed offshore from the mainland's actual shoreline).
// They are laid out here to MATCH the solved bearing — chess NW, race to the
// south — so this map still reads like the world you actually walk.
//
// Mainland tile rects must be free, in-bounds and NON-OVERLAPPING. An OFFSHORE
// island's rect is exempt from the last one: Chess Island is 8×6 anchored at
// (0,0), so on paper it covers both kid lands, but the solver moves it
// thousands of px out to sea and nothing reads the original-space rect except
// center(tile,size) → spawnPoint. See CHESS_SIZE below for why it is shaped that
// way and what breaks if you re-anchor it.
//
// Adjacency (graph used for "approach to unlock" gating in PR 5):
//   square — cookie — library
//             │
//             └── frosting — shore — cove
//                    │
//                    └── mountain — castle
//
// Unlock costs come from the ONE game-wide price ladder in
// @/lib/tokens/economy — never hardcode a number here. Tier a land by how deep
// into the world it sits (NEAR / FAR / DEEP, or ISLAND for offshore) and the
// ladder decides what that's worth.
//
// Fully revealing the town now totals ~630 tokens ≈ 21 ACTIVE DAYS at the ~30
// tokens/day the kids actually earn. The previous numbers (5–12 per land, 79
// total) came to under three days, which is why both kids had unlocked all nine
// lands and were sitting on hundreds of spare tokens with nothing left to want.

import { getLiveGames } from '@/lib/games/registry';
import { LAND } from '@/lib/tokens/economy';
import { LOCAL_REGIONS } from './regions.local';

/** Pixel size of one tile in the world grid. Matches the Phaser scene's
 *  rendering scale; if you change this, also adjust the scene's
 *  cameras.main.setBounds and the building sprite positions. */
export const TILE_SIZE_PX = 64;

/** World dimensions in tiles. Width × height.
 *
 *  Grew 12 → 17 rows in 2026-07 to make room for Race Island's tile rects
 *  (rows 12..16). Growing this is SAFE because the spread origin in
 *  layout-core.ts is a pinned literal, not `WORLD_PX / 2` — see the ⚠️ note
 *  there before changing either. The only live consumer of the extra space is
 *  the /api/town/position clamp, which simply widens. */
export const WORLD_TILES = { w: 16, h: 17 } as const;

/** World dimensions in pixels — derived from TILE_SIZE_PX × WORLD_TILES.
 *  Use these for Phaser.Scene.cameras.main.setBounds(0, 0, w, h). */
export const WORLD_PX = {
  w: WORLD_TILES.w * TILE_SIZE_PX,
  h: WORLD_TILES.h * TILE_SIZE_PX,
} as const;

export interface Region {
  /** URL-safe stable identifier. Stored in kid_region_discoveries.region_slug. */
  slug: string;
  /** Display name shown to kids. */
  name: string;
  /** One-line flavor copy for the discover modal. */
  theme: string;
  /** Top-left corner of the region rect, in tile coordinates. */
  tile: { x: number; y: number };
  /** Region rect dimensions, in tile units. */
  size: { w: number; h: number };
  /** Tokens required to reveal this region. 0 for starters (gift). */
  unlock_cost: number;
  /** If true, kids start with this region already discovered (no spend). */
  starter: boolean;
  /** Adjacent region slugs. A locked region is unlock-eligible only when
   *  the kid has discovered at least one of its neighbors — this is the
   *  "approach to unlock" gate enforced by the scene + /api/town/discover. */
  neighbors: string[];
  /** Game slugs from GAME_REGISTRY that live in this region. Empty for
   *  scenic-only regions (town-square hosts Cakey, castle/cove hold
   *  future content). */
  games: string[];
  /** Pixel coordinates where the avatar should spawn when entering
   *  this region — by default the rect center. */
  spawnPoint: { x: number; y: number };
  /** Hex color used to tint the region's tile rect and the discover
   *  modal accent. Picked to suggest the theme without overwhelming. */
  themeColor: string;
  /** Big landmark emoji rendered in the region's center on the town
   *  map — gives each region a Disneyland-map "you know what this place
   *  is at a glance" identity without per-region custom artwork. */
  landmark: string;
  /** Ribbon banner color theme — one of the keys in the RIBBON palette
   *  (without the _DEEP suffix). Cycled per region so the scroll labels
   *  read like Disney's color-coded land banners (Adventureland green,
   *  Frontierland orange, Fantasyland pink, Discoveryland blue). Also tints
   *  the region's cakey archway gate (see makeRegionArch in city3d.ts). */
  ribbon: 'STRAWBERRY' | 'MINT' | 'AMBER' | 'BLUE' | 'PINK' | 'PURPLE';
  /** Marks a per-kid land: a region a single kid can OWN. Ownership itself is
   *  DATA — kids.land_slug (migration 0043) names the region a kid owns — so
   *  no name ever appears here. When the viewing family has an owner for this
   *  land, its center landmark becomes that kid's cupcake avatar instead of
   *  the generic hero cake + emoji (see landCupcakes in city3d.ts). Omit for
   *  shared/scenic regions. */
  kidLand?: true;
}

/** Compute pixel center of a region rect. Convenience for spawnPoint
 *  defaults below — keeps the catalog readable when most spawns are
 *  just "middle of the region". */
const center = (
  tile: { x: number; y: number },
  size: { w: number; h: number },
): { x: number; y: number } => ({
  x: (tile.x + size.w / 2) * TILE_SIZE_PX,
  y: (tile.y + size.h / 2) * TILE_SIZE_PX,
});

const TS = { x: 4, y: 9 } as const;
const CC = { x: 4, y: 6 } as const;
const LL = { x: 0, y: 6 } as const;
const FF = { x: 8, y: 6 } as const;
const SS = { x: 12, y: 6 } as const;
const MM = { x: 8, y: 3 } as const;
const CK = { x: 8, y: 0 } as const;
const CV = { x: 12, y: 9 } as const;
// The two per-kid lands sit SIDE-BY-SIDE in the middle row — one in the left
// column, its sibling right beside it — so they read as a pair you can hop
// straight between. Chess Island takes the free top-left corner above them.
// Each kid land gathers the games its owner inspired.
const CHS = { x: 0, y: 0 } as const; // Chess Island — top-left corner
const SIZE = { w: 4, h: 3 } as const;

/** Chess Island's rect — DOUBLE the standard land on both axes, because the
 *  island carries two game booths plus the giant walk-on board, and the pad, the
 *  booth row and the name arch are all sized from THIS, not from the island's
 *  sizeMul. Growing only the island would have left a standard-size cluster of
 *  buildings stranded in the middle of twice as much beach.
 *
 *  ⚠️ TWO THINGS HERE ARE LOAD-BEARING.
 *
 *  1. It OVERLAPS the two kid lands (0,3)/(4,3) in tile space, which the map
 *     above says must never happen. That rule is about the MAINLAND. Chess is
 *     offshore: islands.ts translates it thousands of px away in city space, and
 *     the only live consumer of `tile` is center(tile,size) → spawnPoint. (The
 *     one module that drew tile rects directly, TownScene.ts, is dead code behind
 *     the unrouted PhaserTownHost.) Mainland↔mainland rects must still not overlap.
 *
 *  2. Keep it anchored at (0,0) and keep the 4:3 aspect. An island's bearing is
 *     the direction from the mainland's solved centre — which IS the pinned
 *     WORLD_CENTER (8,6) — to its rect centre. 4×3 at (0,0) centres on tile
 *     (2,1.5) and 8×6 centres on (4,3); the vectors (−6,−4.5) and (−4,−3) are
 *     parallel, so the island slides straight OUT along its existing ray at
 *     −143.13° instead of swinging round the town. Re-anchoring or changing the
 *     aspect moves the whole island, and with it the ferry route. */
const CHESS_SIZE = { w: 8, h: 6 } as const;

// ---- Race Island (rows 12..16, the grid's new southern strip) ----
// TWO lands SIDE BY SIDE, and that pairing is load-bearing, not decorative:
// islands.ts sizes an island from the bounding box of its members' SPREAD
// centres, and TOWN_SPREAD (7.6) turns these 4 tiles of separation into ~1,946
// city px. That is precisely what makes the island a long east–west SPEEDWAY
// strip of ~4.15× Chess Island's area. Re-tiling these two (stacking them,
// resizing them, or splitting them onto separate islands) resizes and reshapes
// the island — re-run the numbers in docs/race-island-plan.md §2 first.
const RPR = { x: 2, y: 12 } as const; // Pit Row — the bridge lands here
const RVL = { x: 6, y: 12 } as const; // Victory Lane — right beside Pit Row
const RACE_SIZE = { w: 4, h: 5 } as const;

/** Upstream's regions. A family's own lands do NOT go here — see
 *  regions.local.ts, and the composition below. */
const UPSTREAM_REGIONS: readonly Region[] = [
  {
    slug: 'town-square',
    name: 'Town Square',
    theme: 'Cakey’s home turf — frosting fountain, sprinkle benches.',
    tile: TS,
    size: SIZE,
    unlock_cost: 0,
    starter: true,
    neighbors: ['cookie-corner'],
    // The two PRICED standalone games (see registry.ts). They live on the free
    // starter land on purpose: a kid who has never bought anything can walk to
    // them on their first visit and see exactly what Sugar Tokens are for. The
    // land costs nothing; the booths cost GAME.STANDARD each, and the page-level
    // gate in unlock-gate.ts is what actually enforces that.
    games: ['cakey-stacks', 'cakey-crane'],
    spawnPoint: center(TS, SIZE),
    themeColor: '#fde68a',
    landmark: '🎂',
    ribbon: 'AMBER',
  },
  {
    slug: 'cookie-corner',
    name: 'Cookie Corner',
    theme: 'Crumbly streets where every game is bite-sized.',
    tile: CC,
    size: SIZE,
    unlock_cost: 0,
    starter: true,
    // Chess Island moved up beside the kid lands, so it's no longer a Cookie
    // Corner neighbour — keeps the trails short.
    neighbors: ['town-square', 'library-of-lemon', 'frosting-fields'],
    games: ['flappy-math', 'pacman-cakey'],
    spawnPoint: center(CC, SIZE),
    themeColor: '#fcd34d',
    // Sugar Token, not a cookie — the currency rebrand (cookies → Sugar Tokens)
    // left this floating land landmark as the old 🍪, which read as a stray
    // "cookie coin" in the town top-of-view (kid ticket 2026-07-11). The full
    // Cookie Corner → Sugar Corner slug/name rename (see the sugar-tokens-rename
    // branch + its region-slug migration) is a separate, deploy-order-sensitive
    // change; this is just the visible icon fix.
    landmark: '🪙',
    ribbon: 'STRAWBERRY',
  },
  {
    // NOTE the slug stays `chess-club` while the display name does not. The slug
    // is live, free-form text in kid_region_discoveries, kid_avatar_position and
    // token_transactions.metadata — there is no regions table to migrate, so
    // renaming it would orphan every kid's discovery and saved position.
    slug: 'chess-club',
    name: 'Chess Island',
    theme: 'Checkered squares, a giant board underfoot, and someone to beat.',
    tile: CHS,
    size: CHESS_SIZE,
    unlock_cost: LAND.ISLAND,
    starter: false,
    // Chess Island is its OWN ISLAND — a moat separates it from the mainland,
    // so it has NO walkable neighbours. The only ways in are the Cakey Ferry
    // (1 Sugar Token, `/api/town/ferry`) or landing a flying rental on it; both
    // discover it on arrival. Empty neighbours also makes /api/town/discover
    // reject the old 8-token walk-up (isAdjacentToDiscovered fails), so the
    // ferry/fly routes are the only way in — enforced server-side.
    //
    // ⚠️ The cost above IS charged, contrary to what this comment used to say.
    // It claimed the field was "unused now that walk-up is closed" — true when
    // written, and the consequence was that an entire island cost a kid exactly
    // the 🪙1 fare, making the two islands the cheapest content in the game.
    // /api/town/ferry now charges FARE + this unlock_cost on the discovering
    // arrival, so a land costs the same whether you walk, drive, fly or ride to
    // it. The fare buys the RIDE; this buys the LAND.
    neighbors: [],
    // Order matters for placement, not just listing: boothOffsetsPx lays games
    // out west-to-east along the south edge, and the walk-on board is east of
    // the plaza — so listing Challenge LAST puts its booth on the arena side,
    // facing the giant board it is thematically the entrance to.
    //
    // ⚠️ Cakey Checkers is PREPENDED, not appended, and that is the whole point.
    // boothOffsetsPx spreads N booths across a FIXED span, so at N=3 the slots
    // are -436.5 / 0 / +436.5 px. Prepending leaves chess-challenge at exactly
    // +436.5 — unmoved, arena side preserved to the pixel — and puts Puzzles in
    // the middle, which is right because it is the one game with no arena.
    // Appending would silently hand the arena slot to Checkers and demote
    // Challenge, which is precisely what the paragraph above exists to prevent.
    // It also reserves the west slot for a future walk-on checkers board.
    //
    // Checked when Checkers was added: three booths FIT the current 8x6 rect.
    // Slot spacing is 436.5px and a booth's widest part (the roof cone) is 106px
    // per side, leaving 224px of clear air and 275px between tap proxies. The
    // island does NOT need to grow for this — growing it would actually shrink
    // the plaza-to-board grass, see the CHESS_SIZE note.
    games: ['cakey-checkers', 'chess-puzzles', 'chess-challenge'],
    spawnPoint: center(CHS, CHESS_SIZE),
    // Light candy-purple (matches the PURPLE ribbon + the ferry's sail) — was a
    // flat grey, the one non-candy theme tint in the catalog.
    themeColor: '#e9d5ff',
    landmark: '♚',
    ribbon: 'PURPLE',
  },
  {
    slug: 'library-of-lemon',
    name: 'Library of Lemon',
    theme: 'Storybook stacks where words come alive.',
    tile: LL,
    size: SIZE,
    unlock_cost: LAND.NEAR,
    starter: false,
    neighbors: ['cookie-corner'],
    games: ['word-memory'],
    spawnPoint: center(LL, SIZE),
    themeColor: '#fef08a',
    landmark: '📚',
    ribbon: 'PURPLE',
  },
  {
    slug: 'frosting-fields',
    name: 'Frosting Fields',
    theme: 'Rolling pink hills dusted with sprinkles.',
    tile: FF,
    size: SIZE,
    unlock_cost: LAND.NEAR,
    starter: false,
    neighbors: ['cookie-corner', 'sprinkle-shore', 'meringue-mountain'],
    // water-balloons was removed outright (its 3D replacement is
    // sandcastle-siege, over in Sprinkle Shore).
    games: ['marble-maze'],
    spawnPoint: center(FF, SIZE),
    themeColor: '#fbcfe8',
    landmark: '🌷',
    ribbon: 'PINK',
  },
  {
    slug: 'sprinkle-shore',
    name: 'Sprinkle Shore',
    theme: 'Sherbet sea — sharks lurk in the rainbow shallows.',
    tile: SS,
    size: SIZE,
    unlock_cost: LAND.FAR,
    starter: false,
    neighbors: ['frosting-fields', 'caramel-cove'],
    // a kid game moved to a local land. sandcastle-siege (the 3D
    // water-balloon demolition game) lives here — a sandcastle on the
    // shore is its natural beach home, and it pairs with sharks-minnows.
    games: ['sharks-minnows', 'sandcastle-siege'],
    spawnPoint: center(SS, SIZE),
    themeColor: '#a5f3fc',
    landmark: '🏖️',
    ribbon: 'BLUE',
  },
  {
    slug: 'meringue-mountain',
    name: 'Meringue Mountain',
    theme: 'Snowy peaks where asteroids fall on the brave.',
    tile: MM,
    size: SIZE,
    unlock_cost: LAND.FAR,
    starter: false,
    neighbors: ['frosting-fields', 'cakey-castle'],
    // math-asteroids + frosting-fighter (3D candy-space rail shooter) — both
    // blast-y action games; the "asteroids fall on the brave" peak is their
    // natural home. ski-free (Meringue Downhill) is the snowy-slope Ski Free
    // game — a perfect fit for the mountain.
    games: ['math-asteroids', 'frosting-fighter', 'ski-free'],
    spawnPoint: center(MM, SIZE),
    themeColor: '#e0e7ff',
    landmark: '⛰️',
    ribbon: 'MINT',
  },
  {
    slug: 'caramel-cove',
    name: 'Caramel Cove',
    theme: 'Hidden inlet of slow, sticky golden waves.',
    tile: CV,
    size: SIZE,
    unlock_cost: LAND.DEEP,
    starter: false,
    neighbors: ['sprinkle-shore'],
    // Cakey Road — the crossy-hopper. The cove's "sticky golden waves" theme
    // fits a game full of syrup rivers and candy traffic.
    games: ['cakey-road'],
    spawnPoint: center(CV, SIZE),
    themeColor: '#fde68a',
    landmark: '⚓',
    ribbon: 'AMBER',
  },
  {
    slug: 'cakey-castle',
    name: 'Cakey Castle',
    theme: 'The capstone — Cakey’s sky-high layer cake fortress.',
    tile: CK,
    size: SIZE,
    // Lowered from 20 (was a scenic capstone) now that it holds a real game —
    // Castle Crumble should be reachable in normal play, not buried behind
    // full town progression.
    unlock_cost: LAND.DEEP,
    starter: false,
    neighbors: ['meringue-mountain'],
    // Castle Crumble (3D limited-ammo demolition puzzle) holds the fortress.
    // Cakey Castle Jump moved to Treehouse Land (the owner kid's idea).
    games: ['castle-crumble', 'cakey-tower', 'castle-jump'],
    spawnPoint: center(CK, SIZE),
    themeColor: '#fce7f3',
    landmark: '🏰',
    ribbon: 'STRAWBERRY',
  },

  // ---- Race Island ----
  // A second offshore island (see islands.ts), reached by the ROAD BRIDGE south
  // of town. You cannot walk it: cross in a rented ride, or pay 1 Sugar Token to
  // ride the bus. Both lands therefore have NO walkable neighbour from the
  // mainland — `neighbors: []` on Pit Row makes /api/town/discover's adjacency
  // check reject any walk-up server-side, exactly as it does for chess-club, so
  // the bridge rule is ENFORCED and not merely rendered.
  {
    slug: 'race-pit-row',
    name: 'Pit Row',
    theme: 'Where the bridge lands — tyre stacks, toolboxes, engines revving.',
    tile: RPR,
    size: RACE_SIZE,
    unlock_cost: LAND.ISLAND,
    starter: false,
    // Empty by design — see the block comment above. The bus/vehicle arrival
    // discovers this land via /api/town/ferry, which bypasses adjacency.
    neighbors: [],
    games: ['pit-stop'],
    spawnPoint: center(RPR, RACE_SIZE),
    themeColor: '#fecaca',
    landmark: '🏁',
    ribbon: 'STRAWBERRY',
  },
  {
    slug: 'race-victory-lane',
    name: 'Victory Lane',
    theme: 'The far end of the island — podium, confetti, and a golden cup.',
    tile: RVL,
    size: RACE_SIZE,
    // FREE — an island is ONE purchase. The price of the whole island is carried
    // by its landing land (race-pit-row, LAND.ISLAND); arriving there reveals
    // every land on the island and all their games in that single payment.
    // Pricing this separately meant a kid paid twice to see one island, which is
    // not what "unlocking Race Island" should mean.
    unlock_cost: 0,
    starter: false,
    // Reached on foot from Pit Row once you're ON the island — the normal
    // approach-to-unlock flow works fine between two lands of the same island.
    neighbors: ['race-pit-row'],
    // Phase 4 of docs/race-island-plan.md §6: "a lap racer where correct answers
    // are the throttle." No re-tiling needed to hold it — Victory Lane is 4×5,
    // the largest land in the world, and boothOffsetsPx centres a lone booth on
    // the south edge. Growing RACE_SIZE would reshape the whole island (see the
    // load-bearing note above RPR/RVL), which one building does not justify.
    games: ['cakey-racer'],
    spawnPoint: center(RVL, RACE_SIZE),
    themeColor: '#fef3c7',
    landmark: '🏆',
    ribbon: 'AMBER',
  },
];

/** Every region this deployment knows about: upstream's, then this family's.
 *
 *  Local lands come LAST for two reasons. Upstream appending a region and a
 *  family appending one are then edits to different files, so a merge has
 *  nothing to reconcile — the same seam GAME_REGISTRY uses for games. And
 *  REGIONS[0] stays Town Square, which is the default spawn.
 *
 *  Upstream ships regions.local.ts empty. That is correct, not an oversight:
 *  a per-kid land belongs to the family that made it, and shipping someone
 *  else's would seed a stranger's town with a child they have never met. */
export const REGIONS: readonly Region[] = [...UPSTREAM_REGIONS, ...LOCAL_REGIONS];

if (process.env.NODE_ENV !== 'production') {
  const upstream = new Set(UPSTREAM_REGIONS.map((r) => r.slug));
  const clashes = LOCAL_REGIONS.filter((r) => upstream.has(r.slug)).map((r) => r.slug);
  if (clashes.length > 0) {
    throw new Error(
      `regions.local.ts reuses upstream region slug(s): ${clashes.join(', ')}. ` +
        `Rename yours — a duplicate slug shadows the upstream region everywhere.`,
    );
  }
}

/** Look up a region by its stable slug. Returns undefined for unknown
 *  slugs — callers must handle the case (e.g. /api/town/discover should
 *  reject the request rather than crashing). */
export function findRegion(slug: string): Region | undefined {
  return REGIONS.find((r) => r.slug === slug);
}

/** Regions a kid sees unlocked from day one. Currently town-square +
 *  cookie-corner; the migration's seed insert and kids_init_town_starters
 *  trigger keep this in sync server-side. */
export function getStarterRegions(): Region[] {
  return REGIONS.filter((r) => r.starter);
}

/** Map a game slug to the region it lives in. Returns undefined if the
 *  game isn't placed (shouldn't happen for live games — see invariant
 *  check below). Used by the parent dashboard's "where to play" hints. */
export function getRegionForGame(gameSlug: string): Region | undefined {
  return REGIONS.find((r) => r.games.includes(gameSlug));
}

/** Adjacency check — is `targetSlug` reachable from any of the kid's
 *  discovered regions? Used by /api/town/discover to enforce the
 *  "must approach from a neighbor" rule before calling the RPC. */
export function isAdjacentToDiscovered(
  targetSlug: string,
  discoveredSlugs: ReadonlyArray<string>,
): boolean {
  const target = findRegion(targetSlug);
  if (!target) return false;
  if (target.starter) return true; // starters are always reachable
  const discovered = new Set(discoveredSlugs);
  return target.neighbors.some((n) => discovered.has(n));
}

// Build-time invariant: every live game in GAME_REGISTRY must be
// placed in exactly one region. If this assertion ever fires in dev,
// either add the missing region or remove the orphan game — don't
// let it ship, because PR 4's building-sprite renderer iterates
// REGIONS, so an unplaced game would be unreachable from the town.
if (process.env.NODE_ENV !== 'production') {
  const placed = new Set(REGIONS.flatMap((r) => r.games));
  // Retired games are intentionally unplaced — they live in the All Games
  // Graveyard, not on the map — so only live games must be placed.
  const missing = getLiveGames().filter((g) => !placed.has(g.slug)).map((g) => g.slug);
  if (missing.length > 0) {
    console.warn(
      '[town/regions] These games from GAME_REGISTRY are not placed in any region:',
      missing,
    );
  }
}
