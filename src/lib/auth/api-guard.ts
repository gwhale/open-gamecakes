// Auth guard for /api/* route handlers.
//
// Phase 2 multi-family auth: every API route that previously checked the
// SITE_PASSWORD cookie or the parent-admin cookie now goes through this
// helper instead. Returning a Family means the request has a valid
// Supabase session AND the user owns a family. Returning a Response means
// authentication failed and the route should bail with that response.
//
// Usage pattern:
//
//   export async function POST(request: NextRequest): Promise<Response> {
//     const guard = await requireSessionOrJson();
//     if (guard instanceof Response) return guard;
//     const { family } = guard;
//     // ... use family.id to scope queries
//   }

import { getCurrentFamily, type Family } from '@/lib/auth/family';
import { isParentMode } from '@/lib/auth/parent-mode';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Validate the request has a logged-in parent who owns a family.
 * Returns the family on success; returns a 401 JSON response on failure.
 *
 * The "owns a family" check covers what `readParentAdminCookie` used to —
 * if you're the family owner you're the admin, no separate password.
 */
export async function requireSessionOrJson(): Promise<{ family: Family } | Response> {
  const family = await getCurrentFamily();
  if (!family) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }
  return { family };
}

/**
 * Like {@link requireSessionOrJson}, but ALSO requires the session to be in
 * grown-up mode (a valid signed elevation cookie for this family). Use on
 * every parent-only mutation — token grants, kid management, observations —
 * so a kid in the driver's seat can't hit the endpoint directly even if they
 * find the URL.
 *
 *  - no session       → 401
 *  - session, kid mode → 403 (needs the grown-up PIN via /grownups)
 */
export async function requireParentModeOrJson(): Promise<{ family: Family } | Response> {
  const family = await getCurrentFamily();
  if (!family) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }
  if (!(await isParentMode(family.id))) {
    return Response.json({ error: 'grown-up mode required' }, { status: 403 });
  }
  return { family };
}

/**
 * IDOR guard: verify a caller-supplied `kidId` actually belongs to `familyId`.
 * Returns `null` when the kid is in-family (proceed), or a JSON Response the
 * caller should return directly (400 if no kidId, 403 if it's another family's
 * kid or doesn't exist).
 *
 * `requireSessionOrJson` / `requireParentModeOrJson` only prove you own SOME
 * family; this proves the TARGET kid is yours. Every route that acts on a
 * client-supplied kidId (or a row reached from one) must call this — it mirrors
 * the inline check already in `api/attempts/route.ts`.
 */
export async function requireKidInFamily(
  kidId: string | null | undefined,
  familyId: string,
): Promise<Response | null> {
  if (!kidId) return Response.json({ error: 'kidId required' }, { status: 400 });
  const { data } = await supabaseServer()
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', familyId)
    .maybeSingle();
  if (!data) return Response.json({ error: 'not your kid' }, { status: 403 });
  return null;
}
