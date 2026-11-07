// POST /api/parent/pin: change the family's grown-up PIN.
//
// Grown-up mode alone is not enough, because it stays open for 30 minutes on a
// tablet a child can pick up. The current PIN is required too, and wrong guesses
// here spend the same tries as the /grownups gate, so this can't be used to get
// around that limit.
//
// 'kid:manage' because this is looking after your own household, and families on
// the restricted tier need to be able to change their PIN as well.

import { type NextRequest } from 'next/server';
import { requireParentModeOrJson } from '@/lib/auth/api-guard';
import { claimPinAttempt, clearPinAttempts } from '@/lib/auth/pin-attempts';
import { changeParentPin, isValidPinShape, verifyParentPin } from '@/lib/auth/parent-mode';
import { isSameOriginRequest } from '@/lib/http/same-origin';

export async function POST(req: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(req)) {
    return Response.json({ error: 'cross-site request rejected' }, { status: 403 });
  }
  const guard = await requireParentModeOrJson('kid:manage');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const body = (await req.json().catch(() => null)) as { current?: unknown; next?: unknown } | null;
  const current = typeof body?.current === 'string' ? body.current.trim() : '';
  const next = typeof body?.next === 'string' ? body.next.trim() : '';

  if (!isValidPinShape(next)) {
    return Response.json({ error: 'The new PIN needs 4 to 8 digits.' }, { status: 400 });
  }
  if (next === current) {
    return Response.json({ error: 'The new PIN is the same as the current one.' }, { status: 400 });
  }
  if (!isValidPinShape(current)) {
    return Response.json({ error: 'That current PIN is not right.' }, { status: 403 });
  }

  if (!(await claimPinAttempt(family.id))) {
    return Response.json({ error: 'Too many tries. Try again later.' }, { status: 429 });
  }
  if (!(await verifyParentPin(family.id, current))) {
    return Response.json({ error: 'That current PIN is not right.' }, { status: 403 });
  }
  await clearPinAttempts(family.id);

  if (!(await changeParentPin(family.id, next))) {
    return Response.json({ error: 'Could not save the new PIN. Try again.' }, { status: 500 });
  }
  return Response.json({ ok: true });
}
