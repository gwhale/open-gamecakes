// Cakey Pit Stop — the damage model, the shift budget, and the tuning.
//
// ZERO imports on purpose, so scripts/pitstop-check.mjs can load it straight
// into node and prove the invariants without a WebGL context. Same leaf
// discipline as cakeyroad/lanes.ts, and for the same reason: "every shift is
// diggable" is a property of the numbers, not of the renderer.
//
// ── WHY THIS FILE REPLACED jobs.ts ────────────────────────────────────────
// v1 was a fixed four-job sequence: jack, front tyre, rear tyre, syrup, in that
// order, every car, forever. The jobs were flavour — nothing the kid did between
// answers changed anything, so the game failed PRODUCT.md's own test ("strip the
// math and you'd still have a game"; strip it from v1 and you have a car
// animation).
//
// v2 gives the kid a verb and a decision:
//   * A car arrives with DAMAGE ON THE CAR — red parts shake, amber parts pulse.
//   * The kid TAPS a part to work it. No fixed order, no dependencies.
//   * Red is mandatory. Amber is optional, and skipping it sends the car away
//     in a state that brings it BACK.
//
// ── THE CLOCK CHARGES FOR WRENCHING, NEVER FOR THINKING ───────────────────
// The round clock pauses under the question (every other game does this —
// "solving math never eats the timer"). What costs you time is the crew
// physically doing the work you chose, which the kid watches happen. That is
// what turns "do 2 jobs or 3?" from a table of numbers into something visible.

export type JobKind = 'tyre-rear' | 'engine' | 'syrup' | 'tyre-front';

/** Left-to-right as they appear ON THE CAR, so the overlay chip strip and the
 *  3D model agree spatially. A kid should be able to look at either and point at
 *  the same thing. */
export const JOB_ORDER: readonly JobKind[] = ['tyre-rear', 'engine', 'syrup', 'tyre-front'];

export interface JobInfo {
  kind: JobKind;
  label: string;
  glyph: string;
  /** Base seconds of crew work, before difficulty scaling. */
  workMs: number;
}

export const JOBS: Record<JobKind, JobInfo> = {
  'tyre-rear': { kind: 'tyre-rear', label: 'Back tyre', glyph: '🛞', workMs: 2600 },
  engine: { kind: 'engine', label: 'Engine', glyph: '🔧', workMs: 3000 },
  syrup: { kind: 'syrup', label: 'Syrup', glyph: '🍯', workMs: 2200 },
  'tyre-front': { kind: 'tyre-front', label: 'Front tyre', glyph: '🛞', workMs: 2600 },
};

/** `ok` — nothing to do. `worn` — amber, optional, your call. `broken` — red,
 *  mandatory, the car cannot leave.
 *
 *  Two states would be simpler but there would be no decision. Four would need
 *  reading. Three is the fewest that supports "you must" vs "you may". */
export type JobState = 'ok' | 'worn' | 'broken';

/** A car's damage: every job has a state. */
export type Damage = Record<JobKind, JobState>;

export const NO_DAMAGE: Damage = {
  'tyre-rear': 'ok', engine: 'ok', syrup: 'ok', 'tyre-front': 'ok',
};

export interface PitStopTuning {
  /** Cars in a shift, at the 2-minute duration. Scaled by round length. */
  carBudget: number;
  /** Gap between arrivals (ms of un-paused clock). */
  arrivalMs: number;
  /** How many cars may wait. One slot is always reserved for a returning car. */
  queueCap: number;
  /** Multiplier on every job's work time. */
  workMul: number;
  /** Ceiling on mandatory jobs per car. This is what guarantees a car can
   *  always be punted cheaply. */
  maxBroken: number;
  /** Chance a damaged job is `broken` rather than `worn`. At 1 there is no
   *  optional work and the strategy layer is OFF. */
  brokenChance: number;
  /** Do skipped cars come back? Off for the youngest. */
  returns: boolean;
  /** Time added for a wrong answer — a fumbled wrench, watched. */
  penaltyMs: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Difficulty tunes the WORLD; `tier` tunes the MATHS. Never cross those.
 *
 *  Easy switches the strategy layer off entirely (`brokenChance: 1`, no
 *  returns) so a five-year-old plays "tap the broken bit, answer, watch it get
 *  fixed" and never meets a decision. That is NOT v1 — it still has the verb.
 *  The strategy fades in with difficulty rather than being the price of entry. */
export const TUNING: Record<Difficulty, PitStopTuning> = {
  easy: {
    carBudget: 9, arrivalMs: 11000, queueCap: 3, workMul: 0.8,
    maxBroken: 1, brokenChance: 1, returns: false, penaltyMs: 1000,
  },
  medium: {
    carBudget: 11, arrivalMs: 8000, queueCap: 3, workMul: 1.0,
    maxBroken: 2, brokenChance: 0.6, returns: false, penaltyMs: 2000,
  },
  hard: {
    carBudget: 13, arrivalMs: 7000, queueCap: 3, workMul: 1.25,
    maxBroken: 3, brokenChance: 0.45, returns: true, penaltyMs: 3000,
  },
};

export function resolvePitStopTuning(difficulty: Difficulty = 'medium'): PitStopTuning {
  return TUNING[difficulty];
}

// ---- overheads (ms) ----
export const ARRIVE_MS = 900;
export const EXIT_CLEAN_MS = 800;
export const EXIT_LIMP_MS = 1700;
/** Reduced-motion hold on the return, so the lesson is READ rather than raced
 *  past. Deliberately not a compressed animation — see the engine. */
export const RETURN_HOLD_MS = 1400;

/** Cars in a shift for a given round length. The 2-minute pick is the tuning
 *  baseline; 1 and 3 scale around it. */
export function carsForRound(tuning: PitStopTuning, roundMs: number): number {
  const scale = roundMs / 120000;
  return Math.max(3, Math.round(tuning.carBudget * scale));
}

export function countState(d: Damage, state: JobState): number {
  return JOB_ORDER.reduce((n, k) => n + (d[k] === state ? 1 : 0), 0);
}

/** A car may leave once nothing is red. Amber is allowed — that IS the choice. */
export function canLeave(d: Damage): boolean {
  return countState(d, 'broken') === 0;
}

/** Everything still amber becomes red. Nothing else changes, and no NEW damage
 *  is ever added.
 *
 *  That restraint is the anti-spiral invariant: `broken` is terminal, so a car
 *  banks within at most two visits. Punting is always a deferral, never a
 *  forfeit — nothing a kid does is ever wasted. Re-rolling a returned car would
 *  be more "realistic" and would make the model unbounded and unteachable. */
export function escalate(d: Damage): Damage {
  const out = { ...d };
  for (const k of JOB_ORDER) if (out[k] === 'worn') out[k] = 'broken';
  return out;
}

/** Crew time for one job, including any fumble. */
export function workMsFor(kind: JobKind, tuning: PitStopTuning, wrong = 0): number {
  return JOBS[kind].workMs * tuning.workMul + wrong * tuning.penaltyMs;
}

/** Clock cost of fixing everything on a car. */
export function fullFixMs(d: Damage, tuning: PitStopTuning): number {
  return JOB_ORDER
    .filter((k) => d[k] !== 'ok')
    .reduce((ms, k) => ms + workMsFor(k, tuning), 0) + ARRIVE_MS + EXIT_CLEAN_MS;
}

/** Clock cost of doing only what you must and punting the rest. */
export function puntMs(d: Damage, tuning: PitStopTuning): number {
  const red = JOB_ORDER.filter((k) => d[k] === 'broken');
  const exit = countState(d, 'worn') > 0 ? EXIT_LIMP_MS : EXIT_CLEAN_MS;
  return red.reduce((ms, k) => ms + workMsFor(k, tuning), 0) + ARRIVE_MS + exit;
}

export interface Rng { (): number }

/** Cars visibly differ, which matters more than it used to: livery is how a kid
 *  recognises a RETURNING car as the one they punted. Eight so no two in the
 *  lane at once ever share one. */
export const CAR_LIVERIES: readonly { body: number; trim: number }[] = [
  { body: 0xe11d48, trim: 0xffffff }, // CAKE.STRAWBERRY_DEEP / FROSTING
  { body: 0x4ade80, trim: 0xfef3c7 }, // CAKE.MINT_DEEP / VANILLA
  { body: 0xfbbf24, trim: 0x78350f }, // CAKE.AMBER / CHOCOLATE
  { body: 0xc084fc, trim: 0xfef3c7 }, // WORLD.GUMDROP grape / VANILLA
  { body: 0xf472b6, trim: 0xffffff }, // WORLD.SHOP_BODIES pink / FROSTING
  { body: 0x34d399, trim: 0x78350f }, // WORLD.SHOP_BODIES jade / CHOCOLATE
  { body: 0x60a5fa, trim: 0x1e3a8a }, // blueberry / deep navy trim
  { body: 0xfb923c, trim: 0xffffff }, // WORLD.SHOP_BODIES orange / FROSTING
];

/** How many jobs are damaged, by weight. Index 0 is unused — a car with nothing
 *  to do is a confusing car that teaches nothing, so zero is impossible. */
const DAMAGED_COUNT_W: Record<Difficulty, readonly number[]> = {
  // Easy is always exactly ONE job: maxBroken is 1 and there is no amber, so
  // anything more would be capped away anyway. Variety comes from WHICH job,
  // which G4 (no repeated pattern) enforces.
  easy: [0, 1, 0, 0, 0],
  medium: [0, 0.34, 0.38, 0.21, 0.07],
  hard: [0, 0.22, 0.36, 0.28, 0.14],
};

const patternKey = (d: Damage): string => JOB_ORDER.map((k) => d[k][0]).join('');

/** Guarantee a damage pattern differs from `avoid`, by rotating which parts carry
 *  which state. Rotation preserves the counts — so the mandatory-work cap and the
 *  "never blank" rule both survive it — while changing which car part is damaged,
 *  which is the thing the kid actually sees. */
function ensureDifferent(d: Damage, avoid: string): Damage {
  if (patternKey(d) !== avoid) return d;
  for (let shift = 1; shift < JOB_ORDER.length; shift++) {
    const out: Damage = { ...NO_DAMAGE };
    JOB_ORDER.forEach((k, i) => { out[JOB_ORDER[(i + shift) % JOB_ORDER.length]] = d[k]; });
    if (patternKey(out) !== avoid) return out;
  }
  // Every rotation matches, so all four jobs share one state (e.g. all amber).
  // Clearing one both breaks the tie and keeps at least one job to do.
  const out = { ...d };
  out[JOB_ORDER[0]] = 'ok';
  return out;
}

/** Stateful per-shift generator. Same shape as createLaneGenerator: injectable
 *  rng, constraints enforced by zeroing weights rather than rejection sampling,
 *  and an ON-RAMP that teaches the rules before it starts testing them. */
export function createDamageGenerator(
  difficulty: Difficulty,
  tuning: PitStopTuning,
  rng: Rng = Math.random,
) {
  let lastPattern = '';

  const pick = (weights: readonly number[]): number => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  };

  const roll = (carIndex: number): Damage => {
    const d: Damage = { ...NO_DAMAGE };

    // ---- On-ramp: the first three cars are scripted teachers ----
    // Cakey Road learned this the hard way ("starts way too hard even on easy").
    // Here the ramp teaches RULES rather than easing pace.
    if (carIndex === 0) {
      // 1. One red job. Teaches: tap it, answer, it's fixed, now you can GO.
      d[JOB_ORDER[pick([1, 0, 0, 1])]] = 'broken';
      return d;
    }
    if (carIndex === 1 && tuning.brokenChance < 1) {
      // 2. One amber job, GO available immediately. Teaches: amber is your call
      //    — and if they send it, they meet the return at the cheapest moment.
      d.syrup = 'worn';
      return d;
    }
    if (carIndex === 2 && tuning.brokenChance < 1) {
      // 3. One red + one amber: the real decision, in its smallest form.
      d.engine = 'broken';
      d['tyre-front'] = 'worn';
      return d;
    }

    let candidate: Damage | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const out: Damage = { ...NO_DAMAGE };
      const n = pick(DAMAGED_COUNT_W[difficulty]);
      const pool = [...JOB_ORDER];
      for (let i = 0; i < n && pool.length > 0; i++) {
        pool.splice(Math.floor(rng() * pool.length), 1).forEach((k) => {
          out[k] = rng() < tuning.brokenChance ? 'broken' : 'worn';
        });
      }
      // Cap mandatory work — this is what keeps a cheap punt always available.
      //
      // Surplus red demotes to amber where amber exists, but to `ok` on a
      // difficulty that has no optional work at all. Demoting to amber
      // unconditionally silently re-introduced optional jobs on easy, whose
      // whole promise is that there is no decision to make.
      const demoteTo: JobState = tuning.brokenChance >= 1 ? 'ok' : 'worn';
      while (countState(out, 'broken') > tuning.maxBroken) {
        const reds = JOB_ORDER.filter((k) => out[k] === 'broken');
        out[reds[Math.floor(rng() * reds.length)]] = demoteTo;
      }
      // Easy never shows two red tyres at once — two identical red wheels is the
      // one genuinely ambiguous read for the youngest.
      if (difficulty === 'easy' && out['tyre-front'] === 'broken' && out['tyre-rear'] === 'broken') {
        out['tyre-rear'] = 'ok';
      }
      if (countState(out, 'ok') === JOB_ORDER.length) continue; // G1: never blank
      candidate = out;
      if (patternKey(out) !== lastPattern) break; // G4 satisfied by rolling
    }

    // A repeat must never escape the loop. On easy there is exactly one damaged
    // job and so only four possible patterns, which makes an unlucky run of
    // identical rolls common enough over a shift to read as "the same car keeps
    // coming" — the exact complaint that produced Marble Maze's procedural
    // layouts. So if rolling could not find a different pattern, MAKE one.
    const chosen = ensureDifferent(candidate ?? { ...NO_DAMAGE, engine: 'broken' }, lastPattern);
    lastPattern = patternKey(chosen);
    return chosen;
  };

  return { roll };
}

/** Stars for the shift. Same shape and spirit as castle/tower's starsForRun. */
export function starsForRun(banked: number, budget: number): 0 | 1 | 2 | 3 {
  const par = Math.ceil(budget * 0.8);
  if (banked >= par) return 3;
  if (banked >= par - 2) return 2;
  if (banked > 0) return 1;
  return 0;
}

export function parCars(budget: number): number {
  return Math.ceil(budget * 0.8);
}

export interface PitStopSummaryStats {
  carsBanked: number;
  carBudget: number;
  carsReturned: number;
  jobsFixed: number;
  correctAnswers: number;
  wrongAnswers: number;
}
