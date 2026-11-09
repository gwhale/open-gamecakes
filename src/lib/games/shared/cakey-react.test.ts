import { describe, expect, it, vi } from 'vitest';
import {
  emitCakeyEvent,
  hasSideCakey,
  reactToAnswer,
  registerSideCakey,
  subscribeCakeyEvents,
  subscribeCakeyView,
} from './cakey-react';

describe('reactToAnswer', () => {
  it('celebrates a right answer and clears the wrong streak', () => {
    expect(reactToAnswer(true, 3)).toEqual({ show: 'celebrate', wrongStreak: 0 });
  });

  it('says Oops on the first wrong answer in a row only', () => {
    let streak = 0;
    const shown: (string | null)[] = [];
    for (const correct of [false, false, false, true, false]) {
      const r = reactToAnswer(correct, streak);
      shown.push(r.show);
      streak = r.wrongStreak;
    }
    expect(shown).toEqual(['oops', null, null, 'celebrate', 'oops']);
  });
});

describe('cakey events', () => {
  it('delivers to subscribers until they unsubscribe', () => {
    const listener = vi.fn();
    const off = subscribeCakeyEvents(listener);
    emitCakeyEvent({ type: 'answered', correct: true });
    off();
    emitCakeyEvent({ type: 'activity' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: 'answered', correct: true });
  });

  it('tells a late subscriber that a question is already open', () => {
    emitCakeyEvent({ type: 'question-open' });
    const late = vi.fn();
    const off = subscribeCakeyEvents(late);
    expect(late).toHaveBeenCalledWith({ type: 'question-open' });
    emitCakeyEvent({ type: 'question-close' });
    off();
    const later = vi.fn();
    subscribeCakeyEvents(later)();
    expect(later).not.toHaveBeenCalled();
  });
});

describe('side Cakey presence', () => {
  // The corner Cakey hides exactly while one is registered, and comes back
  // when the dialog (and the side Cakey with it) closes.
  it('is on while any side Cakey is registered and tells listeners', () => {
    const seen = vi.fn();
    const off = subscribeCakeyView(seen);
    expect(hasSideCakey()).toBe(false);
    const a = registerSideCakey();
    const b = registerSideCakey();
    a();
    expect(hasSideCakey()).toBe(true);
    b();
    expect(hasSideCakey()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(4);
    off();
  });
});
