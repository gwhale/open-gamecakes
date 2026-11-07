'use client';

// ThumbPad — a candy virtual joystick for driving/flying rental vehicles.
//
// Fixed to the bottom-left thumb zone while a ride is mounted. A pointer-
// captured drag moves the frosting knob inside the ring; the offset (screen-
// space, magnitude 0..1 — x right, y down) streams to the engine via onSteer.
// The engine scales ride speed by the magnitude, so a gentle push creeps and
// full tilt is full speed. Release springs the knob home and sends null (the
// ride coasts to a stop).
//
// Canvas drag-steer stays available too — the pad is an ALTERNATIVE for kids
// who find drag-steer fiddly (dragging on the ride re-targets the camera view
// under their finger), especially on fly rides where the climb/dive buttons
// already occupy the right thumb.

import { useCallback, useRef } from 'react';

const PAD_R = 62; // ring radius (px) — comfortably over the 44px tap minimum
const KNOB_R = 30; // knob radius (px)
const TRAVEL = PAD_R - 14; // max knob travel from center (px)

export default function ThumbPad({
  onSteer,
}: {
  /** Screen-space steer vector, magnitude 0..1 (x right, y down), or null on
   *  release. Streamed continuously while the thumb is down. */
  onSteer: (v: { x: number; y: number } | null) => void;
}): React.ReactElement {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const activeId = useRef<number | null>(null);

  // Knob position is poked via style.transform (no React re-render per move —
  // same rAF-free trick the Minimap marker and Cakey bubble use).
  const moveKnob = useCallback((dx: number, dy: number): void => {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }, []);

  const handle = useCallback(
    (e: React.PointerEvent): void => {
      const base = baseRef.current;
      if (!base) return;
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > TRAVEL) {
        dx = (dx / m) * TRAVEL;
        dy = (dy / m) * TRAVEL;
      }
      moveKnob(dx, dy);
      onSteer({ x: dx / TRAVEL, y: dy / TRAVEL });
    },
    [moveKnob, onSteer],
  );

  const release = useCallback(
    (e: React.PointerEvent): void => {
      if (activeId.current !== e.pointerId) return;
      activeId.current = null;
      moveKnob(0, 0);
      onSteer(null);
    },
    [moveKnob, onSteer],
  );

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        activeId.current = e.pointerId;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // best-effort — steering still tracks via onPointerMove
        }
        handle(e);
      }}
      onPointerMove={(e) => {
        if (activeId.current === e.pointerId) handle(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      role="application"
      aria-label="Steering pad — drag the knob to drive"
      className="fixed fixed-bottom-safe-hi left-4 z-30 touch-none select-none rounded-full border-4 border-white/70 bg-white/40 shadow-lg backdrop-blur-sm"
      style={{ width: PAD_R * 2, height: PAD_R * 2 }}
    >
      {/* Direction ticks — a subtle N/E/S/W hint that this is a steering ring. */}
      {(
        [
          ['50%', '7px', '-50%', '0'],
          ['calc(100% - 7px)', '50%', '-50%', '-50%'],
          ['50%', 'calc(100% - 7px)', '-50%', '-100%'],
          ['7px', '50%', '-50%', '-50%'],
        ] as const
      ).map(([left, top, tx, ty], i) => (
        <span
          key={i}
          aria-hidden
          className="absolute h-1.5 w-1.5 rounded-full bg-white/80"
          style={{ left, top, transform: `translate(${tx}, ${ty})` }}
        />
      ))}
      {/* Frosting knob. */}
      <div
        ref={knobRef}
        aria-hidden
        className="absolute rounded-full border-2 border-white/80 shadow-md"
        style={{
          background: 'linear-gradient(to bottom right, var(--act-from), var(--act-to))',
          width: KNOB_R * 2,
          height: KNOB_R * 2,
          left: PAD_R - KNOB_R - 4, // -4: the ring's 4px border offsets content
          top: PAD_R - KNOB_R - 4,
        }}
      />
    </div>
  );
}
