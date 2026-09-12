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
//   8. Redirect to /parent
//
// Errors redirect back to /signup?error=<message>. We don't expose
// stack traces to the user — friendly messages only.

import { type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseSession } from '@/lib/supabase/session';
import {
  validateInviteCode,
  markInviteCodeRedeemed,
  type InviteCodeRow,
} from '@/lib/auth/invite';
import { normalizeLoginName, loginToEmail } from '@/lib/auth/login-name';
import { isValidPinShape, setParentPin } from '@/lib/auth/parent-mode';
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

function errorRedirect(message: string): Response {
  return redirect303(`/signup?error=${encodeURIComponent(message)}`);
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
  if (!login) {
    return errorRedirect(
      'Family login must be 3–20 lowercase letters, numbers, or hyphens.',
    );
  }
  // SIX, not four. Supabase Auth enforces its own minimum (6 by default, set
  // per project under Auth → Policies) inside admin.createUser. Advertising 4
  // meant a parent could follow our own rule, pass our own check, and then be
  // shown a raw "Password should be at least 6 characters" from Supabase at
  // step 2 — or, worse, read it as a generic failure and end up with no account
  // at all while believing they had one. Our floor now matches the real one.
  if (password.length < MIN_PASSWORD_LENGTH) {
    return errorRedirect(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!familyName) return errorRedirect('Please name your family.');
  if (!consent) return errorRedirect('Parent consent is required to sign up.');
  // Collected at signup so no family ever exists with a null parent_pin.
  // /api/parent/unlock treats a null PIN as first-run and SETS it to whatever
  // is submitted — fine on one household's tablet, wrong the moment anyone can
  // sign up, because it hands grown-up mode to whoever gets there first.
  // Requiring it here closes that window at the source rather than patching
  // the branch that exploits it.
  if (!isValidPinShape(pin)) {
    return errorRedirect('Choose a grown-up PIN: 4 to 8 digits.');
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
          : 'That is a few new families from this connection today. Try again tomorrow.',
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
      return errorRedirect(e instanceof Error ? e.message : 'Invite code is not usable.');
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
      );
    }
    return errorRedirect(
      `Couldn't create account: ${createErr?.message ?? 'unknown error'}`,
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
      return errorRedirect(
        claimErr
          ? `Couldn't claim family: ${claimErr.message}`
          : 'That invite was for a household that already has an owner. Ask for a fresh code.',
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
      return errorRedirect(`Couldn't create family: ${famErr?.message ?? 'unknown'}`);
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
      return errorRedirect(
        `Account created but couldn't redeem code: ${e instanceof Error ? e.message : 'unknown'}`,
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
    return errorRedirect(
      `Account ready but couldn't auto-login: ${signInErr.message}. Try logging in.`,
    );
  }

  // Land on the gated root → kid picker. New parents go through "add
  // your first kid" from there; the parent dashboard is reachable
  // from the in-app menu.
  return redirect303('/');
}
