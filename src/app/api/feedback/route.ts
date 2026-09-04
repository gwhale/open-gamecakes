// POST /api/feedback — save a kid's feedback ticket.
//
// Auth: site cookie only (not parent-admin). Kids submit feedback directly.
// The ticket has already been AI-processed by /api/feedback/transcribe (for
// voice) or by the client calling the text summarization (for typed).

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Verify the active kid belongs to this parent's family — prevents
  // cross-family ticket creation if cookies are stale or spoofed.
  const sbCheck = supabaseServer();
  const { data: kidCheck } = await sbCheck.from('kids')
    .select('id').eq('id', kidId).eq('family_id', family.id).maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const gameSlug = typeof body.gameSlug === 'string' ? body.gameSlug : null;
  const transcript = typeof body.transcript === 'string' ? body.transcript : '';
  const audioPath = typeof body.audioPath === 'string' ? body.audioPath : null;
  const drawingPath = typeof body.drawingPath === 'string' ? body.drawingPath : null;
  const ticketType = body.ticketType;
  const title = typeof body.title === 'string' ? body.title : '';
  const summary = typeof body.summary === 'string' ? body.summary : '';

  if (!transcript || !title || !summary) {
    return Response.json({ error: 'missing required fields' }, { status: 400 });
  }
  if (ticketType !== 'bug' && ticketType !== 'feature' && ticketType !== 'feedback') {
    return Response.json({ error: 'invalid ticketType' }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data, error } = await sb.from('feedback').insert({
    kid_id: kidId,
    game_slug: gameSlug,
    raw_transcript: transcript,
    audio_path: audioPath,
    drawing_path: drawingPath,
    ticket_type: ticketType,
    title,
    summary,
    status: 'new',
  }).select('id').single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data.id });
}
