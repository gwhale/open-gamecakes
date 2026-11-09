'use client';

// NavBox — Sub-Cake One's instrument panel: compass, coordinates and a chart.
//
// Asked for by a kid (ticket 5be05726): "Need compass, map, coordinates box
// added to the submarine area."
//
// THIS REVERSES A DELIBERATE DECISION, so the reasoning is worth keeping.
// sonar.ts used to answer in compass words -- "163m southeast" -- and a
// six-year-old filed a ticket saying he did not understand northwest or
// southeast at all. The fix was to speak in "ahead, a bit to your left", and
// the reason written down for it was: *the game shows no compass*, so a bearing
// is an instruction the kid cannot act on.
//
// That objection is about a missing instrument, not about compasses. So this
// adds the instrument and does NOT touch how the sonar speaks. The sonar still
// tells you which way to TURN; the compass is a thing to LOOK AT. A kid who
// never looks at it loses nothing, which is the test a HUD element has to pass
// in a game for six-year-olds.
//
// It re-renders only when the chest list changes. The needle and the numbers
// are written straight to the DOM from a rAF loop, because a compass has to
// move every frame and pushing that through React state would re-render the
// host -- and the canvas it holds -- sixty times a second on an iPad.

import { useEffect, useRef } from 'react';
import { cardinal, chartCoords, chartPoint, compassDegrees } from '@/lib/deep/compass';
import { DOMAIN_RADIUS_M } from '@/lib/deep/types';
import type { DeepChest } from '@/lib/deep/chest-catalog';

/** Chart radius in SVG units. The viewBox is 2R square. */
const R = 56;
/** Compass dial radius, same trick. */
const CR = 30;

export interface NavPose {
  x: number;
  z: number;
  heading: number;
}

export default function NavBox({
  getPose,
  foundChests,
}: {
  /** Live pose straight off the engine. Polled, never pushed: the engine's
   *  own position callback is throttled to one post every four seconds, which
   *  is a save cadence, not an instrument cadence. */
  getPose: () => NavPose | undefined;
  /** Only chests this kid has ALREADY opened. The chart is a record of where
   *  they have been, never a list of where to go -- sonar is still the only
   *  way to find a chest, and a map with all ten on it would delete the game. */
  foundChests: readonly DeepChest[];
}): React.ReactElement {
  const needleRef = useRef<SVGGElement>(null);
  const markerRef = useRef<SVGGElement>(null);
  const pointRef = useRef<HTMLSpanElement>(null);
  const degRef = useRef<HTMLSpanElement>(null);
  const xRef = useRef<HTMLSpanElement>(null);
  const yRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastText = 0;

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const pose = getPose();
      if (!pose) return;

      const deg = compassDegrees(pose.heading);

      // NORTH-UP, needle moves. A real compass card turns the letters instead,
      // and that is what this did first -- but at any heading off a right angle
      // it puts W, S and E on their sides, and a letter you have to decode is
      // the exact failure the sonar's compass words were pulled for. North-up
      // also makes this instrument and the chart below it work the SAME way,
      // so there is one idea to learn here, not two.
      needleRef.current?.setAttribute('transform', `rotate(${deg})`);

      const p = chartPoint(pose.x, pose.z, R);
      markerRef.current?.setAttribute('transform', `translate(${p.cx} ${p.cy}) rotate(${deg})`);

      // Text at ~10fps. Numbers are read, not watched, and re-writing six text
      // nodes every frame is work an iPad can spend on the ocean instead.
      if (now - lastText < 100) return;
      lastText = now;
      const c = chartCoords(pose.x, pose.z);
      if (pointRef.current) pointRef.current.textContent = cardinal(deg);
      if (degRef.current) degRef.current.textContent = `${Math.round(deg)}°`;
      if (xRef.current) xRef.current.textContent = String(c.x);
      if (yRef.current) yRef.current.textContent = String(c.y);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getPose]);

  return (
    <div
      className="nav-box pointer-events-none absolute left-3 top-1/2 z-30 w-[132px] -translate-y-1/2 rounded-2xl bg-black/40 p-2.5 text-center font-display backdrop-blur-sm"
      aria-hidden
    >
      {/* ---- Compass ---- */}
      <svg
        viewBox={`${-CR - 2} ${-CR - 2} ${(CR + 2) * 2} ${(CR + 2) * 2}`}
        className="nav-box-full w-full"
      >
        <circle r={CR} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" />
        {/* Fixed, upright, always readable. */}
        {(['N', 'E', 'S', 'W'] as const).map((label, i) => {
          const a = (i * 90 * Math.PI) / 180;
          // Screen y grows downward and north sits at the top, so the y term
          // is negated here for the same reason chartPoint needs no flip.
          return (
            <text
              key={label}
              x={Math.sin(a) * (CR - 8)}
              y={-Math.cos(a) * (CR - 8)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={label === 'N' ? 13 : 10}
              fontWeight="bold"
              fill={label === 'N' ? '#fbbf24' : 'rgba(255,255,255,0.7)'}
            >
              {label}
            </text>
          );
        })}
        {/* The needle: which way the nose is pointing, right now. */}
        <g ref={needleRef}>
          <polygon points={`0,${-CR + 4} -6,8 0,3 6,8`} fill="#34d399" />
        </g>
      </svg>

      <div className="mt-0.5 leading-none text-white">
        <span ref={pointRef} className="text-lg font-bold">
          N
        </span>{' '}
        <span ref={degRef} className="text-xs tabular-nums text-white/60">
          0°
        </span>
      </div>

      {/* ---- Coordinates ---- */}
      <div className="mt-1.5 flex justify-center gap-2 text-xs font-bold tabular-nums text-white">
        <span>
          <span className="text-white/50">X </span>
          <span ref={xRef}>0</span>
        </span>
        <span>
          <span className="text-white/50">Y </span>
          <span ref={yRef}>0</span>
        </span>
      </div>

      {/* ---- Chart ---- */}
      <svg
        viewBox={`${-R - 3} ${-R - 3} ${(R + 3) * 2} ${(R + 3) * 2}`}
        className="nav-box-full mt-1.5 w-full"
      >
        <circle r={R} fill="rgba(3,27,51,0.65)" stroke="rgba(255,255,255,0.25)" />
        {/* Axes: the coordinate plane the X/Y numbers above refer to. */}
        <line x1={-R} y1={0} x2={R} y2={0} stroke="rgba(255,255,255,0.12)" />
        <line x1={0} y1={-R} x2={0} y2={R} stroke="rgba(255,255,255,0.12)" />
        <text
          x={0}
          y={-R + 7}
          textAnchor="middle"
          fontSize={9}
          fontWeight="bold"
          fill="rgba(251,191,36,0.85)"
        >
          N
        </text>

        {foundChests.map((c) => {
          const p = chartPoint(c.x, c.z, R);
          return <circle key={c.slug} cx={p.cx} cy={p.cy} r={3} fill="#fbbf24" />;
        })}

        <g ref={markerRef}>
          <polygon points="0,-6 -4.5,5 4.5,5" fill="#34d399" stroke="#031b33" strokeWidth={0.8} />
        </g>
      </svg>

      <div className="nav-box-full mt-0.5 text-[9px] uppercase tracking-wider text-white/40">
        {DOMAIN_RADIUS_M}m chart
      </div>
    </div>
  );
}
