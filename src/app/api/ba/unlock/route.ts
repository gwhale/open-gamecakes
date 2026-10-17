// POST /api/ba/unlock — password gate for the anonymous /ba arcade.
//
// Classic form POST (same pattern as /api/auth/login): check the shared
// password, set the unlock cookie, 303 back to /ba. No Supabase session
// involved — this route is intentionally NOT guarded by
// requireSessionOrJson; the whole point of /ba is anonymous access.

import { type NextRequest } from 'next/server';
import { checkBaPassword, grantBaAccess } from '@/lib/ba/access';

function redirect303(url: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: url },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');

  if (!checkBaPassword(password)) {
    return redirect303(
      `/ba?error=${encodeURIComponent('Hmm, that’s not our favorite teacher. Try again!')}`,
    );
  }

  await grantBaAccess();
  return redirect303('/ba');
}
