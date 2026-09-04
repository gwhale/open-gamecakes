// The tier ladder is a curriculum contract now, not just difficulty tuning:
// grade-baseline.ts, mathSkillFor() and the parent dashboard's "on track"
// fraction all read the same tier integers and assume they mean what the
// skills catalog says they mean. These tests pin the claims that would break
// silently — a widened range or a lost operation still generates perfectly
// valid-looking problems.

import { describe, expect, it } from 'vitest';
import {
  generateMathChallenge,
  type ChallengeOp,
  type MathType,
} from './generate-challenge';
import { mathSkillFor, type MathKind } from './challenge-mode';

/** Randomised generators need volume, not a single sample. 400 draws makes a
 *  1-in-10 branch effectively certain to appear. */
const DRAWS = 400;

function draw(tier: number, type: MathType = 'mixed') {
  return Array.from({ length: DRAWS }, () => generateMathChallenge(tier, type));
}

const APPLY: Record<ChallengeOp, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
};

describe('generateMathChallenge', () => {
  it('always states an answer that matches its own prompt', () => {
    for (let tier = 1; tier <= 10; tier++) {
      for (const ch of draw(tier)) {
        expect(ch.answer, `tier ${tier}: ${ch.prompt}`).toBe(APPLY[ch.op](ch.a, ch.b));
      }
    }
  });

  it('never asks for a negative difference', () => {
    for (let tier = 1; tier <= 10; tier++) {
      for (const ch of draw(tier, 'subtraction')) {
        expect(ch.answer, ch.prompt).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // 3.OA.C.7 and 4.NBT.B.6 are exact division at this age. Remainders need
  // an answer UI the keypad does not have, so a fractional quotient here is
  // a question no kid can answer.
  it('only generates whole-number quotients, and never divides by zero', () => {
    for (let tier = 1; tier <= 10; tier++) {
      for (const ch of draw(tier, 'division')) {
        expect(ch.b, ch.prompt).toBeGreaterThan(0);
        expect(Number.isInteger(ch.answer), ch.prompt).toBe(true);
      }
    }
  });

  describe('tier bands match the skills catalog', () => {
    const cases: { tier: number; max: number; standard: string }[] = [
      { tier: 1, max: 5, standard: 'K.OA.A.5 — fluently add within 5' },
      { tier: 2, max: 10, standard: 'K.OA.A.2 / 1.OA.C.6 — within 10' },
      { tier: 3, max: 20, standard: '1.OA.C.6 / 2.OA.B.2 — within 20' },
      { tier: 5, max: 100, standard: '2.NBT.B.5 — within 100' },
    ];

    for (const { tier, max, standard } of cases) {
      it(`tier ${tier} stays within ${max} (${standard})`, () => {
        for (const ch of draw(tier)) {
          expect(Math.max(ch.a, ch.b, ch.answer), ch.prompt).toBeLessThanOrEqual(max);
        }
      });
    }
  });

  // The old ladder taught addition at tiers 1-3 and made a first grader climb
  // to tier 4 to meet subtraction at all. The standards treat them as one
  // skill from Kindergarten on.
  it('interleaves addition and subtraction from tier 2', () => {
    const ops = new Set(draw(2).map((c) => c.op));
    expect(ops).toEqual(new Set(['add', 'subtract']));
  });

  // The previous generator drew factors from [2, 9], so ×0 and ×1 — the two
  // facts that carry the zero and identity properties (3.OA.B.5) — could not
  // occur. 3.OA.C.7 asks for ALL products of two one-digit numbers.
  it('includes the 0 and 1 times tables at tier 7', () => {
    const factors = new Set(draw(7, 'multiplication').flatMap((c) => [c.a, c.b]));
    expect(factors.has(0)).toBe(true);
    expect(factors.has(1)).toBe(true);
    expect(Math.max(...factors)).toBeLessThanOrEqual(10);
  });

  it('offers both multiplication and division at tier 7 (3.OA.C.7)', () => {
    expect(new Set(draw(7).map((c) => c.op))).toEqual(new Set(['multiply', 'divide']));
  });

  it('reaches multi-digit work above tier 7, which the old ceiling never did', () => {
    expect(Math.max(...draw(9).map((c) => Math.max(c.a, c.b)))).toBeGreaterThan(100);
  });

  it('clamps out-of-range tiers instead of throwing', () => {
    expect(generateMathChallenge(-3).answer).toBeTypeOf('number');
    expect(generateMathChallenge(99).answer).toBeTypeOf('number');
  });
});

describe('mathSkillFor', () => {
  // Every slug must exist in the skills table — /api/attempts looks them up
  // by (subject, name) and 400s on a miss, which is exactly how the old
  // 'add-subtract-within-100' / 'multiply-within-100' pair went unnoticed.
  const CATALOG = new Set([
    'add-within-10',
    'subtract-within-10',
    'add-within-20',
    'subtract-within-20',
    'add-double-digit',
    'subtract-double-digit',
    'add-subtract-within-100',
    'multiply-within-25',
    'multiply-within-100',
    'divide-within-100',
    'multi-digit-multiply',
    'multi-digit-operations',
    'long-division',
    // concept domains — choice buttons rather than the keypad
    'number-comparison',
    'place-value',
    'skip-counting',
    'shapes-2d',
    'shapes-3d',
    'time-and-money',
    'fraction-concepts',
    'equivalent-fractions',
    'area-and-perimeter',
  ]);

  const TYPES: MathKind[] = [
    'addition',
    'subtraction',
    'multiplication',
    'division',
    'mixed',
    'compare',
    'place-value',
    'skip-count',
    'shapes',
    'time-money',
    'fractions',
    'area',
  ];

  it('only ever returns a slug that exists in the catalog', () => {
    for (const type of TYPES) {
      for (let tier = 1; tier <= 10; tier++) {
        const { subject, slug } = mathSkillFor(type, tier);
        expect(subject).toBe('math');
        expect(CATALOG.has(slug), `${type} @ ${tier} -> ${slug}`).toBe(true);
      }
    }
  });

  it('credits the operation the kid actually chose', () => {
    expect(mathSkillFor('multiplication', 7).slug).toBe('multiply-within-100');
    expect(mathSkillFor('division', 7).slug).toBe('divide-within-100');
    expect(mathSkillFor('subtraction', 3).slug).toBe('subtract-within-20');
    expect(mathSkillFor('division', 9).slug).toBe('long-division');
  });

  // The regression this whole change exists to prevent: a third grader on
  // times tables logging mastery against a first-grade addition standard.
  it('never credits add-within-20 for multiplication', () => {
    for (let tier = 1; tier <= 10; tier++) {
      expect(mathSkillFor('multiplication', tier).slug).not.toBe('add-within-20');
    }
  });
});
