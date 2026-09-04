// GET /auth/callback — handle the redirect from a magic-link email.
//
// Supabase appends `?code=...` to the redirect URL when the user clicks
// the magic link. We exchange that code for a session, which sets the
// auth cookies, then redirect to wherever the original signup/login
// said to go (default /parent).

import { type NextRequest } from 'next/server';
import { supabaseSession } from '@/lib/supabase/session';

function redirect303(url: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: url },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/parent';

  if (!code) {
    return redirect303(`/login?error=${encodeURIComponent('Missing magic-link code. Try logging in again.')}`);
  }

  const sb = await supabaseSession();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return redirect303(
      `/login?error=${encodeURIComponent(`Login link expired or invalid: ${error.message}`)}`,
    );
  }

  // Session cookies are now set on the response. The redirect carries
  // them to the destination.
  return redirect303(next);
}
