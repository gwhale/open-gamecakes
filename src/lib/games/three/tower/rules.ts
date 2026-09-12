// Cakey Tower — the rules, with no three.js or cannon-es in them.
//
// Everything a kid could call unfair lives here: which candy a block becomes,
// what a mystery gobstopper turns into, what happens when something leaves the
// plate, how many stars a run earns, and how many candies were actually eaten.
// The engine (engine.ts) owns the physics and the meshes and asks this module
// what the outcome MEANS.
//
// Pulled out after George said "the rules make no sense" and an audit found
// they were inconsistent, not just badly worded: a good candy knocked off the
// plate still counted toward the win (the round could become unwinnable), a
// lucky gobstopper RAISED the win target, and the loss screen reported the
// number of candies that ever existed as the number eaten. None of that was
// testable while it was interleaved with raycasts and body positions.
//
// No Math.random here. Every roll takes an `rng: () => number` in [0, 1) so a
// test can pin an outcome with makeRng() — the same rule the opponents follow
// (see lib/games/opponents/rng.ts).

import type { BlockRole, TowerTuning } from './types';

/** Uniform source in [0, 1). The engine passes Math.random; tests pass makeRng(). */
export type Rng = () => number;

/** The mix the tower is built from — the only tuning knobs rollRole reads. */
export type RoleMix = Pick<TowerTuning, 'badFraction' | 'hardFraction' | 'mysteryChance'>;

/** Which candy a freshly laid block becomes.
 *
 *  One draw, three thresholds: mystery first, then hard, then bad, else good.
 *  Hard (chocolate brittle) is biased toward the two bottom courses — doubled
 *  there, 0.6× above — because it is the heavy structural stuff and a tower
 *  whose base is all loose mints is over before the first bite lands. */
export function rollRole(course: number, mix: RoleMix, rng: Rng): BlockRole {
  const r = rng();
  if (r < mix.mysteryChance) return 'mystery';
  const hardBias = course < 2 ? mix.hardFraction * 2 : mix.hardFraction * 0.6;
  if (r < mix.mysteryChance + hardBias) return 'hard';
  if (r < mix.mysteryChance + hardBias + mix.badFraction) return 'bad';
  return 'good';
}

/** What a tapped mystery gobstopper turns out to be.
 *
 *  'lucky' — it was a mint all along: eaten on the spot, bite well spent.
 *  'gummy' — it hardens into a strawberry gummy where it stands, and from now
 *            on it must stay on the plate like any other gummy.
 *
 *  It used to flip to a LIVE mint instead of an eaten one, which raised the
 *  win target: a correct answer could leave the kid with more to do than
 *  before. A gamble that can only cost you is not a gamble a seven-year-old
 *  reads as fair. Now the coin-flip is between "progress" and "a new hazard",
 *  and the number of mints left never goes up. */
export type MysteryOutcome = 'lucky' | 'gummy';

export function flipMystery(rng: Rng): MysteryOutcome {
  return rng() < 0.5 ? 'lucky' : 'gummy';
}

/** The two counters the win condition and the score screen are built from. */
export interface CandyTally {
  /** Mints that count this round: laid at build time, plus lucky gobstoppers,
   *  minus any that tumbled off the plate uneaten. Never smaller than goodLeft. */
  goodTotal: number;
  /** Mints still standing. Zero = tower cleared. */
  goodLeft: number;
}

/** Apply a mystery outcome to the tally.
 *
 *  A lucky gobstopper is a mint that was eaten the instant it was revealed, so
 *  it joins goodTotal (it counts as eaten) and never touches goodLeft. A gummy
 *  changes nothing here — it is now a hazard, not a target. Either way the
 *  mints-left number can only stay the same, which is the promise the kid is
 *  owed. */
export function applyMysteryOutcome(t: CandyTally, outcome: MysteryOutcome): CandyTally {
  if (outcome === 'lucky') return { goodTotal: t.goodTotal + 1, goodLeft: t.goodLeft };
  return { ...t };
}

/** Has a block's centre dropped far enough to have left the plate?
 *
 *  Pure geometry: `dangerY` is a little below the plate top so a block that is
 *  merely tilting over the rim is not called fallen until it truly is. */
export function fellOffPlate(centreY: number, dangerY: number): boolean {
  return centreY < dangerY;
}

/** What it means when a block of this role leaves the plate.
 *
 *  'splat'   — a strawberry gummy hit the table: −1 life. The only way to lose.
 *  'tumbled' — anything else is simply gone. A mint that tumbles away is no
 *              longer needed to win (otherwise the round could become
 *              unwinnable with no timer to end it); brittle and an untapped
 *              gobstopper just vanish with a puff. No life is ever lost for
 *              something that was not a gummy. */
export type DropOutcome = 'splat' | 'tumbled';

export function dropOutcome(role: BlockRole): DropOutcome {
  return role === 'bad' ? 'splat' : 'tumbled';
}

/** Tally after a block of `role` tumbled off (not a splat). Only a mint moves
 *  the numbers: it leaves goodLeft, and it also leaves goodTotal so the eaten
 *  count stays honest — a tumbled mint was not eaten. */
export function applyTumble(t: CandyTally, role: BlockRole): CandyTally {
  if (role !== 'good') return { ...t };
  return { goodTotal: Math.max(0, t.goodTotal - 1), goodLeft: Math.max(0, t.goodLeft - 1) };
}

/** Tally after a mint was eaten. */
export function applyEat(t: CandyTally): CandyTally {
  return { goodTotal: t.goodTotal, goodLeft: Math.max(0, t.goodLeft - 1) };
}

/** Is the tower cleared? */
export function isCleared(t: CandyTally): boolean {
  return t.goodLeft <= 0;
}

/** How many candies the kid actually ate. The loss screen used to print
 *  goodTotal here, i.e. every mint that ever existed, on a screen whose whole
 *  point is that you did NOT get them all. */
export function candiesEaten(t: CandyTally): number {
  return Math.max(0, t.goodTotal - t.goodLeft);
}

/** 3-star rating: win with lives to spare = more stars. A loss is 0 stars. */
export function starsForRun(won: boolean, livesLeft: number, startLives: number): 0 | 1 | 2 | 3 {
  if (!won) return 0;
  if (livesLeft >= startLives) return 3;      // flawless — no gummy splatted
  if (livesLeft >= Math.ceil(startLives / 2)) return 2;
  return 1;
}
