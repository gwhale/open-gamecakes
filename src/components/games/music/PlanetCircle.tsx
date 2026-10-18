'use client';

// The circle of fifths: the three.js planets, with a DOM button floating over
// each one.
//
// The buttons ARE the interface: label, tap target, focus ring, screen-reader
// name. In 3D they follow the planets via the engine's per-frame projection
// (written straight to style.transform, never through React state, so a
// bobbing planet costs no re-render). If WebGL is missing or the engine throws,
// the same buttons sit on a flat SVG ring at the same angles, and the lesson
// does not change at all.

import { useEffect, useRef, useState } from 'react';
import {
  ALL_KEYS,
  CIRCLE,
  keyName,
  pcName,
  signatureWords,
  FLAT,
  SHARP,
  type KeyId,
} from '@/lib/games/music/theory';
import type { PlanetLook, PlanetsEngine } from '@/lib/games/three/planets/engine';
import { planetAngle } from '@/lib/games/three/planets/angle';
import { webglAvailable } from '@/lib/webgl';

/** Planet colours. The three lesson planets take the three cake layers so they
 *  read as the brand; the rest cycle the gumdrop and sprinkle hues. Colour is
 *  never the only cue: every planet carries its name. */
export const PLANET_COLORS: Record<KeyId, number> = {
  C: 0xfb7185, G: 0x34d399, F: 0x60a5fa,
  D: 0xfbbf24, A: 0xc084fc, E: 0xf472b6, B: 0x93c5fd,
  'F#': 0xa7f3d0, Db: 0xf9a8d4, Ab: 0xfde68a, Eb: 0x6ee7b7, Bb: 0xfda4af,
};

export type PlanetStatus = 'open' | 'locked' | 'future';

export interface PlanetCircleProps {
  selected: KeyId;
  status: Record<KeyId, PlanetStatus>;
  link: readonly [KeyId, KeyId] | null;
  /** Increments to bounce a planet. */
  pulse: { key: KeyId; n: number } | null;
  reducedMotion: boolean;
  onSelect: (key: KeyId) => void;
}

function sigShort(id: KeyId): string {
  const s = ALL_KEYS[CIRCLE.indexOf(id)].signature;
  if (s === 0) return '0';
  return `${Math.abs(s)}${s > 0 ? SHARP : FLAT}`;
}

function planetLabel(id: KeyId): string {
  return id === 'F#' ? 'F♯/G♭' : pcName(ALL_KEYS[CIRCLE.indexOf(id)].tonic);
}

export default function PlanetCircle({ selected, status, link, pulse, reducedMotion, onSelect }: PlanetCircleProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const engineRef = useRef<PlanetsEngine | null>(null);
  const [mode, setMode] = useState<'pending' | '3d' | 'flat'>('pending');

  const looks: PlanetLook[] = CIRCLE.map((id) => ({ color: PLANET_COLORS[id], open: status[id] === 'open' }));
  const looksRef = useRef(looks);
  looksRef.current = looks;

  // ---- mount the engine once ----
  useEffect(() => {
    let destroyed = false;
    if (!webglAvailable()) { setMode('flat'); return; }
    (async () => {
      try {
        const [THREE, mod] = await Promise.all([import('three'), import('@/lib/games/three/planets/engine')]);
        if (destroyed || !canvasHostRef.current) return;
        const engine = mod.createPlanetsEngine(
          THREE,
          canvasHostRef.current,
          { looks: looksRef.current, reducedMotion },
          {
            onFrame: (ps) => {
              ps.forEach((p, i) => {
                const b = btnRefs.current[i];
                if (b) b.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
              });
            },
          },
        );
        if (destroyed) { engine.dispose(); return; }
        engineRef.current = engine;
        setMode('3d');
      } catch (err) {
        console.warn('[musical-planets] 3D unavailable, using the flat circle:', err);
        if (!destroyed) setMode('flat');
      }
    })();
    const onResize = (): void => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (wrapRef.current) ro?.observe(wrapRef.current);
    return () => {
      destroyed = true;
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- feed state to the engine ----
  const looksKey = looks.map((l) => (l.open ? 1 : 0)).join('');
  useEffect(() => { engineRef.current?.setLooks(looksRef.current); }, [looksKey, mode]);
  useEffect(() => { engineRef.current?.setSelected(CIRCLE.indexOf(selected)); }, [selected, mode]);
  useEffect(() => {
    engineRef.current?.setLink(link ? [CIRCLE.indexOf(link[0]), CIRCLE.indexOf(link[1])] : null);
  }, [link, mode]);
  useEffect(() => { if (pulse) engineRef.current?.pulse(CIRCLE.indexOf(pulse.key)); }, [pulse]);
  useEffect(() => { engineRef.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);

  const flat = mode === 'flat';

  return (
    <div
      ref={wrapRef}
      className="relative aspect-square w-full overflow-hidden rounded-[1.35rem] border-[6px] border-white shadow-[0_20px_55px_rgba(91,33,182,0.18)]"
      style={{ background: 'radial-gradient(circle at 50% 45%, #fef3c7 0%, #e0f2fe 38%, #ddd6fe 100%)' }}
    >
      <div ref={canvasHostRef} className="absolute inset-0" />

      {flat ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx={50} cy={50} r={38} fill="none" stroke="#fff4e2" strokeWidth={0.9} />
          <circle cx={50} cy={50} r={7} fill="#fde68a" />
          {link ? (() => {
            const [a, b] = link.map((id) => planetAngle(CIRCLE.indexOf(id)));
            const p = (ang: number) => `${50 + Math.cos(ang) * 38} ${50 - Math.sin(ang) * 38}`;
            const sweep = ((a - b + Math.PI * 2) % (Math.PI * 2)) < Math.PI ? 1 : 0;
            return <path d={`M ${p(a)} A 38 38 0 0 ${sweep} ${p(b)}`} fill="none" stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />;
          })() : null}
        </svg>
      ) : null}

      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-display text-[11px] font-bold uppercase leading-tight tracking-wider text-amber-900/80 sm:text-xs">
        Circle of
        <br />
        Fifths
      </span>

      {CIRCLE.map((id, i) => {
        const st = status[id];
        const sel = id === selected;
        const a = planetAngle(i);
        const flatPos: React.CSSProperties = {
          left: `${50 + Math.cos(a) * 38}%`,
          top: `${50 - Math.sin(a) * 38}%`,
          transform: 'translate(-50%, -50%)',
        };
        const color = `#${PLANET_COLORS[id].toString(16).padStart(6, '0')}`;
        return (
          <button
            key={id}
            ref={(el) => { btnRefs.current[i] = el; }}
            type="button"
            onClick={() => onSelect(id)}
            aria-pressed={sel}
            aria-label={`${keyName(ALL_KEYS[i])}, ${signatureWords(ALL_KEYS[i])}${st === 'locked' ? ', locked' : st === 'future' ? ', a planet for later' : ''}`}
            className={`chrome-focus absolute flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-full font-display font-bold leading-none transition-[box-shadow,background-color] duration-150 active:scale-95 ${
              mode === 'pending' ? 'invisible' : ''
            } ${sel ? 'z-20' : 'z-10'} ${
              flat
                ? st === 'open' ? 'text-zinc-900 shadow-md' : 'bg-zinc-200 text-zinc-600'
                : 'bg-transparent text-zinc-900'
            }`}
            style={{
              ...(flat ? flatPos : { left: 0, top: 0 }),
              ...(flat && st === 'open' ? { background: color } : null),
              outline: sel ? '3px solid #18181b' : undefined,
              outlineOffset: sel ? 2 : undefined,
            }}
          >
            <span
              className={`rounded-full px-1.5 py-0.5 ${sel ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'} ${
                flat ? '' : st === 'open' ? 'bg-white/90 shadow-sm' : 'bg-white/60 text-zinc-600'
              }`}
            >
              {planetLabel(id)}
            </span>
            <span className={`mt-0.5 text-[10px] ${flat ? '' : 'rounded-full bg-white/70 px-1'} ${st === 'open' ? 'text-zinc-700' : 'text-zinc-500'}`}>
              {st === 'locked' ? '🔒' : sigShort(id)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
