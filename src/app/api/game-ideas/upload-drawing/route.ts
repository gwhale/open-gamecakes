// POST /api/game-ideas/upload-drawing
// Body: { dataUrl: string }  (data:image/jpeg;base64,...)
// Uploads the kid's canvas drawing to Supabase storage and returns the path.
//
// The kid id comes from the `lw_kid` cookie, which is DELIBERATELY UNSIGNED —
// see src/lib/auth/active-kid.ts, whose safety argument was "one household".
// The gated LAYOUT validates that cookie against the family, but a layout does
// not run for a direct POST, so this route has to check for itself. Without
// requireKidInFamily an authenticated stranger could write into any family's
// storage prefix by setting one cookie.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';

/** A child's finger-painting on a canvas. Two megabytes is already generous;
 *  the cap exists so an unbounded base64 body cannot be posted at storage. */
const MAX_DRAWING_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson('game:create');
  if (guard instanceof Response) return guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  const denied = await requireKidInFamily(kidId, guard.family.id);
  if (denied) return denied;

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
  if (buffer.byteLength > MAX_DRAWING_BYTES) {
    return Response.json(
      { error: `drawing too large (max ${MAX_DRAWING_BYTES} bytes)` },
      { status: 413 },
    );
  }
  const path = `${kidId}/drawings/${Date.now()}.jpg`;

  const sb = supabaseServer();
  const { error } = await sb.storage
    .from('feedback')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, path });
}
