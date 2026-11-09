// POST /api/admin/unlock: the operator enters their account password again to
// open /admin for 15 minutes. See src/lib/auth/super-admin.ts for why.
//
// Failed attempts rely on Supabase Auth's own sign-in rate limit.

import { type NextRequest } from 'next/server';
import { checkPassword, isOperator, setAdminElevation } from '@/lib/auth/super-admin';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { getCurrentUser } from '@/lib/supabase/session';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('cross-site request rejected', { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.email || !(await isOperator(user.id))) {
    return new Response('not found', { status: 404 });
  }

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (!password) return redirect303('/admin?error=1');

  if (!(await checkPassword(user.email, password))) return redirect303('/admin?error=1');

  await setAdminElevation(user.id);
  return redirect303('/admin');
}
