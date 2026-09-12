'use client';

// Sprinkle Search — a word search built from this week's sight words.
//
// Pure React/DOM like Word Memory: a grid of letter buttons and a tray of
// words to find. No Phaser, no canvas — the whole game is "drag a straight
// line across some letters", which the DOM does better than a scene graph
// would, and it keeps the grid a real set of buttons for a screen reader.
//
// SELECTING. Two ways, because a tablet thumb and a mouse behave differently:
//   * drag — pointer down on the first letter, slide to the last, release;
//   * tap-tap — tap the first letter (it stays lit), then tap the last.
// Either way the selection is the straight run between the two cells
// (cellsBetween); a bent path is simply not a selection. A run that spells a
// word from the tray, forwards or backwards, is found: it takes a candy colour
// for good, Cakey says the word, and the tray crosses it off. A straight run
// that is not a word flashes rose and counts as a wrong selection — the
// mastery engine's "wrong answer" for this game. A bent path, or a single
// cell, just clears: there was no guess in it.
//
// The words come from wordsForRound: the kid's class list when it can fill a
// grid, the library by level otherwise. The banner above the grid says which.

import { useCallback, useEffect, useRef, useState } from 'react';
import { makeRng } from '@/lib/games/opponents/rng';
import { playCorrect, playWin, playWrong } from '@/lib/games/shared/sounds';
import { hapticSuccess, hapticThump, hapticWrong } from '@/lib/haptics';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { speakSilently } from '@/lib/town/cakey-voice';
import { wordsForRound, type WordSource } from '@/lib/games/words/pool';
import {
  cellsBetween,
  generateWordSearch,
  readCells,
  wordSearchTier,
  type Cell,
  type Placement,
} from '@/lib/games/word-search/generate';

const FLASH_MS = 380;
const COMPLETE_DELAY_MS = 900;

/** One candy colour per found word, cycling. Bright fills with a deep ink of
 *  their own hue — the Ink Rule — so a found word stays readable. Rose and
 *  amber come LAST: amber is the live-selection colour and rose is the wrong
 *  flash, and the first word found should not look like either. */
const FOUND_COLOURS = [
  'bg-emerald-300 text-emerald-950',
  'bg-sky-300 text-sky-950',
  'bg-violet-300 text-violet-950',
  'bg-fuchsia-300 text-fuchsia-950',
  'bg-lime-300 text-lime-950',
  'bg-teal-300 text-teal-950',
  'bg-orange-300 text-orange-950',
  'bg-pink-300 text-pink-950',
  'bg-rose-300 text-rose-950',
  'bg-amber-300 text-amber-950',
];

interface Round {
  size: number;
  grid: string[][];
  placements: Placement[];
  source: WordSource;
}

function buildRound(level: number): Round {
  const cfg = wordSearchTier(level);
  // Seeded from the clock so the round is reproducible from one number in a
  // bug report, while still being a different grid every time.
  const rng = makeRng(Date.now() % 2147483647);
  const pool = wordsForRound('sight-words', level, cfg.count, rng, { maxLen: cfg.maxLen });
  const ws = generateWordSearch({
    words: pool.words,
    size: cfg.size,
    directions: cfg.directions,
    rng,
    fillBias: cfg.fillBias,
  });
  return { size: ws.size, grid: ws.grid, placements: ws.placements, source: pool.source };
}

const key = (c: Cell): string => `${c[0]},${c[1]}`;
const same = (a: Cell | null, b: Cell | null): boolean =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1];

interface Props {
  /** Launcher level, 1..10. */
  level: number;
  onComplete: (summary: SessionSummary) => void;
}

export default function WordSearchGame({ level, onComplete }: Props) {
  // Lazy initialisers: the shell remounts this component (via `key`) for a
  // new round, so mount = fresh grid and there is never a reset effect.
  const [round] = useState<Round>(() => buildRound(level));
  const [sessionStart] = useState<number>(() => Date.now());
  /** Word -> colour index, for the words found so far. */
  const [found, setFound] = useState<Map<string, number>>(() => new Map());
  const [wrong, setWrong] = useState(0);
  /** Drag in progress: where it started and where the pointer is now. */
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<Cell | null>(null);
  /** Tap-tap mode: the first tap, waiting for the second. */
  const [pending, setPending] = useState<Cell | null>(null);
  /** Cells flashing rose after a wrong selection. */
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  const dragging = useRef(false);
  const completedRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const total = round.placements.length;
  const remaining = total - found.size;

  useEffect(() => {
    if (flash.size === 0) return;
    const t = window.setTimeout(() => setFlash(new Set()), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flash]);

  /** Colour class for a cell that belongs to a found word, if any. Computed
   *  per render from the placements — cheap at 144 cells, and it means a cell
   *  shared by two found words shows the later colour, which is fine. */
  const foundColourOf = useCallback(
    (cell: Cell): string | null => {
      let out: string | null = null;
      for (const p of round.placements) {
        const idx = found.get(p.word);
        if (idx === undefined) continue;
        if (p.cells.some((c) => same(c, cell))) out = FOUND_COLOURS[idx % FOUND_COLOURS.length];
      }
      return out;
    },
    [round.placements, found],
  );

  const evaluate = useCallback(
    (a: Cell, b: Cell): void => {
      const cells = cellsBetween(a, b);
      // A bent path or a single cell is not a guess — clear without penalty.
      if (!cells || cells.length < 2) return;
      const text = readCells(round.grid, cells);
      const reversed = text.split('').reverse().join('');
      const hit = round.placements.find(
        (p) => !found.has(p.word) && (p.word === text || p.word === reversed),
      );
      if (hit) {
        const next = new Map(found);
        next.set(hit.word, next.size);
        setFound(next);
        playCorrect();
        hapticThump();
        speakSilently(hit.word);
        if (next.size === total && !completedRef.current) {
          completedRef.current = true;
          window.setTimeout(() => {
            playWin();
            hapticSuccess();
            onComplete(
              buildSessionSummary({
                score: total,
                wrongAnswers: wrong,
                sessionStart,
                completed: true,
                optimalTaps: total,
              }),
            );
          }, COMPLETE_DELAY_MS);
        }
        return;
      }
      setWrong((w) => w + 1);
      setFlash(new Set(cells.map(key)));
      playWrong();
      hapticWrong();
    },
    [round, found, total, wrong, sessionStart, onComplete],
  );

  const cellFromPoint = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y);
    const btn = el?.closest?.('[data-rc]') as HTMLElement | null;
    if (!btn || !gridRef.current?.contains(btn)) return null;
    const [r, c] = (btn.dataset.rc ?? '').split(',').map(Number);
    return Number.isFinite(r) && Number.isFinite(c) ? [r, c] : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (completedRef.current) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    try {
      // Capture so a drag that leaves the grid still ends on pointerup here.
      gridRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer (test driver, some assistive tech) has no id to
      // capture; the drag still works while it stays over the grid.
    }
    dragging.current = false;
    setAnchor(cell);
    setCursor(cell);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!anchor) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    if (!same(cell, anchor)) dragging.current = true;
    if (!same(cell, cursor)) setCursor(cell);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!anchor) return;
    try {
      gridRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Capture may already be gone (pointercancel); nothing to release.
    }
    const end = cellFromPoint(e.clientX, e.clientY) ?? cursor ?? anchor;
    setAnchor(null);
    setCursor(null);
    if (dragging.current && !same(end, anchor)) {
      setPending(null);
      evaluate(anchor, end);
      return;
    }
    tapCell(anchor);
  };

  /** Tap-tap selection, shared by touch taps and the keyboard. */
  const tapCell = (cell: Cell): void => {
    if (completedRef.current) return;
    if (!pending) {
      setPending(cell);
      return;
    }
    if (same(pending, cell)) {
      setPending(null);
      return;
    }
    setPending(null);
    evaluate(pending, cell);
  };

  // What is lit right now: a drag run, or the pending first tap.
  const liveRun: Cell[] =
    anchor && cursor ? (cellsBetween(anchor, cursor) ?? [anchor]) : pending ? [pending] : [];
  const liveKeys = new Set(liveRun.map(key));

  // Letter size scales down with the grid so 12×12 still fits a tablet in
  // portrait. Cells stay square; at 6×6 they are comfortably over 44 px.
  const letterSize = round.size <= 6 ? 'text-2xl sm:text-3xl' : round.size <= 8 ? 'text-xl sm:text-2xl' : round.size <= 10 ? 'text-lg sm:text-xl' : 'text-base sm:text-lg';

  return (
    <div className="w-full max-w-2xl select-none">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 text-rose-900 dark:text-rose-100">
        <h2 className="font-display text-lg font-bold sm:text-xl">
          {round.source === 'class' ? (
            <>
              <span aria-hidden>📝 </span>From your word list
            </>
          ) : (
            <>
              Level <span className="text-rose-600 dark:text-rose-300">{level}</span>
            </>
          )}
        </h2>
        <div className="flex items-baseline gap-4 text-sm text-rose-800/80 dark:text-rose-200/80">
          <span>
            Found <b className="font-mono text-rose-900 dark:text-rose-50">{found.size}/{total}</b>
          </span>
          <span>
            Oops <b className="font-mono text-rose-900 dark:text-rose-50">{wrong}</b>
          </span>
        </div>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={`Letter grid, ${round.size} by ${round.size}`}
        className="mx-auto grid w-full gap-1 rounded-2xl bg-white/80 p-2 shadow-[0_10px_30px_-10px_rgba(251,113,133,0.45)] sm:gap-1.5 sm:p-3 dark:bg-zinc-900/80"
        style={{
          gridTemplateColumns: `repeat(${round.size}, minmax(0, 1fr))`,
          touchAction: 'none',
          maxWidth: `${round.size * 56}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setAnchor(null);
          setCursor(null);
        }}
      >
        {round.grid.map((row, r) =>
          row.map((letter, c) => {
            const cell: Cell = [r, c];
            const k = key(cell);
            const foundColour = foundColourOf(cell);
            const isLive = liveKeys.has(k);
            const isFlash = flash.has(k);
            const tone = isFlash
              ? 'bg-rose-600 text-white'
              : isLive
                ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500'
                : (foundColour ?? 'bg-rose-50 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100');
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                data-rc={k}
                aria-label={`${letter}, row ${r + 1}, column ${c + 1}`}
                aria-selected={isLive}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tapCell(cell);
                  }
                }}
                className={`chrome-focus flex aspect-square items-center justify-center rounded-lg font-display font-bold leading-none transition-colors duration-100 ${letterSize} ${tone}`}
              >
                {letter}
              </button>
            );
          }),
        )}
      </div>

      {/* The tray: the words to find, crossed off as they are found. */}
      <aside className="mt-5 rounded-2xl border border-rose-200 bg-white/70 p-4 dark:border-rose-900 dark:bg-zinc-900/70">
        <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-rose-500">
          {remaining === 0 ? 'All found!' : `Find ${remaining === total ? 'these' : `${remaining} more`}`}
        </h3>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Words to find">
          {round.placements.map((p) => {
            const idx = found.get(p.word);
            const done = idx !== undefined;
            return (
              <li
                key={p.word}
                className={`rounded-full px-3 py-1.5 font-display text-base font-bold ${
                  done
                    ? `${FOUND_COLOURS[idx % FOUND_COLOURS.length]} line-through decoration-2`
                    : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100'
                }`}
                aria-label={done ? `${p.word}, found` : p.word}
              >
                {p.word}
              </li>
            );
          })}
        </ul>
      </aside>

      <p className="mt-3 text-center text-xs text-rose-800/70 dark:text-rose-200/70">
        Drag across a word, or tap its first letter and then its last.
      </p>
    </div>
  );
}
