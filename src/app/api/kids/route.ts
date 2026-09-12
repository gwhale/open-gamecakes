// POST /api/kids   — add a kid to this family
// PATCH /api/kids   — rename one, or change their grade
//
// There was no way to create a kid. Not a missing UI — no insert path against
// `kids` existed anywhere in src/ or scripts/. A family was seeded by hand in
// the SQL editor, which was fine when there was one of them and impossible the
// moment a stranger signs up: they landed on an empty family with nothing to
// do, while /open advertised "add as many kids as you like".
//
// WHAT IS COLLECTED, AND WHAT IS NOT
//
// A handle and a grade. That is the entire record a child contributes.
//
// No real name, no birthday, no photo. That is not an oversight to be tidied
// up later by someone adding a "last name" field for convenience — it is the
// reason this deployment can accept strangers at all. See lib/kids/create.ts.
//
// PATCH exists in the same file as POST on purpose. Under a promise of "no
// identifiable information", a handle that cannot be corrected is a privacy
// defect rather than a UX gap: a parent who mistypes and lands their child's
// real name in the database needs a way to remove it that is not an email to
// us.
//
// Both are plain HTML form posts (no JS), so they carry the same same-origin
// CSRF defence as /api/parent/unlock rather than a custom header.

import { type NextRequest } from 'next/server';
import { requireParentModeOrJson } from '@/lib/auth/api-guard';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { maxKidsFor } from '@/lib/auth/tier';
import { GUEST_KID_ID } from '@/lib/auth/guest';
import { PLAIN_CUPCAKE } from '@/lib/cupcake/config';
import { supabaseServer } from '@/lib/supabase/server';
import {
  normalizeHandle,
  validateHandle,
  parseGrade,
  handleTaken,
} from '@/lib/kids/create';

const PARENT_PATH = '/parent';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

/** Forms get a redirect they can see; fetch callers get JSON. Mirrors the
 *  dual-shape handling in /api/parent/tokens/grant. */
function fail(isJson: boolean, code: string, status: number, back: string): Response {
  return isJson
    ? Response.json({ ok: false, error: code }, { status })
    : redirect303(`${back}?error=${encodeURIComponent(code)}`);
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('cross-site request rejected', { status: 403 });
  }
  const isJson = request.headers.get('content-type')?.includes('application/json') ?? false;
  const back = '/parent/kids/new';

  const guard = await requireParentModeOrJson('kid:manage');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const body = isJson
    ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
    : Object.fromEntries(await request.formData());

  const rawHandle = String(body.handle ?? '');
  const problem = validateHandle(rawHandle);
  if (problem) return fail(isJson, problem, 400, back);
  const handle = normalizeHandle(rawHandle);

  const sb = supabaseServer();

  // Existing kids, for both the cap and the duplicate check. Guest is excluded
  // from the count: it is a shared fixture, not one of this family's children,
  // and it would otherwise eat a slot on a 3-kid plan.
  const { data: siblings } = await sb
    .from('kids')
    .select('id, name')
    .eq('family_id', family.id)
    .neq('id', GUEST_KID_ID);

  const existing = (siblings ?? []) as { id: string; name: string }[];

  if (existing.length >= maxKidsFor(family.tier)) {
    return fail(isJson, 'kid_limit', 409, back);
  }
  if (handleTaken(handle, existing.map((k) => k.name))) {
    return fail(isJson, 'duplicate', 409, back);
  }

  // NOTE: two triggers fire on this insert — kids_init_tokens grants the 5
  // starting Sugar Tokens, kids_init_town_starters seeds the starter regions.
  // Do NOT also mint tokens or discover regions here; you would double them.
  //
  // grade_year is deliberately omitted so the column default school_year()
  // fires. Passing it from the app would reintroduce exactly the staleness
  // migration 0044 existed to remove.
  const { data: created, error } = await sb
    .from('kids')
    .insert({
      family_id: family.id,
      name: handle,
      avatar: '🧁',
      cupcake_config: PLAIN_CUPCAKE,
      grade: parseGrade(body.grade),
      pin: null,
    })
    .select('id, name')
    .maybeSingle();

  if (error || !created) return fail(isJson, error?.message ?? 'insert_failed', 500, back);

  return isJson
    ? Response.json({ ok: true, kid: created })
    : redirect303(`${PARENT_PATH}?added=${encodeURIComponent(created.name as string)}`);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('cross-site request rejected', { status: 403 });
  }
  const isJson = request.headers.get('content-type')?.includes('application/json') ?? false;

  const guard = await requireParentModeOrJson('kid:manage');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const body = isJson
    ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
    : Object.fromEntries(await request.formData());

  const kidId = String(body.kidId ?? '');
  if (!kidId) return fail(isJson, 'kid_required', 400, PARENT_PATH);
  const back = `/parent/kid/${kidId}`;

  const sb = supabaseServer();
  const { data: siblings } = await sb
    .from('kids')
    .select('id, name')
    .eq('family_id', family.id);
  const family_kids = (siblings ?? []) as { id: string; name: string }[];

  // Family scope proven from the family's OWN rows rather than a separate
  // lookup — the kid must be in the list we just read.
  if (!family_kids.some((k) => k.id === kidId)) {
    return fail(isJson, 'not_your_kid', 403, PARENT_PATH);
  }
  if (kidId === GUEST_KID_ID) return fail(isJson, 'guest_immutable', 400, back);

  const patch: Record<string, unknown> = {};

  if (body.handle !== undefined) {
    const problem = validateHandle(String(body.handle));
    if (problem) return fail(isJson, problem, 400, back);
    const handle = normalizeHandle(String(body.handle));
    const others = family_kids.filter((k) => k.id !== kidId).map((k) => k.name);
    if (handleTaken(handle, others)) return fail(isJson, 'duplicate', 409, back);
    patch.name = handle;
  }

  // Absent means "leave it"; an empty string means "clear it". Without that
  // distinction a rename would silently wipe the grade.
  if (body.grade !== undefined) patch.grade = parseGrade(body.grade);

  if (Object.keys(patch).length === 0) return fail(isJson, 'nothing_to_change', 400, back);

  const { data: updated, error } = await sb
    .from('kids')
    .update(patch)
    .eq('id', kidId)
    .eq('family_id', family.id)
    .select('id, name, grade')
    .maybeSingle();

  if (error || !updated) return fail(isJson, error?.message ?? 'update_failed', 500, back);

  return isJson ? Response.json({ ok: true, kid: updated }) : redirect303(`${back}?saved=1`);
}
