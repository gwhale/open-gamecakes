// Soccer pitch placement check — run before touching the pitch or the islands.
//
//   node --import ./scripts/lw-ts-alias.mjs scripts/soccer-pitch-check.mjs
//
// Kid ticket, 27 July 2026: "The soccer field is in the water." It was — all four
// corners past the shoreline, centre at nd 1.121.
//
// The pitch had been placed by scanning `cityBoundsPx()`, the bounding RECTANGLE
// of every region INCLUDING the offshore islands, and testing only rect overlap.
// It never asked `nd`. So as Chess Island moved offshore and then grew, the
// "centre of bounds" drifted thousands of px west and dragged the pitch into open
// sea — with nothing in the build able to notice.
//
// That is the failure mode this file exists for: the pitch's position is DERIVED
// from world geometry that other people change for unrelated reasons. Asserts:
//
//   1. Every corner of the pitch is on GRASS (nd <= 0.82 on the mainland bean),
//      not on sand and certainly not in water.
//   2. The pitch does not overlap any land rect.
//   3. It is actually near the town, not marooned at the far edge of the island.
//   4. The placement is DETERMINISTIC — same answer twice, so the flat/no-scatter
//      reservation computed at boot matches the pitch that gets rendered.

import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const req = createRequire(import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'maath/easing') {
      return {
        url: pathToFileURL(req.resolve('maath/easing/dist/maath-easing.cjs.js')).href,
        shortCircuit: true,
      };
    }
    return next(spec, ctx);
  },
});

const { REGIONS } = await import('../src/lib/town/regions.ts');
const { cityRectPx, cityCenterPx } = await import('../src/lib/town/three/layout.ts');
const { allIslands } = await import('../src/lib/town/islands.ts');
const { beanNd } = await import('../src/lib/town/three/bean.ts');
const { pitchCenterPx, pitchRectPx, GRASS_ND } = await import(
  '../src/lib/town/three/soccer-pitch.ts'
);

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

// Must match engine.ts.
const FIELD_W_PX = 720;
const FIELD_H_PX = 480;

const zoneRects = REGIONS.map((r) => cityRectPx(r));
const main = allIslands().find((i) => i.id === 'mainland');
if (!main) fail('no mainland island');

const c = pitchCenterPx(FIELD_W_PX, FIELD_H_PX, zoneRects);
const rect = pitchRectPx(c, FIELD_W_PX, FIELD_H_PX);
const nd = (x, y) => beanNd(main.center.x, main.center.y, main.halfW, main.halfH, main.pad, main.stretch, x, y);

console.log(`Soccer pitch: ${FIELD_W_PX}x${FIELD_H_PX} centred ${Math.round(c.x)},${Math.round(c.y)}`);
console.log(`  centre nd       ${nd(c.x, c.y).toFixed(3)}`);

// --- 1. Every corner on grass ----------------------------------------------
let worst = 0;
for (const [x, y] of [
  [rect.x0, rect.y0],
  [rect.x1, rect.y0],
  [rect.x0, rect.y1],
  [rect.x1, rect.y1],
]) {
  worst = Math.max(worst, nd(x, y));
}
console.log(`  worst corner nd ${worst.toFixed(3)} (grass line ${GRASS_ND}, shoreline 1.0)`);
if (worst > 1) {
  fail(
    `the pitch is IN THE WATER — worst corner nd ${worst.toFixed(3)}. This is the exact bug a kid ` +
      'reported on 27 July 2026; see the header of soccer-pitch.ts.',
  );
}
if (worst > GRASS_ND) {
  fail(`the pitch's corner is on SAND at nd ${worst.toFixed(3)} (grass line ${GRASS_ND}).`);
}

// --- 2. Clear of every land rect -------------------------------------------
const hit = zoneRects
  .map((rc, i) => ({ rc, slug: REGIONS[i].slug }))
  .filter(
    ({ rc }) => !(rect.x1 < rc.x0 || rect.x0 > rc.x1 || rect.y1 < rc.y0 || rect.y0 > rc.y1),
  );
if (hit.length > 0) fail(`the pitch overlaps ${hit.map((h) => h.slug).join(', ')}`);
console.log(`  land overlap    none (${zoneRects.length} rects checked)`);

// --- 3. Near the town, not marooned ----------------------------------------
// The pitch is meant to read as the town's playing field. A pitch technically on
// grass but out past the far shore would pass every test above and still be
// wrong, so bound how far it may sit from Town Square.
const sq = cityCenterPx('town-square');
const dist = Math.hypot(c.x - sq.x, c.y - sq.y);
const LIMIT = 4000;
console.log(`  from Town Square ${Math.round(dist)} px (limit ${LIMIT})`);
if (dist > LIMIT) fail(`the pitch is ${Math.round(dist)}px from Town Square — it reads as marooned.`);

// --- 4. Deterministic -------------------------------------------------------
// The engine computes the footprint once for the flat/no-scatter mask and again
// when rendering. If placement were not stable, trees would spawn on the pitch.
const again = pitchCenterPx(FIELD_W_PX, FIELD_H_PX, zoneRects);
if (again.x !== c.x || again.y !== c.y) {
  fail(`placement is NOT deterministic: ${c.x},${c.y} then ${again.x},${again.y}`);
}
console.log('  deterministic   yes');

console.log('\nOK');
