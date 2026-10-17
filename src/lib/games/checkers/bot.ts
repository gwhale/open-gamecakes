// The Cakey checkers bots — opponents for Cakey Checkers.
//
// Same shape as chess/bot.ts and the same honesty: a hand-rolled negamax with
// alpha-beta, no engine download, no worker, running on the main thread inside
// the bot's artificial think delay while the board is idle.
//
// ⚠️ THE STRENGTH LABELS ARE LABELS, NOT MEASUREMENTS — and here that warning is
// STRONGER than it is for chess. Checkers is a SOLVED game. A depth-8 material
// engine with quiescence is genuinely better than most adults, far more so
// relative to human play than chess's depth-2 ever was. That is why the UI shows
// belts ("Cocoa Belt") rather than a number: there is no public checkers rating
// a parent would recognise, and any number we invented would over-claim.
//
// TWO DELIBERATE DEPARTURES FROM chess/bot.ts. Both are load-bearing; do not
// "restore" them by pattern-matching against the chess file.
//
//   1. NO TOP-K STAGING. chess/bot.ts searches only its best BOT_TOP_K root
//      moves at full depth because full-width depth-2 cost it 102ms. Checkers
//      branches ~7-10 wide — often 1-2 when a capture is forced — and there is
//      no per-move FEN-string cost to pay, so depth 6 is a few hundred nodes.
//      Staging would buy nothing and cost the correctness hazard the chess file
//      warns about (skipped moves keep a shallower score, so the numbers stop
//      being comparable, and grading compares).
//
//   2. QUIESCENCE IS MANDATORY. Checkers' horizon effect is brutal: stop the
//      search on an even ply right after a jump and the engine believes it is a
//      piece up when the recapture is one ply deeper. Every tier would play
//      drunk after a trade. The fix is cheap here precisely BECAUSE captures are
//      forced — "there is a jump on the board" is exactly the definition of an
//      unresolved position, so hasCapture() is the whole test.
//
// What makes the tiers differ is mostly NOT search depth (above 6 it stops
// mattering) but the knobs on CheckersBotConfig — see each one's comment.

import {
  applyMove,
  hasCapture,
  isKing,
  legalMoves,
  material,
  opponent,
  squareToRC,
  sideOf,
  DARK_SQUARES,
  EMPTY,
  NO_PROGRESS_DRAW_PLIES,
  type CheckersMove,
  type CheckersState,
  type Side,
} from './rules';
import { makeRng, pickOne } from '../opponents/rng';

export { makeRng };

/** A man is 100. Kings are worth kingValue times that — see the knob. */
const MAN = 100;

/** Big enough to dominate any material score, small enough that `WIN - ply`
 *  stays exact. */
const WIN = 100_000;

/** How far past the nominal depth a forced-capture sequence may extend before
 *  we evaluate anyway. A pathological chain must not hang the tab. */
const QUIESCE_CAP = 12;

/** Node ceiling for callers outside a config (grading, hints) that want an
 *  honest answer rather than a tier's handicap. */
const DEFAULT_NODE_CAP = 200_000;

/** Depth the kid's moves are GRADED at, deliberately independent of which
 *  opponent they picked.
 *
 *  ⚠️ Never grade with the handicapped search the kid played against. A tier-1
 *  bot thinks a blunder is fine, and the kid would bank mastery for it. */
export const GRADING_DEPTH = 6;

/** A kid turn this many centipawns worse than the best available counts against
 *  their move-quality score.
 *
 *  ⚠️ THE MOST LIKELY-WRONG NUMBER IN THIS FEATURE, exactly as in chess. A man
 *  is 100, so 120 reads as "you gave away more than a piece for nothing". Check
 *  the real spread of attempts.efficiency for game_slug='cakey-checkers' before
 *  tightening it. */
export const BLUNDER_CP = 120;

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** The positional half of a bot's personality. Split out from BotConfig because
 *  the GRADER needs weights without any of the handicap knobs. */
export interface EvalWeights {
  /** How much more a king is worth than a man. True value is ~1.5-1.8.
   *
   *  Set to 1.0 and the bot LITERALLY DOES NOT KNOW kings are worth more — it
   *  will trade a king for a man and look delighted. That is the beginner
   *  mistake kids recognise, and it is why the bottom tier gets 1.0. */
  kingValue: number;
  /** Centipawns per rank a man has advanced. Zero means the bot shuffles
   *  aimlessly and never pushes for a crown — which is most of what "playing
   *  like a five-year-old" looks like from the other side of the board. */
  usesAdvanceBonus: number;
  /** Centipawns for each of your own back-row men still sitting at home,
   *  denying the opponent a crowning square. The classic "oh, this one actually
   *  plays checkers" tell. */
  usesBackRowBonus: number;
  /** Centipawns for a piece on file 0 or 7, which cannot be jumped. Cheap, and
   *  very legible to a kid watching the bot hug the edge. */
  usesEdgeSafety: number;
}

/** Weights used to grade the kid, and for hints. Deliberately a competent,
 *  un-handicapped player. */
export const GRADING_WEIGHTS: EvalWeights = {
  kingValue: 1.6,
  usesAdvanceBonus: 4,
  usesBackRowBonus: 6,
  usesEdgeSafety: 3,
};

/** Static evaluation, from the perspective of the side to move. */
function evaluate(s: CheckersState, w: EvalWeights): number {
  let score = 0;
  for (const sq of DARK_SQUARES) {
    const piece = s.board[sq];
    if (piece === EMPTY) continue;
    const side = piece > 0 ? 'light' : 'dark';
    const { file, rank } = squareToRC(sq);

    let v = isKing(piece) ? MAN * w.kingValue : MAN;
    if (!isKing(piece)) {
      // Dark advances toward rank 7, light toward rank 0.
      const advanced = side === 'dark' ? rank : 7 - rank;
      v += advanced * w.usesAdvanceBonus;
      const homeRank = side === 'dark' ? 0 : 7;
      if (rank === homeRank) v += w.usesBackRowBonus;
    }
    if (file === 0 || file === 7) v += w.usesEdgeSafety;

    score += side === s.turn ? v : -v;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface SearchCtx {
  nodes: number;
  nodeCap: number;
  weights: EvalWeights;
  /** When false the searcher lives in a world where jump chains do not exist —
   *  see truncate(). */
  seesChains: boolean;
  rootDepth: number;
}

/** A beginner's mental model of a jump: you take one piece and stop.
 *
 *  This is the single knob that does the most work at the bottom of the ladder.
 *  Applied INSIDE the search only, so a weak bot fails to see the triple jump
 *  waiting for it — while the root move it actually plays is always the real,
 *  legal, whole-turn move. */
function truncate(m: CheckersMove): CheckersMove {
  if (m.captures.length <= 1) return m;
  // A chain never crowns mid-way (crowning ends the turn), so the truncated
  // landing is always an ordinary square.
  return { from: m.from, to: m.path[0], captures: [m.captures[0]], path: [], crowns: false };
}

/** Captures first, longest first, then crownings. Ordering is what makes
 *  alpha-beta prune; it is five lines and it earns them. */
function order(moves: CheckersMove[]): CheckersMove[] {
  return [...moves].sort((a, b) => {
    if (a.captures.length !== b.captures.length) return b.captures.length - a.captures.length;
    return Number(b.crowns) - Number(a.crowns);
  });
}

function negamax(s: CheckersState, depth: number, alpha: number, beta: number, ctx: SearchCtx, ply: number): number {
  ctx.nodes += 1;
  if (ctx.nodes > ctx.nodeCap) return evaluate(s, ctx.weights);
  if (s.sinceProgress >= NO_PROGRESS_DRAW_PLIES) return 0;

  const raw = legalMoves(s);
  // No move is a LOSS in checkers, not a stalemate. `WIN - ply` makes the
  // winning side prefer the quickest kill and the losing side the slowest death.
  if (raw.length === 0) return -(WIN - ply);

  if (depth <= 0) {
    // Quiescence: only forced captures extend, and only so far.
    if (!hasCapture(s) || ply > ctx.rootDepth + QUIESCE_CAP) return evaluate(s, ctx.weights);
  }

  const moves = order(ctx.seesChains ? raw : raw.map(truncate));
  let best = -Infinity;
  for (const m of moves) {
    const score = -negamax(applyMove(s, m), depth - 1, -beta, -alpha, ctx, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export interface ScoredMove {
  move: CheckersMove;
  score: number;
}

/** Score every legal whole-turn for the side to move, best first.
 *
 *  Full width — see departure (1) at the top. The ROOT move is always applied in
 *  full even when seesChains is false, because the bot has to play a legal move;
 *  the handicap lives in what it believes happens next. */
export function scoreRootMoves(
  s: CheckersState,
  depth: number,
  weights: EvalWeights = GRADING_WEIGHTS,
  seesChains = true,
  nodeCap = DEFAULT_NODE_CAP,
): ScoredMove[] {
  const ctx: SearchCtx = { nodes: 0, nodeCap, weights, seesChains, rootDepth: depth };
  const out = legalMoves(s).map((move) => ({
    move,
    score: -negamax(applyMove(s, move), depth - 1, -Infinity, Infinity, ctx, 1),
  }));
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Nodes searched by the last scoreRootMoves call — dev telemetry only. */
export function searchCost(s: CheckersState, depth: number, weights = GRADING_WEIGHTS): { nodes: number; ms: number } {
  const ctx: SearchCtx = { nodes: 0, nodeCap: DEFAULT_NODE_CAP, weights, seesChains: true, rootDepth: depth };
  const t0 = performance.now();
  for (const move of legalMoves(s)) negamax(applyMove(s, move), depth - 1, -Infinity, Infinity, ctx, 1);
  return { nodes: ctx.nodes, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

export interface CheckersBotConfig extends EvalWeights {
  /** Nominal search depth. Quiescence extends past it on forced captures. */
  depth: number;
  /** Chance per turn of not playing the best move it found. */
  blunderPct: number;
  /** 'random' is beginner chaos; 'second-best' is an inaccuracy, which is what a
   *  strong player's off moment looks like. */
  blunderKind: 'random' | 'second-best';
  /** See truncate(). False = does not believe in chains. */
  seesChains: boolean;
  /** ROOT-ONLY bonus for taking the LONGEST available chain, in centipawns per
   *  extra piece. American rules let you choose any jump; a greedy beginner
   *  always takes the biggest one, whether or not it is best.
   *
   *  ⚠️ Root only, exactly like chess's captureBias, and for the same reason:
   *  push it into the search and the bot starts assuming its OPPONENT is greedy
   *  too, which is a different and much worse player. */
  chainGreed: number;
  /** Turns within N centipawns of the best are treated as equal and sampled
   *  randomly, so a tier does not play the same game twice. */
  slack: number;
  /** Take a turn that ends the game immediately, immune to the blunder roll and
   *  to slack. Even the weakest Cakey should notice it has won. */
  takesWinInOne: boolean;
  /** Veto root moves that leave one of our KINGS capturable. A man is not "big";
   *  the only big piece in checkers is a king. */
  guardsKings: boolean;
  /** Veto root moves that hand the opponent a chain of 2+. Top tiers only — this
   *  is what keeps a strong Cakey's mistakes looking like inaccuracies rather
   *  than "the engine glitched". */
  avoidsSelfTraps: boolean;
  nodeCap: number;
}

/** Does this move leave one of our kings takeable? */
function hangsKing(s: CheckersState, m: CheckersMove): boolean {
  const me = s.turn;
  const next = applyMove(s, m);
  return legalMoves(next).some((reply) =>
    reply.captures.some((v) => isKing(next.board[v]) && sideOf(next.board[v]) === me),
  );
}

/** Does this move hand the opponent a multi-jump? */
function handsOverChain(s: CheckersState, m: CheckersMove): boolean {
  return legalMoves(applyMove(s, m)).some((reply) => reply.captures.length >= 2);
}

/** Does this move end the game right now? */
function winsNow(s: CheckersState, m: CheckersMove): boolean {
  return legalMoves(applyMove(s, m)).length === 0;
}

/** Choose the bot's turn, or null if the game is already over. */
export function chooseBotMove(s: CheckersState, cfg: CheckersBotConfig, rng: () => number): CheckersMove | null {
  const legal = legalMoves(s);
  if (legal.length === 0) return null;
  // Forced single jumps are common in checkers, unlike chess. Skip the theatre.
  if (legal.length === 1) return legal[0];

  // 1. A win in one, before anything random can talk us out of it.
  if (cfg.takesWinInOne) {
    const kill = legal.find((m) => winsNow(s, m));
    if (kill) return kill;
  }

  const ranked = scoreRootMoves(s, cfg.depth, cfg, cfg.seesChains, cfg.nodeCap);

  // 2. The deliberate mistake.
  if (rng() < cfg.blunderPct) {
    if (cfg.blunderKind === 'random') return pickOne(legal, rng);
    // 'second-best': drop only the top move, then apply the same guards the good
    // path uses so a strong Cakey's error stays an inaccuracy.
    const rest = ranked.slice(1);
    const safe = cfg.guardsKings ? rest.filter((r) => !hangsKing(s, r.move)) : rest;
    const pool = safe.length > 0 ? safe : rest;
    if (pool.length > 0) return pickOne(pool, rng).move;
    return ranked[0].move;
  }

  // 3. Ordinary play: add greed, veto giveaways, sample within slack.
  const greedy = ranked
    .map((r) => ({ ...r, score: r.score + Math.max(0, r.move.captures.length - 1) * cfg.chainGreed }))
    .sort((a, b) => b.score - a.score);

  let pool = greedy;
  if (cfg.guardsKings) {
    const safe = pool.filter((r) => !hangsKing(s, r.move));
    // If EVERY move hangs a king the position is lost anyway — play the best of
    // a bad lot rather than returning nothing.
    if (safe.length > 0) pool = safe;
  }
  if (cfg.avoidsSelfTraps) {
    const safe = pool.filter((r) => !handsOverChain(s, r.move));
    if (safe.length > 0) pool = safe;
  }

  const best = pool[0].score;
  return pickOne(
    pool.filter((r) => r.score >= best - cfg.slack),
    rng,
  ).move;
}

/** Material adjudication for a game that hit the turn cap, in men-equivalents. */
export function materialEdge(s: CheckersState, side: Side, kingValue = GRADING_WEIGHTS.kingValue): number {
  const m = material(s);
  const score = (x: { men: number; kings: number }) => x.men + x.kings * kingValue;
  return score(m[side]) - score(m[opponent(side)]);
}

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

/** How long the bot appears to "think".
 *
 *  Identical values to chess/bot.ts on purpose — a character should deliberate
 *  the same way in both games. The caller subtracts the MEASURED search time
 *  from the target before waiting, so the search's jank hides inside a pause
 *  that was going to happen anyway.
 *
 *  ⚠️ The floor is not decoration. Checkers searches fast enough to answer
 *  instantly, and an instant reply reads to a kid as "the computer already
 *  knew" — the opponent stops being a character and becomes a machine. */
export const THINK_BASE_MS = 550;
export const THINK_JITTER_MS = 450;
/** Extra beat when the turn is a capture — a little theatre. */
export const THINK_FLOURISH_MS = 300;
export const THINK_MIN_MS = 150;
