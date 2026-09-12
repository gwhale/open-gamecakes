'use client';

// "Pick your pieces" — the screen between choosing an opponent and playing.
//
// Two choices, both cosmetic, neither affecting how the game plays: every set
// has an identical footprint and height by construction (see styles.ts), and
// picking a side yaws the CAMERA rather than flipping the board.
//
// Accessibility here is not decoration: these are real radio groups with roving
// semantics, every control clears 44px, and the selected state is carried by a
// ring AND a check mark, never by colour alone.

import { useState } from 'react';
import { PIECE_STYLES } from '@/lib/games/checkers/styles';
import { DEFAULT_PREFS, type CheckersPrefs } from '@/lib/games/checkers/prefs';
import type { Side } from '@/lib/games/checkers/rules';

/** A flat, top-down sketch of a piece, drawn from the same recipe the 3D set
 *  uses so the picker cannot drift from the board. It is deliberately a plan
 *  view: that is the angle the kid actually plays at. */
function StyleSwatch({ styleId, side, size = 56 }: { styleId: string; side: Side; size?: number }) {
  const style = PIECE_STYLES.find((s) => s.id === styleId)!;
  const c = style[side];
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const ring = styleId === 'doughnut';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden focusable="false">
      <circle cx="50" cy="50" r="46" fill={hex(c.body)} stroke="rgba(69,26,3,0.35)" strokeWidth="3" />
      {ring ? <circle cx="50" cy="50" r="17" fill="#9c6b3f" /> : null}
      {styleId === 'sandwich' ? (
        <circle cx="50" cy="50" r="30" fill="none" stroke={hex(c.accent)} strokeWidth="5" />
      ) : null}
      {styleId === 'petit-four' ? (
        <circle cx="50" cy="50" r="38" fill="none" stroke={hex(c.accent)} strokeWidth="7" />
      ) : null}
      {styleId === 'macaron' ? (
        <circle cx="50" cy="50" r="42" fill="none" stroke={hex(c.accent)} strokeWidth="6" opacity="0.9" />
      ) : null}
      {styleId === 'chip-cookie'
        ? [0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <circle key={i} cx={50 + Math.cos(a) * 24} cy={50 + Math.sin(a) * 24} r="6.5" fill={hex(c.accent)} />
            );
          })
        : null}
      {styleId === 'doughnut'
        ? [0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2 + 0.3;
            return (
              <rect
                key={i}
                x={50 + Math.cos(a) * 31 - 5}
                y={50 + Math.sin(a) * 31 - 2}
                width="10"
                height="4"
                rx="2"
                fill={['#fb7185', '#6ee7b7', '#fbbf24', '#93c5fd', '#f9a8d4', '#a7f3d0'][i]}
              />
            );
          })
        : null}
    </svg>
  );
}

export default function StyleSidePicker({
  initial = DEFAULT_PREFS,
  onStart,
  onBack,
}: {
  initial?: CheckersPrefs;
  onStart: (prefs: CheckersPrefs) => void;
  onBack: () => void;
}) {
  const [styleId, setStyleId] = useState(initial.styleId);
  const [side, setSide] = useState<Side>(initial.side);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">Pick your pieces</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
          They all play exactly the same. Choose the ones you like best.
        </p>
      </div>

      <div role="radiogroup" aria-label="Piece set" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PIECE_STYLES.map((s) => {
          const on = s.id === styleId;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setStyleId(s.id)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 bg-white/85 p-3 text-center shadow-sm transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${
                on ? 'border-violet-500 ring-2 ring-violet-300' : 'border-stone-200 hover:border-violet-300'
              }`}
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              <div className="flex items-center gap-1">
                <StyleSwatch styleId={s.id} side="light" size={40} />
                <StyleSwatch styleId={s.id} side="dark" size={40} />
              </div>
              <span className="text-sm font-semibold text-stone-800">
                {/* A check mark, not just the ring — selection must survive
                    greyscale and a colour-blind kid. */}
                {on ? '✓ ' : ''}
                {s.name}
              </span>
              <span className="text-[11px] leading-tight text-stone-600">{s.blurb}</span>
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">Pick your side</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
          Your pieces always start at the bottom of the screen. Chocolate goes first.
        </p>
      </div>

      <div role="radiogroup" aria-label="Which side you play" className="grid grid-cols-2 gap-3">
        {(['dark', 'light'] as const).map((s) => {
          const on = s === side;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSide(s)}
              className={`flex items-center justify-center gap-3 rounded-2xl border-2 bg-white/85 p-3 shadow-sm transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${
                on ? 'border-violet-500 ring-2 ring-violet-300' : 'border-stone-200 hover:border-violet-300'
              }`}
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              <StyleSwatch styleId={styleId} side={s} size={44} />
              <span className="text-sm font-semibold text-stone-800">
                {on ? '✓ ' : ''}
                {s === 'dark' ? 'Chocolate' : 'Cream'}
                {s === 'dark' ? <span className="ml-1 text-xs text-stone-500">(first)</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="button"
          onClick={() => onStart({ styleId, side })}
          className="rounded-full px-6 py-4 text-lg font-semibold text-white shadow-md active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 sm:flex-1"
          style={{ background: 'linear-gradient(to right, #a78bfa, #7c3aed)', minHeight: 'var(--min-tap-target)' }}
        >
          Play
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-violet-300 bg-white/80 px-5 py-3 text-sm font-medium text-stone-700 shadow-sm active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          ← Change opponent
        </button>
      </div>
    </div>
  );
}
