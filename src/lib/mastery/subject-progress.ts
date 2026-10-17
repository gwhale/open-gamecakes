// Simplified per-subject progress — one aggregate that mirrors, in miniature,
// the parent dashboard's "on track" count. The kid-facing Cakey Store bars and
// the parent summary both read THIS so the two views can never drift.
//
// Definition (matches KidDashboard's summary logic): within a subject, count
// the skills that carry a grade target (`on_track_tier != null`). A skill is
// "at grade level" when the kid has actually PRACTICED it (`total_attempts > 0`)
// AND `current_tier >= on_track_tier`. The `total_attempts > 0` guard is
// deliberate — a freshly-initialized `kid_skills` row defaults to tier 1 and
// would otherwise read as "mastered" on K-level skills the kid never played.

import type { Subject } from '@/lib/types';

export interface SubjectProgress {
  /** onTrack / total, in 0..1 (0 when the subject has no graded skills). */
  pct: number;
  onTrack: number;
  total: number;
}

/** Minimal shapes so callers can pass trimmed SELECTs (not full rows). */
interface SkillLike {
  id: string;
  subject: Subject;
  on_track_tier: number | null;
}
interface KidSkillLike {
  skill_id: string;
  current_tier: number;
  total_attempts: number;
}

export function subjectProgress(
  subject: Subject,
  skills: SkillLike[],
  kidSkills: KidSkillLike[],
): SubjectProgress {
  const ksById = new Map(kidSkills.map((k) => [k.skill_id, k]));
  const graded = skills.filter((s) => s.subject === subject && s.on_track_tier != null);
  const total = graded.length;

  let onTrack = 0;
  for (const s of graded) {
    const ks = ksById.get(s.id);
    if (ks && ks.total_attempts > 0 && ks.current_tier >= (s.on_track_tier as number)) {
      onTrack += 1;
    }
  }

  return { pct: total > 0 ? onTrack / total : 0, onTrack, total };
}
