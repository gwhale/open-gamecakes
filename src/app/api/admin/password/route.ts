// POST /api/admin/password: the operator chooses their own password.

import { type NextRequest } from 'next/server';
import { hasAdminElevation, isOperator } from '@/lib/auth/super-admin';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentUser, supabaseSession } from '@/lib/supabase/session';

/** Longer than a family's, because this login can reset any family's. */
const MIN_LENGTH = 12;

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response('cross-site request rejected', { status: 403 });

  const user = await getCurrentUser();
  if (!user || !(await isOperator(user.id))) return new Response('not found', { status: 404 });
  if (!(await hasAdminElevation(user.id))) return redirect303('/admin');

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (password.length < MIN_LENGTH) return redirect303('/admin?password=short');

  const sb = supabaseServer();
  const { error: recordError } = await sb
    .from('admin_actions')
    .insert({ actor_user_id: user.id, action: 'change-own-password' });
  if (recordError) {
    console.error('[admin] could not record action:', recordError.message);
    return redirect303('/admin?password=failed');
  }
  const { error } = await sb.auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error('[admin] password change failed:', error.message);
    return redirect303('/admin?password=failed');
  }
  // Changing a password ends the user's sessions, so sign this browser back in.
  if (user.email) {
    const session = await supabaseSession();
    await session.auth.signInWithPassword({ email: user.email, password });
  }
  return redirect303('/admin?password=changed');
}
