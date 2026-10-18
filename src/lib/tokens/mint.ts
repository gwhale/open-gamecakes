// Token mint — server-only helper called from POST /api/attempts.
//
// Two reward streams stack on each session:
//   - Drip: a participation reward earned from ACTUAL play — see
//     computeSessionDrip(). It stacks time-on-task (1 cookie per full
//     minute the kid actually played) with correct answers (1 cookie
//     per CORRECT_PER_COOKIE right answers), capped at MAX_SESSION_DRIP.
//     This replaced the old flat "chosen minutes" drip, which paid the
//     full 1/2/3 cookies on any completed round — so a kid could pick a
//     3-minute round, die 20 seconds in, and still bank 3 cookies. Now
//     dying early earns little and there is no completion floor: no play
//     (no time, no correct answers) earns nothing.
//   - Tier-up bonus: a larger one-shot reward when applyAttempt()
//     promotes the kid to a new mastery tier (5 tokens). Rare,
//     visible, and the moment that justifies the wallet. Still gated
//     by correct=efficiency≥0.7 via the mastery engine.
//
// Idempotency lives in the database: token_transactions has a unique
// partial index on metadata->>'attempt_id', and mint_tokens swallows
// the constraint violation. So a double POST from a flaky client
// (rare but real on iPad) only ever credits the kid once.
//
// Guest kids never reach this module — POST /api/attempts short-
// circuits guests at the top of the handler. Keeping it that way
// means the wallet UI doesn't have to special-case guest balance.

import type { SupabaseClient } from '@supabase/supabase-js';

export const BONUS_PER_TIER_UP = 5;

// Session-drip tuning. Change these to make the everyone-plays reward more or
// less generous. The drip is time-on-task + correct answers (see
// computeSessionDrip), NOT the chosen round length.
export const CORRECT_PER_COOKIE = 3; // 1 cookie per this many CORRECT answers
export const MAX_SESSION_DRIP = 5;   // hard ceiling on a single session's drip
// Time cap for older clients that don't send the chosen round length. Matches
// the old maximum (a 3-minute round) so legacy sessions aren't under-paid.
const DEFAULT_DRIP_CAP_MIN = 3;

/** Per-session participation drip, computed from ACTUAL play. Pure.
 *
 *  Two stacking parts:
 *    • Time on task — 1 cookie per full minute actually played, but capped at
 *      the chosen round length. The cap matters because session_ms includes
 *      paused wall-time (see MarbleMazeScene), so without it a kid could pause
 *      a 1-minute round to farm time cookies.
 *    • Questions — 1 cookie per CORRECT_PER_COOKIE *correct* answers. Correct,
 *      not merely answered, so tap-spamming wrong answers earns nothing.
 *
 *  No floor: a round the kid bailed on (little time, nothing right) earns 0.
 *  The sum is clamped to MAX_SESSION_DRIP. */
export function computeSessionDrip(args: {
  sessionMs: number;
  correctAnswers: number;
  /** Chosen round length in minutes (1/2/3). Caps the time component. */
  durationMin?: number;
}): number {
  const minutesPlayed = Math.max(0, args.sessionMs) / 60_000;
  const capMin = Math.max(1, Math.round(args.durationMin ?? DEFAULT_DRIP_CAP_MIN));
  const timeCookies = Math.min(Math.round(minutesPlayed), capMin);
  const questionCookies = Math.floor(Math.max(0, args.correctAnswers) / CORRECT_PER_COOKIE);
  return Math.min(MAX_SESSION_DRIP, timeCookies + questionCookies);
}

// Milestone bonuses — coarser, rarer wins than the per-tier bump, awarded
// exactly once ever (idempotent on metadata.milestone_id, see 0026). Tune
// these two numbers to change how big the "grade level!" moments feel.
export const MILESTONE_ON_TRACK = 10;      // a skill reaches its grade-level tier
export const MILESTONE_SUBJECT_CLEAR = 25; // every graded skill in a subject is on-track

export interface MintInput {
  kidId: string;
  familyId: string;
  correct: boolean;
  completed: boolean;
  tieredUp: boolean;
  attemptId: string | null;
  gameId: string | null;
  skillSlug: string;
  tier: number;
  /** Actual time played this session, in ms (summary.session_ms). Drives the
   *  time-on-task half of the drip. */
  sessionMs: number;
  /** Correct answers this session (taps_total − taps_wrong). Drives the
   *  questions half of the drip. */
  correctAnswers: number;
  /** Chosen round length in minutes (1/2/3). Caps the time-on-task cookies so
   *  paused wall-time can't inflate the drip. Optional — older clients omit it
   *  and fall back to the legacy 3-minute cap. */
  durationMin?: number;
}

export interface MintResult {
  /** Tokens awarded this call (drip + tier-up bonus). 0 if nothing earned. */
  earned: number;
  /** Post-mint balance, or null if the mint was skipped or failed. */
  balance: number | null;
  /** Reasons that contributed (for the client celebration UI). */
  reasons: Array<'drip' | 'tier_up'>;
}

const ZERO_RESULT: MintResult = { earned: 0, balance: null, reasons: [] };

export async function mintTokensForAttempt(
  sb: SupabaseClient,
  input: MintInput,
): Promise<MintResult> {
  const reasons: Array<'drip' | 'tier_up'> = [];
  let delta = 0;

  // Participation drip: earned from ACTUAL play (time on task + correct
  // answers), not the chosen round length. Dying/bailing early earns little
  // or nothing; there is no completion floor. Mastery is the tier-up reward;
  // this is the everyone-who-actually-plays reward.
  const drip = computeSessionDrip({
    sessionMs: input.sessionMs,
    correctAnswers: input.correctAnswers,
    durationMin: input.durationMin,
  });
  if (drip > 0) {
    delta += drip;
    reasons.push('drip');
  }
  if (input.tieredUp) {
    delta += BONUS_PER_TIER_UP;
    reasons.push('tier_up');
  }

  if (delta <= 0) return ZERO_RESULT;

  // Reason carries the dominant earn type for ledger queries; the full
  // list goes in metadata so a UI can render "+1 win, +5 level up!".
  const reason = input.tieredUp ? 'tier_up' : 'session_drip';
  const metadata: Record<string, unknown> = {
    game_id: input.gameId,
    skill_slug: input.skillSlug,
    tier: input.tier,
    reasons,
    session_ms: input.sessionMs,
    correct_answers: input.correctAnswers,
  };
  if (input.attemptId) metadata.attempt_id = input.attemptId;

  const { data, error } = await sb.rpc('mint_tokens', {
    p_kid: input.kidId,
    p_family: input.familyId,
    p_delta: delta,
    p_reason: reason,
    p_metadata: metadata,
  });

  if (error) {
    console.warn('[tokens] mint failed:', error.message);
    return ZERO_RESULT;
  }

  // Postgres SETOF returns an array; the function yields one row.
  const row = Array.isArray(data) ? data[0] : data;
  const balance = row?.balance ?? null;
  const wasMinted = row?.was_minted ?? false;

  // Re-deliver of a previously-minted attempt: balance is current but
  // earned should report 0 so the client doesn't replay the celebration.
  if (!wasMinted) return { earned: 0, balance, reasons: [] };

  return { earned: delta, balance, reasons };
}

// ---------------------------------------------------------------------------
// Milestone rewards — a separate mint from the per-attempt drip/tier bonus.
//
// Kept separate (its own token_transactions rows, reason='milestone') so it
// (a) shows as its own 🏅 line in the wallet ledger, and (b) gets its own
// exactly-once guarantee keyed on metadata.milestone_id rather than the
// attempt_id used by mintTokensForAttempt. A milestone is a STABLE fact
// ("reached grade level in add-within-20"), so the milestone_id — not the
// attempt — is the right idempotency key: re-crossing after a tier-down must
// not pay twice.
// ---------------------------------------------------------------------------

export interface MilestoneEvent {
  /** Stable, unique key for this milestone — e.g. "add-within-20:on_track"
   *  or "math:all_on_track". Drives exactly-once via the unique index. */
  milestoneId: string;
  delta: number;
  kind: 'on_track' | 'subject_clear';
  skillSlug?: string;
  subject?: string;
}

export interface MilestoneMintResult {
  /** Total tokens newly awarded across all milestone events this call. */
  earned: number;
  /** Latest post-mint balance, or null if nothing minted / all deduped. */
  balance: number | null;
  /** The milestones that actually paid out (deduped ones are omitted). */
  awarded: Array<{ kind: MilestoneEvent['kind']; delta: number }>;
}

export async function mintMilestoneRewards(
  sb: SupabaseClient,
  input: { kidId: string; familyId: string; events: MilestoneEvent[] },
): Promise<MilestoneMintResult> {
  let earned = 0;
  let balance: number | null = null;
  const awarded: MilestoneMintResult['awarded'] = [];

  for (const ev of input.events) {
    const { data, error } = await sb.rpc('mint_tokens', {
      p_kid: input.kidId,
      p_family: input.familyId,
      p_delta: ev.delta,
      p_reason: 'milestone',
      p_metadata: {
        milestone_id: ev.milestoneId,
        kind: ev.kind,
        skill_slug: ev.skillSlug ?? null,
        subject: ev.subject ?? null,
      },
    });
    if (error) {
      console.warn('[tokens] milestone mint failed:', error.message);
      continue;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.balance != null) balance = row.balance as number;
    if (row?.was_minted) {
      earned += ev.delta;
      awarded.push({ kind: ev.kind, delta: ev.delta });
    }
  }

  return { earned, balance, awarded };
}
