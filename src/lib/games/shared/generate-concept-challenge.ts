// Non-arithmetic math questions, rendered as choice buttons.
//
// Four whole CCSS domains had catalog rows, on_track_tiers and parent-dashboard
// entries but no way to generate a single question, because the only math
// content the engine could make was "two numbers and an operator" answered on a
// keypad. Comparison, place value, skip counting, shapes, time and money are
// not that shape — but they ARE natural two-to-four-choice questions, and
// ChoiceChallenge already renders a button stack for the reading path.
//
// So this file reuses that renderer. No new challenge kind, no scene changes,
// no new UI: the host modal already branches on `kind` and every game already
// knows how to show buttons.
//
// What each type covers, and which catalog skill it credits:
//
//   compare     number-comparison   K.CC.C.6/7 · 1.NBT.B.3 · 2.NBT.A.4
//   place-value place-value         1.NBT.B.2 · 2.NBT.A.1
//   skip-count  skip-counting       2.NBT.A.2 (CA) · 2.OA.C.3
//   shapes      shapes-2d / -3d     K.G.A.2/A.3 · 1.G.A.1 · 2.G.A.1
//   time-money  time-and-money      1.MD.B.3 · 2.MD.C.7 (CA) · 2.MD.C.8
//
// What is still NOT covered and needs a genuinely visual challenge kind:
// fractions (3.NF), area and perimeter, measuring length, and reading data
// off a bar graph. A cake cut into thirds is a picture, not a button.
//
// Pure functions, no side effects.

import type { ChoiceChallenge, Figure } from './challenge';

export type ConceptType =
  | 'compare'
  | 'place-value'
  | 'skip-count'
  | 'shapes'
  | 'time-money'
  | 'fractions'
  | 'area';

export const CONCEPT_TYPES: readonly ConceptType[] = [
  'compare',
  'place-value',
  'skip-count',
  'shapes',
  'time-money',
  'fractions',
  'area',
];

export function isConceptType(value: string): value is ConceptType {
  return (CONCEPT_TYPES as readonly string[]).includes(value);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[randInt(0, items.length - 1)];
}

/** Fisher-Yates. The correct answer must not sit in a predictable slot — kids
 *  find that pattern faster than they find the maths. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** As above, but with shapes drawn over the buttons. */
function chooseWithFigures(
  prompt: string,
  answer: string,
  distractors: string[],
  figures: Figure[],
  subtext?: string,
): ChoiceChallenge {
  return { ...choose(prompt, answer, distractors, subtext), figures };
}

/** Build a challenge from one correct answer plus distractors, deduped and
 *  capped at the 4 choices ChoiceChallenge allows. Distractors are passed in
 *  deliberately wrong-but-plausible; random noise teaches nothing. */
function choose(
  prompt: string,
  answer: string,
  distractors: string[],
  subtext?: string,
): ChoiceChallenge {
  const seen = new Set([answer]);
  const options = [answer];
  for (const d of distractors) {
    if (options.length >= 4) break;
    if (seen.has(d)) continue;
    seen.add(d);
    options.push(d);
  }
  return {
    kind: 'choice',
    prompt,
    ...(subtext ? { subtext } : {}),
    answer,
    choices: shuffle(options),
  };
}

// ---------------------------------------------------------------------------
// compare — K.CC.C.6/7, 1.NBT.B.3, 2.NBT.A.4
// ---------------------------------------------------------------------------

function generateCompare(tier: number): ChoiceChallenge {
  const max = tier <= 2 ? 10 : tier <= 4 ? 99 : 999;
  let a = randInt(1, max);
  let b = randInt(1, max);
  // An equal pair once in a while — K.CC.C.6 asks for "greater than, less
  // than, OR equal to", and a kid who never meets = learns the wrong rule.
  if (Math.random() < 0.15) b = a;

  // Kindergarten compares quantities in words before it meets the symbols;
  // 1.NBT.B.3 is where >, = and < are named. Split on that line.
  if (tier <= 2) {
    if (a === b) {
      a = randInt(1, max);
      b = a === max ? a - 1 : a + randInt(1, Math.max(1, max - a));
    }
    const bigger = Math.max(a, b);
    return choose(
      `Which is more — ${a} or ${b}?`,
      String(bigger),
      [String(Math.min(a, b))],
    );
  }

  const answer = a > b ? '>' : a < b ? '<' : '=';
  return choose(
    `${a}  ?  ${b}`,
    answer,
    ['>', '<', '='],
    'Which sign goes in the middle?',
  );
}

// ---------------------------------------------------------------------------
// place-value — 1.NBT.B.2, 2.NBT.A.1
// ---------------------------------------------------------------------------

function generatePlaceValue(tier: number): ChoiceChallenge {
  // Hundreds arrive with 2.NBT.A.1; below that it is tens and ones only.
  if (tier >= 4 && Math.random() < 0.5) {
    const h = randInt(1, 9);
    const t = randInt(0, 9);
    const o = randInt(0, 9);
    const n = h * 100 + t * 10 + o;
    return choose(
      `How many hundreds are in ${n}?`,
      String(h),
      [String(t), String(o), String(n)],
    );
  }

  const t = randInt(1, 9);
  const o = randInt(0, 9);
  const n = t * 10 + o;

  if (Math.random() < 0.5) {
    return choose(
      `How many tens are in ${n}?`,
      String(t),
      [String(o), String(n), String(t * 10)],
    );
  }
  return choose(
    `${n} is ${t} tens and how many ones?`,
    String(o),
    [String(t), String(n), String(o + 1)],
  );
}

// ---------------------------------------------------------------------------
// skip-count — 2.NBT.A.2 (California adds the 2s), and 2.OA.C.3 odd/even,
// which the standard itself frames as "counting them by 2s".
// ---------------------------------------------------------------------------

function generateSkipCount(tier: number): ChoiceChallenge {
  if (Math.random() < 0.3) {
    const n = randInt(1, tier <= 3 ? 20 : 100);
    return choose(`Is ${n} odd or even?`, n % 2 === 0 ? 'Even' : 'Odd', ['Odd', 'Even']);
  }

  const step = tier <= 3 ? pick([2, 5, 10]) : pick([2, 5, 10, 100]);
  const start = step * randInt(1, 6);
  const run = [start, start + step, start + step * 2, start + step * 3];
  const answer = start + step * 4;

  return choose(
    `${run.join(', ')}, ?`,
    String(answer),
    [String(answer + step), String(answer - 1), String(answer + 1)],
    `Counting by ${step}s`,
  );
}

// ---------------------------------------------------------------------------
// shapes — K.G.A.2/A.3, 1.G.A.1, 2.G.A.1
// ---------------------------------------------------------------------------

const FLAT_SHAPES: { name: string; sides: number }[] = [
  { name: 'triangle', sides: 3 },
  { name: 'square', sides: 4 },
  { name: 'rectangle', sides: 4 },
  { name: 'pentagon', sides: 5 },
  { name: 'hexagon', sides: 6 },
];

const SOLID_SHAPES: { name: string; faces: number | null }[] = [
  { name: 'cube', faces: 6 },
  { name: 'cone', faces: null },
  { name: 'cylinder', faces: null },
  { name: 'sphere', faces: null },
];

function generateShapes(tier: number): ChoiceChallenge {
  // K.G.A.3 — telling flat from solid — is the first thing Kindergarten does
  // with shapes, so it stays available at every tier.
  const roll = Math.random();

  if (tier >= 4 && roll < 0.4) {
    const solid = pick(SOLID_SHAPES);
    return choose(
      `Is a ${solid.name} flat or solid?`,
      'Solid',
      ['Flat'],
      'Solid shapes are the ones you could hold.',
    );
  }

  if (roll < 0.5) {
    const shape = pick(FLAT_SHAPES);
    return choose(
      `How many sides does a ${shape.name} have?`,
      String(shape.sides),
      [String(shape.sides + 1), String(shape.sides - 1), String(shape.sides + 2)],
    );
  }

  const target = pick(FLAT_SHAPES);
  const others = FLAT_SHAPES.filter((s) => s.sides !== target.sides).map((s) => s.name);
  return choose(
    `Which shape has ${target.sides} sides?`,
    target.name,
    shuffle(others),
  );
}

// ---------------------------------------------------------------------------
// time-money — 1.MD.B.3, 2.MD.C.7 (California adds the time relationships),
// 2.MD.C.8
// ---------------------------------------------------------------------------

const TIME_FACTS: { q: string; a: string; wrong: string[] }[] = [
  { q: 'How many minutes are in an hour?', a: '60', wrong: ['30', '24', '100'] },
  { q: 'How many hours are in a day?', a: '24', wrong: ['12', '60', '7'] },
  { q: 'How many days are in a week?', a: '7', wrong: ['5', '12', '30'] },
  { q: 'How many months are in a year?', a: '12', wrong: ['10', '7', '52'] },
  { q: 'How many weeks are in a year?', a: '52', wrong: ['12', '30', '365'] },
];

const COINS: { name: string; plural: string; cents: number }[] = [
  { name: 'penny', plural: 'pennies', cents: 1 },
  { name: 'nickel', plural: 'nickels', cents: 5 },
  { name: 'dime', plural: 'dimes', cents: 10 },
  { name: 'quarter', plural: 'quarters', cents: 25 },
];

function generateTimeMoney(tier: number): ChoiceChallenge {
  const roll = Math.random();

  // 1.MD.B.3 — hours and half-hours, described the way a kid reads a clock
  // face rather than shown as one, since this renderer has no picture.
  if (roll < 0.35) {
    const hour = randInt(1, 12);
    const half = Math.random() < 0.5;
    const answer = half ? `${hour}:30` : `${hour}:00`;
    const next = hour === 12 ? 1 : hour + 1;
    return choose(
      half
        ? `The little hand is between ${hour} and ${next}. The big hand points at 6.`
        : `The little hand points at ${hour}. The big hand points at 12.`,
      answer,
      [`${next}:30`, `${hour === 1 ? 12 : hour - 1}:00`, `${next}:00`],
      'What time is it?',
    );
  }

  if (roll < 0.6) {
    const fact = pick(TIME_FACTS);
    return choose(fact.q, fact.a, fact.wrong);
  }

  // 2.MD.C.8 — the standard's own example is 2 dimes and 3 pennies.
  const first = pick(tier <= 3 ? COINS.slice(0, 3) : COINS);
  const second = pick(COINS.filter((c) => c.name !== first.name));
  const n1 = randInt(1, 3);
  const n2 = randInt(1, 3);
  const total = first.cents * n1 + second.cents * n2;

  const label = (n: number, c: (typeof COINS)[number]) =>
    `${n} ${n === 1 ? c.name : c.plural}`;

  return choose(
    `${label(n1, first)} and ${label(n2, second)}. How many cents?`,
    `${total}¢`,
    [`${total + 5}¢`, `${Math.max(1, total - 5)}¢`, `${n1 + n2}¢`],
  );
}

// ---------------------------------------------------------------------------
// fractions — 1.G.A.3, 2.G.A.3, 3.NF.A.1, 3.NF.A.2, 3.NF.A.3
//
// This is the domain the whole audit ended on, and it is the one that could
// not be asked in words. "How much of the cake is left" is a picture; the
// Figure spec in challenge.ts draws it.
//
// The progression is the standards' own. Grades 1 and 2 partition a shape and
// NAME the shares — halves, thirds, fourths (1.G.A.3, 2.G.A.3) — without ever
// writing a fraction. Grade 3 writes a/b and understands it as a parts of size
// 1/b (3.NF.A.1), then compares two wholes (3.NF.A.3.d). Same drawing
// throughout, which is exactly why 1.G.A.3 is described as the on-ramp.
// ---------------------------------------------------------------------------

/** What one share is called when a whole is cut into n. Kid-facing words, and
 *  the words the standards themselves use. */
const SHARE_NAMES: Record<number, string> = {
  2: 'halves',
  3: 'thirds',
  4: 'fourths',
  6: 'sixths',
  8: 'eighths',
};

function generateFractions(tier: number): ChoiceChallenge {
  const shape: Figure['shape'] = Math.random() < 0.5 ? 'circle' : 'bar';

  // --- grades 1-2: partition and name the shares, no fraction notation ---
  if (tier <= 3) {
    const total = pick([2, 3, 4]);
    if (Math.random() < 0.5) {
      return chooseWithFigures(
        'How many equal pieces?',
        String(total),
        [String(total + 1), String(total - 1), String(total + 2)],
        [{ shape, total, shaded: 0 }],
      );
    }
    return chooseWithFigures(
      'This shape is cut into equal pieces. What are they called?',
      SHARE_NAMES[total],
      Object.values(SHARE_NAMES),
      [{ shape, total, shaded: 0 }],
      'Halves, thirds or fourths?',
    );
  }

  // --- grade 3 and up: compare two wholes (3.NF.A.3.d) ---
  // Only ever the same whole drawn twice, because the standard is explicit
  // that a comparison is valid only when both fractions refer to it.
  if (tier >= 8 || (tier >= 6 && Math.random() < 0.4)) {
    const total = pick([2, 3, 4, 6, 8]);
    const a = randInt(1, total);
    let b = randInt(1, total);
    if (a === b) b = a === total ? a - 1 : a + 1;
    const answer = a > b ? 'A' : 'B';
    return chooseWithFigures(
      'Which one has more shaded?',
      answer,
      ['A', 'B'],
      [
        { shape, total, shaded: a, label: 'A' },
        { shape, total, shaded: b, label: 'B' },
      ],
    );
  }

  // --- grade 3: name the shaded amount as a/b (3.NF.A.1) ---
  const total = pick([2, 3, 4, 6, 8]);
  const shaded = randInt(1, total - 1);
  return chooseWithFigures(
    'How much is shaded?',
    `${shaded}/${total}`,
    [`${total}/${shaded}`, `${shaded}/${total + 1}`, `${shaded + 1}/${total}`],
    [{ shape, total, shaded }],
  );
}

// ---------------------------------------------------------------------------
// area — 2.G.A.2, 2.OA.C.4, 3.MD.C.5, 3.MD.C.7
//
// Rows and columns of unit squares are one drawing that carries three
// standards: partitioning a rectangle (2.G.A.2), an array as repeated addition
// (2.OA.C.4), and area as covering, which is where multiplication and geometry
// meet (3.MD.C.7).
// ---------------------------------------------------------------------------

function generateArea(tier: number): ChoiceChallenge {
  const max = tier <= 3 ? 4 : tier <= 6 ? 6 : 9;
  const rows = randInt(2, max);
  const cols = randInt(2, max);
  const total = rows * cols;
  const figure: Figure = { shape: 'grid', total: cols, rows, shaded: total };

  // Below grade 3 the question is counting the squares (2.G.A.2); at grade 3
  // it is the same picture read as multiplication (3.MD.C.7).
  if (tier <= 3 || Math.random() < 0.4) {
    return chooseWithFigures(
      'How many squares?',
      String(total),
      [String(rows + cols), String(total + cols), String(total - rows)],
      [figure],
      `${rows} rows of ${cols}`,
    );
  }

  return chooseWithFigures(
    'What is the area?',
    `${total} squares`,
    [`${rows + cols} squares`, `${total - cols} squares`, `${2 * (rows + cols)} squares`],
    [figure],
    'Area is how many squares it takes to cover it.',
  );
}

// ---------------------------------------------------------------------------

const GENERATORS: Record<ConceptType, (tier: number) => ChoiceChallenge> = {
  compare: generateCompare,
  'place-value': generatePlaceValue,
  'skip-count': generateSkipCount,
  shapes: generateShapes,
  'time-money': generateTimeMoney,
  fractions: generateFractions,
  area: generateArea,
};

/**
 * Generate one concept challenge of the requested type, scaled by tier.
 *
 * Tier moves the number ranges and unlocks the later clusters (hundreds at 4+,
 * solid shapes at 4+) but never removes a type: a fifth grader who picks
 * "Shapes" gets shapes, because the kid chose it.
 */
export function generateConceptChallenge(
  type: ConceptType,
  tier: number,
): ChoiceChallenge {
  const t = Math.max(1, Math.min(10, Math.round(tier)));
  return GENERATORS[type](t);
}
