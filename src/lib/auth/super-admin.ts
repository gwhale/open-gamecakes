// Who may see the deployment-wide operator view at /admin.
//
// SUPER_ADMIN_USER_IDS is a comma-separated list of Supabase Auth user ids. It
// is an environment variable rather than a column so that nothing a signed-in
// browser or a stray SQL edit can do grants it, and so a fresh self-hosted copy
// has no operator until its owner names one. Unset means nobody.
//
// Three checks stand between a signed-in browser and other families' data:
//   1. The user is on the list. Anyone else gets a plain 404.
//   2. Grown-up mode. A family login stays signed in on the kids' iPad for up
//      to 400 days, so the operator's session is often in a child's hands.
//   3. The account password, entered again within the last 15 minutes. The PIN
//      alone is not enough here: it is short, shared by the household, has no
//      attempt limit, and a family without one sets it on first submit.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getCurrentFamily } from '@/lib/auth/family';
import { requireParentModePage } from '@/lib/auth/parent-mode';

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

/**
 * Page guard for the first two checks; returns the answer to the third. Anyone
 * off the list gets a 404, so the route does not announce that it exists. An
 * operator without grown-up mode goes to the PIN gate.
 *
 * Returns false when the page must ask for the password and load no data.
 */
export async function requireSuperAdminPage(): Promise<boolean> {
  const family = await getCurrentFamily();
  if (!family || !family.owner_user_id || !isSuperAdmin(family.owner_user_id)) notFound();
  await requireParentModePage(family.id);
  const store = await cookies();
  return adminTokenIsValid(
    store.get(COOKIE_NAME)?.value,
    family.owner_user_id,
    Date.now(),
    process.env.SUPABASE_SECRET_KEY ?? '',
  );
}
