// POST /api/auth/signup — self-serve family signup.
//
// TWO MODES, chosen by SIGNUP_MODE (see lib/auth/signup-mode.ts):
//
//   invite (default) — a code is required, as it always was. The code IS
//     the rate limit: single-use, and somebody had to mint each one.
//   open — no code. Genuinely self-serve, and therefore an
//     unauthenticated endpoint that creates an auth user and a family row
//     per call, so it is throttled per-IP instead (auth/signup-throttle).
//
// `open` is granted only when new families land on the restricted tier;
// signup-mode.ts explains why that interlock exists rather than a note
// asking someone to set two variables in the right order.
//
// Steps:
//   1. Pull form: code, login, password, family_name, parent_consent
//   2. Open mode: claim a throttle slot. Invite mode: validate the code
//      (exists, unredeemed, unexpired)
//   3. Validate login slug (chars, length) and password (min length)
//   4. Create the auth.users row via admin client with synthetic email +
//      the password the parent chose. email_confirm: true marks the
//      account confirmed immediately because the synthetic email
//      domain (gamecakes.family) doesn't accept mail.
//   5. Claim an unowned, name-matching backfilled family, or create a
//      new families row with the new user as owner
//   6. Mark the invite code redeemed
//   7. Sign the user in via signInWithPassword to set session cookies
//   8. Enter grown-up mode (the PIN was just chosen, so the gate is
//      already passed) and land on "add your first player"
//
// Errors redirect back to /signup?error=<message>, carrying the non-secret
// fields (login, family name) so the parent does not retype everything.
// Backend text never reaches the form: it is logged, and the parent gets a
// sentence that says what to do next.

import { type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseSession } from '@/lib/supabase/session';
import {
  validateInviteCode,
  markInviteCodeRedeemed,
  type InviteCodeRow,
} from '@/lib/auth/invite';
import { normalizeLoginName, loginToEmail } from '@/lib/auth/login-name';
import { isValidPinShape, setParentPin, setParentMode } from '@/lib/auth/parent-mode';
import { signupTier } from '@/lib/auth/tier';
import { signupMode } from '@/lib/auth/signup-mode';
import { claimSignupSlot } from '@/lib/auth/signup-throttle';

function redirect303(url: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: url },
  });
}

/** Matches Supabase Auth's own default minimum. If you raise the project's
 *  setting, raise this and the `minLength` on the signup form together. */
const MIN_PASSWORD_LENGTH = 6;

/** Bounce back to the form with a message and, when we have them, the fields
 *  a parent should not have to retype. Secrets (password, PIN) never ride a
 *  query string; those two are short and the parent has just chosen them. */
function errorRedirect(
  message: string,
  keep: { login?: string; familyName?: string } = {},
): Response {
  const q = new URLSearchParams({ error: message });
  if (keep.login) q.set('login', keep.login);
  if (keep.familyName) q.set('family_name', keep.familyName);
  return redirect303(`/signup?${q.toString()}`);
}

/** Undo step 2 when a later step fails.
 *
 *  Signup is three writes (auth user, family row, PIN) with no transaction
 *  across them. Before this, a family-insert failure left the auth user
 *  behind: the parent's next attempt said "already taken", logging in
 *  worked, and `/` bounced them to `/login` forever with no message. Deleting
 *  the user makes the chosen login usable again and turns the failure into a
 *  plain "try again". Best effort — if the delete itself fails we log it and
 *  requireCurrentFamily explains the state rather than looping. */
async function rollbackUser(
  sb: ReturnType<typeof supabaseServer>,
  userId: string,
  why: string,
): Promise<void> {
  const { error } = await sb.auth.admin.deleteUser(userId);
  if (error) console.error(`[signup] ${why}; rollback of auth user failed too:`, error.message);
}

export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const code = String(form.get('code') ?? '').trim().toUpperCase();
  const rawLogin = String(form.get('login') ?? '');
  const password = String(form.get('password') ?? '');
  const familyName = String(form.get('family_name') ?? '').trim();
  const consent = form.get('parent_consent') === 'on';
  const pin = String(form.get('parent_pin') ?? '').trim();

  const mode = signupMode();
  if (mode === 'invite' && !code) {
    return errorRedirect('Please enter your invite code.');
  }
  const login = normalizeLoginName(rawLogin);
  // From here on every bounce carries these two back to the form.
  const keep = { login: login ?? rawLogin.trim().slice(0, 20), familyName };
  if (!login) {
    return errorRedirect(
      'Family login must be 3–20 lowercase letters, numbers, or hyphens.',
      keep,
    );
  }
  // SIX, not four. Supabase Auth enforces its own minimum (6 by default, set
  // per project under Auth → Policies) inside admin.createUser. Advertising 4
  // meant a parent could follow our own rule, pass our own check, and then be
  // shown a raw "Password should be at least 6 characters" from Supabase at
  // step 2 — or, worse, read it as a generic failure and end up with no account
  // at all while believing they had one. Our floor now matches the real one.
  if (password.length < MIN_PASSWORD_LENGTH) {
    return errorRedirect(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, keep);
  }
  if (!familyName) return errorRedirect('Please name your family.', keep);
  if (!consent) return errorRedirect('Parent consent is required to sign up.', keep);
  // Collected at signup so no family ever exists with a null parent_pin.
  // /api/parent/unlock treats a null PIN as first-run and SETS it to whatever
  // is submitted — fine on one household's tablet, wrong the moment anyone can
  // sign up, because it hands grown-up mode to whoever gets there first.
  // Requiring it here closes that window at the source rather than patching
  // the branch that exploits it.
  if (!isValidPinShape(pin)) {
    return errorRedirect('Choose a grown-up PIN: 4 to 8 digits.', keep);
  }

  // Throttled AFTER the cheap checks and BEFORE the first thing that writes
  // a row. A parent who mistypes their password should not spend one of
  // their five daily slots on it, and nothing above this line has written
  // anything.
  if (mode === 'open') {
    const slot = await claimSignupSlot(request.headers);
    if (!slot.allowed) {
      return errorRedirect(
        slot.brokenReason
          // Distinguished on purpose. "We are broken" and "you have had
          // enough" are different problems, and telling someone they hit a
          // limit they did not hit sends them away for a day for no reason.
          ? 'Signup is temporarily unavailable. Please try again shortly.'
          : 'Too many new families from this network today. Try again tomorrow.',
        keep,
      );
    }
  }

  // 1. Validate the invite code, when there is one. The ROW is kept, not
  //    discarded: it carries claim_family_id, which is the only way a signup
  //    can adopt an existing household (see step 3).
  //
  //    Open mode leaves this null, and a null invite carries no claim
  //    target — so an open signup always creates a fresh family and has no
  //    path to adopting an existing one. That falls out of the shape rather
  //    than needing a check of its own.
  let invite: InviteCodeRow | null = null;
  if (mode === 'invite') {
    try {
      invite = await validateInviteCode(code);
    } catch (e) {
      return errorRedirect(e instanceof Error ? e.message : 'Invite code is not usable.', keep);
    }
  }

  const sb = supabaseServer();
  const email = loginToEmail(login);

  // 2. Create the auth user with the chosen password.
  const { data: createRes, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !createRes.user) {
    if (createErr?.message?.toLowerCase().includes('already')) {
      return errorRedirect(
        'That family login is already taken. Try a different one.',
        // Keep the family name; the login is the thing to change.
        { familyName },
      );
    }
    console.error('[signup] createUser failed:', createErr?.message ?? 'no user returned');
    return errorRedirect(
      "Couldn't create the account just now. Try again in a moment.",
      keep,
    );
  }
  const userId = createRes.user.id;

  // 3. Adopt the family this CODE was minted for, else create a fresh one.
  //
  //    This used to claim any unowned family whose NAME matched what was
  //    typed (`.ilike('name', familyName).is('owner_user_id', null)`). The
  //    feature was real — a household seeded by a backfill before its parent
  //    registers — but the mechanism handed it to whoever guessed the name,
  //    along with every kid, attempt, observation and photo in it. A display
  //    name is not a secret.
  //
  //    So the claim is now something the deployment owner GRANTS when minting
  //    the code (invite_codes.claim_family_id, migration 0052). No target on
  //    the code means no claim is possible, which is the normal case.
  let familyId: string;
  const claimTargetId = invite ? invite.claim_family_id : null;
  if (claimTargetId) {
    const { data: claimed, error: claimErr } = await sb
      .from('families')
      .update({ owner_user_id: userId })
      .eq('id', claimTargetId)
      // Still guarded: a code minted against a family that has since been
      // claimed must not steal it back.
      .is('owner_user_id', null)
      .select('id')
      .maybeSingle();
    if (claimErr || !claimed) {
      if (claimErr) console.error('[signup] claim failed:', claimErr.message);
      await rollbackUser(sb, userId, 'claim failed');
      return errorRedirect(
        claimErr
          ? "Couldn't set up the family just now. Try again in a moment."
          : 'That invite was for a household that already has an owner. Ask for a fresh code.',
        keep,
      );
    }
    familyId = claimed.id as string;
  } else {
    const { data: fam, error: famErr } = await sb
      .from('families')
      // A self-serve signup gets whatever tier this deployment is configured
      // to hand out. Default 'full', because a self-hoster's only signups are
      // their own household; a deployment that accepts strangers sets
      // SIGNUP_DEFAULT_TIER=restricted. See lib/auth/tier.ts.
      .insert({ name: familyName, owner_user_id: userId, tier: signupTier() })
      .select('id')
      .single();
    if (famErr || !fam) {
      console.error('[signup] family insert failed:', famErr?.message ?? 'no row returned');
      await rollbackUser(sb, userId, 'family insert failed');
      return errorRedirect("Couldn't set up the family just now. Try again in a moment.", keep);
    }
    familyId = fam.id as string;
  }

  // 3b. Set the grown-up PIN. setParentPin is a no-op when one already
  //     exists, so adopting a household keeps the PIN it had rather than
  //     letting a new owner silently overwrite it.
  await setParentPin(familyId, pin);

  // 4. Mark the invite code redeemed. Nothing to redeem in open mode.
  if (invite) {
    try {
      await markInviteCodeRedeemed({ code, userId, familyId });
    } catch (e) {
      console.error('[signup] markInviteCodeRedeemed failed:', e instanceof Error ? e.message : e);
      return errorRedirect(
        'Your family was created, but the invite code could not be marked as used. Log in and carry on.',
        keep,
      );
    }
  }

  // 5. Sign the user in via the per-request session client so cookies
  //    are set on the redirect response. From here they're a logged-in
  //    family owner with no email round-trip.
  const sessionClient = await supabaseSession();
  const { error: signInErr } = await sessionClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    // The account exists and is valid — they can just go to /login.
    console.error('[signup] auto-login failed:', signInErr.message);
    return errorRedirect(
      'Your family is ready, but logging you in automatically did not work. Log in with your family login and password.',
      keep,
    );
  }

  // 6. Straight to "add your first player".
  //
  //    This used to land on `/`, which sends a session with no active kid to
  //    the kid picker. A brand-new family has no kids, so the parent's first
  //    screen was a mascot asking "Who's playing today?" over an empty grid,
  //    with no link to the parent area. The picker now has an empty state
  //    too, but the right first screen is the one where they add a player.
  //
  //    Grown-up mode is set here because the gate it protects — "do you know
  //    the PIN?" — was answered thirty seconds ago on this form. Without
  //    this the parent layout bounces them to /grownups to type the PIN they
  //    just chose. A claimed household may already have kids, so it lands on
  //    the dashboard instead.
  await setParentMode(familyId);
  return redirect303(claimTargetId ? '/parent' : '/parent/kids/new?welcome=1');
}
