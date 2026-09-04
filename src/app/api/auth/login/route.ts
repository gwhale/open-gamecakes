// POST /api/auth/login — family-name + password login.
//
// The kid-facing form sends `{ login, password }`. We map the slug to a
// synthetic email (`{login}@gamecakes.family`) and call
// supabase.auth.signInWithPassword. On success the @supabase/ssr server
// client sets the session cookies via setAll() — the 303 redirect
// carries those cookies to the destination.
//
// We don't reveal whether a login slug exists (avoids account
// enumeration). All bad credentials get the same generic error.

import { type NextRequest } from 'next/server';
import { supabaseSession } from '@/lib/supabase/session';
import { normalizeLoginName, loginToEmail } from '@/lib/auth/login-name';

function redirect303(url: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: url },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const rawLogin = String(form.get('login') ?? '');
  const password = String(form.get('password') ?? '');

  const login = normalizeLoginName(rawLogin);
  if (!login || !password) {
    return redirect303(
      `/login?error=${encodeURIComponent('Wrong login or password.')}`,
    );
  }

  const sb = await supabaseSession();
  const { error } = await sb.auth.signInWithPassword({
    email: loginToEmail(login),
    password,
  });

  if (error) {
    // Log server-side for debugging — never echo Supabase's text to the
    // user (e.g. "Invalid login credentials" leaks whether the account
    // exists in some configurations).
    console.warn('[/api/auth/login] signInWithPassword:', error.message);
    return redirect303(
      `/login?error=${encodeURIComponent('Wrong login or password.')}`,
    );
  }

  // Land on the gated root, which auto-routes to the kid picker (or
  // straight to /map if there's already an active-kid cookie). Parent
  // dashboard remains reachable from the in-app menu.
  return redirect303('/');
}
