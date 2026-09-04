// Slab-geometry tests for Cakey Crane.
//
// Every one of these is a thing a kid would notice within a minute of play: a
// slice that grows out of nowhere, an offcut falling off the wrong side, a
// "perfect" that eats width anyway, a petit four that permanently ruins the
// cake, or a sweep that parks the crane at the edges. Pure functions, so they
// get pinned.

import { describe, expect, it } from 'vitest';
import {
  TIN_SIZES,
  axisForLayer,
  perfectWindow,
  pickTin,
  resolveDrop,
  scoreForDrop,
  speedForLayer,
  starsForHeight,
  sweepAt,
  tinByKey,
  type DropTuning,
  type Slab,
} from './slab';

const T: DropTuning = { perfectTolerance: 0.22, regrow: 0.12, maxSize: 3, minSize: 0.25 };
const below: Slab = { x: 0, z: 0, w: 2, d: 2 };
/** A tin of a given width, parked at `x`. */
const tin = (w: number, x = 0): Slab => ({ x, z: 0, w, d: 2 });

describe('resolveDrop — perfect', () => {
  it('calls a dead-centre drop perfect and keeps the whole tin', () => {
    const r = resolveDrop(below, tin(2), 'x', T);
    expect(r.outcome).toBe('perfect');
    expect(r.offcuts).toHaveLength(0);
    expect(r.landed!.x).toBe(0);
  });

  it('hands a little width back, capped at the starting tin', () => {
    const narrow: Slab = { x: 0, z: 0, w: 1, d: 2 };
    const grown = resolveDrop(narrow, tin(1), 'x', T);
    expect(grown.footprint!.w).toBeCloseTo(1.12);

    const full = resolveDrop({ x: 0, z: 0, w: 3, d: 2 }, tin(3), 'x', T);
    expect(full.footprint!.w).toBe(3);          // never past maxSize
  });

  it('does not let a big tin restore a thin cake in one drop', () => {
    const thin: Slab = { x: 0, z: 0, w: 0.8, d: 2 };
    const r = resolveDrop(thin, tin(3), 'x', T);   // party tin, dead centre
    expect(r.outcome).toBe('perfect');
    expect(r.landed!.w).toBeCloseTo(0.92);          // 0.8 + one regrow, not 3
    expect(r.footprint!.w).toBeCloseTo(0.92);
  });

  it('tightens the perfect window for smaller tins', () => {
    expect(perfectWindow(3, T)).toBeCloseTo(0.22);
    expect(perfectWindow(1.26, T)).toBeLessThan(perfectWindow(3, T));
    // A petit four just off centre is a fit, where a party tin would be perfect.
    expect(resolveDrop(below, tin(3, 0.2), 'x', T).outcome).toBe('perfect');
    expect(resolveDrop(below, tin(0.8, 0.2), 'x', T).outcome).toBe('fit');
  });
});

describe('resolveDrop — the footprint rule', () => {
  it('lets a small tin land inside without shrinking the cake', () => {
    const r = resolveDrop(below, tin(0.9, 0.45), 'x', T);
    expect(r.outcome).toBe('fit');
    expect(r.landed!.w).toBeCloseTo(0.9);      // drawn at the tin's own size
    expect(r.footprint!.w).toBe(below.w);      // the rim below is still exposed
    expect(r.offcuts).toHaveLength(0);
  });

  it('still punishes a small tin that hangs off the edge', () => {
    // Cake spans [-1, 1]; this tin spans [0.65, 1.55], so only 0.35 of it is
    // over cake — a trim that narrows the footprint to that sliver.
    const r = resolveDrop(below, tin(0.9, 1.1), 'x', T);
    expect(r.outcome).toBe('trim');
    expect(r.footprint!.w).toBeCloseTo(0.35);
    expect(r.footprint!.w).toBeLessThan(below.w);
  });

  it('trims a wide tin down to the cake and sheds a slice off BOTH ends', () => {
    const r = resolveDrop(below, tin(3, 0.4), 'x', T);   // wider than the cake, off centre
    expect(r.outcome).toBe('trim');
    expect(r.landed!.w).toBeCloseTo(2);                  // capped by the cake below
    expect(r.offcuts).toHaveLength(2);
    const total = r.landed!.w + r.offcuts.reduce((s, o) => s + o.w, 0);
    expect(total).toBeCloseTo(3);                        // nothing invented, nothing lost
  });
});

describe('resolveDrop — trimming', () => {
  it('trims the overhang and conserves the tin width', () => {
    const moving = tin(2, 0.6);
    const r = resolveDrop(below, moving, 'x', T);
    expect(r.outcome).toBe('trim');
    expect(r.landed!.w).toBeCloseTo(1.4);
    expect(r.landed!.w + r.offcuts[0].w).toBeCloseTo(moving.w);
  });

  it('leaves the landed layer sitting inside the cake below it', () => {
    const r = resolveDrop(below, tin(2, 0.6), 'x', T);
    expect(r.landed!.x - r.landed!.w / 2).toBeGreaterThanOrEqual(below.x - below.w / 2 - 1e-9);
    expect(r.landed!.x + r.landed!.w / 2).toBeLessThanOrEqual(below.x + below.w / 2 + 1e-9);
  });

  it('drops the offcut on the side the tin actually overhung', () => {
    const rightSide = resolveDrop(below, tin(2, 0.6), 'x', T);
    expect(rightSide.offcuts[0].x).toBeGreaterThan(rightSide.landed!.x);
    const leftSide = resolveDrop(below, tin(2, -0.6), 'x', T);
    expect(leftSide.offcuts[0].x).toBeLessThan(leftSide.landed!.x);
  });

  it('misses when the tin clears the cake entirely', () => {
    const r = resolveDrop(below, tin(2, 2.4), 'x', T);
    expect(r.outcome).toBe('miss');
    expect(r.landed).toBeUndefined();
    expect(r.footprint).toBeUndefined();
  });

  it('misses when only an unplayable sliver would survive', () => {
    expect(resolveDrop(below, tin(2, 1.92), 'x', T).outcome).toBe('miss');
  });

  it('works the same on the z axis and leaves the other axis alone', () => {
    const r = resolveDrop(below, { x: 0, z: 0.6, w: 2, d: 2 }, 'z', T);
    expect(r.outcome).toBe('trim');
    expect(r.landed!.d).toBeCloseTo(1.4);
    expect(r.landed!.w).toBe(below.w);
    expect(r.landed!.x).toBe(below.x);
  });

  it('alternates the sweep axis every layer', () => {
    expect(axisForLayer(0)).toBe('x');
    expect(axisForLayer(1)).toBe('z');
    expect(axisForLayer(2)).toBe('x');
  });
});

describe('tins', () => {
  it('offers exactly four, biggest first, paying more as they shrink', () => {
    expect(TIN_SIZES).toHaveLength(4);
    for (let i = 1; i < TIN_SIZES.length; i++) {
      expect(TIN_SIZES[i].factor).toBeLessThan(TIN_SIZES[i - 1].factor);
      expect(TIN_SIZES[i].scoreMult).toBeGreaterThan(TIN_SIZES[i - 1].scoreMult);
    }
    expect(TIN_SIZES[0].factor).toBe(1);
  });

  it('resolves a tin by key', () => {
    expect(tinByKey('petit').label).toBe('Petit Four');
  });

  it('offers every tin while the cake is wide', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickTin(Math.random, 3, 3).key);
    expect(seen.size).toBe(4);
  });

  it('offers ONLY the big tins once the cake is thin', () => {
    for (let i = 0; i < 200; i++) {
      expect(pickTin(Math.random, 1.2, 3).factor).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('never returns undefined, even for a rand() that hits 1', () => {
    expect(pickTin(() => 1, 3, 3)).toBeDefined();
    expect(pickTin(() => 0.999999, 3, 3)).toBeDefined();
  });
});

describe('sweep', () => {
  it('starts at one end and reaches the other, without overshooting', () => {
    const sweep = 3, speed = 2;
    expect(sweepAt(0, sweep, speed)).toBeCloseTo(-3);
    expect(sweepAt(3, sweep, speed)).toBeCloseTo(3);
    for (let t = 0; t < 40; t += 0.05) {
      const p = sweepAt(t, sweep, speed);
      expect(p).toBeGreaterThanOrEqual(-sweep - 1e-9);
      expect(p).toBeLessThanOrEqual(sweep + 1e-9);
    }
  });

  it('comes back to the start after a full there-and-back', () => {
    expect(sweepAt(6, 3, 2)).toBeCloseTo(sweepAt(0, 3, 2));
  });

  it('moves at a constant speed, so no part of the sweep is a free win', () => {
    const step = 0.01, sweep = 3, speed = 2;
    const deltas: number[] = [];
    for (let t = 0.2; t < 2.6; t += step) {
      deltas.push(Math.abs(sweepAt(t + step, sweep, speed) - sweepAt(t, sweep, speed)));
    }
    expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThan(1e-6);
  });

  it('speeds up with height but stops at the cap', () => {
    expect(speedForLayer(0, 2, 0.1, 4)).toBe(2);
    expect(speedForLayer(5, 2, 0.1, 4)).toBeCloseTo(2.5);
    expect(speedForLayer(100, 2, 0.1, 4)).toBe(4);
  });
});

describe('scoring', () => {
  it('ranks the outcomes perfect > fit > trim > miss', () => {
    expect(scoreForDrop('perfect', 0, 3)).toBeGreaterThan(scoreForDrop('fit', 0, 3));
    expect(scoreForDrop('fit', 0, 3)).toBeGreaterThan(scoreForDrop('trim', 0, 3));
    expect(scoreForDrop('miss', 9, 9)).toBe(0);
  });

  it('pays the tin multiplier on aimed drops only', () => {
    expect(scoreForDrop('perfect', 0, 0, 3)).toBe(scoreForDrop('perfect', 0, 0) * 3);
    expect(scoreForDrop('fit', 0, 0, 3)).toBe(scoreForDrop('fit', 0, 0) * 3);
    // A trim damaged the cake — no multiplier to farm with a party tin.
    expect(scoreForDrop('trim', 0, 5, 3)).toBe(scoreForDrop('trim', 0, 5));
  });

  it('grows the payout with the combo, then stops rewarding infinity', () => {
    expect(scoreForDrop('perfect', 3, 0)).toBeGreaterThan(scoreForDrop('perfect', 0, 0));
    expect(scoreForDrop('perfect', 50, 0)).toBe(scoreForDrop('perfect', 10, 0));
  });

  it('rates the run by how tall the cake got', () => {
    expect(starsForHeight(0, 10)).toBe(0);
    expect(starsForHeight(3, 10)).toBe(1);
    expect(starsForHeight(6, 10)).toBe(2);
    expect(starsForHeight(12, 10)).toBe(3);
  });
});
