// POST /api/parent/unlock — verify (or first-run set) the grown-up PIN and
// elevate the shared family session into grown-up mode.
//
// Progressive-enhancement form (no JS). Fields:
//   pin       4–8 digits
//   redirect  optional same-origin path to land on after elevating (→ /parent)
//
// If the family has NO grown-up PIN yet, the first valid submission SETS it
// (one-time onboarding) and elevates. Otherwise the PIN is verified against
// the stored hash. On any failure → 303 back to /grownups?error=bad_pin so the
// zero-JS form shows the retry message.

import { type NextRequest } from 'next/server';
import { getCurrentFamily } from '@/lib/auth/family';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import {
  familyHasParentPin,
  verifyParentPin,
  setParentPin,
  setParentMode,
  isValidPinShape,
} from '@/lib/auth/parent-mode';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

/** Only allow same-origin absolute paths as the post-unlock destination —
 *  guards against an open redirect via a crafted ?redirect value. */
function safePath(raw: FormDataEntryValue | null): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/parent';
}

export async function POST(request: NextRequest): Promise<Response> {
  // CSRF defense: this POST mints an elevation and, on first run, SETS the
  // family's grown-up PIN — a forged cross-site submit must not reach it.
  if (!isSameOriginRequest(request)) {
    return new Response('cross-site request rejected', { status: 403 });
  }

  const family = await getCurrentFamily();
  if (!family) return redirect303('/login');

  const form = await request.formData();
  const pin = String(form.get('pin') ?? '').trim();
  const dest = safePath(form.get('redirect'));

  if (!isValidPinShape(pin)) return redirect303('/grownups?error=bad_pin');

  if (!(await familyHasParentPin(family.id))) {
    // First-run onboarding: this submission becomes the family's grown-up PIN.
    await setParentPin(family.id, pin);
  } else if (!(await verifyParentPin(family.id, pin))) {
    return redirect303('/grownups?error=bad_pin');
  }

  await setParentMode(family.id);
  return redirect303(dest);
}
