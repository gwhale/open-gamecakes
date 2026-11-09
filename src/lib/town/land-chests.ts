// The three treasure chests hidden on the mainland, and which item each holds.
//
// Dependency-free plain data, the land's twin of lib/deep/chest-catalog.ts, for
// the same reason: the town engine places them, the chest route validates a
// slug against this before writing a row, and the town page reads which ones a
// kid has already opened. None of the three can import the others.
//
// WHERE, NOT X/Y. The ocean pins its chests to metres because its seabed is a
// fixed function. The town is SOLVED — lands, roads, the train ring and the
// mountain all move whenever the layout does — so a pinned pixel would end up in
// a land or in the sea the first time anything was resized. Each chest instead
// names a KIND of hiding place, and the engine finds that place on the solved
// map (land-chest-spots.ts). Same map in, same spot out, every visit.
//
// HIDDEN MEANS HIDDEN. No map marker, no sonar, no glow until opened, and a
// chest about the size of a cupcake. George's call (2026-10-17): three, very
// well hidden, with Cakey's hints as the way in for a kid who is stuck.
//
// The hints are riddles, not directions. A hint that names the place has done
// the finding for them.

/** Where on the solved mainland a chest goes. See land-chest-spots.ts. */
export type LandChestSpot =
  /** Partway up the far side of Frosting Mountain — you have to climb round. */
  | 'mountain'
  /** The stretch of coast furthest from every land, road and rail. */
  | 'coast'
  /** The inland pocket furthest from everything, well away from the coast one. */
  | 'hollow';

export interface LandChest {
  /** Stable DB key, written into kid_items.source as `land:<slug>`. Never rename. */
  slug: string;
  /** Item slug from lib/items/catalog.ts. */
  item: string;
  spot: LandChestSpot;
  /** What Cakey says when a kid asks him for a hint. */
  hint: string;
}

export const LAND_CHESTS: readonly LandChest[] = [
  {
    slug: 'land-mountain-chest',
    item: 'honey',
    spot: 'mountain',
    hint: 'Something is tucked away on the side of the mountain nobody looks at.',
  },
  {
    slug: 'land-coast-chest',
    item: 'chocolate',
    spot: 'coast',
    hint: 'Walk the beach to the loneliest bit of sand. Nobody ever goes there. Almost nobody.',
  },
  {
    slug: 'land-hollow-chest',
    item: 'strawberries',
    spot: 'hollow',
    hint: 'Find the quietest patch of grass in town, as far from every land as you can get.',
  },
];

export function findLandChest(slug: string): LandChest | undefined {
  return LAND_CHESTS.find((c) => c.slug === slug);
}

/** How a land chest is written into kid_items.source. The ocean writes
 *  `deep:<slug>`; this is the land's half of that namespace. */
export function landChestSource(slug: string): string {
  return `land:${slug}`;
}
