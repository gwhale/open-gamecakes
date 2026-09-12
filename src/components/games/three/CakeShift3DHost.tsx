'use client';

// CakeShift3DHost — React wrapper for the Cake Shift (Tower of Hanoi) engine.
//
// The engine draws the stands and moves the layers; this component draws
// everything a kid READS: the one-line goal, the moves counter, par, the par
// meter, the hint budget, and Cakey's lines. It also maps the engine's beats
// onto the shared sound + haptic libraries and tells the shell when the tower
// is done. It never decides whether a move is legal — the engine asks the
// pure model for that.
//
// The round ends in the engine (the last layer lands) and is REPORTED here;
// the shell owns what happens next (the overlay, the attempts POST, the next
// tower's height), so this host stays mounted underneath and the finished,
// candle-lit cake is what the kid sees behind the end card.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { CandyButton } from '@/components/ui/CandyButton';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import GamecakesLogo from '@/components/GamecakesLogo';
import GamecakesMascot from '@/components/GamecakesMascot';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import {
  playBubble,
  playPadPress,
  playSwoop,
  playTap,
  playWin,
  playWrong,
} from '@/lib/games/shared/sounds';
import { hapticSuccess, hapticTap, hapticThump, hapticWrong } from '@/lib/haptics';
import { CAKE_SHIFT_LINES, pickLine } from '@/lib/town/cakey-lines';
import { minMoves } from '@/lib/games/hanoi/ladder';
import { CAKE_SHIFT_GLYPH, CAKE_SHIFT_NAME } from '@/lib/games/hanoi/name';
import type { Stand } from '@/lib/games/hanoi/state';
import type { HanoiEngine } from '@/lib/games/three/hanoi/types';

/** Hints per tower. Three is enough to get unstuck, few enough to matter. */
export const HINT_BUDGET = 3;
/** How long a Cakey line stays up. */
const LINE_MS = 4200;
/** Silence before Cakey wonders aloud. Once per tower. */
const IDLE_MS = 12_000;

export interface CakeShiftHostProps {
  layers: number;
  kidName?: string;
  gameSlug: string;
  backHref: string;
  backLabel?: string;
  /** The tower is solved. `moves` is the legal move count; `hints` how many
   *  the kid spent. Fired once per mount. */
  onComplete: (result: { moves: number; hints: number }) => void;
}

type LineKey = keyof typeof CAKE_SHIFT_LINES;

export default function CakeShift3DHost(props: CakeShiftHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HanoiEngine | null>(null);
  const createdRef = useRef(false);

  const isFullscreen = useIsFullscreen();
  const par = minMoves(props.layers);

  const [moves, setMoves] = useState(0);
  const [held, setHeld] = useState<Stand | null>(null);
  const [hintsLeft, setHintsLeft] = useState(HINT_BUDGET);
  const [over, setOver] = useState(false);
  const [line, setLine] = useState<{ text: string; key: number } | null>(null);

  const hintsUsedRef = useRef(0);
  const lastLineIdx = useRef<Partial<Record<LineKey, number>>>({});
  const lineTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const idleSpoken = useRef(false);
  const overRef = useRef(false);
  const onCompleteRef = useRef(props.onComplete);
  onCompleteRef.current = props.onComplete;

  const say = useCallback((key: LineKey) => {
    const pool = CAKE_SHIFT_LINES[key];
    const picked = pickLine(pool, lastLineIdx.current[key] ?? -1);
    lastLineIdx.current[key] = picked.index;
    setLine({ text: picked.line, key: Date.now() });
    if (lineTimer.current) window.clearTimeout(lineTimer.current);
    lineTimer.current = window.setTimeout(() => setLine(null), LINE_MS);
  }, []);
  const sayRef = useRef(say);
  sayRef.current = say;

  const armIdle = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (idleSpoken.current || overRef.current) return;
    idleTimer.current = window.setTimeout(() => {
      if (overRef.current || idleSpoken.current) return;
      idleSpoken.current = true;
      sayRef.current('idle');
    }, IDLE_MS);
  }, []);

  // ---- iPad touch-lock (same as the crane) ----
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow, htmlTouch: html.style.touchAction, htmlOver: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow, bodyTouch: body.style.touchAction, bodyOver: body.style.overscrollBehavior,
      bodyPos: body.style.position, bodyW: body.style.width, bodyH: body.style.height,
    };
    html.style.overflow = 'hidden'; html.style.touchAction = 'none'; html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden'; body.style.touchAction = 'none'; body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed'; body.style.width = '100%'; body.style.height = '100%';
    const block = (e: TouchEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, input, a, [role="dialog"]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchmove', block);
      html.style.overflow = prev.htmlOverflow; html.style.touchAction = prev.htmlTouch; html.style.overscrollBehavior = prev.htmlOver;
      body.style.overflow = prev.bodyOverflow; body.style.touchAction = prev.bodyTouch; body.style.overscrollBehavior = prev.bodyOver;
      body.style.position = prev.bodyPos; body.style.width = prev.bodyW; body.style.height = prev.bodyH;
    };
  }, []);

  // ---- mount the engine ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;

    (async () => {
      const [THREE, mod] = await Promise.all([import('three'), import('@/lib/games/three/hanoi/engine')]);
      if (destroyed || !containerRef.current) return;

      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      let firstMoveSaid = false;

      const engine = mod.createCakeShiftEngine(
        THREE,
        containerRef.current,
        { layers: props.layers, reducedMotion },
        {
          onMove: (s) => {
            setMoves(s.moves);
            if (s.moves === 1 && !firstMoveSaid) { firstMoveSaid = true; sayRef.current('firstMove'); }
            armIdle();
          },
          onHeld: (s) => { setHeld(s); if (s !== null) armIdle(); },
          onIllegal: () => sayRef.current('illegal'),
          onHalfway: () => sayRef.current('halfway'),
          onWin: (finalMoves) => {
            overRef.current = true;
            setOver(true);
            if (idleTimer.current) window.clearTimeout(idleTimer.current);
            sayRef.current(finalMoves <= par ? 'winPar' : 'winOver');
            onCompleteRef.current({ moves: finalMoves, hints: hintsUsedRef.current });
          },
          onSfx: (name) => {
            if (name === 'lift') { playSwoop(); hapticTap(); }
            else if (name === 'settle') playTap();
            else if (name === 'land') { playPadPress(); hapticThump(); }
            else if (name === 'wrong') { playWrong(); hapticWrong(); }
            else if (name === 'hint') playBubble();
            else if (name === 'win') { playWin(); hapticSuccess(); }
          },
        },
      );

      if (destroyed) { engine.dispose(); return; }
      engineRef.current = engine;
      armIdle();
    })();

    return () => {
      destroyed = true;
      if (lineTimer.current) window.clearTimeout(lineTimer.current);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (engineRef.current) { engineRef.current.dispose(); engineRef.current = null; }
      createdRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.resize(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  useEffect(() => {
    const onResize = (): void => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const onHint = useCallback(() => {
    if (hintsLeft <= 0 || over) return;
    const shown = engineRef.current?.hint() ?? false;
    if (!shown) return;
    hintsUsedRef.current += 1;
    setHintsLeft((h) => h - 1);
    say('hint');
    armIdle();
  }, [hintsLeft, over, say, armIdle]);

  const onReset = useCallback(() => {
    if (over) return;
    engineRef.current?.reset();
    setMoves(0);
    setHeld(null);
    playTap();
    armIdle();
  }, [over, armIdle]);

  // ---- keyboard: 1/2/3 tap the stands, H hints, R resets ----
  useEffect(() => {
    if (over) return;
    const down = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === '1' || k === '2' || k === '3') { e.preventDefault(); engineRef.current?.tapStand((Number(k) - 1) as Stand); }
      else if (k === 'h') { e.preventDefault(); onHint(); }
      else if (k === 'r') { e.preventDefault(); onReset(); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [over, onHint, onReset]);

  // ---- par meter ----
  // The track represents max(par, moves). Up to par it fills mint; past par
  // the mint section shrinks as amber takes the rest, so the mint fraction IS
  // the score (par / actual) and the bar never stops filling and never turns
  // red. Running out of good moves must never feel like failing.
  const span = Math.max(par, moves);
  const mintPct = (Math.min(moves, par) / span) * 100;
  const amberPct = (Math.max(0, moves - par) / span) * 100;
  const overPar = moves > par;

  const title = `${CAKE_SHIFT_GLYPH} ${CAKE_SHIFT_NAME}`;

  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-[#e0f2fe] select-none'
          : 'flex flex-1 flex-col items-center overscroll-none p-3 select-none sm:p-5'
      }
    >
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
          <ChromeNavLink href={props.backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
        </div>
      ) : (
        <header className="flex w-full max-w-4xl items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-sky-600">{title}</div>
              <h1 className="font-display text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                {props.kidName ? `${props.kidName}'s Puzzle Island` : 'Puzzle Island'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug={props.gameSlug} kidName={props.kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
            <ChromeNavLink href={props.backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
          </div>
        </header>
      )}

      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-[#e0f2fe]'
            : 'relative mt-3 aspect-[4/3] w-full max-w-4xl overflow-hidden rounded-[1.35rem] border-[6px] border-white bg-[#e0f2fe] shadow-[0_20px_55px_rgba(14,116,144,0.22)]'
        }
        aria-label={`${CAKE_SHIFT_NAME} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* Top row: moves left, the goal centre, par right. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span
            className="rounded-full border-2 border-white/80 bg-zinc-950/70 px-4 py-2 font-mono text-base font-black tabular-nums text-white shadow-lg backdrop-blur-sm sm:text-lg"
            aria-live="polite"
            aria-label={`${moves} moves`}
          >
            Moves <span className="ml-1">{moves}</span>
          </span>
          <span
            className="rounded-full border-2 border-white/80 px-4 py-2 font-mono text-base font-black tabular-nums shadow-lg sm:text-lg"
            style={{ background: 'linear-gradient(to bottom, var(--earn-from), var(--earn-to))', color: 'var(--earn-ink)' }}
            aria-label={`Best is ${par} moves`}
          >
            Best <span className="ml-1">{par}</span>
          </span>
        </div>

        {/* The goal, once. Fades out after the first move — the bump teaches
            the rule, this only says where the cake has to go. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3 transition-opacity duration-500"
          style={{ opacity: moves === 0 && !over ? 1 : 0 }}
          aria-hidden={moves !== 0}
        >
          <span className="rounded-full border-2 border-white bg-white/85 px-5 py-2 text-center font-display text-base font-bold text-zinc-900 shadow-md backdrop-blur-sm sm:text-xl">
            Move the whole cake to the last stand.
          </span>
        </div>

        {/* Held cue for screen readers + a soft hint under the counter. */}
        <span className="sr-only" aria-live="polite">
          {held !== null ? `Holding the top layer from stand ${held + 1}. Tap another stand to move it.` : ''}
        </span>

        {/* Cakey, bottom-left. */}
        {line ? (
          <div
            key={line.key}
            className="pointer-events-none absolute bottom-16 left-3 z-20 flex max-w-[78%] items-end gap-2 sm:bottom-20 sm:max-w-sm"
            style={{ animation: 'cakey-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            role="status"
            aria-live="polite"
          >
            <GamecakesMascot size={56} mood="happy" />
            <div className="relative rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-md sm:text-base">
              {line.text}
              <span aria-hidden className="absolute -left-1.5 bottom-3 h-3 w-3 rotate-45 border-b border-l border-amber-200 bg-amber-50" />
            </div>
          </div>
        ) : null}

        {/* Bottom bar: the par meter, then Hint + Reset. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
          <div
            className="pointer-events-none h-3.5 w-full max-w-md overflow-hidden rounded-full border-2 border-white/90 bg-zinc-950/35 shadow-inner backdrop-blur-sm"
            role="progressbar"
            aria-label="Moves against par"
            aria-valuemin={0}
            aria-valuemax={span}
            aria-valuenow={moves}
          >
            <div className="flex h-full w-full">
              <div
                className="h-full transition-[width] duration-200 ease-out"
                style={{ width: `${mintPct}%`, background: 'linear-gradient(to right, var(--grow-from), var(--grow-to))' }}
              />
              <div
                className="h-full transition-[width] duration-200 ease-out"
                style={{ width: `${amberPct}%`, background: 'linear-gradient(to right, var(--earn-from), var(--earn-to))' }}
              />
            </div>
          </div>
          {overPar ? (
            <span className="pointer-events-none rounded-full bg-zinc-950/55 px-3 py-1 font-display text-[11px] font-bold text-white/90 backdrop-blur-sm">
              {moves - par} over par — keep going, it still counts
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <CandyButton
              role="travel"
              size="md"
              shape="pill"
              onClick={onHint}
              disabled={hintsLeft <= 0 || over}
              aria-label={`Hint, ${hintsLeft} left`}
            >
              💡 Hint · {hintsLeft}
            </CandyButton>
            <ChromeNavButton onClick={onReset} variant="dark" size="md" disabled={over || moves === 0}>
              ↺ Reset
            </ChromeNavButton>
          </div>
        </div>
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <ChromeNavLink href={props.backHref} variant="dark" size="md">{props.backLabel ?? '← Back to Map'}</ChromeNavLink>
          <p className="max-w-md text-center text-xs text-zinc-500">
            Tap a stand to pick up its top layer, then tap another stand to set it down — or drag it across.
            Big layers never go on little ones. The candles show where a layer can land.
          </p>
        </div>
      )}

      <style>{`@keyframes cakey-pop {0%{transform:scale(0.7) translateY(8px);opacity:0;}100%{transform:scale(1) translateY(0);opacity:1;}}
        @media (prefers-reduced-motion: reduce){@keyframes cakey-pop {0%{opacity:0;}100%{opacity:1;}}}`}</style>
    </main>
  );
}
