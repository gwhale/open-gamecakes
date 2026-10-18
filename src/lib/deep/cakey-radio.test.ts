// Two rules in cakey-radio.ts are load-bearing rather than stylistic, and both
// are the kind a future line gets written past without anyone noticing.

import { describe, expect, it } from 'vitest';
import {
  ALL_RADIO_LINES,
  SONAR_HIT_LINES,
  SONAR_EMPTY_LINES,
  ITEM_LINES,
  CHEST_LINES,
  radioLine,
  itemLine,
} from './cakey-radio';
import { BAKING_ITEMS } from '@/lib/items/catalog';

describe('Cakey on the radio', () => {
  it('never names the find in a sonar line', () => {
    // Sonar reports a bearing and a range and nothing else — that is the whole
    // mechanic. A line saying "a whisk, 74m northeast" hands the kid the answer
    // and deletes the reason to go and look.
    for (const line of [...SONAR_HIT_LINES, ...SONAR_EMPTY_LINES]) {
      expect(line.toLowerCase()).not.toContain('whisk');
    }
  });

  it('keeps every line short enough to read in a glance', () => {
    // These render in a speech bubble over a moving submarine on a tablet. A
    // line the kid is still reading when the moment has passed is a line that
    // did not happen.
    for (const line of ALL_RADIO_LINES) {
      expect(line.length, line).toBeLessThanOrEqual(90);
    }
  });

  it('avoids repeating the line it was just given', () => {
    const first = radioLine('reef');
    const second = radioLine('reef', first.index);
    expect(second.index).not.toBe(first.index);
  });

  it('has something to say about every single item', () => {
    // Nine of the ten chests used to share one line, so the ninth sounded like
    // the second. An item added to the catalog without lines here would quietly
    // put us back there -- it would still SPEAK, via the fallback, just not
    // about the thing the kid is looking at.
    for (const item of BAKING_ITEMS) {
      expect(ITEM_LINES[item.slug], `no lines for ${item.slug}`).toBeTruthy();
      expect(ITEM_LINES[item.slug].length, item.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('has no lines for an item that does not exist', () => {
    const slugs = new Set(BAKING_ITEMS.map((i) => i.slug));
    for (const key of Object.keys(ITEM_LINES)) {
      expect(slugs.has(key), `${key} is not in the item catalog`).toBe(true);
    }
  });

  it('still says something for an item it has never heard of', () => {
    // A chest that grants in silence is worse than a generic line.
    const { line } = itemLine('marzipan-trebuchet');
    expect(CHEST_LINES).toContain(line);
  });

  it('never explains what the collection is for', () => {
    // George is holding that design and it is deliberately not written down in
    // the code. Cakey finding out on the kid's behalf would spend it.
    //
    // Note what is NOT banned: the word 'recipe'. The whisk's oldest line is
    // 'I forget my own recipe', which is Cakey talking about being a cake, not
    // about the collection. Banning the word caught that joke and would have
    // had the test rewrite established copy to satisfy itself.
    const banned = ['collect all', 'complete the set', 'you will need', 'all ten'];
    for (const line of Object.values(ITEM_LINES).flat()) {
      for (const phrase of banned) {
        expect(line.toLowerCase(), line).not.toContain(phrase);
      }
    }
  });
});
