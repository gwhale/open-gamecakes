// Do a land's booths FIT? boothOffsetsPx spreads N slots across a span set by
// the region rect's width, and nothing else in the build compares that spacing
// to a booth's actual size. Chess Island records the arithmetic in a comment
// and a script (scripts/chess-isle-check.mjs); a comment does not fail a build,
// and the script only checks Chess. Puzzle Island's fourth booth is exactly
// how this goes wrong: four roofs on a standard 4×3 rect overlap by ~70 px and
// two tap proxies claim the same tap.
//
// Numbers mirror makeShopBooth in city3d.ts: bodyW 1.8 scene units, roof cone
// radius bodyW × 0.92, hit proxy half-width bodyW × 1.4 / 2. Wing booths
// (WING_BOOTHS in city3d.ts) stand at their own arena and take no row slot.

import { describe, expect, it } from 'vitest';
import { REGIONS } from './regions';
import { boothOffsetsPx } from './three/city3d';
import { PX_PER_UNIT } from './three/types';

const BODY_W = 1.8;
const ROOF_HALF_PX = BODY_W * 0.92 * PX_PER_UNIT;
const HIT_HALF_PX = (BODY_W * 1.4 * 0.5) * PX_PER_UNIT;
/** Keep in sync with WING_BOOTHS in city3d.ts. */
const WING: Record<string, string[]> = { 'chess-club': ['cakey-checkers'] };

describe('booth rows', () => {
  for (const region of REGIONS) {
    const row = region.games.filter((g) => !(WING[region.slug] ?? []).includes(g));
    if (row.length < 2) continue;
    it(`${region.slug}: ${row.length} booths fit on a ${region.size.w}×${region.size.h} rect`, () => {
      const xs = boothOffsetsPx(region, row.length).map((o) => o.x).sort((a, b) => a - b);
      let minGap = Infinity;
      for (let i = 1; i < xs.length; i += 1) minGap = Math.min(minGap, xs[i] - xs[i - 1]);
      // Roofs may touch but never cross; tap proxies must never overlap.
      expect(minGap - 2 * ROOF_HALF_PX, `${region.slug} roof clearance`).toBeGreaterThanOrEqual(0);
      expect(minGap - 2 * HIT_HALF_PX, `${region.slug} tap-proxy clearance`).toBeGreaterThan(0);
    });
  }
});
