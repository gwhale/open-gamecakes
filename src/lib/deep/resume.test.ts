// The resume rule is about FEEL, not data, so it has no natural symptom when
// it breaks — a dive that starts in the wrong place still works perfectly.
// These pin the decision.

import { describe, expect, it } from 'vitest';
import { pickDeepSpawn } from './resume';
import { REEF_SPAWN, RESUME_WINDOW_MS } from './types';

const NOW = Date.parse('2026-09-05T12:00:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const pose = (updated_at: string) => ({ x: 40, y: -300, z: 420, heading: 1.2, updated_at });

describe('pickDeepSpawn', () => {
  it('starts at the reef when there is nothing saved', () => {
    expect(pickDeepSpawn(null, NOW)).toEqual({ ...REEF_SPAWN });
    expect(pickDeepSpawn(undefined, NOW)).toEqual({ ...REEF_SPAWN });
  });

  it('resumes a dive the kid stepped out of moments ago', () => {
    const spawn = pickDeepSpawn(pose(at(60_000)), NOW);
    expect(spawn).toEqual({ x: 40, y: -300, z: 420, heading: 1.2 });
  });

  it('starts a NEW dive at the reef once the save is stale', () => {
    // The whole point: a kid who parked at 320m in the dark yesterday gets the
    // descent again today, instead of opening on a black screen at the wall.
    const spawn = pickDeepSpawn(pose(at(RESUME_WINDOW_MS + 1000)), NOW);
    expect(spawn).toEqual({ ...REEF_SPAWN });
  });

  it('treats an unreadable timestamp as stale rather than trusting it', () => {
    expect(pickDeepSpawn(pose('not a date'), NOW)).toEqual({ ...REEF_SPAWN });
  });

  it('refuses a row with a non-finite coordinate', () => {
    // A NaN reaching the engine would put the submarine nowhere at all, and
    // every frame after would be NaN too.
    const bad = { ...pose(at(1000)), y: Number.NaN };
    expect(pickDeepSpawn(bad, NOW)).toEqual({ ...REEF_SPAWN });
  });

  it('resumes rather than resets when the clock has gone backwards', () => {
    const spawn = pickDeepSpawn(pose(at(-5000)), NOW);
    expect(spawn.z).toBe(420);
  });
});
