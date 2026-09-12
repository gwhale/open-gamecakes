// Ephemeral guest wallet — client-side only.
//
// The guest sandbox lives outside the family/wallet model, so it has no
// kid_tokens row and POST /api/attempts never mints real coins for it. But for
// playtesting we still want the reward loop to feel real: the game-over screen
// shows "+N 🪙" and the town coin pill counts up during the session.
//
// It STARTS at GUEST_BALANCE rather than at zero. An empty pill made the
// sandbox read as a locked account — which is the opposite of what a demo is
// for — and every sink in the town waives its charge for guests anyway, so a
// zero here bought nothing but a discouraging number.
//
// We keep that running total in sessionStorage so it survives navigating
// between a game and the town, but resets when the guest session ends (close
// tab / new session) — exactly the "sandbox, not saved" semantics we want.
// Real kids never read this; their balance comes from the server.

import { GUEST_BALANCE } from '@/lib/tokens/economy';

const KEY = 'gc_guest_coins';

/** Current ephemeral guest balance.
 *
 *  A session that has never stored anything gets the full allowance — note the
 *  null check rather than `?? '0'`, which is what makes "fresh session" and
 *  "spent down to zero" different states. */
export function getGuestCoins(): number {
  if (typeof window === 'undefined') return GUEST_BALANCE;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return GUEST_BALANCE;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : GUEST_BALANCE;
  } catch {
    // Storage blocked. The allowance is the friendlier failure.
    return GUEST_BALANCE;
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
