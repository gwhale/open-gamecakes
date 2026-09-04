// Town Story Events — the "here's what changed in the world, and why" alerts.
//
// When something about Gamecakes Island changes (a land moves, a new place
// opens, a season ends) the kid deserves an in-world explanation, not a silently
// rearranged map. Each entry here is one story: a short storybook toast (WHAT +
// WHY) plus a handful of Cakey-voiced narration beats that play as a mini
// visual narrative in the town.
//
// Like regions.ts / vehicles.ts this is a dependency-free content module (no
// `three`, no React, no DB) so it is the SINGLE SOURCE OF TRUTH shared by:
//   * the StoryAlert toast + StoryCard        — read icon/title/blurb/beats;
//   * the story-seen API validator            — reads slug via isStorySlug();
//   * the cutscene spec builder (PR B)        — reads regionSlug/style/beatCount;
//   * the Story Oven / What's-New re-read log  — mirrors the same copy.
//
// A story shows ONCE per kid (persisted in kid_story_seen, mirroring how
// kid_region_discoveries records a one-time discovery) but is always replayable
// from Cakey's panel. The slug is the DB key — keep it stable forever.
//
// IMPORTANT — a story is NARRATIVE, not a live world edit. Regions are static
// (their tile positions are baked into regions.ts). "Chess Club moved to its own
// island" dramatizes a change that is already on the map; the cutscene narrates
// it, it does not slide geometry across the world.
//
// ── Copy style guide (so every future story reads the same) ──────────────────
//   * Present tense, active voice, one idea per line, ≤ 12 words, grade 1–2
//     reading level (short everyday words a 5-year-old hears out loud).
//   * Explain the WHY as a reason a kid CARES — more room, a new game, a special
//     home. Never logistics or technical cause ("we added a tile", "a config
//     changed" are banned).
//   * Cakey is an excited friend: use "…" for one beat of suspense, and at most
//     ONE all-caps wow-word per story. Keep it happy and safe, never scary/sad.
//   * At most one emoji per line, cake/candy/place glyphs only (♟️ 🍰 🪙 🏝️ ✨),
//     as an end-of-line feeling-stamp — never mid-sentence. Currency is always
//     🪙 Sugar Tokens if referenced.

import { findRegion } from './regions';

/** When a story becomes relevant to a kid. A discriminated union so the host's
 *  "which story should I show?" check stays a pure function of props it already
 *  holds (discovered slugs + seen slugs) — no extra reads. */
export type StoryTrigger =
  /** Announce to everyone, gated only by "not seen yet". A world event that
   *  happened in code for all kids (e.g. the Chess Club relocation). */
  | { kind: 'global' }
  /** Only eligible once the kid has this region in their discoveries — lets a
   *  future story fire when a specific land is unlocked, with no new plumbing. */
  | { kind: 'region-discovered'; regionSlug: string };

/** How the cutscene should FEEL (PR B) — selects which existing engine juice the
 *  camera move reuses. Defined here so a story picks a tested style, never
 *  authors fresh camera math:
 *    * 'arrival'   — lift, glide to the land, reveal + sprinkle burst + sign
 *                    drop. Wonder → delight. New/relocated land, big unlock.
 *    * 'spotlight' — short fixed-radius orbit of one land, single glow pulse.
 *                    "Look right here." A new booth on an existing land.
 *    * 'farewell'  — crane up/back as the land fogs softly over. Cozy goodbye.
 *                    A place closing for a season. */
export type StoryStyle = 'arrival' | 'spotlight' | 'farewell';

export interface StoryEvent {
  /** Stable id. Stored in kid_story_seen.story_slug — never change it. */
  slug: string;
  /** Toast icon emoji (fills the CakeyHint 🎂 slot). */
  icon: string;
  /** Toast headline — the WHAT, one short line. */
  title: string;
  /** Toast sub-line — the WHY, one short kid-voiced line (what+why together). */
  blurb: string;
  /** 3–5 Cakey-voiced narration beats shown during the cutscene / storybook. */
  beats: readonly string[];
  /** Region the story is about — the cutscene pans to it and the storybook
   *  fires its reveal shimmer. Omit for a non-spatial story. */
  regionSlug?: string;
  /** Cutscene flavor → engine juice (see StoryStyle). */
  style: StoryStyle;
  /** When this story is relevant to a given kid. */
  trigger: StoryTrigger;
}

// ============================================================================
// THE STORIES — newest first (the host shows the first eligible unseen one).
// ============================================================================
export const STORY_EVENTS: readonly StoryEvent[] = [
  {
    slug: 'my-land-building',
    icon: '🏠',
    title: 'You can build on your land now!',
    blurb:
      'Your own land can grow from a plot into a cottage, then a tower, then a castle.',
    beats: [
      'Your very own land has been waiting for something…',
      'Now you can BUILD on it!',
      'Start with a cosy cottage. Then a tall tower.',
      'Keep going and your land becomes a real castle!',
      'Tap your land in town to start building. 🏠',
    ],
    // NO regionSlug on purpose. Every kid's own land is a DIFFERENT region
    // (one kid land vs another), and a story carries a single slug — so
    // pointing at either one would pan the wrong kid to someone else's land.
    // engine.ts skips the camera move when the slug is absent (`if
    // (!cs.regionSlug) return`), and StoryAlert/StoryCard both guard it, so a
    // non-spatial story degrades cleanly to toast + beats.
    style: 'spotlight',
    trigger: { kind: 'global' },
  },
  {
    slug: 'race-island-opens',
    icon: '🏁',
    title: 'A race island appeared out at sea!',
    blurb:
      'It has a giant race track, and a bridge you cross on wheels or by bus.',
    // The third beat is doing real work: the bridge REFUSES kids on foot, and a
    // boom barrier that stops you with no explanation reads as a broken game.
    // Teaching the rule here, in Cakey's voice, before a kid ever walks up to
    // it, turns "why won't it let me" into "oh — I need wheels!"
    beats: [
      'Look far past the beach… something is out at sea!',
      'A whole island for racing, with a long candy bridge!',
      'But that bridge is a ROAD. No walking on it!',
      'Ride a skateboard or a jeep across… or take the bus!',
      'Save up your Sugar Tokens. A whole island awaits! 🪙',
    ],
    regionSlug: 'race-pit-row',
    style: 'arrival',
    trigger: { kind: 'global' },
  },
  {
    slug: 'chess-club-island',
    icon: '♟️',
    title: 'Chess Club sailed to its own island!',
    blurb:
      'It floated up to the quiet top corner, so now it has room for bigger games.',
    beats: [
      'Something changed while you were playing…',
      'The whole Chess Club packed up its checkered board…',
      '…and floated all the way out to its OWN island!',
      'Now there’s room for giant games. Come visit!',
      'Catch the Cakey Ferry at the glowing dock! ♟️',
    ],
    regionSlug: 'chess-club',
    style: 'arrival',
    trigger: { kind: 'global' },
  },
];

/** Look up a story by its stable slug. Returns undefined for unknown slugs. */
export function findStory(slug: string): StoryEvent | undefined {
  return STORY_EVENTS.find((s) => s.slug === slug);
}

/** Type guard — is this string one of the known story slugs? Used to validate
 *  the story-seen API body before writing a kid_story_seen row. */
export function isStorySlug(x: unknown): x is string {
  return typeof x === 'string' && STORY_EVENTS.some((s) => s.slug === x);
}

// Build-time invariant: every region a story points at must resolve in the
// catalog, or the toast/cutscene would reference a dead land. Mirrors the
// GAME_REGISTRY placement check at the end of regions.ts — warn loudly in dev,
// never let a typo'd slug ship.
if (process.env.NODE_ENV !== 'production') {
  const bad: string[] = [];
  for (const s of STORY_EVENTS) {
    if (s.regionSlug && !findRegion(s.regionSlug)) bad.push(`${s.slug}→${s.regionSlug}`);
    if (s.trigger.kind === 'region-discovered' && !findRegion(s.trigger.regionSlug)) {
      bad.push(`${s.slug} trigger→${s.trigger.regionSlug}`);
    }
  }
  if (bad.length > 0) {
    console.warn(
      '[town/story-events] These stories reference regions not in the catalog:',
      bad,
    );
  }
}
