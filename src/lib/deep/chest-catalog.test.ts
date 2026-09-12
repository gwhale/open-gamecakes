// The chests are authored content, so most of this is a judgement call. These
// pin the parts that are not — the ones that would put a chest somewhere a kid
// can never reach, or hand out an item that does not exist.

import { describe, expect, it } from 'vitest';
import { DEEP_CHESTS, findChest, isChestSlug } from './chest-catalog';
import { oceanFloorM } from './ocean-floor';
import { BAND, DEPTH_LIMIT_M, DOMAIN_RADIUS_M } from './types';
import { BAKING_ITEMS, findItem } from '@/lib/items/catalog';

const depthOf = (c: { x: number; z: number }) => -oceanFloorM(c.x, c.z);

describe('the chest catalog', () => {
  it('puts every chest within reach of the submarine', () => {
    // Sub-Cake One stops at DEPTH_LIMIT_M. A chest below it is an item a kid
    // can see on sonar, swim toward, and never open — the one genuinely cruel
    // thing this feature could do.
    for (const c of DEEP_CHESTS) {
      expect(depthOf(c), `${c.slug} is at ${depthOf(c).toFixed(0)}m`).toBeLessThan(DEPTH_LIMIT_M);
    }
  });

  it('puts every chest in the band it claims', () => {
    // The bands ARE the difficulty curve; a canyon chest sitting on the reef is
    // a reward out of order, and nothing else would notice.
    const range = { reef: BAND.SPRINKLE_REEF, kelp: BAND.KELP_KITCHEN, canyon: BAND.CRUMB_CANYON };
    for (const c of DEEP_CHESTS) {
      const d = depthOf(c);
      const r = range[c.band];
      expect(d, `${c.slug} claims ${c.band} but sits at ${d.toFixed(0)}m`).toBeGreaterThanOrEqual(r.from);
      expect(d, `${c.slug} claims ${c.band} but sits at ${d.toFixed(0)}m`).toBeLessThanOrEqual(r.to);
    }
  });

  it('spreads them out, so finding one is not finding three', () => {
    // Sonar reports the nearest returns. Two chests within a ping of each other
    // collapse two separate discoveries into one.
    for (let i = 0; i < DEEP_CHESTS.length; i++) {
      for (let j = i + 1; j < DEEP_CHESTS.length; j++) {
        const a = DEEP_CHESTS[i];
        const b = DEEP_CHESTS[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d, `${a.slug} and ${b.slug} are ${d.toFixed(0)}m apart`).toBeGreaterThan(100);
      }
    }
  });

  it('keeps every chest inside the world', () => {
    for (const c of DEEP_CHESTS) {
      expect(Math.hypot(c.x, c.z), c.slug).toBeLessThan(DOMAIN_RADIUS_M);
    }
  });

  it('hands out an item that actually exists', () => {
    for (const c of DEEP_CHESTS) {
      expect(findItem(c.item), `${c.slug} holds unknown item "${c.item}"`).toBeTruthy();
    }
  });

  it('makes every item in the collection findable exactly once', () => {
    // Otherwise the collection has a slot nothing can ever fill, and a kid who
    // has found everything is told they have not.
    const held = DEEP_CHESTS.map((c) => c.item).sort();
    const all = BAKING_ITEMS.map((i) => i.slug).sort();
    expect(held).toEqual(all);
  });

  it('has no duplicate slugs', () => {
    const slugs = DEEP_CHESTS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps the whisk under the slug it already shipped with', () => {
    // Both kids have a kid_deep_discoveries row under 'sunken-whisk' from when
    // it was a loose whisk on the reef. Renaming it orphans that history and
    // re-locks a chest they already opened.
    const whisk = findChest('sunken-whisk');
    expect(whisk, "'sunken-whisk' is gone").toBeTruthy();
    expect(whisk!.item).toBe('whisk');
  });

  it('never says what is inside', () => {
    // Sonar gives a bearing and a range. If the echo or the prompt names the
    // contents, the swim there has already been paid out.
    const names = BAKING_ITEMS.flatMap((i) => [i.slug, ...i.name.toLowerCase().split(/\s+/)]);
    for (const c of DEEP_CHESTS) {
      const text = `${c.echo} ${c.prompt}`.toLowerCase();
      for (const n of names) {
        if (n.length < 4) continue;
        expect(text.includes(n), `${c.slug} gives away "${n}"`).toBe(false);
      }
    }
  });

  it('validates slugs the way the grant route will', () => {
    expect(isChestSlug('sunken-whisk')).toBe(true);
    expect(isChestSlug('not-a-chest')).toBe(false);
    expect(isChestSlug('')).toBe(false);
  });
});
