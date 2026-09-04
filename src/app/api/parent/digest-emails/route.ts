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
import { requireCurrentFamily } from '@/lib/auth/family';
import { supabaseServer } from '@/lib/supabase/server';

const MAX = 5;
const SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest): Promise<Response> {
  const family = await requireCurrentFamily();

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
