// POST /api/deep/chest — ask a kid three questions, then open the chest.
//
// This replaces /api/deep/discover, which was deleted with it. That route
// granted the item on request, with no gate at all: anything that could reach it
// could empty the ocean in a loop. A gate the client enforces is the same route
// with more steps, so the marking happens here.
//
// THE CLIENT NEVER SENDS "I GOT IT RIGHT". It sends what the kid typed. This
// route regenerates every question the run has asked — they are derived from
// (kid, chest, index), not stored — and re-marks the whole run from those raw
// answers. Forging a pass therefore requires knowing the answers, which is not
// forging anything.
//
// It is deliberately STATELESS. A runs table would mean a migration, a row per
// attempt, and a sweeper for every kid who swims off mid-question, in exchange
// for nothing this design does not already have.
//
// WHAT THE KID IS ASKED comes from pickNext() — the recommender that has sat in
// this repo, tested and complete, with nothing in the app calling it. This is
// its first caller. One chest asks about ONE skill, so three questions on one
// thing is legible to a kid in a way a scattergun is not.
//
// MASTERY IS CREDITED once, on the request that opens the chest, by calling
// applyAttempt() directly rather than posting to /api/attempts. That route is
// session-shaped: it wants a SessionSummary, derives correctness from
// efficiency >= 0.7, needs a gameSlug, and mints Sugar Tokens. A chest is not a
// game round, it has no tokens by design, and inventing a fake session to reuse
// the route would corrupt per-game rollups to save a few lines here.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { findChest } from '@/lib/deep/chest-catalog';
import { findItem } from '@/lib/items/catalog';
import { pickNext, practiceOpFor } from '@/lib/recommendations/next-play';
import { gradeLabel } from '@/lib/kids/defaults';
import { currentGradeOf } from '@/lib/kids/grade';
import { SUB_DOCK_REGION } from '@/lib/town/three/sub-dock';
import {
  applyAttempt,
  initialKidSkillState,
  type KidSkillState,
  type WindowEntry,
} from '@/lib/mastery/update';
import {
  MAX_ANSWERS,
  challengeAt,
  gateSpec,
  markRun,
  type GateSpec,
} from '@/lib/deep/gate';
import type { Kid, Skill, KidSkill, Attempt } from '@/lib/types';

type Supa = ReturnType<typeof supabaseServer>;

/**
 * Fold a finished run into the kid's mastery for that skill.
 *
 * Every answer counts, the wrong ones too: a wrong answer is evidence, and
 * dropping it would flatter the window that decides when a kid tiers up.
 */
async function creditRun(
  sb: Supa,
  kidId: string,
  skillId: string,
  results: readonly boolean[],
): Promise<void> {
  const { data: existing, error } = await sb
    .from('kid_skills')
    .select('current_tier, mastery_pct, total_attempts, recent_window')
    .eq('kid_id', kidId)
    .eq('skill_id', skillId)
    .maybeSingle();
  if (error) {
    console.warn('[deep/chest] kid_skills read failed:', error.message);
    return;
  }

  let state: KidSkillState = existing
    ? {
        current_tier: existing.current_tier as number,
        mastery_pct: existing.mastery_pct as number,
        total_attempts: existing.total_attempts as number,
        recent_window: (existing.recent_window as WindowEntry[]) ?? [],
      }
    : initialKidSkillState();

  const now = Date.now();
  results.forEach((correct, i) => {
    // ISO strings, and spread a second apart, so the window keeps the order
    // they were answered in rather than collapsing the run into one instant.
    state = applyAttempt(state, {
      correct,
      ts: new Date(now - (results.length - 1 - i) * 1000).toISOString(),
    }).next;
  });

  const { error: upsertErr } = await sb.from('kid_skills').upsert(
    {
      kid_id: kidId,
      skill_id: skillId,
      current_tier: state.current_tier,
      mastery_pct: state.mastery_pct,
      total_attempts: state.total_attempts,
      recent_window: state.recent_window,
    },
    { onConflict: 'kid_id,skill_id' },
  );
  if (upsertErr) console.warn('[deep/chest] kid_skills upsert failed:', upsertErr.message);
}

/** What the chest should ask this kid about. */
async function specForKid(
  sb: Supa,
  kidId: string,
  kid: Pick<Kid, 'grade' | 'grade_year'>,
): Promise<GateSpec> {
  const [skillsRes, ksRes, attemptsRes] = await Promise.all([
    sb.from('skills').select('*'),
    sb.from('kid_skills').select('*').eq('kid_id', kidId),
    sb
      .from('attempts')
      .select('*')
      .eq('kid_id', kidId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const rec = pickNext({
    skills: (skillsRes.data ?? []) as Skill[],
    kidSkills: (ksRes.data ?? []) as KidSkill[],
    recentAttempts: (attemptsRes.data ?? []) as Attempt[],
    options: {
      limit: 1,
      // NOT onlyGamifiable. There is no game to send them to — the question is
      // asked here, on the seabed — so a skill with no game template is still a
      // perfectly good thing for a chest to ask about.
      onlyGamifiable: false,
      kidGrade: gradeLabel(currentGradeOf(kid)),
    },
  })[0];

  if (!rec) {
    // A kid with no skill rows yet. Refusing to open the chest would strand
    // them at a thing they cannot use, so ask a few easy ones and credit
    // nothing (an empty skillId switches crediting off).
    return gateSpec({
      subject: 'math',
      op: 'mixed',
      tier: 2,
      skillId: '',
      skillSlug: '',
      displayName: 'A few quick ones',
      reason: 'just to warm up',
    });
  }

  return gateSpec({
    subject: rec.subject,
    op: practiceOpFor(rec.skillSlug),
    tier: rec.currentTier,
    skillId: rec.skillId,
    skillSlug: rec.skillSlug,
    displayName: rec.displayName,
    reason: rec.reason,
  });
}

/** What the dialog shows when a chest opens. Both the real path and the
 *  sandbox hand back the same shape; only the writes differ. */
function itemPayloadFor(itemSlug: string) {
  const item = findItem(itemSlug);
  return item
    ? { slug: item.slug, name: item.name, emoji: item.emoji, note: item.note }
    : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson('play');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  let raw: { chest_slug?: unknown; answers?: unknown } | null;
  try {
    raw = (await request.json()) as { chest_slug?: unknown; answers?: unknown };
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const slug = raw?.chest_slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    return Response.json({ error: 'invalid body shape' }, { status: 400 });
  }

  // The body names a CHEST. Which item it holds is decided here, from the
  // catalog — so a crafted request cannot mint an item of its choosing.
  const chest = findChest(slug);
  if (!chest) return Response.json({ error: 'unknown chest' }, { status: 400 });

  const answersRaw = raw?.answers;
  if (answersRaw !== undefined && !Array.isArray(answersRaw)) {
    return Response.json({ error: 'invalid body shape' }, { status: 400 });
  }
  const answers = (answersRaw ?? [])
    .slice(0, MAX_ANSWERS)
    .map((a: unknown) => (typeof a === 'string' ? a : ''));

  // ---- The sandbox answers the questions but banks nothing. ----
  //
  // A guest has no kid_skills to recommend from, no wallet, no family row and
  // nothing to write to, so every query below would be wrong for them. What
  // they DO get is the real gate: real questions, really marked, and the card
  // at the end. Only the two rows are missing, which is the same bargain the
  // rest of the sandbox strikes -- and it is why the backpack stays empty for
  // a guest, exactly as kids/inventory/page.tsx already says it does.
  if (isGuest(kidId)) {
    const spec = gateSpec({
      subject: 'math',
      op: 'mixed',
      tier: 3,
      skillId: '',
      skillSlug: '',
      displayName: 'A few quick ones',
      reason: 'the chest will not open until you do',
    });
    const guestRun = markRun(spec, kidId, chest.slug, answers);
    const last = guestRun.results.length
      ? guestRun.results[guestRun.results.length - 1]
      : null;
    return Response.json(
      guestRun.progress.open
        ? {
            open: true,
            alreadyOpen: false,
            correct: guestRun.progress.correct,
            needed: guestRun.progress.needed,
            lastCorrect: last,
            item: itemPayloadFor(chest.item),
          }
        : {
            open: false,
            asked: guestRun.progress.asked,
            correct: guestRun.progress.correct,
            needed: guestRun.progress.needed,
            lastCorrect: last,
            challenge: challengeAt(spec, kidId, chest.slug, guestRun.results.length),
            skill: { name: spec.displayName, reason: spec.reason },
          },
    );
  }

  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids')
    .select('id, grade, grade_year')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidRow) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // The dive is gated on Caramel Cove and so is this. The page checks it too,
  // but a route that hands out an item must not depend on the page it happens
  // to have been called from — that is the whole reason this file exists.
  const { data: cove } = await sb
    .from('kid_region_discoveries')
    .select('region_slug')
    .eq('kid_id', kidId)
    .eq('region_slug', SUB_DOCK_REGION)
    .maybeSingle();
  if (!cove) return Response.json({ error: 'the cove is not yours yet' }, { status: 403 });

  const itemPayload = itemPayloadFor(chest.item);

  // Already open? A kid tapping a chest they have met before is a normal thing
  // to do, and must not be an error or a second set of questions.
  const { data: already } = await sb
    .from('kid_deep_discoveries')
    .select('landmark_slug')
    .eq('kid_id', kidId)
    .eq('landmark_slug', chest.slug)
    .maybeSingle();
  if (already) {
    return Response.json({ open: true, alreadyOpen: true, item: itemPayload });
  }

  const spec = await specForKid(sb, kidId, kidRow as Pick<Kid, 'grade' | 'grade_year'>);
  const { results, progress } = markRun(spec, kidId, chest.slug, answers);
  const lastCorrect = results.length > 0 ? results[results.length - 1] : null;

  if (!progress.open) {
    return Response.json({
      open: false,
      asked: progress.asked,
      correct: progress.correct,
      needed: progress.needed,
      // Whether the answer just sent was right, so the dialog can react without
      // marking anything itself.
      lastCorrect,
      challenge: challengeAt(spec, kidId, chest.slug, results.length),
      skill: { name: spec.displayName, reason: spec.reason },
    });
  }

  // ---- Open it. Two writes, both idempotent, deliberately not a transaction:
  // a half-write is fixed by re-opening, where a rollback would erase a find
  // the kid watched happen. ----
  const { error: findErr } = await sb
    .from('kid_deep_discoveries')
    .upsert(
      { kid_id: kidId, family_id: family.id, landmark_slug: chest.slug },
      { onConflict: 'kid_id,landmark_slug', ignoreDuplicates: true },
    );
  if (findErr) console.warn('[deep/chest] discovery write failed:', findErr.message);

  const { error: itemErr } = await sb
    .from('kid_items')
    .upsert(
      {
        kid_id: kidId,
        family_id: family.id,
        item_slug: chest.item,
        source: `deep:${chest.slug}`,
      },
      { onConflict: 'kid_id,item_slug', ignoreDuplicates: true },
    );
  if (itemErr) console.warn('[deep/chest] item grant failed:', itemErr.message);

  if (spec.skillId) await creditRun(sb, kidId, spec.skillId, results);

  return Response.json({
    open: true,
    alreadyOpen: false,
    asked: progress.asked,
    correct: progress.correct,
    needed: progress.needed,
    lastCorrect,
    item: itemPayload,
  });
}
