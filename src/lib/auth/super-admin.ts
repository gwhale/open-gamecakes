// Who may see the deployment-wide operator view at /admin.
//
// SUPER_ADMIN_USER_IDS is a comma-separated list of Supabase Auth user ids. It
// is an environment variable rather than a column so that nothing a signed-in
// browser or a stray SQL edit can do grants it, and so a fresh self-hosted copy
// has no operator until its owner names one. Unset means nobody.
//
// The operator is a login of its own, outside every family, signed in at
// /admin/login. Two checks stand between a signed-in browser and other families'
// data:
//   1. The user is on the list and owns no family. Anyone else gets a plain 404.
//      A family login stays signed in on the kids' iPad for up to 400 days, so a
//      listed id that owns a family is refused rather than trusted.
//   2. The account password, entered within the last 15 minutes.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/supabase/session';

const COOKIE_NAME = 'lw_admin';
const TTL_MS = 15 * 60 * 1000;

/** Parse the allowlist. Blank entries are dropped, so a stray comma or an
 *  empty variable can never match an empty id. */
export function parseSuperAdminIds(raw: string | null | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isSuperAdmin(
  userId: string | null | undefined,
  raw: string | null | undefined = process.env.SUPER_ADMIN_USER_IDS,
): boolean {
  return !!userId && parseSuperAdminIds(raw).has(userId);
}

/** The operator rule: listed, and outside every family. */
export function canOperate(
  userId: string | null | undefined,
  ownsFamily: boolean,
  raw: string | null | undefined = process.env.SUPER_ADMIN_USER_IDS,
): boolean {
  return isSuperAdmin(userId, raw) && !ownsFamily;
}

/** True or false from the database, null if the lookup failed. */
export async function ownsAFamily(userId: string): Promise<boolean | null> {
  const { data, error } = await supabaseServer()
    .from('families')
    .select('id')
    .eq('owner_user_id', userId)
    .limit(1);
  return error ? null : (data ?? []).length > 0;
}

/** Whether this user may operate, read from the database. Not the session, so it
 *  also works in the request that is signing them in. */
export async function isOperator(userId: string): Promise<boolean> {
  if (!isSuperAdmin(userId)) return false;
  const owns = await ownsAFamily(userId);
  // A failed lookup cannot show the user owns no family, so it refuses.
  return owns === false && canOperate(userId, false);
}

/** What the allowlist holds, without revealing it: how many entries, and how many
 *  have the shape of a user id. Shown only to someone who has just proved the
 *  password of a login with no family, to make a mistaken setting visible. */
export function describeAllowlist(raw: string | null | undefined = process.env.SUPER_ADMIN_USER_IDS): {
  entries: number;
  ids: number;
} {
  const entries = [...parseSuperAdminIds(raw)];
  return {
    entries: entries.length,
    ids: entries.filter((entry) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry)).length,
  };
}

/**
 * Checks a password without touching the browser's session, and returns the user
 * it belongs to, or null. A throwaway client revokes only the session it created.
 */
export async function checkPassword(
  email: string,
  password: string,
): Promise<{ id: string; email: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('auth is not configured');
  const check = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await check.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  await check.auth.signOut({ scope: 'local' });
  return { id: data.user.id, email };
}

function sign(userId: string, exp: number, secret: string): string {
  // Labelled and hashed so this key differs from every other use of the secret.
  const key = createHash('sha256').update(`lw-admin.v1:${secret}`).digest();
  return createHmac('sha256', key).update(`${userId}.${exp}`).digest('hex');
}

export function makeAdminToken(userId: string, exp: number, secret: string): string {
  return `${exp}.${sign(userId, exp, secret)}`;
}

/** Valid only for this user, with an untampered expiry still in the future. */
export function adminTokenIsValid(
  raw: string | null | undefined,
  userId: string,
  nowMs: number,
  secret: string,
): boolean {
  if (!raw || !secret) return false;
  const dot = raw.indexOf('.');
  if (dot < 0) return false;
  const expText = raw.slice(0, dot);
  const exp = Number(expText);
  if (!/^\d+$/.test(expText) || exp <= nowMs) return false;
  const given = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(userId, exp, secret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Route Handler only: call after the password has been checked. */
export async function setAdminElevation(userId: string): Promise<void> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set');
  const store = await cookies();
  store.set(COOKIE_NAME, makeAdminToken(userId, Date.now() + TTL_MS, secret), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

/** Has this user entered the password in the last 15 minutes? */
export async function hasAdminElevation(userId: string): Promise<boolean> {
  const store = await cookies();
  return adminTokenIsValid(
    store.get(COOKIE_NAME)?.value,
    userId,
    Date.now(),
    process.env.SUPABASE_SECRET_KEY ?? '',
  );
}

/**
 * Page guard for the first check; returns the answer to the second. Anyone else
 * gets a 404, so the route does not announce that it exists.
 *
 * Returns false when the page must ask for the password and load no data.
 */
export async function requireSuperAdminPage(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !(await isOperator(user.id))) notFound();
  return hasAdminElevation(user.id);
}
