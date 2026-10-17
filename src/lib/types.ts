// Shared TypeScript types that mirror the Supabase schema (supabase/migrations/0001_init.sql).
//
// These are hand-maintained for Phase 1 rather than generated from the database.
// When the schema stabilizes we can switch to `supabase gen types typescript` —
// for now the surface area is small and keeping these hand-written means we
// can also add derived types (e.g. RecentAttempt) that don't exist in SQL.

import type { CupcakeConfig } from './cupcake/config';

export type UUID = string;

/** ISO-8601 timestamp returned by Postgres `timestamptz` columns. */
export type Timestamp = string;

export type Subject = 'math' | 'reading';

export interface Parent {
  id: UUID;
  name: string;
  email: string | null;
  created_at: Timestamp;
}

export interface Kid {
  id: UUID;
  parent_id: UUID | null;
  name: string;
  /** Legacy emoji avatar — kept for backwards compat during the
   *  cupcake-avatar rollout. New surfaces render from cupcake_config
   *  instead; will be dropped once every reader is migrated. */
  avatar: string;
  /** Cupcake-avatar config (JSONB column). See src/lib/cupcake/config.ts
   *  for the shape + defaults. New kids start with PLAIN_CUPCAKE. */
  cupcake_config: CupcakeConfig;
  pin: string | null;
  /** Numeric grade (0 = K .. 12), nullable until a parent sets it. Drives
   *  skill defaults + trivia calibration — see lib/kids/defaults.ts. */
  grade: number | null;
  /** School year (start year) in which `grade` was accurate. Today's
   *  grade is derived from the pair, so it advances every August on its
   *  own - see lib/kids/grade.ts and migration 0044. */
  grade_year: number | null;
  /** What a grown-up pinned for Cakey to suggest, or null for "use the grade
   *  default". Set from the parent skills tab; read by cakeyRecommends().
   *  See migration 0046. */
  focus_math: string | null;
  focus_math_level: number | null;
  focus_reading: string | null;
  focus_reading_level: number | null;
  /** Town region this kid owns — a slug from REGIONS with kidLand set, or
   *  null. DB-driven ownership — see migration 0043. */
  land_slug: string | null;
  created_at: Timestamp;
}

export type SkillDomain =
  | 'counting' | 'operations' | 'place-value' | 'fractions'
  | 'measurement' | 'geometry' | 'ratios'
  | 'phonics' | 'vocabulary' | 'comprehension' | 'grammar';

export interface Skill {
  id: UUID;
  subject: Subject;
  name: string;
  display_name: string;
  tier: number;
  /** CCSS standard code(s), e.g. "K.OA.A.5, 1.OA.C.6" */
  standard_code: string | null;
  /** Full standard description from CCSS */
  standard_desc: string | null;
  /** Grade level band: "K", "1", "2", "K-1", "1-2", "2-3" */
  grade_level: string | null;
  /** Tier that means "on track" for the expected grade. */
  on_track_tier: number | null;
  /** Domain grouping — organizes skills in the parent dashboard. */
  domain: SkillDomain | null;
  /** Whether current game templates can exercise this skill. False =
   *  tracked via parent observations only until a game template is built. */
  gamifiable: boolean;
}

export interface ContentItem {
  id: UUID;
  skill_id: UUID;
  tier: number;
  game_type: string;
  payload: Record<string, unknown>;
}

/** One entry in kid_skills.recent_window — derived, not a DB type. */
export interface RecentAttempt {
  correct: boolean;
  ts: Timestamp;
}

export interface KidSkill {
  id: UUID;
  kid_id: UUID;
  skill_id: UUID;
  current_tier: number;
  mastery_pct: number;
  total_attempts: number;
  recent_window: RecentAttempt[];
}

export interface Game {
  id: UUID;
  title: string;
  game_type: string;
  subject: Subject;
  skill_ids: UUID[];
  config: Record<string, unknown>;
  created_by: UUID | null;
  source_drawing_url: string | null;
  approved: boolean;
  map_position: { x: number; y: number } | null;
  created_at: Timestamp;
}

export interface Attempt {
  id: UUID;
  kid_id: UUID;
  skill_id: UUID;
  game_id: UUID | null;
  tier: number;
  correct: boolean;
  response_time_ms: number | null;
  raw_response: Record<string, unknown> | null;
  created_at: Timestamp;
}

export type FeedbackType = 'bug' | 'feature' | 'feedback';
export type FeedbackStatus = 'new' | 'reviewed' | 'done' | 'wontfix';

export interface Feedback {
  id: UUID;
  kid_id: UUID;
  game_slug: string | null;
  raw_transcript: string;
  audio_path: string | null;
  ticket_type: FeedbackType;
  title: string;
  summary: string;
  status: FeedbackStatus;
  /** What actually shipped, written by the parent when marking status=done.
   *  Rendered to the kid in /tickets as the "release note" for their request. */
  ship_note: string | null;
  ai_raw: Record<string, unknown> | null;
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Evidence engine — unified learning signal from heterogeneous inputs.
// ---------------------------------------------------------------------------

export type EvidenceSource =
  | 'observation'      // linked to an existing observations row
  | 'photo'            // photo upload (may or may not produce an observation)
  | 'text'             // inline text note
  | 'game_session'     // secondary-skill signals from a game attempt
  | 'feedback_ticket'  // kid ticket reinterpreted as learning evidence
  | 'manual';          // parent typed in an eval directly

export type EvidenceStatus = 'applied' | 'reverted' | 'failed' | 'pending';

export type Verdict = 'correct' | 'partial' | 'incorrect' | 'not-evidenced';

export interface EvidenceEvent {
  id: UUID;
  kid_id: UUID;
  created_at: Timestamp;
  source: EvidenceSource;
  observation_id: UUID | null;
  attempt_id: UUID | null;
  feedback_id: UUID | null;
  input_text: string | null;
  photo_path: string | null;
  model_used: string | null;
  model_raw: Record<string, unknown> | null;
  status: EvidenceStatus;
  applied_at: Timestamp | null;
}

export interface EvidenceSkillRow {
  id: UUID;
  event_id: UUID;
  skill_id: UUID;
  verdict: Verdict;
  /** 0..1 — model's self-reported confidence. */
  confidence: number;
  /** 0..1 — weight this source × verdict contributes to mastery. */
  weight: number;
  /** How many boolean attempts this verdict fed into applyAttempt. */
  synthetic_attempts: number;
  reasoning: string | null;
}

export type ObservationKind = 'note' | 'homework' | 'writing' | 'teacher_report';

/** A parent-entered record about their kid's external learning — homework
 *  artifacts, writing samples, teacher reports, informal notes. When
 *  `calibrated_tier` is set, the accompanying API handler also bumps
 *  `kid_skills.current_tier` for the tagged skill and resets the rolling
 *  window so the adaptive engine re-measures from the new baseline. */
export interface Observation {
  id: UUID;
  kid_id: UUID;
  created_at: Timestamp;
  kind: ObservationKind;
  title: string | null;
  body: string;
  skill_id: UUID | null;
  calibrated_tier: number | null;
  metadata: Record<string, unknown>;
}
