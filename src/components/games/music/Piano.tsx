'use client';

// The playable keyboard, C4 to C6, as real buttons.
//
// One tab stop for the whole keyboard (roving tabindex): Tab lands on it,
// ←/→ walk the keys, Enter or Space plays. Twenty-five tab stops would bury
// the mission controls behind the piano for anyone not using a mouse.
//
// No state is colour-only. A scale note carries a dot, a hinted key carries a
// ring and an arrow, a sounding key drops like a pressed key and fills mint.
// Names stay on unless challenge mode hides them; octave numbers appear on
// every C, which is where an octave starts.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  keyLabels,
  keyOf,
  pcName,
  pianoKeys,
  spellInKey,
  spokenName,
  type KeyId,
} from '@/lib/games/music/theory';

export interface PianoProps {
  keyId: KeyId;
  /** Sounding now. */
  lit: ReadonlySet<number>;
  /** Pitch classes glowing as a hint (every octave). */
  hintPcs?: readonly number[];
  /** Mark the key's scale notes with a dot. */
  showScale?: boolean;
  hideNames?: boolean;
  onPress: (midi: number) => void;
}

const KEYS = pianoKeys();
const WHITES = KEYS.filter((k) => !k.black);

export default function Piano({ keyId, lit, hintPcs = [], showScale = true, hideNames = false, onPress }: PianoProps) {
  const k = keyOf(keyId);
  const [focusMidi, setFocusMidi] = useState(60);
  const refs = useRef(new Map<number, HTMLButtonElement>());

  const info = useMemo(
    () =>
      KEYS.map((key) => {
        const inKey = spellInKey(k, key.midi);
        const octave = key.natural.octave;
        const spelled = inKey ?? (key.black ? null : key.natural);
        const names = spelled ? [pcName(spelled)] : keyLabels(key.midi);
        const aria = `${spelled ? spokenName(spelled) : keyLabels(key.midi).map((n) => spokenName({ letter: n[0] as never, acc: n.includes('♯') ? 1 : -1 })).join(' or ')} ${octave}`;
        return { ...key, inKey: inKey !== null, names, aria };
      }),
    [k],
  );

  const move = useCallback((from: number, dir: 1 | -1) => {
    const next = Math.min(KEYS.at(-1)!.midi, Math.max(KEYS[0].midi, from + dir));
    setFocusMidi(next);
    refs.current.get(next)?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent, midi: number): void => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(midi, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(midi, -1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) onPress(midi); }
  };

  const whiteW = 100 / WHITES.length;

  return (
    <div
      role="group"
      aria-label="Piano, C4 to C6. Use the left and right arrows to move, Enter to play."
      className="relative w-full select-none"
      style={{ height: 'clamp(118px, 22vh, 170px)', touchAction: 'manipulation' }}
    >
      {info.map((key) => {
        const isLit = lit.has(key.midi);
        const hinted = hintPcs.includes(key.midi % 12);
        const dot = showScale && key.inKey;
        const wi = WHITES.findIndex((w) => w.midi === (key.black ? key.midi - 1 : key.midi));
        const style: React.CSSProperties = key.black
          ? { left: `${(wi + 1) * whiteW - whiteW * 0.31}%`, width: `${whiteW * 0.62}%`, height: '60%', zIndex: 2 }
          : { left: `${wi * whiteW}%`, width: `${whiteW}%`, height: '100%', zIndex: 1 };
        const base = key.black
          ? isLit ? 'bg-emerald-500 text-emerald-950' : 'bg-zinc-800 text-white'
          : isLit ? 'bg-emerald-300 text-emerald-950' : key.inKey && showScale ? 'bg-white text-zinc-900' : 'bg-zinc-100 text-zinc-500';
        return (
          <button
            key={key.midi}
            ref={(el) => { if (el) refs.current.set(key.midi, el); else refs.current.delete(key.midi); }}
            type="button"
            tabIndex={key.midi === focusMidi ? 0 : -1}
            aria-label={key.aria}
            onPointerDown={(e) => { e.preventDefault(); setFocusMidi(key.midi); onPress(key.midi); }}
            onKeyDown={(e) => onKeyDown(e, key.midi)}
            onFocus={() => setFocusMidi(key.midi)}
            className={`chrome-focus absolute top-0 flex flex-col items-center justify-end rounded-b-xl border border-zinc-400 pb-1.5 font-display font-bold transition-[transform,background-color,box-shadow] duration-100 ${base} ${
              hinted ? 'ring-4 ring-inset ring-amber-400' : ''
            } ${isLit ? 'translate-y-[3px] shadow-none' : key.black ? 'shadow-[0_4px_0_#18181b]' : 'shadow-[0_5px_0_#d4d4d8]'}`}
            style={style}
          >
            {hinted ? <span aria-hidden className="mb-auto mt-1 text-lg leading-none">👇</span> : null}
            {dot ? (
              <span aria-hidden className={`mb-1 h-2.5 w-2.5 rounded-full ${key.black ? 'bg-amber-300' : 'bg-rose-500'}`} />
            ) : null}
            {hideNames ? null : key.black ? (
              <span className="flex flex-col text-[10px] leading-tight sm:text-xs">
                {key.names.map((n) => <span key={n}>{n}</span>)}
              </span>
            ) : (
              <span className="text-sm leading-none sm:text-base">
                {key.names[0]}
                {key.names[0] === 'C' ? <sub className="text-[10px]">{key.natural.octave}</sub> : null}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
