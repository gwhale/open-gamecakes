'use client';

// SubPad — the right-thumb controls for Sub-Cake One.
//
// The PRD lists a keyboard layout (W/S, A/D, Q/E, Shift, Space, F) and the
// engine honours it, but the kids play on an iPad. So touch is the PRIMARY
// surface and the keys are the fallback: steering is the town's existing
// ThumbPad under the left thumb, and everything else is here under the right.
//
// Three rules, all learned from the town's own controls:
//   * Nothing is a tap-and-release toggle. Dive and rise are HELD, because a
//     kid who taps "down" and keeps sinking has lost the boat.
//   * SONAR is the biggest button on screen. It is the mechanic the whole
//     build is testing, and a kid must be able to hit it without looking.
//   * Every target clears --min-tap-target, and pointer capture means a thumb
//     that slides off the button still releases it.

import { useCallback, useRef } from 'react';

interface HoldButtonProps {
  label: string;
  glyph: string;
  onHold: (down: boolean) => void;
  className?: string;
}

/** A button that reports press and release rather than clicks. */
function HoldButton({ label, glyph, onHold, className = '' }: HoldButtonProps): React.ReactElement {
  const active = useRef(false);

  const down = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>): void => {
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = true;
      onHold(true);
    },
    [onHold],
  );

  const up = useCallback((): void => {
    if (!active.current) return;
    active.current = false;
    onHold(false);
  }, [onHold]);

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      className={`candy-shell flex flex-col items-center justify-center rounded-full font-display font-bold transition-transform duration-100 ease-out active:scale-95 ${className}`}
      style={{ minHeight: 'var(--min-tap-target)', minWidth: 'var(--min-tap-target)' }}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {glyph}
      </span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-white/85">{label}</span>
    </button>
  );
}

export default function SubPad({
  onClimb,
  onBoost,
  onSonar,
  sonarReady,
}: {
  /** +1 rise, -1 dive, 0 hold. */
  onClimb: (dir: -1 | 0 | 1) => void;
  onBoost: (on: boolean) => void;
  onSonar: () => void;
  /** False while the pulse is out or cooling down — the button greys out so a
   *  kid learns the rhythm instead of mashing at a control that ignores them. */
  sonarReady: boolean;
}): React.ReactElement {
  return (
    // Lifted clear of the (gated) layout's Story Oven button, which is fixed to
    // the bottom-right corner on every page in the group and sat squarely on
    // top of DIVE. Worth knowing before adding anything else down here.
    <div className="fixed bottom-28 right-4 z-30 flex flex-col items-end gap-3">
      <button
        type="button"
        aria-label="Fire sonar"
        onClick={onSonar}
        disabled={!sonarReady}
        className="candy-shell flex items-center gap-2 rounded-full px-7 py-4 font-display text-lg font-bold transition-[transform,filter] duration-100 ease-out active:scale-95 disabled:opacity-40"
        style={
          {
            minHeight: 'var(--min-tap-target)',
            '--c-from': 'var(--travel-from)',
            '--c-to': 'var(--travel-to)',
            '--c-ink': 'var(--travel-ink)',
            '--c-glow': 'var(--travel-glow)',
          } as React.CSSProperties
        }
      >
        <span className="text-2xl" aria-hidden>
          📡
        </span>
        SONAR
      </button>

      <div className="flex items-end gap-2">
        <HoldButton label="Boost" glyph="💨" onHold={onBoost} className="h-16 w-16" />
        <div className="flex flex-col gap-2">
          <HoldButton
            label="Rise"
            glyph="▲"
            onHold={(d) => onClimb(d ? 1 : 0)}
            className="h-16 w-16"
          />
          <HoldButton
            label="Dive"
            glyph="▼"
            onHold={(d) => onClimb(d ? -1 : 0)}
            className="h-16 w-16"
          />
        </div>
      </div>
    </div>
  );
}
