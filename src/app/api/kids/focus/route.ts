// POST /api/kids/focus — set (or clear) what a kid is working on right now.
//
// Body: {
//   kidId: string,
//   focusMath?: string | null,          // a MathKind, or null to clear
//   focusMathLevel?: number | null,     // 1-10, or null to keep the grade tier
//   focusReading?: string | null,       // a ReadingChallengeType, or null
//   focusReadingLevel?: number | null,
// }
//
// This is the grown-up half of "Cakey recommends". The kid-facing chip derives
// its suggestion from the grade's CCSS critical area, which is always roughly
// right and never exactly right — it cannot know the class spent October on
// money. These four columns say so directly, and null (the normal state) leaves
// the grade default standing. See lib/games/shared/recommend.ts and
// migration 0046.
//
// Validation is against the SAME lists the launcher renders from, so a value
// that would produce an unanswerable question cannot be stored. Absent fields
// are left untouched; explicit null clears.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';
import { isMathKind } from '@/lib/games/shared/challenge-mode';
import { isReadingChallengeType } from '@/lib/games/shared/generate-reading-challenge';

/** Read one nullable field. Returns `undefined` when the key is absent (leave
 *  alone) and `null` when it is explicitly null (clear it) — a distinction a
 *  plain `?? null` would flatten, turning "I only changed reading" into "clear
 *  the math focus too". */
function tri<T>(
  body: Record<string, unknown>,
  key: string,
  ok: (v: unknown) => v is T,
): T | null | undefined {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v === null || v === '') return null;
  return ok(v) ? v : undefined;
}

const isLevel = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const kidId = typeof body.kidId === 'string' ? body.kidId : '';
  if (!kidId) return Response.json({ error: 'kidId required' }, { status: 400 });

  // IDOR guard: same pattern as /api/kid-skills/calibrate.
  const denied = await requireKidInFamily(kidId, guard.family.id);
  if (denied) return denied;

  const patch: Record<string, string | number | null> = {};
  // The two guards take `string | null | undefined`, so narrow to string first
  // rather than widening their signatures for one caller.
  const asMath = (v: unknown): v is string => typeof v === 'string' && isMathKind(v);
  const asReading = (v: unknown): v is string =>
    typeof v === 'string' && isReadingChallengeType(v);

  const math = tri(body, 'focusMath', asMath);
  const mathLevel = tri(body, 'focusMathLevel', isLevel);
  const reading = tri(body, 'focusReading', asReading);
  const readingLevel = tri(body, 'focusReadingLevel', isLevel);

  if (math !== undefined) patch.focus_math = math;
  if (mathLevel !== undefined) patch.focus_math_level = mathLevel;
  if (reading !== undefined) patch.focus_reading = reading;
  if (readingLevel !== undefined) patch.focus_reading_level = readingLevel;

  // A body that named only unrecognised kinds would otherwise UPDATE nothing
  // and report success, which reads as "saved" in the UI.
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'nothing valid to set' }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from('kids')
    .update(patch)
    .eq('id', kidId)
    .select('focus_math, focus_math_level, focus_reading, focus_reading_level')
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ focus: data });
}
