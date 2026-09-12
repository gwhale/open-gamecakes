// Cakey Tower rule tests.
//
// Each one is a thing George or a seven-year-old could call unfair: a lucky
// gobstopper that makes MORE work, a mint knocked off the plate that keeps the
// round from ever ending, a heart lost for something that was not a gummy, a
// loss screen that says you ate everything. Pure functions with an injected
// rng, so every outcome is pinned rather than sampled.

import { describe, expect, it } from 'vitest';
import { makeRng } from '@/lib/games/opponents/rng';
import {
  applyEat,
  applyMysteryOutcome,
  applyTumble,
  candiesEaten,
  dropOutcome,
  fellOffPlate,
  flipMystery,
  isCleared,
  rollRole,
  starsForRun,
  type CandyTally,
  type RoleMix,
} from './rules';

const MEDIUM: RoleMix = { badFraction: 0.22, hardFraction: 0.14, mysteryChance: 0.06 };
/** An rng that returns exactly the values given, in order. */
const fixed = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('rollRole', () => {
  it('reads one draw against mystery → hard → bad → good, in that order', () => {
    // Course 3 (above the base): hardBias = 0.14 * 0.6 = 0.084.
    expect(rollRole(3, MEDIUM, fixed(0.01))).toBe('mystery');   // < 0.06
    expect(rollRole(3, MEDIUM, fixed(0.10))).toBe('hard');      // < 0.144
    expect(rollRole(3, MEDIUM, fixed(0.30))).toBe('bad');       // < 0.364
    expect(rollRole(3, MEDIUM, fixed(0.50))).toBe('good');
  });

  it('doubles the brittle chance in the two bottom courses and thins it above', () => {
    // hardBias base = 0.28 (courses 0–1) vs 0.084 (course 2+); 0.06 + 0.2 = 0.26.
    expect(rollRole(0, MEDIUM, fixed(0.26))).toBe('hard');
    expect(rollRole(1, MEDIUM, fixed(0.26))).toBe('hard');
    expect(rollRole(2, MEDIUM, fixed(0.26))).toBe('bad');
  });

  it('never rolls a mystery on easy, where mysteryChance is 0', () => {
    const easy: RoleMix = { badFraction: 0.15, hardFraction: 0.10, mysteryChance: 0 };
    const rng = makeRng(7);
    for (let i = 0; i < 500; i++) expect(rollRole(i % 7, easy, rng)).not.toBe('mystery');
  });

  it('is deterministic for a seed — the same tower twice', () => {
    const a = Array.from({ length: 40 }, (_, i) => rollRole(i % 9, MEDIUM, makeRng(42)));
    const b = Array.from({ length: 40 }, (_, i) => rollRole(i % 9, MEDIUM, makeRng(42)));
    expect(a).toEqual(b);
  });

  it('builds a tower that has mints in it (a round with nothing to eat is over at once)', () => {
    const rng = makeRng(3);
    const roles = Array.from({ length: 54 }, (_, i) => rollRole(Math.floor(i / 6), MEDIUM, rng));
    expect(roles.filter((r) => r === 'good').length).toBeGreaterThan(20);
  });
});

describe('flipMystery + applyMysteryOutcome', () => {
  it('is a fair coin: below one half is lucky, at or above is a gummy', () => {
    expect(flipMystery(fixed(0.0))).toBe('lucky');
    expect(flipMystery(fixed(0.499))).toBe('lucky');
    expect(flipMystery(fixed(0.5))).toBe('gummy');
    expect(flipMystery(fixed(0.99))).toBe('gummy');
  });

  it('a lucky gobstopper counts as a mint eaten on the spot', () => {
    const t: CandyTally = { goodTotal: 10, goodLeft: 6 };
    const after = applyMysteryOutcome(t, 'lucky');
    expect(candiesEaten(after)).toBe(candiesEaten(t) + 1);
    expect(after.goodLeft).toBe(6);
  });

  it('NEVER raises the number of mints left — either outcome', () => {
    const t: CandyTally = { goodTotal: 10, goodLeft: 6 };
    expect(applyMysteryOutcome(t, 'lucky').goodLeft).toBeLessThanOrEqual(t.goodLeft);
    expect(applyMysteryOutcome(t, 'gummy').goodLeft).toBeLessThanOrEqual(t.goodLeft);
  });

  it('a gummy outcome changes no counts — it is a hazard now, not a target', () => {
    const t: CandyTally = { goodTotal: 10, goodLeft: 6 };
    expect(applyMysteryOutcome(t, 'gummy')).toEqual(t);
  });

  it('does not mutate the tally it was given', () => {
    const t: CandyTally = { goodTotal: 10, goodLeft: 6 };
    applyMysteryOutcome(t, 'lucky');
    expect(t).toEqual({ goodTotal: 10, goodLeft: 6 });
  });
});

describe('fellOffPlate + dropOutcome', () => {
  it('calls a block fallen only once its centre is below the danger line', () => {
    const danger = 2.6;
    expect(fellOffPlate(2.59, danger)).toBe(true);
    expect(fellOffPlate(2.6, danger)).toBe(false);
    expect(fellOffPlate(3.4, danger)).toBe(false);
  });

  it('only a strawberry gummy costs a heart; everything else just tumbles away', () => {
    expect(dropOutcome('bad')).toBe('splat');
    expect(dropOutcome('good')).toBe('tumbled');
    expect(dropOutcome('hard')).toBe('tumbled');
    expect(dropOutcome('mystery')).toBe('tumbled');
  });
});

describe('applyTumble — the round always stays finishable', () => {
  it('a mint knocked off the plate is no longer needed to win', () => {
    const t: CandyTally = { goodTotal: 5, goodLeft: 1 };
    const after = applyTumble(t, 'good');
    expect(isCleared(after)).toBe(true);
  });

  it('a tumbled mint was not eaten, so the eaten count does not move', () => {
    const t: CandyTally = { goodTotal: 5, goodLeft: 3 };
    const after = applyTumble(t, 'good');
    expect(candiesEaten(after)).toBe(candiesEaten(t));
    expect(after.goodLeft).toBe(2);
  });

  it('brittle, a gummy, or an untapped gobstopper leaving the plate changes no counts', () => {
    const t: CandyTally = { goodTotal: 5, goodLeft: 3 };
    for (const role of ['hard', 'bad', 'mystery'] as const) expect(applyTumble(t, role)).toEqual(t);
  });

  it('never goes negative', () => {
    expect(applyTumble({ goodTotal: 0, goodLeft: 0 }, 'good')).toEqual({ goodTotal: 0, goodLeft: 0 });
  });
});

describe('applyEat + isCleared', () => {
  it('eating the last mint clears the tower', () => {
    let t: CandyTally = { goodTotal: 3, goodLeft: 3 };
    t = applyEat(t); expect(isCleared(t)).toBe(false);
    t = applyEat(t); expect(isCleared(t)).toBe(false);
    t = applyEat(t); expect(isCleared(t)).toBe(true);
    expect(candiesEaten(t)).toBe(3);
  });
});

describe('candiesEaten — the loss screen tells the truth', () => {
  it('reports what was eaten, not what existed', () => {
    // The old loss screen printed goodTotal (12) as "candies eaten".
    expect(candiesEaten({ goodTotal: 12, goodLeft: 9 })).toBe(3);
    expect(candiesEaten({ goodTotal: 12, goodLeft: 12 })).toBe(0);
  });

  it('a full lucky-then-lose round adds up', () => {
    let t: CandyTally = { goodTotal: 4, goodLeft: 4 };
    t = applyEat(t);                            // ate one          → 1 eaten
    t = applyMysteryOutcome(t, 'lucky');        // lucky gobstopper → 2 eaten
    t = applyTumble(t, 'good');                 // one fell off     → still 2 eaten
    expect(candiesEaten(t)).toBe(2);
    expect(t.goodLeft).toBe(2);
  });
});

describe('starsForRun', () => {
  it('a loss is always 0 stars, whatever is left', () => {
    expect(starsForRun(false, 3, 3)).toBe(0);
  });

  it('flawless is 3, half or better is 2, scraped through is 1', () => {
    expect(starsForRun(true, 3, 3)).toBe(3);
    expect(starsForRun(true, 2, 3)).toBe(2);
    expect(starsForRun(true, 1, 3)).toBe(1);
    // easy: 5 lives → ceil(5/2) = 3 keeps 2 stars
    expect(starsForRun(true, 3, 5)).toBe(2);
    expect(starsForRun(true, 2, 5)).toBe(1);
    // hard: 2 lives → 1 left is still 2 stars (ceil(2/2) = 1)
    expect(starsForRun(true, 1, 2)).toBe(2);
  });
});
