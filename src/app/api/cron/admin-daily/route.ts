// GET /api/cron/admin-daily: the operator's summary of the last 24 hours.
//
// Triggered by the Vercel cron in vercel.json. AUTH: a bearer CRON_SECRET, and with
// no secret set the route refuses everything. Sends nothing on a quiet day or when
// ADMIN_NOTIFY_EMAIL is unset.

import { type NextRequest } from 'next/server';
import { loadOverview } from '@/lib/admin/load';
import { adminRecipients, sendDailySummary } from '@/lib/admin/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET not set' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (adminRecipients().length === 0) return Response.json({ status: 'skipped', detail: 'no recipients' });

  const now = new Date();
  const result = await sendDailySummary(await loadOverview(now), now);
  return Response.json(result ?? { status: 'skipped', detail: 'nothing happened' });
}
