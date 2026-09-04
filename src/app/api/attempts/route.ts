// POST /api/attempts — log a session attempt and update mastery.
//
// Body shape (validated at runtime):
//   {
//     subject: 'math' | 'reading' | 'logic',
//     skillSlug: string,         // e.g. 'counting-to-20' — looked up by (subject, name)
//     tier: number,              // tier the kid was playing at
//     gameSlug?: string | null,  // registry slug, e.g. 'cakey-racer'
//     gameId?: string | null,    // LEGACY, unused — see below
//     summary: {
//       taps_total: number,
//       taps_wrong: number,
//       optimal_taps: number,
//       efficiency: number,      // 0..1; correct = efficiency >= CORRECTNESS_THRESHOLD
//       completed: boolean,
//       session_ms: number,
//     }
//   }
//
// Security:
//   - Parent cookie is required (enforced by the gated layout for page routes,
//     but API routes are not under that layout, so we check here explicitly).
//   - Kid id is ALWAYS read from the `lw_kid` cookie, never from the request
//     body. The client cannot log attempts for a kid other than the active one.
//
// Consistency:
//   - We read the current kid_skills row, compute the next state in TypeScript
//     via applyAttempt(), then upsert. The `attempts` row is inserted
//     best-effort AFTER the upsert — mastery is the authoritative state,
//     attempts is an audit log. If the attempts insert fails, the kid_skills
//     row is still correct and the parent dashboard won't show this session,
//     which is the less-bad failure mode.
//   - No Postgres transaction because supabase-js doesn't expose one for
//     multi-statement work. In the rare race where two attempts from the
//     same kid arrive concurrently, one may read a stale window. Not a
//     correctness issue — just means we might miss a tier-up by one attempt.
//     Real parallel kid play is essentially impossible (one browser, one kid).

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { findGame } from '@/lib/games/registry';
import {
  applyAttempt,
  initialKidSkillState,
  MIN_EVIDENCE_ANSWERS,
  type KidSkillState,
  type WindowEntry,
} from '@/lib/mastery/update';
import { runEvidenceEngine } from '@/lib/evidence/engine';
import {
  mintTokensForAttempt,
  mintMilestoneRewards,
  computeSessionDrip,
  MILESTONE_ON_TRACK,
  MILESTONE_SUBJECT_CLEAR,
  type MilestoneEvent,
} from '@/lib/tokens/mint';
import { subjectProgress } from '@/lib/mastery/subject-progress';
import type { Subject } from '@/lib/types';

const CORRECTNESS_THRESHOLD = 0.7;

interface SessionSummary {
  taps_total: number;
  taps_wrong: number;
  optimal_taps: number;
  efficiency: number;
  completed: boolean;
  session_ms: number;
}

interface AttemptBody {
  subject: 'math' | 'reading' | 'logic';
  skillSlug: string;
  tier: number;
  /** Which game this round was played in — a slug from the TS game registry.
   *  Supersedes `gameId`, a uuid FK to a `games` table nothing seeds, which is
   *  why every attempt ever written has a null game and no parent has been able
   *  to see WHAT their kid played. Kept optional so an older client still logs
   *  its round rather than 400-ing; it just lands without attribution. */
  gameSlug?: string | null;
  /** LEGACY. Never populated by any caller. Retained so an old client's body
   *  still validates; nothing reads it. */
  gameId?: string | null;
  summary: SessionSummary;
  /** Chosen play length in minutes (1/2/3). Sizes the game clock and caps the
   *  time-on-task cookies (see computeSessionDrip); it no longer sets the drip
   *  by itself. Optional — older clients omit it and fall back to a 3-min cap. */
  durationMin?: number;
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function isSessionSummary(x: unknown): x is SessionSummary {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.taps_total    === 'number' &&
    typeof s.taps_wrong    === 'number' &&
    typeof s.optimal_taps  === 'number' &&
    typeof s.efficiency    === 'number' &&
    typeof s.completed     === 'boolean' &&
    typeof s.session_ms    === 'number'
  );
}

function parseBody(raw: unknown): AttemptBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (b.subject !== 'math' && b.subject !== 'reading' && b.subject !== 'logic') return null;
  if (typeof b.skillSlug !== 'string' || b.skillSlug.length === 0) return null;
  if (typeof b.tier !== 'number' || b.tier < 1 || b.tier > 10) return null;
  if (b.gameId !== undefined && b.gameId !== null && typeof b.gameId !== 'string') return null;
  if (b.gameSlug !== undefined && b.gameSlug !== null && typeof b.gameSlug !== 'string') return null;
  if (!isSessionSummary(b.summary)) return null;
  if (b.durationMin !== undefined && typeof b.durationMin !== 'number') return null;
  return {
    subject: b.subject,
    skillSlug: b.skillSlug,
    tier: b.tier,
    gameSlug: (b.gameSlug as string | null | undefined) ?? null,
    gameId: (b.gameId as string | null | undefined) ?? null,
    summary: b.summary,
    durationMin: b.durationMin as number | undefined,
  };
}

/** Correct answers in a session = total answered − wrong. Clamped at 0 so a
 *  malformed summary (wrong > total) can't feed a negative into the drip. */
function correctAnswers(summary: SessionSummary): number {
  return Math.max(0, summary.taps_total - summary.taps_wrong);
}

export async function POST(request: NextRequest): Promise<Response> {
  // --- auth ---
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Family-scoped guard: kid must belong to this parent's family.
  // Guest sandbox kids are a well-known UUID and bypass family check
  // (sandbox lives outside the family model — see isGuest).
  if (!isGuest(kidId)) {
    const { data: kidCheck } = await supabaseServer().from('kids')
      .select('id').eq('id', kidId).eq('family_id', family.id).maybeSingle();
    if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });
  }

  // Guest (sandbox) profile is a well-known UUID; see src/lib/auth/guest.ts.
  const guestSession = isGuest(kidId);

  // --- body parsing + validation ---
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const body = parseBody(raw);
  if (!body) return badRequest('invalid body shape');

  // Guest bails here: we've validated the payload shape and auth, so the
  // client gets a plausible 200 response. No kid_skills upsert, no attempts
  // insert, no evidence engine run.
  if (guestSession) {
    const correct = body.summary.efficiency >= CORRECTNESS_THRESHOLD;
    // Guest never mints REAL tokens — the sandbox lives outside the
    // family/wallet model, so there's no kid_tokens row to credit. But for
    // playtesting we report a normal participation drip so the game-over
    // "+N 🪙" celebration shows; the client banks it in an ephemeral
    // session-only wallet (see lib/tokens/guest-wallet). `guest: true` tells
    // the client to use that local wallet instead of the (absent) server one.
    const earned = computeSessionDrip({
      sessionMs: body.summary.session_ms,
      correctAnswers: correctAnswers(body.summary),
      durationMin: body.durationMin,
    });
    return Response.json({
      correct,
      currentTier: body.tier,
      masteryPct: correct ? 1 : 0,
      tieredUp: false,
      tieredDown: false,
      guest: true,
      tokensEarned: earned,
      tokensBalance: null,
      tokenReasons: earned > 0 ? ['drip'] : [],
    });
  }

  const sb = supabaseServer();

  // --- look up skill by slug ---
  const { data: skillRow, error: skillErr } = await sb
    .from('skills')
    .select('id, subject, name, on_track_tier')
    .eq('subject', body.subject)
    .eq('name', body.skillSlug)
    .maybeSingle();
  if (skillErr) return Response.json({ error: `skill lookup failed: ${skillErr.message}` }, { status: 500 });
  if (!skillRow) return badRequest(`unknown skill ${body.subject}.${body.skillSlug}`);

  const skillId: string = skillRow.id;
  const correct = body.summary.efficiency >= CORRECTNESS_THRESHOLD;
  const ts = new Date().toISOString();

  // A micro-session (fewer than MIN_EVIDENCE_ANSWERS answered problems)
  // is not evidence of anything — a kid opening a game and bouncing 20
  // seconds later hasn't shown they can't add, they've shown they didn't
  // feel like playing. These still get audit-logged in `attempts` and
  // still drip participation tokens, but they don't touch the mastery
  // window in either direction.
  const countsAsEvidence = body.summary.taps_total >= MIN_EVIDENCE_ANSWERS;

  // --- read current kid_skills row (or default if absent) ---
  const { data: existing, error: fetchErr } = await sb
    .from('kid_skills')
    .select('current_tier, mastery_pct, total_attempts, recent_window')
    .eq('kid_id', kidId)
    .eq('skill_id', skillId)
    .maybeSingle();
  if (fetchErr) return Response.json({ error: `kid_skills read failed: ${fetchErr.message}` }, { status: 500 });

  const currentState: KidSkillState = existing
    ? {
        current_tier: existing.current_tier as number,
        mastery_pct: existing.mastery_pct as number,
        total_attempts: existing.total_attempts as number,
        recent_window: (existing.recent_window as WindowEntry[]) ?? [],
      }
    : initialKidSkillState();

  // --- compute next mastery state (no-op for non-evidence sessions) ---
  const { next, tieredUp, tieredDown } = countsAsEvidence
    ? applyAttempt(currentState, { correct, ts })
    : { next: currentState, tieredUp: false, tieredDown: false };

  // --- upsert kid_skills (authoritative) ---
  if (countsAsEvidence) {
    const { error: upsertErr } = await sb
      .from('kid_skills')
      .upsert(
        {
          kid_id: kidId,
          skill_id: skillId,
          current_tier: next.current_tier,
          mastery_pct: next.mastery_pct,
          total_attempts: next.total_attempts,
          recent_window: next.recent_window,
        },
        { onConflict: 'kid_id,skill_id' },
      );
    if (upsertErr) return Response.json({ error: `kid_skills upsert failed: ${upsertErr.message}` }, { status: 500 });
  }

  // --- insert attempts row (audit log, best effort) ---
  const { data: attemptRow, error: attemptErr } = await sb
    .from('attempts')
    .insert({
      kid_id: kidId,
      skill_id: skillId,
      game_id: body.gameId ?? null,
      // Validated against the registry rather than stored as sent: an unknown
      // slug lands as NULL instead of poisoning per-game rollups with a typo
      // that looks like a real game.
      game_slug: body.gameSlug && findGame(body.gameSlug) ? body.gameSlug : null,
      tier: body.tier,
      correct,
      response_time_ms: body.summary.session_ms,
      // Promoted out of raw_response so they are groupable/indexable. Same
      // values, still also present in the JSON for anything already reading it.
      completed: body.summary.completed,
      efficiency: body.summary.efficiency,
      taps_total: body.summary.taps_total,
      taps_wrong: body.summary.taps_wrong,
      raw_response: body.summary,
    })
    .select('id')
    .maybeSingle();
  if (attemptErr) {
    // kid_skills is already updated; log but do not fail the request.
    console.warn('[attempts] audit log insert failed:', attemptErr.message);
  }
  const attemptId = (attemptRow?.id as string | undefined) ?? null;

  // --- token mint (drip + tier-up bonus) ---
  // Awaited so the response carries the new balance and the client
  // can render the +N celebration in the same paint as the tier-up
  // badge. Failure is soft — if the RPC errors we log and proceed;
  // the kid still sees their tier change, they just won't see tokens
  // for this run. The unique partial index on token_transactions
  // makes a retry-from-flaky-network safe (no double-mint).
  const mint = await mintTokensForAttempt(sb, {
    kidId,
    familyId: family.id,
    correct,
    completed: body.summary.completed,
    tieredUp,
    attemptId,
    gameId: body.gameId ?? null,
    skillSlug: body.skillSlug,
    tier: body.tier,
    sessionMs: body.summary.session_ms,
    correctAnswers: correctAnswers(body.summary),
    durationMin: body.durationMin,
  });

  // --- milestone rewards (coarser than tier-ups, awarded once ever) ---
  // A milestone fires only when THIS attempt pushed the primary skill from
  // below its grade-level tier to at-or-above it (a rare, celebratory
  // crossing — not every tier bump). Reaching grade level may also complete
  // the whole subject, so we re-check subject completion in that same moment.
  // Each milestone is idempotent on metadata.milestone_id (see 0026), so a
  // tier-down-then-recross never double-pays. Placement/parent-calibration
  // reaches grade level without playing, and intentionally earns nothing here.
  const onTrackTier = skillRow.on_track_tier as number | null;
  const reachedGradeLevel =
    countsAsEvidence &&
    onTrackTier != null &&
    currentState.current_tier < onTrackTier &&
    next.current_tier >= onTrackTier;

  const milestoneEvents: MilestoneEvent[] = [];
  if (reachedGradeLevel) {
    milestoneEvents.push({
      milestoneId: `${body.skillSlug}:on_track`,
      delta: MILESTONE_ON_TRACK,
      kind: 'on_track',
      skillSlug: body.skillSlug,
      subject: body.subject,
    });

    // Completing a subject can only newly happen at the instant a skill first
    // reaches grade level — so the (heavier) subject-wide read is gated here.
    const [{ data: subjSkills }, { data: subjKidSkills }] = await Promise.all([
      sb.from('skills').select('id, subject, on_track_tier').eq('subject', body.subject),
      sb.from('kid_skills').select('skill_id, current_tier, total_attempts').eq('kid_id', kidId),
    ]);
    const prog = subjectProgress(
      body.subject as Subject,
      (subjSkills ?? []) as { id: string; subject: Subject; on_track_tier: number | null }[],
      (subjKidSkills ?? []) as { skill_id: string; current_tier: number; total_attempts: number }[],
    );
    if (prog.total > 0 && prog.onTrack === prog.total) {
      milestoneEvents.push({
        milestoneId: `${body.subject}:all_on_track`,
        delta: MILESTONE_SUBJECT_CLEAR,
        kind: 'subject_clear',
        subject: body.subject,
      });
    }
  }

  const milestone = milestoneEvents.length
    ? await mintMilestoneRewards(sb, {
        kidId,
        familyId: family.id,
        events: milestoneEvents,
      })
    : { earned: 0, balance: null, awarded: [] as Array<{ kind: MilestoneEvent['kind']; delta: number }> };

  // --- secondary-skill evidence (fire-and-forget) ---
  // The primary skill is already updated above via applyAttempt. The
  // evidence engine re-reads the same session summary and evaluates
  // against SECONDARY skills (e.g. a Sharks session on add-within-10
  // may also exercise counting-to-20 or place-value). Source weight
  // for game_session is 0.4, so these contributions are small.
  //
  // We fire this off without awaiting so the game client gets its tier
  // update response instantly. The engine writes its own rows on
  // completion. If the evaluator errors, games still work.
  const sessionText = [
    `Game session: ${body.subject} / ${body.skillSlug} at tier ${body.tier}`,
    `Session result: ${correct ? 'correct' : 'incorrect'}`
      + ` (efficiency ${Math.round(body.summary.efficiency * 100)}%)`,
    `Optimal taps: ${body.summary.optimal_taps}, actual: ${body.summary.taps_total}, wrong: ${body.summary.taps_wrong}`,
    `Completed: ${body.summary.completed ? 'yes' : 'no'}, duration ${Math.round(body.summary.session_ms / 1000)}s`,
  ].join('\n');

  // No-evidence sessions skip the engine too — there's nothing for the
  // evaluator to infer from a session with no answered problems.
  if (countsAsEvidence) {
    runEvidenceEngine(sb, {
      kidId,
      source: 'game_session',
      attemptId,
      artifact: {
        kind: 'game_session',
        text: sessionText,
        primarySkillSlug: body.skillSlug,
      },
    }).catch((err) => {
      console.warn('[attempts] evidence engine soft-failed:', err);
    });
  }

  // Combine the two mint streams for the client: total earned this session,
  // the freshest balance (milestone mint runs last, so its balance wins when
  // one paid out), and the reason list extended with a 'milestone' marker per
  // award so the game-over "+N 🪙" celebration reflects the bonus.
  const tokensEarned = mint.earned + milestone.earned;
  const tokensBalance = milestone.balance ?? mint.balance;
  const tokenReasons = [
    ...mint.reasons,
    ...milestone.awarded.map(() => 'milestone' as const),
  ];

  return Response.json({
    correct,
    counted: countsAsEvidence,
    currentTier: next.current_tier,
    masteryPct: next.mastery_pct,
    tieredUp,
    tieredDown,
    tokensEarned,
    tokensBalance,
    tokenReasons,
    milestones: milestone.awarded,
  });
}
