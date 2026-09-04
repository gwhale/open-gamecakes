// Race Island circuit — geometry self-check.
//
//   node scripts/race-track-check.mjs
//
// `src/lib/town/three/race-track.ts` imports nothing, so node's built-in type
// stripping loads it directly. If it ever grows an import this stops running,
// which is the intended alarm: engine.ts needs this maths BEFORE the city (and
// therefore before any `three`) exists, so it has to stay leaf-level.
//
// Covers what would be expensive to notice by eye in a 3D scene: whether the
// ring is arc-length uniform (bunched kerbs at the hairpins), whether it
// actually closes, whether the lateral axis is consistent, and whether the
// fitter respects land and land-pad constraints instead of quietly running the
// circuit out to sea or straight through Victory Lane.

import assert from 'node:assert/strict';
import { makeRaceTrack, fitRaceTrack } from '../src/lib/town/three/race-track.ts';

const approx = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

// ---- a plain wide ellipse, roughly Race Island's proportions ----
const T = makeRaceTrack({ cx: 0, cy: 0, rx: 2000, ry: 500, halfWidthPx: 120 });

// Closure: t=0 and t=1 are the same point, and it is on the ellipse.
{
  const a = T.pointAt(0);
  const b = T.pointAt(1);
  approx(a.x, b.x, 1e-6, 'ring closes in x');
  approx(a.y, b.y, 1e-6, 'ring closes in y');
  // Negative and >1 wrap identically — engine pushes segments with raw indices.
  const c = T.pointAt(-0.25);
  const d = T.pointAt(0.75);
  approx(c.x, d.x, 1e-6, 't wraps for negatives');
}

// Arc-length uniformity: equal steps in t must be equal steps in DISTANCE.
// Sampling an ellipse by ANGLE instead bunches points at the hairpins, which
// shows up as kerb blocks crowding in the turns.
{
  const N = 240;
  let min = Infinity;
  let max = 0;
  for (let i = 0; i < N; i++) {
    const a = T.pointAt(i / N);
    const b = T.pointAt((i + 1) / N);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  const spread = (max - min) / max;
  assert.ok(spread < 0.02, `step spacing varies ${(spread * 100).toFixed(1)}% — not arc-length uniform`);
  // The naive by-angle version, for contrast: it must be visibly worse, else
  // this assertion is not actually testing anything.
  let amin = Infinity;
  let amax = 0;
  for (let i = 0; i < N; i++) {
    const a0 = ((i / N) * Math.PI * 2), a1 = (((i + 1) / N) * Math.PI * 2);
    const d = Math.hypot(2000 * (Math.cos(a1) - Math.cos(a0)), 500 * (Math.sin(a1) - Math.sin(a0)));
    amin = Math.min(amin, d);
    amax = Math.max(amax, d);
  }
  assert.ok((amax - amin) / amax > 0.5, 'by-angle sampling should be much worse; check the test');
}

// Perimeter is sane — Ramanujan's approximation for an ellipse.
{
  const a = 2000, b = 500;
  const h = ((a - b) ** 2) / ((a + b) ** 2);
  const ram = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  approx(T.lengthPx, ram, ram * 0.001, 'lap length matches Ramanujan');
}

// Tangent and side are unit, perpendicular, and consistently handed.
{
  for (let i = 0; i < 32; i++) {
    const t = i / 32;
    const tan = T.tangentAt(t);
    const side = T.sideAt(t);
    approx(Math.hypot(tan.x, tan.y), 1, 1e-9, 'tangent is unit');
    approx(Math.hypot(side.x, side.y), 1, 1e-9, 'side is unit');
    approx(tan.x * side.x + tan.y * side.y, 0, 1e-9, 'side ⟂ tangent');
    // Cross product sign must never flip — a flip mid-lap would turn the ribbon
    // inside out, exactly the bug that shipped in the racer game.
    const cross = tan.x * side.y - tan.y * side.x;
    assert.ok(cross > 0.99, `side handedness flipped at t=${t} (cross ${cross})`);
  }
}

// offsetAt is symmetric about the centre-line and lands on the kerbs at ±1.
{
  const t = 0.137;
  const c = T.pointAt(t);
  const l = T.offsetAt(t, -1);
  const r = T.offsetAt(t, 1);
  approx(Math.hypot(l.x - c.x, l.y - c.y), 120, 1e-6, 'left kerb is halfWidth out');
  approx(Math.hypot(r.x - c.x, r.y - c.y), 120, 1e-6, 'right kerb is halfWidth out');
  approx((l.x + r.x) / 2, c.x, 1e-6, 'offsets straddle the centre-line');
}

// segments() tiles the whole ring without gaps.
{
  const segs = T.segments(64);
  assert.equal(segs.length, 64);
  let total = 0;
  for (const s of segs) total += Math.hypot(s.bx - s.ax, s.by - s.ay);
  assert.ok(total > T.lengthPx * 0.99, 'segments should cover the lap (chords, so slightly short)');
  assert.ok(total <= T.lengthPx + 1e-6, 'chords cannot exceed arc length');
  // Consecutive segments must join.
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    const b = segs[(i + 1) % segs.length];
    approx(a.bx, b.ax, 1e-6, `segment ${i} joins the next in x`);
  }
}

// nearestT finds the right place — this is what aligns the start/finish with
// wherever the bridge lands.
{
  const t0 = 0.31;
  const p = T.pointAt(t0);
  approx(T.nearestT(p), t0, 1.5 / 720, 'nearestT recovers a point on the ring');
}

// straightness separates straights from hairpins.
{
  assert.ok(T.straightness(0) > 0.95, 'the long straight should read straight');
  assert.ok(T.straightness(0.25) < 0.05, 'the hairpin should read curved');
}

// ---- the fitter, against a synthetic island ----
{
  // A bean-ish field: elliptical, nd = 1 at the shoreline.
  const HW = 2410, HH = 641;
  const nd = (x, y) => Math.hypot(x / HW, y / HH);
  // Two land pads either side of centre, like Pit Row / Victory Lane.
  const pads = [
    { x0: -972, y0: -352, x1: -410, y1: 352 },
    { x0: 410, y0: -352, x1: 972, y1: 352 },
  ];
  // 70px half-width ≈ the Sugar Mile's deck (BRIDGE_HALF_W_PX 78). A 120px
  // half-width was the first try and it is simply too fat for a 1,283px-tall
  // island — it left no room between the pads and the shore, and no ellipse
  // satisfied both constraints at once.
  const HALF_W_PX = 70;
  const fitted = fitRaceTrack({ cx: 0, cy: 0, halfW: HW, halfH: HH, halfWidthPx: HALF_W_PX, nd, pads });

  // Stays ashore at the OUTER edge, not merely at the centre-line.
  for (let i = 0; i < 200; i++) {
    const t = i / 200;
    for (const edge of [-1, 1]) {
      const p = fitted.offsetAt(t, edge);
      assert.ok(nd(p.x, p.y) <= 0.9701, `tarmac edge ran offshore at t=${t}: nd=${nd(p.x, p.y).toFixed(3)}`);
    }
  }
  // Runs AROUND the pads, not through them.
  for (let i = 0; i < 200; i++) {
    const c = fitted.pointAt(i / 200);
    for (const pad of pads) {
      const dx = Math.max(pad.x0 - c.x, 0, c.x - pad.x1);
      const dy = Math.max(pad.y0 - c.y, 0, c.y - pad.y1);
      assert.ok(Math.hypot(dx, dy) >= HALF_W_PX + 60 - 1e-6, `circuit cuts through a land pad at t=${i / 200}`);
    }
  }
  // It should be a big circuit, not a timid one hiding in the middle.
  assert.ok(fitted.rx > HW * 0.5, `fitted rx ${fitted.rx.toFixed(0)} is too small for the island`);
  assert.ok(fitted.lengthPx > 4000, 'lap should be a real lap');

  console.log(`✅ race track check passed
   fitted     rx ${fitted.rx.toFixed(0)} × ry ${fitted.ry.toFixed(0)} px on a ${HW * 2}×${HH * 2} island
   lap        ${fitted.lengthPx.toFixed(0)} px (${(fitted.lengthPx / 64).toFixed(0)} scene units)
   width      ${fitted.halfWidthPx * 2} px tarmac
   uniformity arc-length parameterised (by-angle would bunch >50% at the hairpins)`);
}
