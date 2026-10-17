// POST /api/parent/lock — leave grown-up mode.
//
// Called by the "Done (exit grown-up mode)" button on the parent screens.
// Clears the signed elevation cookie and drops the session back to kid-safe
// mode, landing on the town hub. Zero JS — a plain form submit.

import { type NextRequest } from 'next/server';
import { clearParentMode } from '@/lib/auth/parent-mode';
import { isSameOriginRequest } from '@/lib/http/same-origin';

export async function POST(request: NextRequest): Promise<Response> {
  // Low harm (forcing a victim to exit grown-up mode is an annoyance), but
  // keep the CSRF posture consistent with unlock.
  if (!isSameOriginRequest(request)) {
    return new Response('cross-site request rejected', { status: 403 });
  }
  await clearParentMode();
  return new Response(null, { status: 303, headers: { Location: '/town' } });
}
