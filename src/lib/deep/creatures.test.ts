// The bestiary is content, so most of it is a judgement call. These pin the
// few things that are not — the ones that would quietly hollow out the dive.

import { describe, expect, it } from 'vitest';
import { CREATURES, creaturesAtDepth, findCreature } from './creatures';
import { BAND, DEPTH_LIMIT_M } from './types';

describe('the bestiary', () => {
  it('leaves no dead water between the surface and the depth limit', () => {
    // The whole feature is built to make going deeper worth doing. A depth band
    // with nothing alive in it is a stretch of the dive where the reward for
    // descending is a bigger number, and this is the test that says so.
    for (let d = 0; d <= DEPTH_LIMIT_M; d += 10) {
      expect(creaturesAtDepth(d).length, `nothing lives at ${d}m`).toBeGreaterThan(0);
    }
  });

  it('gives every named band its own residents', () => {
    const at = (d: number) => creaturesAtDepth(d).map((c) => c.slug);
    const reef = at(BAND.SPRINKLE_REEF.from + 40);
    const kelp = at(BAND.KELP_KITCHEN.from + 100);
    const canyon = at(BAND.CRUMB_CANYON.from + 10);

    // Each band has life...
    expect(reef.length).toBeGreaterThan(0);
    expect(kelp.length).toBeGreaterThan(0);
    expect(canyon.length).toBeGreaterThan(0);
    // ...and going deeper actually changes who you meet, or depth is decoration.
    expect(reef).not.toEqual(kelp);
    expect(kelp).not.toEqual(canyon);
    expect(canyon).not.toContain('sprinklefish');
  });

  it('keeps the joke outnumbered', () => {
    // The PRD: "Not every creature should be cake-shaped. Otherwise the joke
    // murders the worldbuilding." Two of five are pastries; the rest are
    // animals. If someone adds three more puddings this fails, and it should.
    const pastries = CREATURES.filter((c) => /donut|pancake|cake|biscuit|scone/i.test(c.name));
    expect(pastries.length * 2).toBeLessThanOrEqual(CREATURES.length);
  });

  it('only lights up things that live where the light does not reach', () => {
    // A glowing fish in bright shallow water is just a bright fish, and it
    // spends the effect that makes the deep feel different.
    for (const c of CREATURES.filter((x) => x.glows)) {
      expect(c.depth.to, `${c.name} glows but lives shallow`).toBeGreaterThan(150);
    }
  });

  it('has something living below where the sub can go', () => {
    // Seen, never met. Same job as the glow at the depth limit.
    const beyond = CREATURES.filter((c) => c.depth.to > DEPTH_LIMIT_M);
    expect(beyond.length).toBeGreaterThan(0);
  });

  it('has unique slugs, since spawns are seeded off them', () => {
    expect(new Set(CREATURES.map((c) => c.slug)).size).toBe(CREATURES.length);
    expect(findCreature('sprinklefish')).toBeDefined();
    expect(findCreature('nope')).toBeUndefined();
  });

  it('describes a real depth range for every creature', () => {
    for (const c of CREATURES) {
      expect(c.depth.from, c.name).toBeGreaterThanOrEqual(0);
      expect(c.depth.to, c.name).toBeGreaterThan(c.depth.from);
      expect(c.count, c.name).toBeGreaterThan(0);
    }
  });
});
