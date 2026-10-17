// Rate limit for open signup.
//
// Only consulted when signupMode() is 'open'. An invite code is already a
// rate limit — codes are single-use and someone had to mint each one — so an
// invited signup is never counted or blocked by anything here.
//
// See migration 0053 for why the counter lives in Postgres rather than in
// process memory (short version: Vercel lambdas do not share memory, so an
// in-process limit of 5 is really 5 x instances, and it reports success).

import crypto from 'node:crypto';
import { supabaseServer } from '@/lib/supabase/server';
import { openSignupsPerDay } from './signup-mode';

/**
 * The salt mixed into IP hashes.
 *
 * An unsalted hash of an IP is not anonymisation: the whole IPv4 space is 2^32
 * values, so anyone holding the table can enumerate it in seconds. The salt is
 * what makes the stored key genuinely opaque.
 *
 * It falls back to a digest of the service key rather than requiring a new
 * variable. That key is secret, always present (nothing here runs without it),
 * and never leaves the server — so the fallback has the property that matters
 * and there is no way to end up accidentally unsalted. Set
 * SIGNUP_THROTTLE_SALT to rotate the buckets independently.
 */
function salt(): string {
  const explicit = process.env.SIGNUP_THROTTLE_SALT;
  if (explicit) return explicit;
  const key = process.env.SUPABASE_SECRET_KEY ?? '';
  return crypto.createHash('sha256').update('signup-throttle:' + key).digest('hex');
}

/**
 * Who is asking, as an opaque per-day key.
 *
 * `x-vercel-forwarded-for` is preferred because Vercel's edge SETS it and
 * overwrites whatever the client sent. Plain `x-forwarded-for` is appended to
 * by proxies and its leftmost entry is client-supplied, so on a deployment
 * without a trusted proxy in front this is defeatable by anyone who knows to
 * send the header. That is worth being plain about: this is a ceiling on
 * casual and accidental abuse, not a defence against a determined attacker.
 * The things that actually bound a determined attacker are the restricted
 * tier (no paid model calls) and the kid cap.
 *
 * A request with no usable address at all shares the 'unknown' bucket rather
 * than being waved through — an unattributable signup is exactly the one not
 * to trust.
 */
export function signupBucket(headers: Headers, now = new Date()): string {
  const vercel = headers.get('x-vercel-forwarded-for');
  const forwarded = headers.get('x-forwarded-for');
  const ip =
    vercel?.split(',')[0]?.trim() ||
    forwarded?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    'unknown';

  const hash = crypto.createHash('sha256').update(ip + salt()).digest('hex').slice(0, 32);
  // Day-resolution bucket, matching the per-day limit. Slicing the ISO string
  // avoids a timezone question: it is always UTC.
  return hash + ':' + now.toISOString().slice(0, 10);
}

export interface ThrottleResult {
  allowed: boolean;
  /** Set when the throttle could not run. The caller should say so rather than
   *  pretending the limit was hit — they are different problems. */
  brokenReason?: string;
}

/**
 * Count this signup and say whether it may proceed.
 *
 * FAILS CLOSED. If the counter cannot be reached — migration 0053 not applied,
 * database unreachable — this returns `allowed: false`. That is deliberate and
 * it is the opposite of what most guards should do:
 *
 *   - Failing open turns the exact situation this protects against (throttle
 *     not working) into unlimited unauthenticated family creation, and it is
 *     invisible, because everything appears to succeed.
 *   - Failing closed makes open signup temporarily unavailable. Invite signup
 *     still works, because it never consults this. So the deployment owner
 *     always has a working path for a real person while they fix it.
 *
 * A broken throttle should cost a stranger a wait, not cost the owner a bill.
 */
export async function claimSignupSlot(headers: Headers): Promise<ThrottleResult> {
  const bucket = signupBucket(headers);
  try {
    const sb = supabaseServer();
    const { data, error } = await sb.rpc('claim_signup_slot', {
      p_bucket: bucket,
      p_limit: openSignupsPerDay(),
    });
    if (error) {
      console.error('[signup] throttle unavailable:', error.message);
      return { allowed: false, brokenReason: error.message };
    }
    return { allowed: data === true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    console.error('[signup] throttle threw:', message);
    return { allowed: false, brokenReason: message };
  }
}
