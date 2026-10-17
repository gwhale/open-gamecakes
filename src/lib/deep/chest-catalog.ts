// The chests, and which baking item each one holds.
//
// Dependency-free plain data, and the direct successor to landmark-catalog.ts
// (deleted with this change, having held exactly one whisk). Same reason: three
// consumers that cannot import each other share it — landmarks.ts builds the
// meshes and sonar contacts, the grant route validates a slug against it before
// writing a row, and the deep page reads which slugs a kid has already opened.
//
// POSITIONS ARE HAND-PLACED, and the depths are the point. The terrain is
// generated so the world is repeatable; a chest is AUTHORED so a spot becomes a
// place worth returning to. Each x/z below was chosen by searching the real
// seabed for the depth it wanted, then pinned here — chest-catalog.test.ts
// re-measures every one against oceanFloorM, so a chest cannot end up in the wrong
// band, on top of another chest, or below the depth limit if the terrain is
// ever retuned.
//
// THE BANDS ARE THE DIFFICULTY CURVE. Sprinkle Reef is bright and busy and the
// first chests are easy to trip over; the Kelp Kitchen is the long middle; and
// the last three sit in the twenty metres of Crumb Canyon the hull can actually
// reach, in the dark, near the limit. Going deeper is how the set gets finished.
//
// WHAT IS IN THEM IS NOT EXPLAINED. Cakey has never seen any of it either. A
// prompt or an echo that tells a kid what they are about to find has spent the
// only thing a chest has.

/** Which stretch of ocean a chest sits in. Display and tuning only — the actual
 *  depth is whatever the seabed does at its x/z. */
export type ChestBand = 'reef' | 'kelp' | 'canyon';

export interface DeepChest {
  /** Stable DB key. Never rename — kid_deep_discoveries rows point at this. */
  slug: string;
  /** Item slug from lib/items/catalog.ts. The chest's whole purpose. */
  item: string;
  band: ChestBand;
  /** What sonar calls it. Vague on purpose: "something with a lid" sends a kid
   *  to look, which is the mechanic. The real answer would end the search. */
  echo: string;
  /** Shown when the sub is close enough to interact. */
  prompt: string;
  /** Where it lies, in metres. Height comes from the seabed. */
  x: number;
  z: number;
}

export const DEEP_CHESTS: readonly DeepChest[] = [
  // ---- Sprinkle Reef: bright, sandy, easy to stumble into. ----
  {
    // NEVER RENAME. This was the ocean's only findable object for two branches
    // and both kids already have a kid_deep_discoveries row under this slug.
    // The whisk became a chest; the key it is recorded under did not change.
    slug: 'sunken-whisk',
    item: 'whisk',
    band: 'reef',
    echo: 'something metal',
    prompt: 'Take a closer look',
    x: 217,
    z: -356,
  },
  {
    slug: 'reef-crate',
    item: 'eggs',
    band: 'reef',
    echo: 'something square',
    prompt: 'Open it',
    x: -322,
    z: -251,
  },
  {
    slug: 'reef-sprinkle-box',
    item: 'sprinkles',
    band: 'reef',
    echo: 'something rattling',
    prompt: 'Open it',
    x: -227,
    z: -367,
  },

  // ---- Kelp Kitchen: the long middle of the dive. ----
  {
    slug: 'kelp-bowl-chest',
    item: 'bowl',
    band: 'kelp',
    echo: 'something round',
    prompt: 'Open it',
    x: -131,
    z: -171,
  },
  {
    slug: 'kelp-sack',
    item: 'flour',
    band: 'kelp',
    echo: 'something soft',
    prompt: 'Open it',
    x: -249,
    z: 11,
  },
  {
    slug: 'kelp-cold-box',
    item: 'butter',
    band: 'kelp',
    echo: 'something cold',
    prompt: 'Open it',
    x: -441,
    z: 69,
  },
  {
    slug: 'kelp-bottle-crate',
    item: 'milk',
    band: 'kelp',
    echo: 'something clinking',
    prompt: 'Open it',
    x: 18,
    z: 118,
  },

  // ---- Crumb Canyon: the twenty metres the hull can reach, in the dark. ----
  {
    slug: 'canyon-tin',
    item: 'sugar',
    band: 'canyon',
    echo: 'something heavy',
    prompt: 'Open it',
    x: 455,
    z: 160,
  },
  {
    slug: 'canyon-locker',
    item: 'oven-mitt',
    band: 'canyon',
    echo: 'something soft',
    prompt: 'Open it',
    x: -311,
    z: 213,
  },
  {
    slug: 'canyon-deep-chest',
    item: 'candle',
    band: 'canyon',
    echo: 'something small',
    prompt: 'Open it',
    x: 295,
    z: 249,
  },
];

export function findChest(slug: string): DeepChest | undefined {
  return DEEP_CHESTS.find((c) => c.slug === slug);
}

/** Guard for anything crossing a route boundary. The DB column is free-form
 *  text, so this is what stops a typo becoming a row nothing can render. */
export function isChestSlug(slug: string): boolean {
  return DEEP_CHESTS.some((c) => c.slug === slug);
}
