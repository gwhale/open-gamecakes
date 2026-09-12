// What a family is allowed to do.
//
// One deployment can hold more than one household now. Ours can be handed to a
// stranger who signed up themselves, and that family should be able to play,
// see progress, and manage their own kids — but not create games, not file
// tickets into our board, and above all not spend our OpenRouter balance.
//
// WHY THE MAP LIVES IN CODE
//
// `families.tier` (migration 0050) says WHICH tier a family is on; this file
// says what a tier MEANS. Keeping the meaning here rather than in a
// permissions table makes it diffable, unit-testable, and impossible to drift
// between environments. The deployment owner is the only person who ever
// changes a tier and they do it in the SQL editor, so a join table would be
// infrastructure serving one row of policy.
//
// HOW IT IS ENFORCED
//
// The capability is a REQUIRED argument to the guards in api-guard.ts. That is
// deliberate and it is the whole design: an optional parameter fails OPEN, so a
// route written in six months that forgets it would silently get everything. A
// required one is a compile error, and `npm run build` makes the author decide
// what their route costs.

/** A family's plan. Stored in `families.tier`; see migration 0050. */
export type FamilyTier = 'full' | 'restricted';

/**
 * What a route costs, in permission terms.
 *
 * Deliberately coarse. These are not one-per-route — they are the handful of
 * genuinely different things a family can do, so assigning one to a new route
 * is a judgement about kind rather than a lookup.
 */
export type Capability =
  /** Play, and everything a round touches: attempts, tokens, town, unlocks,
   *  the cupcake shop, the placement quiz. The core loop. */
  | 'play'
  /** Add, rename and calibrate this family's own kids; set their focus and
   *  class word lists. Managing your household, not the deployment. */
  | 'kid:manage'
  /** ANY path that can reach a paid model. The one that costs real money. */
  | 'ai'
  /** The Story Oven design flow and its drawing upload. */
  | 'game:create'
  /** Filing a ticket. Tickets land on OUR board, so a stranger filing them is
   *  a support queue we did not ask for rather than a security problem. */
  | 'ticket:file'
  /** Closing or annotating a ticket. Parent-only even on the full tier. */
  | 'ticket:triage'
  /** Family-wide settings that reach outside the app: digest recipients,
   *  token grants. */
  | 'family:settings';

const FULL: readonly Capability[] = [
  'play',
  'kid:manage',
  'ai',
  'game:create',
  'ticket:file',
  'ticket:triage',
  'family:settings',
];

/** Play and look after your own kids. Everything that spends money, writes to
 *  our support board, or reaches outside the family is off. */
const RESTRICTED: readonly Capability[] = ['play', 'kid:manage'];

const GRANTS: Record<FamilyTier, readonly Capability[]> = {
  full: FULL,
  restricted: RESTRICTED,
};

/** Is this tier allowed to do this?
 *
 *  An unrecognised tier string (a hand-edited row, a value from a newer
 *  deploy) is treated as `restricted` rather than `full`. Failing closed is
 *  the right default when the question is "may this stranger spend money". */
export function can(tier: string | null | undefined, cap: Capability): boolean {
  const grants = GRANTS[(tier ?? 'restricted') as FamilyTier] ?? RESTRICTED;
  return grants.includes(cap);
}

export const TIER_LIMITS: Record<FamilyTier, { maxKids: number }> = {
  // Not unlimited even on full: a number here is a guard against a runaway
  // loop, not a product limit. No real household reaches it.
  full: { maxKids: 20 },
  // Enough for a real family. The cap exists because rows on our database are
  // our cost, and because a self-serve tier with no ceiling is an invitation.
  restricted: { maxKids: 3 },
};

export function maxKidsFor(tier: string | null | undefined): number {
  return TIER_LIMITS[(tier ?? 'restricted') as FamilyTier]?.maxKids
    ?? TIER_LIMITS.restricted.maxKids;
}

/**
 * The tier a brand-new signup lands on.
 *
 * Defaults to `full`, and that default is for the OPEN-SOURCE CUT: a
 * self-hoster's only signups are their own household, and shipping
 * `restricted` upstream would make every fresh install feel broken for no
 * reason. A deployment that accepts strangers sets
 * `SIGNUP_DEFAULT_TIER=restricted` in its environment.
 *
 * An unrecognised value falls back to `full` rather than throwing — a typo in
 * an env var should not make signup impossible. It is the deployment owner's
 * own configuration, not untrusted input.
 */
export function signupTier(): FamilyTier {
  const raw = process.env.SIGNUP_DEFAULT_TIER;
  return raw === 'restricted' || raw === 'full' ? raw : 'full';
}
