// /parent/gameplay — what each kid actually played, and how it went.
//
// The question this answers is "which games is my kid choosing, finishing, and
// getting better at" — which was unanswerable until attempts started carrying a
// game_slug (migration 0038). Everything here is grouped by GAME; the per-skill
// view already exists on each kid's own page.
//
// HONESTY: rows written before 2026-07-26 have no game_slug and are counted
// separately as "before tracking" rather than being guessed at from their skill.
// A table where some rows are measured and others inferred is worse than one
// with a visible hole.
//
// One `attempts` row is a ROUND, not a question: `correct` means that round's
// efficiency cleared the threshold. Per-question detail is not recorded, so this
// page never claims an accuracy figure.

import Link from 'next/link';
import { requireCurrentFamily } from '@/lib/auth/family';
import { supabaseServer } from '@/lib/supabase/server';
import { findGame, type GameSubject } from '@/lib/games/registry';
import { isGuest } from '@/lib/auth/guest';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import Glossary from '@/components/parent/Glossary';
import InsightList from '@/components/parent/InsightList';
import { buildInsights, type InsightSkill } from '@/lib/parent/insights';
import LearningMix from '@/components/parent/LearningMix';
import ActivityChart from '@/components/parent/ActivityChart';
import MonthActivityChart from '@/components/parent/MonthActivityChart';
import PeriodNav from '@/components/parent/PeriodNav';
import {
  subjectMix,
  activityByDay,
  activityByMonth,
  SUBJECT_META,
  SUBJECT_ORDER,
} from '@/lib/parent/subjects';
import {
  parsePeriod,
  periodRange,
  periodLabel,
  monthsBetween,
  isEntirelyUntracked,
  isFullyTracked,
  TRACKING_START,
} from '@/lib/parent/periods';

/** A play's subject comes from the game it was played in (the TS registry is the
 *  source of truth). Null for rows with no recorded game. */
const gameSubject = (slug: string): GameSubject | null => findGame(slug)?.subject ?? null;

export const dynamic = 'force-dynamic';

interface Row {
  kid_id: string;
  game_slug: string | null;
  completed: boolean | null;
  efficiency: number | null;
  response_time_ms: number | null;
  created_at: string;
  // Level (difficulty tier 1..10) and tap counts, both per ROUND. Tap accuracy
  // = (taps_total - taps_wrong) / taps_total — the honest correctness signal we
  // DO record. It is NOT per-question accuracy, which Gamecakes never captures.
  tier: number | null;
  taps_total: number | null;
  taps_wrong: number | null;
}

interface GameStat {
  slug: string;
  rounds: number;
  finished: number;
  minutes: number;
  effSum: number;
  effN: number;
  // Level range played + tap tallies for this game's rounds.
  tierMin: number | null;
  tierMax: number | null;
  tapsTotal: number;
  tapsWrong: number;
}

const ATTEMPT_COLS =
  'kid_id, game_slug, completed, efficiency, response_time_ms, created_at, tier, taps_total, taps_wrong';

/** PAGE SIZE MATTERS HERE. PostgREST caps a plain select at 1000 rows and
 *  returns the first 1000 WITHOUT erroring, so an unpaged all-time query would
 *  silently drop the oldest history — under-reporting on the exact page whose
 *  job is to show everything. This walks pages until one comes back short.
 *
 *  Ordered by created_at so a truncation bug, if one is ever reintroduced,
 *  loses the NEWEST rows (visible immediately) rather than the oldest (invisible
 *  for months). */
async function fetchAttempts(
  sb: ReturnType<typeof supabaseServer>,
  familyId: string,
  from: Date | null,
  to: Date | null,
): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = sb.from('attempts').select(ATTEMPT_COLS).eq('family_id', familyId);
    if (from) q = q.gte('created_at', from.toISOString());
    if (to) q = q.lt('created_at', to.toISOString());
    const { data, error } = await q
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Row[];
    out.push(...page);
    if (page.length < PAGE) return out;
    // Runaway guard: 200k rounds is far past anything real, and an infinite
    // loop here would hang the parent portal rather than fail visibly.
    if (out.length >= 200_000) return out;
  }
}

export default async function ParentGameplayPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ period?: string }>;
}) {
  const family = await requireCurrentFamily();
  const sb = supabaseServer();
  const now = new Date();

  const period = parsePeriod((await searchParams).period, now);
  const { from, to } = periodRange(period);

  // The oldest attempt bounds the month stepper. One row, indexed by
  // (family_id, created_at) — cheaper than deriving it from the full history,
  // and it stays correct for 'all' where we have no range to infer from.
  const { data: firstRow } = await sb
    .from('attempts')
    .select('created_at')
    .eq('family_id', family.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const earliest = firstRow?.created_at ? new Date(firstRow.created_at as string) : null;
  const months = monthsBetween(earliest, now);

  const [{ data: kidRows }, attemptRows, { data: skillRows }] = await Promise.all([
    sb.from('kids').select('id, name').eq('family_id', family.id),
    fetchAttempts(sb, family.id, from, to),
    // Skills carry the grade-level yardstick the insights are built from.
    sb
      .from('kid_skills')
      .select('kid_id, current_tier, mastery_pct, skills(name, display_name, subject, on_track_tier)')
      .eq('family_id', family.id)
      .gt('total_attempts', 0),
  ]);

  const skillsByKid = new Map<string, InsightSkill[]>();
  for (const r of (skillRows ?? []) as unknown as {
    kid_id: string;
    current_tier: number;
    mastery_pct: number | null;
    // display_name, NOT name: `skills.name` is the SLUG
    // ('capitalization-punctuation'), which is what a parent would have been
    // shown. KidDashboard has always used display_name; these two queries were
    // the odd ones out.
    // `name` is the slug, carried alongside so the insight engine can find
    // the word kind that drills this skill; `display_name` is what a parent reads.
    skills: {
      name: string;
      display_name: string;
      subject: string;
      on_track_tier: number | null;
    } | null;
  }[]) {
    if (!r.skills) continue;
    const list = skillsByKid.get(r.kid_id) ?? [];
    list.push({
      name: r.skills.display_name,
      slug: r.skills.name,
      subject: r.skills.subject,
      currentTier: r.current_tier,
      onTrackTier: r.skills.on_track_tier,
      masteryPct: r.mastery_pct,
    });
    skillsByKid.set(r.kid_id, list);
  }

  const kids = ((kidRows ?? []) as { id: string; name: string }[])
    .filter((k) => !isGuest(k.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = (attemptRows ?? []) as Row[];

  // Fold once, per kid: attributed games + the untracked remainder.
  const byKid = new Map<string, { games: Map<string, GameStat>; untracked: number }>();
  for (const k of kids) byKid.set(k.id, { games: new Map(), untracked: 0 });
  for (const r of rows) {
    const bucket = byKid.get(r.kid_id);
    if (!bucket) continue;
    if (!r.game_slug) {
      bucket.untracked += 1;
      continue;
    }
    const g =
      bucket.games.get(r.game_slug) ??
      { slug: r.game_slug, rounds: 0, finished: 0, minutes: 0, effSum: 0, effN: 0, tierMin: null, tierMax: null, tapsTotal: 0, tapsWrong: 0 };
    g.rounds += 1;
    if (r.completed) g.finished += 1;
    g.minutes += (r.response_time_ms ?? 0) / 60000;
    if (r.efficiency != null) {
      g.effSum += Number(r.efficiency);
      g.effN += 1;
    }
    if (r.tier != null) {
      g.tierMin = g.tierMin == null ? r.tier : Math.min(g.tierMin, r.tier);
      g.tierMax = g.tierMax == null ? r.tier : Math.max(g.tierMax, r.tier);
    }
    // Tap accuracy needs both a total and a wrong count; a round missing either
    // (older rows) simply doesn't contribute, rather than skewing the ratio.
    if (r.taps_total != null && r.taps_wrong != null) {
      g.tapsTotal += r.taps_total;
      g.tapsWrong += r.taps_wrong;
    }
    bucket.games.set(r.game_slug, g);
  }

  const label = periodLabel(period, now);
  const monthStartDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
  // Day bars for a month; month bars for all-time (365 hairlines read as noise).
  const isAll = period.kind === 'all';
  // Nothing recorded in this period can carry a game, so the game list would be
  // an empty pile that reads as "played nothing" rather than "not recorded then".
  const preTracking = isEntirelyUntracked(period);
  const partiallyTracked = !isAll && !preTracking && !isFullyTracked(period);

  return (
    <main className="mx-auto w-full max-w-3xl p-5 sm:p-8">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gameplay</h1>
          <p className="mt-1 text-sm text-zinc-500">
            What each kid played{isAll ? ' since the beginning' : ''}, by game.
          </p>
        </div>
        <ChromeNavLink href="/parent" size="sm">← Parents</ChromeNavLink>
      </header>

      <div className="mb-5 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <PeriodNav period={period} months={months} now={now} basePath="/parent/gameplay" />
      </div>

      {/* State the tracking hole ONCE, at the top, rather than repeating a
          footnote under every kid. A parent looking at June needs to know the
          game breakdown cannot exist for it — otherwise an empty list reads as
          "my kid played nothing", which is the opposite of the truth. */}
      {(preTracking || partiallyTracked) && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {preTracking ? (
            <>
              <b>{label} is before game tracking began</b> on{' '}
              {TRACKING_START.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.
              Rounds played then were recorded, but which game they were is not — so there is no
              breakdown for this month, only the activity below.
            </>
          ) : (
            <>
              <b>Part of {label} is before game tracking began</b> on{' '}
              {TRACKING_START.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.
              Rounds from earlier in the month are counted as activity but cannot be attributed to a
              game.
            </>
          )}
        </p>
      )}

      {kids.map((kid) => {
        const bucket = byKid.get(kid.id);
        const games = [...(bucket?.games.values() ?? [])].sort((a, b) => b.rounds - a.rounds);
        const totalRounds = games.reduce((n, g) => n + g.rounds, 0);
        const totalMin = games.reduce((n, g) => n + g.minutes, 0);
        const untracked = bucket?.untracked ?? 0;
        const busiest = Math.max(1, ...games.map((g) => g.rounds));

        // Subject rollups for THIS kid, straight off the raw rows (so the tested
        // helpers are the single source of the math). Mix = balance of subjects
        // (tracked rounds only); activity = which days they played (all rounds).
        const kidRows = rows.filter((r) => r.kid_id === kid.id);
        const mix = subjectMix(kidRows, gameSubject);
        // Month view → per-day bars. All-time → per-month bars, spanning from
        // this FAMILY's first attempt (not this kid's), so both kids' charts
        // share an x-axis and can be read against each other.
        const days = isAll ? [] : activityByDay(kidRows, monthStartDate, now);
        const monthBars = isAll ? activityByMonth(kidRows, earliest ?? now, now) : [];
        // Games grouped by subject so the list itself reads as "types of math /
        // reading / logic", not one flat pile.
        const gamesBySubject = SUBJECT_ORDER.map((subject) => ({
          subject,
          games: games.filter((g) => gameSubject(g.slug) === subject),
        })).filter((grp) => grp.games.length > 0);

        return (
          <section key={kid.id} className="mb-10">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold">{kid.name}</h2>
              <p className="text-xs text-zinc-500">
                {totalRounds} round{totalRounds === 1 ? '' : 's'} · {Math.round(totalMin)} min
              </p>
            </div>

            {/* Charts first: the two "at a glance" reads a parent came for —
                what TYPES of things (Learning mix) and HOW OFTEN (Activity). */}
            {(mix.length > 0 || totalRounds > 0 || untracked > 0) && (
              <div className="mb-4 grid gap-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
                <LearningMix mix={mix} />
                {isAll ? (
                  <MonthActivityChart months={monthBars} basePath="/parent/gameplay" />
                ) : (
                  <ActivityChart days={days} monthLabel={label} />
                )}
              </div>
            )}

            <div className="mb-4">
              <InsightList
                insights={buildInsights({
                  kidName: kid.name,
                  skills: skillsByKid.get(kid.id) ?? [],
                  roundsByGame: Object.fromEntries(games.map((g) => [g.slug, g.rounds])),
                  untrackedRounds: untracked,
                })}
              />
            </div>

            {games.length === 0 ? (
              <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:bg-zinc-900">
                {untracked > 0
                  ? `${untracked} round${untracked === 1 ? '' : 's'} in ${label}, none with a game recorded.`
                  : `No games played in ${label}.`}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {gamesBySubject.map((grp) => (
                  <div key={grp.subject}>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: SUBJECT_META[grp.subject].color }}
                      />
                      <span style={{ color: SUBJECT_META[grp.subject].color }}>
                        {SUBJECT_META[grp.subject].label}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {grp.games.map((g) => {
                        const info = findGame(g.slug);
                        const finishPct = Math.round((g.finished / g.rounds) * 100);
                        // Level (difficulty tier) she actually played this game at,
                        // and tap accuracy — the honest correctness read: share of
                        // taps that were right, NOT per-question accuracy.
                        const levelLabel =
                          g.tierMin == null
                            ? null
                            : g.tierMin === g.tierMax
                              ? `Level ${g.tierMin}`
                              : `Level ${g.tierMin}–${g.tierMax}`;
                        const tapPct =
                          g.tapsTotal > 0
                            ? Math.round(((g.tapsTotal - g.tapsWrong) / g.tapsTotal) * 100)
                            : null;
                        return (
                          <li
                            key={g.slug}
                            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span aria-hidden>{info?.glyph ?? '🎮'}</span>
                                <span className="truncate font-semibold">{info?.label ?? g.slug}</span>
                                {levelLabel && (
                                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                    {levelLabel}
                                  </span>
                                )}
                              </div>
                              {/* Bar is rounds relative to this kid's busiest game — a
                                  share-of-attention read, not a cross-kid comparison. */}
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${(g.rounds / busiest) * 100}%`,
                                    backgroundColor: SUBJECT_META[grp.subject].color,
                                  }}
                                />
                              </div>
                            </div>
                            <div className="text-right text-xs tabular-nums text-zinc-500">
                              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                                {g.rounds} round{g.rounds === 1 ? '' : 's'}
                              </div>
                              <div>{Math.round(g.minutes)} min · {finishPct}% finished</div>
                              {tapPct != null && <div>{tapPct}% taps correct</div>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {untracked > 0 && games.length > 0 && (
              <p className="mt-2 text-xs text-zinc-400">
                + {untracked} round{untracked === 1 ? '' : 's'} in {label} with no game recorded —
                game tracking began{' '}
                {TRACKING_START.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.
              </p>
            )}
          </section>
        );
      })}

      <div className="mt-8"><Glossary /></div>

      <p className="mt-6 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-400 dark:border-zinc-800">
        A <b>round</b> is one play of a game, not one question. <b>Level</b> is the difficulty tier
        (1–10) the game was played at — a range when it varied across rounds. <b>Taps correct</b> is
        the share of taps that were right; it is the honest correctness signal Gamecakes records, and
        is <i>not</i> per-question accuracy, which is not captured. <b>Finished</b> is the share of
        rounds played to the end rather than abandoned — a low number is usually a game that is too
        hard or too long.
        {' '}
        <Link href="/parent" className="underline">Per-skill progress vs. grade level</Link> lives on
        each kid&rsquo;s page.
      </p>
    </main>
  );
}
