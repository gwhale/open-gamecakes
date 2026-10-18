// The jet ski playground: a buoy slalom off one rental dock and floating jump
// ramps off the others, placed on the SOLVED map, plus the slalom's rules.
//
// Pure: no `three`, no engine. Like jetski-docks.ts, the engine hands in the
// docks and a sea test; this returns where things go, and a small state
// machine the engine steps each frame with the ski's position.
//
// A light game: no tokens, no questions. The slalom is a line of gates (two
// buoys each) zig-zagging out to sea; drive through them in order. Passing a
// gate's line outside its buoys counts as a miss and the course moves on, so
// a kid is never stuck. The time and the gates made show at the finish.

import type { JetskiDock, Pt } from './jetski-docks';

export interface SlalomGate {
  /** Gate centre, px. */
  centre: Pt;
  /** The two buoys, px. */
  left: Pt;
  right: Pt;
}

export interface SkiRamp {
  /** Ramp centre, px. */
  at: Pt;
  /** Unit vector the ramp launches toward (low end to lip). */
  dir: Pt;
}

export interface JetskiCourse {
  /** Index of the dock the slalom starts from, or -1 if none fits. */
  slalomDock: number;
  gates: SlalomGate[];
  /** The course's forward direction (unit). */
  axis: Pt;
  ramps: SkiRamp[];
}

export const SLALOM_GATES = 7;
/** Along the course from the mooring to the first gate, px. */
const FIRST_GATE_PX = 480;
/** Gate to gate along the course, px (~6 units: a second at full speed). */
const GATE_PITCH_PX = 384;
/** Each gate's centre swings this far either side of the course line, px. */
const ZIG_PX = 110;
/** Half the gate opening, px: the buoys stand this far from its centre. */
export const GATE_HALF_PX = 84;
/** Open water needed round every gate and ramp, px. */
const CLEAR_PX = 200;
/** A ramp sits this far out from its dock's mooring, px. */
const RAMP_OUT_PX = 420;

function clearSea(seaOk: (x: number, y: number) => boolean, p: Pt): boolean {
  if (!seaOk(p.x, p.y)) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (!seaOk(p.x + Math.cos(a) * CLEAR_PX, p.y + Math.sin(a) * CLEAR_PX)) return false;
  }
  return true;
}

function gatesFrom(d: JetskiDock): SlalomGate[] {
  const ax = d.out;
  const side = { x: -ax.y, y: ax.x };
  const gates: SlalomGate[] = [];
  for (let i = 0; i < SLALOM_GATES; i++) {
    const along = FIRST_GATE_PX + i * GATE_PITCH_PX;
    const zig = i % 2 === 0 ? ZIG_PX : -ZIG_PX;
    const centre = { x: d.skiPx.x + ax.x * along + side.x * zig, y: d.skiPx.y + ax.y * along + side.y * zig };
    gates.push({
      centre,
      left: { x: centre.x - side.x * GATE_HALF_PX, y: centre.y - side.y * GATE_HALF_PX },
      right: { x: centre.x + side.x * GATE_HALF_PX, y: centre.y + side.y * GATE_HALF_PX },
    });
  }
  return gates;
}

export function planJetskiCourse(docks: readonly JetskiDock[], seaOk: (x: number, y: number) => boolean): JetskiCourse {
  // The slalom goes off the first dock (the best placed) whose course is all
  // open water; the others get a ramp each. A dock with no room gets neither.
  let slalomDock = -1;
  let gates: SlalomGate[] = [];
  for (let i = 0; i < docks.length && slalomDock < 0; i++) {
    const g = gatesFrom(docks[i]);
    if (g.every((gate) => clearSea(seaOk, gate.centre))) {
      slalomDock = i;
      gates = g;
    }
  }
  const ramps: SkiRamp[] = [];
  docks.forEach((d, i) => {
    if (i === slalomDock) {
      // One past the slalom's finish, lined up with the course: a jump to end on.
      const last = gates[gates.length - 1].centre;
      const at = { x: last.x + d.out.x * GATE_PITCH_PX * 1.4, y: last.y + d.out.y * GATE_PITCH_PX * 1.4 };
      if (clearSea(seaOk, at)) ramps.push({ at, dir: d.out });
      return;
    }
    const at = { x: d.skiPx.x + d.out.x * RAMP_OUT_PX, y: d.skiPx.y + d.out.y * RAMP_OUT_PX };
    if (clearSea(seaOk, at)) ramps.push({ at, dir: d.out });
  });
  return { slalomDock, gates, axis: slalomDock >= 0 ? docks[slalomDock].out : { x: 0, y: 1 }, ramps };
}

// ---------- The slalom run ----------

export type SlalomEvent =
  | { kind: 'start' }
  | { kind: 'gate'; index: number; made: boolean }
  | { kind: 'finish'; made: number; total: number; ms: number };

export interface SlalomRun {
  /** Next gate to drive through; 0 = not started. */
  next: number;
  made: number;
  startMs: number;
  /** Along-course position of the ski last step, px (to catch line crossings). */
  lastAlong: number | null;
}

export function newSlalomRun(): SlalomRun {
  return { next: 0, made: 0, startMs: 0, lastAlong: null };
}

/** Steps the run with the ski's position. Crossing gate `next`'s line (the
 *  perpendicular to the course through its centre) going outward counts it:
 *  made if between the buoys, missed otherwise. Gate 0 starts the clock (a
 *  miss there does not start a run); the last gate finishes. Driving back
 *  through gate 0 restarts a run. Returns what happened, if anything. */
export function stepSlalom(run: SlalomRun, course: JetskiCourse, p: Pt, nowMs: number): SlalomEvent | null {
  const { gates, axis } = course;
  if (gates.length === 0) return null;
  const target = run.next < gates.length ? run.next : 0;
  const g = gates[target];
  const along = (p.x - g.centre.x) * axis.x + (p.y - g.centre.y) * axis.y;
  const prev = run.lastAlong;
  run.lastAlong = along;
  // A finished run waits for the kid to come back round to gate 0.
  if (prev === null || !(prev < 0 && along >= 0)) return null;
  run.lastAlong = null; // the next gate measures from its own line
  const lateral = Math.abs((p.x - g.centre.x) * -axis.y + (p.y - g.centre.y) * axis.x);
  const made = lateral <= GATE_HALF_PX;
  if (target === 0) {
    if (!made) return null;
    run.next = 1;
    run.made = 1;
    run.startMs = nowMs;
    return { kind: 'start' };
  }
  if (made) run.made += 1;
  run.next = target + 1;
  if (run.next >= gates.length) {
    const ev: SlalomEvent = { kind: 'finish', made: run.made, total: gates.length, ms: nowMs - run.startMs };
    run.next = gates.length; // done; gate 0 starts a new run
    return ev;
  }
  return { kind: 'gate', index: target, made };
}
