'use client';

// Word Memory — 5×5 sight-word memory match with center-blank.
//
// Ported from the remixed HTML prototype. React/DOM only (no Phaser):
// the game is pure card-flip logic with CSS 3D transforms — a canvas
// engine would be overkill. Tile state lives in component state; on a
// completed round the parent shell handles the /api/attempts POST via
// the `onComplete` callback.

import { useEffect, useRef, useState } from 'react';
import {
  playTap,
  playCorrect,
  playWrong,
  playWin,
} from '@/lib/games/shared/sounds';
// Word Memory is the only catalog game that doesn't run inside
// PhaserGameHost (it's pure DOM card-flip), so it doesn't get the
// shared SFX→haptic dispatcher. Wire haptics directly here so iPad
// kids get the same buzz vocabulary as every other game.
import { hapticTap, hapticThump, hapticWrong, hapticSuccess } from '@/lib/haptics';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { WORD_LISTS, PAIRS_TOTAL } from './word-lists';

const CENTER_INDEX = 12;         // index of the 3rd row, 3rd col in a 5×5 grid
const FLIP_BACK_MS = 1500;       // how long a mismatched pair stays shown
const COMPLETE_DELAY_MS = 700;   // wait for last flip to finish before ending

interface Props {
  /** Which word-list to play; 1..10, maps to the launcher's level. */
  listId: number;
  /** Session cap in seconds (the kid's chosen 1/2/3 min). The round ends
   *  when all pairs are found OR this runs out — whichever comes first. */
  capSeconds: number;
  /** Called once the round ends (all pairs found, or the clock ran out). */
  onComplete: (summary: SessionSummary) => void;
}

/** Fisher–Yates shuffle, local (not in-place exposed). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build a 25-slot board: 10 pairs + 2 extra pairs (from the first two
 *  words) = 24 cards, shuffled, with slot 12 (center) left as null. */
function buildBoard(words: readonly string[]): (string | null)[] {
  const deck = shuffle([
    ...words, ...words,
    words[0], words[0], words[1], words[1],
  ]);
  const board: (string | null)[] = Array(25).fill(null);
  let deckIdx = 0;
  for (let i = 0; i < 25; i++) {
    if (i === CENTER_INDEX) continue;
    board[i] = deck[deckIdx++];
  }
  return board;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

export default function WordMemoryGame({ listId, capSeconds, onComplete }: Props) {
  const words = WORD_LISTS[listId] ?? WORD_LISTS[1];

  // All per-round state is seeded via lazy initializers. The parent shell
  // remounts this component (via `key`) when listId changes or "Play Again"
  // is tapped, so we never need a reset-effect — mount = fresh round.
  const [board] = useState<(string | null)[]>(() => buildBoard(words));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [pairs, setPairs] = useState(0);
  const [capLeft, setCapLeft] = useState(capSeconds);
  const [sessionStart] = useState<number>(() => Date.now());

  // Guard against firing onComplete twice if React strict-mode re-runs an effect.
  const completedRef = useRef(false);

  // Session cap counts down from mount (no first-flip gate — the clock is a
  // real time box now). Freezes on win. A separate effect owns the buzzer so
  // the partial-round completion fires exactly once at zero.
  useEffect(() => {
    if (pairs === PAIRS_TOTAL || capLeft <= 0) return;
    const t = window.setTimeout(() => setCapLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [pairs, capLeft]);

  useEffect(() => {
    if (capLeft !== 0 || completedRef.current) return;
    completedRef.current = true;
    playWin();
    hapticSuccess();
    onComplete(
      buildSessionSummary({
        score: pairs,
        wrongAnswers: Math.max(0, moves - pairs),
        sessionStart,
        completed: true,
        optimalTaps: PAIRS_TOTAL,
      }),
    );
  }, [capLeft, pairs, moves, sessionStart, onComplete]);

  function flip(idx: number): void {
    if (matched.has(idx)) return;
    if (flipped.includes(idx)) return;
    if (flipped.length === 2) return;  // already resolving a pair
    if (!board[idx]) return;           // center blank

    playTap();
    hapticTap();

    const next = [...flipped, idx];
    setFlipped(next);

    if (next.length !== 2) return;

    // Evaluate the pair.
    const [a, b] = next;
    const isMatch = board[a] === board[b];
    const newMoves = moves + 1;
    setMoves(newMoves);

    if (isMatch) {
      playCorrect();
      hapticThump();
      setMatched((prev) => new Set(prev).add(a).add(b));
      setFlipped([]);
      const newPairs = pairs + 1;
      setPairs(newPairs);

      if (newPairs === PAIRS_TOTAL && !completedRef.current) {
        completedRef.current = true;
        playWin();
        hapticSuccess();
        // Small delay so the final flip finishes before the overlay covers it.
        window.setTimeout(() => {
          onComplete(
            buildSessionSummary({
              score: PAIRS_TOTAL,
              wrongAnswers: newMoves - PAIRS_TOTAL,
              sessionStart,
              completed: true,
              optimalTaps: PAIRS_TOTAL,
            }),
          );
        }, COMPLETE_DELAY_MS);
      }
    } else {
      playWrong();
      hapticWrong();
      window.setTimeout(() => setFlipped([]), FLIP_BACK_MS);
    }
  }

  return (
    <div className="w-full max-w-2xl select-none">
      {/* Header — list name + live stats */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 text-amber-100">
        <h2 className="text-lg font-bold sm:text-xl">
          Word List <span className="text-amber-400">{listId}</span>
        </h2>
        <Stats pairs={pairs} moves={moves} capLeft={capLeft} />
      </div>

      {/* Grid — 5×5 with center blank */}
      <div
        role="grid"
        aria-label="Memory grid"
        className="grid grid-cols-5 gap-2 sm:gap-2.5"
      >
        {board.map((word, idx) => {
          if (word === null) {
            // Center blank — reserves grid space, no face.
            return <div key={idx} role="gridcell" aria-hidden className="aspect-square" />;
          }
          const isFlipped = flipped.includes(idx) || matched.has(idx);
          const isMatched = matched.has(idx);
          return (
            <Card
              key={idx}
              index={idx}
              word={word}
              flipped={isFlipped}
              matched={isMatched}
              onClick={() => flip(idx)}
            />
          );
        })}
      </div>

      {/* Word list reveal — mirror of the HTML's bottom panel */}
      <aside className="mt-6 rounded-2xl border-2 border-amber-400 bg-blue-900/50 p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-400">
          Today&rsquo;s words
        </h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {words.map((w) => (
            <li
              key={w}
              className="rounded-md border border-amber-400/40 bg-amber-400/20 py-2 text-center text-sm font-bold text-amber-50"
            >
              {w}
            </li>
          ))}
        </ul>
      </aside>

      <p className="mt-3 text-center text-xs text-amber-200/80">
        Center is blank. The first two words appear three times each.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stats({ pairs, moves, capLeft }: { pairs: number; moves: number; capLeft: number }) {
  const low = capLeft <= 15;
  return (
    <div className="flex items-baseline gap-4 text-sm text-amber-200">
      <span>
        Pairs <b className="font-mono text-amber-100">{pairs}/{PAIRS_TOTAL}</b>
      </span>
      <span>
        Moves <b className="font-mono text-amber-100">{moves}</b>
      </span>
      <span>
        ⏱ <b className={`font-mono ${low ? 'text-rose-300' : 'text-amber-100'}`}>{formatTime(capLeft)}</b>
      </span>
    </div>
  );
}

function Card({
  index,
  word,
  flipped,
  matched,
  onClick,
}: {
  index: number;
  word: string;
  flipped: boolean;
  matched: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="gridcell"
      aria-label={flipped ? `Word: ${word}` : 'Hidden card'}
      data-index={index}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative aspect-square cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
      style={{ perspective: '900px' }}
    >
      {/* Inner flipper — one child is the front, the other is the back,
          both absolutely positioned with backface hidden so they can't
          bleed through each other during the flip. */}
      <div
        className="relative h-full w-full transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front (face-down) */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl border-[3px] border-amber-400 bg-gradient-to-b from-blue-600 to-blue-800 shadow-lg"
          style={{ backfaceVisibility: 'hidden' }}
        />
        {/* Back (word reveal) */}
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-2xl border-[3px] bg-amber-400 p-2 shadow-lg ${
            matched ? 'ring-4 ring-amber-300/60 border-amber-200' : 'border-amber-400'
          }`}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <span className="text-center font-bold leading-tight text-blue-900" style={{ fontSize: 'clamp(16px, 3vw, 28px)' }}>
            {word}
          </span>
        </div>
      </div>
    </button>
  );
}
