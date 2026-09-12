'use client';

// Chess Challenge — a full game of chess against an ELO-labelled Cakey.
//
// The kid always plays White (no opening move to sit through, and the first-move
// edge is welcome in a kids' game). There is no clock: a chess game is 5–15
// minutes where every other game here is 1–3, and a chess clock that hands a kid
// a loss on time is punishing and off-brand.
//
// ---------------------------------------------------------------------------
// HOW THE SESSION IS SCORED, AND WHY
// ---------------------------------------------------------------------------
// SessionSummary was designed for "N discrete answers, some wrong". Chess has no
// answers, so this is an honest reinterpretation rather than a natural fit:
//
//   a "tap"     = one move the KID made (bot moves never count)
//   taps_wrong  = a FLAGGED kid move (see flagging rules below)
//   efficiency  = soundMoves / kidMoves — "how much of your play didn't throw
//                 material away". The mastery engine reads >= 0.7 as correct.
//
// Win/loss is deliberately NOT in efficiency. The opponent's tier already decides
// win probability, so a result-based metric would mostly measure which Cakey the
// kid picked; it is binary, so mastery would become a high-variance coin flip;
// and move quality is the part a kid can actually improve. The result still leads
// the game-over card, where it belongs emotionally.
//
// A move is flagged when any of these hold:
//   1. It leaves the kid >= BLUNDER_CP worse off than they ALREADY were — i.e.
//      the move threw material away. Deliberately not "worse than the best move
//      available": that scores declining a free piece the same as hanging one,
//      and the weakest Cakey hangs something on a third of his moves.
//   2. It returns the KID'S OWN pieces to an arrangement already seen this game,
//      i.e. no net progress. This is the anti-farm rule and it is not optional —
//      without it a kid shuffles a knight back and forth, scores efficiency 1.0,
//      banks the token cap and tiers up. It keys on the kid's pieces alone
//      because full-position repetition needs the BOT to shuffle back too, and
//      measurably never fired (see kidPlacementKey).
//   3. A forced mate in 1 was on the board and they played something else.
//   4. They used the take-back or the hint (charged to the move it replaced).
//
// ⚠️ Chess Challenge shares the chess-puzzles SKILL, so this metric moves mastery
// a kid earned solving puzzles. If BLUNDER_CP turns out too tight, kids tier DOWN
// in chess they already had. Read real attempts.efficiency before tightening it.
//
// ---------------------------------------------------------------------------
// WHERE THE SEARCH RUNS
// ---------------------------------------------------------------------------
// The bot search is synchronous on the main thread (~57ms desktop, more on a
// tablet — see bot.ts). Both the grading of the kid's move AND the bot's own
// choice happen inside the bot's artificial "thinking" pause, while the board is
// idle. Nothing heavy runs on the kid's turn, so nothing blocks their taps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { playTap, playCorrect, playWrong, playLevelUp } from '@/lib/games/shared/sounds';
import { hapticTap, hapticSuccess, hapticWrong } from '@/lib/haptics';
import ChessBoard from '@/components/games/chess/ChessBoard';
import {
  chooseBotMove,
  scoreRootMoves,
  positionScore,
  makeRng,
  BLUNDER_CP,
  THINK_BASE_MS,
  THINK_JITTER_MS,
  THINK_FLOURISH_MS,
  THINK_MIN_MS,
} from '@/lib/games/chess/bot';
import { opponentForLevel, pickOpponentLine, type ChessOpponent } from '@/lib/games/chess/opponents';
import OpponentBadge from './OpponentBadge';

/** Kid moves after which we adjudicate on material, so a shuffling game ends. */
const MAX_KID_MOVES = 120;

type Phase = 'kid' | 'thinking' | 'over';
type Result = 'win' | 'loss' | 'draw' | 'stopped';

/** Repetition key for the anti-farm rule: the arrangement of the KID'S OWN
 *  pieces, ignoring the bot's entirely.
 *
 *  ⚠️ This was originally the whole position (FEN placement + side to move) and
 *  it did not work. Full-position repetition needs the BOT to shuffle back too —
 *  but the farm is a kid moving a knight out and back while the bot calmly
 *  develops, so the position never repeats and the rule never fired. Measured: 8
 *  knight shuffles scored 8/8 "solid" and pushed mastery UP.
 *
 *  Keyed on the kid's own pieces, returning to an arrangement already seen means
 *  no net progress was made, whatever the opponent did — and it catches longer
 *  A→B→C→A cycles, not just an immediate reversal. */
const kidPlacementKey = (fen: string): string => {
  const placement = fen.split(' ')[0];
  let file = 0;
  let rank = 7;
  const own: string[] = [];
  for (const ch of placement) {
    if (ch === '/') {
      rank -= 1;
      file = 0;
    } else if (ch >= '1' && ch <= '8') {
      file += Number(ch);
    } else {
      // Uppercase = White = the kid. Lowercase (the bot) is deliberately ignored.
      if (ch >= 'A' && ch <= 'Z') own.push(`${ch}${file}${rank}`);
      file += 1;
    }
  }
  return own.join('');
};

export default function ChessChallengeGame({
  level,
  onComplete,
}: {
  level: number;
  onComplete: (s: SessionSummary) => void;
}) {
  const [sessionStart] = useState(() => Date.now());
  const opponent: ChessOpponent = useMemo(() => opponentForLevel(level), [level]);

  // One RNG per game. Without a seed "the bot hung its queen on move 12" is an
  // unreproducible bug report, and every tier is partly random by design.
  // Lazy useState rather than a ref assigned during render — Date.now() in the
  // render body is an impure call and the purity lint rightly rejects it.
  const [{ rng, seed }] = useState(() => {
    const s = Date.now() >>> 0;
    return { rng: makeRng(s), seed: s };
  });
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') console.info('[chess-challenge] rng seed', seed);
  }, [seed]);

  // Seeded from chess.js's own start-position constant rather than from
  // chessRef.current.fen() — reading a ref during render (even inside a lazy
  // useState initialiser) is exactly what the react-hooks lint forbids, and the
  // two are the same string anyway.
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState<string>(DEFAULT_POSITION);
  const [phase, setPhase] = useState<Phase>('kid');
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [say, setSay] = useState<string>(() => pickOpponentLine(opponent.lines.greeting).line);
  const [hint, setHint] = useState<[string, string] | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [shake, setShake] = useState(0);

  // --- session tallies ---
  const kidMovesRef = useRef(0);
  const flaggedRef = useRef(0);
  const seenPositionsRef = useRef<Set<string>>(new Set([kidPlacementKey(DEFAULT_POSITION)]));
  // These two gate BUTTONS, so they are state, not refs — a ref read during
  // render is both a lint error and a real staleness bug waiting to happen.
  const [takeBackUsed, setTakeBackUsed] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  /** Snapshot for the take-back: the FEN before the kid's last move, and the
   *  repetition set as it stood then.
   *
   *  The set has to be rewound too. A take-back undoes the kid's move AND the
   *  bot's reply, but both of those positions were already recorded — so without
   *  this, taking back and then playing the same move again would trip the
   *  repetition rule and be flagged as a blunder the kid never made. */
  const undoFenRef = useRef<string | null>(null);
  const undoSeenRef = useRef<Set<string> | null>(null);
  const resolvedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const [canTakeBack, setCanTakeBack] = useState(false);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );
  const later = (fn: () => void, ms: number): void => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  const boardInfo = useMemo(() => {
    const g = new Chess(fen);
    const dests = new Map<string, string[]>();
    for (const mv of g.moves({ verbose: true })) {
      const arr = dests.get(mv.from) ?? [];
      arr.push(mv.to);
      dests.set(mv.from, arr);
    }
    return { dests, turnColor: (g.turn() === 'w' ? 'white' : 'black') as 'white' | 'black', inCheck: g.isCheck() };
  }, [fen]);

  const finish = useCallback(
    (how: Result) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setResult(how);
      setPhase('over');

      const kidMoves = kidMovesRef.current;
      const flagged = Math.min(flaggedRef.current, kidMoves);
      const sound = kidMoves - flagged;
      const headline =
        how === 'win'
          ? `♟️ You beat ${opponent.name} (${opponent.elo})!`
          : how === 'loss'
            ? `♟️ ${opponent.name} (${opponent.elo}) got you this time.`
            : how === 'draw'
              ? `♟️ A draw with ${opponent.name} (${opponent.elo}).`
              : `♟️ Game stopped against ${opponent.name}.`;

      onComplete(
        buildSessionSummary({
          score: sound,
          wrongAnswers: flagged,
          sessionStart,
          // A natural end (mate/stalemate/draw/adjudication) is "completed";
          // walking away with "I'm done" is not.
          completed: how !== 'stopped',
          // Denominator is total kid moves, so efficiency reads as the share of
          // the kid's OWN moves that were sound.
          optimalTaps: kidMoves,
          metaLines: [headline, `✅ ${sound} of ${kidMoves} moves were solid`],
        }),
      );
    },
    [onComplete, opponent.elo, opponent.name, sessionStart],
  );

  /** Terminal check after any move. Returns true if the game ended. */
  const settleIfOver = useCallback(
    (g: Chess): boolean => {
      if (g.isCheckmate()) {
        // Whoever is to move has been mated.
        const kidWon = g.turn() === 'b';
        setSay(pickOpponentLine(kidWon ? opponent.lines.botLoses : opponent.lines.botWins).line);
        if (kidWon) {
          playLevelUp();
          hapticSuccess();
        }
        finish(kidWon ? 'win' : 'loss');
        return true;
      }
      if (g.isDraw() || g.isStalemate() || g.isThreefoldRepetition() || g.isInsufficientMaterial()) {
        setSay(pickOpponentLine(opponent.lines.draw).line);
        finish('draw');
        return true;
      }
      if (kidMovesRef.current >= MAX_KID_MOVES) {
        // Adjudicate on material rather than letting a shuffle run forever.
        let mat = 0;
        for (const row of g.board()) {
          for (const sq of row) {
            if (!sq) continue;
            const v = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[sq.type];
            mat += (sq.color === 'w' ? 1 : -1) * v;
          }
        }
        finish(mat > 1 ? 'win' : mat < -1 ? 'loss' : 'draw');
        return true;
      }
      return false;
    },
    [finish, opponent.lines],
  );

  /** The bot's turn: grade what the kid just did, choose a reply, and hide both
   *  searches inside one "thinking" pause. */
  const botTurn = useCallback(
    (fenBeforeKidMove: string, kidUci: [string, string]) => {
      setPhase('thinking');
      const started = performance.now();

      // Both of these are synchronous searches. They run HERE, on the bot's turn,
      // precisely so the kid's turn stays responsive.
      // 1. Grade the kid's move — full width, never the staged search, because a
      //    false blunder flag costs a kid mastery.
      let flagged = false;
      let missedMate = false;
      try {
        const ranked = scoreRootMoves(fenBeforeKidMove, 2, true);
        const played = ranked.find((m) => m.from === kidUci[0] && m.to === kidUci[1]);
        if (played && ranked.length > 0) {
          // Graded against the BASELINE — what the kid was already worth — not
          // against the best move available. Against the best move, declining a
          // free piece scores the same as hanging one, and the weakest Cakey
          // hangs something on a third of his moves; a real playtest of e4, Nf3,
          // Bc4, O-O came out at 2/4 "solid". Missing a chance is not a blunder.
          const baseline = positionScore(fenBeforeKidMove, true);
          if (played.score < baseline - BLUNDER_CP) flagged = true;
          // A forced mate was there and they played something else. Kept as a
          // separate rule precisely BECAUSE the baseline test above cannot catch
          // it — declining mate costs no material. Rare enough to be a nudge
          // rather than a tax.
          if (ranked[0].score > 90_000 && played.score < 90_000) {
            flagged = true;
            missedMate = true;
          }
        }
      } catch {
        // Grading is best-effort: never let it break the game.
      }

      const g = chessRef.current;
      const repeated = seenPositionsRef.current.has(kidPlacementKey(g.fen()));
      if (repeated) flagged = true;
      seenPositionsRef.current.add(kidPlacementKey(g.fen()));
      if (flagged) flaggedRef.current += 1;

      // 2. Choose the bot's move.
      const botMove = chooseBotMove(g.fen(), opponent.bot, rng);

      const target =
        THINK_BASE_MS +
        rng() * THINK_JITTER_MS +
        // A beat longer when the move is a capture or arrives in check — the bot
        // is still holding the position it had BEFORE the move here, so an
        // occupied destination square means it is about to take something.
        (botMove && (g.get(botMove.to as Parameters<Chess['get']>[0]) || g.isCheck())
          ? THINK_FLOURISH_MS
          : 0);
      const wait = Math.max(THINK_MIN_MS, target - (performance.now() - started));

      later(() => {
        if (resolvedRef.current) return;
        if (!botMove) {
          // No legal reply — the kid's move ended it.
          settleIfOver(g);
          return;
        }
        g.move({ from: botMove.from, to: botMove.to, promotion: botMove.promotion });
        setFen(g.fen());
        setLastMove([botMove.from, botMove.to]);
        // No key recorded here on purpose: the key tracks the KID's own piece
        // arrangement, and a bot move only changes it by capturing — an
        // arrangement that can never recur anyway.
        playTap();

        if (settleIfOver(g)) return;
        setSay(
          g.isCheck()
            ? pickOpponentLine(opponent.lines.check).line
            : pickOpponentLine(flagged ? opponent.lines.kidSlip : opponent.lines.goodMove).line,
        );
        if (missedMate && process.env.NODE_ENV !== 'production') {
          console.info('[chess-challenge] kid missed a mate in 1');
        }
        setPhase('kid');
        setCanTakeBack(true);
      }, wait);
    },
    [opponent.bot, opponent.lines, rng, settleIfOver],
  );

  const onBoardMove = useCallback(
    (from: string, to: string) => {
      if (phase !== 'kid' || resolvedRef.current) return;
      const g = chessRef.current;
      const before = g.fen();
      let ok = null;
      try {
        // Auto-queen. ChessBoard has no promotion picker; underpromotion is a
        // clean phase-2 addition and is vanishingly rare at this level.
        ok = g.move({ from, to, promotion: 'q' });
      } catch {
        ok = null;
      }
      if (!ok) {
        // chessground only offers legal destinations, so this is belt-and-braces.
        setShake((s) => s + 1);
        playWrong();
        hapticWrong();
        return;
      }
      undoFenRef.current = before;
      undoSeenRef.current = new Set(seenPositionsRef.current);
      kidMovesRef.current += 1;
      setFen(g.fen());
      setLastMove([from, to]);
      setHint(null);
      playTap();
      hapticTap();

      if (settleIfOver(g)) return;
      botTurn(before, [from, to]);
    },
    [botTurn, phase, settleIfOver],
  );

  /** One take-back per game, counted as a flagged move. Enormously useful for a
   *  learner; costing it a tally keeps the metric honest. */
  const takeBack = useCallback(() => {
    if (takeBackUsed || phase !== 'kid' || !undoFenRef.current) return;
    setTakeBackUsed(true);
    flaggedRef.current += 1;
    setCanTakeBack(false);
    const g = chessRef.current;
    g.load(undoFenRef.current);
    if (undoSeenRef.current) seenPositionsRef.current = undoSeenRef.current;
    undoFenRef.current = null;
    undoSeenRef.current = null;
    setFen(g.fen());
    setLastMove(undefined);
    setHint(null);
    setSay('Go on then. One do-over.');
  }, [phase, takeBackUsed]);

  /** The hint is free to compute — the same search already runs for grading. */
  const showHint = useCallback(() => {
    if (phase !== 'kid' || hintUsed) return;
    setHintUsed(true);
    flaggedRef.current += 1;
    const ranked = scoreRootMoves(chessRef.current.fen(), 2, true);
    if (ranked.length > 0) setHint([ranked[0].from, ranked[0].to]);
    playCorrect();
  }, [phase, hintUsed]);

  // `phase` already encodes resolution — finish() sets it to 'over' — so render
  // never needs to consult resolvedRef, which stays purely as the synchronous
  // double-finish guard inside callbacks.
  const kidToMove = phase === 'kid';

  return (
    <div className="relative flex w-full max-w-lg flex-col items-center gap-3">
      <OpponentBadge opponent={opponent} say={say} thinking={phase === 'thinking'} />

      <div key={shake} className="w-full" style={shake ? { animation: 'chess-shake 0.4s' } : undefined}>
        <ChessBoard
          fen={fen}
          orientation="white"
          turnColor={boardInfo.turnColor}
          movable={kidToMove}
          dests={boardInfo.dests}
          lastMove={hint ?? lastMove}
          check={boardInfo.inCheck}
          onMove={onBoardMove}
          className="w-full"
        />
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={takeBack}
          disabled={!kidToMove || takeBackUsed || !canTakeBack}
          className="rounded-full border-2 border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-40 dark:bg-zinc-800 dark:text-stone-200"
        >
          ↩︎ Take it back{takeBackUsed ? '' : ' (1)'}
        </button>
        <button
          type="button"
          onClick={showHint}
          disabled={!kidToMove || hintUsed}
          className="rounded-full border-2 border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-40 dark:bg-zinc-800 dark:text-stone-200"
        >
          💡 Show me{hintUsed ? '' : ' (1)'}
        </button>
        <button
          type="button"
          onClick={() => finish('stopped')}
          disabled={phase === 'over'}
          className="rounded-full border-2 border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40 dark:bg-emerald-900/40 dark:text-emerald-200"
        >
          I&apos;m done — keep my tokens
        </button>
      </div>

      {result ? (
        <p className="text-center text-sm font-semibold text-stone-700 dark:text-stone-200" aria-live="polite">
          {result === 'win'
            ? `You beat ${opponent.name}! 🏆`
            : result === 'loss'
              ? `${opponent.name} won this one.`
              : result === 'draw'
                ? "It's a draw!"
                : 'Game stopped — your tokens are safe.'}
        </p>
      ) : null}
    </div>
  );
}
