// Ephemeral guest wallet — client-side only.
//
// The guest sandbox lives outside the family/wallet model, so it has no
// kid_tokens row and POST /api/attempts never mints real coins for it. But for
// playtesting we still want the reward loop to feel real: the game-over screen
// shows "+N 🪙" and the town coin pill counts up during the session.
//
// We keep that running total in sessionStorage so it survives navigating
// between a game and the town, but resets when the guest session ends (close
// tab / new session) — exactly the "sandbox, not saved" semantics we want.
// Real kids never read this; their balance comes from the server.

const KEY = 'gc_guest_coins';

/** Current ephemeral guest balance (0 on the server / when storage is blocked). */
export function getGuestCoins(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Number.parseInt(window.sessionStorage.getItem(KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/** Add `n` coins to the ephemeral guest balance; returns the new total. */
export function addGuestCoins(n: number): number {
  const next = getGuestCoins() + Math.max(0, n);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(KEY, String(next));
    } catch {
      // storage blocked — badge still shows this run, just won't persist
    }
  }
  return next;
}
