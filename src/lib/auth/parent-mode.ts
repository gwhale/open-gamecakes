// Grown-up mode — the short-lived, server-verified elevation that turns the
// shared family session into role=parent. See migration 0033 + the /grownups
// page for the full model.
//
// WHY A SIGNED COOKIE (not just a boolean flag): the parent-only APIs (token
// grant, observations) trust this to gate writes. A plain cookie a kid could
// edit in devtools would defeat "lock the API". The cookie is HMAC-signed with
// a key DERIVED from SUPABASE_SECRET_KEY (always present server-side, never
// shipped to the browser) and bound to the family id + an expiry, so it can't
// be forged, replayed past expiry, or moved between families.
//
// Server-only. Never import this from a Client Component — it reads the
// Supabase secret and mints signed cookies.

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';

const COOKIE_NAME = 'lw_parent';

// Grown-up mode auto-expires so a tablet left on the parent screen re-locks
// itself. 30 min is long enough to manage a couple kids, short enough that a
// kid who picks up the iPad later lands back in the locked state.
const TTL_MS = 30 * 60 * 1000;

/** Derive the HMAC key from the server secret. Labelled + hashed so we're not
 *  using the raw Supabase secret directly as a signing key. */
function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set');
  return crypto.createHash('sha256').update('lw-parent-mode.v1:' + secret).digest();
}

/** HMAC over "<familyId>.<exp>" — binds the token to the family and expiry. */
function sign(familyId: string, exp: number): string {
  return crypto.createHmac('sha256', signingKey()).update(`${familyId}.${exp}`).digest('hex');
}

/** Constant-time compare of two equal-length hex strings. */
function safeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Hash a submitted/stored grown-up PIN. Salted with the family id so the same
 *  PIN in two families yields different hashes. Never store or send plaintext. */
export function hashParentPin(familyId: string, pin: string): string {
  return crypto.createHash('sha256').update(`${familyId}:${pin}`).digest('hex');
}

/** A grown-up PIN is 4–8 digits — simple enough to type on a tablet, not a
 *  single guessable digit. */
export function isValidPinShape(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

/** Set grown-up mode for this family. Route Handler / Server Action only. */
export async function setParentMode(familyId: string): Promise<void> {
  const exp = Date.now() + TTL_MS;
  const value = `${exp}.${sign(familyId, exp)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

/** Clear grown-up mode (explicit "exit", or hand-off to a kid). */
export async function clearParentMode(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** True iff a valid, unexpired grown-up cookie exists for THIS family. */
export async function isParentMode(familyId: string): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const dot = raw.indexOf('.');
  if (dot < 0) return false;
  const exp = Number.parseInt(raw.slice(0, dot), 10);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqHex(raw.slice(dot + 1), sign(familyId, exp));
}

/** Whether this family has set a grown-up PIN yet (drives first-run onboarding). */
export async function familyHasParentPin(familyId: string): Promise<boolean> {
  const { data } = await supabaseServer()
    .from('families').select('parent_pin').eq('id', familyId).maybeSingle();
  return Boolean((data as { parent_pin: string | null } | null)?.parent_pin);
}

/** Verify a submitted PIN against the family's stored hash. */
export async function verifyParentPin(familyId: string, submitted: string): Promise<boolean> {
  const { data } = await supabaseServer()
    .from('families').select('parent_pin').eq('id', familyId).maybeSingle();
  const stored = (data as { parent_pin: string | null } | null)?.parent_pin ?? null;
  if (!stored) return false;
  return safeEqHex(hashParentPin(familyId, submitted), stored);
}

/** First-run: set the family's grown-up PIN, but only if none exists yet
 *  (the `is('parent_pin', null)` guard makes this a safe no-op on re-submit). */
export async function setParentPin(familyId: string, pin: string): Promise<void> {
  await supabaseServer()
    .from('families')
    .update({ parent_pin: hashParentPin(familyId, pin) })
    .eq('id', familyId)
    .is('parent_pin', null);
}

/** Server-Component guard: redirect kid-mode sessions out to the /grownups
 *  gate. Call from any page/layout that must be parent-only. */
export async function requireParentModePage(familyId: string): Promise<void> {
  if (await isParentMode(familyId)) return;
  const { redirect } = await import('next/navigation');
  redirect('/grownups');
}
