'use client';

// The jet ski's own controls and readout, shown only while one is ridden.
//
//  - Throttle: a lever bottom right, under the camera buttons, 🐢 at the bottom to 🚀 at the top. At the
//    bottom the pad drives as on any ride; pushed up, the ski drives on by
//    itself and the pad only steers, like a real jet ski.
//  - Slalom: once the kid drives through the first gate, a pill counts the
//    gates and the time; at the finish it shows gates made, the time and the
//    kid's best on this device. Nothing is won or spent: it is a game for its
//    own sake.

import { useEffect, useState } from 'react';
import { SLALOM_GATES, type SlalomEvent } from '@/lib/town/three/jetski-course';

const BEST_KEY = 'gc.jetski.slalomBest';

function readBest(): number | null {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveBest(ms: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(ms));
  } catch {
    // Private window or blocked storage: the best time just isn't kept.
  }
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

export type SlalomReadout =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number; gate: number; total: number; missed: number }
  | { phase: 'done'; made: number; total: number; ms: number; best: number | null; newBest: boolean };

/** The readout after an engine slalom event. Pure: the host calls it from the
 *  engine callback with the time and the stored best, and keeps the result. */
export function nextSlalomReadout(r: SlalomReadout, ev: SlalomEvent, nowMs: number, prevBest: number | null): SlalomReadout {
  if (ev.kind === 'start') {
    return { phase: 'running', startedAt: nowMs, gate: 1, total: SLALOM_GATES, missed: 0 };
  }
  if (ev.kind === 'gate' && r.phase === 'running') {
    return { ...r, gate: ev.index + 1, missed: r.missed + (ev.made ? 0 : 1) };
  }
  if (ev.kind === 'finish') {
    // Only a run through every gate can set the best time.
    const newBest = ev.made === ev.total && (prevBest === null || ev.ms < prevBest);
    return { phase: 'done', made: ev.made, total: ev.total, ms: ev.ms, best: newBest ? ev.ms : prevBest, newBest };
  }
  return r;
}

export { readBest as readSlalomBest };

export interface JetskiHudProps {
  throttle: number;
  onThrottle: (v: number) => void;
  readout: SlalomReadout;
  /** The finish card has been up long enough: back to idle. */
  onReadoutDone: () => void;
}

export default function JetskiHud({ throttle, onThrottle, readout, onReadoutDone }: JetskiHudProps): React.ReactElement {
  const [now, setNow] = useState(0);

  // Keep a new best on this device.
  useEffect(() => {
    if (readout.phase === 'done' && readout.newBest) saveBest(readout.ms);
  }, [readout]);

  // Tick the clock while a run is on; clear the finish card after a while.
  useEffect(() => {
    if (readout.phase === 'running') {
      const id = window.setInterval(() => setNow(performance.now()), 100);
      return () => window.clearInterval(id);
    }
    if (readout.phase === 'done') {
      const id = window.setTimeout(onReadoutDone, 7000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [readout.phase, onReadoutDone]);

  return (
    <>
      {readout.phase !== 'idle' ? (
        <div
          role="status"
          className="candy-shell pointer-events-none fixed left-1/2 top-24 z-30 -translate-x-1/2 rounded-full px-5 py-2 text-center font-display text-base font-bold"
          style={{ '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties}
        >
          {readout.phase === 'running' ? (
            <span>
              🏁 Gate {Math.min(readout.gate + 1, readout.total)} of {readout.total} ·{' '}
              {secs(Math.max(0, now - readout.startedAt))}
            </span>
          ) : (
            <span>
              {readout.made === readout.total ? '🎉 Slalom done!' : '🏁 Slalom done'} {readout.made} of {readout.total}{' '}
              gates · {secs(readout.ms)}
              {readout.newBest ? ' · new best!' : readout.best !== null ? ` · best ${secs(readout.best)}` : ''}
            </span>
          )}
        </div>
      ) : null}

      <div
        className="candy-shell fixed fixed-bottom-safe right-4 z-30 flex flex-col items-center gap-1 rounded-full px-2 py-2"
        style={{ '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties}
      >
        <span className="text-xl" aria-hidden>
          🚀
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(throttle * 100)}
          onChange={(e) => onThrottle(Number(e.target.value) / 100)}
          aria-label="Jet ski throttle"
          aria-valuetext={throttle === 0 ? 'Stopped' : `${Math.round(throttle * 100)} percent`}
          className="h-28 w-8 cursor-pointer touch-none accent-pink-500"
          // A vertical slider: up is faster.
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        />
        <span className="text-xl" aria-hidden>
          🐢
        </span>
      </div>
    </>
  );
}
