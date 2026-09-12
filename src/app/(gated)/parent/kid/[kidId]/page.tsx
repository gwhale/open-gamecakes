// `/parent/kid/[kidId]` — single-kid detail view in the parent portal.
//
// Server component: looks up the kid, fetches their skills / attempts /
// observations / feedback in parallel, and renders <KidDashboard />.
// 404s if the kidId isn't a real kid.
//
// Auth: under src/app/(gated)/parent/layout.tsx, which enforces the
// site cookie + parent-admin cookie double-gate. Nothing extra needed
// here.

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { requireCurrentFamily } from '@/lib/auth/family';
import { isGuest } from '@/lib/auth/guest';
import type {
  Kid, Skill, KidSkill, Attempt, Observation, Feedback,
} from '@/lib/types';
import KidDashboard, { type KidOverview } from '@/components/parent/KidDashboard';
import { findGame, type GameSubject } from '@/lib/games/registry';
import { subjectMix, activityByDay, activityByMonth } from '@/lib/parent/subjects';
import {
  parsePeriod,
  periodRange,
  periodLabel,
  periodToParam,
  monthsBetween,
} from '@/lib/parent/periods';
import { currentGradeOf, isAtOrBelowGrade } from '@/lib/kids/grade';

const OVERVIEW_COLS =
  'game_slug, completed, response_time_ms, created_at, tier, taps_total, taps_wrong';

/** Page the period's rounds.
 *
 *  PostgREST caps a plain select at 1000 rows and returns the first 1000 WITHOUT
 *  erroring, so the all-time view would silently drop the oldest history — on the
 *  screen whose whole job is to show it. Ascending, so a future truncation loses
 *  the NEWEST rows (noticed at once) rather than the oldest (invisible for
 *  months). Same contract as /parent/gameplay. */
async function fetchPeriodRounds(
  sb: ReturnType<typeof supabaseServer>,
  kidId: string,
  from: Date | null,
  to: Date | null,
): Promise<OverviewRow[]> {
  const PAGE = 1000;
  const out: OverviewRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = sb.from('attempts').select(OVERVIEW_COLS).eq('kid_id', kidId);
    if (from) q = q.gte('created_at', from.toISOString());
    if (to) q = q.lt('created_at', to.toISOString());
    const { data, error } = await q
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`attempts: ${error.message}`);
    const page = (data ?? []) as unknown as OverviewRow[];
    out.push(...page);
    if (page.length < PAGE) return out;
    if (out.length >= 200_000) return out; // runaway guard
  }
}

interface OverviewRow {
  game_slug: string | null;
  completed: boolean | null;
  response_time_ms: number | null;
  created_at: string;
  tier: number | null;
  taps_total: number | null;
  taps_wrong: number | null;
}

export default async function ParentKidDetailPage({
  params,
  searchParams,
}: {
  // Next 16: dynamic segment params arrive as a Promise.
  params: Promise<{ kidId: string }>;
  // Next 16: searchParams is a Promise too.
  searchParams: Promise<{ period?: string }>;
}) {
  const { kidId } = await params;
  const family = await requireCurrentFamily();
  const sb = supabaseServer();

  // Kid row first — must belong to the current family or 404. The
  // family_id filter is what makes URL-typing your way into another
  // family's kid impossible.
  const kidRes = await sb
    .from('kids')
    .select('*')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (kidRes.error) throw new Error(`kid load failed: ${kidRes.error.message}`);
  if (!kidRes.data) notFound();
  const kid = kidRes.data as Kid;

  // The window the Overview usage + performance charts summarize. Was hardcoded
  // to the current calendar month, which meant a parent could not see last month
  // at all — the comparison that makes any of these numbers mean something.
  // (The recent-100 `attempts` prop below can miss most of a busy month, so the
  // charts still get their own dedicated query.)
  const now = new Date();
  const period = parsePeriod((await searchParams).period, now);
  const { from: periodFrom, to: periodTo } = periodRange(period);
  const isAll = period.kind === 'all';
  const monthStartDate = periodFrom ?? new Date(now.getFullYear(), now.getMonth(), 1);

  // Oldest attempt bounds the month stepper — one indexed row.
  const { data: firstRow } = await sb
    .from('attempts')
    .select('created_at')
    .eq('kid_id', kidId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const earliest = firstRow?.created_at ? new Date(firstRow.created_at as string) : null;
  const months = monthsBetween(earliest, now);

  const [skillsRes, ksRes, attemptsRes, monthRows, obsRes, feedbackRes, tokensRes] = await Promise.all([
    sb.from('skills').select('*').order('subject').order('tier'),
    sb.from('kid_skills').select('*').eq('kid_id', kidId),
    sb.from('attempts').select('*')
      .eq('kid_id', kidId)
      .order('created_at', { ascending: false })
      .limit(100),
    // The selected period's rounds — just the columns the Overview charts need.
    fetchPeriodRounds(sb, kidId, periodFrom, periodTo),
    sb.from('observations').select('*')
      .eq('kid_id', kidId)
      .order('created_at', { ascending: false })
      .limit(100),
    sb.from('feedback').select('*')
      .eq('kid_id', kidId)
      .order('created_at', { ascending: false })
      .limit(100),
    // Sugar Token balance for the 🪙 Sugar Tokens tab.
    sb.from('kid_tokens').select('balance').eq('kid_id', kidId).maybeSingle(),
  ]);

  if (skillsRes.error) throw new Error(`skills: ${skillsRes.error.message}`);

  const skills = (skillsRes.data ?? []) as Skill[];
  const kidSkills = (ksRes.data ?? []) as KidSkill[];
  const attempts = (attemptsRes.data ?? []) as Attempt[];
  const observations = (obsRes.data ?? []) as Observation[];
  const feedback = (feedbackRes.data ?? []) as Feedback[];

  const skillsById: Record<string, Skill> = Object.fromEntries(
    skills.map((s) => [s.id, s]),
  );

  const tokenBalance = (tokensRes.data?.balance as number | undefined) ?? 0;

  // ---- Overview: usage (engagement) + performance (subjects, level, accuracy,
  // grade standing) for the current month, computed server-side from the pure
  // rollups so the dashboard opens on a chart, not a wall of standards. ----
  const gameSubject = (slug: string): GameSubject | null => findGame(slug)?.subject ?? null;
  const mRows = monthRows;
  // Month view → per-day bars. All-time → per-month bars: a year of daily bars is
  // 365 hairlines that read as noise, so the BUCKET changes rather than the chart
  // being stretched.
  const days = isAll ? [] : activityByDay(mRows, monthStartDate, now);
  const monthBars = isAll ? activityByMonth(mRows, earliest ?? now, now) : [];
  const tracked = mRows.filter((r) => r.game_slug);
  const finishable = tracked.filter((r) => r.completed != null);
  let tapsTotal = 0;
  let tapsWrong = 0;
  let tierMin: number | null = null;
  let tierMax: number | null = null;
  for (const r of tracked) {
    if (r.taps_total != null && r.taps_wrong != null) {
      tapsTotal += r.taps_total;
      tapsWrong += r.taps_wrong;
    }
    if (r.tier != null) {
      tierMin = tierMin == null ? r.tier : Math.min(tierMin, r.tier);
      tierMax = tierMax == null ? r.tier : Math.max(tierMax, r.tier);
    }
  }
  // Grade standing — only skills the kid has actually practiced count toward
  // "on track" (a fresh tier-1 row is not evidence of mastery).
  const ksById = new Map(kidSkills.map((ks) => [ks.skill_id, ks]));
  // Scoped to the kid's OWN grade band (2026-09-03). This used to divide by
  // every standard in the K-6 catalog, so a 1st grader's "on track" fraction
  // counted long division and percents against them and could never approach
  // 1. Above-grade work still shows in the skills list as Enrichment.
  const gradedSkills = skills.filter(
    (s) => s.on_track_tier != null && isAtOrBelowGrade(s.grade_level, currentGradeOf(kid)),
  );
  const overview: KidOverview = {
    monthLabel: periodLabel(period, now),
    isAll,
    months: monthBars,
    periodParam: periodToParam(period),
    basePath: `/parent/kid/${kidId}`,
    period,
    availableMonths: months,
    nowMs: now.getTime(),
    rounds: mRows.length,
    trackedRounds: tracked.length,
    minutes: Math.round(mRows.reduce((n, r) => n + (r.response_time_ms ?? 0), 0) / 60000),
    activeDays: isAll
      ? new Set(mRows.map((r) => r.created_at.slice(0, 10))).size
      : days.filter((d) => d.rounds > 0).length,
    days,
    subjectMix: subjectMix(mRows, gameSubject),
    tapPct: tapsTotal > 0 ? Math.round(((tapsTotal - tapsWrong) / tapsTotal) * 100) : null,
    tierMin,
    tierMax,
    finishedPct: finishable.length
      ? Math.round((finishable.filter((r) => r.completed).length / finishable.length) * 100)
      : null,
    onTrack: gradedSkills.filter((s) => {
      const ks = ksById.get(s.id);
      return ks && ks.total_attempts > 0 && ks.current_tier >= (s.on_track_tier as number);
    }).length,
    started: skills.filter((s) => {
      const ks = ksById.get(s.id);
      return ks && ks.total_attempts > 0;
    }).length,
    totalStandards: gradedSkills.length,
  };

  return (
    <KidDashboard
      kid={kid}
      familyName={family.name}
      skills={skills}
      kidSkills={kidSkills}
      attempts={attempts}
      observations={observations}
      feedback={feedback}
      skillsById={skillsById}
      tokenBalance={tokenBalance}
      overview={overview}
      isGuestKid={isGuest(kid.id)}
    />
  );
}
