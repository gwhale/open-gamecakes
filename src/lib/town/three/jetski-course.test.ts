// The jet ski slalom and ramps on a synthetic coast: land is y < 0, the sea
// y > 0, and three docks face out to sea (+y).

import { describe, expect, it } from 'vitest';
import { GATE_HALF_PX, SLALOM_GATES, newSlalomRun, planJetskiCourse, stepSlalom, type SlalomEvent } from './jetski-course';
import type { JetskiDock } from './jetski-docks';

const dock = (x: number): JetskiDock => ({
  beachPx: { x, y: -100 },
  shorePx: { x, y: 0 },
  skiPx: { x, y: 112 },
  out: { x: 0, y: 1 },
});
const docks = [dock(0), dock(3000), dock(-3000)];
const sea = (_x: number, y: number): boolean => y > 60;

describe('planJetskiCourse', () => {
  const c = planJetskiCourse(docks, sea);

  it('lays the slalom off the first dock, in open water, zig-zagging outward', () => {
    expect(c.slalomDock).toBe(0);
    expect(c.gates).toHaveLength(SLALOM_GATES);
    for (let i = 1; i < c.gates.length; i++) {
      expect(c.gates[i].centre.y).toBeGreaterThan(c.gates[i - 1].centre.y);
      expect(Math.sign(c.gates[i].centre.x)).toBe(-Math.sign(c.gates[i - 1].centre.x));
    }
  });

  it('gives every dock a ramp facing out to sea', () => {
    expect(c.ramps).toHaveLength(3);
    for (const r of c.ramps) expect(r.dir).toEqual({ x: 0, y: 1 });
  });

  it('skips a dock whose course would run aground', () => {
    const shallow = (x: number, y: number): boolean => y > 60 && (x > 1000 || y < 1500);
    const c2 = planJetskiCourse(docks, shallow);
    expect(c2.slalomDock).toBe(1);
  });

  it('places nothing with no open sea', () => {
    const c3 = planJetskiCourse(docks, () => false);
    expect(c3.slalomDock).toBe(-1);
    expect(c3.gates).toEqual([]);
    expect(c3.ramps).toEqual([]);
  });
});

describe('stepSlalom', () => {
  const c = planJetskiCourse(docks, sea);
  // Drive straight out along a lane, offsetting x per gate, collecting events.
  function drive(xAt: (gate: number) => number): SlalomEvent[] {
    const run = newSlalomRun();
    const evs: SlalomEvent[] = [];
    let t = 0;
    for (let y = 150; y < c.gates[c.gates.length - 1].centre.y + 200; y += 10) {
      t += 30;
      // Which gate's band are we in? Use the nearest gate by y.
      let gi = 0;
      for (let i = 0; i < c.gates.length; i++) if (Math.abs(c.gates[i].centre.y - y) < Math.abs(c.gates[gi].centre.y - y)) gi = i;
      const ev = stepSlalom(run, c, { x: xAt(gi), y }, t);
      if (ev) evs.push(ev);
    }
    return evs;
  }

  it('times a clean run through every gate', () => {
    const evs = drive((i) => c.gates[i].centre.x);
    expect(evs[0]).toEqual({ kind: 'start' });
    const fin = evs[evs.length - 1];
    expect(fin.kind).toBe('finish');
    if (fin.kind === 'finish') {
      expect(fin.made).toBe(SLALOM_GATES);
      expect(fin.ms).toBeGreaterThan(0);
    }
  });

  it('counts a gate passed outside its buoys as missed, and carries on', () => {
    const evs = drive((i) => (i === 3 ? c.gates[i].centre.x + GATE_HALF_PX * 3 : c.gates[i].centre.x));
    expect(evs).toContainEqual({ kind: 'gate', index: 3, made: false });
    const fin = evs[evs.length - 1];
    expect(fin.kind === 'finish' && fin.made).toBe(SLALOM_GATES - 1);
  });

  it('does not start a run that misses the first gate', () => {
    const evs = drive(() => 5000);
    expect(evs).toEqual([]);
  });
});
