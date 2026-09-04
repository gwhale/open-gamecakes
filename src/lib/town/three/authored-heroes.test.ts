// Guards the authored hero-landmark list.
//
// The damaging mistake here is not a wrong height — it is swapping a hero that
// must NOT be a fixed mesh. Two categories can never be authored:
//
//   * per-kid lands, whose hero IS that kid's own cupcake, assembled at runtime
//     from their CupcakeConfig. A fixed GLB would replace a child's character
//     with someone else's.
//   * the generic 2-tier cake, which is tinted per region by themeColor.
//
// city3d checks kidCupcake first so a per-kid land always wins, but a slug
// listed here would still be wrong, and nothing at runtime would complain.

import { describe, expect, it } from 'vitest';
import { REGIONS, findRegion } from '@/lib/town/regions';
import { AUTHORED_HEROES, AUTHORED_HERO_SLUGS } from './authored-registry';

describe('AUTHORED_HEROES', () => {
  it('never lists a per-kid land', () => {
    for (const slug of Object.keys(AUTHORED_HEROES)) {
      const region = findRegion(slug);
      expect(
        region?.kidLand,
        `${slug} is a per-kid land — its hero is that kid's own cupcake and must ` +
          'stay procedural, not be replaced by a fixed authored mesh.',
      ).toBeFalsy();
    }
  });

  it('only lists slugs that are real regions', () => {
    for (const slug of Object.keys(AUTHORED_HEROES)) {
      expect(findRegion(slug), `unknown region slug: ${slug}`).toBeDefined();
    }
  });

  it('derives the slug set from the mapping', () => {
    expect([...AUTHORED_HERO_SLUGS].sort()).toEqual(Object.keys(AUTHORED_HEROES).sort());
  });

  it('gives every hero a positive target height', () => {
    // city3d places plinth balloons, the arch gate and the marquee around the
    // hero assuming the procedural silhouette's size, so height is a contract.
    for (const [slug, spec] of Object.entries(AUTHORED_HEROES)) {
      expect(spec.targetHeightU, slug).toBeGreaterThan(0);
      expect(spec.key, slug).toBe(`hero-${slug}`);
    }
  });

  it('leaves the majority of regions procedural', () => {
    // A sanity net: if someone bulk-adds every slug, the generic tinted cake and
    // the per-kid lands would get swept in.
    expect(AUTHORED_HERO_SLUGS.size).toBeLessThan(REGIONS.length / 2);
  });
});
