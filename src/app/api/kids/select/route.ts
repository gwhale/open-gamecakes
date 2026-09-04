// POST /api/kids/select — set or clear the active-kid cookie.
//
// Three call paths:
//   1. /kids (avatar grid, kid has NO pin) → POSTs with kidId=<uuid>, no pin.
//      No validation needed — tap-through.
//   2. /kids/<id> (PIN entry page) → POSTs with kidId=<uuid> AND pin=<4 digits>.
//      The route handler looks up the kid's stored pin and compares
//      timing-safely. Mismatch → 303 back to the PIN page with ?error=bad_pin.
//   3. /map (Switch Kid button) → POSTs with kidId="". Clears the cookie
//      and bounces to /kids.
//
// Security note: even if we skip pin validation for a kid whose row has
// pin=null, we still require the outer site cookie (enforced by the
// (gated) layout) to reach this route indirectly via forms on /kids.
// Someone with no cookies POSTing directly to /api/kids/select would set
// a cookie but the next page they'd load would bounce them to /gate.

import crypto from 'node:crypto';
import { type NextRequest } from 'next/server';
import { setActiveKid, clearActiveKid } from '@/lib/auth/active-kid';
import { clearParentMode } from '@/lib/auth/parent-mode';
import { getCurrentFamily } from '@/lib/auth/family';
import { supabaseServer } from '@/lib/supabase/server';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

function safeStringEq(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const rawKid = form.get('kidId');
  const kidId = typeof rawKid === 'string' ? rawKid.trim() : '';
  const rawPin = form.get('pin');
  const submittedPin = typeof rawPin === 'string' ? rawPin.trim() : '';

  // Clear path
  if (kidId === '') {
    await clearActiveKid();
    return redirect303('/kids');
  }

  // Family-scoped: must be a logged-in parent, and the kid must belong
  // to that parent's family. Without this, a leaked active-kid cookie
  // from another family could let one parent see another family's kid.
  const family = await getCurrentFamily();
  if (!family) {
    return redirect303('/login');
  }

  // Look up the kid in the parent's family. .eq('family_id', ...)
  // both validates ownership AND prevents cross-family kidId leakage.
  const { data: kid, error: kidErr } = await supabaseServer()
    .from('kids')
    .select('id, pin')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();

  if (kidErr) {
    // Log-but-don't-break: if DB is momentarily unavailable, bounce to /kids
    // so the user retries. Don't set the cookie — that would be a lie.
    console.warn('[kids/select] kid lookup failed:', kidErr.message);
    return redirect303('/kids');
  }
  if (!kid) {
    // kidId doesn't match any real row. Bounce to /kids.
    return redirect303('/kids');
  }

  const storedPin: string | null = (kid.pin as string | null) ?? null;

  if (storedPin) {
    // PIN required — validate.
    if (!submittedPin || !safeStringEq(submittedPin, storedPin)) {
      return redirect303(`/kids/${kidId}?error=bad_pin`);
    }
  }
  // If storedPin is null, no PIN check needed — proceed.

  await setActiveKid(kidId);
  // Defensive hand-off: putting a kid in the driver's seat drops any grown-up
  // elevation, so passing the tablet to a child can't leave the parent section
  // unlocked behind them. The grown-up re-enters their PIN via /grownups.
  await clearParentMode();
  return redirect303('/town');
}
