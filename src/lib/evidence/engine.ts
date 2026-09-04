// Evidence engine orchestrator.
//
// Ties the evaluator + translator + DB together. Called from:
//   - /api/evidence (manual text/photo triggers)
//   - /api/observations/upload (after AI extraction succeeds)
//   - /api/observations POST (after a text note is saved)
//   - /api/attempts (after a game session, for SECONDARY skill signals)
//
// Flow:
//   1. Load skills catalog + kid's current kid_skills rows (kidContext).
//   2. Call evaluateEvidence() → verdicts[].
//   3. Insert evidence_events row with model_raw.
//   4. For each verdict:
//      - translate → N synthetic boolean attempts
//      - fold through applyAttempt() sequentially
//      - upsert kid_skills with final state
//      - insert evidence_skills row with synthetic_attempts count
//   5. Mark event status 'applied'. Return summary.
//
// Server-side only — uses supabaseServer().

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateEvidence,
  type EvaluatedVerdict,
  type EvaluationInput,
  type KidContextRow,
} from '@/lib/ai/evidence-evaluate';
import { translateVerdict } from '@/lib/evidence/apply';
import {
  applyAttempt,
  initialKidSkillState,
  type KidSkillState,
  type WindowEntry,
} from '@/lib/mastery/update';
import type {
  EvidenceSource,
  Skill,
  Verdict,
} from '@/lib/types';

export interface EngineInput {
  kidId: string;
  source: EvidenceSource;
  /** If this event ties back to an existing row, pass the id here. */
  observationId?: string | null;
  attemptId?: string | null;
  feedbackId?: string | null;
  /** The artifact itself — exactly one of these populated. */
  artifact:
    | { kind: 'photo'; dataUrl: string; text?: string; photoPath?: string }
    | { kind: 'text'; text: string }
    | { kind: 'game_session'; text: string; primarySkillSlug: string };
  parentPrompt?: string;
}

export interface AppliedVerdict {
  skillId: string;
  skillSlug: string;
  verdict: Verdict;
  confidence: number;
  weight: number;
  syntheticAttempts: number;
  reasoning: string;
  tieredUp: boolean;
  tieredDown: boolean;
  newTier: number;
  newMasteryPct: number;
}

export interface EngineResult {
  ok: true;
  eventId: string;
  summary: string;
  applied: AppliedVerdict[];
  skipped: Array<{ skillSlug: string; reason: string }>;
  modelUsed: string;
}

export interface EngineFailure {
  ok: false;
  reason: string;
  eventId?: string;
}

export async function runEvidenceEngine(
  sb: SupabaseClient,
  input: EngineInput,
): Promise<EngineResult | EngineFailure> {
  // --- 1. Load kid metadata (name + grade-ish) ---
  const { data: kidRow, error: kidErr } = await sb
    .from('kids')
    .select('id, name')
    .eq('id', input.kidId)
    .maybeSingle();
  if (kidErr || !kidRow) {
    return { ok: false, reason: `kid lookup failed: ${kidErr?.message ?? 'not found'}` };
  }
  const kidName = kidRow.name as string;
  const kidGrade = kidGradeFromName(kidName);

  // --- 2. Load skills catalog ---
  const { data: skillRows, error: skillErr } = await sb
    .from('skills')
    .select('id, name, display_name, subject, standard_code, grade_level, on_track_tier, domain');
  if (skillErr || !skillRows) {
    return { ok: false, reason: `skills load failed: ${skillErr?.message ?? 'empty'}` };
  }
  const skills = skillRows as Array<Pick<
    Skill,
    'id' | 'name' | 'display_name' | 'subject' | 'standard_code' | 'grade_level' | 'on_track_tier' | 'domain'
  >>;
  const skillBySlug = new Map(skills.map((s) => [s.name, s]));

  // --- 3. Load current kid_skills rows for context ---
  const { data: ksRows } = await sb
    .from('kid_skills')
    .select('skill_id, current_tier, mastery_pct, total_attempts, recent_window')
    .eq('kid_id', input.kidId);
  const ksMap = new Map<string, KidSkillState>();
  const kidContext: KidContextRow[] = [];
  for (const row of ksRows ?? []) {
    const state: KidSkillState = {
      current_tier: row.current_tier as number,
      mastery_pct: row.mastery_pct as number,
      total_attempts: row.total_attempts as number,
      recent_window: (row.recent_window as WindowEntry[]) ?? [],
    };
    ksMap.set(row.skill_id as string, state);
    const slug = skills.find((s) => s.id === row.skill_id)?.name;
    if (slug) {
      kidContext.push({
        skillSlug: slug,
        currentTier: state.current_tier,
        masteryPct: state.mastery_pct,
      });
    }
  }

  // --- 4. Build evaluator input ---
  const evalInput: EvaluationInput = {
    artifactType: input.artifact.kind === 'photo'
      ? 'photo'
      : input.artifact.kind === 'game_session'
        ? 'game_session'
        : 'text',
    photoDataUrl: input.artifact.kind === 'photo' ? input.artifact.dataUrl : undefined,
    text: 'text' in input.artifact ? input.artifact.text : undefined,
    parentPrompt: input.parentPrompt,
    kidName,
    kidGrade,
    kidContext,
    skills,
    primarySkillSlug: input.artifact.kind === 'game_session'
      ? input.artifact.primarySkillSlug
      : undefined,
  };

  const evalResult = await evaluateEvidence(evalInput);

  // --- 5. Insert evidence_events row regardless of success ---
  const eventInsert = {
    kid_id: input.kidId,
    source: input.source,
    observation_id: input.observationId ?? null,
    attempt_id: input.attemptId ?? null,
    feedback_id: input.feedbackId ?? null,
    input_text: 'text' in input.artifact ? input.artifact.text ?? null : null,
    photo_path: input.artifact.kind === 'photo' ? (input.artifact.photoPath ?? null) : null,
    model_used: evalResult.ok ? evalResult.modelUsed : null,
    model_raw: evalResult.ok ? { verdicts: evalResult.verdicts, summary: evalResult.summary, raw: evalResult.rawModelText } : { error: evalResult.reason },
    status: evalResult.ok ? 'applied' : 'failed',
  };
  const { data: eventRow, error: eventErr } = await sb
    .from('evidence_events')
    .insert(eventInsert)
    .select('id')
    .single();
  if (eventErr || !eventRow) {
    return { ok: false, reason: `event insert failed: ${eventErr?.message ?? 'no row'}` };
  }
  const eventId = eventRow.id as string;

  if (!evalResult.ok) {
    return { ok: false, reason: evalResult.reason, eventId };
  }

  // --- 6. Apply each verdict ---
  const applied: AppliedVerdict[] = [];
  const skipped: Array<{ skillSlug: string; reason: string }> = [];

  for (const v of evalResult.verdicts) {
    const skill = skillBySlug.get(v.skillSlug);
    if (!skill) {
      skipped.push({ skillSlug: v.skillSlug, reason: 'unknown skill slug' });
      continue;
    }

    const translated = translateVerdict({
      verdict: v.verdict,
      confidence: v.confidence,
      source: input.source,
    });

    // Insert evidence_skills row (kept for audit even if 0 synthetic).
    const { error: esErr } = await sb.from('evidence_skills').insert({
      event_id: eventId,
      skill_id: skill.id,
      verdict: v.verdict,
      confidence: v.confidence,
      weight: sourceWeightFor(input.source),
      synthetic_attempts: translated.syntheticAttempts,
      reasoning: v.reasoning,
    });
    if (esErr) {
      skipped.push({ skillSlug: v.skillSlug, reason: `evidence_skills insert: ${esErr.message}` });
      continue;
    }

    if (translated.syntheticAttempts === 0) {
      skipped.push({ skillSlug: v.skillSlug, reason: 'weight below threshold' });
      continue;
    }

    // Fold the synthetic attempts through applyAttempt sequentially.
    let state = ksMap.get(skill.id) ?? initialKidSkillState();
    let tieredUp = false;
    let tieredDown = false;
    const baseTs = new Date().toISOString();
    for (let i = 0; i < translated.attempts.length; i++) {
      const update = applyAttempt(state, {
        correct: translated.attempts[i],
        ts: baseTs,
      });
      state = update.next;
      if (update.tieredUp) tieredUp = true;
      if (update.tieredDown) tieredDown = true;
    }
    ksMap.set(skill.id, state);

    // Upsert kid_skills.
    const { error: upsertErr } = await sb
      .from('kid_skills')
      .upsert(
        {
          kid_id: input.kidId,
          skill_id: skill.id,
          current_tier: state.current_tier,
          mastery_pct: state.mastery_pct,
          total_attempts: state.total_attempts,
          recent_window: state.recent_window,
        },
        { onConflict: 'kid_id,skill_id' },
      );
    if (upsertErr) {
      skipped.push({ skillSlug: v.skillSlug, reason: `kid_skills upsert: ${upsertErr.message}` });
      continue;
    }

    applied.push({
      skillId: skill.id,
      skillSlug: v.skillSlug,
      verdict: v.verdict,
      confidence: v.confidence,
      weight: sourceWeightFor(input.source),
      syntheticAttempts: translated.syntheticAttempts,
      reasoning: v.reasoning,
      tieredUp,
      tieredDown,
      newTier: state.current_tier,
      newMasteryPct: state.mastery_pct,
    });
  }

  return {
    ok: true,
    eventId,
    summary: evalResult.summary,
    applied,
    skipped,
    modelUsed: evalResult.modelUsed,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kidGradeFromName(name: string): string {
  // Mirrors kidGrade() in ParentDashboard.tsx. When we add a grade column
  // to kids, replace this lookup with a direct read.
  const n = name.toLowerCase();
  if (n.startsWith('anna')) return '2';
  if (n.startsWith('char')) return 'K';
  return '1';
}

function sourceWeightFor(source: EvidenceSource): number {
  // Re-import would be cleaner but apply.ts already exports this; keep
  // local mirror to avoid a second runtime import. Values must match.
  const map: Record<EvidenceSource, number> = {
    photo: 0.8,
    observation: 0.8,
    text: 0.6,
    manual: 1.0,
    game_session: 0.4,
    feedback_ticket: 0.25,
  };
  return map[source] ?? 0.5;
}
