// POST /api/feedback/transcribe — turn a kid's voice note into plain text.
//
// Voice-to-text ONLY. The previous AI "rewrite" (classify into bug/feature +
// generate a title/summary as JSON) was brittle and broke submissions when the
// model's reply didn't parse, so it's gone. This endpoint now just transcribes
// the audio and hands the raw words back; the kid reviews/edits them in the
// textarea and submits as plain text. Typed feedback skips this route entirely
// and posts straight to /api/feedback.
//
// Returns: { ok: true, transcript, audioPath } | { ok: false, error, fallbackToText }
// Does NOT save to the feedback table — that's a separate POST to /api/feedback.

// The kid id comes from the UNSIGNED `lw_kid` cookie (see
// src/lib/auth/active-kid.ts). The gated layout validates it against the
// family; a layout does not run for a direct POST, so this route checks for
// itself. This one matters more than the other upload route: past the storage
// write it calls a paid model, so an unguarded caller spends the deployment
// owner's money as well as writing into someone else's prefix.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { transcribeAudio } from '@/lib/ai/feedback-summarize';

/** A kid describing a game idea out loud. Five megabytes is minutes of speech
 *  at any sane bitrate; the cap is what stops an arbitrary upload becoming an
 *  arbitrary model bill. observations/upload has had one all along — this
 *  route only checked `size === 0`. */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson('ai');
  if (guard instanceof Response) return guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  const denied = await requireKidInFamily(kidId, guard.family.id);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'could not parse form data', fallbackToText: true }, { status: 200 });
  }

  const audioFile = form.get('audio');
  if (!(audioFile instanceof File) || audioFile.size === 0) {
    return Response.json({ error: 'no audio file', fallbackToText: true }, { status: 200 });
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    // fallbackToText keeps the kid moving — they type it instead of hitting a
    // dead end, which is how every other failure in this route behaves.
    return Response.json(
      { error: 'that recording is too long', fallbackToText: true },
      { status: 200 },
    );
  }

  // Upload audio to Supabase Storage (kept so a grown-up can listen later).
  const sb = supabaseServer();
  const bytes = new Uint8Array(await audioFile.arrayBuffer());
  const ext = audioFile.type.includes('mp4') ? 'mp4' : audioFile.type.includes('webm') ? 'webm' : 'audio';
  const audioPath = `${kidId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await sb.storage
    .from('feedback')
    .upload(audioPath, bytes, { contentType: audioFile.type, upsert: false });

  if (uploadErr) {
    console.warn('[feedback/transcribe] storage upload failed:', uploadErr.message);
    // Non-fatal — continue with transcription even if storage fails.
  }

  // Derive the real audio format so the model gets bytes that match the label.
  // (iPad Safari records audio/mp4 = AAC; Chrome/Android record audio/webm.)
  const base64 = Buffer.from(bytes).toString('base64');
  const mimeType = audioFile.type || 'audio/mp4';
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const m = mimeType.toLowerCase();
  const format = m.includes('webm') ? 'webm'
    : m.includes('ogg') ? 'ogg'
    : m.includes('wav') ? 'wav'
    : (m.includes('mpeg') || m.includes('mp3')) ? 'mp3'
    : 'm4a'; // mp4 / m4a / aac container from MediaRecorder

  const result = await transcribeAudio({ audioDataUrl: dataUrl, format });

  if (!result.ok) {
    // Transcription failed — tell the client to fall back to typing.
    return Response.json({
      ok: false,
      error: result.reason,
      fallbackToText: true,
      audioPath: uploadErr ? null : audioPath,
    }, { status: 200 });
  }

  return Response.json({
    ok: true,
    transcript: result.transcript,
    audioPath: uploadErr ? null : audioPath,
  });
}
