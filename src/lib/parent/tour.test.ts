import { describe, expect, it } from 'vitest';
import { cardPosition, isNewFamily, spotlightBox, tourSeenKey, tourSteps } from './tour';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const VIEWPORT = { width: 800, height: 600 };
const CARD = { width: 360, height: 200 };

describe('isNewFamily', () => {
  it('is true inside the window and false after it', () => {
    expect(isNewFamily('2026-11-07T11:00:00Z', NOW)).toBe(true);
    expect(isNewFamily('2026-10-25T12:00:00Z', NOW)).toBe(true);
    expect(isNewFamily('2026-10-24T12:00:00Z', NOW)).toBe(false);
  });

  it('does not interrupt anyone when the date is unreadable', () => {
    expect(isNewFamily('not a date', NOW)).toBe(false);
  });
});

describe('tourSeenKey', () => {
  it('differs per family', () => {
    expect(tourSeenKey('a')).not.toBe(tourSeenKey('b'));
  });
});

describe('tourSteps', () => {
  it('points the first step at adding a player when there are none', () => {
    expect(tourSteps(false)[0].title).toBe('Start with a player');
    expect(tourSteps(true)[0].title).toBe('Your players');
  });

  it('ends on handing the tablet back', () => {
    expect(tourSteps(true).at(-1)?.target).toBe('kid-mode');
  });
});

describe('spotlightBox', () => {
  it('pads the target', () => {
    expect(spotlightBox({ top: 100, left: 100, width: 50, height: 50 }, VIEWPORT)).toEqual({
      top: 92,
      left: 92,
      width: 66,
      height: 66,
    });
  });

  it('stays on screen for a target taller than the viewport', () => {
    const box = spotlightBox({ top: -100, left: 0, width: 800, height: 2000 }, VIEWPORT);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top + box.height).toBeLessThanOrEqual(VIEWPORT.height);
    expect(box.left + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  });
});

describe('cardPosition', () => {
  const inView = (p: { top: number; left: number }, card = CARD, view = VIEWPORT) => {
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top + card.height).toBeLessThanOrEqual(view.height);
    expect(p.left + card.width).toBeLessThanOrEqual(view.width);
  };

  it('prefers below the spotlight', () => {
    const p = cardPosition({ top: 50, left: 300, width: 100, height: 50 }, CARD, VIEWPORT);
    expect(p.top).toBe(116);
    inView(p);
  });

  it('goes above when there is no room below', () => {
    const p = cardPosition({ top: 450, left: 300, width: 100, height: 50 }, CARD, VIEWPORT);
    expect(p.top).toBe(234);
    inView(p);
  });

  it('pins to the bottom when the spotlight fills the screen', () => {
    const p = cardPosition({ top: 8, left: 8, width: 784, height: 584 }, CARD, VIEWPORT);
    expect(p.top).toBe(384);
    inView(p);
  });

  it('stays on screen beside a target at a phone edge', () => {
    const phone = { width: 375, height: 667 };
    const card = { width: 343, height: 220 };
    inView(cardPosition({ top: 20, left: 300, width: 70, height: 44 }, card, phone), card, phone);
    inView(cardPosition({ top: 20, left: 0, width: 70, height: 44 }, card, phone), card, phone);
  });
});
