// POST /api/parent/contact-email: a grown-up sets the family's contact address.
//
// The family comes from the session, never the body. Available on every plan,
// because it is how a family gets help, not a feature of the plan.

import { type NextRequest } from 'next/server';
import { requireParentModeOrJson } from '@/lib/auth/api-guard';
import { normalizeContactEmail } from '@/lib/auth/contact-email';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireParentModeOrJson('kid:manage');
  if (guard instanceof Response) return guard;

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeContactEmail(body?.email);
  if (!email) return Response.json({ error: "That doesn't look like an email." }, { status: 400 });

  const { error } = await supabaseServer()
    .from('families')
    .update({ contact_email: email })
    .eq('id', guard.family.id);
  if (error) {
    console.warn('[contact-email] update failed:', error.message);
    return Response.json({ error: 'That did not save. Try again?' }, { status: 500 });
  }
  return Response.json({ email });
}
