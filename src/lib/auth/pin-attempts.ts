// Limits on guessing the grown-up PIN.
//
// A 4-digit PIN has 10,000 values, so the limit is what makes it worth having.
// Five tries per 15 minutes alone would still allow 480 a day. The daily cap
// stretches working through every 4-digit PIN to over a year.
//
// Counted in Postgres because each Vercel instance has its own memory, using
// claim_signup_slot (migration 0053) rather than a second copy of the same
// function. It increments atomically, so parallel guesses can't slip past the
// count, and it prunes rows after a day. Bucket names carry a hash, not a
// family id, in keeping with that table's rule of storing nothing identifying.
//
// A correct PIN clears the counters. A child can lock the gate by guessing, but
// only until the window ends, and that is the safer way for it to fail.

import { createHash } from 'node:crypto';
import { supabaseServer } from '@/lib/supabase/server';

export const PIN_TRIES_PER_WINDOW = 5;
export const PIN_WINDOW_MS = 15 * 60 * 1000;
export const PIN_TRIES_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export function pinBuckets(familyId: string, nowMs: number): { window: string; day: string } {
  const id = createHash('sha256').update(`lw-pin-attempts:${familyId}`).digest('hex').slice(0, 32);
  return {
    window: `pin-w:${id}:${Math.floor(nowMs / PIN_WINDOW_MS)}`,
    day: `pin-d:${id}:${Math.floor(nowMs / DAY_MS)}`,
  };
}

/**
 * Spend one try. False means locked, or that the counter could not be read:
 * a broken limiter must not become an unlimited one.
 *
 * Call this BEFORE comparing the PIN, so the count can't be raced.
 */
export async function claimPinAttempt(familyId: string, nowMs: number = Date.now()): Promise<boolean> {
  const sb = supabaseServer();
  const buckets = pinBuckets(familyId, nowMs);
  // The window goes first, so tries refused by it don't also spend the day's.
  for (const [bucket, limit] of [
    [buckets.window, PIN_TRIES_PER_WINDOW],
    [buckets.day, PIN_TRIES_PER_DAY],
  ] as const) {
    const { data, error } = await sb.rpc('claim_signup_slot', { p_bucket: bucket, p_limit: limit });
    if (error) {
      console.warn('[pin-attempts] limiter unavailable:', error.message);
      return false;
    }
    if (data !== true) return false;
  }
  return true;
}

/** After a correct PIN. Best effort: at worst the counters age out on their own. */
export async function clearPinAttempts(familyId: string, nowMs: number = Date.now()): Promise<void> {
  const buckets = pinBuckets(familyId, nowMs);
  const { error } = await supabaseServer()
    .from('signup_attempts')
    .delete()
    .in('bucket', [buckets.window, buckets.day]);
  if (error) console.warn('[pin-attempts] could not clear:', error.message);
}
