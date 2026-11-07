// POST /api/admin/unlock: the operator enters their account password again to
// open /admin for 15 minutes. See src/lib/auth/super-admin.ts for why.
//
// Failed attempts rely on Supabase Auth's own sign-in rate limit.

import { createClient } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { getCurrentFamily } from '@/lib/auth/family';
import { isParentMode } from '@/lib/auth/parent-mode';
import { isSuperAdmin, setAdminElevation } from '@/lib/auth/super-admin';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { getCurrentUser } from '@/lib/supabase/session';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('cross-site request rejected', { status: 403 });
  }

  const family = await getCurrentFamily();
  const user = await getCurrentUser();
  if (!family || !user?.email || family.owner_user_id !== user.id || !isSuperAdmin(user.id)) {
    return new Response('not found', { status: 404 });
  }
  if (!(await isParentMode(family.id))) return redirect303('/grownups');

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (!password) return redirect303('/admin?error=1');

  // A throwaway client, so a successful check cannot touch the browser's session.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new Response('auth is not configured', { status: 500 });
  const check = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await check.auth.signInWithPassword({ email: user.email, password });
  if (error) return redirect303('/admin?error=1');
  // Revoke only the session this check just created.
  await check.auth.signOut({ scope: 'local' });

  await setAdminElevation(user.id);
  return redirect303('/admin');
}
