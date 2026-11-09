// POST /api/parent/digest-emails — set who gets this family's weekly digest.
//
// Whole-list replace rather than add/remove verbs: the UI edits a short list and
// posts it back, so there is no partial-update race between two grown-ups and no
// way to end up with an address nobody remembers adding.
//
// Behind the parent PIN gate (grown-up mode) like the rest of /parent. The
// family is taken from the session, never the body — you cannot set another
// family's recipients by editing a request.

import { type NextRequest } from 'next/server';
import { requireParentModeOrJson } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';

const MAX = 5;
const SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest): Promise<Response> {
  // requireCurrentFamily() only proves a session, and it REDIRECTS on
  // failure, which is wrong in a JSON route. The header has always claimed
  // this was behind the grown-up PIN; it was not, so a kid in kid mode could
  // set who receives the family's weekly email.
  const guard = await requireParentModeOrJson('family:settings');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { emails?: unknown }).emails)) {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }

  const cleaned = Array.from(
    new Set(
      ((raw as { emails: unknown[] }).emails)
        .filter((e): e is string => typeof e === 'string')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  );

  if (cleaned.length > MAX) {
    return Response.json({ error: `at most ${MAX} addresses` }, { status: 400 });
  }
  const bad = cleaned.find((e) => !SHAPE.test(e) || e.length > 254);
  if (bad) {
    return Response.json({ error: `that doesn't look like an email: ${bad}` }, { status: 400 });
  }

  const sb = supabaseServer();
  const { error } = await sb
    .from('families')
    .update({ digest_emails: cleaned })
    .eq('id', family.id);
  if (error) {
    console.warn('[digest-emails] update failed:', error.message);
    return Response.json({ error: 'could not save' }, { status: 500 });
  }
  return Response.json({ emails: cleaned });
}
