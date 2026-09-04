// Procedural math challenge generator — calibrated by tier.
//
// Given a tier (1–10), returns a random arithmetic challenge at the
// appropriate difficulty. This is the first real "per-kid adaptive
// content" in the app: the server wrapper page reads the kid's current
// tier from kid_skills, passes it to the client component, and the
// client calls this function each time a new challenge is needed.
//
// Why procedural and not from the `content` table: simple arithmetic
// problems are trivially generated (add two random numbers in a range)
// and don't benefit from curation. Vocabulary, comprehension, and other
// skills WILL pull from the content table once it's populated — but
// for math, procedural is cheaper, never runs out of content, and
// avoids the "kid memorizes the same 20 questions" trap.
//
// ============================================================
// TIER SCALE (2026-09-03): the catalog's scale, not our own
// ============================================================
//
// This ladder used to be hand-rolled — add, then add bigger, then
// subtract, then subtract bigger, then multiply. It disagreed with the
// `skills.tier` column, which is the scale that actually carries CCSS
// codes (see supabase/migrations/0006_ccss_standards.sql). Same integer,
// two curricula: tier 9 meant "7 × 8" here and "order of operations" in
// the catalog, and grade-baseline.ts was silently converting between
// them. The catalog wins because it is the one with standards attached.
//
// Two consequences worth knowing:
//
//   * Addition and subtraction now INTERLEAVE instead of stacking.
//     K.OA.A.2, 1.OA.C.6 and 2.OA.B.2 all teach them as one skill
//     ("add and subtract within 10 / within 20"), so a kid at tier 2
//     sees both. The old ladder made a first grader climb two levels
//     to meet subtraction at all.
//   * Multiplication moved DOWN (tier 8-9 → tier 6-7) and multi-digit
//     work moved in above it. Grade 4-5 kids previously topped out at
//     9 × 9 no matter which level they picked.
//
// Pure function, no side effects, no imports (type-only is fine).

import type { NumericChallenge } from './challenge';

export type ChallengeOp = 'add' | 'subtract' | 'multiply' | 'divide';

export interface GeneratedChallenge {
  a: number;
  b: number;
  op: ChallengeOp;
  answer: number;
  /** Human-readable prompt string like "7 + 3" */
  prompt: string;
}

/** Math type — controls which operations the generator is allowed to use.
 *  'mixed' means the generator picks whatever the tier teaches. The others
 *  restrict to a single operation. The tier still sets the number range;
 *  mathType only constrains the operation. */
export type MathType = 'addition' | 'subtraction' | 'multiplication' | 'division' | 'mixed';

/** Return a random integer in [min, max] inclusive. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick one entry at random. */
function pick<T>(items: readonly T[]): T {
  return items[randInt(0, items.length - 1)];
}

/**
 * What each tier teaches, anchored to the skills catalog and its CCSS
 * codes. `ops` is what 'mixed' draws from; the number ranges below are
 * what a single-operation choice gets at that tier.
 *
 *   1  add within 5                      K.OA.A.5
 *   2  add & subtract within 10          K.OA.A.2 · 1.OA.C.6
 *   3  add & subtract within 20          1.OA.C.6 · 2.OA.B.2
 *   4  two-digit ± one-digit             1.NBT.C.4
 *   5  add & subtract within 100         2.NBT.B.5
 *   6  multiply within 25                2.OA.C.4 · 3.OA.A.1
 *   7  multiply & divide within 100      3.OA.C.7
 *   8  multi-digit ops, 2-digit × 1      4.NBT.B.4 · 4.NBT.B.5 · 4.NBT.B.6
 *   9  larger multi-digit ops            5.NBT.B.5 · 5.NBT.B.6
 *  10  mixed draw from tiers 7–9
 *
 * Tiers 9-10 stop at multi-digit arithmetic. Order of operations,
 * fractions and decimals sit at catalog tiers 8-10 too, but they need a
 * challenge kind this keypad does not have — see the standards ledger.
 */
const TIER_OPS: Record<number, readonly ChallengeOp[]> = {
  1: ['add'],
  2: ['add', 'subtract'],
  3: ['add', 'subtract'],
  4: ['add', 'subtract'],
  5: ['add', 'subtract'],
  6: ['multiply'],
  7: ['multiply', 'divide'],
  8: ['add', 'subtract', 'multiply', 'divide'],
  9: ['add', 'subtract', 'multiply', 'divide'],
  10: ['add', 'subtract', 'multiply', 'divide'],
};

const MATH_TYPE_TO_OP: Record<Exclude<MathType, 'mixed'>, ChallengeOp> = {
  addition: 'add',
  subtraction: 'subtract',
  multiplication: 'multiply',
  division: 'divide',
};

/**
 * Generate a single math challenge calibrated by tier AND constrained by
 * mathType.
 *
 * When mathType is 'mixed', the operation is drawn from what the tier
 * actually teaches (TIER_OPS). When a specific type is chosen, that
 * operation is generated at the tier-appropriate number range — a kid who
 * wants multiplication gets multiplication even at tier 2, just small.
 *
 * @param tier      1–10 difficulty level (clamped)
 * @param mathType  operation constraint, defaults to 'mixed'
 */
export function generateMathChallenge(
  tier: number,
  mathType: MathType = 'mixed',
): GeneratedChallenge {
  const t = Math.max(1, Math.min(10, tier));

  if (mathType !== 'mixed') {
    return generateForOp(t, MATH_TYPE_TO_OP[mathType]);
  }

  // Tier 10 is the everything-mix: draw a tier from the top band first,
  // then an operation from it, so the number ranges vary too.
  const drawTier = t === 10 ? randInt(7, 9) : t;
  return generateForOp(drawTier, pick(TIER_OPS[drawTier]));
}

/**
 * Generate a challenge for a SPECIFIC operation at the given tier's number
 * range. The tier controls how big the numbers are; the op controls what
 * is being asked.
 */
function generateForOp(tier: number, op: ChallengeOp): GeneratedChallenge {
  switch (op) {
    case 'add':
      return generateAdd(tier);
    case 'subtract':
      return generateSubtract(tier);
    case 'multiply':
      return generateMultiply(tier);
    case 'divide':
      return generateDivide(tier);
  }
}

/** Additive range by tier — the largest sum the tier is allowed to reach. */
function additiveMax(tier: number): number {
  if (tier <= 1) return 5;
  if (tier === 2) return 10;
  if (tier === 3) return 20;
  if (tier === 4) return 99;
  if (tier <= 7) return 100;
  if (tier === 8) return 1000;
  return 10000;
}

function generateAdd(tier: number): GeneratedChallenge {
  const max = additiveMax(tier);

  // Tier 4 is the 1.NBT.C.4 shape specifically: a two-digit number plus a
  // one-digit number or a multiple of ten, which is where composing a ten
  // is first taught. Left to a uniform draw it almost never comes up.
  if (tier === 4) {
    const a = randInt(10, 89);
    const b = Math.random() < 0.5 ? randInt(1, 9) : randInt(1, 8) * 10;
    return make(a, b, 'add');
  }

  const b = randInt(1, Math.max(1, Math.floor(max / 2)));
  const a = randInt(1, max - b);
  return make(a, b, 'add');
}

function generateSubtract(tier: number): GeneratedChallenge {
  const max = additiveMax(tier);

  if (tier === 4) {
    const a = randInt(11, 99);
    const b = Math.random() < 0.5 ? randInt(1, 9) : randInt(1, Math.floor(a / 10)) * 10;
    return make(a, b, 'subtract');
  }

  const a = randInt(2, max);
  const b = randInt(1, a);
  return make(a, b, 'subtract');
}

/** Largest factor the tier allows.
 *
 *  0 and 1 are included deliberately from tier 6 up: 3.OA.C.7 asks for
 *  "all products of two one-digit numbers", and ×0 / ×1 are exactly the
 *  facts that carry the zero and identity properties (3.OA.B.5). The old
 *  range started at 2 and quietly skipped both. */
function factorMax(tier: number): number {
  if (tier <= 3) return 5;
  if (tier <= 6) return 5;
  if (tier === 7) return 10;
  return 12;
}

function generateMultiply(tier: number): GeneratedChallenge {
  const maxFactor = factorMax(tier);

  // Tier 8+ is 4.NBT.B.5 — a multi-digit number by a one-digit number.
  if (tier >= 8) {
    const a = tier >= 9 ? randInt(100, 999) : randInt(11, 99);
    const b = randInt(2, 9);
    return make(a, b, 'multiply');
  }

  return make(randInt(0, maxFactor), randInt(0, maxFactor), 'multiply');
}

/** Division is always generated backwards from a product, so every quotient
 *  is a whole number. 3.OA.C.7 and 4.NBT.B.6 both live in exact division at
 *  this age; remainders arrive with 4.OA and need their own answer UI. */
function generateDivide(tier: number): GeneratedChallenge {
  if (tier >= 8) {
    const divisor = randInt(2, 9);
    const quotient = tier >= 9 ? randInt(10, 200) : randInt(2, 50);
    return make(divisor * quotient, divisor, 'divide');
  }

  const maxFactor = factorMax(tier);
  // Divisor is never 0. Quotient may be 0 (0 ÷ 5 = 0), which is a fact
  // worth meeting.
  const divisor = randInt(1, Math.max(1, maxFactor));
  const quotient = randInt(0, maxFactor);
  return make(divisor * quotient, divisor, 'divide');
}

/**
 * "Make ten" fill-in-the-blank — `a + ❓ = 10`, answered on the full
 * 0-9 keypad like every other numeric challenge. The prompt is already
 * a complete equation, so it sets `verbatim` to stop the host from
 * appending its usual " = ?" suffix.
 *
 * (v1 rendered this as four tap-choice buttons; George asked for the
 * real keypad — typing the missing number is the actual practice.)
 */
export function generateMakeTenChallenge(): NumericChallenge {
  const a = randInt(1, 9);
  return {
    kind: 'numeric',
    prompt: `${a} + ❓ = 10`,
    answer: 10 - a,
    verbatim: true,
  };
}

function make(a: number, b: number, op: ChallengeOp): GeneratedChallenge {
  let answer: number;
  let symbol: string;
  switch (op) {
    case 'add':
      answer = a + b;
      symbol = '+';
      break;
    case 'subtract':
      answer = a - b;
      symbol = '−';
      break;
    case 'multiply':
      answer = a * b;
      symbol = '×';
      break;
    case 'divide':
      answer = a / b;
      symbol = '÷';
      break;
  }
  return { a, b, op, answer, prompt: `${a} ${symbol} ${b}` };
}
