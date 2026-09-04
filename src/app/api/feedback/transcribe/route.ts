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

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { transcribeAudio } from '@/lib/ai/feedback-summarize';

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

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
