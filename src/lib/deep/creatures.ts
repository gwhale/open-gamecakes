// What lives down there, and at what depth.
//
// Dependency-free content module (no `three`, no React, no DB) like
// cakey-lines.ts and vehicles.ts, so the bestiary can be read, argued with and
// tuned without opening the engine. The engine reads `depth` to decide where to
// spawn, `behaviour` to decide how it moves, and the colours to build it.
//
// THE JOKE HAS A LIMIT. The PRD is explicit and it is right: "Not every
// creature should be cake-shaped. Otherwise the joke murders the worldbuilding."
// So the ratio here is deliberate — the Jelly Donut and the Manta Pancake are
// the gag, the Sprinklefish is only sprinkle-COLOURED, and the Whisker Eel and
// the Crumbler are just animals. An ocean where everything is a pudding is a
// cartoon; an ocean where two things are puddings is a place with a secret.
//
// DEPTHS ARE THE POINT. A creature that can be met anywhere teaches a kid
// nothing, and the whole feature is built to make depth mean something. Each
// band should feel populated by ITS OWN residents, so that going deeper is how
// you meet new things — and so that a kid can eventually say "the eels live
// down where it gets dark" and be right.
//
//   0–100m    Sprinkle Reef    bright, sandy, busy. Most of the life is here.
//   100–300m  Kelp Kitchen     the forest. Shelter, so different animals.
//   300m+     Crumb Canyon     cold and dark. Few, large, strange.
//
// Sub-Cake One's hull gives up at 370m (DEPTH_LIMIT_M), so anything living
// deeper than that is deliberately out of reach — seen, never met.

export type CreatureBehaviour =
  /** Tight shoal that wheels together and keeps its distance from the sub. */
  | 'school'
  /** Slow vertical bob, barely steers. Jellies. */
  | 'drift'
  /** Long unhurried cruise in a straight line, banking gently. Rays. */
  | 'glide'
  /** Stays near the seabed, moves in short darts. */
  | 'lurk';

export interface Creature {
  /** Stable id. Used for spawn seeding, so changing it moves the animals. */
  slug: string;
  /** What a kid would call it. */
  name: string;
  /** Where it lives, in metres of depth. */
  depth: { from: number; to: number };
  behaviour: CreatureBehaviour;
  /** Roughly how big, in metres, longest axis. */
  sizeM: number;
  /** How many exist in the world. Instanced, so these are cheap — but each is
   *  still something the fog has to draw through.
   *
   *  These are DENSITIES in disguise: the bowl is 1.2km across, so the first
   *  pass at 320 sprinklefish in shoals of 26 put about a dozen shoals in the
   *  whole ocean and a dive could easily meet none of them. An empty sea with
   *  fish in it somewhere is, to the kid, an empty sea. */
  count: number;
  /** Body colour (0xRRGGBB). */
  color: number;
  /** Fin / trim colour. */
  trim: number;
  /** Does it make its own light? Only true below the sunlight. */
  glows?: boolean;
  /** One line for the field notes, when there are field notes. Kid-voiced. */
  note: string;
}

export const CREATURES: readonly Creature[] = [
  {
    slug: 'sprinklefish',
    name: 'Sprinklefish',
    // The reef's wallpaper. Shallow, everywhere, always in a crowd.
    depth: { from: 0, to: 90 },
    behaviour: 'school',
    // Bigger than a real reef fish on purpose. At 0.35m they were dust: a shoal
    // 40m off in this fog reads as grain in the image rather than as animals,
    // and the point of them is to be SEEN.
    sizeM: 0.85,
    count: 900,
    color: 0xfb7185,
    trim: 0xfde68a,
    note: 'Tiny and bright, and never on their own. They turn all at once.',
  },
  {
    slug: 'crumbler',
    name: 'Crumbler',
    // Bottom-dweller. Lives ON the reef floor, so it is the one you find by
    // looking DOWN rather than ahead.
    depth: { from: 15, to: 120 },
    behaviour: 'lurk',
    sizeM: 1.3,
    count: 190,
    color: 0x9c8f7a,
    trim: 0xcf9a52,
    note: 'Sits between the rocks pretending to be one. It is not one.',
  },
  {
    slug: 'manta-pancake',
    name: 'Manta Pancake',
    // Big, calm, and crosses the whole shelf — the first BIG thing a kid meets.
    depth: { from: 30, to: 190 },
    behaviour: 'glide',
    sizeM: 3.4,
    count: 30,
    color: 0xd9a76a,
    trim: 0xfef3c7,
    note: 'Enormous, flat and completely uninterested in you.',
  },
  {
    slug: 'jelly-donut',
    name: 'Jelly Donut',
    // Spans the kelp band into the dark. The first thing that glows.
    depth: { from: 80, to: 280 },
    behaviour: 'drift',
    sizeM: 1.4,
    count: 220,
    color: 0xf9a8d4,
    trim: 0xfecaca,
    glows: true,
    note: 'It has a hole in the middle. Nobody wants to talk about it.',
  },
  {
    slug: 'whisker-eel',
    name: 'Whisker Eel',
    // Deep, and mostly below where the kelp thins. Long and metallic — no joke
    // in this one at all, which is what makes the canyon feel serious.
    depth: { from: 180, to: 420 },
    behaviour: 'glide',
    sizeM: 2.6,
    count: 46,
    color: 0x7c8b96,
    trim: 0x9edbd7,
    glows: true,
    note: 'Long, silver, and in no hurry. Lives where the light gives up.',
  },
];

export function findCreature(slug: string): Creature | undefined {
  return CREATURES.find((c) => c.slug === slug);
}

/** Everything that could be encountered at a given depth. */
export function creaturesAtDepth(depthM: number): readonly Creature[] {
  return CREATURES.filter((c) => depthM >= c.depth.from && depthM <= c.depth.to);
}
