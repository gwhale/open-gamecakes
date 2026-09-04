// POST /api/auth/signup — closed-beta signup with invite code.
//
// Steps:
//   1. Pull form: code, login, password, family_name, parent_consent
//   2. Validate code (exists, unredeemed, unexpired)
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
import { validateInviteCode, markInviteCodeRedeemed } from '@/lib/auth/invite';
import { normalizeLoginName, loginToEmail } from '@/lib/auth/login-name';

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

  if (!code) return errorRedirect('Please enter your invite code.');
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

  // 1. Validate the invite code.
  try {
    await validateInviteCode(code);
  } catch (e) {
    return errorRedirect(e instanceof Error ? e.message : 'Invite code is not usable.');
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

  // 3. Claim an UNOWNED family whose name matches (case-insensitive), else
  //    create a fresh families row. Unowned families only exist from data
  //    backfills — a seeded household whose parent hasn't signed up yet — so
  //    the claim path lets that founder pick up their pre-existing kids. This
  //    used to hardcode one specific family; it now works for any deployment
  //    that seeds a household before its parent registers.
  let familyId: string;
  const { data: unowned } = await sb
    .from('families')
    .select('id')
    .ilike('name', familyName)
    .is('owner_user_id', null)
    .limit(1);
  const claimable = (unowned ?? [])[0] as { id: string } | undefined;
  if (claimable) {
    const { error: claimErr } = await sb
      .from('families')
      .update({ owner_user_id: userId })
      .eq('id', claimable.id)
      .is('owner_user_id', null);
    if (claimErr) {
      return errorRedirect(`Couldn't claim family: ${claimErr.message}`);
    }
    familyId = claimable.id;
  } else {
    const { data: fam, error: famErr } = await sb
      .from('families')
      .insert({ name: familyName, owner_user_id: userId })
      .select('id')
      .single();
    if (famErr || !fam) {
      return errorRedirect(`Couldn't create family: ${famErr?.message ?? 'unknown'}`);
    }
    familyId = fam.id as string;
  }

  // 4. Mark the invite code redeemed.
  try {
    await markInviteCodeRedeemed({ code, userId, familyId });
  } catch (e) {
    return errorRedirect(
      `Account created but couldn't redeem code: ${e instanceof Error ? e.message : 'unknown'}`,
    );
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
