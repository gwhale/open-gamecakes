// GET /api/cron/weekly-digest — send each family their weekly parent digest.
//
// Triggered by the Vercel cron in vercel.json (Mondays 08:00 UTC). Also callable
// by hand with the same secret, which is how you test it.
//
// AUTH: a bearer CRON_SECRET. Vercel sends this header on scheduled invocations.
// Without the env var set the route refuses everything — an unauthenticated
// endpoint that emails people is not something to leave open by default.
//
// SAFETY
//  * Only families with a non-empty digest_emails get anything, and those
//    addresses only ever come from a grown-up typing them into the portal.
//  * family_digest_sends is a (family_id, week_start) ledger checked BEFORE
//    sending, so a cron retry or double-fire cannot mail the same week twice.
//  * With RESEND_API_KEY unset the mail layer logs instead of sending, so this
//    route is safe to hit in a preview deploy.

import { type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { sendEmail, emailConfigured } from '@/lib/email/send';
import { findGame } from '@/lib/games/registry';
import {
  buildWeeklyDigest,
  renderDigestHtml,
  renderDigestText,
  weekStart,
  type DigestAttempt,
  type DigestSkill,
} from '@/lib/digest/weekly';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface FamilyRow {
  id: string;
  name: string | null;
  digest_emails: string[] | null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseServer();

  // The week that just ENDED: Monday..Sunday before today's Monday. Running on
  // Monday morning, "this week" would be a few hours old and mostly empty.
  const thisMonday = weekStart();
  const start = new Date(thisMonday);
  start.setDate(start.getDate() - 7);
  const end = new Date(thisMonday);
  end.setMilliseconds(-1);
  const weekKey = start.toISOString().slice(0, 10);

  const { data: famRows } = await sb
    .from('families')
    .select('id, name, digest_emails');
  const families = ((famRows ?? []) as FamilyRow[]).filter(
    (f) => (f.digest_emails?.length ?? 0) > 0,
  );

  const portalUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/parent`
    : 'https://gamecakes.org/parent';

  const results: { family: string; status: string; detail: string }[] = [];

  for (const fam of families) {
    // Idempotency FIRST — never build (or send) a digest for a week already done.
    const { data: already } = await sb
      .from('family_digest_sends')
      .select('week_start')
      .eq('family_id', fam.id)
      .eq('week_start', weekKey)
      .maybeSingle();
    if (already) {
      results.push({ family: fam.id, status: 'skipped', detail: 'already sent this week' });
      continue;
    }

    const [{ data: kidRows }, { data: attemptRows }, { data: skillRows }] = await Promise.all([
      sb.from('kids').select('id, name').eq('family_id', fam.id),
      sb
        .from('attempts')
        .select('kid_id, game_slug, completed, efficiency, response_time_ms, created_at')
        .eq('family_id', fam.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString()),
      sb
        .from('kid_skills')
        .select('kid_id, current_tier, mastery_pct, skills(display_name, subject, on_track_tier)')
        .eq('family_id', fam.id)
        .gt('total_attempts', 0),
    ]);

    const kids = (kidRows ?? []) as { id: string; name: string }[];
    if (kids.length === 0) {
      results.push({ family: fam.id, status: 'skipped', detail: 'no kids' });
      continue;
    }

    const skills: DigestSkill[] = (
      (skillRows ?? []) as unknown as {
        kid_id: string;
        current_tier: number;
        mastery_pct: number | null;
        // display_name, NOT name: `skills.name` is the SLUG
    // ('capitalization-punctuation'), which is what a parent would have been
    // shown. KidDashboard has always used display_name; these two queries were
    // the odd ones out.
    skills: { display_name: string; subject: string; on_track_tier: number | null } | null;
      }[]
    )
      .filter((r) => r.skills)
      .map((r) => ({
        kid_id: r.kid_id,
        skill_name: r.skills!.display_name,
        subject: r.skills!.subject,
        current_tier: r.current_tier,
        on_track_tier: r.skills!.on_track_tier,
        mastery_pct: r.mastery_pct,
      }));

    const digest = buildWeeklyDigest({
      kids,
      attempts: (attemptRows ?? []) as DigestAttempt[],
      skills,
      gameLabel: (slug) => findGame(slug)?.label ?? slug,
      gameSubject: (slug) => findGame(slug)?.subject ?? null,
      start,
      end,
    });

    const sent = await sendEmail({
      to: fam.digest_emails ?? [],
      subject: `Gamecakes — ${digest.headline}`,
      html: renderDigestHtml(digest, portalUrl),
      text: renderDigestText(digest),
    });

    // Only record a send that actually went out. A 'skipped' (no key) or
    // 'failed' must stay un-ledgered so the next run retries rather than
    // silently swallowing the week.
    if (sent.status === 'sent') {
      await sb.from('family_digest_sends').insert({
        family_id: fam.id,
        week_start: weekKey,
        recipients: fam.digest_emails?.length ?? 0,
      });
    }
    results.push({ family: fam.id, status: sent.status, detail: sent.detail });
  }

  return Response.json({
    week: weekKey,
    configured: emailConfigured(),
    families: families.length,
    results,
  });
}
