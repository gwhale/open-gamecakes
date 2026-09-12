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
//     const guard = await requireSessionOrJson('play');
//     if (guard instanceof Response) return guard;
//     const { family } = guard;
//     // ... use family.id to scope queries
//   }
//
// THE CAPABILITY ARGUMENT IS REQUIRED, ON PURPOSE.
//
// One deployment can now hold more than one household, and not every family is
// allowed everything (see lib/auth/tier.ts). Making the capability optional
// with a permissive default would fail OPEN: a route added six months from now
// that forgot it would silently hand a restricted family the keys, and nothing
// would say so. Required means the compiler asks, and `npm run build` will not
// pass until someone has decided what the route costs.
//
// If a route genuinely needs no capability check, it should not be using these
// guards at all — see the allowlist in api-guard.contract.test.ts.

import { getCurrentFamily, type Family } from '@/lib/auth/family';
import { isParentMode } from '@/lib/auth/parent-mode';
import { can, type Capability } from '@/lib/auth/tier';
import { supabaseServer } from '@/lib/supabase/server';

/** 403 for "you are who you say you are, but your plan does not include this."
 *  Distinct `code` so a client can tell it apart from a permission problem it
 *  could fix by entering the grown-up PIN. */
function tierDenied(): Response {
  return Response.json(
    { error: 'not available on this plan', code: 'tier_denied' },
    { status: 403 },
  );
}

/**
 * Validate the request has a logged-in parent who owns a family.
 * Returns the family on success; returns a 401 JSON response on failure.
 *
 * The "owns a family" check covers what `readParentAdminCookie` used to —
 * if you're the family owner you're the admin, no separate password.
 */
export async function requireSessionOrJson(
  cap: Capability,
): Promise<{ family: Family } | Response> {
  const family = await getCurrentFamily();
  if (!family) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }
  if (!can(family.tier, cap)) return tierDenied();
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
export async function requireParentModeOrJson(
  cap: Capability,
): Promise<{ family: Family } | Response> {
  const family = await getCurrentFamily();
  if (!family) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }
  if (!(await isParentMode(family.id))) {
    return Response.json({ error: 'grown-up mode required' }, { status: 403 });
  }
  if (!can(family.tier, cap)) return tierDenied();
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
