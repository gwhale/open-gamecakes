// Sugar Express ring — geometry self-check.
//
//   node --import ./scripts/lw-ts-alias.mjs scripts/train-track-check.mjs
//
// `src/lib/town/three/train-track.ts` imports nothing, so node's built-in type
// stripping loads it directly (same leaf discipline as race-track-check.mjs).
// The WIRING (real mainland bean + real land rects) lives in train.ts, which
// does have imports, so the alias hook resolves those for the live-geometry
// half of this check.
//
// Covers what is expensive to notice by eye in a 3D scene: whether the ring
// runs through a land (the bug this replaced), whether it wanders into the sea,
// and whether it is actually longer than the inscribed-bbox ellipse it replaced.

import assert from 'node:assert/strict';
import { fitTrainRing, trainRingFits, ellipseCircumference } from '../src/lib/town/three/train-track.ts';
import { sugarExpressRing } from '../src/lib/town/three/train.ts';
import { allIslands } from '../src/lib/town/islands.ts';
import { beanNd } from '../src/lib/town/three/bean.ts';
import { cityRectPx, mainlandBoundsPx } from '../src/lib/town/three/layout.ts';
import { findRegion } from '../src/lib/town/regions.ts';

// ---- synthetic: the fitter goes AROUND a land, not through it ----
{
  // A round island with one land pad sitting off-centre.
  const nd = (x, y) => Math.hypot(x, y) / 1000;
  const pads = [{ x0: 300, y0: -100, x1: 700, y1: 100 }];
  const ring = fitTrainRing({
    cx: 0, cy: 0, halfW: 800, halfH: 800,
    nd, pads, railHalfPx: 24, maxNd: 0.95, padClearPx: 60,
  });
  assert.ok(
    trainRingFits({ cx: 0, cy: 0, nd, pads, railHalfPx: 24, maxNd: 0.95, padClearPx: 60 }, ring.rx, ring.ry, 2000),
    'synthetic ring survives a 2000-sample re-check',
  );
  console.log('✓ synthetic: fitted ring clears an off-centre land pad');
}

// ---- synthetic: an island too crowded for the clearance asked for ----
// The fitter used to answer this case with a blind halfExtent*0.95 ellipse that
// ignored the pads entirely — it drove through them at 0px, which is the very
// inscribed-ellipse bug the fitted ring replaced. It must now give up CLEARANCE
// instead, and only ever return a land-cutting ring if no ellipse can avoid
// them at all (in which case it must say so via clearsLands).
{
  const nd = (x, y) => Math.hypot(x, y) / 1000;
  // Pads ringing the island so no ellipse can hold a 400px berth from all of them.
  const pads = [
    { x0: 300, y0: -140, x1: 760, y1: 140 },
    { x0: -760, y0: -140, x1: -300, y1: 140 },
    { x0: -140, y0: 300, x1: 140, y1: 760 },
    { x0: -140, y0: -760, x1: 140, y1: -300 },
  ];
  const ASKED = 400;
  const t = process.hrtime.bigint();
  const ring = fitTrainRing({
    cx: 0, cy: 0, halfW: 800, halfH: 800,
    nd, pads, railHalfPx: 24, maxNd: 0.95, padClearPx: ASKED,
  });
  const ms = Number(process.hrtime.bigint() - t) / 1e6;

  assert.ok(ring.clearsLands, 'crowded island still yields a ring that clears every land');
  assert.ok(ring.clearPx < ASKED, 'crowded island had to relax the clearance it was asked for');
  assert.ok(
    trainRingFits({ cx: 0, cy: 0, nd, pads, railHalfPx: 24, maxNd: 0.95, padClearPx: ring.clearPx }, ring.rx, ring.ry, 2000),
    'relaxed ring survives a 2000-sample re-check at the clearance it reports',
  );
  // No pad intrusion at ALL is the property that actually matters.
  const dToRect = (px, py, r) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));
  let minD = Infinity;
  for (let i = 0; i < 2000; i++) {
    const a = (i / 2000) * Math.PI * 2;
    for (const off of [-24, 0, 24]) {
      const x = ring.cx + (ring.rx + off) * Math.cos(a);
      const y = ring.cy + (ring.ry + off) * Math.sin(a);
      for (const p of pads) minD = Math.min(minD, dToRect(x, y, p));
    }
  }
  assert.ok(minD > 0, `relaxed ring must not enter a land (got ${minD.toFixed(1)}px)`);
  // The cheap ladder must resolve this; escalating straight to the fine grid
  // cost ~370ms, which is town-load budget the tablets do not have.
  assert.ok(ms < 150, `crowded fit stays cheap (${ms.toFixed(0)}ms)`);
  console.log(
    `✓ crowded: relaxed ${ASKED}px → ${Math.round(ring.clearPx)}px rather than cutting a land ` +
    `(${minD.toFixed(0)}px actual, ${ms.toFixed(0)}ms)`,
  );
}

// ---- live geometry: the real mainland ----
const t0 = process.hrtime.bigint();
const ring = sugarExpressRing();
const fitMs = Number(process.hrtime.bigint() - t0) / 1e6;

const main = allIslands().find((i) => i.id === 'mainland');
const nd = (px, py) => beanNd(main.center.x, main.center.y, main.halfW, main.halfH, main.pad, main.stretch, px, py);
const pads = main.regions.map((s) => findRegion(s)).filter(Boolean).map((r) => ({ slug: r.slug, ...cityRectPx(r) }));

const cfg = { cx: ring.cx, cy: ring.cy, nd, pads, railHalfPx: 24, maxNd: 0.95, padClearPx: 60 };

// Re-verify at 4x the fitter's own density — a ring that only passes at the
// density it was fitted with is a ring that got lucky between samples.
assert.ok(trainRingFits(cfg, ring.rx, ring.ry, 2880), 'live ring survives a 2880-sample re-check');
console.log('✓ live: ring stays ashore and clears every land at 4x sample density');

// Explicit intrusion report, so a regression prints WHICH land it hits.
const distToRect = (px, py, r) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));
let worstNd = -Infinity, minPad = Infinity, minSlug = '', inside = 0;
const S = 2880;
for (let i = 0; i < S; i++) {
  const a = (i / S) * Math.PI * 2;
  for (const off of [-24, 0, 24]) {
    const x = ring.cx + (ring.rx + off) * Math.cos(a);
    const y = ring.cy + (ring.ry + off) * Math.sin(a);
    worstNd = Math.max(worstNd, nd(x, y));
    for (const p of pads) {
      const d = distToRect(x, y, p);
      if (d < minPad) { minPad = d; minSlug = p.slug; }
      if (d === 0) inside++;
    }
  }
}
assert.equal(inside, 0, 'no sample sits inside a land pad');
assert.ok(worstNd < 1, 'no sample is out to sea');

// ---- longer than what it replaced ----
const B = mainlandBoundsPx();
const oldLen = ellipseCircumference((B.x1 - B.x0) / 2 - 40, (B.y1 - B.y0) / 2 - 40);
const newLen = ellipseCircumference(ring.rx, ring.ry);
assert.ok(newLen > oldLen, 'ring is longer than the old inscribed-bbox ellipse');

console.log('\n--- Sugar Express ring ---');
console.log('  centre        ', Math.round(ring.cx), Math.round(ring.cy));
console.log('  radii         ', Math.round(ring.rx), '×', Math.round(ring.ry));
console.log('  circumference ', Math.round(newLen), `px  (was ${Math.round(oldLen)} — +${(((newLen / oldLen) - 1) * 100).toFixed(1)}%)`);
console.log('  lap time      ', (newLen / 300).toFixed(1), 's at 300px/s (was', ((oldLen / 300) + 5 * 1.6).toFixed(1), 's incl. 5×1.6s stops)');
console.log('  closest coast ', worstNd.toFixed(3), 'nd (1.0 = water)');
console.log('  closest land  ', Math.round(minPad), `px (${minSlug})`);
console.log('  fit cost      ', fitMs.toFixed(1), 'ms (once, memoised)');
console.log('\n✓ all train-track checks passed');
