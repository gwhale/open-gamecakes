// The Cakey chess bots — opponents for Chess Challenge.
//
// Hand-rolled on top of the chess.js we already ship. No stockfish, no wasm, no
// Web Worker. That is a deliberate trade: stockfish would be a 1–2 MB download
// and its minimum UCI_Elo (~1320) sits ABOVE most of the range we want, whereas
// the whole point here is opponents a six-year-old can beat.
//
// ⚠️ THE ELO NUMBERS ARE DIFFICULTY LABELS, NOT MEASUREMENTS. A 2-ply material
// engine plays somewhere around 900–1100 however you label it. "Crumb, 500" means
// "the easiest Cakey", not "a 500-rated player". UI copy says "chess strength"
// rather than "rating" for exactly this reason. Do not put these numbers in a
// leaderboard or compare them to a real rating.
//
// What makes the tiers actually differ is mostly NOT search depth:
//   - depth 1 cannot see the recapture, so the weak bots take defended pawns
//     with the queen. That single fact does more for "plays like a beginner"
//     than any amount of eval tuning.
//   - blunderPct rolls an outright mistake some fraction of the time.
//   - captureBias makes the weak bots greedy — they grab material they should
//     not, which is exactly how beginners lose pieces.
//   - the strong bots get a hanging-piece veto so their mistakes are
//     inaccuracies rather than giving the queen away, which reads as "good
//     player having an off moment" instead of "engine glitched".
//
// MEASURED COST (desktop node, 27-move middlegame, chess.js 1.4):
//   depth 1  ~4-8 ms/move      depth 2  ~57 ms/move
// It started at ~690 ms and two things fixed it, both easy to undo by accident:
//   1. Leaf nodes must NOT call moves({verbose:true}). chess.js builds
//      `before`/`after` FEN strings per move — ~630us a call vs ~19us for
//      isCheckmate()/isStalemate(). That one change was 690 -> 102 ms.
//      (For scale: board() is 1.1us and moves() without verbose is 58us.)
//   2. The bot searches only its top BOT_TOP_K moves at full depth. 102 -> 57 ms.
// This is a main-thread search with no Worker, which is fine ONLY because it runs
// inside the bot's artificial think delay while the board is idle. Keep it there:
// see THINK_BASE_MS at the bottom, and grade the kid's move in the same window.

import { Chess } from 'chess.js';

/** Centipawn values. The king is 0 — mate is scored separately, and giving it a
 *  value would let the search "win" material by counting a king it can't take. */
const PIECE_VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** Big enough to dominate any material score, small enough to stay well clear of
 *  Infinity so `MATE - ply` arithmetic stays exact. */
const MATE = 100_000;

/** The four centre squares, for the one positional term the stronger bots get. */
const CENTRE = new Set(['d4', 'e4', 'd5', 'e5']);

/** Node ceiling for callers outside a BotConfig (move grading, hints), which want
 *  an honest answer rather than a tier's handicap. Normal positions use a tiny
 *  fraction of this — it only exists so a pathological position can't hang the
 *  tab. */
const DEFAULT_NODE_CAP = 200_000;

/** A kid move this many centipawns worse than the best available counts as a
 *  blunder for the session's move-quality score.
 *
 *  ⚠️ THE MOST LIKELY-WRONG NUMBER IN THIS FEATURE. Nobody has data on how often
 *  a six-year-old hangs a piece, and Chess Challenge shares the chess-puzzles
 *  skill — so if this is set too tight, kids tier DOWN in chess they already
 *  earned. 200 (a bishop-ish) is deliberately generous. Check the real spread of
 *  attempts.efficiency for game_slug='chess-challenge' before tightening it. */
export const BLUNDER_CP = 200;

export interface BotConfig {
  /** Plies searched past the bot's own move. 1 = cannot see the reply (beginner
   *  behaviour, on purpose); 2 = sees the recapture. Capped at 2 — depth 3 is
   *  20–30x the nodes, and the strong tiers get their strength from the knobs
   *  below instead. */
  depth: 1 | 2;
  /** Chance per move of deliberately not playing the best move. */
  blunderPct: number;
  /** 'random' picks any legal move (beginner chaos); 'second-best' drops only the
   *  top move and picks from what's left, filtered by the hanging guard — an
   *  inaccuracy, not a catastrophe. */
  blunderKind: 'random' | 'second-best';
  /** Centipawns added to capturing moves AT THE ROOT ONLY, i.e. greed. Not part
   *  of the eval, or the search would think the opponent is greedy too. */
  captureBias: number;
  /** Root moves within this many centipawns of the best are treated as equally
   *  acceptable and one is picked at random, so the bot isn't identical every
   *  game from the same position. */
  slack: number;
  /** Always take mate in 1 when it exists, immune to the blunder roll and slack.
   *  The search already finds it at depth 2; this stops randomness declining it. */
  takesMateIn1: boolean;
  /** Veto root moves that leave a rook-or-better hanging. Applied to the blunder
   *  and slack paths, which is where the search's judgement is being overridden. */
  guardsBigPieces: boolean;
  /** Small centre bonus for pawns and knights. Off at the bottom tier so the
   *  weakest bot's opening looks genuinely aimless. */
  usesCentreBonus: boolean;
  /** Hard ceiling on nodes; past it the search returns a static eval. A stall
   *  guard, not a tuning knob — normal positions never reach it. */
  nodeCap: number;
}

/** A move in the minimal shape both chess.js and chessground accept. */
export interface BotMove {
  from: string;
  to: string;
  promotion?: string;
}

export interface ScoredMove extends BotMove {
  san: string;
  /** Centipawns, from the moving side's point of view. Higher is better. */
  score: number;
}

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/** mulberry32 — a tiny seeded PRNG.
 *
 *  The bot never calls Math.random directly; the caller passes one of these in.
 *  Without a seed, "the bot hung its queen on move 12" is an unreproducible bug
 *  report, and every tier here is partly random by design. Seed per game, keep it
 *  in a ref, log it in dev only. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickOne = <T,>(xs: T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Material (+ optional centre nudge) from the SIDE TO MOVE's point of view —
 *  the negamax convention, so the same function serves both colours. */
function evaluate(g: Chess, usesCentreBonus: boolean): number {
  let score = 0;
  const turn = g.turn();
  for (const row of g.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const sign = sq.color === turn ? 1 : -1;
      score += sign * PIECE_VALUE[sq.type];
      if (usesCentreBonus && (sq.type === 'p' || sq.type === 'n') && CENTRE.has(sq.square)) {
        score += sign * 8;
      }
    }
  }
  return score;
}

interface SearchCtx {
  nodes: number;
  nodeCap: number;
  centre: boolean;
  rootDepth: number;
}

/** The subset of chess.js's verbose move we actually use. */
interface VerboseMove {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  san: string;
}

/** Most Valuable Victim − Least Valuable Attacker. Ordering captures this way is
 *  what makes alpha-beta actually prune; without it the search is several times
 *  slower for an identical result. */
function rank(m: VerboseMove): number {
  let r = 0;
  if (m.captured) r += PIECE_VALUE[m.captured] * 10 - PIECE_VALUE[m.piece];
  if (m.promotion) r += PIECE_VALUE[m.promotion] ?? 0;
  return r;
}
function orderMoves(moves: VerboseMove[]): void {
  moves.sort((a, b) => rank(b) - rank(a));
}

/** chess.js types `moves({verbose:true})` loosely across versions; this is the
 *  single place we pin it to the shape above. */
const verboseMoves = (g: Chess): VerboseMove[] => g.moves({ verbose: true }) as unknown as VerboseMove[];

/** Draws are scored 0, which is what stops a WINNING bot taking one: it has
 *  material lines scoring +500, so 0 never wins the max. A losing bot will
 *  correctly go hunting for them. */
function isDrawish(g: Chess): boolean {
  return g.isStalemate() || g.isInsufficientMaterial() || g.isThreefoldRepetition() || g.isDrawByFiftyMoves();
}

function negamax(g: Chess, depth: number, alpha: number, beta: number, ctx: SearchCtx): number {
  if (++ctx.nodes > ctx.nodeCap) return evaluate(g, ctx.centre);
  // Being mated is bad for the side to move, and being mated SOONER is worse, so
  // the mating side prefers the quickest kill.
  const ply = ctx.rootDepth - depth;

  // ---- Leaf. Terminal state still has to be detected here, or a mate or
  // stalemate on the horizon scores as ordinary material — which is precisely how
  // an engine walks into stalemate while winning.
  //
  // ⚠️ PERF: this path deliberately does NOT generate moves. chess.js's
  // moves({verbose:true}) builds `before`/`after` FEN strings for every move and
  // measures ~630us per call — at leaf count that ALONE was ~450ms of a 690ms
  // search. isCheckmate()/isStalemate() answer the same question for ~19us.
  // Do not "simplify" this back into a shared move-generation check.
  if (depth === 0) {
    if (g.isCheckmate()) return -(MATE - ply);
    if (isDrawish(g)) return 0;
    return evaluate(g, ctx.centre);
  }

  // ---- Interior node: one move generation, reused for terminal detection and
  // for ordering. Here the verbose cost is worth paying — good MVV-LVA ordering
  // is what makes alpha-beta prune, and it is amortised over the whole subtree.
  const moves = verboseMoves(g);
  if (moves.length === 0) return g.isCheck() ? -(MATE - ply) : 0;
  if (isDrawish(g)) return 0;

  orderMoves(moves);
  let best = -Infinity;
  for (const m of moves) {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const s = -negamax(g, depth - 1, -beta, -alpha, ctx);
    g.undo();
    if (s > best) best = s;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // fail-high: the opponent would never allow this
  }
  return best;
}

/** What the side to move is already worth in this position, before they move.
 *
 *  This is the BASELINE for grading a kid's move, and using it instead of "the
 *  best move available" is the difference between two very different questions:
 *
 *    best-relative  → "did you find the strongest move?"
 *    baseline-relative → "did your move make your own position worse?"
 *
 *  Only the second is what the session metric claims to measure, and only the
 *  second is fair. Graded against the best move, DECLINING A FREE PIECE scores
 *  identically to hanging one — so against Crumb, who hangs something on 35% of
 *  his moves, a kid playing sound developing chess was flagged on most turns.
 *  Measured in a real game: e4, Nf3, Bc4, O-O scored 2/4 "solid", i.e. 50%,
 *  under the 0.7 correctness threshold. Missing a chance is not a blunder. */
export function positionScore(fen: string, usesCentreBonus = true): number {
  return evaluate(new Chess(fen), usesCentreBonus);
}

/** True when `m` leaves one of the mover's own rook-or-better pieces attacked and
 *  undefended.
 *
 *  Deliberately a heuristic, not a static exchange evaluation: a queen defended
 *  by a pawn and attacked by a pawn "passes" here. That case is the search's job.
 *  This exists to catch the outright giveaways that the blunder roll and the
 *  slack sampler would otherwise wave through at the top tiers. */
function hangsBigPiece(g: Chess, m: BotMove): boolean {
  const mover = g.turn();
  const opponent = mover === 'w' ? 'b' : 'w';
  g.move({ from: m.from, to: m.to, promotion: m.promotion });
  let hangs = false;
  for (const row of g.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== mover) continue;
      if (PIECE_VALUE[sq.type] < PIECE_VALUE.r) continue;
      if (g.attackers(sq.square, opponent).length > 0 && g.attackers(sq.square, mover).length === 0) {
        hangs = true;
        break;
      }
    }
    if (hangs) break;
  }
  g.undo();
  return hangs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Score every legal move for the side to move, best first.
 *
 *  Shared by three callers on purpose — the bot picking its move, the session's
 *  blunder flagging, and the hint button. Because the game already runs this once
 *  per turn while the board sits idle waiting for the kid, the hint costs nothing
 *  extra and the kid's move can be graded by table lookup. */
export function scoreRootMoves(
  fen: string,
  depth: 1 | 2,
  usesCentreBonus = true,
  nodeCap = DEFAULT_NODE_CAP,
  /** Search only the most promising K moves at full depth, after a cheap depth-1
   *  ordering pass. Speeds a depth-2 search by roughly the fraction skipped.
   *
   *  ⚠️ Use for CHOOSING the bot's move, never for GRADING the kid's. Skipped
   *  moves keep their shallower score, so the numbers are not comparable across
   *  the cut — and grading compares the kid's move to the best one. A false
   *  blunder flag costs a kid mastery they earned. */
  topK?: number,
): ScoredMove[] {
  const g = new Chess(fen);
  const moves = verboseMoves(g);
  const ctx: SearchCtx = { nodes: 0, nodeCap, centre: usesCentreBonus, rootDepth: depth };

  const searchAt = (m: VerboseMove, d: number): number => {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const s = -negamax(g, d - 1, -Infinity, Infinity, ctx);
    g.undo();
    return s;
  };

  let out: ScoredMove[];
  if (depth === 2 && topK != null && topK < moves.length) {
    // Cheap full-width pass to rank, then pay full depth only where it matters.
    const shallow = moves
      .map((m) => ({ from: m.from, to: m.to, promotion: m.promotion, san: m.san, score: searchAt(m, 1) }))
      .sort((a, b) => b.score - a.score);
    const byKey = new Map(moves.map((m) => [`${m.from}${m.to}${m.promotion ?? ''}`, m]));
    out = shallow.map((s, i) =>
      i < topK ? { ...s, score: searchAt(byKey.get(`${s.from}${s.to}${s.promotion ?? ''}`)!, 2) } : s,
    );
  } else {
    out = moves.map((m) => ({
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      san: m.san,
      score: searchAt(m, depth),
    }));
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** How many root moves the bot searches at full depth. The rest are ranked by the
 *  depth-1 pass alone, which for a material engine almost always already contains
 *  the best move in its top few. Measured: ~170ms full-width vs ~70ms at 10. */
const BOT_TOP_K = 10;

/** Choose the bot's move, or null if the game is already over. */
export function chooseBotMove(fen: string, cfg: BotConfig, rng: () => number): BotMove | null {
  const g = new Chess(fen);
  const legal = verboseMoves(g);
  if (legal.length === 0) return null;

  const asMove = (m: VerboseMove): BotMove => ({ from: m.from, to: m.to, promotion: m.promotion });

  // 1. Mate in 1, before anything random can talk us out of it.
  if (cfg.takesMateIn1) {
    for (const m of legal) {
      g.move({ from: m.from, to: m.to, promotion: m.promotion });
      const isMate = g.isCheckmate();
      g.undo();
      if (isMate) return asMove(m);
    }
  }

  // 2. The deliberate mistake.
  if (rng() < cfg.blunderPct) {
    if (cfg.blunderKind === 'random') return asMove(pickOne(legal, rng));
    // 'second-best': drop only the top move, then apply the same hanging guard the
    // good path uses, so a strong Cakey's error stays an inaccuracy.
    const ranked = scoreRootMoves(fen, cfg.depth, cfg.usesCentreBonus, cfg.nodeCap, BOT_TOP_K);
    const rest = ranked.slice(1);
    const safe = cfg.guardsBigPieces ? rest.filter((m) => !hangsBigPiece(g, m)) : rest;
    const pool = safe.length > 0 ? safe : rest;
    if (pool.length > 0) return pickOne(pool, rng);
    // Only one legal move — there is nothing worse to play.
    return asMove(legal[0]);
  }

  // 3. Ordinary play: search, add greed, veto giveaways, sample within slack.
  const ranked = scoreRootMoves(fen, cfg.depth, cfg.usesCentreBonus, cfg.nodeCap, BOT_TOP_K);
  const withBias = ranked.map((m) => {
    const captured = legal.find((l) => l.from === m.from && l.to === m.to)?.captured;
    return { ...m, score: m.score + (captured ? cfg.captureBias : 0) };
  });
  withBias.sort((a, b) => b.score - a.score);

  const guarded = cfg.guardsBigPieces ? withBias.filter((m) => !hangsBigPiece(g, m)) : withBias;
  // If EVERY move hangs something, the position is lost anyway — play the best of
  // a bad lot rather than returning nothing.
  const pool = guarded.length > 0 ? guarded : withBias;

  const best = pool[0].score;
  const nearBest = pool.filter((m) => m.score >= best - cfg.slack);
  return pickOne(nearBest, rng);
}

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

/** How long the bot appears to "think".
 *
 *  The caller subtracts the MEASURED search time from the target before waiting,
 *  so every tier feels like the same character deliberating and the search's jank
 *  hides inside a pause that was going to happen anyway. Mirrors the puzzle
 *  game's OPP_REPLY_MS. */
export const THINK_BASE_MS = 550;
export const THINK_JITTER_MS = 450;
/** Extra beat when the move is a capture or a check — a little theatre. */
export const THINK_FLOURISH_MS = 300;
/** Never commit faster than this, even if the search was instant. */
export const THINK_MIN_MS = 150;
