// POST /api/auth/logout — sign out the current parent.
//
// Clears the Supabase session (refresh + access tokens) and the
// active-kid cookie, then redirects to /login. Used by the "Log out"
// button in the parent dashboard.

import { type NextRequest } from 'next/server';
import { supabaseSession } from '@/lib/supabase/session';
import { clearActiveKid } from '@/lib/auth/active-kid';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(_request: NextRequest): Promise<Response> {
  const sb = await supabaseSession();
  await sb.auth.signOut();
  await clearActiveKid();
  return redirect303('/login');
}
