// Cakey Crane — the slab geometry.
//
// One tin of cake swings past on the crane; you tap; whatever hangs over the
// edge is sliced off and falls. That single calculation decides the entire
// game, so it lives here as pure arithmetic with no three, no cannon and no
// clock, and it is unit-tested (slab.test.ts).
//
// Coordinates: a slab is a centre (x, z) plus a size (w along x, d along z).
// The crane alternates axes each layer — sweep left/right, then front/back —
// which is what keeps a tall tower from becoming a single-axis rhythm test.
//
// THE FOOTPRINT RULE. A drop returns two slabs, and the difference between them
// is what makes four tin sizes playable:
//
//   landed     the cake layer you actually see, drawn at the tin's own size
//   footprint  what the NEXT tin lands on
//
// They are the same thing whenever a tin overhangs and gets trimmed. But a
// small tin that lands wholly INSIDE the cake leaves the layer below's rim
// exposed all the way round, so the footprint does not shrink — you have placed
// a petit four on a big cake, not carved the big cake down to a petit four.
// Without that rule a single small tin would permanently narrow the tower and
// the four sizes would just be four ways to lose.

export type Axis = 'x' | 'z';

export interface Slab {
  x: number;
  z: number;
  /** Size along x. */
  w: number;
  /** Size along z. */
  d: number;
}

export type DropOutcome = 'perfect' | 'fit' | 'trim' | 'miss';

export interface DropResult {
  outcome: DropOutcome;
  /** The layer to draw. Undefined only on a miss. */
  landed?: Slab;
  /** What the next tin lands on. Undefined only on a miss. */
  footprint?: Slab;
  /** Slices that fall away — one per overhanging side, so a tin wider than the
   *  cake sheds cake off BOTH ends. */
  offcuts: Slab[];
  /** How far off centre the drop was, on the moving axis (signed). */
  offset: number;
}

/** Which way the crane sweeps for a given layer index (0-based). */
export function axisForLayer(layer: number): Axis {
  return layer % 2 === 0 ? 'x' : 'z';
}

const centreOn = (s: Slab, axis: Axis): number => (axis === 'x' ? s.x : s.z);
const sizeOn = (s: Slab, axis: Axis): number => (axis === 'x' ? s.w : s.d);

function withAxis(base: Slab, axis: Axis, centre: number, size: number): Slab {
  return axis === 'x'
    ? { x: centre, z: base.z, w: size, d: base.d }
    : { x: base.x, z: centre, w: base.w, d: size };
}

// ---- the four tins ----------------------------------------------------------

export type TinKey = 'party' | 'layer' | 'slice' | 'petit';

export interface TinSize {
  key: TinKey;
  /** Kid-facing name, shown on the HUD badge. */
  label: string;
  emoji: string;
  /** Footprint as a fraction of the full pan. */
  factor: number;
  /** Score multiplier. Small tins pay more because a perfect on one is a real
   *  piece of aiming — see perfectWindow below. */
  scoreMult: number;
}

/** Four tins, biggest first. The whole risk/reward of the game sits in this
 *  table: a party tin is forgiving (it can hang off the cake by half its extra
 *  width and still land clean) and pays little; a petit four can barely miss
 *  the cake but has to be threaded dead centre to pay out. */
export const TIN_SIZES: readonly TinSize[] = [
  { key: 'party', label: 'Party Tin',  emoji: '🎉', factor: 1,    scoreMult: 1 },
  { key: 'layer', label: 'Layer Tin',  emoji: '🎂', factor: 0.8,  scoreMult: 1.5 },
  { key: 'slice', label: 'Slice Tin',  emoji: '🍰', factor: 0.6,  scoreMult: 2.2 },
  { key: 'petit', label: 'Petit Four', emoji: '🧁', factor: 0.42, scoreMult: 3 },
];

export function tinByKey(key: TinKey): TinSize {
  return TIN_SIZES.find((t) => t.key === key) ?? TIN_SIZES[0];
}

/** Choose the next tin.
 *
 *  When the cake has already been whittled thin, only the big tins come out.
 *  That is deliberate generosity: a narrow cake plus a petit four is a drop
 *  nobody can land, and handing a struggling kid the hardest tin is exactly the
 *  kind of pile-on this game should never do. */
export function pickTin(rand: () => number, footprintSize: number, maxSize: number): TinSize {
  const ratio = maxSize > 0 ? footprintSize / maxSize : 1;
  const pool = ratio < 0.5 ? TIN_SIZES.filter((t) => t.factor >= 0.8) : TIN_SIZES;
  const i = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
  return pool[i];
}

export interface DropTuning {
  /** Perfect window for a FULL-SIZE tin. Smaller tins tighten it — see
   *  perfectWindow. Generous on purpose: the difference between "nearly
   *  perfect" and "perfect" should be a reward a kid can actually reach, not a
   *  pixel-hunt. */
  perfectTolerance: number;
  /** Width handed BACK on a perfect drop. Classic stackers only ever shrink,
   *  which means one wobbly drop early dooms a run; letting a clean drop repair
   *  the cake turns a bad start into something recoverable. */
  regrow: number;
  /** Never regrow past the starting tin. */
  maxSize: number;
  /** A footprint thinner than this is a miss — the sliver would be invisible
   *  and unplayable. */
  minSize: number;
}

/** How close to centre counts as perfect, for a tin of this size. Scales with
 *  the tin so a petit four demands real precision for its 3× payout while a
 *  party tin stays kind. */
export function perfectWindow(tinSize: number, tuning: DropTuning): number {
  const factor = tuning.maxSize > 0 ? Math.min(1, tinSize / tuning.maxSize) : 1;
  return tuning.perfectTolerance * (0.55 + 0.45 * factor);
}

/** Resolve one drop against the cake below it. Pure. */
export function resolveDrop(below: Slab, moving: Slab, axis: Axis, tuning: DropTuning): DropResult {
  const belowC = centreOn(below, axis);
  const belowS = sizeOn(below, axis);
  const movC = centreOn(moving, axis);
  const movS = sizeOn(moving, axis);
  const offset = movC - belowC;
  const EPS = 0.01;

  const belowLeft = belowC - belowS / 2;
  const belowRight = belowC + belowS / 2;
  const movLeft = movC - movS / 2;
  const movRight = movC + movS / 2;

  if (Math.abs(offset) <= perfectWindow(movS, tuning)) {
    // Perfect: snap it to dead centre. The layer is drawn at the tin's size,
    // but growth is capped at `regrow` — a party tin nailed onto a thin cake
    // repairs it a little, it does not restore it in one drop.
    const drawn = Math.min(movS, belowS + tuning.regrow, tuning.maxSize);
    return {
      outcome: 'perfect',
      landed: withAxis(moving, axis, belowC, drawn),
      footprint: withAxis(below, axis, belowC, Math.min(tuning.maxSize, belowS + tuning.regrow)),
      offcuts: [],
      offset,
    };
  }

  // Wholly inside the cake: nothing to slice, and the rim below is still
  // exposed, so the cake keeps its width for the next tin.
  if (movLeft >= belowLeft - EPS && movRight <= belowRight + EPS) {
    return { outcome: 'fit', landed: { ...moving }, footprint: { ...below }, offcuts: [], offset };
  }

  const left = Math.max(belowLeft, movLeft);
  const right = Math.min(belowRight, movRight);
  const overlap = right - left;

  if (overlap < tuning.minSize) {
    return { outcome: 'miss', offcuts: [], offset };
  }

  const landed = withAxis(moving, axis, (left + right) / 2, overlap);
  const offcuts: Slab[] = [];
  if (movLeft < left - EPS) {
    offcuts.push(withAxis(moving, axis, (movLeft + left) / 2, left - movLeft));
  }
  if (movRight > right + EPS) {
    offcuts.push(withAxis(moving, axis, (right + movRight) / 2, movRight - right));
  }

  return { outcome: 'trim', landed, footprint: { ...landed }, offcuts, offset };
}

/** Crane position at time `t` (seconds) — a ping-pong sweep between ±sweep.
 *  Linear rather than sinusoidal: a sine slows to a crawl at the turnaround,
 *  which makes the edges of the sweep trivially easy and the middle the only
 *  hard part. Constant speed keeps every position equally winnable. */
export function sweepAt(t: number, sweep: number, speed: number, phase = 0): number {
  const period = (4 * sweep) / speed;                 // there and back
  const u = (((t + phase) % period) + period) % period;
  const travelled = u * speed;
  return travelled <= 2 * sweep ? -sweep + travelled : 3 * sweep - travelled;
}

/** Crane speed for a layer — faster as the tower grows, capped so the top of a
 *  long run never becomes a reflex test a child cannot pass. */
export function speedForLayer(layer: number, base: number, growth: number, max: number): number {
  return Math.min(max, base + layer * growth);
}

/** Points for a drop, before rounding.
 *
 *  A perfect is worth far more than a clean fit, a fit more than a trim (you
 *  damaged the cake), and a miss nothing. The tin multiplier rides on the two
 *  outcomes that took aim; a trim pays flat, so you cannot farm points by
 *  slamming party tins carelessly. */
export function scoreForDrop(
  outcome: DropOutcome,
  combo: number,
  height: number,
  tinMult = 1,
): number {
  if (outcome === 'miss') return 0;
  if (outcome === 'perfect') return Math.round((50 + Math.min(combo, 10) * 25 + height * 2) * tinMult);
  if (outcome === 'fit') return Math.round((14 + height) * tinMult);
  return 10 + height;
}

/** 3-star rating: how tall the cake got. */
export function starsForHeight(height: number, target: number): 0 | 1 | 2 | 3 {
  if (height >= target) return 3;
  if (height >= Math.ceil(target * 0.6)) return 2;
  if (height >= Math.ceil(target * 0.3)) return 1;
  return 0;
}
