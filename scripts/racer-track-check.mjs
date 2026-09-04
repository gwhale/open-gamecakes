// Cakey Racer — track + race-logic self-check.
//
//   node scripts/racer-track-check.mjs
//
// No framework on purpose. `src/lib/games/three/racer/track.ts` imports nothing
// at all, so node's built-in type stripping (on by default since 22.18) loads
// it directly. If that module ever grows an import — of `three`, of an `@/`
// alias, of anything — this script stops running, which is the intended alarm:
// the race arithmetic is supposed to stay testable without a WebGL context.
//
// Covers the four things that would actually break the race and be hard to spot
// by eye: lap counting, finishing order, the rubber-band's promised bounds, and
// whether a lap is a sane length for a kid's attention span.

import assert from 'node:assert/strict';
import {
  TRACK_POINTS, TRACK_SCALE, LAPS, GATES_AT,
  TOP_SPEED, ROUGH_SPEED, BOOST_MUL, RUBBER_RANGE, RUBBER_STRENGTH,
  CONES, RIVALS, MAX_U, ROUGH_AT,
  lapOf, lapFrac, placeOf, isOnTrack, speedCapAt, rivalSpeed, overlaps,
  polylineLength,
} from '../src/lib/games/three/racer/track.ts';

const L = polylineLength(TRACK_POINTS, TRACK_SCALE);

// ---- laps come off monotonic `s`, so the seam cannot bite ----
assert.equal(lapOf(0, L), 0, 'on the line = lap 0');
assert.equal(lapOf(L - 0.001, L), 0, 'a hair short of the line is still lap 0');
assert.equal(lapOf(L, L), 1, 'crossing the line completes lap 1');
assert.equal(lapOf(L * 2.5, L), 2);
// The bug this replaces: `if (u < lastU) laps++` double-counts when a racer
// jitters across the seam. `s` never decreases, so re-reading it is idempotent.
for (const s of [L - 0.01, L, L + 0.01, L, L + 0.02]) assert.ok(lapOf(s, L) >= 0);
assert.ok(Math.abs(lapFrac(L * 3, L) - 0) < 1e-9, 'lap fraction resets on the line');
assert.ok(Math.abs(lapFrac(L * 1.5, L) - 0.5) < 1e-9);

// ---- finishing order ----
assert.equal(placeOf(100, [90, 80, 70]), 1, 'leading = P1');
assert.equal(placeOf(100, [110, 80, 70]), 2);
assert.equal(placeOf(100, [110, 120, 130]), 4, 'last of four');
assert.equal(placeOf(100, [100, 100, 100]), 1, 'a dead heat is scored in the kid\'s favour');
assert.equal(placeOf(0, []), 1, 'a lone racer is P1');

// ---- rough vs road ----
assert.ok(isOnTrack(0) && isOnTrack(ROUGH_AT) && !isOnTrack(ROUGH_AT + 0.01));
assert.equal(speedCapAt(0, false), TOP_SPEED);
assert.equal(speedCapAt(1.5, false), ROUGH_SPEED, 'off the road is slower');
assert.equal(speedCapAt(0, true), TOP_SPEED * BOOST_MUL);
assert.ok(speedCapAt(1.5, true) < speedCapAt(0, false),
  'a boost in the rough must never beat plain on-road pace, or the road stops mattering');
assert.ok(MAX_U > ROUGH_AT, 'there has to be rough to drive on before the boundary');

// ---- rubber-band stays inside the envelope it promises ----
const base = TOP_SPEED;
for (let gap = -400; gap <= 400; gap += 7) {
  const v = rivalSpeed(base, gap, 0); // gap = how far AHEAD the rival is
  assert.ok(v >= base * (1 - RUBBER_STRENGTH) - 1e-9 && v <= base * (1 + RUBBER_STRENGTH) + 1e-9,
    `rubber-band escaped its clamp at gap ${gap}: ${v}`);
}
assert.ok(rivalSpeed(base, 200, 0) < base, 'a rival well clear eases off');
assert.ok(rivalSpeed(base, -200, 0) > base, 'a dropped rival pushes on');
assert.equal(rivalSpeed(base, 0, 0), base, 'level pegging = base pace');
assert.ok(rivalSpeed(base, RUBBER_RANGE, 0) < rivalSpeed(base, RUBBER_RANGE / 2, 0),
  'band tightens monotonically with the gap');

// ---- contact box ----
assert.ok(overlaps(100, 0, 101, 0), 'nose to tail is contact');
assert.ok(!overlaps(100, 0, 120, 0), 'twenty units clear is not');
assert.ok(!overlaps(100, -0.9, 100, 0.9), 'opposite sides of the road is not contact');

// ---- cones are avoidable ----
for (const c of CONES) {
  assert.ok(c.at >= 0 && c.at < 1, `cone lap fraction out of range: ${c.at}`);
  assert.ok(Math.abs(c.u) < ROUGH_AT, `cone ${c.at} sits off the road`);
}
// No two cones close enough in `s` to wall the road off.
const sorted = [...CONES].sort((a, b) => a.at - b.at);
for (let i = 1; i < sorted.length; i++) {
  const near = (sorted[i].at - sorted[i - 1].at) * L < 8;
  assert.ok(!near || Math.abs(sorted[i].u - sorted[i - 1].u) < 1.2,
    `cones at ${sorted[i - 1].at}/${sorted[i].at} could pincer the road`);
}
for (const g of GATES_AT) {
  assert.ok(g > 0.05 && g < 0.95, `gate at ${g} is too close to the start/finish line`);
  // 14u ≈ 0.6s at top speed — enough that the arch is read and lined up before
  // anything has to be dodged.
  assert.ok(CONES.every((c) => Math.abs(c.at - g) * L > 14), `a cone is parked in the ${g} gate`);
}
assert.ok(GATES_AT.length >= 2, 'one gate a lap makes a racing game that forgot to be a maths game');

// ---- race is the right LENGTH for a kid ----
const lapSec = L / TOP_SPEED;
const raceSec = lapSec * LAPS;
const problems = LAPS * GATES_AT.length;
assert.ok(lapSec > 8 && lapSec < 25, `lap of ${lapSec.toFixed(1)}s is outside the fun window`);
assert.ok(raceSec < 150, `${raceSec.toFixed(0)}s race will not fit a 3-minute round with gates`);
assert.ok(problems >= 6, `${problems} problems a run is too little practice to justify the round`);
assert.equal(RIVALS.length, 3);
assert.ok(RIVALS.every((r) => r.pace > 0.5 && r.pace <= 1), 'rival pace must be a sane fraction');
assert.ok(new Set(RIVALS.map((r) => r.bodyColor)).size === RIVALS.length,
  'rivals need distinct colours to be tellable apart at speed');

console.log(`✅ racer track check passed
   circuit    ~${L.toFixed(0)}u (control-polygon lower bound; the curve bows a little longer)
   lap        ~${lapSec.toFixed(1)}s at top speed
   race       ~${raceSec.toFixed(0)}s over ${LAPS} laps · ${problems} boost gates
   rubber     ±${(RUBBER_STRENGTH * 100).toFixed(0)}% over ${RUBBER_RANGE}u`);
