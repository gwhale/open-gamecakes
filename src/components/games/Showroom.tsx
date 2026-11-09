'use client';

// The showroom at the top of the All Games bakery: one recipe book under a
// spotlight on a turntable, the next and previous books peeking in from the
// sides, and a nameplate with a Play button underneath — the kart-select
// screen from a racing game, in cake.
//
// Spin it with the arrow buttons, a swipe (any pointer drag past 40px), or
// the arrow keys while the stage has focus. Tapping a side book brings it to
// the front instead of opening it; only the featured book is a real link.
//
// The 3D placement, the idle sway and the landing squash live in globals.css
// (`.showroom-*`) because they need pseudo-elements, keyframes and a
// reduced-motion branch that inline styles cannot express.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import RecipeBook from '@/components/games/RecipeBook';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import type { GameSubject } from '@/lib/games/registry';

export interface ShowroomGame {
  slug: string;
  label: string;
  glyph: string;
  subject: GameSubject;
  href: string;
  /** Unlock price when this kid has not bought the game yet. */
  lockedCost?: number;
}

const SUBJECT_LABEL: Record<GameSubject, string> = {
  math: 'Math',
  reading: 'Words',
  logic: 'Logic',
  music: 'Music',
};

/** Tinted chip per subject: candy fill, matching 1px border, deep ink of its
 *  own hue — the chip recipe from DESIGN.md. Never white text on a light chip. */
const SUBJECT_CHIP: Record<GameSubject, string> = {
  math: 'bg-rose-100 border-rose-200 text-rose-900',
  reading: 'bg-amber-100 border-amber-200 text-amber-900',
  logic: 'bg-emerald-100 border-emerald-200 text-emerald-900',
  music: 'bg-violet-100 border-violet-200 text-violet-900',
};

// White candy with a strawberry glow for the arrows, like the hangman letter
// keys; rose `act` for Play and amber `earn` when the book still costs tokens.
const ARROW_VARS = {
  '--c-from': '#ffffff',
  '--c-to': '#fff1f2',
  '--c-ink': '#881337',
  '--c-glow': 'rgba(251, 113, 133, 0.35)',
} as React.CSSProperties;
const ACT_VARS = {
  '--c-from': 'var(--act-from)',
  '--c-to': 'var(--act-to)',
  '--c-ink': 'var(--act-ink)',
  '--c-glow': 'var(--act-glow)',
} as React.CSSProperties;
const EARN_VARS = {
  '--c-from': 'var(--earn-from)',
  '--c-to': 'var(--earn-to)',
  '--c-ink': 'var(--earn-ink)',
  '--c-glow': 'var(--earn-glow)',
} as React.CSSProperties;

/** Where a book sits relative to the featured one: 0 is front and centre,
 *  ±1 peek in from the sides, ±2 are the next ones waiting out of sight, and
 *  'x' is off-stage entirely. */
function positionOf(i: number, current: number, count: number): string {
  let d = (((i - current) % count) + count) % count;
  if (d > count / 2) d -= count;
  return Math.abs(d) <= 2 ? String(d) : 'x';
}

export default function Showroom({
  games,
  initialSlug,
}: {
  games: readonly ShowroomGame[];
  /** Which book starts under the spotlight; the first one when unset or unknown. */
  initialSlug?: string;
}): React.ReactElement | null {
  const count = games.length;
  const startAt = Math.max(0, games.findIndex((g) => g.slug === initialSlug));
  const [current, setCurrent] = useState(startAt);
  // True right after a spin so the featured book does its landing squash;
  // false on first paint so the page is still at rest when it loads.
  const [landed, setLanded] = useState(false);
  const dragStart = useRef<number | null>(null);

  const go = useCallback(
    (to: number): void => {
      if (count === 0) return;
      setCurrent(((to % count) + count) % count);
      setLanded(true);
    },
    [count],
  );

  // Arrow keys spin the stage while it (or anything in it) has focus.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    };
    stage.addEventListener('keydown', onKey);
    return () => stage.removeEventListener('keydown', onKey);
  }, [current, go]);

  if (count === 0) return null;
  const featured = games[current];
  const priced = featured.lockedCost !== undefined;

  return (
    <div className="showroom relative isolate overflow-hidden rounded-[28px]">
      {/* Glass-case top edge: a thin run of awning stripe, and the shade under it. */}
      <div aria-hidden className="showroom-case-top" />
      <div aria-hidden className="showroom-spot" />

      <div
        ref={stageRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured games"
        tabIndex={0}
        className="showroom-stage relative outline-none"
        onPointerDown={(e) => { dragStart.current = e.clientX; }}
        onPointerCancel={() => { dragStart.current = null; }}
        onPointerUp={(e) => {
          if (dragStart.current === null) return;
          const dx = e.clientX - dragStart.current;
          dragStart.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? current + 1 : current - 1);
        }}
      >
        <div aria-hidden className="showroom-turntable" />
        <div className="showroom-track">
          {games.map((g, i) => {
            const pos = positionOf(i, current, count);
            const front = pos === '0';
            return (
              <div
                key={g.slug}
                data-pos={pos}
                className={'showroom-slot' + (front && landed ? ' is-landing' : '')}
                aria-hidden={!front}
              >
                <div className="showroom-book">
                  <RecipeBook
                    slug={g.slug}
                    label={g.label}
                    glyph={g.glyph}
                    href={g.href}
                    size="lg"
                    lockedCost={g.lockedCost}
                  />
                  {/* Floor reflection on the turntable: the same book, flipped and faded. */}
                  <div aria-hidden inert className="showroom-reflect">
                    <RecipeBook
                      slug={g.slug}
                      label={g.label}
                      glyph={g.glyph}
                      href={g.href}
                      size="lg"
                      lockedCost={g.lockedCost}
                    />
                  </div>
                </div>
                {/* Side books spin to the front instead of opening. The overlay
                    is a real button so it is announced and keyboard-reachable
                    only while the book is actually visible at a side. */}
                {!front && (pos === '1' || pos === '-1') && (
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-pointer rounded-2xl bg-transparent"
                    aria-label={`Show ${g.label}`}
                    onClick={() => go(i)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Previous game"
          onClick={() => go(current - 1)}
          className="showroom-arrow candy-shell chrome-focus left-2 sm:left-3"
          style={ARROW_VARS}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Next game"
          onClick={() => go(current + 1)}
          className="showroom-arrow candy-shell chrome-focus right-2 sm:right-3"
          style={ARROW_VARS}
        >
          →
        </button>
      </div>

      {/* Nameplate: name, subject, where we are in the line-up, and Play. */}
      <div className="relative z-10 grid grid-cols-1 items-center gap-3 px-4 pb-4 text-amber-950 sm:grid-cols-[1fr_auto] sm:gap-4 sm:px-5 sm:pb-5">
        <div className="min-w-0">
          <div
            aria-live="polite"
            className="font-display text-2xl font-bold leading-tight sm:text-3xl"
          >
            {featured.label}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={'rounded-full border px-2.5 py-0.5 text-xs font-bold ' + SUBJECT_CHIP[featured.subject]}>
              {SUBJECT_LABEL[featured.subject]}
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-amber-900">
              {current + 1} of {count}
            </span>
            <span aria-hidden className="hidden items-center gap-1 sm:flex">
              {games.map((g, i) => (
                <i
                  key={g.slug}
                  className={
                    'block h-1.5 w-1.5 rounded-full transition-[transform,background-color] duration-150 ' +
                    (i === current ? 'scale-150 bg-rose-500' : 'bg-rose-200')
                  }
                />
              ))}
            </span>
          </div>
        </div>
        <Link
          href={featured.href}
          className="candy-shell inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-8 py-3 font-display text-xl font-bold transition-[transform,box-shadow,filter] duration-100 ease-out hover:brightness-105 active:scale-95"
          style={priced ? EARN_VARS : ACT_VARS}
        >
          {priced ? (
            <>
              <SugarTokenIcon /> {featured.lockedCost} · Unlock
            </>
          ) : (
            <>
              <span aria-hidden>▶</span> Play
            </>
          )}
        </Link>
      </div>
    </div>
  );
}
