// GET /api/kids/clear-stale — clear a foreign/stale active-kid cookie.
//
// The gated layout redirects here when the `lw_kid` cookie points at a kid
// that does NOT belong to the current family (a stale cookie from a previous
// login, or a forged one). A Server Component layout can't mutate cookies, so
// it bounces here: we clear the cookie and send the user to the kid picker.
//
// GET (not POST) because it's reached via a redirect navigation, and the only
// effect is dropping the active-kid selection — harmless if triggered.

import { clearActiveKid } from '@/lib/auth/active-kid';

export async function GET(): Promise<Response> {
  await clearActiveKid();
  return new Response(null, { status: 303, headers: { Location: '/kids' } });
}
