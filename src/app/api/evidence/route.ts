// POST /api/evidence — run the evidence engine over a text input.
//
// Body:
//   {
//     text: string,                    // required
//     kidId?: string,                  // optional; defaults to active kid
//     observationId?: string,          // optional linkage to observations row
//     parentPrompt?: string,           // optional context for the evaluator
//     source?: 'text' | 'manual' | 'observation'  // defaults to 'text'
//   }
//
// Response (200):
//   {
//     eventId, summary, applied: [...], skipped: [...], modelUsed
//   }
//
// Photo-based evidence is triggered automatically from /api/observations/upload
// after extraction succeeds — see that route. Game-session secondary-skill
// evaluation is triggered from /api/attempts — see that route.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { runEvidenceEngine } from '@/lib/evidence/engine';
import type { EvidenceSource } from '@/lib/types';

interface EvidenceBody {
  text: string;
  kidId?: string;
  observationId?: string;
  parentPrompt?: string;
  source?: EvidenceSource;
}

function parseBody(raw: unknown): EvidenceBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.text !== 'string' || b.text.trim().length === 0) return null;
  const src = b.source;
  if (src !== undefined && src !== 'text' && src !== 'manual' && src !== 'observation') {
    return null;
  }
  return {
    text: b.text.trim(),
    kidId: typeof b.kidId === 'string' ? b.kidId : undefined,
    observationId: typeof b.observationId === 'string' ? b.observationId : undefined,
    parentPrompt: typeof b.parentPrompt === 'string' ? b.parentPrompt : undefined,
    source: (src as EvidenceSource | undefined) ?? 'text',
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) return Response.json({ error: 'invalid body — need text' }, { status: 400 });

  const kidId = body.kidId ?? (await getActiveKid());
  if (!kidId) return Response.json({ error: 'no kid specified' }, { status: 400 });

  // IDOR guard: the target kid (from body OR the unsigned active-kid cookie)
  // must belong to the caller's family before we run the engine on them.
  const denied = await requireKidInFamily(kidId, guard.family.id);
  if (denied) return denied;

  const sb = supabaseServer();
  const result = await runEvidenceEngine(sb, {
    kidId,
    source: body.source ?? 'text',
    observationId: body.observationId,
    artifact: { kind: 'text', text: body.text },
    parentPrompt: body.parentPrompt,
  });

  if (!result.ok) {
    return Response.json(
      { error: result.reason, eventId: result.eventId ?? null },
      { status: 500 },
    );
  }

  return Response.json({
    eventId: result.eventId,
    summary: result.summary,
    applied: result.applied,
    skipped: result.skipped,
    modelUsed: result.modelUsed,
  });
}
