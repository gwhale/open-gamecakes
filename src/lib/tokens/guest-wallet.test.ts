// The sandbox's pill read 0 and stayed 0, which made the demo look like a
// locked account. Two separate causes, and this file pins the one that lives
// here: a fresh session used to be indistinguishable from an empty one.

import { describe, expect, it, afterEach } from 'vitest';
import { getGuestCoins, addGuestCoins } from './guest-wallet';
import { GUEST_BALANCE } from './economy';

/** Install a fake sessionStorage on globalThis.window for one test. */
function withStorage(initial: Record<string, string> | null): void {
  const store = new Map(Object.entries(initial ?? {}));
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('the guest wallet', () => {
  it('hands a brand-new session the whole allowance', () => {
    // THE BUG. `?? '0'` could not tell "never stored" from "stored a zero", so
    // every guest started broke.
    withStorage(null);
    expect(getGuestCoins()).toBe(GUEST_BALANCE);
  });

  it('remembers a balance that really was spent down', () => {
    withStorage({ gc_guest_coins: '12' });
    expect(getGuestCoins()).toBe(12);
  });

  it('honours a stored zero rather than refilling it', () => {
    // Otherwise the allowance would silently top itself up, and no number on
    // the pill would mean anything.
    withStorage({ gc_guest_coins: '0' });
    expect(getGuestCoins()).toBe(0);
  });

  it('falls back to the allowance on junk', () => {
    withStorage({ gc_guest_coins: 'not-a-number' });
    expect(getGuestCoins()).toBe(GUEST_BALANCE);
  });

  it('gives the allowance on the server, where there is no storage at all', () => {
    // The town page renders this value server-side before hydration; a 0 here
    // would flash an empty pill on every guest load.
    expect(getGuestCoins()).toBe(GUEST_BALANCE);
  });

  it('adds winnings on top of the allowance', () => {
    withStorage(null);
    expect(addGuestCoins(5)).toBe(GUEST_BALANCE + 5);
    expect(getGuestCoins()).toBe(GUEST_BALANCE + 5);
  });

  it('is generous enough that nothing in the town is out of reach', () => {
    // The sandbox exists to show the game. If the dearest thing on the ladder
    // were unaffordable, the demo would stop demonstrating it.
    expect(GUEST_BALANCE).toBeGreaterThan(500);
  });
});
