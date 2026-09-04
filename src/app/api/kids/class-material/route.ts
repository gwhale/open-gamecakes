// /api/kids/class-material — the word lists and class standards a grown-up
// adds from what school sent home. See migrations 0047 and 0048.
//
//   GET    ?kidId=…                             list everything for one kid
//   POST   { kidId, kind, label, words, modes }  add one
//   PATCH  { id, kidId, active? , modes? }       switch one on/off, or re-point it
//   DELETE ?id=…&kidId=…                         remove one for good
//
// 0046 let a grown-up pin a KIND from a fixed list. This is the other half:
// practise THESE twelve words, or, this unit covers 2.NBT.B.5. Spelling is a
// spoken question now, so a word list added here is read aloud by the same
// path Cakey uses.
//
// 0048 added what the list is FOR. A list is practised only in the modes it
// carries, and the meaning mode needs definitions, which arrive in the same box
// as the words ("brave = not afraid") and are split out by parseWordList.
//
// Every handler takes kidId and runs the same family-scope check as
// /api/kid-skills/calibrate, so one family can never touch another's material.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';
import {
  type ClassWordMode,
  canServeMode,
  modeSpec,
  normalizeModes,
} from '@/lib/games/shared/class-modes';
import { parseWordList } from '@/lib/games/shared/parse-word-list';

// The joined skill name is what makes a matched standard useful on screen:
// "2.NBT.B.5 — Add & subtract within 100" tells a parent what Cakey will
// actually do about it, where a bare uuid tells them nothing.
const SELECT =
  'id, kind, label, words, note, skill_id, active, created_at, modes, glosses, skills(display_name)';

/** Find the skill a standard code belongs to.
 *
 *  skills.standard_code holds either one code ('2.NBT.B.5') or a comma list
 *  ('K.CC.A.1, K.CC.B.5'), so this is a containment match rather than equality.
 *  No match is a normal outcome and NOT an error: a standard the engine cannot
 *  generate for yet is precisely the thing worth having written down. */
async function resolveSkill(
  sb: ReturnType<typeof supabaseServer>,
  label: string,
): Promise<string | null> {
  const code = label.trim().toUpperCase();
  // Only bother when it looks like a dot-notation code; a label like
  // "Week of Sep 8" should not fuzzy-match a skill.
  if (!/^[0-9K]\.[A-Z]{2,3}\.[A-Z0-9.]+$/.test(code)) return null;
  const { data } = await sb
    .from('skills')
    .select('id')
    .ilike('standard_code', `%${code}%`)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function guard(request: NextRequest, kidId: string) {
  const session = await requireSessionOrJson();
  if (session instanceof Response) return { error: session };
  const denied = await requireKidInFamily(kidId, session.family.id);
  if (denied) return { error: denied };
  return { familyId: session.family.id };
}

export async function GET(request: NextRequest): Promise<Response> {
  const kidId = request.nextUrl.searchParams.get('kidId') ?? '';
  if (!kidId) return Response.json({ error: 'kidId required' }, { status: 400 });
  const g = await guard(request, kidId);
  if (g.error) return g.error;

  const { data, error } = await supabaseServer()
    .from('class_material')
    .select(SELECT)
    .eq('kid_id', kidId)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ material: data ?? [] });
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const kidId = typeof body.kidId === 'string' ? body.kidId : '';
  if (!kidId) return Response.json({ error: 'kidId required' }, { status: 400 });
  const g = await guard(request, kidId);
  if (g.error) return g.error;

  const kind = body.kind === 'standard' ? 'standard' : 'words';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return Response.json({ error: 'label required' }, { status: 400 });

  const sb = supabaseServer();
  const { words, glosses } =
    kind === 'words'
      ? parseWordList(body.words)
      : { words: [] as string[], glosses: {} as Record<string, string> };
  if (kind === 'words' && words.length === 0) {
    return Response.json({ error: 'add at least one word' }, { status: 400 });
  }

  const modes = kind === 'words' ? normalizeModes(body.modes) : [];

  // A mode the list cannot serve is saved, not refused.
  //
  // The common case is a grown-up part-way through typing definitions: eight
  // words in, three of them defined, saving before the school run. Blocking
  // that loses the eight words to save them from a mode that simply stays
  // quiet until the definitions arrive. So the row is written as asked and the
  // shortfall is REPORTED, which is the same bargain this route already makes
  // for an unmatched standard ("noted, nothing generates for it yet").
  //
  // The generator enforces the real rule at play time: canServeMode() again,
  // per round, against whatever the list holds by then.
  const shortfall = modes
    .filter((m) => !canServeMode(m, words, glosses))
    .map((m) => ({ mode: m, label: modeSpec(m).label, needs: modeSpec(m).minEntries }));

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  const skillId = kind === 'standard' ? await resolveSkill(sb, label) : null;

  const { data, error } = await sb
    .from('class_material')
    .insert({
      kid_id: kidId,
      family_id: g.familyId,
      kind,
      label,
      words,
      note,
      skill_id: skillId,
      modes,
      glosses,
    })
    .select(SELECT)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  // `matched` tells the UI whether to say "Cakey can practise this" or
  // "noted, but nothing generates for it yet" — an honest distinction the
  // parent should see rather than discover later. `shortfall` is the same idea
  // for word lists: which modes were asked for but cannot run yet, and why.
  return Response.json({ entry: data, matched: skillId != null, shortfall });
}

export async function PATCH(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const kidId = typeof body.kidId === 'string' ? body.kidId : '';
  const id = typeof body.id === 'string' ? body.id : '';
  if (!kidId || !id) return Response.json({ error: 'kidId and id required' }, { status: 400 });
  const g = await guard(request, kidId);
  if (g.error) return g.error;

  // Two separate edits share this handler, and which one is meant is decided by
  // which key is present rather than by a mode flag. `modes` absent means the
  // caller is toggling the switch and must not silently clear what the list is
  // for; `active` absent means the caller is re-pointing an existing list and
  // must not silently switch it back on.
  const patch: { active?: boolean; modes?: ClassWordMode[] } = {};
  if ('active' in body) patch.active = body.active !== false;
  if ('modes' in body) patch.modes = normalizeModes(body.modes);
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'nothing to change' }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from('class_material')
    .update(patch)
    .eq('id', id)
    // Scoped by kid as well as id: an id from another family must not match.
    .eq('kid_id', kidId)
    .select(SELECT)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Re-pointing a list can ask for a mode its words cannot serve, exactly as
  // adding one can. Same answer: save it, say so.
  const entry = data as { words?: string[]; glosses?: Record<string, string> } | null;
  const shortfall = (patch.modes ?? [])
    .filter((m) => !canServeMode(m, entry?.words ?? [], entry?.glosses ?? {}))
    .map((m) => ({ mode: m, label: modeSpec(m).label, needs: modeSpec(m).minEntries }));

  return Response.json({ entry: data, shortfall });
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const kidId = params.get('kidId') ?? '';
  const id = params.get('id') ?? '';
  if (!kidId || !id) return Response.json({ error: 'kidId and id required' }, { status: 400 });
  const g = await guard(request, kidId);
  if (g.error) return g.error;

  const { error } = await supabaseServer()
    .from('class_material')
    .delete()
    .eq('id', id)
    .eq('kid_id', kidId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
