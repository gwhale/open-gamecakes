// POST /api/observations/upload — handle a parent's photo upload.
//
// Flow:
//   1. Parent authorized (site cookie + parent admin cookie)
//   2. Receive multipart form with: file (image), kidId, optional prompt
//   3. Read the file bytes, derive a content type
//   4. Upload to Supabase Storage under `observations/<kidId>/<timestamp>.<ext>`
//   5. Also build a base64 data URL for the vision model (we don't rely on
//      signed URLs — the LLM fetches images through its own infrastructure
//      and signed URLs occasionally fail there)
//   6. Call the observation extractor (src/lib/ai/observation-extract.ts)
//   7. Return JSON with { photoPath, signedUrl, extracted } so the parent
//      dashboard can pre-fill the form
//
// The observation is NOT saved to the DB here. The parent reviews the
// AI-suggested fields, edits them, and submits the existing
// /api/observations POST which writes the row.
//
// Why not save-and-review-in-place: a bad AI extraction should be editable
// by the parent before hitting the DB, so we keep the two-step flow
// (upload → review → save) rather than save-then-edit.

import { type NextRequest } from 'next/server';
import { requireParentModeOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';
import { extractObservationFromPhoto } from '@/lib/ai/observation-extract';
import { runEvidenceEngine } from '@/lib/evidence/engine';

// Tight upload size cap — handwritten homework photos are small.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

function badRequest(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

function guessExtension(mime: string): string {
  if (/jpeg|jpg/i.test(mime)) return 'jpg';
  if (/png/i.test(mime)) return 'png';
  if (/webp/i.test(mime)) return 'webp';
  if (/heic|heif/i.test(mime)) return 'heic';
  return 'bin';
}

export async function POST(request: NextRequest): Promise<Response> {
  // Family ownership covers both site-cookie and parent-admin checks.
  const guard = await requireParentModeOrJson();
  if (guard instanceof Response) return guard;

  // ---- parse multipart body ----
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('could not parse multipart body');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return badRequest('file field missing or not a file');
  if (file.size === 0) return badRequest('file is empty');
  if (file.size > MAX_UPLOAD_BYTES) return badRequest(`file too large (max ${MAX_UPLOAD_BYTES} bytes)`);
  if (!ALLOWED_MIME.test(file.type)) {
    return badRequest(`unsupported file type: ${file.type || '(none)'}`);
  }

  const kidIdRaw = form.get('kidId');
  const kidId = typeof kidIdRaw === 'string' ? kidIdRaw.trim() : '';
  if (!kidId) return badRequest('kidId missing');

  // IDOR guard: the kid (and the storage path we upload under) must be ours.
  const denied = await requireKidInFamily(kidId, guard.family.id);
  if (denied) return denied;

  const promptRaw = form.get('prompt');
  const parentPrompt = typeof promptRaw === 'string' ? promptRaw.trim() : undefined;

  // ---- look up kid name for the LLM prompt ----
  const sb = supabaseServer();
  const { data: kidRow } = await sb
    .from('kids')
    .select('name')
    .eq('id', kidId)
    .maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;

  // ---- upload to Supabase Storage ----
  const bytes = new Uint8Array(await file.arrayBuffer());
  const timestamp = Date.now();
  const ext = guessExtension(file.type);
  const photoPath = `${kidId}/${timestamp}.${ext}`;

  const { error: uploadErr } = await sb.storage
    .from('observations')
    .upload(photoPath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    console.warn('[observations/upload] storage upload failed:', uploadErr.message);
    return badRequest(`upload failed: ${uploadErr.message}`, 500);
  }

  // ---- build a base64 data URL for the LLM ----
  const base64 = Buffer.from(bytes).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;

  // ---- optional: get a short-lived signed URL so the client can show the
  //      photo thumbnail after upload. 1 hour is plenty for a review flow. ----
  const { data: signedData } = await sb.storage
    .from('observations')
    .createSignedUrl(photoPath, 60 * 60);
  const signedUrl = signedData?.signedUrl ?? null;

  // ---- call the extractor AND the evidence engine in parallel ----
  // They're independent calls: the extractor produces UI pre-fill
  // suggestions (title/kind/skillSlug) for the parent to review;
  // the engine evaluates ALL 62 skills and updates kid_skills.
  // Previously a failed extractor short-circuited the engine as well,
  // meaning a shaky extraction would silently skip knowledge eval.
  // Now we run both and report whatever we got back.
  const [extractResult, engineResult] = await Promise.all([
    extractObservationFromPhoto({
      photoDataUrl: dataUrl,
      parentPrompt,
      kidName,
    }),
    runEvidenceEngine(sb, {
      kidId,
      source: 'photo',
      artifact: { kind: 'photo', dataUrl, text: parentPrompt, photoPath },
      parentPrompt,
    }).catch((err) => {
      // Normalize throws to the same shape the engine's soft-fails use.
      console.warn('[observations/upload] evidence engine threw:', err);
      return { ok: false as const, reason: String(err) };
    }),
  ]);

  // Engine result — eventId may be present even when ok:false (the engine
  // inserts its event row before evaluating, so downstream can still link).
  let evidenceEventId: string | null = null;
  let evidenceApplied: unknown[] = [];
  if (engineResult.ok) {
    evidenceEventId = engineResult.eventId;
    evidenceApplied = engineResult.applied;
  } else {
    if ('eventId' in engineResult && typeof engineResult.eventId === 'string') {
      evidenceEventId = engineResult.eventId;
    }
    console.warn('[observations/upload] evidence engine soft-failed:', engineResult.reason);
  }

  if (!extractResult.ok) {
    // Extraction failure is soft — the photo is stored and the engine
    // may have still produced useful signals. The client gets enough
    // data to save the observation manually.
    return Response.json({
      ok: false,
      error: extractResult.reason,
      photoPath,
      signedUrl,
      rawModelText: extractResult.rawModelText ?? null,
      evidenceEventId,
      evidenceApplied,
    }, { status: 200 });
  }

  return Response.json({
    ok: true,
    photoPath,
    signedUrl,
    extracted: extractResult.extracted,
    modelUsed: extractResult.modelUsed,
    evidenceEventId,
    evidenceApplied,
  });
}
