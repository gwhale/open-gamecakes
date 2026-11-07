// Cake Shift — the pure Tower of Hanoi model.
//
// Three cake stands, n layers of strictly different sizes, and one rule: a
// layer may never land on a smaller one. The whole cake starts on the LEFT
// stand and is solved when it is all on the RIGHT stand (the target is always
// the rightmost — "move the whole cake to the last stand" is the only
// instruction the kid ever reads, so it must never vary).
//
// Pure and immutable: every operation returns a new state, so the scene can
// animate against the old one while the HUD renders the new one, and so the
// tests can cover every rule without a renderer. No three.js in here.

/** Layer sizes are 1..n (1 = the little top layer, n = the big base). Each
 *  stack lists sizes BOTTOM → TOP, so `stack[stack.length - 1]` is the layer
 *  the kid can pick up. */
export interface HanoiState {
  readonly n: number;
  readonly stacks: readonly [readonly number[], readonly number[], readonly number[]];
  /** Legal moves made so far. Illegal attempts and set-downs never count. */
  readonly moves: number;
}

export type Stand = 0 | 1 | 2;

/** Where the cake starts and where it has to end up. */
export const SOURCE_STAND: Stand = 0;
export const TARGET_STAND: Stand = 2;

export const MIN_LAYERS = 3;
export const MAX_LAYERS = 8;

/** The full cake on the source stand, biggest at the bottom. */
export function newGame(n: number): HanoiState {
  const layers = Math.max(MIN_LAYERS, Math.min(MAX_LAYERS, Math.floor(n)));
  const base: number[] = [];
  for (let size = layers; size >= 1; size -= 1) base.push(size);
  return { n: layers, stacks: [base, [], []], moves: 0 };
}

/** Size of the layer on top of a stand, or null when the stand is bare. */
export function topOf(state: HanoiState, stand: Stand): number | null {
  const s = state.stacks[stand];
  return s.length > 0 ? s[s.length - 1] : null;
}

/** Which stand a given layer size is currently on. */
export function standOf(state: HanoiState, size: number): Stand {
  for (let i = 0; i < 3; i += 1) {
    if (state.stacks[i].includes(size)) return i as Stand;
  }
  throw new Error(`layer ${size} is not on any stand`);
}

/** The rule. Same stand, an empty source, or a bigger-onto-smaller are all no. */
export function canMove(state: HanoiState, from: Stand, to: Stand): boolean {
  if (from === to) return false;
  const moving = topOf(state, from);
  if (moving === null) return false;
  const under = topOf(state, to);
  return under === null || under > moving;
}

/** Apply a move, or return null when it is illegal. Never mutates. */
export function move(state: HanoiState, from: Stand, to: Stand): HanoiState | null {
  if (!canMove(state, from, to)) return null;
  const src = state.stacks[from];
  const moving = src[src.length - 1];
  const stacks = state.stacks.map((s) => [...s]) as [number[], number[], number[]];
  stacks[from] = src.slice(0, -1);
  stacks[to] = [...state.stacks[to], moving];
  return { n: state.n, stacks, moves: state.moves + 1 };
}

/** Every layer on the target stand. (Order is guaranteed by the rule.) */
export function isSolved(state: HanoiState): boolean {
  return state.stacks[TARGET_STAND].length === state.n;
}

/** The next move of the optimal solution FROM THIS STATE — not from the
 *  start. Used by the Hint ghost, so it has to be right mid-solve, after the
 *  kid has wandered.
 *
 *  The classic recursion, read off the current position: find the biggest
 *  layer not yet on its goal; to move it, everything smaller has to be parked
 *  on the third stand first, so recurse with that as the smaller tower's goal.
 *  The first leaf that is not already in place is the move. From the start
 *  position this reproduces the textbook 2^n − 1 sequence exactly
 *  (state.test.ts proves it for every n we ship). */
export function nextOptimalMove(state: HanoiState): { from: Stand; to: Stand } | null {
  const plan = (size: number, goal: Stand): { from: Stand; to: Stand } | null => {
    if (size === 0) return null;
    const at = standOf(state, size);
    if (at === goal) return plan(size - 1, goal);
    const other = (3 - at - goal) as Stand;
    return plan(size - 1, other) ?? { from: at, to: goal };
  };
  return plan(state.n, TARGET_STAND);
}

/** Compact, human-readable snapshot — "n=3 m=2 [3|2|1]" — for logs, tests and
 *  React keys. Not a save format; a round is never persisted mid-solve. */
export function serialize(state: HanoiState): string {
  return `n=${state.n} m=${state.moves} [${state.stacks.map((s) => s.join(',')).join('|')}]`;
}
