// Non-arithmetic math questions, rendered as choice buttons.
//
// Four whole CCSS domains had catalog rows, on_track_tiers and parent-dashboard
// entries but no way to generate a single question, because the only math
// content the engine could make was "two numbers and an operator" answered on a
// keypad. Comparison, place value, skip counting, shapes, time and money are
// not that shape — but they ARE natural two-to-four-choice questions, and
// ChoiceChallenge already renders a button stack for the reading path.
//
// So this file reuses that renderer. No scene changes and no new UI: the host
// modal already branches on `kind` and every game already knows how to show
// buttons.
//
// The one exception is the Depth-of-Knowledge 3 items (2026-09-04), which ask
// for an answer AND the reason for it. Those return a StepsChallenge — still
// not a new renderer, because ChallengeInput draws each part with the very
// keypad or button stack the part would get on its own.
//
// What each type covers, and which catalog skill it credits:
//
//   compare     number-comparison   K.CC.C.6/7 · 1.NBT.B.3 · 2.NBT.A.4
//   place-value place-value         1.NBT.B.2 · 2.NBT.A.1
//               place-value-thousands  2.NBT.A.1 · 2.NBT.A.3 · 3.NBT.A.2 (tier 5+)
//   skip-count  skip-counting       2.NBT.A.2 (CA) · 2.OA.C.3
//   rounding    rounding            3.NBT.A.1
//   shapes      shapes-2d / -3d     K.G.A.2/A.3 · 1.G.A.1 · 2.G.A.1
//   time-money  time-and-money      1.MD.B.3 · 2.MD.C.7 (CA) · 2.MD.C.8
//
// What is still NOT covered and needs a genuinely visual challenge kind:
// measuring length, and reading data off a bar graph. What is not covered at
// all is a free-written explanation — deliberately. See StepsChallenge for why
// a chosen reason beats a typed one at a game gate.
//
// Pure functions, no side effects.

import type { ChoiceChallenge, Figure, StepsChallenge } from './challenge';

/** What a concept generator can return. Most questions are a single button
 *  stack; the Depth-of-Knowledge 3 items are asked in parts (see
 *  StepsChallenge) because their whole shape is "answer it, then say how you
 *  know". */
export type ConceptChallenge = ChoiceChallenge | StepsChallenge;

export type ConceptType =
  | 'compare'
  | 'place-value'
  | 'skip-count'
  | 'rounding'
  | 'shapes'
  | 'time-money'
  | 'fractions'
  | 'area';

export const CONCEPT_TYPES: readonly ConceptType[] = [
  'compare',
  'place-value',
  'skip-count',
  'rounding',
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

/** Numerals over 999 are written with the comma, because reading the comma is
 *  part of the standard: a chapter test writes 3,486 and a kid who has only
 *  ever seen 3486 on a screen has to do a translation the class never asked
 *  for. Below 1,000 this is a no-op, so it is safe everywhere. */
function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** Ones first is how a kid indexes a number they are pointing at, but every
 *  question here reads left to right, so this list is indexed from the RIGHT
 *  and the callers flip. Keeping the flip in one direction stops the
 *  off-by-one that "which place is the digit in" invites. */
const PLACE_NAMES = ['ones', 'tens', 'hundreds', 'thousands'] as const;

const PLACE_WORD: Record<number, string> = { 10: 'ten', 100: 'hundred', 1000: 'thousand' };

/**
 * ⭐ THE TWO-PART DIAL ⭐
 *
 * How often a tier-6+ question is asked in parts instead of as one button
 * stack. It is deliberately small and it is not a difficulty knob like the
 * others: a steps challenge ENDS on a wrong part, so posing one is close to
 * asking two questions and keeping the worse result. At a game gate that reads
 * as a spike, not a stretch.
 *
 * Halved from 0.2 to 0.1 on 2026-09-05, before any playtest, on exactly that
 * reasoning. Tune by halving or doubling — do not fine-slice.
 */
const DOK3_SHARE = 0.1;

/** "a 8" is the kind of thing a kid reads aloud and stumbles on. Eight is the
 *  only digit that takes "an". */
function art(d: number): string {
  return d === 8 ? 'an' : 'a';
}

/** Digits of a number, most significant first, with no leading zero.
 *
 *  `unique` matters whenever the question names a digit and asks where it
 *  sits: "which place is the 4 in 3,484" has two right answers, and a kid who
 *  picks the other one is marked wrong for being observant. */
function digitsOf(count: number, unique = false): number[] {
  const out = [randInt(1, 9)];
  let guard = 0;
  while (out.length < count) {
    const d = randInt(0, 9);
    if (unique && out.includes(d) && guard++ < 40) continue;
    out.push(d);
  }
  return out;
}

function fromDigits(ds: readonly number[]): number {
  return ds.reduce((n, d) => n * 10 + d, 0);
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
// place-value — 1.NBT.B.2, 2.NBT.A.1, and from tier 5 the four-digit band:
// 2.NBT.A.1, 2.NBT.A.3 (expanded form), 3.NBT.A.2 (mentally add or subtract
// a power of ten).
//
// The four-digit band was added 2026-09-04 against a real grade-3 chapter test
// ("Numbers to 10,000"). Before it, the ceiling here was 999 — so the chapter a
// third grader was actually sitting could not be asked at all, and the catalog
// row built for it (place-value-thousands, 2.NBT.A.1 / 3.NBT.A.1) had no
// generator behind it.
//
// The four shapes below are the four the chapter test uses, and each one fails
// differently. Naming a place and counting a place are inverses — a kid can do
// one and not the other. Expanded form is where an interior zero separates
// reading places from reading digits left to right. Stepping by a power of ten
// is the one that looks like arithmetic and is not: 100 less than 2,075 is a
// place-value question wearing a subtraction costume.
// ---------------------------------------------------------------------------

function generatePlaceValue(tier: number): ConceptChallenge {
  // Grade 3's Level 1 lands on tier 5 (see grade-baseline.ts), which is why
  // the four-digit band opens there. It does not REPLACE the smaller bands —
  // the same rule the rest of this file follows: a tier unlocks a cluster, it
  // never takes one away — but its share climbs, because "how many tens are in
  // 88" is a fair warm-up for a third grader and a waste of a gate for a
  // fifth.
  if (tier >= 5 && Math.random() < (tier >= 7 ? 0.9 : 0.75)) {
    // Held to tier 6+ and to DOK3_SHARE of the draw — see the dial.
    if (tier >= 6 && Math.random() < DOK3_SHARE) {
      return Math.random() < 0.5 ? repeatedStep() : greatestFromDigitsWithReason();
    }
    const roll = Math.random();
    if (roll < 0.22) return placeOfDigit();
    if (roll < 0.44) return countAPlace();
    if (roll < 0.68) return expandedForm();
    if (roll < 0.88) return stepByPowerOfTen();
    return greatestFromDigits();
  }

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

/** "Look at the number 3,486. Which place is the digit 4 in?"
 *
 *  Distractors are the other three place names, so a kid who miscounts by one
 *  column lands on a real wrong answer rather than something obviously silly.
 *  Digits are unique — see digitsOf(). */
function placeOfDigit(): ChoiceChallenge {
  const ds = digitsOf(4, true);
  const i = randInt(0, 3);
  return choose(
    `Look at the number ${fmt(fromDigits(ds))}. Which place is the digit ${ds[i]} in?`,
    PLACE_NAMES[3 - i],
    [...PLACE_NAMES],
  );
}

/** The inverse: name the place, ask for the digit. Keeps the word "hundreds"
 *  in four-digit prompts, which is also what the tier-4 band promises. */
function countAPlace(): ChoiceChallenge {
  const ds = digitsOf(4, true);
  // Not the ones place — "how many ones are in 3,486" is a reading test, not a
  // place-value one.
  const i = randInt(0, 2);
  return choose(
    `How many ${PLACE_NAMES[3 - i]} are in ${fmt(fromDigits(ds))}?`,
    String(ds[i]),
    [String(ds[(i + 1) % 4]), String(ds[(i + 2) % 4]), String(ds[(i + 3) % 4])],
  );
}

/** "What is the expanded form of 5,209?"
 *
 *  The interior zero is the whole question. Every distractor is a mistake a
 *  real kid makes, and they are the three the chapter test itself offers:
 *
 *    5,000 + 20 + 9    the zero "closed up" and the hundreds slid down a place
 *      500 + 20 + 9    the same slide, applied from the front
 *    5,000 +  2 + 9    the digit written where its value belongs
 */
function expandedForm(): ChoiceChallenge {
  const ds = digitsOf(4);
  // Force an interior zero most of the time, and never both — a number with
  // two zeroes in the middle makes the demoted distractors collapse onto the
  // right answer and the question stops discriminating.
  if (Math.random() < 0.6) {
    const z = randInt(1, 2);
    ds[z] = 0;
    const other = z === 1 ? 2 : 1;
    if (ds[other] === 0) ds[other] = randInt(1, 9);
  }

  const values = ds.map((d, i) => d * Math.pow(10, 3 - i));
  const terms = (v: readonly number[]) => v.filter((x) => x > 0).map(fmt).join(' + ');

  return choose(
    `What is the expanded form of ${fmt(fromDigits(ds))}?`,
    terms(values),
    [
      terms(values.map((v, i) => (i > 0 && i < 3 ? v / 10 : v))),
      terms(values.map((v, i) => (i < 3 ? v / 10 : v))),
      terms(values.map((v, i) => (i > 0 && i < 3 ? ds[i] : v))),
      terms(values.map((v, i) => (i === 3 ? v * 10 : v))),
    ],
  );
}

/** "What number is 100 less than 2,075?" — 3.NBT.A.2.
 *
 *  Reads as subtraction and is not. The distractors are the two ways to get it
 *  wrong without ever mis-subtracting: step the right amount the wrong way, or
 *  step the wrong place in the right direction. */
function stepByPowerOfTen(): ChoiceChallenge {
  const step = pick([10, 100, 1000]);
  const up = Math.random() < 0.5;
  // Keep both the question and the answer four-digit, so the kid is reading
  // the number the chapter is about on both sides of the step.
  const n = up ? randInt(1000, 9999 - step) : randInt(1000 + step, 9999);
  const answer = up ? n + step : n - step;
  const dir = up ? 1 : -1;

  const wrongPlace = [n + dir * (step / 10), n + dir * step * 10].filter(
    (v) => v > 0 && v < 100000,
  );

  return choose(
    `What number is ${fmt(step)} ${up ? 'more' : 'less'} than ${fmt(n)}?`,
    fmt(answer),
    [fmt(n - dir * step), ...wrongPlace.map(fmt)],
  );
}

// ---------------------------------------------------------------------------
// The Depth-of-Knowledge 3 items — asked in parts. See StepsChallenge.
// ---------------------------------------------------------------------------

/** Q6's shape: a quantity that loses the same amount every day, asked two days
 *  out. "Show your work" is not decoration here — the second day is only
 *  reachable through the first, so requiring the intermediate answer IS the
 *  work, and a kid who guesses the end cannot skip to it.
 *
 *  3.NBT.A.2: subtracting 100 twice is a place-value move, not a borrow. */
function repeatedStep(): StepsChallenge {
  const perDay = pick([10, 100]);
  const start = randInt(12, 89) * 100 + randInt(0, 9) * 10 + randInt(0, 9);
  const day1 = start - perDay;
  const day2 = day1 - perDay;

  const day = (name: string, answer: number) => ({
    kind: 'numeric' as const,
    prompt: `How much is left after ${name}?`,
    verbatim: true,
    answer,
  });

  return {
    kind: 'steps',
    prompt: `A baker uses ${perDay} ounces of sugar every day. After baking on Monday there are ${fmt(start)} ounces left.`,
    subtext: 'Work out one day at a time.',
    steps: [day('Tuesday', day1), day('Wednesday', day2)],
  };
}

/** Q9's constructed response, in full this time: the answer AND the reason.
 *
 *  The wrong reasons are not padding. "A 9 is already in the biggest place" is
 *  the exact sentence the item puts in Sadie's mouth, and a kid who picks it
 *  has reproduced the misconception even though they may have typed the right
 *  number a moment ago — which is the only way a multiple-choice format can
 *  ask "explain the mistake" and mean it. */
function greatestFromDigitsWithReason(): StepsChallenge {
  const inner = greatestFromDigits();
  const scenario = inner.prompt.replace(' What is the greatest number you can make?', '');
  const answer = Number(inner.answer);
  const asRolled = inner.prompt.match(/roll an? (\d), an? (\d) and an? (\d)/)!.slice(1);
  const biggest = Math.max(...asRolled.map(Number));

  return {
    kind: 'steps',
    prompt: scenario,
    subtext: 'Make the greatest number you can, then say how you know.',
    steps: [
      {
        kind: 'numeric',
        prompt: 'What is the greatest number you can make?',
        verbatim: true,
        answer,
      },
      choose(
        'How do you know it is the greatest?',
        'The biggest digit goes in the place worth the most',
        [
          `${art(biggest) === 'an' ? 'An' : 'A'} ${biggest} is already in the place worth the most`,
          'The digits go in the order you rolled them',
          'The smallest digit goes first',
        ],
      ),
    ],
  };
}

/** Q8C, with the explanation the sheet asks for in writing. */
function greatestThatRoundsToWithReason(place: number): StepsChallenge {
  const target = randInt(1, Math.floor(9000 / place)) * place;
  const answer = target + place / 2 - 1;
  const tips = target + place / 2;
  const up = target + place;

  return {
    kind: 'steps',
    prompt: `A number rounds to ${fmt(target)} when rounded to the nearest ${PLACE_WORD[place]}.`,
    subtext: 'Find the greatest it could be, then say how you know.',
    steps: [
      {
        kind: 'numeric',
        prompt: 'What is the greatest it could be?',
        verbatim: true,
        answer,
      },
      choose(
        'How do you know?',
        `${fmt(tips)} would round up to ${fmt(up)}`,
        [
          `${fmt(tips)} would round down to ${fmt(target)}`,
          `${fmt(up)} is closer to ${fmt(target)}`,
          `${fmt(target)} is already the greatest`,
        ],
      ),
    ],
  };
}

/** "You roll a 9, a 0 and a 9. What is the greatest number you can make?"
 *
 *  The chapter's constructed-response item, reduced to the part a button can
 *  answer. Its whole point is the kid who reasons "a 9 is already in the place
 *  with the greatest value, so I'm done" and stops — which is why the digits
 *  are given in roll order and why that order is one of the choices. */
function greatestFromDigits(): ChoiceChallenge {
  let ds: number[];
  do {
    ds = [randInt(1, 9), randInt(0, 9), randInt(0, 9)];
    // A repeat is what makes the "9 is already first" trap available at all.
    if (Math.random() < 0.4) ds[2] = ds[0];
    // Two conditions, both about the question being answerable. All-identical
    // digits have one arrangement; a single non-zero digit (9, 0, 0) has one
    // three-digit arrangement, so there is no honest wrong answer to offer.
  } while (
    (ds[0] === ds[1] && ds[1] === ds[2]) ||
    ds.filter((d) => d > 0).length < 2
  );

  const desc = [...ds].sort((a, b) => b - a);
  const [x, y, z] = desc;
  const answer = fromDigits(desc);

  // x and y are both non-zero by the guard above, so both of these are real
  // three-digit numbers, and at least one of them differs from the answer:
  // if x === y then z must differ, because the digits are not all equal.
  const guaranteed = x !== y ? [y, x, z] : [x, z, y];

  // A candidate starting with 0 is a two-digit number wearing three digits; it
  // reads as a typo rather than as a wrong answer.
  const distractors = [fromDigits(ds), fromDigits([x, z, y]), fromDigits(guaranteed)]
    .filter((v) => v >= 100)
    .map(String);

  return choose(
    `You roll ${art(ds[0])} ${ds[0]}, ${art(ds[1])} ${ds[1]} and ${art(ds[2])} ${ds[2]}. What is the greatest number you can make?`,
    String(answer),
    distractors,
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

  if (tier >= 5) return generateFourDigitRun();

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

/** The grade-3 pattern item — 2.NBT.A.2 counted in the thousands, which is
 *  where 3.NBT.A.2's "mentally add or subtract 10 or 100" actually shows up on
 *  a chapter test.
 *
 *  Three things the band below tier 5 never does, and each is a separate skill:
 *
 *    * counts BACKWARD. 8,373 · 8,363 · 8,353 · … is the commonest form on a
 *      real sheet, and a forward-only generator never asks it.
 *    * carries across a landmark. A run that starts on a multiple of its own
 *      step (500, 600, 700) never makes the kid decide what comes after 7,980,
 *      which is the only hard moment in the whole item.
 *    * hides a term in the MIDDLE. A number line with values on both sides of
 *      the blank is read differently from "what comes next" — you can solve it
 *      backwards from the right-hand number, and some kids only can.
 */
function generateFourDigitRun(): ChoiceChallenge {
  const step = pick([10, 100, 1000]);
  const back = Math.random() < 0.5;
  const dir = back ? -1 : 1;

  let start: number;
  if (step === 100) {
    // Land the run near a thousand so it has to carry across it more often
    // than not: 7,680 · 7,780 · 7,880 · 7,980 · 8,080.
    const landmark = randInt(2, 8) * 1000;
    const offset = Math.random() < 0.6 ? randInt(1, 3) : randInt(5, 9);
    start = landmark - dir * offset * 100 + randInt(0, 9) * 10;
  } else if (step === 10) {
    // A live ones digit and a tens digit high enough that a backward run stays
    // inside its hundred. Nothing carries here — the trap is the kid who
    // changes the hundreds digit instead of the tens.
    start =
      randInt(back ? 2 : 1, back ? 9 : 8) * 1000 +
      randInt(0, 9) * 100 +
      randInt(5, 9) * 10 +
      randInt(0, 9);
  } else {
    start = (back ? randInt(5, 9) : randInt(1, 5)) * 1000 + randInt(0, 999);
  }

  const terms = [0, 1, 2, 3, 4].map((i) => start + dir * i * step);
  const hidden = Math.random() < 0.6 ? 4 : randInt(1, 3);
  const answer = terms[hidden];

  // Middle dots, not commas: "7,680, 7,780" makes the reader parse which comma
  // separates numbers and which is inside one, and the numerals have to keep
  // their commas (see fmt).
  const shown = terms.map((t, i) => (i === hidden ? '?' : fmt(t))).join(' · ');

  // Never a term that is already printed in the run — a choice the kid can see
  // on screen reads as a trick rather than as a wrong answer. These are the
  // mistakes the run itself invites: the step applied to the digit next door,
  // and the right step taken in the wrong place.
  //
  // The ceiling is 10,000, not merely "positive". A run counting by 1000s was
  // offering 19,696 as a choice, which a kid eliminates on sight without doing
  // any counting — and in a chapter called Numbers to 10,000 it reads as a
  // bug. The last two candidates are backfill for exactly that case, where
  // both of the ±(step × 10) options fall outside the range.
  const near = Math.max(1, step / 10);
  const distractors = [
    answer - dir * step + dir * near,
    answer + dir * step * 10,
    answer - dir * step * 10,
    answer + near,
    answer - near,
  ].filter((v) => v > 0 && v < 10000 && v !== answer);

  return choose(
    shown,
    fmt(answer),
    distractors.map(fmt),
    `Counting ${back ? 'back' : 'up'} by ${step}s`,
  );
}

// ---------------------------------------------------------------------------
// rounding — 3.NBT.A.1
//
// Added 2026-09-04. Rounding had no generator of any kind, which is a large
// hole for a grade-3 chapter: on the test this was built against, four of the
// nine items are rounding and the hardest one is rounding run backwards.
//
// It is its own concept type rather than a branch of place-value because the
// two fail apart. A kid can name every place in 1,508 and still not know which
// hundred it is nearer to, and the recommendation engine can only send them to
// practise the one they are actually missing if the two are separate rows.
// ---------------------------------------------------------------------------

/**
 * ⭐ THE ROUNDING DIAL ⭐
 *
 * Which place a tier rounds to. The same kind of judgment call as
 * GRADE_BASELINE_TIER, and tuned the same way: change the band, playtest,
 * do not fine-slice.
 *
 * Grade 3's Level 1 is tier 5 and its Level 3 is tier 7 (grade-baseline.ts),
 * so this table says a third grader meets tens and hundreds on their first
 * level — which is exactly 3.NBT.A.1's "nearest 10 or 100" — and thousands two
 * levels up. Tens stay available all the way down because rounding to the
 * nearest ten is reachable well before third grade for a kid who is ready.
 *
 * NOT PLAYTESTED.
 */
const ROUNDING_PLACES: Record<number, readonly number[]> = {
  1: [10],
  2: [10],
  3: [10],
  4: [10],
  5: [10, 100],
  6: [10, 100],
  7: [10, 100, 1000],
  8: [100, 1000],
  9: [100, 1000],
  10: [100, 1000],
};

function generateRounding(tier: number): ConceptChallenge {
  const place = pick(ROUNDING_PLACES[tier]);

  // The DOK-3 item: you are given the rounded answer and asked for the largest
  // number that produces it. A kid who has only memorised "5 or more, round up"
  // has nothing to run — the rule only goes one way. Held back to tier 7
  // because it is genuinely the hardest thing on the sheet.
  // The two-part form, which is how the sheet actually asks it ("Write your
  // answer and your work or explanation") — rare, per the dial.
  if (tier >= 7 && Math.random() < DOK3_SHARE) return greatestThatRoundsToWithReason(place);
  // The same question as one stack. Still uncommon, but common enough that a
  // kid meets reverse rounding regularly rather than once a session.
  if (tier >= 7 && Math.random() < 0.25) return greatestThatRoundsTo(place);

  // The chapter's own numbers: 382 and 245 to the nearest ten, 1,508 to the
  // nearest hundred. Nearest-ten work stays under 1,000 while it is the only
  // thing on offer, then grows with the tier — rounding 7,428 to the nearest
  // ten is a perfectly good grade-3 item and "round 54" is not one at tier 7.
  const n =
    place === 10 ? (tier <= 5 ? randInt(11, 999) : randInt(100, 9999)) : randInt(place, 9999);
  const answer = Math.round(n / place) * place;

  return choose(
    `Round ${fmt(n)} to the nearest ${PLACE_WORD[place]}.`,
    fmt(answer),
    [
      // Rounded the right amount the wrong way.
      answer + (answer > n ? -place : place),
      // Chopped instead of rounded — the commonest error there is. Collapses
      // onto the answer when the number rounded down anyway, which is why the
      // list runs longer than the three slots choose() will take.
      Math.floor(n / place) * place,
      // Rounded to the neighbouring place instead.
      Math.round(n / (place * 10)) * place * 10,
      answer + place,
      answer - place,
    ]
      .filter((v) => v > 0)
      .map(fmt),
    'Which one is it closer to?',
  );
}

/** "A number rounds to 3,800 to the nearest hundred. What is the greatest it
 *  could be?" — 3,849, and every distractor is a real way to miss it. */
function greatestThatRoundsTo(place: number): ChoiceChallenge {
  const target = randInt(1, Math.floor(9000 / place)) * place;
  return choose(
    `A number rounds to ${fmt(target)} when rounded to the nearest ${PLACE_WORD[place]}. What is the greatest it could be?`,
    fmt(target + place / 2 - 1),
    [
      // Exactly half — the one that tips over and rounds the other way.
      fmt(target + place / 2),
      // Ignored the rounding and took the top of the interval.
      fmt(target + place - 1),
      // Went down instead of up.
      fmt(target - 1),
    ],
    'The biggest number that still rounds down to it.',
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

const GENERATORS: Record<ConceptType, (tier: number) => ConceptChallenge> = {
  compare: generateCompare,
  'place-value': generatePlaceValue,
  'skip-count': generateSkipCount,
  rounding: generateRounding,
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
): ConceptChallenge {
  const t = Math.max(1, Math.min(10, Math.round(tier)));
  return GENERATORS[type](t);
}
