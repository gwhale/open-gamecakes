// BA page gate — single shared password for the anonymous /ba arcade.
//
// /ba lives OUTSIDE the (gated) route group: no Supabase session, no
// family, no kid profile. Anyone with the password can play. The gate
// is deliberately the same trust level as the active-kid cookie (see
// src/lib/auth/active-kid.ts) — the worst a forged cookie unlocks is a
// sight-word memory game, so we don't sign it.
//
// The cookie value is a SHA-256 of the current password rather than a
// static marker: rotating BA_PASSWORD invalidates every previously
// unlocked browser with no session storage or versioning needed.

import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'lw_ba';
// Same 400-day cap as the active-kid cookie — grandparents/classrooms
// unlock once per device and stay unlocked.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

/** Env-overridable; fallback keeps the page working with zero config. */
function baPassword(): string {
  return process.env.BA_PASSWORD ?? 'wolf';
}

function accessToken(): string {
  return createHash('sha256').update(`lw-ba:${baPassword()}`).digest('hex');
}

/** Case-insensitive, whitespace-tolerant — typed by kids on iPads. */
export function checkBaPassword(submitted: string): boolean {
  return submitted.trim().toLowerCase() === baPassword().toLowerCase();
}

/** Set the unlock cookie. Route Handler / Server Action only. */
export async function grantBaAccess(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, accessToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** True when the browser holds a cookie minted from the CURRENT password. */
export async function hasBaAccess(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === accessToken();
}
