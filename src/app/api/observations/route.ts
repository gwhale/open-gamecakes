// POST /api/observations — parent logs an observation about a kid.
//
// Body format: application/x-www-form-urlencoded (posted from a standard
// HTML form — no JavaScript required on the client). Fields:
//
//   kidId           uuid, required — which kid this is about
//   kind            'note' | 'homework' | 'writing' | 'teacher_report'
//   title           optional
//   body            required — the actual text of the observation
//   skillId         optional uuid — which skill this observation tags
//   calibratedTier  optional int 1..10 — only valid if skillId is set;
//                   triggers an explicit kid_skills update
//
// Auth: parent cookie is required (observations are a parent action, not
// a kid action). We do NOT check the active-kid cookie because the parent
// may be logging an observation about a kid different from the one who
// last played.
//
// Success: 303 redirect back to /parent so the form resets and the new
// observation appears in the list.
//
// Failure: 400 with an error query string appended to /parent. No JSON
// error body — this route is consumed by a plain HTML form so feedback
// comes through the redirect target.
//
// Calibration semantics: if calibratedTier is set, AFTER inserting the
// observation row we upsert the kid_skills row for (kidId, skillId) with:
//   - current_tier   = calibratedTier
//   - mastery_pct    = 0                (force re-measure)
//   - recent_window  = []               (drop stale samples from old tier)
//   - total_attempts = whatever it was  (preserved — this is a lifetime counter)
// We do NOT delete prior attempts rows. The audit log stays complete.

import { after, type NextRequest } from 'next/server';
import { requireParentModeOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';
import { runEvidenceEngine } from '@/lib/evidence/engine';

const ALLOWED_KINDS = new Set(['note', 'homework', 'writing', 'teacher_report']);

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

/** Pull a trimmed string field or null if absent/blank. */
function trimmedOrNull(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireParentModeOrJson();
  if (guard instanceof Response) return guard;

  const form = await request.formData();

  // --- required fields ---
  const kidId = trimmedOrNull(form, 'kidId');
  const kind  = trimmedOrNull(form, 'kind');
  const body  = trimmedOrNull(form, 'body');

  if (!kidId) return redirect303('/parent?error=missing_kid');
  if (!kind || !ALLOWED_KINDS.has(kind)) return redirect303('/parent?error=bad_kind');
  if (!body)  return redirect303('/parent?error=missing_body');

  // IDOR guard: only log observations about a kid in the caller's family.
  const denied = await requireKidInFamily(kidId, guard.family.id);
  if (denied) return denied;

  // --- optional fields ---
  const title   = trimmedOrNull(form, 'title');
  const skillId = trimmedOrNull(form, 'skillId'); // uuid or null

  const calibratedTierRaw = trimmedOrNull(form, 'calibratedTier');
  let calibratedTier: number | null = null;
  if (calibratedTierRaw !== null) {
    const parsed = Number.parseInt(calibratedTierRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
      return redirect303('/parent?error=bad_tier');
    }
    if (!skillId) return redirect303('/parent?error=calibration_needs_skill');
    calibratedTier = parsed;
  }

  // --- optional: photo path (from a prior /api/observations/upload call) ---
  const photoPath = trimmedOrNull(form, 'photoPath');
  const metadata: Record<string, unknown> = {};
  if (photoPath) {
    metadata.photo_path = photoPath;
    metadata.storage_bucket = 'observations';
  }

  const sb = supabaseServer();

  // --- optional: link to an evidence event created by a prior photo upload ---
  const evidenceEventId = trimmedOrNull(form, 'evidenceEventId');

  // --- insert the observation ---
  const { data: insertedObs, error: insertErr } = await sb
    .from('observations')
    .insert({
      kid_id: kidId,
      kind,
      title,
      body,
      skill_id: skillId,
      calibrated_tier: calibratedTier,
      metadata,
    })
    .select('id')
    .single();
  if (insertErr || !insertedObs) {
    console.warn('[observations] insert failed:', insertErr?.message ?? 'no row');
    return redirect303('/parent?error=insert_failed');
  }
  const observationId = insertedObs.id as string;

  // --- link prior photo-upload evidence event to this observation row ---
  if (evidenceEventId) {
    const { error: linkErr } = await sb
      .from('evidence_events')
      .update({ observation_id: observationId })
      .eq('id', evidenceEventId);
    if (linkErr) {
      console.warn('[observations] evidence link failed:', linkErr.message);
    }
  } else {
    // --- no prior photo event: run engine on the text body itself ---
    // Use Next's `after()` instead of fire-and-forget. On Vercel the
    // route handler's serverless function terminates on the 303 redirect
    // below; an un-awaited Promise would be killed mid-flight before the
    // engine could insert its evidence_events row. `after()` keeps the
    // function alive long enough for the engine to complete, then
    // releases it. Verified this was the root cause of observation-source
    // events never being written.
    after(async () => {
      try {
        await runEvidenceEngine(sb, {
          kidId,
          source: 'observation',
          observationId,
          artifact: { kind: 'text', text: body },
        });
      } catch (err) {
        console.warn('[observations] engine after-hook failed:', err);
      }
    });
  }

  // --- if calibrating, upsert kid_skills with the new tier ---
  if (calibratedTier !== null && skillId !== null) {
    // Read existing row so we preserve total_attempts.
    const { data: existing } = await sb
      .from('kid_skills')
      .select('total_attempts')
      .eq('kid_id', kidId)
      .eq('skill_id', skillId)
      .maybeSingle();

    const totalAttempts = (existing?.total_attempts as number | undefined) ?? 0;

    const { error: calibErr } = await sb
      .from('kid_skills')
      .upsert(
        {
          kid_id: kidId,
          skill_id: skillId,
          current_tier: calibratedTier,
          mastery_pct: 0,
          total_attempts: totalAttempts,
          recent_window: [],
        },
        { onConflict: 'kid_id,skill_id' },
      );
    if (calibErr) {
      // Observation row is already saved — the parent can see it but the
      // calibration didn't apply. Surface this as a soft error so they
      // know to retry calibration without re-entering the note text.
      console.warn('[observations] calibration upsert failed:', calibErr.message);
      return redirect303('/parent?error=calibration_failed');
    }
  }

  return redirect303('/parent?ok=1');
}
