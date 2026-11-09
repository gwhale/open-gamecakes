// POST /api/admin/login: the operator's sign-in, for the login outside every family.
//
// The password and the operator rule are checked before the browser's session is
// touched, so a family that lands here keeps its own session and learns nothing.
// Every failure gets the same answer, except a correct password on a login with no
// family, which names the setup mistake. Failed attempts rely on Supabase Auth's own
// sign-in rate limit.

import { type NextRequest } from 'next/server';
import { loginToEmail, normalizeLoginName } from '@/lib/auth/login-name';
import {
  checkPassword,
  describeAllowlist,
  isOperator,
  ownsAFamily,
  parseSuperAdminIds,
  setAdminElevation,
} from '@/lib/auth/super-admin';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { supabaseSession } from '@/lib/supabase/session';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('cross-site request rejected', { status: 403 });
  }
  if (parseSuperAdminIds(process.env.SUPER_ADMIN_USER_IDS).size === 0) {
    return new Response('not found', { status: 404 });
  }

  const form = await request.formData();
  const login = normalizeLoginName(String(form.get('login') ?? ''));
  const password = String(form.get('password') ?? '');
  const refused = redirect303('/admin/login?error=1');
  if (!login || !password) return refused;

  const email = loginToEmail(login);
  const user = await checkPassword(email, password);
  if (!user) return refused;
  if (!(await isOperator(user.id))) {
    // Only a login with no family reaches this message, so a family learns nothing.
    // It has just proved its password, and it is the setup mistake worth naming.
    if ((await ownsAFamily(user.id)) !== false) return refused;
    const { entries, ids } = describeAllowlist();
    const q = new URLSearchParams({ error: 'unlisted', entries: String(entries), ids: String(ids) });
    return redirect303(`/admin/login?${q.toString()}`);
  }

  const sb = await supabaseSession();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return refused;

  await setAdminElevation(user.id);
  return redirect303('/admin');
}
