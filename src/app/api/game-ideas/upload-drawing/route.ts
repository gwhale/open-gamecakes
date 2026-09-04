// POST /api/game-ideas/upload-drawing
// Body: { dataUrl: string }  (data:image/jpeg;base64,...)
// Uploads the kid's canvas drawing to Supabase storage and returns the path.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  let dataUrl: string;
  try {
    const body = (await request.json()) as { dataUrl?: unknown };
    if (typeof body.dataUrl !== 'string' || !body.dataUrl.startsWith('data:image/')) {
      return Response.json({ error: 'invalid dataUrl' }, { status: 400 });
    }
    dataUrl = body.dataUrl;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const base64 = dataUrl.split(',')[1];
  if (!base64) return Response.json({ error: 'empty image data' }, { status: 400 });

  const buffer = Buffer.from(base64, 'base64');
  const path = `${kidId}/drawings/${Date.now()}.jpg`;

  const sb = supabaseServer();
  const { error } = await sb.storage
    .from('feedback')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, path });
}
