'use client';

// Marble Math Maze — calibration step.
//
// Sits between the GameLauncher Play tap and the Phaser scene mount.
// Two jobs:
//   1. Confirm the deviceorientation events are actually firing. Permission
//      can be granted but events never arrive (Low Power Mode, certain
//      accessibility settings, rare iOS gyro stalls). A 2-second watchdog
//      surfaces this to the kid with a drag-mode escape hatch.
//   2. Capture the tilt baseline while the kid holds the iPad flat —
//      *before* the play tap. The previous behavior (capture on first
//      pointerdown) produced skewed baselines because kids reach for the
//      screen while tilting the iPad, so the "zero" was their reach pose,
//      not their resting pose.
//
// Also surfaces orientation/rotation-lock status: iOS Safari (non-PWA)
// does not implement screen.orientation.lock(), so on those devices we
// can't force landscape — we have to ask the kid to rotate the iPad.

import { useCallback, useEffect, useRef, useState } from 'react';
// useRef is still used: `latest` keeps a click-handler-readable copy of
// the freshest gamma/beta so the captured baseline doesn't lag a frame
// behind a fast tap.

export type CalibrationResult =
  | { mode: 'tilt'; baselineGamma: number; baselineBeta: number }
  | { mode: 'drag' };

export type RotationLockStatus = 'unknown' | 'locked' | 'failed' | 'unsupported';

interface Props {
  rotationLockStatus: RotationLockStatus;
  isLandscape: boolean;
  onComplete: (result: CalibrationResult) => void;
}

// Visualization dims — picked to fit comfortably above the buttons on a
// landscape iPad mini at 1024×768 with the GameLauncher chrome around it.
const TRAY_W = 240;
const TRAY_H = 150;
const MARBLE_R = 14;

// Pixels of marble drift per degree of tilt. The actual game uses
// TILT_SENSITIVITY=60 px/s² per degree, but here we want a visual that's
// readable for a 2nd grader — bigger response, more obvious "yes it works".
const TILT_PX_PER_DEG = 7;

// If permission was granted but no events fire within this window, assume
// the sensor is stalled and offer drag fallback. Two seconds is long enough
// for iOS to warm up its gyro on cold-start (typically 100-500ms) but short
// enough that a stuck sensor doesn't strand the kid forever.
const WATCHDOG_MS = 2000;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export default function MarbleMazeCalibration({
  rotationLockStatus,
  isLandscape,
  onComplete,
}: Props) {
  const [gamma, setGamma] = useState(0);
  const [beta, setBeta] = useState(0);
  const [eventReceived, setEventReceived] = useState(false);
  const [watchdogFired, setWatchdogFired] = useState(false);

  // Soft baseline = first event's reading. Used only for the live
  // visualization so the marble doesn't immediately bolt off-screen if
  // the kid is holding the iPad at +20°. The *real* baseline (the one
  // the scene uses) is whatever gamma/beta read at the moment the kid
  // taps Start, captured raw. State (not ref) so React reads it during
  // render without tripping the refs-in-render lint.
  const [softBaseline, setSoftBaseline] = useState<{ g: number; b: number } | null>(null);

  // Latest readings stored in a ref so the click handler can grab the
  // freshest values without waiting for a re-render. Without this, fast
  // tappers can capture a baseline one frame stale. Reads happen inside
  // the click handler (event), not during render — that's why ref is OK.
  const latest = useRef({ g: 0, b: 0 });

  useEffect(() => {
    const onTilt = (e: DeviceOrientationEvent): void => {
      const g = e.gamma ?? 0;
      const b = e.beta ?? 0;
      // Functional setState so we don't depend on the stale closure
      // value from the moment this listener was registered.
      setSoftBaseline((prev) => prev ?? { g, b });
      latest.current = { g, b };
      setGamma(g);
      setBeta(b);
      setEventReceived(true);
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, []);

  useEffect(() => {
    if (eventReceived) return;
    const t = window.setTimeout(() => setWatchdogFired(true), WATCHDOG_MS);
    return () => window.clearTimeout(t);
  }, [eventReceived]);

  const handleStart = useCallback(() => {
    onComplete({
      mode: 'tilt',
      baselineGamma: latest.current.g,
      baselineBeta: latest.current.b,
    });
  }, [onComplete]);

  const handleDragFallback = useCallback(() => {
    onComplete({ mode: 'drag' });
  }, [onComplete]);

  // Marble offset relative to the soft baseline, clamped so it can't
  // escape the tray.
  const sb = softBaseline ?? { g: gamma, b: beta };
  const dx = clamp(
    (gamma - sb.g) * TILT_PX_PER_DEG,
    -TRAY_W / 2 + MARBLE_R + 6,
    TRAY_W / 2 - MARBLE_R - 6,
  );
  const dy = clamp(
    (beta - sb.b) * TILT_PX_PER_DEG,
    -TRAY_H / 2 + MARBLE_R + 6,
    TRAY_H / 2 - MARBLE_R - 6,
  );

  const showRotateNudge = !isLandscape;
  const showLockUnsupported = rotationLockStatus === 'unsupported' && isLandscape;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-amber-50/95 dark:bg-amber-950/95 px-6">
      <div className="max-w-md w-full rounded-3xl bg-white dark:bg-zinc-900 shadow-xl border-2 border-amber-300 dark:border-amber-700 p-6 flex flex-col items-center gap-4">
        <div className="text-center">
          <div className="text-3xl mb-1">🎱</div>
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100">
            Hold your iPad flat
          </h2>
          <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
            Watch the little marble — it should sit in the middle when
            you&apos;re flat.
          </p>
        </div>

        {/* Mini-marble tray — SVG so it scales cleanly and renders the
            marble identically to the game (red with highlight + glint). */}
        <svg
          width={TRAY_W}
          height={TRAY_H}
          viewBox={`${-TRAY_W / 2} ${-TRAY_H / 2} ${TRAY_W} ${TRAY_H}`}
          className="rounded-2xl"
          aria-label="Tilt calibration tray"
        >
          <defs>
            <radialGradient id="trayShade" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="100%" stopColor="#fcd34d" />
            </radialGradient>
          </defs>
          <rect
            x={-TRAY_W / 2}
            y={-TRAY_H / 2}
            width={TRAY_W}
            height={TRAY_H}
            rx={20}
            fill="url(#trayShade)"
            stroke="#f59e0b"
            strokeWidth={3}
          />
          {/* Center crosshair — kid's target */}
          <circle cx={0} cy={0} r={MARBLE_R + 4} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
          {/* Live marble */}
          <g transform={`translate(${dx} ${dy})`} style={{ transition: 'transform 80ms linear' }}>
            <circle cx={2} cy={3} r={MARBLE_R} fill="#7f1d1d" opacity={0.4} />
            <circle cx={0} cy={0} r={MARBLE_R} fill="#dc2626" />
            <circle cx={-4} cy={-5} r={MARBLE_R * 0.45} fill="#fecaca" opacity={0.85} />
            <circle cx={-5} cy={-6} r={1.8} fill="#ffffff" />
          </g>
        </svg>

        {/* Status line — three states: waiting / live / stalled */}
        {!eventReceived && !watchdogFired ? (
          <p className="text-sm text-zinc-500">Reading tilt sensor…</p>
        ) : eventReceived ? (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            ✓ Tilt is working
          </p>
        ) : (
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            Hmm, the tilt sensor isn&apos;t responding.
          </p>
        )}

        {/* Orientation / lock advisories */}
        {showRotateNudge ? (
          <div className="w-full rounded-xl bg-amber-100 dark:bg-amber-900 px-3 py-2 text-center text-sm text-amber-900 dark:text-amber-100">
            🔄 Please rotate your iPad sideways
          </div>
        ) : null}
        {showLockUnsupported ? (
          <div className="w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-center text-xs text-zinc-700 dark:text-zinc-300">
            Tip: keep your iPad sideways while playing — your browser
            can&apos;t auto-lock the rotation.
          </div>
        ) : null}

        {/* Buttons */}
        <div className="flex flex-col w-full gap-2 mt-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={!eventReceived}
            className="w-full rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-zinc-400 disabled:cursor-not-allowed text-white font-bold py-3 text-lg shadow-md transition-colors"
          >
            I&apos;m flat — Start!
          </button>
          <button
            type="button"
            onClick={handleDragFallback}
            className="w-full rounded-full bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium py-2 text-sm transition-colors"
          >
            {watchdogFired ? 'Use finger drag instead' : 'Use finger drag instead →'}
          </button>
        </div>
      </div>
    </div>
  );
}
