'use client';

// Waffle Sudoku — the board, the digit pad, and the rules of touching them.
//
// One puzzle per mount. The shell hands in a PuzzleSpec (from the ladder) and
// a seed; this component generates the waffle in an effect behind a "Cakey is
// baking your waffle…" beat, runs the solve, and calls onComplete exactly once
// with a SessionSummary when the last square goes in.
//
// THREE RULES THAT SHAPE EVERYTHING BELOW
//
//  1. WRONG DIGITS NEVER STICK. Tap a 4 where the answer is 7 and the 4 shakes,
//     crumbles and is gone; the square is blank again. There is no red digit
//     sitting on the board waiting to be found later, because for a six-year-
//     old that is not a puzzle state, it is a trap. The slip is counted (it
//     costs efficiency) but the board only ever shows givens and correct
//     placements. Consequence: "Erase" has nothing to erase but pencil notes,
//     and that is all it does.
//
//  2. A HINT COSTS EXACTLY A WRONG (summary.ts). It fills the selected square,
//     or the first square that has only one candidate, or failing that the
//     first blank — so it always teaches the easiest available move.
//
//  3. NO CLOCK. Nothing here reads the time except sessionStart for the
//     summary's session_ms.
//
// Every random decision is the generator's, seeded by the shell; this file
// never calls Math.random.
//
// Look: the board is a waffle in a cake tin on a counter, not a card on a
// gradient (art-direction §C, DESIGN.md "the edtech worksheet with a skin").
// Cell states are ROLES, never hues: selection is travel (sky — "where I am"),
// hints and completed boxes are grow (mint), a slip flashes act (rose), givens
// are baked into the tin (cream ground, dark ink, no lift).

import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GamecakesMascot from '@/components/GamecakesMascot';
import { CandyButton } from '@/components/ui/CandyButton';
import type { SessionSummary } from '@/lib/games/phaser/session';
import { playPadPress, playTap, playWin, playWrong } from '@/lib/games/shared/sounds';
import { generateForSpec } from '@/lib/games/sudoku/generate';
import type { PuzzleSpec } from '@/lib/games/sudoku/ladder';
import { candidates, popcount } from '@/lib/games/sudoku/solver';
import { buildSudokuSummary, isCleanSolve } from '@/lib/games/sudoku/summary';
import { type Puzzle, SPECS, peersOf, tablesFor } from '@/lib/games/sudoku/types';
import { hapticSuccess, hapticTap, hapticWrong } from '@/lib/haptics';
import { WAFFLE_SUDOKU_LINES, waffleWinLine } from '@/lib/town/cakey-lines';

type Phase = 'baking' | 'solving' | 'done';

const WRONG_FLASH_MS = 350;
/** Beat between the last square and the overlay, so the win is seen. */
const CELEBRATE_MS = 1100;

const INK_GIVEN = '#451a03';
const INK_PLACED = '#e11d48';
const INK_HINT = '#047857';
const GROOVE = '#cf9a52';
const CHOCOLATE = '#6b3f1d';

interface WrongFlash {
  cell: number;
  digit: number;
  key: number;
}

export default function SudokuGame({
  spec,
  seed,
  onComplete,
}: {
  /** Must be referentially stable across renders (the shell memoises it on
   *  the score) — a fresh object per render would re-bake the waffle. */
  spec: PuzzleSpec;
  seed: number;
  onComplete: (s: SessionSummary, outcome: { clean: boolean }) => void;
}) {
  const n = spec.size;
  const gs = SPECS[n];

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [cells, setCells] = useState<Uint8Array>(() => new Uint8Array(0));
  /** Pencil marks, one bit per digit. 9×9 only; stays all-zero otherwise. */
  const [notes, setNotes] = useState<Uint16Array>(() => new Uint16Array(0));
  /** 1 where a hint filled the square. */
  const [hinted, setHinted] = useState<Uint8Array>(() => new Uint8Array(0));
  const [selected, setSelected] = useState<number | null>(null);
  /** Stamp-first flow: a digit picked before a square (kids do both orders). */
  const [pendingDigit, setPendingDigit] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [wrongFlash, setWrongFlash] = useState<WrongFlash | null>(null);
  const [phase, setPhase] = useState<Phase>('baking');
  const [cakeyLine, setCakeyLine] = useState<string>(WAFFLE_SUDOKU_LINES.open);
  const [statusNote, setStatusNote] = useState<string>('');

  const wrongRef = useRef(0);
  const hintsRef = useRef(0);
  const sessionStartRef = useRef(0);
  const resolvedRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  const doneTimerRef = useRef<number | null>(null);

  // ---- Bake the waffle. Deferred a tick so the placeholder paints first and
  // the generator (sub-3 ms measured, but still) never blocks a click. ----
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      const p = generateForSpec(spec, seed);
      if (cancelled) return;
      if (process.env.NODE_ENV !== 'production') {
        console.info(`[sudoku] seed ${seed} · tier ${spec.tier} · ${p.size}×${p.size} · ${p.givensCount} givens · ${p.technique}`);
      }
      sessionStartRef.current = Date.now();
      setPuzzle(p);
      setCells(new Uint8Array(p.givens));
      setNotes(new Uint16Array(p.givens.length));
      setHinted(new Uint8Array(p.givens.length));
      setPhase('solving');
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [spec, seed]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
    },
    [],
  );

  // ---- Derived ----
  const remaining = useMemo(() => {
    let k = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i] === 0) k++;
    return k;
  }, [cells]);

  /** How many times each digit is on the board. A digit at n is finished, and
   *  its pad chip goes inert — a solving aid dressed as a state. */
  const digitCounts = useMemo(() => {
    const c = new Array<number>(n + 1).fill(0);
    for (let i = 0; i < cells.length; i++) c[cells[i]]++;
    return c;
  }, [cells, n]);

  const completedBoxes = useMemo(() => {
    const done = new Set<number>();
    if (cells.length === 0) return done;
    const { units } = tablesFor(gs);
    const boxes = units.slice(2 * n);
    boxes.forEach((box, b) => {
      if (box.every((i) => cells[i] !== 0)) done.add(b);
    });
    return done;
  }, [cells, gs, n]);

  const peerSet = useMemo(() => {
    if (selected == null) return null;
    return new Set(peersOf(gs, selected));
  }, [gs, selected]);

  /** The digit to echo across the board: the selected square's, else the
   *  pending stamp. */
  const echoDigit = selected != null && cells[selected] ? cells[selected] : pendingDigit;

  // ---- Completion ----
  const finish = useCallback(() => {
    if (!puzzle || resolvedRef.current) return;
    resolvedRef.current = true;
    setPhase('done');
    setSelected(null);
    setPendingDigit(null);
    setCakeyLine(waffleWinLine(puzzle.size));
    setStatusNote('Waffle done!');
    playWin();
    hapticSuccess();
    const outcome = {
      blanks: puzzle.blanks,
      wrong: wrongRef.current,
      hints: hintsRef.current,
      sessionStart: sessionStartRef.current,
      size: puzzle.size,
      tier: spec.tier,
    };
    doneTimerRef.current = window.setTimeout(() => {
      onComplete(buildSudokuSummary(outcome), { clean: isCleanSolve(outcome) });
    }, CELEBRATE_MS);
  }, [puzzle, spec.tier, onComplete]);

  const clearPeerNotes = useCallback(
    (i: number, d: number) => {
      setNotes((prev) => {
        if (prev.length === 0) return prev;
        const nx = new Uint16Array(prev);
        nx[i] = 0;
        for (const j of peersOf(gs, i)) nx[j] &= ~(1 << d);
        return nx;
      });
    },
    [gs],
  );

  // ---- Placing ----
  const placeDigit = useCallback(
    (i: number, d: number) => {
      if (phase !== 'solving' || !puzzle) return;
      if (puzzle.givens[i] !== 0 || cells[i] !== 0) return;
      if (notesMode && n === 9) {
        setNotes((prev) => {
          const nx = new Uint16Array(prev);
          nx[i] ^= 1 << d;
          return nx;
        });
        playTap();
        hapticTap();
        return;
      }
      if (puzzle.solution[i] === d) {
        const next = new Uint8Array(cells);
        next[i] = d;
        setCells(next);
        clearPeerNotes(i, d);
        setStatusNote('');
        playTap();
        hapticTap();
        // A stamp that is now used up stops being the pending one.
        if (digitCounts[d] + 1 >= n) setPendingDigit((p) => (p === d ? null : p));
        if (!next.includes(0)) finish();
      } else {
        // Never sticks. Count it, show it leave, say something kind.
        wrongRef.current += 1;
        setWrongFlash({ cell: i, digit: d, key: Date.now() });
        setCakeyLine(WAFFLE_SUDOKU_LINES.wrong);
        setStatusNote(`Not a ${d} — try again.`);
        playWrong();
        hapticWrong();
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setWrongFlash(null), WRONG_FLASH_MS);
      }
    },
    [phase, puzzle, cells, notesMode, n, clearPeerNotes, digitCounts, finish],
  );

  const onCellTap = useCallback(
    (i: number) => {
      if (phase !== 'solving' || !puzzle) return;
      if (puzzle.givens[i] !== 0) return; // baked in — not a control
      if (pendingDigit != null && cells[i] === 0) {
        setSelected(i);
        placeDigit(i, pendingDigit);
        return;
      }
      setSelected(i);
      hapticTap();
    },
    [phase, puzzle, pendingDigit, cells, placeDigit],
  );

  const onDigitTap = useCallback(
    (d: number) => {
      if (phase !== 'solving' || !puzzle) return;
      if (digitCounts[d] >= n) return; // inert chip
      playPadPress();
      if (selected != null && cells[selected] === 0 && puzzle.givens[selected] === 0) {
        placeDigit(selected, d);
        return;
      }
      setPendingDigit((p) => (p === d ? null : d));
    },
    [phase, puzzle, digitCounts, n, selected, cells, placeDigit],
  );

  const hint = useCallback(() => {
    if (phase !== 'solving' || !puzzle) return;
    let target = selected != null && cells[selected] === 0 ? selected : -1;
    if (target < 0) {
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] === 0 && popcount(candidates(gs, cells, i)) === 1) {
          target = i;
          break;
        }
      }
    }
    if (target < 0) target = cells.indexOf(0);
    if (target < 0) return;
    hintsRef.current += 1;
    const d = puzzle.solution[target];
    const next = new Uint8Array(cells);
    next[target] = d;
    setCells(next);
    setHinted((prev) => {
      const h = new Uint8Array(prev);
      h[target] = 1;
      return h;
    });
    clearPeerNotes(target, d);
    setSelected(target);
    setPendingDigit(null);
    setCakeyLine(WAFFLE_SUDOKU_LINES.hint);
    setStatusNote(`Hint: ${d} goes in row ${Math.floor(target / n) + 1}, column ${(target % n) + 1}.`);
    playTap();
    hapticTap();
    if (!next.includes(0)) finish();
  }, [phase, puzzle, selected, cells, gs, n, clearPeerNotes, finish]);

  /** Notes only — a wrong digit was never on the board to erase. */
  const erase = useCallback(() => {
    if (phase !== 'solving' || selected == null) return;
    setNotes((prev) => {
      if (prev.length === 0 || prev[selected] === 0) return prev;
      const nx = new Uint16Array(prev);
      nx[selected] = 0;
      return nx;
    });
    playTap();
    hapticTap();
  }, [phase, selected]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (phase !== 'solving') return;
      const k = e.key;
      if (k.length === 1 && k >= '1' && k <= String(n)) {
        e.preventDefault();
        if (selected != null) placeDigit(selected, Number(k));
        return;
      }
      const from = selected ?? 0;
      let r = Math.floor(from / n);
      let c = from % n;
      let moved = true;
      if (k === 'ArrowUp') r = Math.max(0, r - 1);
      else if (k === 'ArrowDown') r = Math.min(n - 1, r + 1);
      else if (k === 'ArrowLeft') c = Math.max(0, c - 1);
      else if (k === 'ArrowRight') c = Math.min(n - 1, c + 1);
      else moved = false;
      if (moved) {
        e.preventDefault();
        setSelected(r * n + c);
        return;
      }
      if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault();
        erase();
        return;
      }
      if ((k === 'n' || k === 'N') && n === 9) {
        e.preventDefault();
        setNotesMode((m) => !m);
      }
    },
    [phase, n, selected, placeDigit, erase],
  );

  // ---- Render ----
  if (phase === 'baking' || !puzzle) {
    return (
      <div
        className="flex min-h-[320px] w-full flex-col items-center justify-center gap-3 text-center"
        aria-busy="true"
        aria-live="polite"
      >
        <GamecakesMascot size={72} />
        <div className="font-display text-xl font-bold text-amber-900">Cakey is baking your waffle…</div>
      </div>
    );
  }

  const { boxOfCell } = tablesFor(gs);
  const digits = Array.from({ length: n }, (_, k) => k + 1);
  const isNine = n === 9;
  const boardVars = {
    '--n': n,
    '--sudoku-tin-min': n === 9 ? '440px' : n === 6 ? '340px' : '288px',
  } as CSSProperties;

  return (
    <div className="flex w-full flex-col items-center gap-3" style={boardVars}>
      {/* ---- Cakey + goal ---- */}
      <div className="flex w-full items-end gap-2">
        <GamecakesMascot size={56} mood={phase === 'done' ? 'celebrate' : undefined} />
        <div className="sudoku-bubble relative flex-1 rounded-2xl px-4 py-2" style={{ background: '#fef3c7' }}>
          <div className="font-display text-base font-bold leading-snug text-stone-900">{cakeyLine}</div>
          <div className="text-xs font-semibold text-amber-900/80">
            Fill every row, column and box with 1–{n}. Each number once.
          </div>
        </div>
      </div>

      {/* ---- The tin ---- */}
      <div className={`sudoku-tin relative mx-auto w-full ${phase === 'done' ? 'sudoku-tin-win' : ''}`}>
        <span aria-hidden className="sudoku-lug sudoku-lug-l" />
        <span aria-hidden className="sudoku-lug sudoku-lug-r" />
        <div
          role="grid"
          tabIndex={0}
          aria-label={`${n} by ${n} waffle sudoku. ${remaining} squares to go.`}
          onKeyDown={onKeyDown}
          className="sudoku-board relative mx-auto grid w-full select-none outline-none"
          style={{
            gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
            border: `3px solid ${CHOCOLATE}`,
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {Array.from({ length: n }, (_, r) => (
            <div role="row" key={r} className="contents">
              {Array.from({ length: n }, (_, c) => {
                const i = r * n + c;
                const value = cells[i];
                const isGiven = puzzle.givens[i] !== 0;
                const isSelected = selected === i;
                const isPeer = !isSelected && peerSet?.has(i) === true;
                const isEcho = value !== 0 && echoDigit === value && !isSelected;
                const boxDone = completedBoxes.has(boxOfCell[i]);
                const flashing = wrongFlash?.cell === i;
                const rightThick = (c + 1) % gs.boxCols === 0 && c !== n - 1;
                const bottomThick = (r + 1) % gs.boxRows === 0 && r !== n - 1;
                const label = isGiven
                  ? `Row ${r + 1} column ${c + 1}, ${value}, given`
                  : value
                    ? `Row ${r + 1} column ${c + 1}, ${value}${hinted[i] ? ', from a hint' : ''}`
                    : `Row ${r + 1} column ${c + 1}, blank`;
                const overlays: string[] = [];
                // A warm neutral shade, not a hue: sky over the cream givens went
                // olive on the first render and read as mint. Amber-900 at 8%
                // deepens cream and tints white the same way and collides with
                // nothing — it is the selection's shadow along its lines.
                if (isPeer) overlays.push('linear-gradient(rgba(120,53,15,0.08), rgba(120,53,15,0.08))');
                if (isEcho) overlays.push('linear-gradient(rgba(251,191,36,0.40), rgba(251,191,36,0.40))');
                if (boxDone) overlays.push('linear-gradient(rgba(110,231,183,0.30), rgba(110,231,183,0.30))');
                const style: CSSProperties = {
                  borderRight: c === n - 1 ? 'none' : `${rightThick ? 3 : 1}px solid ${rightThick ? CHOCOLATE : GROOVE}`,
                  borderBottom: r === n - 1 ? 'none' : `${bottomThick ? 3 : 1}px solid ${bottomThick ? CHOCOLATE : GROOVE}`,
                  backgroundColor: isSelected ? '#e0f2fe' : isGiven ? '#fef3c7' : '#ffffff',
                  backgroundImage: overlays.length ? overlays.join(', ') : undefined,
                  boxShadow: isSelected ? 'inset 0 0 0 3px #0ea5e9' : hinted[i] ? 'inset 0 0 0 2px #6ee7b7' : undefined,
                  color: isGiven ? INK_GIVEN : hinted[i] ? INK_HINT : INK_PLACED,
                  cursor: isGiven || phase !== 'solving' ? 'default' : 'pointer',
                };
                return (
                  <div
                    key={c}
                    role="gridcell"
                    aria-label={label}
                    aria-selected={isSelected}
                    aria-disabled={isGiven || undefined}
                    onClick={() => onCellTap(i)}
                    className={`sudoku-cell relative flex aspect-square items-center justify-center font-display font-bold ${
                      flashing ? 'sudoku-cell-wrong' : ''
                    } ${boxDone ? 'sudoku-cell-boxdone' : ''}`}
                    style={style}
                  >
                    {value !== 0 ? (
                      <span className={`sudoku-digit ${hinted[i] ? 'sudoku-digit-hint' : ''}`}>{value}</span>
                    ) : flashing && wrongFlash ? (
                      <span key={wrongFlash.key} className="sudoku-digit sudoku-digit-wrong" aria-hidden>
                        {wrongFlash.digit}
                      </span>
                    ) : isNine && notes[i] ? (
                      <span className="sudoku-notes grid h-full w-full grid-cols-3 grid-rows-3 p-[6%]" aria-hidden>
                        {digits.map((d) => (
                          <span key={d} className="flex items-center justify-center leading-none text-stone-500">
                            {notes[i] & (1 << d) ? d : ''}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {phase === 'done' ? (
          <span aria-hidden className="sudoku-burst pointer-events-none absolute inset-0">
            {['🍬', '✨', '🍭', '✨', '🍬', '✨', '🍭', '✨'].map((g, k) => (
              <span key={k} className="sudoku-sprinkle absolute text-2xl" style={{ '--k': k } as CSSProperties}>
                {g}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {/* ---- Status ---- */}
      <div aria-live="polite" className="min-h-[1.25rem] text-center text-sm font-semibold text-amber-900">
        {phase === 'done' ? 'Waffle done!' : `${remaining} to go`}
        {notesMode && phase === 'solving' ? ' · ✏️ notes on' : ''}
        {statusNote ? <span className="sr-only"> {statusNote}</span> : null}
      </div>

      {/* ---- Digit pad: cookie stamps on the counter ---- */}
      <div
        role="group"
        aria-label="Digits"
        className="grid w-full gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {digits.map((d) => {
          const left = n - digitCounts[d];
          const done = left <= 0;
          const pending = pendingDigit === d;
          return (
            <button
              key={d}
              type="button"
              aria-label={`${d}, ${done ? 'all placed' : `${left} left`}`}
              aria-pressed={pending}
              aria-disabled={done || phase !== 'solving' || undefined}
              onClick={() => onDigitTap(d)}
              className={`sudoku-chip chrome-focus relative flex flex-col items-center justify-center rounded-2xl font-display font-bold transition-[transform,box-shadow] duration-100 ease-out ${
                done ? 'sudoku-chip-done' : 'active:scale-95'
              } ${pending ? 'sudoku-chip-pending' : ''}`}
              style={{ minHeight: 'max(56px, var(--min-tap-target))' }}
            >
              <span className="text-2xl leading-none sm:text-3xl">{d}</span>
              <span className="sudoku-badge mt-0.5 rounded-full px-1.5 text-[11px] font-bold leading-4">{done ? '✓' : left}</span>
            </button>
          );
        })}
      </div>

      {/* ---- Controls ---- */}
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <CandyButton role="earn" size="md" onClick={hint} disabled={phase !== 'solving'}>
          💡 Hint
        </CandyButton>
        {isNine ? (
          notesMode ? (
            <CandyButton role="travel" size="md" aria-pressed onClick={() => setNotesMode(false)} disabled={phase !== 'solving'}>
              ✏️ Notes on
            </CandyButton>
          ) : (
            <button
              type="button"
              aria-pressed={false}
              onClick={() => setNotesMode(true)}
              disabled={phase !== 'solving'}
              className="sudoku-chip chrome-focus inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 font-display text-base font-bold text-stone-800 transition-[transform,box-shadow] duration-100 ease-out active:scale-95"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              ✏️ Notes off
            </button>
          )
        ) : null}
        {isNine ? (
          <CandyButton
            role="exit"
            size="md"
            onClick={erase}
            disabled={phase !== 'solving' || selected == null || notes[selected] === 0}
          >
            ⌫ Erase notes
          </CandyButton>
        ) : null}
      </div>

      <style>{`
        /* The board is square, so height is what runs out: at 1280×900 a 4×4
           at the card's full 560px width pushed the digit pad below the fold.
           Cap the board's WIDTH by the viewport height (the shell overrides
           the var in fullscreen, where the header and back link are gone). */
        .sudoku-board { container-type: inline-size; }
        /* The floor is per size so a cell never drops under the 44px tap
           target on the 9×9 (440px tin → ~45px cells); a short window scrolls
           to the pad rather than serving thumb-sized squares. 4×4 and 6×6 have
           big cells at any of these widths. */
        .sudoku-tin {
          max-width: min(100%, var(--sudoku-board-max, calc(100dvh - 500px)));
          min-width: min(100%, var(--sudoku-tin-min, 288px));
        }
        .sudoku-bubble::before {
          content: ''; position: absolute; left: -8px; bottom: 12px;
          border-width: 6px 8px 6px 0; border-style: solid; border-color: transparent #fef3c7 transparent transparent;
        }
        .sudoku-tin {
          padding: 12px;
          border-radius: 24px;
          background: linear-gradient(to bottom, #fde68a, #fbbf24);
          border: 2px solid #e7c48a;
          box-shadow:
            inset 0 1.5px 0 0 rgb(255 255 255 / 0.6),
            inset 0 -2px 0 0 rgb(0 0 0 / 0.10),
            0 10px 15px -3px rgb(252 211 77 / 0.55);
          transition: transform 300ms ease-out;
        }
        .sudoku-lug {
          position: absolute; top: 50%; width: 14px; height: 44px; margin-top: -22px;
          background: linear-gradient(to bottom, #fde68a, #f59e0b);
          border: 2px solid #e7c48a; border-radius: 8px;
        }
        .sudoku-lug-l { left: -10px; border-right: none; border-radius: 8px 0 0 8px; }
        .sudoku-lug-r { right: -10px; border-left: none; border-radius: 0 8px 8px 0; }
        .sudoku-digit { font-size: calc(52cqw / var(--n)); line-height: 1; }
        .sudoku-notes { font-size: calc(26cqw / var(--n)); font-weight: 600; }
        .sudoku-digit-wrong { color: #e11d48; animation: sudoku-shake 220ms ease-in-out, sudoku-crumb 180ms ease-in 200ms forwards; }
        .sudoku-cell-wrong { animation: sudoku-border-pulse 300ms ease-out; }
        .sudoku-digit-hint { animation: sudoku-hint-in 300ms ease-out both; }
        .sudoku-cell-boxdone { animation: sudoku-box-pop 300ms ease-out; }
        .sudoku-tin-win { transform: translateY(-8px); }
        .sudoku-sprinkle {
          left: 50%; top: 50%; opacity: 0;
          animation: sudoku-sprinkle 900ms ease-out forwards;
          animation-delay: calc(var(--k) * 40ms);
        }
        .sudoku-chip {
          background: #fff; color: #171717;
          border: 2px solid #f3d9b0;
          box-shadow: 0 1px 2px rgb(0 0 0 / 0.05), 0 6px 10px -4px rgb(231 196 138 / 0.6);
          --ring-inner: var(--focus-dark); --ring-outer: var(--focus-light);
        }
        .sudoku-chip:active { box-shadow: 0 1px 2px rgb(0 0 0 / 0.05); }
        .sudoku-chip-pending { background: #e0f2fe; border-color: #0ea5e9; box-shadow: 0 0 0 3px #0ea5e9, 0 6px 10px -4px rgb(125 211 252 / 0.6); }
        .sudoku-chip-done { background: #e4e4e7; color: #3f3f46; border-color: rgb(0 0 0 / 0.08); box-shadow: none; cursor: not-allowed; }
        .sudoku-badge { background: #fef3c7; color: #78350f; }
        .sudoku-chip-done .sudoku-badge { background: #d4d4d8; color: #3f3f46; }
        .sudoku-chip-pending .sudoku-badge { background: #bae6fd; color: #082f49; }
        @keyframes sudoku-shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          50% { transform: translateX(6px); }
          75% { transform: translateX(-4px); }
        }
        @keyframes sudoku-crumb { to { transform: scale(0.6); opacity: 0; } }
        @keyframes sudoku-border-pulse {
          0% { box-shadow: inset 0 0 0 3px #e11d48; background-color: #fff1f2; }
          100% { box-shadow: inset 0 0 0 0 #e11d48; }
        }
        @keyframes sudoku-hint-in { from { opacity: 0.4; } to { opacity: 1; } }
        @keyframes sudoku-box-pop {
          0% { box-shadow: inset 0 0 0 0 #6ee7b7; }
          50% { box-shadow: inset 0 0 0 3px #6ee7b7; }
          100% { box-shadow: inset 0 0 0 0 #6ee7b7; }
        }
        @keyframes sudoku-sprinkle {
          0% { opacity: 1; transform: translate(-50%, -50%) rotate(calc(var(--k) * 45deg)) translateY(0) scale(0.6); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(calc(var(--k) * 45deg)) translateY(-46cqw) scale(1.2); }
        }
        @media (prefers-reduced-motion: reduce) {
          /* Every motion has a static alternative: the slip still shows and
             fades (a colour change, not a shake), boxes simply turn mint,
             the tin does not lift, sprinkles hold a ring. */
          .sudoku-digit-wrong { animation: sudoku-fade-out 350ms ease-out forwards; }
          .sudoku-cell-wrong { animation: none; box-shadow: inset 0 0 0 3px #e11d48; }
          .sudoku-digit-hint { animation: none; }
          .sudoku-cell-boxdone { animation: none; }
          .sudoku-tin { transition: none; }
          .sudoku-tin-win { transform: none; }
          .sudoku-sprinkle { animation: none; opacity: 0.9; transform: translate(-50%, -50%) rotate(calc(var(--k) * 45deg)) translateY(-40cqw); }
        }
        @keyframes sudoku-fade-out { to { opacity: 0; } }
      `}</style>
    </div>
  );
}
