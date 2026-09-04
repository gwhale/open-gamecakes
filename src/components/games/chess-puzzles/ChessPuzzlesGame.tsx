'use client';

// Chess Puzzles — adaptive rush on a chessground board.
//
// The kid plays White. Each puzzle animates the opponent's setup move, then the
// kid must play the solution LINE (single best move, or a multi-move combo where
// the opponent auto-replies between the kid's moves). A correct move commits and
// the line flows on; a wrong (but legal) move shows a hint and snaps back.
//
// Difficulty is a lichess-rated ADAPTIVE LADDER (see lib/games/chess/ladder):
// a clean solve (no wrong moves) ramps the rating up; any miss eases it down;
// the next puzzle is served near the new rating. So it gets harder exactly as
// the kid gets them right without errors, drawing from ~4.9k curated puzzles.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { playTap, playCorrect, playWrong } from '@/lib/games/shared/sounds';
import { hapticTap, hapticSuccess, hapticWrong } from '@/lib/haptics';
import GamecakesMascot from '@/components/GamecakesMascot';
import { getSessionDuration } from '@/lib/games/session-duration';
import { puzzleGoal, puzzleHint, type ChessPuzzle } from './puzzles';
import {
  startRatingForTier,
  nextPuzzle,
  puzzleKey,
  clampRating,
  CLEAN_STEP,
  MISS_STEP,
} from '@/lib/games/chess/ladder';
import ChessBoard from '@/components/games/chess/ChessBoard';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

const CELEBRATE_MS = 850; // beat to enjoy the Cakey pop before the next puzzle loads
const OPP_REPLY_MS = 520; // pause before the opponent auto-replies in a combo

export default function ChessPuzzlesGame({
  level,
  onComplete,
}: {
  level: number;
  onComplete: (s: SessionSummary) => void;
}) {
  const [sessionStart] = useState(() => Date.now());
  const [totalSeconds] = useState(() => getSessionDuration() * 60);

  // startRating is a pure function of the launcher level — safe to compute in
  // render and seed the refs/state (no ref reads during render).
  const startRating = startRatingForTier(level);
  const seenRef = useRef<Set<string>>(new Set());
  const ratingRef = useRef<number>(startRating);
  const peakRef = useRef<number>(startRating);
  const [rating, setRating] = useState(startRating);
  const [current, setCurrent] = useState<ChessPuzzle | null>(null);

  // Pick the first puzzle on mount (reading refs is fine inside an effect).
  useEffect(() => {
    const p = nextPuzzle(ratingRef.current, seenRef.current);
    seenRef.current.add(puzzleKey(p));
    setCurrent(p);
     
  }, []);

  const [idx, setIdx] = useState(0);
  const [solved, setSolved] = useState(0);
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const solvedRef = useRef(0);
  const wrongRef = useRef(0);
  const endedRef = useRef(false);

  // End the rush exactly once — on the buzzer.
  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const n = solvedRef.current;
    onComplete(
      buildSessionSummary({
        score: n,
        wrongAnswers: wrongRef.current,
        sessionStart,
        completed: true,
        optimalTaps: n,
        metaLines: [
          `♟️ Solved ${n} puzzle${n === 1 ? '' : 's'}`,
          `📈 Climbed to ~${Math.round(peakRef.current)} rating`,
        ],
      }),
    );
  }, [onComplete, sessionStart]);

  // 1s countdown (timeout chain), separate buzzer effect fires finish() once.
  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = window.setTimeout(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft === 0) finish();
  }, [timeLeft, finish]);

  // A puzzle finished. `clean` = solved with zero wrong moves → ramp up.
  const handleSolved = useCallback((clean: boolean) => {
    if (endedRef.current) return;
    solvedRef.current += 1;
    setSolved(solvedRef.current);
    const next = clampRating(ratingRef.current + (clean ? CLEAN_STEP : -MISS_STEP));
    ratingRef.current = next;
    peakRef.current = Math.max(peakRef.current, next);
    setRating(next);
    const p = nextPuzzle(next, seenRef.current);
    seenRef.current.add(puzzleKey(p));
    setCurrent(p);
    setIdx((i) => i + 1);
  }, []);

  const handleWrong = useCallback(() => {
    wrongRef.current += 1;
  }, []);

  return (
    <div className="flex w-full max-w-[540px] flex-col items-center gap-3">
      <RushHud timeLeft={timeLeft} solved={solved} total={totalSeconds} rating={rating} />
      {current ? (
        <PuzzleBoard
          key={idx}
          puzzle={current}
          frozen={timeLeft === 0}
          onSolved={handleSolved}
          onWrong={handleWrong}
        />
      ) : null}
    </div>
  );
}

// Timed-rush HUD: coins banked + current rating + a draining timer bar.
function RushHud({
  timeLeft,
  solved,
  total,
  rating,
}: {
  timeLeft: number;
  solved: number;
  total: number;
  rating: number;
}) {
  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, '0');
  const pct = Math.max(0, Math.min(100, (timeLeft / total) * 100));
  const low = timeLeft <= 30;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-sm font-bold">
        <span className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-amber-800">
          <SugarTokenIcon size="1em" />
          <span className="font-mono tabular-nums">{solved}</span>
        </span>
        <span
          className="flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-violet-800"
          aria-label={`Difficulty rating ${Math.round(rating)}`}
        >
          <span aria-hidden>♟️</span>
          <span className="font-mono tabular-nums">{Math.round(rating)}</span>
        </span>
        <span
          className={`flex items-center gap-1 font-mono tabular-nums ${low ? 'text-rose-600' : 'text-stone-700'}`}
          aria-label={`Time left ${mm}:${ss}`}
        >
          <span aria-hidden>⏱</span>
          {mm}:{ss}
        </span>
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-white/70 shadow-inner">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${pct}%`,
            background: low
              ? 'linear-gradient(to right, #fb7185, #e11d48)'
              : 'linear-gradient(to right, #6ee7b7, #34d399)',
          }}
        />
      </div>
    </div>
  );
}

type Phase = 'showing' | 'solving' | 'correct';

function PuzzleBoard({
  puzzle,
  frozen,
  onSolved,
  onWrong,
}: {
  puzzle: ChessPuzzle;
  frozen: boolean;
  onSolved: (clean: boolean) => void;
  onWrong: () => void;
}) {
  // chess.js is the source of truth; `fen` mirrors it to the board.
  const chessRef = useRef<Chess>(new Chess(puzzle.fen));
  const [fen, setFen] = useState(puzzle.fen);
  const [phase, setPhase] = useState<Phase>('showing');
  const [status, setStatus] = useState('The other player is moving…');
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [showHint, setShowHint] = useState(false);
  const [shake, setShake] = useState(0);

  // `ply` = index into puzzle.moves of the NEXT expected kid move (odd indices).
  const plyRef = useRef(1);

  const wrongCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const goal = useMemo(() => puzzleGoal(puzzle), [puzzle]);

  // The kid solves as whichever color is to move AFTER the opponent's setup
  // move — lichess puzzles come in both colors. Orient the board to them.
  const solverColor = useMemo<'white' | 'black'>(() => {
    const g = new Chess(puzzle.fen);
    try {
      const opp = puzzle.moves[0];
      g.move({ from: opp.slice(0, 2), to: opp.slice(2, 4), promotion: opp[4] || 'q' });
    } catch {
      /* validated */
    }
    return g.turn() === 'w' ? 'white' : 'black';
  }, [puzzle]);

  const applyUci = (uci: string): void => {
    try {
      chessRef.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    } catch {
      /* library is validated; never crash the board */
    }
    setFen(chessRef.current.fen());
    setLastMove([uci.slice(0, 2), uci.slice(2, 4)]);
  };

  // Animate the opponent's setup move (moves[0]), then it's the kid's turn.
  useEffect(() => {
    const t = window.setTimeout(() => {
      applyUci(puzzle.moves[0]);
      plyRef.current = 1;
      setPhase('solving');
      setStatus(`Your move! ${goal}`);
    }, 850);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);

  // Board queries derived from the `fen` STATE (not the mutable ref) so nothing
  // reads a ref during render. `fen` always mirrors chessRef after each move.
  const boardInfo = useMemo(() => {
    const g = new Chess(fen);
    const dests = new Map<string, string[]>();
    for (const mv of g.moves({ verbose: true })) {
      const arr = dests.get(mv.from) ?? [];
      arr.push(mv.to);
      dests.set(mv.from, arr);
    }
    return {
      dests,
      turnColor: (g.turn() === 'w' ? 'white' : 'black') as 'white' | 'black',
      inCheck: g.isCheck(),
    };
  }, [fen]);

  // After a correct kid move: auto-play the opponent's reply, or finish.
  const advance = useCallback(
    (movedPly: number) => {
      const oppUci = puzzle.moves[movedPly + 1];
      if (oppUci) {
        setPhase('showing');
        setStatus('…');
        window.setTimeout(() => {
          applyUci(oppUci);
          plyRef.current = movedPly + 2;
          setPhase('solving');
          setStatus(`Keep going! ${goal}`);
        }, OPP_REPLY_MS);
      } else {
        setPhase('correct');
        setStatus(puzzle.kind === 'mate' ? 'Checkmate! 🏆' : 'Solved! 🎉');
        playCorrect();
        hapticSuccess();
        window.setTimeout(() => {
          if (resolvedRef.current) return;
          resolvedRef.current = true;
          onSolved(wrongCountRef.current === 0);
        }, CELEBRATE_MS);
      }
    },
     
    [puzzle, goal, onSolved],
  );

  const playKidMove = useCallback(
    (uci: string, atPly: number) => {
      applyUci(uci);
      advance(atPly);
    },
     
    [advance],
  );

  // Kid dragged/tapped a legal move on the board → validate against the line.
  const onBoardMove = useCallback(
    (from: string, to: string) => {
      if (phase !== 'solving' || frozen) return;
      const atPly = plyRef.current;
      const expected = puzzle.moves[atPly];
      if (!expected) return;
      const coord = from + to;
      const isFinal = !puzzle.moves[atPly + 1];

      let correct = false;
      let uci = expected;
      if (coord === expected.slice(0, 4)) {
        correct = true;
        uci = expected;
      } else if (isFinal && puzzle.kind === 'mate') {
        // Kid found a different checkmate on the last move — accept it.
        const clone = new Chess(chessRef.current.fen());
        let res = null;
        try {
          res = clone.move({ from, to, promotion: 'q' });
        } catch {
          res = null;
        }
        if (res && clone.isCheckmate()) {
          correct = true;
          uci = from + to + (res.promotion ?? '');
        }
      }

      if (!correct) {
        wrongCountRef.current += 1;
        onWrong();
        setShowHint(true);
        setShake((n) => n + 1);
        setStatus('Not the move — try again!');
        playWrong();
        hapticWrong();
        setFen(chessRef.current.fen()); // snap the optimistic move back
        return;
      }

      playTap();
      hapticTap();
      playKidMove(uci, atPly);
    },
    [phase, frozen, puzzle, onWrong, playKidMove],
  );

  return (
    <div className="relative flex w-full max-w-[540px] flex-col items-center gap-3">
      {/* Status row */}
      <div className="min-h-[1.5rem] w-full text-center text-sm">
        <span className={`font-semibold ${phase === 'correct' ? 'text-emerald-600' : 'text-stone-700'}`}>
          {status}
        </span>
      </div>

      {/* Board (chessground) */}
      <div key={shake} className="w-full" style={shake ? { animation: 'chess-shake 0.4s' } : undefined}>
        <ChessBoard
          fen={fen}
          orientation={solverColor}
          turnColor={boardInfo.turnColor}
          movable={phase === 'solving' && !frozen}
          dests={boardInfo.dests}
          lastMove={lastMove}
          check={boardInfo.inCheck}
          onMove={onBoardMove}
          className="w-full"
        />
      </div>

      {/* ---- Cakey celebration on a full solve ---- */}
      {phase === 'correct' ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-[9%] z-30 flex justify-center px-4"
          aria-live="polite"
        >
          <div
            className="flex items-center gap-2 rounded-3xl rounded-bl-md border-2 border-white/70 bg-white px-4 py-2 shadow-2xl dark:bg-zinc-900"
            style={{ animation: 'cakey-pop 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}
          >
            <GamecakesMascot mood="celebrate" size={56} />
            <div className="pr-1 text-left">
              <div className="font-display text-lg font-bold text-rose-600 dark:text-rose-300">
                {puzzle.kind === 'mate' ? 'Checkmate! 🏆' : 'You got it! 🎉'}
              </div>
              <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Cakey’s so proud of you!
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Goal + hint */}
      <div className="min-h-[2.5rem] w-full text-center">
        <div className="text-sm font-semibold text-stone-600">{goal}</div>
        {showHint ? (
          <div className="mt-0.5 text-xs text-amber-700">💡 {puzzleHint(puzzle, plyRef.current)}</div>
        ) : null}
      </div>

      <style>{`
        @keyframes chess-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes cakey-pop {
          0%   { transform: scale(0.5) translateY(-8px); opacity: 0; }
          60%  { transform: scale(1.08) translateY(0);   opacity: 1; }
          100% { transform: scale(1)    translateY(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
