// Active-kid cookie — which kid profile is currently "playing."
//
// This is a separate cookie from the parent gate on purpose:
//   - The parent cookie answers "is the household authenticated at all?"
//   - The active-kid cookie answers "which kid is in the driver's seat right now?"
//
// A parent can switch kids without re-entering the password, and signing out
// of the parent gate doesn't unset the active kid (we just stop honoring it
// because every kid-scoped page runs through `requireParentCookie()` first).
//
// No signing. The cookie value is just the kid UUID. Two reasons this is safe
// in Phase 1:
//   1. The parent gate sits in front of every page, so an unauthenticated
//      attacker can never reach a point where the active-kid cookie matters.
//   2. The worst thing a tampered active-kid cookie can do is show one
//      sibling's map when the other tapped the screen. Annoyance, not breach.
//      When we introduce cross-kid data (e.g., a parent dashboard with per-kid
//      stats) we'll revisit and either sign this cookie or look up kids by a
//      signed session token.

import { cookies } from 'next/headers';

const COOKIE_NAME = 'lw_kid';
// 400 days is the practical maximum for persistent cookies — Chrome/Safari
// cap longer values per RFC 6265bis. With this, a parent can leave a kid's
// profile selected on the iPad indefinitely; coming back weeks later the
// kid lands on /map (active-kid still set) instead of the picker.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

/** Set the active-kid cookie. Route Handler / Server Action only. */
export async function setActiveKid(kidId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, kidId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Read the active-kid id, or null if none is set. Callable anywhere. */
export async function getActiveKid(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

/** Clear the active-kid cookie. Route Handler / Server Action only. */
export async function clearActiveKid(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
