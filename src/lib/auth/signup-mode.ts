// Whether anyone may sign up, or only someone holding a code.
//
// Signup has always been invite-only: scripts/admin/create-invite.mjs mints a
// code, the deployment owner hands it over. That is a real gate, and it is
// also a person in the loop for every new household — which is the opposite of
// self-serve.
//
// `SIGNUP_MODE=open` removes the code. What follows is the reason it is not
// simply a boolean.
//
// THE INTERLOCK
//
// Open signup is only safe in combination with SIGNUP_DEFAULT_TIER=restricted.
// Those are two variables, set in two places, at two times, by a person. Set
// the first and forget the second and every stranger who signs up lands on
// `full` — which grants 'ai', which is the deployment owner's model balance.
// The failure is silent, it is expensive, and it looks exactly like success.
//
// So `open` does not mean "open". It means "open IF the tier default is
// already restricted". Configured the dangerous way, this returns 'invite' and
// signup keeps asking for a code — the deployment stays where it was rather
// than quietly becoming something its owner did not choose. There is nothing
// to remember and nothing to order.
//
// It costs one honest downside: an owner who deliberately wants open signup on
// the full tier cannot have it from configuration alone. That is the correct
// trade. Anyone who genuinely wants it is editing this file, which is a much
// better place to make that decision than an env var typed into a web form.

import { signupTier } from './tier';

export type SignupMode = 'invite' | 'open';

/**
 * How signup behaves right now.
 *
 * `invite` (the default, and the default for the open-source cut) requires a
 * code. `open` requires only the form — but see the interlock above: it is
 * granted only when new families land on the restricted tier.
 */
export function signupMode(): SignupMode {
  if (process.env.SIGNUP_MODE !== 'open') return 'invite';
  // The interlock. Deliberately re-read rather than cached: this is a plain
  // env lookup, and a cached module-level constant would make the two
  // variables order-dependent at import time, which is the bug this prevents.
  return signupTier() === 'restricted' ? 'open' : 'invite';
}

/**
 * True when SIGNUP_MODE asks for open but the tier default withholds it.
 *
 * Exists so the misconfiguration is VISIBLE rather than just safe. Silently
 * doing the right thing still leaves an owner staring at a signup form that
 * ignores the variable they set. The route logs this; the signup page says so.
 */
export function signupModeIsHeldBack(): boolean {
  return process.env.SIGNUP_MODE === 'open' && signupTier() !== 'restricted';
}

/**
 * How many families one IP may create per day in open mode.
 *
 * Not a product limit — a ceiling on how bad a bad day gets. A real household
 * signs up once; the ceiling only ever matters to a script or to a shared
 * network, and 5 is high enough that a school or a household behind CGNAT is
 * not the person it stops.
 *
 * Only counted in open mode. Invite codes are single-use, so an invite signup
 * is already rate-limited by the number of codes that exist.
 */
export function openSignupsPerDay(): number {
  const raw = Number(process.env.SIGNUP_OPEN_MAX_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}
