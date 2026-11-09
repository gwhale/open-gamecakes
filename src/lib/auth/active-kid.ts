// Active-kid cookie — which kid profile is currently "playing."
//
// This is a separate cookie from the parent gate on purpose:
//   - The parent cookie answers "is the household authenticated at all?"
//   - The active-kid cookie answers "which kid is in the driver's seat right now?"
//
// A parent can switch kids without re-entering the password, and signing out
// doesn't unset the cookie: getActiveKid() just stops honoring it.
//
// No signing. The cookie value is just the kid UUID, so anyone can set it to
// anything. getActiveKid() therefore checks it against the signed-in family on
// every read. The (gated) layout can't do this for a page: the two render
// concurrently, so a page's data reaches the response body even when the layout
// redirects. The check has to sit in what the page itself awaits.

import { cache } from 'react';
import { cookies } from 'next/headers';
import { getCurrentFamily } from '@/lib/auth/family';
import { supabaseServer } from '@/lib/supabase/server';

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

/** The raw cookie value, unverified. Only for detecting a stale cookie so it can
 *  be cleared. Never load a kid's data with this; use getActiveKid(). */
export async function readActiveKidCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

/** The active kid's id, or null unless a signed-in family owns that kid. Fails
 *  closed on a database error. Memoized per render pass. */
export const getActiveKid = cache(async (): Promise<string | null> => {
  const kidId = await readActiveKidCookie();
  if (!kidId) return null;
  const family = await getCurrentFamily();
  if (!family) return null;
  const { data, error } = await supabaseServer()
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (error || !data) return null;
  return kidId;
});

/** Clear the active-kid cookie. Route Handler / Server Action only. */
export async function clearActiveKid(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
